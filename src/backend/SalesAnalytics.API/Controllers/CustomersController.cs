using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý khách hàng – đọc từ dw.dim_customer.
/// Analytics-first: dữ liệu KH đến từ API (Shopee, Lazada...) qua ETL pipeline.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CustomersController : ControllerBase
{
    private readonly string _connStr;
    public CustomersController(IConfiguration cfg) => _connStr = cfg.GetConnectionString("Default")!;

    /// <summary>
    /// Danh sách khách hàng với tổng doanh thu, số đơn.
    /// Roles: Owner, Manager, DataIT, Admin (Staff không xem thông tin KH đầy đủ)
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,DataIT,Admin")]
    public async Task<IActionResult> GetCustomers(
        [FromQuery] string? search   = null,
        [FromQuery] string? segment  = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     limit    = 20)
    {
        if (page  < 1) page  = 1;
        if (limit < 1 || limit > 100) limit = 20;

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT
                dc.customer_id,
                dc.customer_name,
                dc.email,
                dc.phone,
                dc.city,
                dc.customer_segment,
                dc.first_order_date,
                COUNT(DISTINCT fs.order_id)    AS total_orders,
                COALESCE(SUM(fs.net_revenue),0) AS total_revenue,
                COALESCE(AVG(fs.net_revenue),0) AS avg_order_value,
                MAX(dd.full_date)               AS last_order_date
            FROM dw.dim_customer dc
            LEFT JOIN dw.fact_sales fs ON fs.customer_id = dc.customer_id
            LEFT JOIN dw.dim_date   dd ON fs.date_id     = dd.date_id
            WHERE (@search  IS NULL OR dc.customer_name ILIKE '%' || @search  || '%'
                                    OR dc.phone         ILIKE '%' || @search  || '%')
              AND (@segment IS NULL OR dc.customer_segment = @segment)
            GROUP BY dc.customer_id, dc.customer_name, dc.email,
                     dc.phone, dc.city, dc.customer_segment, dc.first_order_date
            ORDER BY total_revenue DESC
            LIMIT @limit OFFSET @offset
            """;

        var countSql = """
            SELECT COUNT(*)
            FROM dw.dim_customer dc
            WHERE (@search  IS NULL OR dc.customer_name ILIKE '%' || @search  || '%'
                                    OR dc.phone         ILIKE '%' || @search  || '%')
              AND (@segment IS NULL OR dc.customer_segment = @segment)
            """;

        await using var countCmd = new NpgsqlCommand(countSql, conn);
        countCmd.Parameters.AddWithValue("search",  (object?)search  ?? DBNull.Value);
        countCmd.Parameters.AddWithValue("segment", (object?)segment ?? DBNull.Value);
        var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("search",  (object?)search  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("segment", (object?)segment ?? DBNull.Value);
        cmd.Parameters.AddWithValue("limit",   limit);
        cmd.Parameters.AddWithValue("offset",  (page - 1) * limit);

        var customers = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            customers.Add(new
            {
                CustomerId      = reader.GetInt32(0),
                CustomerName    = reader.IsDBNull(1) ? "" : reader.GetString(1),
                Email           = reader.IsDBNull(2) ? "" : reader.GetString(2),
                Phone           = reader.IsDBNull(3) ? "" : reader.GetString(3),
                City            = reader.IsDBNull(4) ? "" : reader.GetString(4),
                CustomerSegment = reader.IsDBNull(5) ? "" : reader.GetString(5),
                FirstOrderDate  = reader.IsDBNull(6) ? (DateTime?)null : reader.GetDateTime(6),
                TotalOrders     = reader.GetInt64(7),
                TotalRevenue    = reader.GetDecimal(8),
                AvgOrderValue   = reader.GetDecimal(9),
                LastOrderDate   = reader.IsDBNull(10) ? (DateTime?)null : reader.GetDateTime(10),
            });
        }

        return Ok(new
        {
            Data       = customers,
            Total      = total,
            Page       = page,
            Limit      = limit,
            TotalPages = (int)Math.Ceiling((double)total / limit)
        });
    }
}
