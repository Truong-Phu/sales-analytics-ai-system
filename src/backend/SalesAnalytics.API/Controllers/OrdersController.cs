using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý đơn hàng – đọc từ Data Warehouse (fact_sales + dim_*)
/// Hỗ trợ: danh sách đơn, phân trang, tìm kiếm, lọc trạng thái
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class OrdersController : ControllerBase
{
    private readonly string _connStr;
    public OrdersController(IConfiguration cfg) => _connStr = cfg.GetConnectionString("Default")!;

    /// <summary>
    /// Danh sách đơn hàng với phân trang, tìm kiếm và lọc trạng thái.
    /// Roles: tất cả (Staff chỉ xem, Manager trở lên xem đầy đủ).
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin")]
    public async Task<IActionResult> GetOrders(
        [FromQuery] string?  search = null,
        [FromQuery] string?  status = null,
        [FromQuery] int      page   = 1,
        [FromQuery] int      limit  = 20)
    {
        if (page  < 1) page  = 1;
        if (limit < 1 || limit > 100) limit = 20;

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        // Truy vấn từ fact_sales + dim_* cho danh sách đơn hàng
        var sql = """
            SELECT
                fs.sales_id,
                fs.order_id,
                fs.order_date,
                fs.order_status,
                dc.channel_name,
                dp.product_name,
                dp.sku,
                fs.item_quantity,
                fs.net_revenue,
                fs.gross_profit,
                fs.discount_amount,
                dd.full_date AS sale_date
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_id    = dd.date_id
            JOIN dw.dim_channel dc ON fs.channel_id = dc.channel_id
            JOIN dw.dim_product dp ON fs.product_id = dp.product_id
            WHERE dp.is_current = TRUE
              AND (@status IS NULL OR fs.order_status = @status)
              AND (@search IS NULL OR
                   fs.order_id   ILIKE '%' || @search || '%' OR
                   dp.product_name ILIKE '%' || @search || '%')
            ORDER BY dd.full_date DESC, fs.sales_id DESC
            LIMIT @limit OFFSET @offset
            """;

        var countSql = """
            SELECT COUNT(*)
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_id    = dd.date_id
            JOIN dw.dim_channel dc ON fs.channel_id = dc.channel_id
            JOIN dw.dim_product dp ON fs.product_id = dp.product_id
            WHERE dp.is_current = TRUE
              AND (@status IS NULL OR fs.order_status = @status)
              AND (@search IS NULL OR
                   fs.order_id   ILIKE '%' || @search || '%' OR
                   dp.product_name ILIKE '%' || @search || '%')
            """;

        await using var countCmd = new NpgsqlCommand(countSql, conn);
        countCmd.Parameters.AddWithValue("status", (object?)status ?? DBNull.Value);
        countCmd.Parameters.AddWithValue("search", (object?)search ?? DBNull.Value);
        var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("status", (object?)status ?? DBNull.Value);
        cmd.Parameters.AddWithValue("search", (object?)search ?? DBNull.Value);
        cmd.Parameters.AddWithValue("limit",  limit);
        cmd.Parameters.AddWithValue("offset", (page - 1) * limit);

        var orders = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            orders.Add(new
            {
                SalesId       = reader.IsDBNull(0)  ? 0       : reader.GetInt32(0),
                OrderId       = reader.IsDBNull(1)  ? ""      : reader.GetString(1),
                OrderDate     = reader.IsDBNull(2)  ? (DateTime?)null : reader.GetDateTime(2),
                OrderStatus   = reader.IsDBNull(3)  ? ""      : reader.GetString(3),
                ChannelName   = reader.IsDBNull(4)  ? ""      : reader.GetString(4),
                ProductName   = reader.IsDBNull(5)  ? ""      : reader.GetString(5),
                Sku           = reader.IsDBNull(6)  ? ""      : reader.GetString(6),
                Quantity      = reader.IsDBNull(7)  ? 0       : reader.GetInt32(7),
                NetRevenue    = reader.IsDBNull(8)  ? 0m      : reader.GetDecimal(8),
                GrossProfit   = reader.IsDBNull(9)  ? 0m      : reader.GetDecimal(9),
                DiscountAmount= reader.IsDBNull(10) ? 0m      : reader.GetDecimal(10),
                SaleDate      = reader.IsDBNull(11) ? (DateTime?)null : reader.GetDateTime(11),
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
}
