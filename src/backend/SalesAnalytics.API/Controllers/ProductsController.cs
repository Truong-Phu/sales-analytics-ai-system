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
/// Quản lý sản phẩm.
/// GET /api/products        – đọc từ dw.dim_product (analytics, DW schema).
/// CRUD /api/products/oltp  – đọc/ghi vào public.products (OLTP, Repository Pattern).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProductsController(
    IConfiguration cfg,
    IProductRepository productRepo,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DATA WAREHOUSE – Analytics queries (raw SQL, dw schema)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Danh sách sản phẩm với số lượng bán + tổng doanh thu (từ DW).
    /// Roles: Owner, Manager, Staff, DataIT
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Warehouse,Staff_Marketing,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetProducts(
        [FromQuery] string? search   = null,
        [FromQuery] string? category = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     limit    = 20)
    {
        if (page  < 1) page  = 1;
        if (limit < 1 || limit > 100) limit = 20;

        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

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
                    COALESCE(SUM(fs.item_quantity), 0) AS total_qty_sold,
                    oltp.product_id  AS oltp_product_id,
                    oltp.category_id AS oltp_category_id,
                    oltp.stock_quantity AS stock
                FROM dw.dim_product dp
                LEFT JOIN dw.fact_sales fs   ON fs.product_key = dp.product_key
                LEFT JOIN public.products oltp ON oltp.sku = dp.sku AND oltp.is_active = TRUE
                WHERE dp.is_current = TRUE
                  AND (@search     IS NULL OR dp.product_name ILIKE '%' || @search   || '%'
                                           OR dp.sku          ILIKE '%' || @search   || '%')
                  AND (@category   IS NULL OR dp.category_name ILIKE '%' || @category || '%')
                  AND (@companyId  IS NULL OR fs.company_id = @companyId::uuid OR fs.company_id IS NULL)
                GROUP BY dp.product_key, dp.product_id, dp.product_name, dp.sku,
                         dp.category_name, dp.brand, dp.base_price,
                         dp.cost_price, dp.is_current, dp.effective_from,
                         oltp.product_id, oltp.category_id, oltp.stock_quantity
                ORDER BY total_qty_sold DESC, dp.product_name
                LIMIT @limit OFFSET @offset
                """;

            var countSql = """
                SELECT COUNT(DISTINCT dp.product_key)
                FROM dw.dim_product dp
                LEFT JOIN dw.fact_sales fs ON fs.product_key = dp.product_key
                WHERE dp.is_current = TRUE
                  AND (@search    IS NULL OR dp.product_name ILIKE '%' || @search   || '%'
                                          OR dp.sku          ILIKE '%' || @search   || '%')
                  AND (@category  IS NULL OR dp.category_name ILIKE '%' || @category || '%')
                  AND (@companyId IS NULL OR fs.company_id = @companyId::uuid OR fs.company_id IS NULL)
                """;

            await using var countCmd = new NpgsqlCommand(countSql, conn);
            countCmd.Parameters.Add(new NpgsqlParameter("search",    NpgsqlDbType.Text) { Value = (object?)search    ?? DBNull.Value });
            countCmd.Parameters.Add(new NpgsqlParameter("category",  NpgsqlDbType.Text) { Value = (object?)category  ?? DBNull.Value });
            countCmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.Add(new NpgsqlParameter("search",    NpgsqlDbType.Text) { Value = (object?)search    ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("category",  NpgsqlDbType.Text) { Value = (object?)category  ?? DBNull.Value });
            cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
            cmd.Parameters.AddWithValue("limit",  limit);
            cmd.Parameters.AddWithValue("offset", (page - 1) * limit);

            var products = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                products.Add(new
                {
                    ProductId       = reader.GetInt32(0),
                    ProductName     = reader.GetString(1),
                    Sku             = reader.IsDBNull(2)  ? "" : reader.GetString(2),
                    Category        = reader.IsDBNull(3)  ? "" : reader.GetString(3),
                    Brand           = reader.IsDBNull(4)  ? "" : reader.GetString(4),
                    BasePrice       = reader.IsDBNull(5)  ? 0m : reader.GetDecimal(5),
                    CostPrice       = reader.IsDBNull(6)  ? 0m : reader.GetDecimal(6),
                    IsCurrent       = reader.GetBoolean(7),
                    EffectiveFrom   = reader.IsDBNull(8)  ? (DateTime?)null : reader.GetDateTime(8),
                    TotalOrders     = reader.GetInt64(9),
                    TotalQtySold    = reader.GetInt64(10),
                    OltpProductId   = reader.IsDBNull(11) ? (int?)null : reader.GetInt32(11),
                    OltpCategoryId  = reader.IsDBNull(12) ? (int?)null : reader.GetInt32(12),
                    Stock           = reader.IsDBNull(13) ? (int?)null : reader.GetInt32(13),
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
    // 1b. Danh sách danh mục sản phẩm (dropdown cho Create/Edit form)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Danh sách danh mục sản phẩm đang hoạt động, dùng cho dropdown.
    /// </summary>
    [HttpGet("categories")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Warehouse,Staff_Marketing,DataIT")]
    public async Task<IActionResult> GetCategories()
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var sql = """
                SELECT category_id, category_name, parent_id, level
                FROM public.categories
                WHERE is_active = TRUE
                  AND (company_id = @cid::uuid OR company_id IS NULL)
                ORDER BY
                    CASE WHEN parent_id IS NULL THEN category_id ELSE parent_id END,
                    level,
                    category_name
                """;

            var cats = new List<object>();
            await using var cmd    = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                cats.Add(new
                {
                    CategoryId   = reader.GetInt32(0),
                    CategoryName = reader.GetString(1),
                    ParentId     = reader.IsDBNull(2) ? (int?)null : reader.GetInt32(2),
                    Level        = reader.GetInt16(3),
                });
            }
            return Ok(cats);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. OLTP – CRUD qua Repository Pattern (public.products)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// [OLTP] Lấy danh sách biến thể (size/màu) của một sản phẩm.
    /// Dùng trong form tạo phiếu nhập hàng để chọn variation cụ thể.
    /// </summary>
    [HttpGet("{id:int}/variations")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Warehouse,Staff_Marketing,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetVariations(int id)
    {
        var companyId = tenant.CompanyId;
        if (companyId is null) return Forbid();

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT id, sku, variation_name, attribute_color, attribute_size,
                       sale_price, original_price, stock_quantity, image_url, is_active
                FROM public.product_variations
                WHERE product_id = @pid AND company_id = @cid::uuid AND is_active = TRUE
                ORDER BY attribute_size, attribute_color, variation_name
                """, conn);
            cmd.Parameters.AddWithValue("pid", id);
            cmd.Parameters.AddWithValue("cid", companyId.Value.ToString());

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    variationId    = r.GetInt32(0),
                    sku            = r.GetString(1),
                    variationName  = r.IsDBNull(2) ? null : r.GetString(2),
                    color          = r.IsDBNull(3) ? null : r.GetString(3),
                    size           = r.IsDBNull(4) ? null : r.GetString(4),
                    salePrice      = r.IsDBNull(5) ? (decimal?)null : r.GetDecimal(5),
                    originalPrice  = r.IsDBNull(6) ? (decimal?)null : r.GetDecimal(6),
                    stockQuantity  = r.GetInt32(7),
                    imageUrl       = r.IsDBNull(8) ? null : r.GetString(8),
                });

            return Ok(new { success = true, data = list });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Danh sách sản phẩm với phân trang và tìm kiếm (EF Core, public schema).
    /// Roles: Owner, Manager, Staff, DataIT
    /// </summary>
    [HttpGet("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Warehouse,Staff_Marketing,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetOltpProducts(
        [FromQuery] string? search     = null,
        [FromQuery] int?    categoryId = null,
        [FromQuery] bool?   isActive   = null,
        [FromQuery] int     page       = 1,
        [FromQuery] int     pageSize   = 20)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var (items, total) = await productRepo.GetFilteredAsync(
                search, categoryId, isActive, page, pageSize, companyId);
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
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Warehouse,Staff_Marketing,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetOltpProduct(int id)
    {
        try
        {
            var product = await productRepo.GetByIdAsync(id);
            if (product is null) return NotFound(new { message = "Không tìm thấy sản phẩm." });

            if (!tenant.IsSuperAdmin && product.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền truy cập sản phẩm này." });

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
    /// Roles: Owner, Manager, DataIT
    /// </summary>
    [HttpPost("oltp")]
    [Authorize(Roles = "Owner,Manager,DataIT")]
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
                CompanyId     = tenant.CompanyId,   // gán company hiện tại
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
    /// Roles: Owner, Manager, DataIT
    /// </summary>
    [HttpPut("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,DataIT")]
    public async Task<IActionResult> UpdateProduct(int id, [FromBody] UpdateProductDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var product = await productRepo.GetByIdAsync(id);
            if (product is null) return NotFound(new { message = "Không tìm thấy sản phẩm." });

            if (!tenant.IsSuperAdmin && product.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền chỉnh sửa sản phẩm này." });

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
    /// Roles: Owner, DataIT
    /// </summary>
    [HttpDelete("oltp/{id:int}")]
    [Authorize(Roles = "Owner,DataIT")]
    public async Task<IActionResult> DeleteProduct(int id)
    {
        try
        {
            var product = await productRepo.GetByIdAsync(id);
            if (product is null) return NotFound(new { message = "Không tìm thấy sản phẩm." });

            if (!tenant.IsSuperAdmin && product.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền xóa sản phẩm này." });

            await productRepo.DeleteAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Upload ảnh sản phẩm (PNG/JPG/WEBP, max 5MB).
    /// Roles: Owner, Manager, DataIT
    /// </summary>
    [HttpPost("oltp/{id:int}/image")]
    [Authorize(Roles = "Owner,Manager,DataIT")]
    public async Task<IActionResult> UploadProductImage(int id, IFormFile image)
    {
        if (image is null || image.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        if (image.Length > 5 * 1024 * 1024)
            return BadRequest(new { message = "Ảnh tối đa 5MB." });

        var ext = Path.GetExtension(image.FileName).ToLowerInvariant();
        if (ext is not (".jpg" or ".jpeg" or ".png" or ".webp"))
            return BadRequest(new { message = "Chỉ chấp nhận JPG/PNG/WEBP." });

        try
        {
            var product = await productRepo.GetByIdAsync(id);
            if (product is null) return NotFound(new { message = "Không tìm thấy sản phẩm." });

            if (!tenant.IsSuperAdmin && product.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền upload ảnh cho sản phẩm này." });

            var uploadsDir = Path.Combine(
                cfg["WebRootPath"] ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"),
                "uploads", "products");
            Directory.CreateDirectory(uploadsDir);

            var fileName = $"product_{id}_{DateTime.UtcNow.Ticks}{ext}";
            var filePath = Path.Combine(uploadsDir, fileName);
            await using var stream = System.IO.File.Create(filePath);
            await image.CopyToAsync(stream);

            product.ImageUrl  = $"/uploads/products/{fileName}";
            product.UpdatedAt = DateTime.UtcNow;
            await productRepo.UpdateAsync(product);

            return Ok(new { imageUrl = product.ImageUrl });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 3. GIÁ THEO KÊNH – product_channel_prices
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>Lấy danh sách giá theo kênh của 1 sản phẩm</summary>
    [HttpGet("oltp/{id:int}/channel-prices")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Warehouse,Staff_Marketing,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetChannelPrices(int id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Tạo bảng nếu chưa có (idempotent)
            const string ensureTable = """
                CREATE TABLE IF NOT EXISTS public.product_channel_prices (
                    id         SERIAL PRIMARY KEY,
                    product_id INTEGER NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
                    channel    VARCHAR(100) NOT NULL,
                    price      NUMERIC(18,2) NOT NULL DEFAULT 0,
                    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (product_id, channel)
                )
                """;
            await using (var cmd = new NpgsqlCommand(ensureTable, conn))
                await cmd.ExecuteNonQueryAsync();

            const string sql = """
                SELECT id, channel, price, is_active, updated_at
                FROM   public.product_channel_prices
                WHERE  product_id = @productId
                ORDER  BY channel
                """;
            await using var q = new NpgsqlCommand(sql, conn);
            q.Parameters.AddWithValue("productId", id);

            var rows = new List<object>();
            await using var r = await q.ExecuteReaderAsync();
            while (await r.ReadAsync())
                rows.Add(new {
                    id        = r.GetInt32(0),
                    channel   = r.GetString(1),
                    price     = r.GetDecimal(2),
                    isActive  = r.GetBoolean(3),
                    updatedAt = r.GetDateTime(4),
                });
            return Ok(rows);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>Lưu (upsert) giá theo kênh cho 1 sản phẩm</summary>
    [HttpPost("oltp/{id:int}/channel-prices")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> SaveChannelPrice(int id, [FromBody] ChannelPriceRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Channel) || req.Price < 0)
            return BadRequest(new { message = "Kênh và giá không hợp lệ." });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            const string upsert = """
                INSERT INTO public.product_channel_prices (product_id, channel, price, is_active, updated_at)
                VALUES (@productId, @channel, @price, @isActive, NOW())
                ON CONFLICT (product_id, channel)
                DO UPDATE SET price = EXCLUDED.price, is_active = EXCLUDED.is_active, updated_at = NOW()
                """;
            await using var cmd = new NpgsqlCommand(upsert, conn);
            cmd.Parameters.AddWithValue("productId", id);
            cmd.Parameters.AddWithValue("channel",   req.Channel.Trim());
            cmd.Parameters.AddWithValue("price",     req.Price);
            cmd.Parameters.AddWithValue("isActive",  req.IsActive);
            await cmd.ExecuteNonQueryAsync();

            return Ok(new { message = "Đã lưu giá theo kênh." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}

public record ChannelPriceRequest(string Channel, decimal Price, bool IsActive = true);
