using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using NpgsqlTypes;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý đơn hàng.
/// GET /api/orders        – đọc từ dw.fact_sales (analytics, DW schema).
/// CRUD /api/orders/oltp  – đọc/ghi vào public.orders (OLTP, Repository Pattern).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrdersController(
    IConfiguration cfg,
    IOrderRepository orderRepo,
    IAuditLogService audit,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DATA WAREHOUSE – Analytics queries (raw SQL, dw schema)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Danh sách đơn hàng từ DW (fact_sales + dim_*), phân trang, tìm kiếm, lọc.
    /// SuperAdmin thấy tất cả; các role khác chỉ thấy dữ liệu của company mình.
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string?   search     = null,
        [FromQuery] string?   status     = null,
        [FromQuery] int?      productKey = null,   // drill-down: DW surrogate key của sản phẩm
        [FromQuery] DateOnly? from       = null,
        [FromQuery] DateOnly? to         = null,
        [FromQuery] string?   channel    = null,
        [FromQuery] int       page       = 1,
        [FromQuery] int       limit      = 20)
    {
        if (page  < 1) page  = 1;
        if (limit < 1 || limit > 100) limit = 20;

        // SuperAdmin truyền null để xem tất cả tenant; user thường chỉ xem company của mình
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var sql = """
                SELECT
                    fs.sales_key,
                    fs.external_order_id,
                    dd.full_date          AS sale_date,
                    dc.channel_name,
                    dp.product_name,
                    dp.sku,
                    fs.item_quantity,
                    fs.net_revenue,
                    fs.gross_profit,
                    fs.discount_amount
                FROM dw.fact_sales fs
                JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
                JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
                JOIN dw.dim_product dp ON fs.product_key = dp.product_key
                WHERE dp.is_current = TRUE
                  AND (@status     IS NULL OR dc.channel_name ILIKE '%' || @status  || '%')
                  AND (@channel    IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
                  AND (@productKey IS NULL OR fs.product_key = @productKey)
                  AND (@from       IS NULL OR dd.full_date >= @from::date)
                  AND (@to         IS NULL OR dd.full_date <= @to::date)
                  AND (@search     IS NULL OR
                       fs.external_order_id ILIKE '%' || @search || '%' OR
                       dp.product_name      ILIKE '%' || @search || '%')
                  AND (@companyId  IS NULL OR fs.company_id = @companyId::uuid)
                ORDER BY dd.full_date DESC, fs.sales_key DESC
                LIMIT @limit OFFSET @offset
                """;

            var countSql = """
                SELECT COUNT(*)
                FROM dw.fact_sales fs
                JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
                JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
                JOIN dw.dim_product dp ON fs.product_key = dp.product_key
                WHERE dp.is_current = TRUE
                  AND (@status     IS NULL OR dc.channel_name ILIKE '%' || @status  || '%')
                  AND (@channel    IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
                  AND (@productKey IS NULL OR fs.product_key = @productKey)
                  AND (@from       IS NULL OR dd.full_date >= @from::date)
                  AND (@to         IS NULL OR dd.full_date <= @to::date)
                  AND (@search     IS NULL OR
                       fs.external_order_id ILIKE '%' || @search || '%' OR
                       dp.product_name      ILIKE '%' || @search || '%')
                  AND (@companyId  IS NULL OR fs.company_id = @companyId::uuid)
                """;

            void BindParams(NpgsqlCommand c)
            {
                c.Parameters.Add(new NpgsqlParameter("status",     NpgsqlDbType.Text)    { Value = (object?)status    ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("channel",    NpgsqlDbType.Text)    { Value = (object?)channel   ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("productKey", NpgsqlDbType.Integer) { Value = (object?)productKey ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("from",       NpgsqlDbType.Text)    { Value = from.HasValue ? (object)from.Value.ToString("yyyy-MM-dd") : DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("to",         NpgsqlDbType.Text)    { Value = to.HasValue   ? (object)to.Value.ToString("yyyy-MM-dd")   : DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("search",     NpgsqlDbType.Text)    { Value = (object?)search    ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("companyId",  NpgsqlDbType.Text)    { Value = (object?)companyId?.ToString() ?? DBNull.Value });
            }

            await using var countCmd = new NpgsqlCommand(countSql, conn);
            BindParams(countCmd);
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand(sql, conn);
            BindParams(cmd);
            cmd.Parameters.AddWithValue("limit",  limit);
            cmd.Parameters.AddWithValue("offset", (page - 1) * limit);

            var orders = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                orders.Add(new
                {
                    SalesKey        = reader.IsDBNull(0)  ? 0               : reader.GetInt32(0),
                    ExternalOrderId = reader.IsDBNull(1)  ? ""              : reader.GetString(1),
                    SaleDate        = reader.IsDBNull(2)  ? (DateTime?)null : reader.GetDateTime(2),
                    ChannelName     = reader.IsDBNull(3)  ? ""              : reader.GetString(3),
                    ProductName     = reader.IsDBNull(4)  ? ""              : reader.GetString(4),
                    Sku             = reader.IsDBNull(5)  ? ""              : reader.GetString(5),
                    Quantity        = reader.IsDBNull(6)  ? 0               : reader.GetInt32(6),
                    NetRevenue      = reader.IsDBNull(7)  ? 0m              : reader.GetDecimal(7),
                    GrossProfit     = reader.IsDBNull(8)  ? 0m              : reader.GetDecimal(8),
                    DiscountAmount  = reader.IsDBNull(9)  ? 0m              : reader.GetDecimal(9),
                });
            }

            return Ok(new
            {
                Data       = orders,
                Total      = total,
                Page       = page,
                Limit      = limit,
                TotalPages = (int)Math.Ceiling((double)total / limit)
            });
        }
        catch (NpgsqlException ex)
        {
            return StatusCode(503, new { message = "Data Warehouse chưa sẵn sàng hoặc lỗi kết nối.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. OLTP – CRUD qua Repository Pattern (public.orders)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>[OLTP] Danh sách đơn hàng OLTP với phân trang (EF Core, public schema).</summary>
    [HttpGet("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetOltpOrders(
        [FromQuery] string? search    = null,
        [FromQuery] string? status    = null,
        [FromQuery] int?    channelId = null,
        [FromQuery] int     page      = 1,
        [FromQuery] int     pageSize  = 20)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var (items, total) = await orderRepo.GetFilteredAsync(
                search, status, channelId, page, pageSize, companyId);
            var dtos = items.Select(o => new OrderResponseDto
            {
                OrderId              = o.OrderId,
                OrderCode            = o.OrderCode,
                CustomerId           = o.CustomerId,
                CustomerName         = o.CustomerName ?? o.Customer?.FullName,
                CustomerPhone        = o.CustomerPhone ?? o.Customer?.PhoneNumber,
                ChannelId            = o.ChannelId,
                ChannelName          = o.Channel?.ChannelName,
                Status               = o.Status,
                TotalAmount          = o.TotalAmount,
                DiscountAmount       = o.DiscountAmount,
                ShippingFee          = o.ShippingFee,
                PaymentMethod        = o.PaymentMethod,
                PaymentStatus        = o.PaymentStatus,
                ShippingStatus       = o.ShippingStatus,
                OrderDate            = o.OrderDate,
                DeliveredAt          = o.DeliveredAt,
                ExternalOrderId      = o.ExternalOrderId,
                TrackingNumber       = o.TrackingNumber,
                GhnOrderCode         = o.GhnOrderCode,
                ShippingAddress      = o.ShippingAddress,
                ShippingDistrict     = o.ShippingDistrict,
                ShippingProvince     = o.ShippingProvince,
                ShippingFullAddress  = o.ShippingFullAddress,
                PlatformStatus       = o.PlatformStatus,
                PaidAt               = o.PaidAt,
                CreatedAt            = o.CreatedAt,
            });

            return Ok(new PagedResult<OrderResponseDto>(dtos, total, page, pageSize));
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>[OLTP] Lấy chi tiết đơn hàng kèm danh sách sản phẩm.</summary>
    [HttpGet("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetOltpOrder(int id)
    {
        try
        {
            var order = await orderRepo.GetWithDetailsAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            // Kiểm tra ownership
            if (!tenant.IsSuperAdmin && order.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền truy cập đơn hàng này." });

            return Ok(new OrderResponseDto
            {
                OrderId              = order.OrderId,
                OrderCode            = order.OrderCode,
                CustomerId           = order.CustomerId,
                CustomerName         = order.CustomerName ?? order.Customer?.FullName,
                CustomerPhone        = order.CustomerPhone ?? order.Customer?.PhoneNumber,
                ChannelId            = order.ChannelId,
                ChannelName          = order.Channel?.ChannelName,
                Status               = order.Status,
                TotalAmount          = order.TotalAmount,
                DiscountAmount       = order.DiscountAmount,
                ShippingFee          = order.ShippingFee,
                PaymentMethod        = order.PaymentMethod,
                PaymentStatus        = order.PaymentStatus,
                ShippingStatus       = order.ShippingStatus,
                OrderDate            = order.OrderDate,
                DeliveredAt          = order.DeliveredAt,
                ExternalOrderId      = order.ExternalOrderId,
                TrackingNumber       = order.TrackingNumber,
                GhnOrderCode         = order.GhnOrderCode,
                ShippingAddress      = order.ShippingAddress,
                ShippingDistrict     = order.ShippingDistrict,
                ShippingProvince     = order.ShippingProvince,
                ShippingFullAddress  = order.ShippingFullAddress,
                PlatformStatus       = order.PlatformStatus,
                PaidAt               = order.PaidAt,
                CreatedAt            = order.CreatedAt,
                Details              = order.OrderDetails.Select(d => new OrderDetailDto
                {
                    ItemId      = d.ItemId,
                    ProductId   = d.ProductId,
                    ProductName = d.Product?.ProductName,
                    Sku         = d.Product?.Sku,
                    Quantity    = d.Quantity,
                    UnitPrice   = d.UnitPrice,
                    Discount    = d.Discount,
                    Subtotal    = d.Subtotal,
                }).ToList(),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Tạo đơn hàng mới kèm chi tiết sản phẩm.
    /// Roles: Owner, Manager, Staff
    /// </summary>
    [HttpPost("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var orderCode = $"ORD-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";

            var order = new Order
            {
                OrderCode       = orderCode,
                CustomerId      = dto.CustomerId,
                ChannelId       = dto.ChannelId,
                Status          = "PENDING",
                TotalAmount     = dto.TotalAmount,
                DiscountAmount  = dto.DiscountAmount,
                ShippingFee     = dto.ShippingFee,
                PaymentMethod   = dto.PaymentMethod,
                PaymentStatus   = "UNPAID",
                ShippingStatus  = "NOT_SHIPPED",
                OrderDate       = dto.OrderDate,
                ExternalOrderId = dto.ExternalOrderId,
                CompanyId       = tenant.CompanyId,      // gán company hiện tại
                CreatedAt       = DateTime.UtcNow,
                UpdatedAt       = DateTime.UtcNow,
                OrderDetails    = dto.Items.Select(item => new OrderDetail
                {
                    ProductId = item.ProductId,
                    Quantity  = item.Quantity,
                    UnitPrice = item.UnitPrice,
                    Discount  = item.Discount,
                    Subtotal  = item.Quantity * item.UnitPrice - item.Discount,
                }).ToList(),
            };

            await orderRepo.AddAsync(order);

            await audit.LogAsync(
                userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var cid) ? (int?)cid : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "CREATE_ORDER",
                entityType: "Order", entityId: order.OrderId.ToString(),
                newValue:   $"{{\"orderCode\":\"{order.OrderCode}\",\"totalAmount\":{order.TotalAmount}}}",
                ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

            return CreatedAtAction(nameof(GetOltpOrder), new { id = order.OrderId },
                new { order.OrderId, order.OrderCode });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Cập nhật trạng thái đơn hàng.
    /// Roles: Owner, Manager, Staff
    /// </summary>
    [HttpPut("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff")]
    public async Task<IActionResult> UpdateOrder(int id, [FromBody] UpdateOrderDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var order = await orderRepo.GetByIdAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            if (!tenant.IsSuperAdmin && order.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền chỉnh sửa đơn hàng này." });

            if (dto.Status         is not null) order.Status         = dto.Status;
            if (dto.PaymentStatus  is not null) order.PaymentStatus  = dto.PaymentStatus;
            if (dto.ShippingStatus is not null) order.ShippingStatus = dto.ShippingStatus;
            if (dto.DeliveredAt    is not null) order.DeliveredAt    = dto.DeliveredAt;
            order.UpdatedAt = DateTime.UtcNow;

            await orderRepo.UpdateAsync(order);

            await audit.LogAsync(
                userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "UPDATE_ORDER",
                entityType: "Order", entityId: id.ToString(),
                newValue:   $"{{\"status\":\"{order.Status}\",\"paymentStatus\":\"{order.PaymentStatus}\"}}",
                ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Hủy đơn hàng (soft-delete: set Status = CANCELLED).
    /// Roles: Owner, Manager
    /// </summary>
    [HttpDelete("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> CancelOrder(int id)
    {
        try
        {
            var order = await orderRepo.GetByIdAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            if (!tenant.IsSuperAdmin && order.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền hủy đơn hàng này." });

            if (order.Status == "DELIVERED")
                return BadRequest(new { message = "Không thể hủy đơn đã giao thành công." });

            var old = order.Status;
            order.Status    = "CANCELLED";
            order.UpdatedAt = DateTime.UtcNow;
            await orderRepo.UpdateAsync(order);

            await audit.LogAsync(
                userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "CANCEL_ORDER",
                entityType: "Order", entityId: id.ToString(),
                oldValue:   $"{{\"status\":\"{old}\"}}",
                newValue:   "{\"status\":\"CANCELLED\"}",
                ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

            return Ok(new { message = "Đã hủy đơn hàng." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. GHI CHÚ NỘI BỘ – order_notes (raw SQL, idempotent CREATE TABLE)
    // ══════════════════════════════════════════════════════════════════════════

    private const string CreateOrderNotesTableSql = """
        CREATE TABLE IF NOT EXISTS public.order_notes (
            id         SERIAL       PRIMARY KEY,
            order_id   INTEGER      NOT NULL,
            user_id    INTEGER,
            user_name  VARCHAR(255),
            note       TEXT         NOT NULL,
            created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON public.order_notes(order_id);
        """;

    /// <summary>[OLTP] Lấy danh sách ghi chú nội bộ của đơn hàng</summary>
    [HttpGet("oltp/{orderId:int}/notes")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT")]
    public async Task<IActionResult> GetOrderNotes(int orderId)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using (var cmd = new NpgsqlCommand(CreateOrderNotesTableSql, conn))
                await cmd.ExecuteNonQueryAsync();

            await using var select = new NpgsqlCommand(
                "SELECT id, order_id, user_id, user_name, note, created_at FROM public.order_notes WHERE order_id = @oid ORDER BY created_at DESC",
                conn);
            select.Parameters.AddWithValue("oid", orderId);

            var notes = new List<object>();
            await using var reader = await select.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                notes.Add(new
                {
                    id        = reader.GetInt32(0),
                    orderId   = reader.GetInt32(1),
                    userId    = reader.IsDBNull(2) ? (int?)null : reader.GetInt32(2),
                    userName  = reader.IsDBNull(3) ? null : reader.GetString(3),
                    note      = reader.GetString(4),
                    createdAt = reader.GetDateTime(5),
                });
            }

            return Ok(new { success = true, data = notes });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi lấy ghi chú.", detail = ex.Message });
        }
    }

    /// <summary>[OLTP] Thêm ghi chú nội bộ cho đơn hàng</summary>
    [HttpPost("oltp/{orderId:int}/notes")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT")]
    public async Task<IActionResult> AddOrderNote(int orderId, [FromBody] OrderNoteRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Note))
            return BadRequest(new { message = "Nội dung ghi chú không được để trống." });

        var userId   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null;
        var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue(ClaimTypes.Email) ?? "Hệ thống";

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using (var cmd = new NpgsqlCommand(CreateOrderNotesTableSql, conn))
                await cmd.ExecuteNonQueryAsync();

            await using var insert = new NpgsqlCommand(
                "INSERT INTO public.order_notes (order_id, user_id, user_name, note) VALUES (@oid, @uid, @uname, @note) RETURNING id, created_at",
                conn);
            insert.Parameters.AddWithValue("oid",   orderId);
            insert.Parameters.AddWithValue("uid",   userId.HasValue ? (object)userId.Value : DBNull.Value);
            insert.Parameters.AddWithValue("uname", userName);
            insert.Parameters.AddWithValue("note",  req.Note.Trim());

            await using var reader = await insert.ExecuteReaderAsync();
            await reader.ReadAsync();
            var newId   = reader.GetInt32(0);
            var created = reader.GetDateTime(1);

            return Ok(new
            {
                success = true,
                data    = new { id = newId, orderId, userId, userName, note = req.Note.Trim(), createdAt = created },
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi thêm ghi chú.", detail = ex.Message });
        }
    }

    /// <summary>[OLTP] Xóa ghi chú (Owner/Manager/Admin)</summary>
    [HttpDelete("oltp/{orderId:int}/notes/{noteId:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> DeleteOrderNote(int orderId, int noteId)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var del = new NpgsqlCommand(
                "DELETE FROM public.order_notes WHERE id = @nid AND order_id = @oid",
                conn);
            del.Parameters.AddWithValue("nid", noteId);
            del.Parameters.AddWithValue("oid", orderId);

            var affected = await del.ExecuteNonQueryAsync();
            if (affected == 0) return NotFound(new { message = "Không tìm thấy ghi chú." });

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi xóa ghi chú.", detail = ex.Message });
        }
    }
}

public record OrderNoteRequest(string Note);
