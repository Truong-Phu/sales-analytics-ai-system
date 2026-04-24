using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using NpgsqlTypes;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý sản phẩm.
/// GET /api/products        – đọc từ dw.dim_product (analytics, DW schema).
/// CRUD /api/products/oltp  – đọc/ghi vào public.products (OLTP, Repository Pattern).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController(IConfiguration cfg, IProductRepository productRepo) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DATA WAREHOUSE – Analytics queries (raw SQL, dw schema)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Danh sách sản phẩm với số lượng bán + tổng doanh thu (từ DW).
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

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var sql = """
                SELECT
                    dp.product_id,
                    dp.product_name,
                    dp.sku,
                    dp.category_name,
                    dp.brand,
                    dp.base_price,
                    dp.cost_price,
                    dp.is_current,
                    dp.effective_from,
                    COUNT(fs.sales_key) AS total_orders,
                    COALESCE(SUM(fs.item_quantity), 0) AS total_qty_sold
                FROM dw.dim_product dp
                LEFT JOIN dw.fact_sales fs ON fs.product_key = dp.product_key
                WHERE dp.is_current = TRUE
                  AND (@search   IS NULL OR dp.product_name ILIKE '%' || @search   || '%'
                                         OR dp.sku          ILIKE '%' || @search   || '%')
                  AND (@category IS NULL OR dp.category_name ILIKE '%' || @category || '%')
                GROUP BY dp.product_key, dp.product_id, dp.product_name, dp.sku,
                         dp.category_name, dp.brand, dp.base_price,
                         dp.cost_price, dp.is_current, dp.effective_from
                ORDER BY total_qty_sold DESC, dp.product_name
                LIMIT @limit OFFSET @offset
                """;

            var countSql = """
                SELECT COUNT(*)
                FROM dw.dim_product dp
                WHERE dp.is_current = TRUE
                  AND (@search   IS NULL OR dp.product_name ILIKE '%' || @search   || '%'
                                         OR dp.sku          ILIKE '%' || @search   || '%')
                  AND (@category IS NULL OR dp.category_name ILIKE '%' || @category || '%')
                """;

            await using var countCmd = new NpgsqlCommand(countSql, conn);
            countCmd.Parameters.Add(new NpgsqlParameter("search",   NpgsqlDbType.Text) { Value = (object?)search   ?? DBNull.Value });
            countCmd.Parameters.Add(new NpgsqlParameter("category", NpgsqlDbType.Text) { Value = (object?)category ?? DBNull.Value });
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.Add(new NpgsqlParameter("search",   NpgsqlDbType.Text) { Value = (object?)search   ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("category", NpgsqlDbType.Text) { Value = (object?)category ?? DBNull.Value });
            cmd.Parameters.AddWithValue("limit",    limit);
            cmd.Parameters.AddWithValue("offset",   (page - 1) * limit);

            var products = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                products.Add(new
                {
                    ProductId     = reader.GetInt32(0),
                    ProductName   = reader.GetString(1),
                    Sku           = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    Category      = reader.IsDBNull(3) ? "" : reader.GetString(3),
                    Brand         = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    BasePrice     = reader.IsDBNull(5) ? 0m : reader.GetDecimal(5),
                    CostPrice     = reader.IsDBNull(6) ? 0m : reader.GetDecimal(6),
                    IsCurrent     = reader.GetBoolean(7),
                    EffectiveFrom = reader.IsDBNull(8) ? (DateTime?)null : reader.GetDateTime(8),
                    TotalOrders   = reader.GetInt64(9),
                    TotalQtySold  = reader.GetInt64(10),
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
        catch (NpgsqlException ex)
        {
            // DW schema chưa có dữ liệu → trả về mảng rỗng thay vì lỗi 500
            return StatusCode(503, new { message = "Data Warehouse chưa sẵn sàng hoặc lỗi kết nối.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. OLTP – CRUD qua Repository Pattern (public.products)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// [OLTP] Danh sách sản phẩm với phân trang và tìm kiếm (EF Core, public schema).
    /// Roles: Owner, Manager, Staff, DataIT, Admin
    /// </summary>
    [HttpGet("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin")]
    public async Task<IActionResult> GetOltpProducts(
        [FromQuery] string? search     = null,
        [FromQuery] int?    categoryId = null,
        [FromQuery] bool?   isActive   = null,
        [FromQuery] int     page       = 1,
        [FromQuery] int     pageSize   = 20)
    {
        try
        {
            var (items, total) = await productRepo.GetFilteredAsync(search, categoryId, isActive, page, pageSize);
            var dtos = items.Select(p => new ProductResponseDto
            {
                ProductId     = p.ProductId,
                Sku           = p.Sku,
                ProductName   = p.ProductName,
                Description   = p.Description,
                BasePrice     = p.BasePrice,
                CostPrice     = p.CostPrice,
                StockQuantity = p.StockQuantity,
                CategoryId    = p.CategoryId,
                CategoryName  = p.Category?.CategoryName,
                ImageUrl      = p.ImageUrl,
                IsActive      = p.IsActive,
                CreatedAt     = p.CreatedAt,
            });

            return Ok(new PagedResult<ProductResponseDto>(dtos, total, page, pageSize));
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Lấy chi tiết sản phẩm theo ID.
    /// </summary>
    [HttpGet("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff,DataIT,Admin")]
    public async Task<IActionResult> GetOltpProduct(int id)
    {
        try
        {
            var product = await productRepo.GetByIdAsync(id);
            if (product is null) return NotFound(new { message = "Không tìm thấy sản phẩm." });

            return Ok(new ProductResponseDto
            {
                ProductId     = product.ProductId,
                Sku           = product.Sku,
                ProductName   = product.ProductName,
                Description   = product.Description,
                BasePrice     = product.BasePrice,
                CostPrice     = product.CostPrice,
                StockQuantity = product.StockQuantity,
                CategoryId    = product.CategoryId,
                CategoryName  = product.Category?.CategoryName,
                ImageUrl      = product.ImageUrl,
                IsActive      = product.IsActive,
                CreatedAt     = product.CreatedAt,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Tạo sản phẩm mới.
    /// Roles: Manager, DataIT, Admin
    /// </summary>
    [HttpPost("oltp")]
    [Authorize(Roles = "Manager,DataIT,Admin")]
    public async Task<IActionResult> CreateProduct([FromBody] CreateProductDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            // Kiểm tra SKU trùng lặp
            if (await productRepo.SkuExistsAsync(dto.Sku))
                return Conflict(new { message = $"SKU '{dto.Sku}' đã tồn tại." });

            var product = new Product
            {
                Sku           = dto.Sku,
                ProductName   = dto.ProductName,
                Description   = dto.Description,
                BasePrice     = dto.BasePrice,
                CostPrice     = dto.CostPrice,
                StockQuantity = dto.StockQuantity,
                CategoryId    = dto.CategoryId,
                ImageUrl      = dto.ImageUrl,
                IsActive      = true,
                CreatedAt     = DateTime.UtcNow,
                UpdatedAt     = DateTime.UtcNow,
            };

            await productRepo.AddAsync(product);
            return CreatedAtAction(nameof(GetOltpProduct), new { id = product.ProductId },
                new { product.ProductId, product.Sku, product.ProductName });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Cập nhật thông tin sản phẩm (partial update).
    /// Roles: Manager, DataIT, Admin
    /// </summary>
    [HttpPut("oltp/{id:int}")]
    [Authorize(Roles = "Manager,DataIT,Admin")]
    public async Task<IActionResult> UpdateProduct(int id, [FromBody] UpdateProductDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var product = await productRepo.GetByIdAsync(id);
            if (product is null) return NotFound(new { message = "Không tìm thấy sản phẩm." });

            // Kiểm tra SKU nếu thay đổi
            if (dto.Sku is not null && dto.Sku != product.Sku && await productRepo.SkuExistsAsync(dto.Sku, id))
                return Conflict(new { message = $"SKU '{dto.Sku}' đã tồn tại." });

            // Partial update – chỉ cập nhật trường được cung cấp
            if (dto.Sku          is not null) product.Sku           = dto.Sku;
            if (dto.ProductName  is not null) product.ProductName   = dto.ProductName;
            if (dto.Description  is not null) product.Description   = dto.Description;
            if (dto.BasePrice    is not null) product.BasePrice     = dto.BasePrice.Value;
            if (dto.CostPrice    is not null) product.CostPrice     = dto.CostPrice;
            if (dto.StockQuantity is not null) product.StockQuantity = dto.StockQuantity.Value;
            if (dto.CategoryId   is not null) product.CategoryId    = dto.CategoryId.Value;
            if (dto.ImageUrl     is not null) product.ImageUrl      = dto.ImageUrl;
            if (dto.IsActive     is not null) product.IsActive      = dto.IsActive.Value;
            product.UpdatedAt = DateTime.UtcNow;

            await productRepo.UpdateAsync(product);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Xóa sản phẩm (soft-delete: set IsActive = false).
    /// Roles: Admin, DataIT
    /// </summary>
    [HttpDelete("oltp/{id:int}")]
    [Authorize(Roles = "Admin,DataIT")]
    public async Task<IActionResult> DeleteProduct(int id)
    {
        try
        {
            if (!await productRepo.ExistsAsync(id))
                return NotFound(new { message = "Không tìm thấy sản phẩm." });

            await productRepo.DeleteAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}
