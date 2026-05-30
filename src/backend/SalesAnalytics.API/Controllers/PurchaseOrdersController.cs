using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý phiếu nhập hàng (Purchase Orders).
/// GET/POST/PUT /api/purchase-orders
/// POST /api/purchase-orders/{id}/submit|approve|cancel
/// </summary>
[ApiController]
[Route("api/purchase-orders")]
[Authorize]
public class PurchaseOrdersController(
    IConfiguration cfg,
    ITenantContext tenant,
    IEmailService emailService) : ControllerBase
{
    private readonly string _connStr   = cfg.GetConnectionString("Default")!;
    private readonly string _baseUrl   = cfg["AppBaseUrl"] ?? "http://localhost:5173";


    private int UserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var v) ? v : 0;

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/purchase-orders
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? status   = null,
        [FromQuery] int?    supplier = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 20)
    {
        if (page     < 1) page     = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var where = new List<string> { "po.company_id = @cid::uuid" };
            if (!string.IsNullOrWhiteSpace(status))  where.Add("po.status = @status");
            if (supplier.HasValue)                   where.Add("po.supplier_id = @sup");
            var wc = "WHERE " + string.Join(" AND ", where);

            await using var cntCmd = new NpgsqlCommand(
                $"SELECT COUNT(*) FROM public.purchase_orders po {wc}", conn);
            cntCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            if (!string.IsNullOrWhiteSpace(status)) cntCmd.Parameters.AddWithValue("status", status);
            if (supplier.HasValue)                  cntCmd.Parameters.AddWithValue("sup",    supplier.Value);
            var total = Convert.ToInt64(await cntCmd.ExecuteScalarAsync());

            await using var cmd = new NpgsqlCommand($"""
                SELECT po.purchase_order_id, po.purchase_code, po.status,
                       po.total_amount, po.note,
                       s.supplier_id, s.supplier_name,
                       po.created_at, po.updated_at, po.approved_at, po.cancelled_at,
                       u1.username AS created_by_name, u2.username AS approved_by_name
                FROM public.purchase_orders po
                JOIN public.suppliers s ON s.supplier_id = po.supplier_id
                LEFT JOIN public.users u1 ON u1.user_id = po.created_by
                LEFT JOIN public.users u2 ON u2.user_id = po.approved_by
                {wc}
                ORDER BY po.created_at DESC
                LIMIT @lim OFFSET @off
                """, conn);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            if (!string.IsNullOrWhiteSpace(status)) cmd.Parameters.AddWithValue("status", status);
            if (supplier.HasValue)                  cmd.Parameters.AddWithValue("sup",    supplier.Value);
            cmd.Parameters.AddWithValue("lim", pageSize);
            cmd.Parameters.AddWithValue("off", (page - 1) * pageSize);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                items.Add(new
                {
                    purchaseOrderId  = r.GetInt64(0),
                    purchaseCode     = r.GetString(1),
                    status           = r.GetString(2),
                    totalAmount      = r.GetDecimal(3),
                    note             = r.IsDBNull(4) ? null : r.GetString(4),
                    supplierId       = r.GetInt32(5),
                    supplierName     = r.GetString(6),
                    createdAt        = r.GetDateTime(7),
                    updatedAt        = r.IsDBNull(8) ? (DateTime?)null : r.GetDateTime(8),
                    approvedAt       = r.IsDBNull(9) ? (DateTime?)null : r.GetDateTime(9),
                    cancelledAt      = r.IsDBNull(10)? (DateTime?)null : r.GetDateTime(10),
                    createdByName    = r.IsDBNull(11)? null : r.GetString(11),
                    approvedByName   = r.IsDBNull(12)? null : r.GetString(12),
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
    // GET /api/purchase-orders/{id}
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
                SELECT po.purchase_order_id, po.purchase_code, po.status,
                       po.total_amount, po.note,
                       s.supplier_id, s.supplier_name,
                       po.created_at, po.updated_at, po.approved_at, po.cancelled_at,
                       u1.username AS created_by_name, u2.username AS approved_by_name
                FROM public.purchase_orders po
                JOIN public.suppliers s ON s.supplier_id = po.supplier_id
                LEFT JOIN public.users u1 ON u1.user_id = po.created_by
                LEFT JOIN public.users u2 ON u2.user_id = po.approved_by
                WHERE po.purchase_order_id = @id AND po.company_id = @cid::uuid
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());

            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync())
                return NotFound(new { message = "Không tìm thấy phiếu nhập." });

            var po = new
            {
                purchaseOrderId = r.GetInt64(0),
                purchaseCode    = r.GetString(1),
                status          = r.GetString(2),
                totalAmount     = r.GetDecimal(3),
                note            = r.IsDBNull(4) ? null : r.GetString(4),
                supplierId      = r.GetInt32(5),
                supplierName    = r.GetString(6),
                createdAt       = r.GetDateTime(7),
                updatedAt       = r.IsDBNull(8) ? (DateTime?)null : r.GetDateTime(8),
                approvedAt      = r.IsDBNull(9) ? (DateTime?)null : r.GetDateTime(9),
                cancelledAt     = r.IsDBNull(10)? (DateTime?)null : r.GetDateTime(10),
                createdByName   = r.IsDBNull(11)? null : r.GetString(11),
                approvedByName  = r.IsDBNull(12)? null : r.GetString(12),
            };
            await r.CloseAsync();

            // Lấy items
            await using var iCmd = new NpgsqlCommand("""
                SELECT poi.purchase_order_item_id, poi.product_id, p.product_name,
                       poi.quantity, poi.received_quantity, poi.import_price, poi.total_price,
                       poi.variation_id, pv.variation_name, pv.attribute_color, pv.attribute_size, pv.sku
                FROM public.purchase_order_items poi
                JOIN public.products p ON p.product_id = poi.product_id
                LEFT JOIN public.product_variations pv ON pv.id = poi.variation_id
                WHERE poi.purchase_order_id = @id
                ORDER BY poi.purchase_order_item_id
                """, conn);
            iCmd.Parameters.AddWithValue("id", id);

            var its = new List<object>();
            await using var ir = await iCmd.ExecuteReaderAsync();
            while (await ir.ReadAsync())
                its.Add(new
                {
                    purchaseOrderItemId = ir.GetInt64(0),
                    productId           = ir.GetInt32(1),
                    productName         = ir.GetString(2),
                    quantity            = ir.GetInt32(3),
                    receivedQuantity    = ir.GetInt32(4),
                    remainingQuantity   = ir.GetInt32(3) - ir.GetInt32(4),
                    importPrice         = ir.GetDecimal(5),
                    totalPrice          = ir.GetDecimal(6),
                    variationId         = ir.IsDBNull(7)  ? (int?)null    : ir.GetInt32(7),
                    variationName       = ir.IsDBNull(8)  ? null          : ir.GetString(8),
                    color               = ir.IsDBNull(9)  ? null          : ir.GetString(9),
                    size                = ir.IsDBNull(10) ? null          : ir.GetString(10),
                    variationSku        = ir.IsDBNull(11) ? null          : ir.GetString(11),
                });

            return Ok(new { order = po, items = its });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/purchase-orders  (tạo APPROVED + gửi email thông báo NCC)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse")]
    public async Task<IActionResult> Create([FromBody] CreatePurchaseOrderDto dto)
    {
        if (dto.SupplierId <= 0)
            return BadRequest(new { message = "Cần chọn nhà cung cấp." });
        if (dto.Items == null || dto.Items.Count == 0)
            return BadRequest(new { message = "Phiếu nhập phải có ít nhất 1 sản phẩm." });
        if (dto.Items.Any(i => i.Quantity <= 0))
            return BadRequest(new { message = "Số lượng sản phẩm phải > 0." });

        var cid = tenant.CompanyId!.Value.ToString();

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Lấy thông tin NCC + tên công ty để gửi email
            await using var infoCmd = new NpgsqlCommand("""
                SELECT s.supplier_name, s.email, c.name
                FROM public.suppliers s
                JOIN public.companies c ON c.id = s.company_id
                WHERE s.supplier_id = @sid AND s.company_id = @cid::uuid
                """, conn);
            infoCmd.Parameters.AddWithValue("sid", dto.SupplierId);
            infoCmd.Parameters.AddWithValue("cid", cid);
            await using var infoR = await infoCmd.ExecuteReaderAsync();
            string supplierName = "", supplierEmail = "", companyName = "Công ty";
            if (await infoR.ReadAsync())
            {
                supplierName  = infoR.GetString(0);
                supplierEmail = infoR.IsDBNull(1) ? "" : infoR.GetString(1);
                companyName   = infoR.IsDBNull(2) ? "Công ty" : infoR.GetString(2);
            }
            await infoR.CloseAsync();

            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                var code  = $"PO-{DateTime.Now:yyyyMMdd-HHmmss}";
                var total = dto.Items.Sum(i => i.Quantity * i.ImportPrice);
                var token = Guid.NewGuid();

                await using var poCmd = new NpgsqlCommand("""
                    INSERT INTO public.purchase_orders
                        (company_id, supplier_id, purchase_code, status, total_amount, note,
                         created_by, created_at, confirmation_token)
                    VALUES
                        (@cid::uuid, @sup, @code, 'PENDING', @total, @note,
                         @uid, NOW(), @token)
                    RETURNING purchase_order_id
                    """, conn, tx);
                poCmd.Parameters.AddWithValue("cid",   cid);
                poCmd.Parameters.AddWithValue("sup",   dto.SupplierId);
                poCmd.Parameters.AddWithValue("code",  code);
                poCmd.Parameters.AddWithValue("total", total);
                poCmd.Parameters.AddWithValue("note",  (object?)dto.Note ?? DBNull.Value);
                poCmd.Parameters.AddWithValue("uid",   UserId > 0 ? (object)UserId : DBNull.Value);
                poCmd.Parameters.AddWithValue("token", token);
                var poId = Convert.ToInt64(await poCmd.ExecuteScalarAsync());

                foreach (var item in dto.Items)
                {
                    await using var iCmd = new NpgsqlCommand("""
                        INSERT INTO public.purchase_order_items
                            (purchase_order_id, product_id, variation_id, quantity,
                             received_quantity, import_price, total_price)
                        VALUES (@po, @pid, @vid, @qty, 0, @price, @total)
                        """, conn, tx);
                    iCmd.Parameters.AddWithValue("po",    poId);
                    iCmd.Parameters.AddWithValue("pid",   item.ProductId);
                    iCmd.Parameters.AddWithValue("vid",   item.VariationId.HasValue ? (object)item.VariationId.Value : DBNull.Value);
                    iCmd.Parameters.AddWithValue("qty",   item.Quantity);
                    iCmd.Parameters.AddWithValue("price", item.ImportPrice);
                    iCmd.Parameters.AddWithValue("total", item.Quantity * item.ImportPrice);
                    await iCmd.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();

                // Gửi email + link duyệt cho NCC (fire-and-forget)
                if (!string.IsNullOrEmpty(supplierEmail))
                {
                    // Lấy tên sản phẩm thật từ DB thay vì dùng ID
                    var pidList  = dto.Items.Select(i => i.ProductId).Distinct().ToList();
                    var nameMap  = new Dictionary<int, string>();
                    await using var pnCmd = new NpgsqlConnection(_connStr);
                    await pnCmd.OpenAsync();
                    await using var pnQ = new NpgsqlCommand(
                        $"SELECT product_id, product_name FROM public.products WHERE product_id = ANY(@ids)",
                        pnCmd);
                    pnQ.Parameters.AddWithValue("ids", pidList.ToArray());
                    await using var pnR = await pnQ.ExecuteReaderAsync();
                    while (await pnR.ReadAsync())
                        nameMap[pnR.GetInt32(0)] = pnR.GetString(1);

                    var poItems     = dto.Items
                        .Select(i => (
                            ProductName: nameMap.GetValueOrDefault(i.ProductId, $"Sản phẩm #{i.ProductId}"),
                            Qty:   i.Quantity,
                            Price: i.ImportPrice))
                        .ToList();
                    var approvalUrl = $"{_baseUrl}/api/purchase-orders/supplier-approve/{token}";
                    _ = emailService.SendPurchaseOrderAsync(
                        supplierEmail, supplierName, code, total, poItems, companyName, approvalUrl);
                }

                var emailNote = string.IsNullOrEmpty(supplierEmail)
                    ? " (NCC chưa có email — không gửi được thông báo)"
                    : $" Email + link duyệt đã gửi đến {supplierEmail}.";

                return Ok(new
                {
                    purchaseOrderId = poId,
                    purchaseCode    = code,
                    status          = "PENDING",
                    message         = $"Đã tạo phiếu nhập, chờ NCC duyệt.{emailNote}",
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

    // ─────────────────────────────────────────────────────────────────────────
    // PUT /api/purchase-orders/{id}  (chỉ sửa khi DRAFT)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPut("{id:long}")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse")]
    public async Task<IActionResult> Update(long id, [FromBody] CreatePurchaseOrderDto dto)
    {
        if (dto.Items == null || dto.Items.Count == 0)
            return BadRequest(new { message = "Phiếu nhập phải có ít nhất 1 sản phẩm." });
        if (dto.Items.Any(i => i.Quantity <= 0))
            return BadRequest(new { message = "Số lượng sản phẩm phải > 0." });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var tx = await conn.BeginTransactionAsync();
            try
            {
                // Kiểm tra trạng thái
                await using var chk = new NpgsqlCommand("""
                    SELECT status FROM public.purchase_orders
                    WHERE purchase_order_id = @id AND company_id = @cid::uuid
                    """, conn, tx);
                chk.Parameters.AddWithValue("id",  id);
                chk.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                var status = (string?)await chk.ExecuteScalarAsync();

                if (status == null) return NotFound(new { message = "Không tìm thấy phiếu nhập." });
                if (status != "DRAFT") return BadRequest(new { message = "Chỉ có thể sửa phiếu ở trạng thái DRAFT." });

                var total = dto.Items.Sum(i => i.Quantity * i.ImportPrice);

                await using var upd = new NpgsqlCommand("""
                    UPDATE public.purchase_orders
                    SET supplier_id = @sup, note = @note, total_amount = @total, updated_at = NOW()
                    WHERE purchase_order_id = @id
                    """, conn, tx);
                upd.Parameters.AddWithValue("id",    id);
                upd.Parameters.AddWithValue("sup",   dto.SupplierId);
                upd.Parameters.AddWithValue("note",  (object?)dto.Note ?? DBNull.Value);
                upd.Parameters.AddWithValue("total", total);
                await upd.ExecuteNonQueryAsync();

                // Xóa items cũ, thêm lại
                await using var del = new NpgsqlCommand(
                    "DELETE FROM public.purchase_order_items WHERE purchase_order_id = @id",
                    conn, tx);
                del.Parameters.AddWithValue("id", id);
                await del.ExecuteNonQueryAsync();

                foreach (var item in dto.Items)
                {
                    await using var iCmd = new NpgsqlCommand("""
                        INSERT INTO public.purchase_order_items
                            (purchase_order_id, product_id, quantity, received_quantity,
                             import_price, total_price)
                        VALUES (@po, @pid, @qty, 0, @price, @ttl)
                        """, conn, tx);
                    iCmd.Parameters.AddWithValue("po",  id);
                    iCmd.Parameters.AddWithValue("pid", item.ProductId);
                    iCmd.Parameters.AddWithValue("qty", item.Quantity);
                    iCmd.Parameters.AddWithValue("price", item.ImportPrice);
                    iCmd.Parameters.AddWithValue("ttl", item.Quantity * item.ImportPrice);
                    await iCmd.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
                return Ok(new { message = "Cập nhật phiếu nhập thành công." });
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

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/purchase-orders/{id}/submit  (DRAFT → PENDING + email thông báo NCC)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("{id:long}/submit")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse")]
    public async Task<IActionResult> Submit(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Lấy PO + thông tin NCC
            await using var infoCmd = new NpgsqlCommand("""
                SELECT po.status, po.purchase_code, po.total_amount,
                       s.supplier_name, s.email AS supplier_email,
                       c.name AS company_name
                FROM public.purchase_orders po
                JOIN public.suppliers  s ON s.supplier_id  = po.supplier_id
                JOIN public.companies  c ON c.id           = po.company_id
                WHERE po.purchase_order_id = @id AND po.company_id = @cid::uuid
                """, conn);
            infoCmd.Parameters.AddWithValue("id",  id);
            infoCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());

            await using var infoR = await infoCmd.ExecuteReaderAsync();
            if (!await infoR.ReadAsync())
                return NotFound(new { message = "Không tìm thấy phiếu nhập." });

            var status        = infoR.GetString(0);
            var poCode        = infoR.GetString(1);
            var totalAmount   = infoR.GetDecimal(2);
            var supplierName  = infoR.GetString(3);
            var supplierEmail = infoR.IsDBNull(4) ? null : infoR.GetString(4);
            var companyName   = infoR.IsDBNull(5) ? "Công ty" : infoR.GetString(5);
            await infoR.CloseAsync();

            if (status != "DRAFT")
                return BadRequest(new { message = "Chỉ có thể submit phiếu ở trạng thái DRAFT." });

            // Chuyển sang PENDING
            await using var updCmd = new NpgsqlCommand("""
                UPDATE public.purchase_orders
                SET status = 'PENDING', updated_at = NOW()
                WHERE purchase_order_id = @id
                """, conn);
            updCmd.Parameters.AddWithValue("id", id);
            await updCmd.ExecuteNonQueryAsync();

            // Lấy danh sách sản phẩm để gửi email
            await using var itemsCmd = new NpgsqlCommand("""
                SELECT p.product_name, poi.quantity, poi.import_price
                FROM public.purchase_order_items poi
                JOIN public.products p ON p.product_id = poi.product_id
                WHERE poi.purchase_order_id = @id
                ORDER BY p.product_name
                """, conn);
            itemsCmd.Parameters.AddWithValue("id", id);

            var poItems = new List<(string ProductName, int Qty, decimal Price)>();
            await using var iR = await itemsCmd.ExecuteReaderAsync();
            while (await iR.ReadAsync())
                poItems.Add((iR.GetString(0), iR.GetInt32(1), iR.GetDecimal(2)));

            // Gửi email thông báo NCC (fire-and-forget)
            if (!string.IsNullOrEmpty(supplierEmail))
                _ = emailService.SendPurchaseOrderAsync(
                    supplierEmail, supplierName, poCode, totalAmount, poItems, companyName);

            var emailNote = string.IsNullOrEmpty(supplierEmail)
                ? " (NCC chưa có email — không gửi được thông báo)"
                : $" Email thông báo đã gửi đến {supplierEmail}.";

            return Ok(new { message = $"Đã gửi phiếu nhập lên để duyệt.{emailNote}" });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/purchase-orders/{id}/approve  (PENDING → APPROVED)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("{id:long}/approve")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> Approve(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var chk = new NpgsqlCommand("""
                SELECT status FROM public.purchase_orders
                WHERE purchase_order_id = @id AND company_id = @cid::uuid
                """, conn);
            chk.Parameters.AddWithValue("id",  id);
            chk.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            var status = (string?)await chk.ExecuteScalarAsync();

            if (status == null) return NotFound(new { message = "Không tìm thấy phiếu nhập." });
            if (status != "PENDING") return BadRequest(new { message = "Chỉ có thể duyệt phiếu ở trạng thái PENDING." });

            await using var cmd = new NpgsqlCommand("""
                UPDATE public.purchase_orders
                SET status = 'APPROVED', approved_by = @uid, approved_at = NOW(), updated_at = NOW()
                WHERE purchase_order_id = @id
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("uid", UserId > 0 ? (object)UserId : DBNull.Value);
            await cmd.ExecuteNonQueryAsync();

            return Ok(new { message = "Phiếu nhập đã được duyệt." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/purchase-orders/{id}/cancel
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("{id:long}/cancel")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> Cancel(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var chk = new NpgsqlCommand("""
                SELECT status FROM public.purchase_orders
                WHERE purchase_order_id = @id AND company_id = @cid::uuid
                """, conn);
            chk.Parameters.AddWithValue("id",  id);
            chk.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            var status = (string?)await chk.ExecuteScalarAsync();

            if (status == null) return NotFound(new { message = "Không tìm thấy phiếu nhập." });
            if (status == "CANCELLED") return BadRequest(new { message = "Phiếu đã bị hủy." });
            if (status is "PARTIALLY_RECEIVED" or "RECEIVED")
                return BadRequest(new { message = "Không thể hủy phiếu đã nhận hàng." });

            await using var cmd = new NpgsqlCommand("""
                UPDATE public.purchase_orders
                SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
                WHERE purchase_order_id = @id
                """, conn);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();

            return Ok(new { message = "Đã hủy phiếu nhập hàng." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/purchase-orders/supplier-approve/{token}
    // NCC click link trong email → duyệt phiếu → trả về HTML xác nhận
    // AllowAnonymous vì NCC không có tài khoản trong hệ thống
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("supplier-approve/{token:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> SupplierApprove(Guid token)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var chk = new NpgsqlCommand("""
                SELECT po.purchase_order_id, po.status, po.purchase_code,
                       s.supplier_name, c.name AS company_name
                FROM public.purchase_orders po
                JOIN public.suppliers s ON s.supplier_id = po.supplier_id
                JOIN public.companies c ON c.id = po.company_id
                WHERE po.confirmation_token = @token
                """, conn);
            chk.Parameters.AddWithValue("token", token);

            await using var r = await chk.ExecuteReaderAsync();
            if (!await r.ReadAsync())
                return Content(HtmlResult("❌ Link không hợp lệ", "Link duyệt không tồn tại hoặc đã hết hiệu lực.", false), "text/html");

            var poId         = r.GetInt64(0);
            var status       = r.GetString(1);
            var poCode       = r.GetString(2);
            var supplierName = r.GetString(3);
            var companyName  = r.GetString(4);
            await r.CloseAsync();

            if (status == "APPROVED")
                return Content(HtmlResult("✅ Đã duyệt trước đó", $"Phiếu <strong>{poCode}</strong> đã được xác nhận trước đó. Cảm ơn {supplierName}!", true), "text/html");

            if (status != "PENDING")
                return Content(HtmlResult("⚠️ Không thể duyệt", $"Phiếu <strong>{poCode}</strong> đang ở trạng thái {status}, không thể duyệt.", false), "text/html");

            // Duyệt phiếu + xóa token
            await using var upd = new NpgsqlCommand("""
                UPDATE public.purchase_orders
                SET status = 'APPROVED', approved_at = NOW(), updated_at = NOW(),
                    confirmation_token = NULL
                WHERE purchase_order_id = @id
                """, conn);
            upd.Parameters.AddWithValue("id", poId);
            await upd.ExecuteNonQueryAsync();

            return Content(HtmlResult(
                "✅ Xác nhận thành công!",
                $"Cảm ơn <strong>{supplierName}</strong>!<br>Phiếu đặt hàng <strong>{poCode}</strong> của <strong>{companyName}</strong> đã được xác nhận.<br>Chúng tôi sẽ liên hệ để sắp xếp giao hàng.",
                true), "text/html");
        }
        catch (Exception ex)
        {
            return Content(HtmlResult("❌ Lỗi hệ thống", ex.Message, false), "text/html");
        }
    }

    private static string HtmlResult(string title, string body, bool success) => $"""
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>{title}</title>
        </head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif;
                     display:flex;align-items:center;justify-content:center;min-height:100vh">
          <div style="background:#fff;border-radius:16px;padding:48px 40px;max-width:480px;width:90%;
                      box-shadow:0 4px 24px rgba(0,0,0,0.08);text-align:center">
            <div style="font-size:56px;margin-bottom:20px">{(success ? "✅" : "❌")}</div>
            <h1 style="margin:0 0 16px;font-size:22px;color:{(success ? "#166534" : "#991B1B")}">{title}</h1>
            <p style="margin:0;font-size:15px;color:#475569;line-height:1.7">{body}</p>
            <p style="margin:32px 0 0;font-size:12px;color:#94a3b8">
              MSAS — Hệ thống phân tích bán hàng đa kênh
            </p>
          </div>
        </body>
        </html>
        """;

    // ─────────────────────────────────────────────────────────────────────────
    private async Task<IActionResult> ChangeStatus(long id, string fromStatus, string toStatus,
        string? extraSql, string blockedMsg)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var chk = new NpgsqlCommand("""
                SELECT status FROM public.purchase_orders
                WHERE purchase_order_id = @id AND company_id = @cid::uuid
                """, conn);
            chk.Parameters.AddWithValue("id",  id);
            chk.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            var status = (string?)await chk.ExecuteScalarAsync();

            if (status == null) return NotFound(new { message = "Không tìm thấy phiếu nhập." });
            if (status != fromStatus) return BadRequest(new { message = blockedMsg });

            await using var cmd = new NpgsqlCommand($"""
                UPDATE public.purchase_orders
                SET status = '{toStatus}', updated_at = NOW() {extraSql}
                WHERE purchase_order_id = @id
                """, conn);
            cmd.Parameters.AddWithValue("id", id);
            await cmd.ExecuteNonQueryAsync();

            return Ok(new { message = $"Trạng thái phiếu đã chuyển sang {toStatus}." });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public class CreatePurchaseOrderDto
{
    public int     SupplierId { get; set; }
    public string? Note       { get; set; }
    public List<PurchaseOrderItemDto> Items { get; set; } = [];
}

public class PurchaseOrderItemDto
{
    public int     ProductId   { get; set; }
    public int?    VariationId { get; set; }  // null nếu sản phẩm không có biến thể
    public int     Quantity    { get; set; }
    public decimal ImportPrice { get; set; }
}
