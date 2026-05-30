using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/stock-adjustments")]
[Authorize(Roles = "Owner,Manager,Staff_Warehouse")]
public class StockAdjustmentsController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    private string Cid => tenant.CompanyId!.Value.ToString();

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/stock-adjustments
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int  page     = 1,
        [FromQuery] int  pageSize = 20,
        [FromQuery] int? productId = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var where = productId.HasValue
                ? "AND sa.product_id = @pid"
                : "";

            await using var countCmd = new NpgsqlCommand($"""
                SELECT COUNT(*) FROM public.stock_adjustments sa
                WHERE sa.company_id = @cid::uuid {where}
                """, conn);
            countCmd.Parameters.AddWithValue("cid", Cid);
            if (productId.HasValue) countCmd.Parameters.AddWithValue("pid", productId.Value);
            var total = (long)(await countCmd.ExecuteScalarAsync())!;

            await using var cmd = new NpgsqlCommand($"""
                SELECT
                    sa.stock_adjustment_id,
                    sa.product_id,
                    p.product_name,
                    p.sku,
                    sa.old_quantity,
                    sa.new_quantity,
                    sa.difference,
                    sa.reason,
                    sa.note,
                    sa.created_at,
                    u.full_name AS created_by_name,
                    sa.variation_id,
                    pv.variation_name,
                    pv.attribute_color,
                    pv.attribute_size,
                    pv.sku AS variation_sku
                FROM public.stock_adjustments sa
                JOIN public.products p ON p.product_id = sa.product_id
                LEFT JOIN public.users u ON u.user_id = sa.created_by
                LEFT JOIN public.product_variations pv ON pv.id = sa.variation_id
                WHERE sa.company_id = @cid::uuid {where}
                ORDER BY sa.created_at DESC
                LIMIT @lim OFFSET @off
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);
            cmd.Parameters.AddWithValue("lim", pageSize);
            cmd.Parameters.AddWithValue("off", (page - 1) * pageSize);
            if (productId.HasValue) cmd.Parameters.AddWithValue("pid", productId.Value);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                items.Add(new
                {
                    stockAdjustmentId = r.GetInt64(0),
                    productId         = r.GetInt32(1),
                    productName       = r.GetString(2),
                    sku               = r.IsDBNull(3)  ? null : r.GetString(3),
                    oldQuantity       = r.GetInt32(4),
                    newQuantity       = r.GetInt32(5),
                    difference        = r.GetInt32(6),
                    reason            = r.GetString(7),
                    note              = r.IsDBNull(8)  ? null : r.GetString(8),
                    createdAt         = r.GetDateTime(9),
                    createdByName     = r.IsDBNull(10) ? null : r.GetString(10),
                    variationId       = r.IsDBNull(11) ? (int?)null : r.GetInt32(11),
                    variationName     = r.IsDBNull(12) ? null : r.GetString(12),
                    color             = r.IsDBNull(13) ? null : r.GetString(13),
                    size              = r.IsDBNull(14) ? null : r.GetString(14),
                    variationSku      = r.IsDBNull(15) ? null : r.GetString(15),
                });

            return Ok(new { total, page, pageSize, items });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/stock-adjustments/{id}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("{id:long}")]
    public async Task<IActionResult> GetById(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT
                    sa.stock_adjustment_id,
                    sa.product_id,
                    p.product_name,
                    p.sku,
                    sa.old_quantity,
                    sa.new_quantity,
                    sa.difference,
                    sa.reason,
                    sa.note,
                    sa.created_at,
                    u.full_name AS created_by_name
                FROM public.stock_adjustments sa
                JOIN public.products p ON p.product_id = sa.product_id
                LEFT JOIN public.users u ON u.user_id = sa.created_by
                WHERE sa.stock_adjustment_id = @id AND sa.company_id = @cid::uuid
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", Cid);

            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync())
                return NotFound(new { message = "Không tìm thấy phiếu chỉnh kho." });

            return Ok(new
            {
                stockAdjustmentId = r.GetInt64(0),
                productId         = r.GetInt32(1),
                productName       = r.GetString(2),
                sku               = r.IsDBNull(3)  ? null : r.GetString(3),
                oldQuantity       = r.GetInt32(4),
                newQuantity       = r.GetInt32(5),
                difference        = r.GetInt32(6),
                reason            = r.GetString(7),
                note              = r.IsDBNull(8)  ? null : r.GetString(8),
                createdAt         = r.GetDateTime(9),
                createdByName     = r.IsDBNull(10) ? null : r.GetString(10),
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/stock-adjustments
    // Hỗ trợ 2 chế độ:
    //   VariationId = null  → chỉnh kho sản phẩm tổng (không có biến thể)
    //   VariationId = X     → chỉnh kho biến thể cụ thể (size/màu) + sync tổng
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStockAdjustmentDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        if (dto.NewQuantity < 0)
            return BadRequest(new { message = "Số lượng mới không được âm." });

        var uid = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uidVal)
            ? (object)uidVal : DBNull.Value;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                int oldQty; int diff;

                if (dto.VariationId.HasValue)
                {
                    // ── Chỉnh kho biến thể (size/màu cụ thể) ──────────────────
                    // Lock variation row để tránh race condition
                    await using var varLockCmd = new NpgsqlCommand("""
                        SELECT pv.stock_quantity
                        FROM public.product_variations pv
                        JOIN public.products p ON p.product_id = pv.product_id
                        WHERE pv.id = @vid AND p.company_id = @cid::uuid AND pv.is_active = TRUE
                        FOR UPDATE OF pv
                        """, conn, tx);
                    varLockCmd.Parameters.AddWithValue("vid", dto.VariationId.Value);
                    varLockCmd.Parameters.AddWithValue("cid", Cid);

                    var varScalar = await varLockCmd.ExecuteScalarAsync();
                    if (varScalar is null)
                    {
                        await tx.RollbackAsync();
                        return NotFound(new { message = "Không tìm thấy biến thể sản phẩm." });
                    }

                    oldQty = (int)varScalar;
                    diff   = dto.NewQuantity - oldQty;

                    if (diff == 0)
                    {
                        await tx.RollbackAsync();
                        return BadRequest(new { message = "Số lượng không thay đổi — không cần tạo phiếu chỉnh kho." });
                    }

                    // Cập nhật tồn kho biến thể
                    await using var varUpdCmd = new NpgsqlCommand("""
                        UPDATE public.product_variations
                        SET stock_quantity = @newQty, updated_at = NOW()
                        WHERE id = @vid
                        """, conn, tx);
                    varUpdCmd.Parameters.AddWithValue("newQty", dto.NewQuantity);
                    varUpdCmd.Parameters.AddWithValue("vid",    dto.VariationId.Value);
                    await varUpdCmd.ExecuteNonQueryAsync();

                    // Sync tổng kho sản phẩm theo difference (giữ nhất quán)
                    await using var prodUpdCmd = new NpgsqlCommand("""
                        UPDATE public.products
                        SET stock_quantity = GREATEST(0, stock_quantity + @diff), updated_at = NOW()
                        WHERE product_id = @pid AND company_id = @cid::uuid
                        """, conn, tx);
                    prodUpdCmd.Parameters.AddWithValue("diff", diff);
                    prodUpdCmd.Parameters.AddWithValue("pid",  dto.ProductId);
                    prodUpdCmd.Parameters.AddWithValue("cid",  Cid);
                    await prodUpdCmd.ExecuteNonQueryAsync();
                }
                else
                {
                    // ── Chỉnh kho sản phẩm tổng (không có biến thể) ───────────
                    await using var lockCmd = new NpgsqlCommand("""
                        SELECT stock_quantity
                        FROM public.products
                        WHERE product_id = @pid AND company_id = @cid::uuid AND is_active = TRUE
                        FOR UPDATE
                        """, conn, tx);
                    lockCmd.Parameters.AddWithValue("pid", dto.ProductId);
                    lockCmd.Parameters.AddWithValue("cid", Cid);

                    var scalar = await lockCmd.ExecuteScalarAsync();
                    if (scalar is null)
                    {
                        await tx.RollbackAsync();
                        return NotFound(new { message = "Không tìm thấy sản phẩm trong công ty này." });
                    }

                    oldQty = (int)scalar;
                    diff   = dto.NewQuantity - oldQty;

                    if (diff == 0)
                    {
                        await tx.RollbackAsync();
                        return BadRequest(new { message = "Số lượng không thay đổi — không cần tạo phiếu chỉnh kho." });
                    }

                    await using var updCmd = new NpgsqlCommand("""
                        UPDATE public.products
                        SET stock_quantity = @newQty, updated_at = NOW()
                        WHERE product_id = @pid AND company_id = @cid::uuid
                        """, conn, tx);
                    updCmd.Parameters.AddWithValue("newQty", dto.NewQuantity);
                    updCmd.Parameters.AddWithValue("pid",    dto.ProductId);
                    updCmd.Parameters.AddWithValue("cid",    Cid);
                    await updCmd.ExecuteNonQueryAsync();
                }

                var txType = diff > 0 ? "MANUAL_ADJUST_UP" : "MANUAL_ADJUST_DOWN";

                // Insert stock_adjustments (kèm variation_id nếu có)
                await using var saCmd = new NpgsqlCommand("""
                    INSERT INTO public.stock_adjustments
                        (company_id, product_id, variation_id, old_quantity, new_quantity,
                         difference, reason, note, created_by)
                    VALUES (@cid::uuid, @pid, @vid, @oldQty, @newQty, @diff, @reason, @note, @uid)
                    RETURNING stock_adjustment_id
                    """, conn, tx);
                saCmd.Parameters.AddWithValue("cid",    Cid);
                saCmd.Parameters.AddWithValue("pid",    dto.ProductId);
                saCmd.Parameters.AddWithValue("vid",    dto.VariationId.HasValue ? (object)dto.VariationId.Value : DBNull.Value);
                saCmd.Parameters.AddWithValue("oldQty", oldQty);
                saCmd.Parameters.AddWithValue("newQty", dto.NewQuantity);
                saCmd.Parameters.AddWithValue("diff",   diff);
                saCmd.Parameters.AddWithValue("reason", dto.Reason);
                saCmd.Parameters.AddWithValue("note",   string.IsNullOrWhiteSpace(dto.Note) ? (object)DBNull.Value : dto.Note);
                saCmd.Parameters.AddWithValue("uid",    uid);
                var saId = (long)(await saCmd.ExecuteScalarAsync())!;

                // Insert inventory_transaction
                await using var itCmd = new NpgsqlCommand("""
                    INSERT INTO public.inventory_transactions
                        (company_id, product_id, transaction_type, quantity_change,
                         before_stock, after_stock, reference_type, reference_id, note, created_by)
                    VALUES (@cid::uuid, @pid, @txType, @diff,
                            @before, @after,
                            'stock_adjustment', @saId, @itNote, @uid)
                    """, conn, tx);
                itCmd.Parameters.AddWithValue("cid",    Cid);
                itCmd.Parameters.AddWithValue("pid",    dto.ProductId);
                itCmd.Parameters.AddWithValue("txType", txType);
                itCmd.Parameters.AddWithValue("diff",   diff);
                itCmd.Parameters.AddWithValue("before", oldQty);
                itCmd.Parameters.AddWithValue("after",  dto.NewQuantity);
                itCmd.Parameters.AddWithValue("saId",   saId);
                itCmd.Parameters.AddWithValue("itNote", $"Chinh kho thu cong: {dto.Reason}");
                itCmd.Parameters.AddWithValue("uid",    uid);
                await itCmd.ExecuteNonQueryAsync();

                await tx.CommitAsync();

                var scope = dto.VariationId.HasValue ? "biến thể" : "sản phẩm";
                return Ok(new
                {
                    stockAdjustmentId = saId,
                    productId         = dto.ProductId,
                    variationId       = dto.VariationId,
                    oldQuantity       = oldQty,
                    newQuantity       = dto.NewQuantity,
                    difference        = diff,
                    txType,
                    message = $"Đã chỉnh kho {scope}: {(diff > 0 ? "+" : "")}{diff} đơn vị.",
                });
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}

public record CreateStockAdjustmentDto(
    [Required] int ProductId,
    int? VariationId,                                          // null = chỉnh kho tổng; có = chỉnh kho biến thể
    [Required, Range(0, int.MaxValue)] int NewQuantity,
    [Required, MinLength(1), MaxLength(255)] string Reason,
    string? Note = null
);
