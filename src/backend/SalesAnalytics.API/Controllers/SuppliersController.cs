using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý nhà cung cấp.
/// GET/POST/PUT/DELETE /api/suppliers
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class SuppliersController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/suppliers
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search   = null,
        [FromQuery] bool?   active   = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 20)
    {
        if (page     < 1) page     = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var where = new List<string> { "s.company_id = @cid::uuid" };
            if (!string.IsNullOrWhiteSpace(search))
                where.Add("(s.supplier_name ILIKE @q OR s.phone ILIKE @q OR s.email ILIKE @q OR s.supplier_code ILIKE @q)");
            if (active.HasValue)
                where.Add("s.is_active = @active");
            var wc = "WHERE " + string.Join(" AND ", where);

            await using var cntCmd = new NpgsqlCommand($"SELECT COUNT(*) FROM public.suppliers s {wc}", conn);
            cntCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            if (!string.IsNullOrWhiteSpace(search)) cntCmd.Parameters.AddWithValue("q", $"%{search}%");
            if (active.HasValue)                    cntCmd.Parameters.AddWithValue("active", active.Value);
            var total = Convert.ToInt64(await cntCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand($"""
                SELECT supplier_id, supplier_code, supplier_name, contact_name,
                       phone, email, address, tax_code, note, is_active,
                       created_at, updated_at
                FROM public.suppliers s {wc}
                ORDER BY supplier_name
                LIMIT @lim OFFSET @off
                """, conn);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            if (!string.IsNullOrWhiteSpace(search)) cmd.Parameters.AddWithValue("q", $"%{search}%");
            if (active.HasValue)                    cmd.Parameters.AddWithValue("active", active.Value);
            cmd.Parameters.AddWithValue("lim", pageSize);
            cmd.Parameters.AddWithValue("off", (page - 1) * pageSize);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                items.Add(new
                {
                    supplierId   = r.GetInt32(0),
                    supplierCode = r.IsDBNull(1) ? null : r.GetString(1),
                    supplierName = r.GetString(2),
                    contactName  = r.IsDBNull(3) ? null : r.GetString(3),
                    phone        = r.IsDBNull(4) ? null : r.GetString(4),
                    email        = r.IsDBNull(5) ? null : r.GetString(5),
                    address      = r.IsDBNull(6) ? null : r.GetString(6),
                    taxCode      = r.IsDBNull(7) ? null : r.GetString(7),
                    note         = r.IsDBNull(8) ? null : r.GetString(8),
                    isActive     = r.GetBoolean(9),
                    createdAt    = r.GetDateTime(10),
                    updatedAt    = r.IsDBNull(11) ? (DateTime?)null : r.GetDateTime(11),
                });

            return Ok(new
            {
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)total / pageSize),
                items,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/suppliers/{id}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("{id:int}")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT supplier_id, supplier_code, supplier_name, contact_name,
                       phone, email, address, tax_code, note, is_active,
                       created_at, updated_at
                FROM public.suppliers
                WHERE supplier_id = @id AND company_id = @cid::uuid
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());

            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync())
                return NotFound(new { message = "Không tìm thấy nhà cung cấp." });

            return Ok(new
            {
                supplierId   = r.GetInt32(0),
                supplierCode = r.IsDBNull(1) ? null : r.GetString(1),
                supplierName = r.GetString(2),
                contactName  = r.IsDBNull(3) ? null : r.GetString(3),
                phone        = r.IsDBNull(4) ? null : r.GetString(4),
                email        = r.IsDBNull(5) ? null : r.GetString(5),
                address      = r.IsDBNull(6) ? null : r.GetString(6),
                taxCode      = r.IsDBNull(7) ? null : r.GetString(7),
                note         = r.IsDBNull(8) ? null : r.GetString(8),
                isActive     = r.GetBoolean(9),
                createdAt    = r.GetDateTime(10),
                updatedAt    = r.IsDBNull(11) ? (DateTime?)null : r.GetDateTime(11),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/suppliers/{id}/products  — danh sách SP của NCC qua supplier_products
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("{id:int}/products")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetProducts(int id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT p.product_id, p.product_name, p.sku, p.base_price, p.stock_quantity
                FROM public.supplier_products sp
                JOIN public.products         p ON p.product_id  = sp.product_id
                JOIN public.suppliers        s ON s.supplier_id = sp.supplier_id
                WHERE sp.supplier_id = @id AND s.company_id = @cid::uuid
                ORDER BY p.product_name
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    productId    = r.GetInt32(0),
                    productName  = r.GetString(1),
                    sku          = r.IsDBNull(2) ? null : r.GetString(2),
                    sellingPrice = r.IsDBNull(3) ? 0m : r.GetDecimal(3),
                    stockQuantity= r.IsDBNull(4) ? 0  : r.GetInt32(4),
                });

            return Ok(list);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/suppliers
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> Create([FromBody] SupplierDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.SupplierName))
            return BadRequest(new { message = "Tên nhà cung cấp không được để trống." });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                await using var cmd = new NpgsqlCommand("""
                    INSERT INTO public.suppliers
                        (company_id, supplier_code, supplier_name, contact_name,
                         phone, email, address, tax_code, note, is_active, created_at)
                    VALUES
                        (@cid::uuid, @code, @name, @contact,
                         @phone, @email, @address, @tax, @note, TRUE, NOW())
                    RETURNING supplier_id
                    """, conn, tx);
                cmd.Parameters.AddWithValue("cid",     tenant.CompanyId!.Value.ToString());
                cmd.Parameters.AddWithValue("code",    (object?)dto.SupplierCode ?? DBNull.Value);
                cmd.Parameters.AddWithValue("name",    dto.SupplierName);
                cmd.Parameters.AddWithValue("contact", (object?)dto.ContactName  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("phone",   (object?)dto.Phone        ?? DBNull.Value);
                cmd.Parameters.AddWithValue("email",   (object?)dto.Email        ?? DBNull.Value);
                cmd.Parameters.AddWithValue("address", (object?)dto.Address      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("tax",     (object?)dto.TaxCode      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("note",    (object?)dto.Note         ?? DBNull.Value);

                var newId = Convert.ToInt32(await cmd.ExecuteScalarAsync());

                // Lưu danh sách sản phẩm NCC cung cấp
                if (dto.ProductIds?.Count > 0)
                    foreach (var pid in dto.ProductIds.Distinct())
                    {
                        await using var sp = new NpgsqlCommand("""
                            INSERT INTO public.supplier_products (supplier_id, product_id)
                            VALUES (@sid, @pid) ON CONFLICT DO NOTHING
                            """, conn, tx);
                        sp.Parameters.AddWithValue("sid", newId);
                        sp.Parameters.AddWithValue("pid", pid);
                        await sp.ExecuteNonQueryAsync();
                    }

                await tx.CommitAsync();
                return Ok(new { supplierId = newId, message = "Tạo nhà cung cấp thành công." });
            }
            catch { await tx.RollbackAsync(); throw; }
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUT /api/suppliers/{id}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPut("{id:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> Update(int id, [FromBody] SupplierDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.SupplierName))
            return BadRequest(new { message = "Tên nhà cung cấp không được để trống." });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                await using var cmd = new NpgsqlCommand("""
                    UPDATE public.suppliers
                    SET supplier_code = @code,
                        supplier_name = @name,
                        contact_name  = @contact,
                        phone         = @phone,
                        email         = @email,
                        address       = @address,
                        tax_code      = @tax,
                        note          = @note,
                        updated_at    = NOW()
                    WHERE supplier_id = @id AND company_id = @cid::uuid
                    """, conn, tx);
                cmd.Parameters.AddWithValue("id",      id);
                cmd.Parameters.AddWithValue("cid",     tenant.CompanyId!.Value.ToString());
                cmd.Parameters.AddWithValue("code",    (object?)dto.SupplierCode ?? DBNull.Value);
                cmd.Parameters.AddWithValue("name",    dto.SupplierName);
                cmd.Parameters.AddWithValue("contact", (object?)dto.ContactName  ?? DBNull.Value);
                cmd.Parameters.AddWithValue("phone",   (object?)dto.Phone        ?? DBNull.Value);
                cmd.Parameters.AddWithValue("email",   (object?)dto.Email        ?? DBNull.Value);
                cmd.Parameters.AddWithValue("address", (object?)dto.Address      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("tax",     (object?)dto.TaxCode      ?? DBNull.Value);
                cmd.Parameters.AddWithValue("note",    (object?)dto.Note         ?? DBNull.Value);

                var rows = await cmd.ExecuteNonQueryAsync();
                if (rows == 0) { await tx.RollbackAsync(); return NotFound(new { message = "Không tìm thấy nhà cung cấp." }); }

                // Cập nhật danh sách SP (nếu được gửi kèm)
                if (dto.ProductIds != null)
                {
                    await using var del = new NpgsqlCommand(
                        "DELETE FROM public.supplier_products WHERE supplier_id = @id",
                        conn, tx);
                    del.Parameters.AddWithValue("id", id);
                    await del.ExecuteNonQueryAsync();

                    foreach (var pid in dto.ProductIds.Distinct())
                    {
                        await using var sp = new NpgsqlCommand("""
                            INSERT INTO public.supplier_products (supplier_id, product_id)
                            VALUES (@sid, @pid) ON CONFLICT DO NOTHING
                            """, conn, tx);
                        sp.Parameters.AddWithValue("sid", id);
                        sp.Parameters.AddWithValue("pid", pid);
                        await sp.ExecuteNonQueryAsync();
                    }
                }

                await tx.CommitAsync();
                return Ok(new { message = "Cập nhật thành công." });
            }
            catch { await tx.RollbackAsync(); throw; }
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE /api/suppliers/{id}  (soft delete)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Không xóa cứng nếu đã có purchase order
            await using var chk = new NpgsqlCommand("""
                SELECT COUNT(*) FROM public.purchase_orders
                WHERE supplier_id = @id
                """, conn);
            chk.Parameters.AddWithValue("id", id);
            var cnt = Convert.ToInt64(await chk.ExecuteScalarAsync());
            if (cnt > 0)
                return BadRequest(new { message = "Nhà cung cấp đã có phiếu nhập hàng. Không thể xóa — chỉ có thể tắt hoạt động." });

            await using var cmd = new NpgsqlCommand("""
                UPDATE public.suppliers
                SET is_active = FALSE, updated_at = NOW()
                WHERE supplier_id = @id AND company_id = @cid::uuid
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());

            var rows = await cmd.ExecuteNonQueryAsync();
            if (rows == 0) return NotFound(new { message = "Không tìm thấy nhà cung cấp." });
            return Ok(new { message = "Đã tắt hoạt động nhà cung cấp." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}

public class SupplierDto
{
    public string?      SupplierCode { get; set; }
    public string       SupplierName { get; set; } = "";
    public string?      ContactName  { get; set; }
    public string?      Phone        { get; set; }
    public string?      Email        { get; set; }
    public string?      Address      { get; set; }
    public string?      TaxCode      { get; set; }
    public string?      Note         { get; set; }
    public List<int>?   ProductIds   { get; set; }  // null = không thay đổi SP; [] = xóa hết
}
