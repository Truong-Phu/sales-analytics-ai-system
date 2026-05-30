using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý phiếu nhập kho (Goods Receipts).
/// Khi tạo phiếu nhập kho:
///   - Tăng products.stock_quantity
///   - Ghi inventory_transactions (type = IMPORT_STOCK)
///   - Cập nhật purchase_order_items.received_quantity
///   - Cập nhật purchase_orders.status (PARTIALLY_RECEIVED / RECEIVED)
/// Tất cả trong một DB transaction.
/// </summary>
[ApiController]
[Route("api/goods-receipts")]
[Authorize]
public class GoodsReceiptsController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    private int UserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var v) ? v : 0;

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/goods-receipts
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetAll(
        [FromQuery] long? purchaseOrderId = null,
        [FromQuery] int   page     = 1,
        [FromQuery] int   pageSize = 20)
    {
        if (page     < 1) page     = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var where = new List<string> { "gr.company_id = @cid::uuid" };
            if (purchaseOrderId.HasValue) where.Add("gr.purchase_order_id = @poid");
            var wc = "WHERE " + string.Join(" AND ", where);

            await using var cntCmd = new NpgsqlCommand(
                $"SELECT COUNT(*) FROM public.goods_receipts gr {wc}", conn);
            cntCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            if (purchaseOrderId.HasValue) cntCmd.Parameters.AddWithValue("poid", purchaseOrderId.Value);
            var total = Convert.ToInt64(await cntCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand($"""
                SELECT gr.goods_receipt_id, gr.receipt_code,
                       gr.purchase_order_id, po.purchase_code,
                       s.supplier_name,
                       gr.total_quantity, gr.total_amount, gr.note,
                       gr.created_at, u.username AS created_by_name
                FROM public.goods_receipts gr
                JOIN public.purchase_orders po ON po.purchase_order_id = gr.purchase_order_id
                JOIN public.suppliers s ON s.supplier_id = po.supplier_id
                LEFT JOIN public.users u ON u.user_id = gr.created_by
                {wc}
                ORDER BY gr.created_at DESC
                LIMIT @lim OFFSET @off
                """, conn);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            if (purchaseOrderId.HasValue) cmd.Parameters.AddWithValue("poid", purchaseOrderId.Value);
            cmd.Parameters.AddWithValue("lim", pageSize);
            cmd.Parameters.AddWithValue("off", (page - 1) * pageSize);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                items.Add(new
                {
                    goodsReceiptId  = r.GetInt64(0),
                    receiptCode     = r.GetString(1),
                    purchaseOrderId = r.GetInt64(2),
                    purchaseCode    = r.GetString(3),
                    supplierName    = r.GetString(4),
                    totalQuantity   = r.GetInt32(5),
                    totalAmount     = r.GetDecimal(6),
                    note            = r.IsDBNull(7) ? null : r.GetString(7),
                    createdAt       = r.GetDateTime(8),
                    createdByName   = r.IsDBNull(9) ? null : r.GetString(9),
                });

            return Ok(new
            {
                total, page, pageSize,
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
    // GET /api/goods-receipts/{id}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("{id:long}")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetById(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT gr.goods_receipt_id, gr.receipt_code,
                       gr.purchase_order_id, po.purchase_code,
                       s.supplier_name,
                       gr.total_quantity, gr.total_amount, gr.note,
                       gr.created_at, u.username
                FROM public.goods_receipts gr
                JOIN public.purchase_orders po ON po.purchase_order_id = gr.purchase_order_id
                JOIN public.suppliers s ON s.supplier_id = po.supplier_id
                LEFT JOIN public.users u ON u.user_id = gr.created_by
                WHERE gr.goods_receipt_id = @id AND gr.company_id = @cid::uuid
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());

            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync())
                return NotFound(new { message = "Không tìm thấy phiếu nhập kho." });

            var gr = new
            {
                goodsReceiptId  = r.GetInt64(0),
                receiptCode     = r.GetString(1),
                purchaseOrderId = r.GetInt64(2),
                purchaseCode    = r.GetString(3),
                supplierName    = r.GetString(4),
                totalQuantity   = r.GetInt32(5),
                totalAmount     = r.GetDecimal(6),
                note            = r.IsDBNull(7) ? null : r.GetString(7),
                createdAt       = r.GetDateTime(8),
                createdByName   = r.IsDBNull(9) ? null : r.GetString(9),
            };
            await r.CloseAsync();

            await using var iCmd = new NpgsqlCommand("""
                SELECT gri.goods_receipt_item_id, gri.product_id, p.product_name,
                       gri.received_quantity, gri.import_price, gri.total_price
                FROM public.goods_receipt_items gri
                JOIN public.products p ON p.product_id = gri.product_id
                WHERE gri.goods_receipt_id = @id
                """, conn);
            iCmd.Parameters.AddWithValue("id", id);

            var its = new List<object>();
            await using var ir = await iCmd.ExecuteReaderAsync();
            while (await ir.ReadAsync())
                its.Add(new
                {
                    goodsReceiptItemId = ir.GetInt64(0),
                    productId          = ir.GetInt32(1),
                    productName        = ir.GetString(2),
                    receivedQuantity   = ir.GetInt32(3),
                    importPrice        = ir.GetDecimal(4),
                    totalPrice         = ir.GetDecimal(5),
                });

            return Ok(new { receipt = gr, items = its });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/goods-receipts  (nhập kho — core transaction)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse")]
    public async Task<IActionResult> Create([FromBody] CreateGoodsReceiptDto dto)
    {
        if (dto.PurchaseOrderId <= 0)
            return BadRequest(new { message = "Cần chỉ định phiếu nhập hàng." });
        if (dto.Items == null || dto.Items.Count == 0)
            return BadRequest(new { message = "Phiếu nhập kho phải có ít nhất 1 sản phẩm." });
        if (dto.Items.Any(i => i.ReceivedQuantity <= 0))
            return BadRequest(new { message = "Số lượng nhận phải > 0." });

        var cid = tenant.CompanyId!.Value.ToString();

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                // 1. Kiểm tra PO hợp lệ (APPROVED hoặc PARTIALLY_RECEIVED)
                await using var poChk = new NpgsqlCommand("""
                    SELECT status FROM public.purchase_orders
                    WHERE purchase_order_id = @poid AND company_id = @cid::uuid
                    """, conn, tx);
                poChk.Parameters.AddWithValue("poid", dto.PurchaseOrderId);
                poChk.Parameters.AddWithValue("cid",  cid);
                var poStatus = (string?)await poChk.ExecuteScalarAsync();

                if (poStatus == null)
                    return NotFound(new { message = "Không tìm thấy phiếu nhập hàng." });
                if (poStatus is not ("APPROVED" or "PARTIALLY_RECEIVED"))
                    return BadRequest(new { message = $"Phiếu nhập phải ở trạng thái APPROVED hoặc PARTIALLY_RECEIVED. Hiện tại: {poStatus}." });

                // 2. Validate từng item: không được vượt số lượng còn lại
                foreach (var item in dto.Items)
                {
                    await using var itemChk = new NpgsqlCommand("""
                        SELECT quantity - received_quantity
                        FROM public.purchase_order_items
                        WHERE purchase_order_id = @poid AND product_id = @pid
                        """, conn, tx);
                    itemChk.Parameters.AddWithValue("poid", dto.PurchaseOrderId);
                    itemChk.Parameters.AddWithValue("pid",  item.ProductId);
                    var remaining = (int?)await itemChk.ExecuteScalarAsync();

                    if (remaining == null)
                        return BadRequest(new { message = $"Sản phẩm ID {item.ProductId} không có trong phiếu nhập hàng." });
                    if (item.ReceivedQuantity > remaining.Value)
                        return BadRequest(new
                        {
                            message = $"Sản phẩm ID {item.ProductId}: số lượng nhận ({item.ReceivedQuantity}) vượt quá số lượng còn lại ({remaining.Value})."
                        });
                }

                // 3. Tạo goods_receipt header
                var code = $"GR-{DateTime.Now:yyyyMMdd-HHmmss}";
                var totQty = dto.Items.Sum(i => i.ReceivedQuantity);
                var totAmt = dto.Items.Sum(i => i.ReceivedQuantity * i.ImportPrice);

                await using var grCmd = new NpgsqlCommand("""
                    INSERT INTO public.goods_receipts
                        (company_id, purchase_order_id, receipt_code,
                         total_quantity, total_amount, note, created_by, created_at)
                    VALUES
                        (@cid::uuid, @poid, @code, @qty, @amt, @note, @uid, NOW())
                    RETURNING goods_receipt_id
                    """, conn, tx);
                grCmd.Parameters.AddWithValue("cid",  cid);
                grCmd.Parameters.AddWithValue("poid", dto.PurchaseOrderId);
                grCmd.Parameters.AddWithValue("code", code);
                grCmd.Parameters.AddWithValue("qty",  totQty);
                grCmd.Parameters.AddWithValue("amt",  totAmt);
                grCmd.Parameters.AddWithValue("note", (object?)dto.Note ?? DBNull.Value);
                grCmd.Parameters.AddWithValue("uid",  UserId > 0 ? (object)UserId : DBNull.Value);
                var grId = Convert.ToInt64(await grCmd.ExecuteScalarAsync());

                // 4–7. Mỗi item: insert gri + update stock + log inventory_transaction
                foreach (var item in dto.Items)
                {
                    // Lấy purchase_order_item_id + variation_id từ PO item
                    await using var poiCmd = new NpgsqlCommand("""
                        SELECT purchase_order_item_id, import_price, variation_id
                        FROM public.purchase_order_items
                        WHERE purchase_order_id = @poid AND product_id = @pid
                        """, conn, tx);
                    poiCmd.Parameters.AddWithValue("poid", dto.PurchaseOrderId);
                    poiCmd.Parameters.AddWithValue("pid",  item.ProductId);
                    await using var poiR = await poiCmd.ExecuteReaderAsync();
                    await poiR.ReadAsync();
                    var poiId       = poiR.GetInt64(0);
                    var poiPrice    = poiR.GetDecimal(1);
                    var variationId = poiR.IsDBNull(2) ? (int?)null : poiR.GetInt32(2);
                    await poiR.CloseAsync();

                    var usedPrice = item.ImportPrice > 0 ? item.ImportPrice : poiPrice;

                    // Insert goods_receipt_item (kèm variation_id nếu có)
                    await using var griCmd = new NpgsqlCommand("""
                        INSERT INTO public.goods_receipt_items
                            (goods_receipt_id, purchase_order_item_id, product_id, variation_id,
                             received_quantity, import_price, total_price)
                        VALUES (@gr, @poi, @pid, @vid, @qty, @price, @ttl)
                        """, conn, tx);
                    griCmd.Parameters.AddWithValue("gr",    grId);
                    griCmd.Parameters.AddWithValue("poi",   poiId);
                    griCmd.Parameters.AddWithValue("pid",   item.ProductId);
                    griCmd.Parameters.AddWithValue("vid",   variationId.HasValue ? (object)variationId.Value : DBNull.Value);
                    griCmd.Parameters.AddWithValue("qty",   item.ReceivedQuantity);
                    griCmd.Parameters.AddWithValue("price", usedPrice);
                    griCmd.Parameters.AddWithValue("ttl",   item.ReceivedQuantity * usedPrice);
                    await griCmd.ExecuteNonQueryAsync();

                    // Tăng stock sản phẩm + ghi inventory_transaction
                    await using var stockCmd = new NpgsqlCommand("""
                        WITH upd AS (
                            UPDATE public.products
                            SET stock_quantity = stock_quantity + @qty, updated_at = NOW()
                            WHERE product_id = @pid AND company_id = @cid::uuid
                            RETURNING product_id, stock_quantity AS after_stock
                        )
                        INSERT INTO public.inventory_transactions
                            (company_id, product_id, transaction_type, quantity_change,
                             before_stock, after_stock, reference_type, reference_id, note, created_by)
                        SELECT @cid::uuid, product_id, 'IMPORT_STOCK', @qty,
                               after_stock - @qty, after_stock,
                               'goods_receipt', @grId, 'Nhap kho tu phieu nhap hang', @uid
                        FROM upd
                        """, conn, tx);
                    stockCmd.Parameters.AddWithValue("qty",  item.ReceivedQuantity);
                    stockCmd.Parameters.AddWithValue("pid",  item.ProductId);
                    stockCmd.Parameters.AddWithValue("cid",  cid);
                    stockCmd.Parameters.AddWithValue("grId", grId);
                    stockCmd.Parameters.AddWithValue("uid",  UserId > 0 ? (object)UserId : DBNull.Value);
                    await stockCmd.ExecuteNonQueryAsync();

                    // Tăng stock biến thể nếu PO item có variation_id
                    if (variationId.HasValue)
                    {
                        await using var varStockCmd = new NpgsqlCommand("""
                            UPDATE public.product_variations
                            SET stock_quantity = stock_quantity + @qty, updated_at = NOW()
                            WHERE id = @vid
                            """, conn, tx);
                        varStockCmd.Parameters.AddWithValue("qty", item.ReceivedQuantity);
                        varStockCmd.Parameters.AddWithValue("vid", variationId.Value);
                        await varStockCmd.ExecuteNonQueryAsync();
                    }

                    // Cập nhật received_quantity trên purchase_order_items
                    await using var updPoi = new NpgsqlCommand("""
                        UPDATE public.purchase_order_items
                        SET received_quantity = received_quantity + @qty
                        WHERE purchase_order_item_id = @poi
                        """, conn, tx);
                    updPoi.Parameters.AddWithValue("qty", item.ReceivedQuantity);
                    updPoi.Parameters.AddWithValue("poi", poiId);
                    await updPoi.ExecuteNonQueryAsync();
                }

                // 8. Cập nhật status PO (PARTIALLY_RECEIVED / RECEIVED)
                await using var statusCmd = new NpgsqlCommand("""
                    UPDATE public.purchase_orders po
                    SET status = CASE
                        WHEN NOT EXISTS (
                            SELECT 1 FROM public.purchase_order_items poi2
                            WHERE poi2.purchase_order_id = po.purchase_order_id
                              AND poi2.received_quantity < poi2.quantity
                        ) THEN 'RECEIVED'
                        ELSE 'PARTIALLY_RECEIVED'
                    END,
                    updated_at = NOW()
                    WHERE po.purchase_order_id = @poid
                    """, conn, tx);
                statusCmd.Parameters.AddWithValue("poid", dto.PurchaseOrderId);
                await statusCmd.ExecuteNonQueryAsync();

                await tx.CommitAsync();

                return Ok(new
                {
                    goodsReceiptId = grId,
                    receiptCode    = code,
                    message        = "Nhập kho thành công. Tồn kho đã được cập nhật.",
                });
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public class CreateGoodsReceiptDto
{
    public long    PurchaseOrderId { get; set; }
    public string? Note            { get; set; }
    public List<GoodsReceiptItemDto> Items { get; set; } = [];
}

public class GoodsReceiptItemDto
{
    public int     ProductId        { get; set; }
    public int     ReceivedQuantity { get; set; }
    public decimal ImportPrice      { get; set; }
}
