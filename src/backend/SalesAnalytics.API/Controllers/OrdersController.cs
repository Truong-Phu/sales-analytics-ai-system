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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,DataIT,SuperAdmin")]
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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,DataIT,Viewer,SuperAdmin")]
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
                CustomerPhone        = o.CustomerPhone ?? o.Customer?.Phone,
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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,DataIT,SuperAdmin")]
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
                CustomerPhone        = order.CustomerPhone ?? order.Customer?.Phone,
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
                ShippingAddress      = order.ShippingAddress      ?? order.Customer?.Address,
                ShippingDistrict     = order.ShippingDistrict    ?? order.Customer?.District,
                ShippingProvince     = order.ShippingProvince    ?? order.Customer?.Province,
                ShippingFullAddress  = order.ShippingFullAddress ?? order.Customer?.FullAddress
                                       ?? BuildFullAddress(order.Customer),
                PlatformStatus       = order.PlatformStatus,
                PaidAt               = order.PaidAt,
                CreatedAt            = order.CreatedAt,
                Details              = order.OrderDetails.Select(d => new OrderDetailDto
                {
                    ItemId        = d.ItemId,
                    ProductId     = d.ProductId,
                    ProductName   = d.ProductName   ?? d.Product?.ProductName,
                    Sku           = d.Sku           ?? d.Product?.Sku,
                    Variation     = d.VariationName,
                    ImageUrl      = d.ImageUrl      ?? d.Product?.ImageUrl,
                    Quantity      = d.Quantity,
                    UnitPrice     = d.UnitPrice,
                    SalePrice     = d.SalePrice,
                    OriginalPrice = d.OriginalPrice,
                    Discount      = d.Discount,
                    Subtotal      = d.Subtotal,
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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
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
    /// Khi chuyển PENDING → CONFIRMED: tự động trừ kho + ghi SALE_OUT (atomic).
    /// Roles: Owner, Manager, Staff
    /// </summary>
    [HttpPut("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
    public async Task<IActionResult> UpdateOrder(int id, [FromBody] UpdateOrderDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var order = await orderRepo.GetByIdAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            if (!tenant.IsSuperAdmin && order.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền chỉnh sửa đơn hàng này." });

            var oldStatus = order.Status;
            var confirmingOrder = dto.Status == "CONFIRMED"
                               && order.Status == "PENDING"
                               && !order.IsStockDeducted;

            if (confirmingOrder)
            {
                // Dùng raw SQL transaction để atomic: trừ kho + ghi SALE_OUT + đổi status
                var actorId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorVal)
                    ? (object)actorVal : DBNull.Value;

                await using var conn = new NpgsqlConnection(_connStr);
                await conn.OpenAsync();
                await using var tx = await conn.BeginTransactionAsync();
                try
                {
                    // Trừ kho per sản phẩm (aggregate per product_id trong đơn) + lấy before/after
                    await using var stockCmd = new NpgsqlCommand("""
                        WITH upd AS (
                            UPDATE public.products p
                            SET stock_quantity = GREATEST(0, stock_quantity - oi.quantity),
                                updated_at = NOW()
                            FROM public.order_items oi
                            WHERE oi.order_id   = @orderId
                              AND oi.product_id = p.product_id
                            RETURNING p.product_id,
                                      p.stock_quantity          AS after_stock,
                                      oi.quantity               AS sold_qty
                        )
                        INSERT INTO public.inventory_transactions
                            (company_id, product_id, transaction_type, quantity_change,
                             before_stock, after_stock, reference_type, reference_id, note, created_by)
                        SELECT @cid::uuid, product_id, 'SALE_OUT', -sold_qty,
                               after_stock + sold_qty, after_stock,
                               'order', @orderId, 'Xuat kho theo don hang xac nhan', @uid
                        FROM upd
                        """, conn, tx);
                    stockCmd.Parameters.AddWithValue("orderId", id);
                    stockCmd.Parameters.AddWithValue("cid",     order.CompanyId!.Value.ToString());
                    stockCmd.Parameters.AddWithValue("uid",     actorId);
                    await stockCmd.ExecuteNonQueryAsync();

                    // Cập nhật status + is_stock_deducted trong cùng transaction
                    await using var updCmd = new NpgsqlCommand("""
                        UPDATE public.orders
                        SET status            = 'CONFIRMED',
                            is_stock_deducted = TRUE,
                            payment_status    = COALESCE(@pay::text,  payment_status),
                            shipping_status   = COALESCE(@ship::text, shipping_status),
                            updated_at        = NOW()
                        WHERE order_id = @id
                        """, conn, tx);
                    updCmd.Parameters.AddWithValue("id",   id);
                    updCmd.Parameters.AddWithValue("pay",  (object?)(dto.PaymentStatus)  ?? DBNull.Value);
                    updCmd.Parameters.AddWithValue("ship", (object?)(dto.ShippingStatus) ?? DBNull.Value);
                    await updCmd.ExecuteNonQueryAsync();

                    await tx.CommitAsync();
                }
                catch
                {
                    await tx.RollbackAsync();
                    throw;
                }
            }
            else
            {
                // Không cần trừ kho → cập nhật bình thường qua EF
                if (dto.Status         is not null) order.Status         = dto.Status;
                if (dto.PaymentStatus  is not null) order.PaymentStatus  = dto.PaymentStatus;
                if (dto.ShippingStatus is not null) order.ShippingStatus = dto.ShippingStatus;
                if (dto.DeliveredAt    is not null) order.DeliveredAt    = dto.DeliveredAt;
                order.UpdatedAt = DateTime.UtcNow;
                await orderRepo.UpdateAsync(order);
            }

            await audit.LogAsync(
                userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "UPDATE_ORDER",
                entityType: "Order", entityId: id.ToString(),
                oldValue:   $"{{\"status\":\"{oldStatus}\"}}",
                newValue:   $"{{\"status\":\"{dto.Status ?? order.Status}\",\"isStockDeducted\":{confirmingOrder.ToString().ToLower()}}}",
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
    /// [OLTP] Hủy đơn hàng: set Status = CANCELLED + hoàn kho nếu đơn đã trừ kho.
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

            if (order.Status == "CANCELLED")
                return BadRequest(new { message = "Đơn hàng đã được hủy trước đó." });

            var old = order.Status;
            var stockRefunded = false;
            var cancelUid = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var cancelUidVal) ? (object)cancelUidVal : DBNull.Value;

            // Dùng raw SQL transaction để đảm bảo hoàn kho + log + cập nhật status là atomic
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                // Hoàn kho + ghi log inventory transaction (chỉ khi đơn đã trừ kho trước đó)
                if (order.IsStockDeducted)
                {
                    // Hoàn kho sản phẩm tổng + ghi inventory_transaction
                    await using var stockCmd = new NpgsqlCommand("""
                        WITH upd AS (
                            UPDATE public.products p
                            SET stock_quantity = p.stock_quantity + oi.quantity,
                                updated_at = NOW()
                            FROM public.order_items oi
                            WHERE oi.order_id = @orderId
                              AND oi.product_id = p.product_id
                            RETURNING p.product_id,
                                      p.stock_quantity          AS after_stock,
                                      oi.quantity               AS refunded_qty
                        )
                        INSERT INTO public.inventory_transactions
                            (company_id, product_id, transaction_type, quantity_change,
                             before_stock, after_stock, reference_type, reference_id, note, created_by)
                        SELECT @cid::uuid, product_id, 'ORDER_CANCEL_REFUND', refunded_qty,
                               after_stock - refunded_qty, after_stock,
                               'order', @orderId, 'Hoan kho do huy don hang', @createdBy
                        FROM upd
                        """, conn, tx);
                    stockCmd.Parameters.AddWithValue("orderId",   id);
                    stockCmd.Parameters.AddWithValue("cid",       order.CompanyId!.Value.ToString());
                    stockCmd.Parameters.AddWithValue("createdBy", cancelUid);
                    await stockCmd.ExecuteNonQueryAsync();

                    // Hoàn kho biến thể (variation) cho các item có variation_id
                    await using var varStockCmd = new NpgsqlCommand("""
                        UPDATE public.product_variations pv
                        SET stock_quantity = pv.stock_quantity + oi.quantity,
                            updated_at = NOW()
                        FROM public.order_items oi
                        WHERE oi.order_id = @orderId
                          AND oi.variation_id = pv.id
                          AND oi.variation_id IS NOT NULL
                        """, conn, tx);
                    varStockCmd.Parameters.AddWithValue("orderId", id);
                    await varStockCmd.ExecuteNonQueryAsync();

                    stockRefunded = true;
                }

                // Cập nhật status + payment_status + is_stock_deducted trong cùng transaction
                // Nếu đã PAID → chuyển REFUNDED (tiền thu rồi hủy đơn → phải hoàn)
                await using var cancelCmd = new NpgsqlCommand("""
                    UPDATE public.orders
                    SET status             = 'CANCELLED',
                        is_stock_deducted  = FALSE,
                        payment_status     = CASE WHEN payment_status = 'PAID' THEN 'REFUNDED' ELSE payment_status END,
                        updated_at         = NOW()
                    WHERE order_id = @id
                    """, conn, tx);
                cancelCmd.Parameters.AddWithValue("id", id);
                await cancelCmd.ExecuteNonQueryAsync();

                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            await audit.LogAsync(
                userId:     cancelUidVal > 0 ? (int?)cancelUidVal : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "CANCEL_ORDER",
                entityType: "Order", entityId: id.ToString(),
                oldValue:   $"{{\"status\":\"{old}\",\"isStockDeducted\":{order.IsStockDeducted.ToString().ToLower()}}}",
                newValue:   "{\"status\":\"CANCELLED\",\"isStockDeducted\":false}",
                ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

            var msg = stockRefunded ? "Đã hủy đơn hàng và hoàn kho thành công." : "Đã hủy đơn hàng.";
            return Ok(new { message = msg });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Hoàn trả đơn hàng: hoàn kho + ghi RETURN_REFUND.
    /// Chỉ áp dụng khi is_stock_deducted = TRUE.
    /// Block nếu đã CANCELLED hoặc đã RETURNED.
    /// </summary>
    [HttpPost("oltp/{id:int}/return")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> ReturnOrder(int id)
    {
        try
        {
            var order = await orderRepo.GetByIdAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            if (!tenant.IsSuperAdmin && order.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền hoàn trả đơn hàng này." });

            if (order.Status == "CANCELLED")
                return BadRequest(new { message = "Không thể hoàn trả đơn đã hủy." });

            if (order.Status == "RETURNED")
                return BadRequest(new { message = "Đơn hàng đã được hoàn trả trước đó." });

            var retUid = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var retUidVal)
                ? (object)retUidVal : DBNull.Value;
            var stockRestored = false;

            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                // Hoàn kho + ghi RETURN_REFUND (chỉ khi đơn đã trừ kho)
                if (order.IsStockDeducted)
                {
                    // Hoàn kho sản phẩm tổng + ghi inventory_transaction
                    await using var stockCmd = new NpgsqlCommand("""
                        WITH upd AS (
                            UPDATE public.products p
                            SET stock_quantity = p.stock_quantity + oi.quantity,
                                updated_at = NOW()
                            FROM public.order_items oi
                            WHERE oi.order_id = @orderId
                              AND oi.product_id = p.product_id
                            RETURNING p.product_id,
                                      p.stock_quantity   AS after_stock,
                                      oi.quantity        AS returned_qty
                        )
                        INSERT INTO public.inventory_transactions
                            (company_id, product_id, transaction_type, quantity_change,
                             before_stock, after_stock, reference_type, reference_id, note, created_by)
                        SELECT @cid::uuid, product_id, 'RETURN_REFUND', returned_qty,
                               after_stock - returned_qty, after_stock,
                               'order', @orderId, 'Hoan kho do tra hang', @createdBy
                        FROM upd
                        """, conn, tx);
                    stockCmd.Parameters.AddWithValue("orderId",   id);
                    stockCmd.Parameters.AddWithValue("cid",       order.CompanyId!.Value.ToString());
                    stockCmd.Parameters.AddWithValue("createdBy", retUid);
                    await stockCmd.ExecuteNonQueryAsync();

                    // Hoàn kho biến thể (variation) cho các item có variation_id
                    await using var varStockCmd = new NpgsqlCommand("""
                        UPDATE public.product_variations pv
                        SET stock_quantity = pv.stock_quantity + oi.quantity,
                            updated_at = NOW()
                        FROM public.order_items oi
                        WHERE oi.order_id = @orderId
                          AND oi.variation_id = pv.id
                          AND oi.variation_id IS NOT NULL
                        """, conn, tx);
                    varStockCmd.Parameters.AddWithValue("orderId", id);
                    await varStockCmd.ExecuteNonQueryAsync();

                    stockRestored = true;
                }

                // Set status = RETURNED, is_stock_deducted = FALSE
                // Nếu đã PAID → chuyển REFUNDED (hoàn hàng kèm hoàn tiền)
                await using var retCmd = new NpgsqlCommand("""
                    UPDATE public.orders
                    SET status            = 'RETURNED',
                        is_stock_deducted = FALSE,
                        payment_status    = CASE WHEN payment_status = 'PAID' THEN 'REFUNDED' ELSE payment_status END,
                        updated_at        = NOW()
                    WHERE order_id = @id
                    """, conn, tx);
                retCmd.Parameters.AddWithValue("id", id);
                await retCmd.ExecuteNonQueryAsync();

                await tx.CommitAsync();
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }

            await audit.LogAsync(
                userId:     retUidVal > 0 ? (int?)retUidVal : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "RETURN_ORDER",
                entityType: "Order", entityId: id.ToString(),
                oldValue:   $"{{\"status\":\"{order.Status}\",\"isStockDeducted\":{order.IsStockDeducted.ToString().ToLower()}}}",
                newValue:   "{\"status\":\"RETURNED\",\"isStockDeducted\":false}",
                ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

            var msg = stockRestored
                ? "Đã hoàn trả đơn hàng và cộng lại kho thành công."
                : "Đã hoàn trả đơn hàng (kho không thay đổi do đơn chưa trừ kho).";
            return Ok(new { message = msg, stockRestored });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Ghép địa chỉ đầy đủ từ Customer khi shipping_full_address bị null
    private static string? BuildFullAddress(Customer? c)
    {
        if (c is null) return null;
        var parts = new[] { c.Address, c.District, c.Province }
            .Where(s => !string.IsNullOrWhiteSpace(s));
        var full = string.Join(", ", parts);
        return string.IsNullOrWhiteSpace(full) ? null : full;
    }

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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,DataIT")]
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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,DataIT")]
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
