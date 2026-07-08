using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// POS — Bán hàng offline + Loyalty + Voucher
/// GET  /api/pos/customers/search        — Tìm kiếm khách hàng (autocomplete)
/// GET  /api/pos/products/search         — Tìm kiếm sản phẩm để thêm vào đơn
/// POST /api/pos/orders                  — Tạo đơn hàng offline
/// GET  /api/pos/customers/{id}/loyalty  — Điểm loyalty của khách hàng
/// POST /api/pos/vouchers/validate       — Kiểm tra voucher hợp lệ
/// </summary>
[ApiController]
[Route("api/pos")]
[Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
public class PosController(IConfiguration cfg, ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ── GET /api/pos/customers/search?q=Nguyễn ────────────────────────────────
    [HttpGet("customers/search")]
    public async Task<IActionResult> SearchCustomers([FromQuery] string q = "")
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 1)
            return Ok(new { customers = Array.Empty<object>() });

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT c.customer_id, c.full_name, c.phone, c.email,
                   c.province, c.district,
                   COUNT(DISTINCT o.order_id)   AS total_orders,
                   COALESCE(SUM(o.total_amount), 0) AS total_spent,
                   COALESCE(
                     (SELECT SUM(lp.points)
                      FROM public.loyalty_points lp
                      WHERE lp.customer_id = c.customer_id
                        AND (lp.expires_at IS NULL OR lp.expires_at > NOW())), 0
                   ) AS loyalty_points
            FROM public.customers c
            LEFT JOIN public.orders o ON o.customer_id = c.customer_id
            WHERE c.company_id = @cid::uuid
              AND c.is_active = TRUE
              AND (c.full_name ILIKE @q OR c.phone ILIKE @q OR c.email ILIKE @q)
            GROUP BY c.customer_id
            ORDER BY total_orders DESC
            LIMIT 10
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("q",   $"%{q}%");

        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await reader.ReadAsync())
        {
            list.Add(new
            {
                id            = reader.GetInt32(0),
                name          = reader.GetString(1),
                phone         = reader.IsDBNull(2) ? null : reader.GetString(2),
                email         = reader.IsDBNull(3) ? null : reader.GetString(3),
                province      = reader.IsDBNull(4) ? null : reader.GetString(4),
                district      = reader.IsDBNull(5) ? null : reader.GetString(5),
                totalOrders   = reader.GetInt64(6),
                totalSpent    = reader.GetDecimal(7),
                loyaltyPoints = reader.GetDecimal(8),
            });
        }
        return Ok(new { customers = list });
    }

    // ── GET /api/pos/products/search?q=áo thun ────────────────────────────────
    [HttpGet("products/search")]
    public async Task<IActionResult> SearchProducts([FromQuery] string q = "")
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(new { products = Array.Empty<object>() });

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            WITH product_stock AS (
                SELECT
                    p.product_id,
                    CASE
                        WHEN COALESCE(vs.variation_count, 0) > 0 THEN COALESCE(vs.variation_stock, 0)
                        ELSE p.stock_quantity
                    END AS stock_quantity
                FROM public.products p
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS variation_count,
                           COALESCE(SUM(pv.stock_quantity), 0)::int AS variation_stock
                    FROM public.product_variations pv
                    WHERE pv.product_id = p.product_id
                      AND pv.company_id = @cid::uuid
                      AND pv.is_active = TRUE
                ) vs ON TRUE
                WHERE p.company_id = @cid::uuid
            )
            SELECT p.product_id, p.product_name, p.sku,
                   p.base_price, ps.stock_quantity, p.image_url,
                   c.category_name
            FROM public.products p
            JOIN product_stock ps ON ps.product_id = p.product_id
            LEFT JOIN public.categories c ON c.category_id = p.category_id
            WHERE p.company_id = @cid::uuid
              AND p.is_active   = TRUE
              AND ps.stock_quantity > 0
              AND (p.product_name ILIKE @q OR p.sku ILIKE @q)
            ORDER BY p.product_name
            LIMIT 20
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("q",   $"%{q}%");

        await using var reader = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await reader.ReadAsync())
        {
            list.Add(new
            {
                id           = reader.GetInt32(0),
                name         = reader.GetString(1),
                sku          = reader.GetString(2),
                salePrice    = reader.GetDecimal(3),
                stockQty     = reader.GetInt32(4),
                imageUrl     = reader.IsDBNull(5) ? null : reader.GetString(5),
                categoryName = reader.IsDBNull(6) ? null : reader.GetString(6),
            });
        }
        return Ok(new { products = list });
    }

    // ── GET /api/pos/customers/{id}/loyalty ───────────────────────────────────
    [HttpGet("customers/{id}/loyalty")]
    public async Task<IActionResult> GetLoyaltyInfo(int id)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        // Tổng điểm hiện có (chưa hết hạn)
        var pointsSql = """
            SELECT COALESCE(SUM(points), 0)
            FROM public.loyalty_points
            WHERE customer_id = @cid
              AND (expires_at IS NULL OR expires_at > NOW())
            """;
        await using var balCmd = new NpgsqlCommand(pointsSql, conn);
        balCmd.Parameters.AddWithValue("cid", id);
        var balance = Convert.ToDecimal(await balCmd.ExecuteScalarAsync() ?? 0);

        // Cấu hình loyalty
        var cfgSql = """
            SELECT vnd_per_point, min_redeem_points, points_per_vnd
            FROM public.loyalty_config
            WHERE company_id = @companyId::uuid
            """;
        await using var cfgCmd = new NpgsqlCommand(cfgSql, conn);
        cfgCmd.Parameters.AddWithValue("companyId", tenant.CompanyId!.Value.ToString());
        await using var cfgReader = await cfgCmd.ExecuteReaderAsync();
        int vndPerPoint = 1000, minRedeem = 100, pointsPerVnd = 1000;
        if (await cfgReader.ReadAsync())
        {
            vndPerPoint  = cfgReader.GetInt32(0);
            minRedeem    = cfgReader.GetInt32(1);
            pointsPerVnd = cfgReader.GetInt32(2);
        }
        await cfgReader.CloseAsync();

        // Lịch sử 10 giao dịch gần nhất
        var histSql = """
            SELECT points, point_type, description, created_at
            FROM public.loyalty_points
            WHERE customer_id = @cid
            ORDER BY created_at DESC
            LIMIT 10
            """;
        await using var histCmd = new NpgsqlCommand(histSql, conn);
        histCmd.Parameters.AddWithValue("cid", id);
        await using var histReader = await histCmd.ExecuteReaderAsync();
        var history = new List<object>();
        while (await histReader.ReadAsync())
        {
            history.Add(new
            {
                points      = histReader.GetInt32(0),
                type        = histReader.GetString(1),
                description = histReader.IsDBNull(2) ? null : histReader.GetString(2),
                createdAt   = histReader.GetDateTime(3),
            });
        }

        return Ok(new
        {
            balance,
            balanceVnd    = balance * vndPerPoint,
            vndPerPoint,
            minRedeem,
            pointsPerVnd,
            canRedeem     = balance >= minRedeem,
            history,
        });
    }

    // ── POST /api/pos/vouchers/validate ────────────────────────────────────────
    [HttpPost("vouchers/validate")]
    public async Task<IActionResult> ValidateVoucher([FromBody] ValidateVoucherDto dto)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT id, type, value, min_order_value, max_discount,
                   usage_limit, used_count, customer_id
            FROM public.vouchers
            WHERE UPPER(code) = UPPER(@code)
              AND company_id  = @cid::uuid
              AND is_active   = TRUE
              AND valid_from <= NOW()
              AND valid_to   >= NOW()
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("code", dto.Code ?? "");
        cmd.Parameters.AddWithValue("cid",  tenant.CompanyId!.Value.ToString());
        await using var r = await cmd.ExecuteReaderAsync();

        if (!await r.ReadAsync())
            return Ok(new { valid = false, message = "Mã voucher không tồn tại hoặc đã hết hạn." });

        var vid        = r.GetInt32(0);
        var type       = r.GetString(1);
        var value      = r.GetDecimal(2);
        var minOrder   = r.GetDecimal(3);
        var maxDisc    = r.IsDBNull(4) ? (decimal?)null : r.GetDecimal(4);
        var limit      = r.IsDBNull(5) ? (int?)null  : r.GetInt32(5);
        var used       = r.GetInt32(6);
        var custId     = r.IsDBNull(7) ? (int?)null  : r.GetInt32(7);
        await r.CloseAsync();

        if (limit.HasValue && used >= limit.Value)
            return Ok(new { valid = false, message = "Voucher đã hết lượt sử dụng." });

        if (custId.HasValue && custId.Value != dto.CustomerId)
            return Ok(new { valid = false, message = "Voucher không áp dụng cho khách hàng này." });

        if (dto.OrderValue < minOrder)
            return Ok(new
            {
                valid   = false,
                message = $"Đơn hàng chưa đạt giá trị tối thiểu {minOrder:N0}đ để dùng voucher.",
            });

        // Tính số tiền giảm
        decimal discount = type switch
        {
            "PERCENT"  => Math.Min(dto.OrderValue * value / 100m, maxDisc ?? decimal.MaxValue),
            "FIXED"    => Math.Min(value, dto.OrderValue),
            "FREESHIP" => value, // value = mức giảm ship cố định
            _          => 0,
        };

        return Ok(new
        {
            valid       = true,
            voucherId   = vid,
            type,
            value,
            discount    = Math.Round(discount, 0),
            message     = $"Voucher hợp lệ — giảm {discount:N0}đ",
        });
    }

    // ── POST /api/pos/orders ──────────────────────────────────────────────────
    [HttpPost("orders")]
    public async Task<IActionResult> CreateOfflineOrder([FromBody] CreateOfflineOrderDto dto)
    {
        if (dto.Items is null || dto.Items.Count == 0)
            return BadRequest(new { message = "Đơn hàng phải có ít nhất 1 sản phẩm." });

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var tx = await conn.BeginTransactionAsync();
        try
        {
            // 1. Lấy offline channel_id
            await using var chanCmd = new NpgsqlCommand(
                "SELECT channel_id FROM public.sales_channels WHERE channel_type='OFFLINE' AND company_id=@cid::uuid LIMIT 1",
                conn, tx);
            chanCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            var chanIdObj = await chanCmd.ExecuteScalarAsync();
            if (chanIdObj is null or DBNull)
                return BadRequest(new { message = "Chưa cấu hình kênh bán hàng Offline." });
            int channelId = Convert.ToInt32(chanIdObj);

            // 2. Upsert customer
            int customerId;
            if (dto.CustomerId.HasValue)
            {
                customerId = dto.CustomerId.Value;
            }
            else
            {
                var phone = (dto.CustomerPhone ?? "").Trim();
                if (string.IsNullOrEmpty(phone))
                    phone = $"09{Math.Abs(Guid.NewGuid().GetHashCode()) % 100000000:D8}";

                await using var cuCmd = new NpgsqlCommand("""
                    INSERT INTO public.customers
                        (customer_code, full_name, phone, company_id,
                         email, province, district, is_active, segment_label, created_at, updated_at)
                    VALUES
                        (@code, @name, @phone, @cid::uuid,
                         @email, @province, @district, TRUE, 'NEW', NOW(), NOW())
                    ON CONFLICT (customer_code) DO UPDATE
                        SET full_name  = EXCLUDED.full_name,
                            updated_at = NOW()
                    RETURNING customer_id
                    """, conn, tx);
                cuCmd.Parameters.AddWithValue("code",     $"KH-POS-{phone[^6..]}");
                cuCmd.Parameters.AddWithValue("name",     string.IsNullOrWhiteSpace(dto.CustomerName) ? "Khách lẻ" : dto.CustomerName);
                cuCmd.Parameters.AddWithValue("phone",    phone);
                cuCmd.Parameters.AddWithValue("cid",      tenant.CompanyId!.Value.ToString());
                cuCmd.Parameters.AddWithValue("email",    (object?)dto.CustomerEmail    ?? DBNull.Value);
                cuCmd.Parameters.AddWithValue("province", (object?)dto.CustomerProvince ?? DBNull.Value);
                cuCmd.Parameters.AddWithValue("district", (object?)dto.CustomerDistrict ?? DBNull.Value);

                var cuObj = await cuCmd.ExecuteScalarAsync();
                if (cuObj is null or DBNull)
                {
                    await using var getCmd = new NpgsqlCommand(
                        "SELECT customer_id FROM public.customers WHERE phone=@p AND company_id=@cid::uuid LIMIT 1", conn, tx);
                    getCmd.Parameters.AddWithValue("p",   phone);
                    getCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                    customerId = Convert.ToInt32(await getCmd.ExecuteScalarAsync() ?? 0);
                }
                else customerId = Convert.ToInt32(cuObj);
            }

            // 3. Tính tổng tiền
            decimal subtotal = dto.Items.Sum(i => i.Price * i.Qty);
            decimal discount = 0;

            // 4. Áp dụng voucher (nếu có)
            int? voucherId = null;
            if (!string.IsNullOrEmpty(dto.VoucherCode))
            {
                await using var vCmd = new NpgsqlCommand("""
                    SELECT id, type, value, min_order_value, max_discount
                    FROM public.vouchers
                    WHERE UPPER(code) = UPPER(@code) AND company_id=@cid::uuid
                      AND is_active=TRUE AND valid_from<=NOW() AND valid_to>=NOW()
                    """, conn, tx);
                vCmd.Parameters.AddWithValue("code", dto.VoucherCode);
                vCmd.Parameters.AddWithValue("cid",  tenant.CompanyId!.Value.ToString());
                await using var vr = await vCmd.ExecuteReaderAsync();
                if (await vr.ReadAsync())
                {
                    voucherId = vr.GetInt32(0);
                    var vType     = vr.GetString(1);
                    var vValue    = vr.GetDecimal(2);
                    var vMaxDisc  = vr.IsDBNull(4) ? (decimal?)null : vr.GetDecimal(4);
                    discount = vType switch
                    {
                        "PERCENT" => Math.Min(subtotal * vValue / 100m, vMaxDisc ?? decimal.MaxValue),
                        "FIXED"   => Math.Min(vValue, subtotal),
                        _         => vValue,
                    };
                    await vr.CloseAsync();

                    // Tăng used_count
                    await using var vuCmd = new NpgsqlCommand(
                        "UPDATE public.vouchers SET used_count=used_count+1 WHERE id=@vid", conn, tx);
                    vuCmd.Parameters.AddWithValue("vid", voucherId.Value);
                    await vuCmd.ExecuteNonQueryAsync();
                }
                else await vr.CloseAsync();
            }

            // 5. Trừ điểm loyalty (nếu dùng)
            decimal pointsUsed = 0;
            if (dto.UsePoints > 0 && customerId > 0)
            {
                await using var cfgCmd = new NpgsqlCommand(
                    "SELECT vnd_per_point, min_redeem_points FROM public.loyalty_config WHERE company_id=@cid::uuid",
                    conn, tx);
                cfgCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                await using var cfgR = await cfgCmd.ExecuteReaderAsync();
                int vndPer = 1000, minRed = 100;
                if (await cfgR.ReadAsync()) { vndPer = cfgR.GetInt32(0); minRed = cfgR.GetInt32(1); }
                await cfgR.CloseAsync();

                if (dto.UsePoints >= minRed)
                {
                    pointsUsed = dto.UsePoints * vndPer;
                    discount  += pointsUsed;

                    var userId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 0;
                    await using var lpCmd = new NpgsqlCommand("""
                        INSERT INTO public.loyalty_points
                            (company_id, customer_id, points, point_type, description, created_at, created_by)
                        VALUES (@cid::uuid, @custId, @pts, 'REDEEMED', @desc, NOW(), @createdBy)
                        """, conn, tx);
                    lpCmd.Parameters.AddWithValue("cid",       tenant.CompanyId!.Value.ToString());
                    lpCmd.Parameters.AddWithValue("custId",    customerId);
                    lpCmd.Parameters.AddWithValue("pts",       -(int)dto.UsePoints);
                    lpCmd.Parameters.AddWithValue("desc",      $"Dùng điểm đổi giảm giá {pointsUsed:N0}đ");
                    lpCmd.Parameters.AddWithValue("createdBy", userId > 0 ? userId : DBNull.Value);
                    await lpCmd.ExecuteNonQueryAsync();
                }
            }

            discount  = Math.Min(discount, subtotal);
            var total = Math.Max(0, subtotal - discount);

            // 6. Kiểm tra tồn kho TRƯỚC khi tạo đơn (FOR UPDATE để tránh race condition)
            foreach (var item in dto.Items)
            {
                if (item.VariationId.HasValue)
                {
                    // Kiểm tra tồn kho theo variation (size/màu cụ thể)
                    await using var chkVarCmd = new NpgsqlCommand("""
                        SELECT p.product_name, pv.stock_quantity, pv.variation_name, pv.attribute_color, pv.attribute_size
                        FROM public.product_variations pv
                        JOIN public.products p ON p.product_id = pv.product_id
                        WHERE pv.id = @vid AND p.company_id = @cid::uuid
                        FOR UPDATE OF pv
                        """, conn, tx);
                    chkVarCmd.Parameters.AddWithValue("vid", item.VariationId.Value);
                    chkVarCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                    await using var chkVarR = await chkVarCmd.ExecuteReaderAsync();
                    if (!await chkVarR.ReadAsync())
                    {
                        await chkVarR.CloseAsync(); await tx.RollbackAsync();
                        return BadRequest(new { message = $"Không tìm thấy biến thể sản phẩm ID {item.VariationId}." });
                    }
                    var vPname = chkVarR.GetString(0);
                    var vStock = chkVarR.GetInt32(1);
                    var vName  = new[] { chkVarR.IsDBNull(3) ? null : chkVarR.GetString(3),
                                         chkVarR.IsDBNull(4) ? null : chkVarR.GetString(4) }
                                 .Where(s => s != null).DefaultIfEmpty(chkVarR.IsDBNull(2) ? "" : chkVarR.GetString(2))
                                 .FirstOrDefault() ?? "";
                    await chkVarR.CloseAsync();
                    if (vStock < item.Qty)
                    {
                        await tx.RollbackAsync();
                        return BadRequest(new { message = $"Biến thể \"{vPname} ({vName})\" không đủ hàng. Còn {vStock}, cần {item.Qty}." });
                    }
                }
                else
                {
                    // Kiểm tra tồn kho theo sản phẩm tổng
                    await using var chkCmd = new NpgsqlCommand("""
                        SELECT product_name, stock_quantity
                        FROM public.products
                        WHERE product_id = @pid AND company_id = @cid::uuid
                        FOR UPDATE
                        """, conn, tx);
                    chkCmd.Parameters.AddWithValue("pid", item.ProductId);
                    chkCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                    await using var chkR = await chkCmd.ExecuteReaderAsync();
                    if (!await chkR.ReadAsync())
                    {
                        await chkR.CloseAsync(); await tx.RollbackAsync();
                        return BadRequest(new { message = $"Không tìm thấy sản phẩm ID {item.ProductId}." });
                    }
                    var pName  = chkR.GetString(0);
                    var pStock = chkR.GetInt32(1);
                    await chkR.CloseAsync();
                    if (pStock < item.Qty)
                    {
                        await tx.RollbackAsync();
                        return BadRequest(new { message = $"Sản phẩm \"{pName}\" không đủ hàng. Còn {pStock}, cần {item.Qty}." });
                    }
                }
            }

            // 7. Tạo order — VIETQR cần đợi xác nhận nên không đánh dấu PAID ngay
            var orderCode = $"POS-{DateTime.Now:yyyyMMdd-HHmmss}";
            var userId2   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid2) ? uid2 : 0;

            var isVietQR      = (dto.PaymentMethod ?? "").Equals("VIETQR", StringComparison.OrdinalIgnoreCase);
            var orderStatus   = isVietQR ? "PENDING"   : "DELIVERED";
            var paymentStatus = isVietQR ? "UNPAID"    : "PAID";

            await using var orCmd = new NpgsqlCommand("""
                INSERT INTO public.orders
                    (order_code, customer_id, channel_id, order_date, status,
                     total_amount, discount_amount, shipping_fee,
                     payment_method, payment_status, shipping_status,
                     company_id, created_by_user_id, pos_note, is_stock_deducted, voucher_code, created_at, updated_at)
                VALUES
                    (@code, @cust, @chan, NOW(), @orderStatus,
                     @total, @disc, 0,
                     @pay, @paymentStatus, 'NOT_SHIPPED',
                     @cid::uuid, @createdBy, @note, TRUE, @vcode, NOW(), NOW())
                RETURNING order_id
                """, conn, tx);
            orCmd.Parameters.AddWithValue("code",          orderCode);
            orCmd.Parameters.AddWithValue("cust",          customerId);
            orCmd.Parameters.AddWithValue("chan",          channelId);
            orCmd.Parameters.AddWithValue("total",         total);
            orCmd.Parameters.AddWithValue("disc",          discount);
            orCmd.Parameters.AddWithValue("pay",           dto.PaymentMethod ?? "CASH");
            orCmd.Parameters.AddWithValue("orderStatus",   orderStatus);
            orCmd.Parameters.AddWithValue("paymentStatus", paymentStatus);
            orCmd.Parameters.AddWithValue("cid",           tenant.CompanyId!.Value.ToString());
            orCmd.Parameters.AddWithValue("createdBy",     userId2 > 0 ? userId2 : DBNull.Value);
            orCmd.Parameters.AddWithValue("note",          (object?)(dto.Note) ?? DBNull.Value);
            orCmd.Parameters.AddWithValue("vcode",         (object?)(dto.VoucherCode) ?? DBNull.Value);
            var orderId = Convert.ToInt32(await orCmd.ExecuteScalarAsync());

            // 8. Insert order_items + trừ tồn kho (đã validate ở bước 6, exact deduction)
            var cid2 = tenant.CompanyId!.Value.ToString();
            foreach (var item in dto.Items)
            {
                // Lấy thông tin variation để snapshot vào order_item
                string? varName = null; string? varSku = null;
                if (item.VariationId.HasValue)
                {
                    await using var varInfoCmd = new NpgsqlCommand(
                        "SELECT variation_name, sku FROM public.product_variations WHERE id = @vid",
                        conn, tx);
                    varInfoCmd.Parameters.AddWithValue("vid", item.VariationId.Value);
                    await using var varInfoR = await varInfoCmd.ExecuteReaderAsync();
                    if (await varInfoR.ReadAsync())
                    {
                        varName = varInfoR.IsDBNull(0) ? null : varInfoR.GetString(0);
                        varSku  = varInfoR.IsDBNull(1) ? null : varInfoR.GetString(1);
                    }
                }

                await using var itmCmd = new NpgsqlCommand("""
                    INSERT INTO public.order_items
                        (order_id, product_id, variation_id, variation_name, sku,
                         quantity, unit_price, subtotal, created_at)
                    VALUES (@oid, @pid, @vid, @vname, @vsku, @qty, @price, @sub, NOW())
                    """, conn, tx);
                itmCmd.Parameters.AddWithValue("oid",   orderId);
                itmCmd.Parameters.AddWithValue("pid",   item.ProductId);
                itmCmd.Parameters.AddWithValue("vid",   item.VariationId.HasValue ? (object)item.VariationId.Value : DBNull.Value);
                itmCmd.Parameters.AddWithValue("vname", (object?)varName ?? DBNull.Value);
                itmCmd.Parameters.AddWithValue("vsku",  (object?)varSku  ?? DBNull.Value);
                itmCmd.Parameters.AddWithValue("qty",   item.Qty);
                itmCmd.Parameters.AddWithValue("price", item.Price);
                itmCmd.Parameters.AddWithValue("sub",   item.Price * item.Qty);
                await itmCmd.ExecuteNonQueryAsync();

                // Trừ tồn kho sản phẩm tổng + ghi inventory_transaction
                await using var stockCmd = new NpgsqlCommand("""
                    WITH upd AS (
                        UPDATE public.products
                        SET stock_quantity = GREATEST(0, stock_quantity - @qty), updated_at = NOW()
                        WHERE product_id = @pid AND company_id = @cid::uuid
                        RETURNING product_id, stock_quantity AS after_stock
                    )
                    INSERT INTO public.inventory_transactions
                        (company_id, product_id, transaction_type, quantity_change,
                         before_stock, after_stock, reference_type, reference_id, note, created_by)
                    SELECT @cid::uuid, product_id, 'POS_SALE', -@qty,
                           after_stock + @qty, after_stock,
                           'order', @orderId, 'POS ban hang', @createdBy
                    FROM upd
                    """, conn, tx);
                stockCmd.Parameters.AddWithValue("qty",       item.Qty);
                stockCmd.Parameters.AddWithValue("pid",       item.ProductId);
                stockCmd.Parameters.AddWithValue("cid",       cid2);
                stockCmd.Parameters.AddWithValue("orderId",   (long)orderId);
                stockCmd.Parameters.AddWithValue("createdBy", userId2 > 0 ? (object)userId2 : DBNull.Value);
                await stockCmd.ExecuteNonQueryAsync();

                // Trừ thêm tồn kho variation nếu có
                if (item.VariationId.HasValue)
                {
                    await using var varStockCmd = new NpgsqlCommand("""
                        UPDATE public.product_variations
                        SET stock_quantity = stock_quantity - @qty, updated_at = NOW()
                        WHERE id = @vid
                        """, conn, tx);
                    varStockCmd.Parameters.AddWithValue("qty", item.Qty);
                    varStockCmd.Parameters.AddWithValue("vid", item.VariationId.Value);
                    await varStockCmd.ExecuteNonQueryAsync();
                }
            }

            // 8. Cộng điểm loyalty sau khi mua
            int pointsEarned = 0;
            if (customerId > 0)
            {
                await using var cfgCmd2 = new NpgsqlCommand(
                    "SELECT points_per_vnd FROM public.loyalty_config WHERE company_id=@cid::uuid",
                    conn, tx);
                cfgCmd2.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                var pPerVndObj = await cfgCmd2.ExecuteScalarAsync();
                int pPerVnd = pPerVndObj is not null and not DBNull ? Convert.ToInt32(pPerVndObj) : 1000;

                pointsEarned = (int)(total / pPerVnd);
                if (pointsEarned > 0)
                {
                    var expiresAt = DateTime.UtcNow.AddDays(365);
                    await using var earnCmd = new NpgsqlCommand("""
                        INSERT INTO public.loyalty_points
                            (company_id, customer_id, order_id, points, point_type, description, expires_at, created_at)
                        VALUES (@cid::uuid, @custId, @oid, @pts, 'EARNED', @desc, @exp, NOW())
                        """, conn, tx);
                    earnCmd.Parameters.AddWithValue("cid",    tenant.CompanyId!.Value.ToString());
                    earnCmd.Parameters.AddWithValue("custId", customerId);
                    earnCmd.Parameters.AddWithValue("oid",    orderId);
                    earnCmd.Parameters.AddWithValue("pts",    pointsEarned);
                    earnCmd.Parameters.AddWithValue("desc",   $"Tích điểm đơn hàng {orderCode}");
                    earnCmd.Parameters.AddWithValue("exp",    expiresAt);
                    await earnCmd.ExecuteNonQueryAsync();
                }
            }

            // 9. Tổng điểm hiện tại của KH
            decimal remainPoints = 0;
            if (customerId > 0)
            {
                await using var balCmd = new NpgsqlCommand(
                    "SELECT COALESCE(SUM(points),0) FROM public.loyalty_points WHERE customer_id=@cid AND (expires_at IS NULL OR expires_at>NOW())",
                    conn, tx);
                balCmd.Parameters.AddWithValue("cid", customerId);
                remainPoints = Convert.ToDecimal(await balCmd.ExecuteScalarAsync() ?? 0);
            }

            await tx.CommitAsync();

            return Ok(new
            {
                orderId,
                orderCode,
                customerId,
                subtotal,
                discount   = Math.Round(discount, 0),
                total      = Math.Round(total, 0),
                pointsEarned,
                remainingPoints = (int)remainPoints,
                requiresQR  = isVietQR,
                message    = $"Đơn hàng {orderCode} tạo thành công. Khách tích được {pointsEarned} điểm.",
            });
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync();
            return StatusCode(500, new { message = $"Lỗi tạo đơn hàng: {ex.Message}" });
        }
    }

    // ── GET /api/pos/loyalty/config ───────────────────────────────────────────
    [HttpGet("loyalty/config")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> GetLoyaltyConfig()
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "SELECT points_per_vnd, vnd_per_point, min_redeem_points, point_expiry_days, is_active FROM public.loyalty_config WHERE company_id=@cid::uuid",
            conn);
        cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync())
            return Ok(new { pointsPerVnd = 1000, vndPerPoint = 1000, minRedeemPoints = 100, pointExpiryDays = 365, isActive = true });
        return Ok(new
        {
            pointsPerVnd     = r.GetInt32(0),
            vndPerPoint      = r.GetInt32(1),
            minRedeemPoints  = r.GetInt32(2),
            pointExpiryDays  = r.GetInt32(3),
            isActive         = r.GetBoolean(4),
        });
    }

    // ── PUT /api/pos/loyalty/config ───────────────────────────────────────────
    [HttpPut("loyalty/config")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> UpdateLoyaltyConfig([FromBody] LoyaltyConfigDto dto)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO public.loyalty_config
                (company_id, points_per_vnd, vnd_per_point, min_redeem_points, point_expiry_days, is_active)
            VALUES (@cid::uuid, @ppv, @vpp, @mrp, @ped, @act)
            ON CONFLICT (company_id) DO UPDATE SET
                points_per_vnd    = EXCLUDED.points_per_vnd,
                vnd_per_point     = EXCLUDED.vnd_per_point,
                min_redeem_points = EXCLUDED.min_redeem_points,
                point_expiry_days = EXCLUDED.point_expiry_days,
                is_active         = EXCLUDED.is_active,
                updated_at        = NOW()
            """, conn);
        cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("ppv", dto.PointsPerVnd);
        cmd.Parameters.AddWithValue("vpp", dto.VndPerPoint);
        cmd.Parameters.AddWithValue("mrp", dto.MinRedeemPoints);
        cmd.Parameters.AddWithValue("ped", dto.PointExpiryDays);
        cmd.Parameters.AddWithValue("act", dto.IsActive);
        await cmd.ExecuteNonQueryAsync();
        return Ok(new { message = "Đã lưu cấu hình tích điểm." });
    }

    // ── GET /api/pos/vouchers ─────────────────────────────────────────────────
    [HttpGet("vouchers")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> GetVouchers()
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            SELECT id, code, type, value, min_order_value, max_discount, usage_limit,
                   used_count, valid_from, valid_to, is_active
            FROM public.vouchers
            WHERE company_id = @cid::uuid
            ORDER BY created_at DESC
            LIMIT 100
            """, conn);
        cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        await using var r = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await r.ReadAsync())
        {
            list.Add(new
            {
                id            = r.GetInt32(0),
                code          = r.GetString(1),
                type          = r.GetString(2),
                value         = r.GetDecimal(3),
                minOrderValue = r.IsDBNull(4) ? 0 : r.GetDecimal(4),
                maxDiscount   = r.IsDBNull(5) ? (decimal?)null : r.GetDecimal(5),
                usageLimit    = r.IsDBNull(6) ? (int?)null    : r.GetInt32(6),
                usedCount     = r.GetInt32(7),
                validFrom     = r.GetDateTime(8),
                validTo       = r.GetDateTime(9),
                isActive      = r.GetBoolean(10),
            });
        }
        return Ok(list);
    }

    // ── POST /api/pos/vouchers ────────────────────────────────────────────────
    [HttpPost("vouchers")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> CreateVoucher([FromBody] CreateVoucherDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code)) return BadRequest(new { message = "Mã voucher không được trống." });
        if (dto.Value <= 0) return BadRequest(new { message = "Giá trị voucher phải > 0." });
        if (dto.ValidTo <= dto.ValidFrom) return BadRequest(new { message = "Ngày hết hạn phải sau ngày hiệu lực." });

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO public.vouchers
                (company_id, code, type, value, min_order_value, max_discount, usage_limit,
                 valid_from, valid_to, is_active, created_by)
            VALUES
                (@cid::uuid, @code, @type, @val, @minOrd, @maxDisc, @limit,
                 @vf, @vt, TRUE, @by)
            RETURNING id
            """, conn);
        cmd.Parameters.AddWithValue("cid",    tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("code",   dto.Code.Trim().ToUpper());
        cmd.Parameters.AddWithValue("type",   dto.Type);
        cmd.Parameters.AddWithValue("val",    dto.Value);
        cmd.Parameters.AddWithValue("minOrd", dto.MinOrderValue ?? 0);
        cmd.Parameters.AddWithValue("maxDisc",(object?)dto.MaxDiscount   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("limit",  (object?)dto.UsageLimit    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("vf",     dto.ValidFrom.ToUniversalTime());
        cmd.Parameters.AddWithValue("vt",     dto.ValidTo.ToUniversalTime());
        cmd.Parameters.AddWithValue("by",     (object?)tenant.UserId     ?? DBNull.Value);
        try
        {
            var newId = await cmd.ExecuteScalarAsync();
            return Ok(new { id = newId, message = "Tạo voucher thành công." });
        }
        catch (NpgsqlException ex) when (ex.SqlState == "23505")
        {
            return Conflict(new { message = $"Mã voucher '{dto.Code}' đã tồn tại." });
        }
    }

    // ── PUT /api/pos/vouchers/{id} ────────────────────────────────────────────
    [HttpPut("vouchers/{id:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> UpdateVoucher(int id, [FromBody] UpdateVoucherDto dto)
    {
        if (dto.ValidTo <= dto.ValidFrom) return BadRequest(new { message = "Ngày hết hạn phải sau ngày hiệu lực." });

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            UPDATE public.vouchers SET
                code          = @code,
                type          = @type,
                value         = @val,
                min_order_value = @minOrd,
                max_discount  = @maxDisc,
                usage_limit   = @limit,
                valid_from    = @vf,
                valid_to      = @vt,
                is_active     = @active
            WHERE id = @id AND company_id = @cid::uuid
            """, conn);
        cmd.Parameters.AddWithValue("id",     id);
        cmd.Parameters.AddWithValue("cid",    tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("code",   dto.Code.Trim().ToUpper());
        cmd.Parameters.AddWithValue("type",   dto.Type);
        cmd.Parameters.AddWithValue("val",    dto.Value);
        cmd.Parameters.AddWithValue("minOrd", dto.MinOrderValue ?? 0);
        cmd.Parameters.AddWithValue("maxDisc",(object?)dto.MaxDiscount ?? DBNull.Value);
        cmd.Parameters.AddWithValue("limit",  (object?)dto.UsageLimit  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("vf",     dto.ValidFrom.ToUniversalTime());
        cmd.Parameters.AddWithValue("vt",     dto.ValidTo.ToUniversalTime());
        cmd.Parameters.AddWithValue("active", dto.IsActive);
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return NotFound(new { message = "Không tìm thấy voucher." });
        return Ok(new { message = "Đã cập nhật voucher." });
    }

    // ── DELETE /api/pos/vouchers/{id} ─────────────────────────────────────────
    [HttpDelete("vouchers/{id:int}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> DeleteVoucher(int id)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            DELETE FROM public.vouchers
            WHERE id = @id AND company_id = @cid::uuid AND used_count = 0
            """, conn);
        cmd.Parameters.AddWithValue("id",  id);
        cmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        var rows = await cmd.ExecuteNonQueryAsync();
        if (rows == 0) return BadRequest(new { message = "Không thể xóa: voucher đã được sử dụng hoặc không tồn tại." });
        return Ok(new { message = "Đã xóa voucher." });
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public record PosOrderItem(int ProductId, int? VariationId, int Qty, decimal Price);

public record CreateOfflineOrderDto(
    int? CustomerId,
    string? CustomerName,
    string? CustomerPhone,
    string? CustomerEmail,
    string? CustomerProvince,
    string? CustomerDistrict,
    List<PosOrderItem> Items,
    string? PaymentMethod,
    string? VoucherCode,
    int UsePoints,
    string? Note
);

public record ValidateVoucherDto(string? Code, decimal OrderValue, int? CustomerId);

public record LoyaltyConfigDto(int PointsPerVnd, int VndPerPoint, int MinRedeemPoints, int PointExpiryDays, bool IsActive);

public record CreateVoucherDto(
    string Code,
    string Type,
    decimal Value,
    decimal? MinOrderValue,
    decimal? MaxDiscount,
    int? UsageLimit,
    DateTime ValidFrom,
    DateTime ValidTo
);

public record UpdateVoucherDto(
    string Code,
    string Type,
    decimal Value,
    decimal? MinOrderValue,
    decimal? MaxDiscount,
    int? UsageLimit,
    DateTime ValidFrom,
    DateTime ValidTo,
    bool IsActive
);
