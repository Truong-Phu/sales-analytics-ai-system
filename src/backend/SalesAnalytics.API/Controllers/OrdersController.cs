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
public class OrdersController(IConfiguration cfg, IOrderRepository orderRepo, IAuditLogService audit) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DATA WAREHOUSE – Analytics queries (raw SQL, dw schema)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Danh sách đơn hàng từ DW (fact_sales + dim_*), phân trang, tìm kiếm, lọc.
    /// Roles: Owner, Manager, Staff, DataIT, Admin
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin")]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] int     page   = 1,
        [FromQuery] int     limit  = 20)
    {
        if (page  < 1) page  = 1;
        if (limit < 1 || limit > 100) limit = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Truy vấn từ fact_sales + dim_* cho danh sách đơn hàng
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
                  AND (@status IS NULL OR dc.channel_name ILIKE '%' || @status || '%')
                  AND (@search IS NULL OR
                       fs.external_order_id ILIKE '%' || @search || '%' OR
                       dp.product_name      ILIKE '%' || @search || '%')
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
                  AND (@status IS NULL OR dc.channel_name ILIKE '%' || @status || '%')
                  AND (@search IS NULL OR
                       fs.external_order_id ILIKE '%' || @search || '%' OR
                       dp.product_name      ILIKE '%' || @search || '%')
                """;

            await using var countCmd = new NpgsqlCommand(countSql, conn);
            countCmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text) { Value = (object?)status ?? DBNull.Value });
            countCmd.Parameters.Add(new NpgsqlParameter("search", NpgsqlDbType.Text) { Value = (object?)search ?? DBNull.Value });
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Text) { Value = (object?)status ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("search", NpgsqlDbType.Text) { Value = (object?)search ?? DBNull.Value });
            cmd.Parameters.AddWithValue("limit",  limit);
            cmd.Parameters.AddWithValue("offset", (page - 1) * limit);

            var orders = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                orders.Add(new
                {
                    SalesKey       = reader.IsDBNull(0)  ? 0              : reader.GetInt32(0),
                    ExternalOrderId = reader.IsDBNull(1) ? ""             : reader.GetString(1),
                    SaleDate       = reader.IsDBNull(2)  ? (DateTime?)null : reader.GetDateTime(2),
                    ChannelName    = reader.IsDBNull(3)  ? ""             : reader.GetString(3),
                    ProductName    = reader.IsDBNull(4)  ? ""             : reader.GetString(4),
                    Sku            = reader.IsDBNull(5)  ? ""             : reader.GetString(5),
                    Quantity       = reader.IsDBNull(6)  ? 0              : reader.GetInt32(6),
                    NetRevenue     = reader.IsDBNull(7)  ? 0m             : reader.GetDecimal(7),
                    GrossProfit    = reader.IsDBNull(8)  ? 0m             : reader.GetDecimal(8),
                    DiscountAmount = reader.IsDBNull(9)  ? 0m             : reader.GetDecimal(9),
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

    /// <summary>
    /// [OLTP] Danh sách đơn hàng OLTP với phân trang (EF Core, public schema).
    /// </summary>
    [HttpGet("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin,Viewer")]
    public async Task<IActionResult> GetOltpOrders(
        [FromQuery] string? search    = null,
        [FromQuery] string? status    = null,
        [FromQuery] int?    channelId = null,
        [FromQuery] int     page      = 1,
        [FromQuery] int     pageSize  = 20)
    {
        try
        {
            var (items, total) = await orderRepo.GetFilteredAsync(search, status, channelId, page, pageSize);
            var dtos = items.Select(o => new OrderResponseDto
            {
                OrderId        = o.OrderId,
                OrderCode      = o.OrderCode,
                CustomerId     = o.CustomerId,
                CustomerName   = o.Customer?.FullName,
                ChannelId      = o.ChannelId,
                ChannelName    = o.Channel?.ChannelName,
                Status         = o.Status,
                TotalAmount    = o.TotalAmount,
                DiscountAmount = o.DiscountAmount,
                ShippingFee    = o.ShippingFee,
                PaymentMethod  = o.PaymentMethod,
                PaymentStatus  = o.PaymentStatus,
                ShippingStatus = o.ShippingStatus,
                OrderDate      = o.OrderDate,
                DeliveredAt    = o.DeliveredAt,
                ExternalOrderId = o.ExternalOrderId,
                CreatedAt      = o.CreatedAt,
            });

            return Ok(new PagedResult<OrderResponseDto>(dtos, total, page, pageSize));
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Lấy chi tiết đơn hàng kèm danh sách sản phẩm.
    /// </summary>
    [HttpGet("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin")]
    public async Task<IActionResult> GetOltpOrder(int id)
    {
        try
        {
            var order = await orderRepo.GetWithDetailsAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            return Ok(new OrderResponseDto
            {
                OrderId        = order.OrderId,
                OrderCode      = order.OrderCode,
                CustomerId     = order.CustomerId,
                CustomerName   = order.Customer?.FullName,
                ChannelId      = order.ChannelId,
                ChannelName    = order.Channel?.ChannelName,
                Status         = order.Status,
                TotalAmount    = order.TotalAmount,
                DiscountAmount = order.DiscountAmount,
                ShippingFee    = order.ShippingFee,
                PaymentMethod  = order.PaymentMethod,
                PaymentStatus  = order.PaymentStatus,
                ShippingStatus = order.ShippingStatus,
                OrderDate      = order.OrderDate,
                DeliveredAt    = order.DeliveredAt,
                ExternalOrderId = order.ExternalOrderId,
                CreatedAt      = order.CreatedAt,
                Details        = order.OrderDetails.Select(d => new OrderDetailDto
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
    /// Roles: Owner, Manager, Staff, Admin
    /// </summary>
    [HttpPost("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff,Admin")]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            // Tạo mã đơn hàng tự động: ORD-yyyyMMdd-XXXX
            var orderCode = $"ORD-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";

            var order = new Order
            {
                OrderCode      = orderCode,
                CustomerId     = dto.CustomerId,
                ChannelId      = dto.ChannelId,
                Status         = "PENDING",
                TotalAmount    = dto.TotalAmount,
                DiscountAmount = dto.DiscountAmount,
                ShippingFee    = dto.ShippingFee,
                PaymentMethod  = dto.PaymentMethod,
                PaymentStatus  = "UNPAID",
                ShippingStatus = "NOT_SHIPPED",
                OrderDate      = dto.OrderDate,
                ExternalOrderId = dto.ExternalOrderId,
                CreatedAt      = DateTime.UtcNow,
                UpdatedAt      = DateTime.UtcNow,
                OrderDetails   = dto.Items.Select(item => new OrderDetail
                {
                    ProductId  = item.ProductId,
                    Quantity   = item.Quantity,
                    UnitPrice  = item.UnitPrice,
                    Discount   = item.Discount,
                    Subtotal   = item.Quantity * item.UnitPrice - item.Discount,
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
    /// Roles: Owner, Manager, Staff, Admin
    /// </summary>
    [HttpPut("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff,Admin")]
    public async Task<IActionResult> UpdateOrder(int id, [FromBody] UpdateOrderDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var order = await orderRepo.GetByIdAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

            if (dto.Status        is not null) order.Status        = dto.Status;
            if (dto.PaymentStatus is not null) order.PaymentStatus = dto.PaymentStatus;
            if (dto.ShippingStatus is not null) order.ShippingStatus = dto.ShippingStatus;
            if (dto.DeliveredAt   is not null) order.DeliveredAt   = dto.DeliveredAt;
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
    /// Roles: Owner, Manager, Admin
    /// </summary>
    [HttpDelete("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Admin")]
    public async Task<IActionResult> CancelOrder(int id)
    {
        try
        {
            var order = await orderRepo.GetByIdAsync(id);
            if (order is null) return NotFound(new { message = "Không tìm thấy đơn hàng." });

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
}
