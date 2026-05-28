using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Lịch sử thay đổi tồn kho.
/// GET /api/inventory/transactions — xem audit trail tồn kho.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class InventoryController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    /// <summary>
    /// Danh sách lịch sử thay đổi tồn kho, phân trang, lọc theo sản phẩm/loại/ngày.
    /// Roles: Owner, Manager, DataIT
    /// </summary>
    [HttpGet("transactions")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] int?      productId = null,
        [FromQuery] string?   type      = null,
        [FromQuery] DateOnly? from      = null,
        [FromQuery] DateOnly? to        = null,
        [FromQuery] int       page      = 1,
        [FromQuery] int       pageSize  = 20)
    {
        if (page     < 1) page     = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var where = new List<string>();
            if (!tenant.IsSuperAdmin && tenant.CompanyId.HasValue)
                where.Add("t.company_id = @cid::uuid");
            if (productId.HasValue)
                where.Add("t.product_id = @productId");
            if (!string.IsNullOrWhiteSpace(type))
                where.Add("t.transaction_type = @type");
            if (from.HasValue)
                where.Add("t.created_at >= @from");
            if (to.HasValue)
                where.Add("t.created_at < @to + INTERVAL '1 day'");

            var whereClause = where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "";

            // Đếm tổng
            await using var cntCmd = new NpgsqlCommand($"""
                SELECT COUNT(*) FROM public.inventory_transactions t
                {whereClause}
                """, conn);
            if (!tenant.IsSuperAdmin && tenant.CompanyId.HasValue)
                cntCmd.Parameters.AddWithValue("cid", tenant.CompanyId.Value.ToString());
            if (productId.HasValue)
                cntCmd.Parameters.AddWithValue("productId", productId.Value);
            if (!string.IsNullOrWhiteSpace(type))
                cntCmd.Parameters.AddWithValue("type", type);
            if (from.HasValue)
                cntCmd.Parameters.AddWithValue("from", from.Value.ToDateTime(TimeOnly.MinValue));
            if (to.HasValue)
                cntCmd.Parameters.AddWithValue("to", to.Value.ToDateTime(TimeOnly.MinValue));

            var total = Convert.ToInt64(await cntCmd.ExecuteScalarAsync());

            // Lấy dữ liệu phân trang
            await using var dataCmd = new NpgsqlCommand($"""
                SELECT t.transaction_id,
                       t.product_id,
                       p.product_name,
                       t.transaction_type,
                       t.quantity_change,
                       t.before_stock,
                       t.after_stock,
                       t.reference_type,
                       t.reference_id,
                       t.note,
                       t.created_at,
                       u.username AS created_by_name
                FROM public.inventory_transactions t
                LEFT JOIN public.products p ON t.product_id = p.product_id
                LEFT JOIN public.users    u ON t.created_by = u.user_id
                {whereClause}
                ORDER BY t.created_at DESC
                LIMIT @limit OFFSET @offset
                """, conn);

            if (!tenant.IsSuperAdmin && tenant.CompanyId.HasValue)
                dataCmd.Parameters.AddWithValue("cid", tenant.CompanyId.Value.ToString());
            if (productId.HasValue)
                dataCmd.Parameters.AddWithValue("productId", productId.Value);
            if (!string.IsNullOrWhiteSpace(type))
                dataCmd.Parameters.AddWithValue("type", type);
            if (from.HasValue)
                dataCmd.Parameters.AddWithValue("from", from.Value.ToDateTime(TimeOnly.MinValue));
            if (to.HasValue)
                dataCmd.Parameters.AddWithValue("to", to.Value.ToDateTime(TimeOnly.MinValue));
            dataCmd.Parameters.AddWithValue("limit",  pageSize);
            dataCmd.Parameters.AddWithValue("offset", (page - 1) * pageSize);

            var rows = new List<object>();
            await using var reader = await dataCmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(new
                {
                    transactionId   = reader.GetInt64(0),
                    productId       = reader.GetInt32(1),
                    productName     = reader.IsDBNull(2)  ? null : reader.GetString(2),
                    transactionType = reader.GetString(3),
                    quantityChange  = reader.GetInt32(4),
                    beforeStock     = reader.GetInt32(5),
                    afterStock      = reader.GetInt32(6),
                    referenceType   = reader.IsDBNull(7)  ? null : reader.GetString(7),
                    referenceId     = reader.IsDBNull(8)  ? (long?)null : reader.GetInt64(8),
                    note            = reader.IsDBNull(9)  ? null : reader.GetString(9),
                    createdAt       = reader.GetDateTime(10),
                    createdBy       = reader.IsDBNull(11) ? null : reader.GetString(11),
                });
            }

            return Ok(new
            {
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)total / pageSize),
                items = rows,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}
