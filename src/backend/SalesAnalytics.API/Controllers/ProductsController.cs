using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý sản phẩm – đọc từ dw.dim_product (dimension table trong DW).
/// Hệ thống phân tích: product data chủ yếu đến từ API (Shopee, Lazada, ...) qua ETL.
/// CRUD cơ bản cho nhập liệu thủ công / demo.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController : ControllerBase
{
    private readonly string _connStr;
    public ProductsController(IConfiguration cfg) => _connStr = cfg.GetConnectionString("Default")!;

    /// <summary>
    /// Danh sách sản phẩm với tìm kiếm và phân trang.
    /// Roles: Owner, Manager, Staff, DataIT, Admin
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin")]
    public async Task<IActionResult> GetProducts(
        [FromQuery] string? search   = null,
        [FromQuery] string? category = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     limit    = 20)
    {
        if (page  < 1) page  = 1;
        if (limit < 1 || limit > 100) limit = 20;

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT
                dp.product_id,
                dp.product_name,
                dp.sku,
                dp.category,
                dp.brand,
                dp.unit_price,
                dp.cost_price,
                dp.is_current,
                dp.effective_date,
                COUNT(fs.sales_id) AS total_orders,
                COALESCE(SUM(fs.item_quantity), 0) AS total_qty_sold
            FROM dw.dim_product dp
            LEFT JOIN dw.fact_sales fs ON fs.product_id = dp.product_id
            WHERE dp.is_current = TRUE
              AND (@search   IS NULL OR dp.product_name ILIKE '%' || @search   || '%'
                                     OR dp.sku          ILIKE '%' || @search   || '%')
              AND (@category IS NULL OR dp.category     ILIKE '%' || @category || '%')
            GROUP BY dp.product_id, dp.product_name, dp.sku,
                     dp.category, dp.brand, dp.unit_price,
                     dp.cost_price, dp.is_current, dp.effective_date
            ORDER BY total_qty_sold DESC, dp.product_name
            LIMIT @limit OFFSET @offset
            """;

        var countSql = """
            SELECT COUNT(*)
            FROM dw.dim_product dp
            WHERE dp.is_current = TRUE
              AND (@search   IS NULL OR dp.product_name ILIKE '%' || @search   || '%'
                                     OR dp.sku          ILIKE '%' || @search   || '%')
              AND (@category IS NULL OR dp.category     ILIKE '%' || @category || '%')
            """;

        await using var countCmd = new NpgsqlCommand(countSql, conn);
        countCmd.Parameters.AddWithValue("search",   (object?)search   ?? DBNull.Value);
        countCmd.Parameters.AddWithValue("category", (object?)category ?? DBNull.Value);
        var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("search",   (object?)search   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("category", (object?)category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("limit",    limit);
        cmd.Parameters.AddWithValue("offset",   (page - 1) * limit);

        var products = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            products.Add(new
            {
                ProductId      = reader.GetInt32(0),
                ProductName    = reader.GetString(1),
                Sku            = reader.IsDBNull(2) ? "" : reader.GetString(2),
                Category       = reader.IsDBNull(3) ? "" : reader.GetString(3),
                Brand          = reader.IsDBNull(4) ? "" : reader.GetString(4),
                UnitPrice      = reader.IsDBNull(5) ? 0m : reader.GetDecimal(5),
                CostPrice      = reader.IsDBNull(6) ? 0m : reader.GetDecimal(6),
                IsCurrent      = reader.GetBoolean(7),
                EffectiveDate  = reader.IsDBNull(8) ? (DateTime?)null : reader.GetDateTime(8),
                TotalOrders    = reader.GetInt64(9),
                TotalQtySold   = reader.GetInt64(10),
            });
        }

        return Ok(new
        {
            Data       = products,
            Total      = total,
            Page       = page,
            Limit      = limit,
            TotalPages = (int)Math.Ceiling((double)total / limit)
        });
    }
}
