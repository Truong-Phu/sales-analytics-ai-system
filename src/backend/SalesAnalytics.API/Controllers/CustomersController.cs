using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using NpgsqlTypes;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý khách hàng.
/// GET /api/customers        – đọc từ dw.dim_customer (analytics, DW schema).
/// CRUD /api/customers/oltp  – đọc/ghi vào public.customers (OLTP, Repository Pattern).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CustomersController(
    IConfiguration cfg,
    ICustomerRepository customerRepo,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DATA WAREHOUSE – Analytics queries (raw SQL, dw schema)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Danh sách khách hàng với tổng doanh thu + số đơn từ DW.
    /// Roles: Owner, Manager, DataIT
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    [RequirePlan("pro")]
    public async Task<IActionResult> GetCustomers(
        [FromQuery] string?   search  = null,
        [FromQuery] string?   segment = null,   // VIP | REGULAR | NEW | INACTIVE
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] decimal? minSpent = null,
        [FromQuery] decimal? maxSpent = null,
        [FromQuery] string?   province = null,
        [FromQuery] int       page    = 1,
        [FromQuery] int       limit   = 20)
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
                    dc.customer_id,
                    dc.customer_code,
                    dc.full_name,
                    dc.email,
                    dc.province,
                    dc.region,
                    dc.segment_label,
                    dc.effective_from,
                    COUNT(DISTINCT fs.external_order_id)  AS total_orders,
                    COALESCE(SUM(fs.net_revenue),      0) AS total_revenue,
                    CASE
                        WHEN COUNT(DISTINCT fs.external_order_id) > 0
                        THEN COALESCE(SUM(fs.net_revenue), 0) / COUNT(DISTINCT fs.external_order_id)
                        ELSE 0
                    END AS avg_order_value,
                    MAX(dd.full_date)                      AS last_order_date,
                    COALESCE(lp.loyalty_balance, 0)        AS loyalty_points,
                    dc.phone,
                    dc.address,
                    dc.district
                FROM dw.dim_customer dc
                LEFT JOIN dw.fact_sales fs ON fs.customer_key = dc.customer_key
                LEFT JOIN dw.dim_date   dd ON fs.date_key     = dd.date_key
                LEFT JOIN (
                    SELECT customer_id,
                           SUM(CASE WHEN point_type IN ('EARNED','BONUS')             THEN points ELSE 0 END)
                         - SUM(CASE WHEN point_type IN ('REDEEMED','EXPIRED')         THEN points ELSE 0 END)
                           AS loyalty_balance
                    FROM public.loyalty_points
                    GROUP BY customer_id
                ) lp ON lp.customer_id = dc.customer_id
                WHERE dc.is_current = TRUE
                  AND (@search    IS NULL OR dc.full_name     ILIKE '%' || @search  || '%'
                                          OR dc.customer_code ILIKE '%' || @search  || '%')
                  AND (@segment   IS NULL OR dc.segment_label = @segment)
                  AND (@province  IS NULL OR dc.province ILIKE '%' || @province || '%' OR dc.region ILIKE '%' || @province || '%')
                  AND (@from      IS NULL OR dd.full_date >= @from::date)
                  AND (@to        IS NULL OR dd.full_date <= @to::date)
                  AND (@companyId IS NULL OR fs.company_id = @companyId::uuid OR fs.company_id IS NULL)
                GROUP BY dc.customer_key, dc.customer_id, dc.customer_code, dc.full_name,
                         dc.email, dc.province, dc.region, dc.segment_label, dc.effective_from,
                         lp.loyalty_balance, dc.phone, dc.address, dc.district
                HAVING (@minSpent IS NULL OR COALESCE(SUM(fs.net_revenue), 0) >= @minSpent)
                   AND (@maxSpent IS NULL OR COALESCE(SUM(fs.net_revenue), 0) <= @maxSpent)
                ORDER BY total_revenue DESC
                LIMIT @limit OFFSET @offset
                """;

            var countSql = """
                SELECT COUNT(*)
                FROM (
                    SELECT dc.customer_key
                    FROM dw.dim_customer dc
                    LEFT JOIN dw.fact_sales fs ON fs.customer_key = dc.customer_key
                    LEFT JOIN dw.dim_date   dd ON fs.date_key     = dd.date_key
                    WHERE dc.is_current = TRUE
                      AND (@search    IS NULL OR dc.full_name     ILIKE '%' || @search  || '%'
                                              OR dc.customer_code ILIKE '%' || @search  || '%')
                      AND (@segment   IS NULL OR dc.segment_label = @segment)
                      AND (@province  IS NULL OR dc.province ILIKE '%' || @province || '%' OR dc.region ILIKE '%' || @province || '%')
                      AND (@from      IS NULL OR dd.full_date >= @from::date)
                      AND (@to        IS NULL OR dd.full_date <= @to::date)
                      AND (@companyId IS NULL OR fs.company_id = @companyId::uuid OR fs.company_id IS NULL)
                    GROUP BY dc.customer_key
                    HAVING (@minSpent IS NULL OR COALESCE(SUM(fs.net_revenue), 0) >= @minSpent)
                       AND (@maxSpent IS NULL OR COALESCE(SUM(fs.net_revenue), 0) <= @maxSpent)
                ) filtered
                """;

            void BindParams(NpgsqlCommand c)
            {
                c.Parameters.Add(new NpgsqlParameter("search",    NpgsqlDbType.Text) { Value = (object?)search    ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("segment",   NpgsqlDbType.Text) { Value = (object?)segment   ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("from",      NpgsqlDbType.Text) { Value = from.HasValue ? (object)from.Value.ToString("yyyy-MM-dd") : DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("to",        NpgsqlDbType.Text) { Value = to.HasValue   ? (object)to.Value.ToString("yyyy-MM-dd")   : DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("province",  NpgsqlDbType.Text) { Value = (object?)province  ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("minSpent",  NpgsqlDbType.Numeric) { Value = (object?)minSpent ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("maxSpent",  NpgsqlDbType.Numeric) { Value = (object?)maxSpent ?? DBNull.Value });
                c.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
            }

            await using var countCmd = new NpgsqlCommand(countSql, conn);
            BindParams(countCmd);
            var total = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand(sql, conn);
            BindParams(cmd);
            cmd.Parameters.AddWithValue("limit",  limit);
            cmd.Parameters.AddWithValue("offset", (page - 1) * limit);

            var customers = new List<object>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                customers.Add(new
                {
                    CustomerId     = reader.IsDBNull(0)  ? 0               : reader.GetInt32(0),
                    CustomerCode   = reader.IsDBNull(1)  ? ""              : reader.GetString(1),
                    FullName       = reader.IsDBNull(2)  ? ""              : reader.GetString(2),
                    Email          = reader.IsDBNull(3)  ? ""              : reader.GetString(3),
                    Province       = reader.IsDBNull(4)  ? ""              : reader.GetString(4),
                    Region         = reader.IsDBNull(5)  ? ""              : reader.GetString(5),
                    SegmentLabel   = reader.IsDBNull(6)  ? ""              : reader.GetString(6),
                    FirstOrderDate = reader.IsDBNull(7)  ? (DateOnly?)null : DateOnly.FromDateTime(reader.GetDateTime(7)),
                    TotalOrders    = reader.GetInt64(8),
                    TotalRevenue   = reader.GetDecimal(9),
                    AvgOrderValue  = reader.GetDecimal(10),
                    LastOrderDate  = reader.IsDBNull(11) ? (DateTime?)null : reader.GetDateTime(11),
                    LoyaltyPoints  = reader.IsDBNull(12) ? 0               : reader.GetDecimal(12),
                    Phone    = reader.IsDBNull(13) ? null             : reader.GetString(13),
                    Address        = reader.IsDBNull(14) ? null             : reader.GetString(14),
                    District       = reader.IsDBNull(15) ? null             : reader.GetString(15),
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
        catch (NpgsqlException ex)
        {
            return StatusCode(503, new { message = "Data Warehouse chưa sẵn sàng hoặc lỗi kết nối.", detail = ex.Message });
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 2. OLTP – CRUD qua Repository Pattern (public.customers)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// [OLTP] Danh sách khách hàng OLTP với phân trang (EF Core, public schema).
    /// </summary>
    [HttpGet("oltp")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetOltpCustomers(
        [FromQuery] string? search   = null,
        [FromQuery] string? segment  = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 20)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var (items, total) = await customerRepo.GetFilteredAsync(
                search, segment, page, pageSize, companyId);
            var dtos = items.Select(c => new CustomerResponseDto
            {
                CustomerId   = c.CustomerId,
                CustomerCode = c.CustomerCode,
                FullName     = c.FullName,
                Email        = c.Email,
                Phone        = c.Phone,
                Address      = c.Address,
                Province     = c.Province,
                District     = c.District,
                Ward         = c.Ward,
                TotalOrders  = c.TotalOrders,
                TotalSpent   = c.TotalSpent,
                SegmentLabel = c.SegmentLabel,
                IsActive     = c.IsActive,
                CreatedAt    = c.CreatedAt,
            });

            return Ok(new PagedResult<CustomerResponseDto>(dtos, total, page, pageSize));
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Lấy chi tiết khách hàng theo ID.
    /// </summary>
    [HttpGet("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetOltpCustomer(int id)
    {
        try
        {
            var customer = await customerRepo.GetByIdAsync(id);
            if (customer is null) return NotFound(new { message = "Không tìm thấy khách hàng." });

            if (!tenant.IsSuperAdmin && customer.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền truy cập khách hàng này." });

            return Ok(new CustomerResponseDto
            {
                CustomerId   = customer.CustomerId,
                CustomerCode = customer.CustomerCode,
                FullName     = customer.FullName,
                Email        = customer.Email,
                Phone        = customer.Phone,
                Address      = customer.Address,
                Province     = customer.Province,
                District     = customer.District,
                Ward         = customer.Ward,
                TotalOrders  = customer.TotalOrders,
                TotalSpent   = customer.TotalSpent,
                SegmentLabel = customer.SegmentLabel,
                IsActive     = customer.IsActive,
                CreatedAt    = customer.CreatedAt,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Tạo khách hàng mới.
    /// Roles: Owner, Manager, Staff
    /// </summary>
    [HttpPost("oltp")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
    public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            // Kiểm tra email trùng
            if (dto.Email is not null)
            {
                var existing = await customerRepo.GetByEmailAsync(dto.Email);
                if (existing is not null)
                    return Conflict(new { message = $"Email '{dto.Email}' đã được sử dụng." });
            }

            var customer = new Customer
            {
                FullName    = dto.FullName,
                Email       = dto.Email,
                Phone = dto.Phone,
                Address     = dto.Address,
                Province    = dto.Province,
                District    = dto.District,
                CompanyId   = tenant.CompanyId,   // gán company hiện tại
                IsActive    = true,
                CreatedAt   = DateTime.UtcNow,
                UpdatedAt   = DateTime.UtcNow,
            };

            await customerRepo.AddAsync(customer);
            return CreatedAtAction(nameof(GetOltpCustomer), new { id = customer.CustomerId },
                new { customer.CustomerId, customer.FullName });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Cập nhật thông tin khách hàng (partial update).
    /// Roles: Owner, Manager, Staff
    /// </summary>
    [HttpPut("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
    public async Task<IActionResult> UpdateCustomer(int id, [FromBody] UpdateCustomerDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        try
        {
            var customer = await customerRepo.GetByIdAsync(id);
            if (customer is null) return NotFound(new { message = "Không tìm thấy khách hàng." });

            if (!tenant.IsSuperAdmin && customer.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền chỉnh sửa khách hàng này." });

            if (dto.FullName     is not null) customer.FullName     = dto.FullName;
            if (dto.Email        is not null) customer.Email        = dto.Email;
            if (dto.Phone  is not null) customer.Phone  = dto.Phone;
            if (dto.Address      is not null) customer.Address      = dto.Address;
            if (dto.Province     is not null) customer.Province     = dto.Province;
            if (dto.District     is not null) customer.District     = dto.District;
            if (dto.SegmentLabel is not null) customer.SegmentLabel = dto.SegmentLabel;
            if (dto.IsActive     is not null) customer.IsActive     = dto.IsActive.Value;
            customer.UpdatedAt = DateTime.UtcNow;

            await customerRepo.UpdateAsync(customer);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Lấy top khách hàng theo tổng chi tiêu.
    /// Roles: Owner, Manager, DataIT
    /// </summary>
    [HttpGet("oltp/top")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetTopCustomers([FromQuery] int topN = 10)
    {
        try
        {
            if (topN < 1 || topN > 100) topN = 10;
            var customers = await customerRepo.GetTopBySpendingAsync(topN);
            var dtos = customers.Select(c => new CustomerResponseDto
            {
                CustomerId   = c.CustomerId,
                CustomerCode = c.CustomerCode,
                FullName     = c.FullName,
                Email        = c.Email,
                TotalOrders  = c.TotalOrders,
                TotalSpent   = c.TotalSpent,
                SegmentLabel = c.SegmentLabel,
                IsActive     = c.IsActive,
                CreatedAt    = c.CreatedAt,
            });

            return Ok(dtos);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>
    /// [OLTP] Ẩn khách hàng (soft-delete: set IsActive = false).
    /// Roles: Owner, Manager
    /// </summary>
    [HttpDelete("oltp/{id:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> DeactivateCustomer(int id)
    {
        try
        {
            var customer = await customerRepo.GetByIdAsync(id);
            if (customer is null) return NotFound(new { message = "Không tìm thấy khách hàng." });

            if (!tenant.IsSuperAdmin && customer.CompanyId != tenant.CompanyId)
                return StatusCode(403, new { message = "Không có quyền xóa khách hàng này." });

            customer.IsActive  = false;
            customer.UpdatedAt = DateTime.UtcNow;
            await customerRepo.UpdateAsync(customer);

            return Ok(new { message = $"Đã ẩn khách hàng '{customer.FullName}'." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}
