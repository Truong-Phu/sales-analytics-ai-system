using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Import dữ liệu thủ công từ file CSV.
/// POST /api/import/{type}          — import file CSV (generic)
/// POST /api/import/platform-orders — import đơn hàng từ Shopee/TikTok/Lazada (auto-detect format)
/// GET  /api/import/template/{type} — tải file CSV mẫu
/// GET  /api/import/template/platform/{source} — tải template sàn TMĐT
/// </summary>
[ApiController]
[Route("api/import")]
[Authorize(Roles = "Owner,Manager")]
public class ImportController(
    IConfiguration cfg,
    ITenantContext tenant,
    IAuditLogService audit,
    AiProxyService aiProxy) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    // ── Đọc CSV đơn giản (không dùng thư viện ngoài) ─────────────────────────
    private static List<string[]> ParseCsv(Stream stream)
    {
        var rows = new List<string[]>();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            rows.Add(SplitCsvLine(line));
        }
        return rows;
    }

    private static string[] SplitCsvLine(string line)
    {
        var fields  = new List<string>();
        var current = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                { current.Append('"'); i++; }
                else inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            { fields.Add(current.ToString().Trim()); current.Clear(); }
            else current.Append(c);
        }
        fields.Add(current.ToString().Trim());
        return fields.ToArray();
    }

    private static string Cell(string[] row, int i) =>
        i < row.Length ? row[i].Trim('"', ' ') : string.Empty;

    // ── GET /api/import/template/{type} ──────────────────────────────────────
    [HttpGet("template/{type}")]
    public IActionResult GetTemplate(string type)
    {
        var today = DateTime.Now.ToString("yyyy-MM-dd");

        if (type.ToLower() == "orders")
        {
            var sb = new StringBuilder();
            sb.AppendLine("order_code,customer_email,product_sku,variation_sku,variation_name,color,size,quantity,unit_price,channel,order_date,status");
            sb.AppendLine($"DH-2026-001,khachhang@email.com,AT-NAM-001,AT-NAM-001-M-TRG,M - Trắng,Trắng,M,2,250000,Shopee,{today},DELIVERED");
            sb.AppendLine($"DH-2026-001,khachhang@email.com,QJ-NU-001,QJ-NU-001-27-XNH,27 - Xanh nhạt,Xanh nhạt,27,1,450000,Shopee,{today},DELIVERED");
            sb.AppendLine($"DH-2026-002,mua@gmail.com,GIAY-NAM-001,GIAY-NAM-001-41-TRG,41 - Trắng,Trắng,41,1,780000,Lazada,{today},SHIPPED");
            sb.AppendLine($"DH-2026-003,vip@gmail.com,TUI-XACH-001,TUI-XACH-001-DEN,Đen,Đen,One Size,1,750000,Website,{today},DELIVERED");
            sb.AppendLine($"DH-2026-004,kh@yahoo.com,DAM-001,DAM-001-M-HVAN,M - Hoa vàng,Hoa vàng,M,1,680000,TikTok Shop,{today},DELIVERED");
            return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", "template_orders.csv");
        }

        if (type.ToLower() == "products")
        {
            var sb = new StringBuilder();
            // Header: cột sản phẩm + cột biến thể
            sb.AppendLine("sku,product_name,category,description,base_price,cost_price,variation_sku,variation_name,attribute_color,attribute_size,variation_sale_price,variation_stock");
            // Ví dụ 1: áo thun nam - nhiều biến thể
            sb.AppendLine("AT-NAM-001,Áo thun nam basic cotton 100%,Thời trang nam,Cotton 100% thoáng mát,250000,90000,AT-NAM-001-S-TRG,S - Trắng,Trắng,S,250000,80");
            sb.AppendLine(",,,,,,AT-NAM-001-M-TRG,M - Trắng,Trắng,M,250000,120");
            sb.AppendLine(",,,,,,AT-NAM-001-L-TRG,L - Trắng,Trắng,L,250000,90");
            sb.AppendLine(",,,,,,AT-NAM-001-S-DEN,S - Đen,Đen,S,250000,60");
            sb.AppendLine(",,,,,,AT-NAM-001-M-DEN,M - Đen,Đen,M,250000,90");
            // Ví dụ 2: giày nam - size × màu
            sb.AppendLine("GIAY-NAM-001,Giày sneaker nam da PU đế êm,Giày dép,Da PU cao cấp đế Eva êm ái,780000,310000,GIAY-NAM-001-40-TRG,40 - Trắng,Trắng,40,780000,20");
            sb.AppendLine(",,,,,,GIAY-NAM-001-41-TRG,41 - Trắng,Trắng,41,780000,25");
            sb.AppendLine(",,,,,,GIAY-NAM-001-42-TRG,42 - Trắng,Trắng,42,780000,20");
            sb.AppendLine(",,,,,,GIAY-NAM-001-41-DEN,41 - Đen,Đen,41,790000,20");
            // Ví dụ 3: túi xách - chỉ màu
            sb.AppendLine("TUI-XACH-001,Túi xách da PU công sở,Túi xách & Ba lô,Da PU cao cấp quai cầm vàng,750000,290000,TUI-XACH-001-DEN,Đen,Đen,One Size,750000,30");
            sb.AppendLine(",,,,,,TUI-XACH-001-NAU,Nâu caramel,Nâu caramel,One Size,760000,22");
            sb.AppendLine(",,,,,,TUI-XACH-001-DDO,Đỏ đô,Đỏ đô,One Size,765000,15");
            return File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", "template_products.csv");
        }

        var (header, filename) = type.ToLower() switch
        {
            "customers"  => ("email,full_name,phone,address,district,province,registered_date",
                             "template_customers.csv"),
            "sales-data" => ("date,channel,product_sku,quantity_sold,revenue,order_count",
                             "template_sales_data.csv"),
            _            => (null, null)
        };

        if (header is null) return NotFound(new { message = "Loại dữ liệu không hợp lệ." });

        var bytes = Encoding.UTF8.GetBytes(header + "\r\n");
        return File(bytes, "text/csv", filename);
    }

    // ── GET /api/import/template/platform/{source} ────────────────────────────
    [HttpGet("template/platform/{source}")]
    public Task<IActionResult> GetPlatformTemplate(string source) =>
        GetPlatformTemplateByType(source, "orders");

    // ── GET /api/import/template/platform/{source}/{fileType} ────────────────
    [HttpGet("template/platform/{source}/{fileType}")]
    public Task<IActionResult> GetPlatformTemplateTyped(string source, string fileType) =>
        GetPlatformTemplateByType(source, fileType);

    private async Task<IActionResult> GetPlatformTemplateByType(string source, string fileType)
    {
        var src  = source.ToLower();
        var type = fileType.ToLower();

        if (src is not ("shopee" or "tiktok" or "lazada"))
            return NotFound(new { message = "Nguồn không hợp lệ. Chọn: shopee, tiktok, lazada." });
        if (type is not ("orders" or "products"))
            return NotFound(new { message = "Loại file không hợp lệ. Chọn: orders, products." });

        var displayName = $"template_{src}_{type}_{DateTime.Now:yyyyMMdd}.csv";

        if (type == "orders")
        {
            var header = src switch
            {
                "shopee" => "Mã đơn hàng,Trạng thái đơn hàng,Lý do hủy/hoàn,Ngày đặt hàng,Ngày cập nhật," +
                            "Ngày thanh toán,Tên đăng nhập người mua,Tên người nhận,Số điện thoại,Địa chỉ giao hàng," +
                            "Phường/Xã,Quận/Huyện,Tỉnh/Thành phố,Vùng,Mã bưu điện," +
                            "Tên sản phẩm,Phân loại hàng,SKU phân loại,Mã sản phẩm Shopee,Giá gốc (VND)," +
                            "Giá bán (VND),Số lượng,Tổng tiền hàng (VND),Phí vận chuyển (VND),Phí ship gốc (VND)," +
                            "Giảm phí ship sàn (VND),Tổng thanh toán (VND),Phương thức thanh toán," +
                            "Đơn vị vận chuyển,Mã vận đơn,Trạng thái vận chuyển,Loại thực hiện đơn,Ghi chú từ người mua",
                "tiktok" => "Order ID,Order Status,Create Time,Update Time,Paid Time,RTS SLA Time," +
                            "Buyer User ID,Buyer Message,Payment Method,Is COD," +
                            "Recipient Name,Recipient Phone,Full Address,Address Detail,Province,District,Ward,Postal Code,Region Code," +
                            "Shipping Type,Shipping Provider,Tracking Number,Fulfillment Type,Currency," +
                            "Sub Total (VND),Shipping Fee (VND),Original Shipping Fee (VND)," +
                            "Shipping Fee Platform Discount (VND),Seller Discount (VND),Platform Discount (VND)," +
                            "Total Amount (VND),Original Total Product Price (VND)," +
                            "Line Item ID,SKU ID,Product ID,Product Name,Seller SKU,SKU Name," +
                            "Original Price (VND),Sale Price (VND),Platform Discount Item (VND),Seller Discount Item (VND)," +
                            "Package ID,Package Status,Item Tracking Number,Shipping Provider Name,Display Status",
                "lazada" => "Order ID,Order Number,Created At,Updated At,Status,Payment Method," +
                            "Price (VND),Shipping Fee (VND),Shipping Fee Original (VND),Shipping Fee Discount Platform (VND)," +
                            "Voucher (VND),Voucher Platform (VND),Voucher Seller (VND)," +
                            "Customer First Name,Customer Last Name,Address Line 1,City,District (Address3),Ward (Address4),Country," +
                            "Items Count,Warehouse Code,Order Item ID,Item Name,SKU,Shop SKU,Variation," +
                            "Item Price (VND),Paid Price (VND),Shipping Amount (VND),Status Item," +
                            "Shipment Provider,Tracking Code,Currency,Product ID,Product Main Image",
                _ => ""
            };
            var sbOrd = new StringBuilder();
            sbOrd.AppendLine(header);
            var sampleRows = await BuildSampleRowsFromDb(src, tenant.CompanyId!.Value);
            foreach (var row in sampleRows)
                sbOrd.AppendLine(row);
            return File(Encoding.UTF8.GetBytes(sbOrd.ToString()), "text/csv", displayName);
        }

        var productHeader = src switch
        {
            "shopee" => "Mã sản phẩm Shopee,Tên sản phẩm,Mã SKU gốc,Danh mục,ID danh mục,Thương hiệu,Giá gốc (VND),Giá bán (VND),Tồn kho,Tồn kho đặt trước,Trạng thái,Tình trạng,Cân nặng (kg),Chiều dài (cm),Chiều rộng (cm),Chiều cao (cm),Mô tả,Ảnh chính,Có phân loại,Ngày tạo,Ngày cập nhật",
            "tiktok" => "Product ID,Title,Status,Create Time,Update Time,Category ID,Category Name,Brand ID,Brand Name,SKU ID,Seller SKU,SKU Name,Sale Price (VND),Currency,Warehouse ID,Quantity,Color,Size,Image URL,Package Weight (kg),Package Weight Unit,Package Length (cm),Package Width (cm),Package Height (cm),Description",
            "lazada" => "Item ID,Name,Status,Created Time,Updated Time,Primary Category,Brand,Short Description,Seller SKU,Shop SKU,Price (VND),Special Price (VND),Special From,Special To,Quantity,Package Width (cm),Package Height (cm),Package Length (cm),Package Weight (kg),Images,Product URL,Warehouse Code",
            _ => ""
        };
        return File(Encoding.UTF8.GetBytes(productHeader + "\r\n"), "text/csv", displayName);
    }

    // ── Query DB lấy variation thực tế để điền vào template ────────────────
    private record SampleVariation(
        int ProductId, string ProductName, string ParentSku,
        string VarSku, string VarName, string Color, string Size,
        decimal SalePrice, decimal OriginalPrice, int Stock);

    /// <summary>
    /// Logic mới (2026-06-03):
    /// 1. Kiểm tra ngày đơn hàng mới nhất của company trong DB.
    /// 2. Duyệt từ lastOrderDate+1 đến hôm nay.
    /// 3. Mỗi ngày chưa có đơn → tạo 10 dòng mẫu với đủ trạng thái.
    /// 4. Ngày đã có đơn → bỏ qua (idempotent).
    /// 5. Nếu tất cả ngày đều đã có → trả về mảng rỗng (báo "đủ dữ liệu").
    /// Tối đa 90 ngày × 10 = 900 dòng để tránh file quá lớn.
    /// </summary>
    private async Task<string[]> BuildSampleRowsFromDb(string platform, Guid companyId)
    {
        var today = DateTime.Today;
        string DFmt(DateTime d) => d.ToString("dd/MM/yyyy 09:00");
        string IFmt(DateTime d) => d.ToString("yyyy-MM-dd 09:00:00");

        // ── 1. Load dữ liệu từ DB ─────────────────────────────────────────────
        var vars   = new List<SampleVariation>();
        var buyers = new List<(string Name, string Phone, string Ward, string District, string Province)>();
        DateTime? lastOrderDate = null;
        var datesWithOrders = new HashSet<DateTime>();

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var dateCmd = new NpgsqlCommand("""
                SELECT MAX(order_date::date), ARRAY_AGG(DISTINCT order_date::date)
                FROM public.orders WHERE company_id = @cid::uuid
                """, conn);
            dateCmd.Parameters.AddWithValue("cid", companyId.ToString());
            await using (var dr = await dateCmd.ExecuteReaderAsync())
            {
                if (await dr.ReadAsync() && !dr.IsDBNull(0))
                {
                    lastOrderDate = dr.GetDateTime(0);
                    if (!dr.IsDBNull(1))
                    {
                        var arr = (DateTime[]?)dr.GetValue(1);
                        if (arr is not null)
                            foreach (var d in arr) datesWithOrders.Add(d.Date);
                    }
                }
            }

            // Lấy sản phẩm còn hàng (tối đa 15, ưu tiên nhiều tồn kho)
            await using var varCmd = new NpgsqlCommand("""
                SELECT DISTINCT ON (pv.product_id)
                    p.product_id, p.product_name, p.sku,
                    pv.sku, pv.variation_name,
                    COALESCE(pv.attribute_color,'') , COALESCE(pv.attribute_size,''),
                    pv.sale_price, COALESCE(pv.original_price, pv.sale_price),
                    COALESCE(pv.stock_quantity, 99)
                FROM product_variations pv
                JOIN products p ON pv.product_id = p.product_id
                WHERE pv.is_active = TRUE AND p.is_active = TRUE
                  AND pv.company_id = @cid::uuid
                  AND COALESCE(pv.stock_quantity, 99) > 0
                ORDER BY pv.product_id, pv.stock_quantity DESC NULLS LAST LIMIT 15
                """, conn);
            varCmd.Parameters.AddWithValue("cid", companyId.ToString());
            await using (var vr = await varCmd.ExecuteReaderAsync())
            {
                while (await vr.ReadAsync())
                    vars.Add(new SampleVariation(
                        vr.GetInt32(0), vr.GetString(1), vr.GetString(2),
                        vr.GetString(3), vr.GetString(4), vr.GetString(5), vr.GetString(6),
                        vr.GetDecimal(7), vr.GetDecimal(8), vr.GetInt32(9)));
            }

            await using var custCmd = new NpgsqlCommand("""
                SELECT full_name, COALESCE(phone,'0900000000'),
                       COALESCE(ward,'Phường 1'),
                       COALESCE(district,'Quận 1'), COALESCE(province,'Hồ Chí Minh')
                FROM public.customers
                WHERE company_id = @cid::uuid AND is_active = TRUE
                ORDER BY total_orders DESC LIMIT 30
                """, conn);
            custCmd.Parameters.AddWithValue("cid", companyId.ToString());
            await using (var cr = await custCmd.ExecuteReaderAsync())
            {
                while (await cr.ReadAsync())
                {
                    var raw = cr.GetString(0);
                    var name = System.Text.RegularExpressions.Regex.IsMatch(raw, @"^\d+\s")
                        ? raw.Substring(raw.IndexOf(' ') + 1).Trim() : raw;
                    if (name.Length >= 3 && !name.StartsWith("Khách hàng") && !name.StartsWith("Unknown"))
                        buyers.Add((name, cr.GetString(1), cr.GetString(2), cr.GetString(3), cr.GetString(4)));
                }
            }
        }
        catch { /* fallback */ }

        if (vars.Count == 0) return [];
        if (buyers.Count == 0)
            buyers.Add(("Nguyễn Văn An", "0901234567", "Phường 1", "Quận 1", "Hồ Chí Minh"));

        // ── 2. Xác định ngày cần tạo ─────────────────────────────────────────
        var startDate = lastOrderDate.HasValue ? lastOrderDate.Value.AddDays(1).Date : today.AddDays(-6);
        var missingDates = new List<DateTime>();
        for (var d = startDate; d <= today; d = d.AddDays(1))
            if (!datesWithOrders.Contains(d.Date)) missingDates.Add(d.Date);
        if (missingDates.Count > 90) missingDates = missingDates.TakeLast(90).ToList();
        // Không thêm hôm nay nếu đã có đơn — trả về rỗng để báo "đủ dữ liệu"
        if (missingDates.Count == 0) return [];

        // ── 3. Config phân bổ đơn hàng ───────────────────────────────────────
        var statusDist = new[]
        {
            ("COMPLETED",          "DELIVERED", "GHN",  "Giao Hàng Nhanh", 30000m),
            ("COMPLETED",          "DELIVERED", "GHN",  "Giao Hàng Nhanh", 30000m),
            ("COMPLETED",          "DELIVERED", "JT",   "J&T Express",     25000m),
            ("COMPLETED",          "DELIVERED", "GHN",  "Giao Hàng Nhanh", 30000m),
            ("COMPLETED",          "DELIVERED", "GHTK", "GHTK",            25000m),
            ("COMPLETED",          "DELIVERED", "GHN",  "Giao Hàng Nhanh",     0m),
            ("IN_TRANSIT",         "TRANSIT",   "GHN",  "Giao Hàng Nhanh", 30000m),
            ("AWAITING_SHIPMENT",  "AWAITING",  "JT",   "J&T Express",     25000m),
            ("CANCELLED",          "CANCELLED", "GHN",  "Giao Hàng Nhanh",     0m),
            ("UNPAID",             "PENDING",   "GHN",  "Giao Hàng Nhanh", 30000m),
        };
        // Mỗi đơn đúng 1 sản phẩm → 10 dòng CSV = 10 đơn, không bị bỏ qua khi import
        int[] itemsPerSlot = { 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 };
        // Số lượng: 1 phổ biến, đôi khi 2, hiếm khi 3
        int[] qtyTable = { 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 3, 1, 1, 1, 1, 2 };

        var plt = platform.ToLower();
        var pfx = plt == "tiktok" ? "TKT" : plt == "shopee" ? "SPE" : "LZD";
        var rows     = new List<string>();
        int varPool  = 0;
        int orderSeq = 0;

        foreach (var day in missingDates)
        {
            var dayStr = day.ToString("yyMMdd");
            for (int slot = 0; slot < 10; slot++)
            {
                var (orderStatus, pkgStatus, carrier, carrierName, shipFee) = statusDist[slot];
                var b          = buyers[orderSeq % buyers.Count];
                var seq        = $"{orderSeq:D4}";
                var orderCode  = $"{pfx}{dayStr}{seq}";
                var trackNum   = pkgStatus is "CANCELLED" or "PENDING" ? "" : $"{carrier}{dayStr}{seq}";
                var origShip   = shipFee > 0 ? shipFee + 5000 : 0m;
                var shipDisc   = origShip > shipFee ? origShip - shipFee : 0m;
                var buyerLogin = $"user_{b.Name.Replace(" ", "").ToLower()[..Math.Min(8, b.Name.Replace(" ", "").Length)]}";

                // ── Chọn sản phẩm cho đơn (không trùng trong cùng đơn) ───────
                int numItems = itemsPerSlot[slot];
                var orderItems = new List<(SampleVariation v, int qty, long subTotal)>();
                var usedIds    = new HashSet<int>();
                for (int i = 0; i < numItems; i++)
                {
                    SampleVariation? v = null;
                    for (int attempt = 0; attempt < vars.Count; attempt++)
                    {
                        var cand = vars[(varPool + attempt) % vars.Count];
                        if (!usedIds.Contains(cand.ProductId)) { v = cand; varPool += attempt + 1; break; }
                    }
                    if (v is null) { v = vars[varPool % vars.Count]; varPool++; }
                    usedIds.Add(v.ProductId);

                    int qty = qtyTable[(varPool + i) % qtyTable.Length];
                    // Không đặt quá tồn kho
                    qty = Math.Clamp(qty, 1, Math.Max(1, v.Stock));
                    orderItems.Add((v, qty, (long)v.SalePrice * qty));
                }

                long grandItemTotal = orderItems.Sum(x => x.subTotal);
                long orderTotal     = orderStatus == "CANCELLED" ? 0L : grandItemTotal + (long)shipFee;

                // ── Status labels ─────────────────────────────────────────────
                string shopeeStatus = orderStatus switch
                {
                    "COMPLETED"         => "Hoàn thành",
                    "IN_TRANSIT"        => "Đang vận chuyển",
                    "AWAITING_SHIPMENT" => "Đã xử lý",
                    "UNPAID"            => "Chưa thanh toán",
                    "CANCELLED"         => "Đã hủy",
                    _                   => "Hoàn hàng",
                };
                string shopeeCancel = orderStatus == "CANCELLED" ? "Người mua hủy" :
                                      orderStatus == "RETURNED"  ? "Hàng bị lỗi" : "";
                string shopeePaid   = orderStatus is "UNPAID" or "CANCELLED" ? "" : DFmt(day);
                string tiktokPaid   = orderStatus == "UNPAID" ? "" : IFmt(day);
                string lzStatus     = orderStatus switch
                {
                    "COMPLETED"         => "DELIVERED",
                    "IN_TRANSIT"        => "SHIPPED",
                    "AWAITING_SHIPMENT" => "READY_TO_SHIP",
                    "UNPAID"            => "PENDING",
                    "CANCELLED"         => "CANCELLED",
                    _                   => "RETURNED",
                };
                string shopeePkg = pkgStatus switch
                {
                    "DELIVERED" => "Đã giao hàng",
                    "TRANSIT"   => "Đang giao hàng",
                    "AWAITING"  => "Chờ lấy hàng",
                    "CANCELLED" => "Đã hủy",
                    _           => "",
                };

                // ── Emit 1 CSV row mỗi sản phẩm ──────────────────────────────
                for (int i = 0; i < orderItems.Count; i++)
                {
                    var (v, qty, sub) = orderItems[i];
                    var lineId   = $"LI{dayStr}{seq}{i}";
                    var pkgId    = $"PKG{dayStr}{seq}";
                    var itemCode = $"ITEM{dayStr}{seq}{i}";

                    rows.Add(plt switch
                    {
                        "shopee" => string.Join(",",
                            orderCode, shopeeStatus, shopeeCancel,
                            DFmt(day), DFmt(day.AddDays(1)), shopeePaid,
                            buyerLogin, b.Name, b.Phone,
                            $"Số {orderSeq + 1} đường {b.District}",
                            b.Ward, b.District, b.Province, "Miền Nam", "70000",
                            v.ProductName, v.VarName, v.VarSku, v.ProductId,
                            (long)v.OriginalPrice, (long)v.SalePrice, qty,
                            sub, (long)shipFee, (long)origShip, (long)shipDisc, orderTotal,
                            slot % 2 == 0 ? "COD" : "Ví ShopeePay",
                            carrierName, trackNum, shopeePkg, "Tự giao", ""),

                        "tiktok" => string.Join(",",
                            orderCode, orderStatus,
                            IFmt(day), IFmt(day.AddDays(1)), tiktokPaid,
                            "", buyerLogin, "", slot % 2 == 0 ? "COD" : "BANK_TRANSFER",
                            slot % 2 == 0 ? "TRUE" : "FALSE",
                            b.Name, b.Phone,
                            $"Số {orderSeq + 1} {b.District} {b.Province}",
                            $"Số {orderSeq + 1} {b.District}",
                            b.Province, b.District, b.Ward,
                            "70000", "VN", "STANDARD",
                            carrier, trackNum, "CROSS_BORDER", "VND",
                            grandItemTotal, (long)shipFee, (long)origShip, (long)shipDisc, "0", "0",
                            orderTotal, grandItemTotal,
                            lineId, $"SKU{seq}{i}", v.ProductId,
                            v.ProductName, v.VarSku, v.VarName,
                            (long)v.OriginalPrice, (long)v.SalePrice, "0", "0",
                            pkgId, pkgStatus, trackNum, carrierName, orderStatus),

                        "lazada" => string.Join(",",
                            $"{10000 + orderSeq}", orderCode,
                            IFmt(day), IFmt(day.AddDays(1)), lzStatus,
                            slot % 2 == 0 ? "COD" : "LAZADA_WALLET",
                            orderTotal, (long)shipFee, (long)origShip, (long)shipDisc,
                            "0", "0", "0",
                            b.Name.Split(' ').First(),
                            string.Join(" ", b.Name.Split(' ').Skip(1)),
                            $"Số {orderSeq + 1} {b.District}", b.Province,
                            b.District, b.Ward, "Vietnam",
                            orderItems.Count, "WH001", itemCode,
                            v.ProductName, v.VarSku, v.VarSku, v.VarName,
                            (long)v.SalePrice,
                            orderStatus == "CANCELLED" ? "0" : sub.ToString(),
                            (long)shipFee, lzStatus,
                            carrier, trackNum, "VND", v.ProductId, ""),

                        _ => ""
                    });
                }

                orderSeq++;
            }
        }
        return [.. rows];
    }

    // ── POST /api/import/platform-orders ─────────────────────────────────────
    // Auto-detect format từ header CSV → parse → insert OLTP
    [HttpPost("platform-orders")]
    public async Task<IActionResult> ImportPlatformOrders(IFormFile file, [FromQuery] string source = "auto")
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        List<string[]> rows;
        try { rows = ParseCsv(file.OpenReadStream()); }
        catch { return BadRequest(new { message = "Không thể đọc file. Kiểm tra định dạng CSV." }); }

        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        var headers = rows[0];

        // Auto-detect platform từ header nếu source = "auto"
        var platform = source.ToLower() switch
        {
            "shopee" => "shopee",
            "tiktok" => "tiktok",
            "lazada" => "lazada",
            _ => DetectPlatform(headers),
        };

        if (platform is null)
            return BadRequest(new
            {
                message = "Không nhận diện được format sàn. Vui lòng chọn nguồn (shopee/tiktok/lazada) hoặc kiểm tra header CSV.",
                detectedHeaders = headers.Take(5),
            });

        NpgsqlConnection conn;
        try { conn = new NpgsqlConnection(_connStr); await conn.OpenAsync(); }
        catch { return StatusCode(503, new { message = "Không thể kết nối cơ sở dữ liệu." }); }
        await using var _ = conn;

        int success = 0, skipped = 0;
        var errors         = new List<object>();
        var skippedDetails = new List<object>();

        for (int r = 1; r < rows.Count; r++)
        {
            try
            {
                var mapped = platform switch
                {
                    "shopee" => MapShopeeRow(rows[r], headers),
                    "tiktok" => MapTikTokRow(rows[r], headers),
                    "lazada" => MapLazadaRow(rows[r], headers),
                    _        => null,
                };

                if (mapped is null || string.IsNullOrEmpty(mapped.OrderCode))
                {
                    skipped++;
                    skippedDetails.Add(new { row = r + 1, orderCode = (string?)null, reason = "Thiếu mã đơn hàng hoặc không đọc được dòng dữ liệu" });
                    continue;
                }

                // Chuẩn hóa status → MSAS internal (record dùng with-expression)
                mapped = mapped with { Status = NormalizeStatus(mapped.Status, platform) };

                var affected = await UpsertOrder(conn, mapped);
                if (affected > 0) success++;
                else
                {
                    skipped++;
                    skippedDetails.Add(new { row = r + 1, orderCode = mapped.OrderCode, reason = "Đơn hàng đã tồn tại (mã trùng)" });
                }
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
                skippedDetails.Add(new { row = r + 1, orderCode = (string?)null, reason = $"Lỗi xử lý: {ex.Message}" });
            }
        }

        // Ghi audit log + trigger ETL sync lên DW sau khi import thành công
        int dwInserted = 0;
        string dwMessage = "";

        if (success > 0)
        {
            var userId   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null;
            var username = User.FindFirstValue(ClaimTypes.Name) ?? "";
            await audit.LogAsync(
                userId:     userId,
                username:   username,
                action:     "IMPORT_CSV",
                entityType: "Order",
                entityId:   platform,
                newValue:   $"imported={success} skipped={skipped} file={file.FileName}",
                status:     "SUCCESS");

            // Tự động sync OLTP → Data Warehouse sau khi import
            try
            {
                var dwResult = await aiProxy.TriggerOltpToDwAsync(
                    channel:   platform,
                    companyId: tenant.CompanyId?.ToString());

                if (dwResult is not null)
                {
                    dwInserted = int.TryParse(dwResult.GetValueOrDefault("inserted")?.ToString(), out var di) ? di : 0;
                    dwMessage  = $"Đã đồng bộ {dwInserted} bản ghi lên Data Warehouse.";
                }
                else
                {
                    dwMessage = "AI Service chưa sẵn sàng — DW sẽ được đồng bộ tự động trong lần sync tiếp theo.";
                }
            }
            catch
            {
                dwMessage = "Không thể kết nối AI Service — DW sẽ được đồng bộ tự động trong lần sync tiếp theo.";
            }
        }

        return Ok(new
        {
            success,
            skipped,
            errors,
            skippedDetails,
            platform,
            dwInserted,
            dwMessage,
            message = success > 0
                ? $"Đã import {success} đơn hàng từ {platform}. {dwMessage}"
                : $"Không có đơn hàng mới — {skipped} bỏ qua (đã tồn tại hoặc thiếu dữ liệu).",
        });
    }

    // ── Platform detection ───────────────────────────────────────────────────

    private static string? DetectPlatform(string[] headers)
    {
        var h = headers.Select(x => x.Trim().ToLower()).ToHashSet();
        // Shopee: tiếng Việt — "mã đơn hàng" + tiêu chí Shopee
        if (h.Contains("mã đơn hàng") && (
                h.Contains("tên đăng nhập người mua") ||
                h.Contains("tên người mua") ||
                h.Any(x => x.Contains("tên người dùng")) ||
                h.Contains("phân loại hàng") ||
                h.Contains("sku phân loại")))
            return "shopee";
        // TikTok: "order id" + ("buyer user id" hoặc "buyer username" hoặc "is cod")
        if (h.Contains("order id") && (h.Contains("buyer user id") || h.Contains("buyer username") || h.Contains("is cod")))
            return "tiktok";
        // Lazada: "order id" + "order number" (hoặc "customer first name")
        if (h.Contains("order id") && (h.Contains("order number") || h.Contains("customer first name") || h.Contains("price (vnd)")))
            return "lazada";
        return null;
    }

    // ── Field mappers ─────────────────────────────────────────────────────────

    private record MappedOrder(
        string OrderCode, string PlatformOrderId, string CustomerUsername, string RecipientName,
        string Phone, string Province, string District, string Ward,
        string ShippingAddress, string ShippingFullAddress,
        string ProductName, string Sku, string VariationName,
        decimal UnitPrice, decimal SalePrice, decimal OriginalPrice,
        int Quantity, decimal TotalAmount, decimal ShippingFee,
        decimal OriginalShippingFee, decimal ShippingFeeDiscount,
        decimal SellerDiscount, decimal PlatformDiscount,
        string PaymentMethod, bool IsCod,
        string TrackingNumber, string ShippingCarrier, string LogisticsStatus,
        string FulfillmentType, string PlatformStatus,
        // Status = MSAS normalized (PENDING/SHIPPING/DELIVERED/CANCELLED/RETURNED)
        // được gán lại bởi NormalizeStatus() từ PlatformStatus raw
        string Status,
        DateTime OrderDate, string Channel,
        // GHN fields (vận đơn GHN riêng)
        string GhnOrderCode = "",
        // Platform item IDs
        long? ShopeeItemId = null, string TiktokProductId = "");

    private static int HeaderIndex(string[] headers, params string[] candidates)
    {
        var h = headers.Select(x => x.Trim().ToLower()).ToList();
        foreach (var c in candidates)
        {
            var idx = h.FindIndex(x => x == c.ToLower());
            if (idx >= 0) return idx;
        }
        return -1;
    }

    private static string ColVal(string[] row, int idx) =>
        idx >= 0 && idx < row.Length ? row[idx].Trim('"', ' ') : string.Empty;

    private static MappedOrder? MapShopeeRow(string[] row, string[] headers)
    {
        var code = ColVal(row, HeaderIndex(headers, "Mã đơn hàng"));
        if (string.IsNullOrEmpty(code)) return null;

        var dateStr   = ColVal(row, HeaderIndex(headers, "Ngày đặt hàng"));
        var orderDate = ParseViDate(dateStr);

        var totalStr  = ColVal(row, HeaderIndex(headers, "Tổng thanh toán (VND)", "Tổng thanh toán"));
        decimal.TryParse(totalStr.Replace(".","").Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var total);
        var priceStr  = ColVal(row, HeaderIndex(headers, "Giá bán (VND)", "Giá niêm yết (VND)"));
        decimal.TryParse(priceStr.Replace(".","").Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        var origStr   = ColVal(row, HeaderIndex(headers, "Giá gốc (VND)"));
        decimal.TryParse(origStr.Replace(".","").Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        var feeStr    = ColVal(row, HeaderIndex(headers, "Phí vận chuyển (VND)"));
        decimal.TryParse(feeStr.Replace(".","").Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var shippingFee);
        var origFeeStr = ColVal(row, HeaderIndex(headers, "Phí ship gốc (VND)"));
        decimal.TryParse(origFeeStr.Replace(".","").Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origFee);
        var discFeeStr = ColVal(row, HeaderIndex(headers, "Giảm phí ship sàn (VND)"));
        decimal.TryParse(discFeeStr.Replace(".","").Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var feeDiscount);
        var qtyStr    = ColVal(row, HeaderIndex(headers, "Số lượng"));
        int.TryParse(qtyStr, out var qty); if (qty <= 0) qty = 1;

        var shopeeItemIdStr = ColVal(row, HeaderIndex(headers, "Mã sản phẩm Shopee"));
        long.TryParse(shopeeItemIdStr, out var shopeeItemId);

        return new MappedOrder(
            OrderCode:           code,
            PlatformOrderId:     code,
            CustomerUsername:    ColVal(row, HeaderIndex(headers, "Tên đăng nhập người mua", "Tên người mua", "Tên người dùng (Tên đăng nhập)")),
            RecipientName:       ColVal(row, HeaderIndex(headers, "Tên người nhận")),
            Phone:               ColVal(row, HeaderIndex(headers, "Số điện thoại")),
            Province:            ColVal(row, HeaderIndex(headers, "Tỉnh/Thành phố", "Tỉnh/Thành", "Tỉnh")),
            District:            ColVal(row, HeaderIndex(headers, "Quận/Huyện", "Thành phố")),
            Ward:                ColVal(row, HeaderIndex(headers, "Phường/Xã")),
            ShippingAddress:     ColVal(row, HeaderIndex(headers, "Địa chỉ giao hàng")),
            ShippingFullAddress: string.Join(", ", new[] {
                ColVal(row, HeaderIndex(headers, "Địa chỉ giao hàng")),
                ColVal(row, HeaderIndex(headers, "Phường/Xã")),
                ColVal(row, HeaderIndex(headers, "Quận/Huyện", "Thành phố")),
                ColVal(row, HeaderIndex(headers, "Tỉnh/Thành phố", "Tỉnh/Thành", "Tỉnh")),
            }.Where(s => !string.IsNullOrEmpty(s))),
            ProductName:         ColVal(row, HeaderIndex(headers, "Tên sản phẩm")),
            Sku:                 ColVal(row, HeaderIndex(headers, "SKU phân loại", "SKU sản phẩm")),
            VariationName:       ColVal(row, HeaderIndex(headers, "Phân loại hàng")),
            UnitPrice:           origPrice > 0 ? origPrice : salePrice,
            SalePrice:           salePrice,
            OriginalPrice:       origPrice,
            Quantity:            qty,
            TotalAmount:         total,
            ShippingFee:         shippingFee,
            OriginalShippingFee: origFee,
            ShippingFeeDiscount: feeDiscount,
            SellerDiscount:      0,
            PlatformDiscount:    0,
            PaymentMethod:       ColVal(row, HeaderIndex(headers, "Phương thức thanh toán")),
            IsCod:               ColVal(row, HeaderIndex(headers, "Phương thức thanh toán")).Equals("COD", StringComparison.OrdinalIgnoreCase)
                               || ColVal(row, HeaderIndex(headers, "Phương thức thanh toán")).Contains("Delivery", StringComparison.OrdinalIgnoreCase),
            TrackingNumber:      ColVal(row, HeaderIndex(headers, "Mã vận đơn")),
            ShippingCarrier:     ColVal(row, HeaderIndex(headers, "Đơn vị vận chuyển")),
            LogisticsStatus:     ColVal(row, HeaderIndex(headers, "Trạng thái vận chuyển")),
            FulfillmentType:     ColVal(row, HeaderIndex(headers, "Loại thực hiện đơn")),
            PlatformStatus:      ColVal(row, HeaderIndex(headers, "Trạng thái đơn hàng")),
            Status:              ColVal(row, HeaderIndex(headers, "Trạng thái đơn hàng")),
            OrderDate:           orderDate,
            Channel:             "shopee",
            ShopeeItemId:        shopeeItemId > 0 ? shopeeItemId : null
        );
    }

    private static MappedOrder? MapTikTokRow(string[] row, string[] headers)
    {
        var code = ColVal(row, HeaderIndex(headers, "Order ID"));
        if (string.IsNullOrEmpty(code)) return null;

        var createTimeStr = ColVal(row, HeaderIndex(headers, "Create Time", "Order Creation Time"));
        DateTime orderDate;
        // Create Time có thể là unix timestamp (số nguyên) hoặc ISO string
        if (long.TryParse(createTimeStr, out var unixTs))
            orderDate = DateTimeOffset.FromUnixTimeSeconds(unixTs).UtcDateTime;
        else
            orderDate = DateTime.TryParse(createTimeStr, out var od) ? od.ToUniversalTime() : DateTime.UtcNow;

        var totalStr = ColVal(row, HeaderIndex(headers, "Total Amount (VND)", "Order Amount"));
        decimal.TryParse(totalStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var total);
        var salePriceStr = ColVal(row, HeaderIndex(headers, "Sale Price (VND)", "After-discount Price"));
        decimal.TryParse(salePriceStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        var origStr = ColVal(row, HeaderIndex(headers, "Original Price (VND)", "Original Price"));
        decimal.TryParse(origStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        var subStr = ColVal(row, HeaderIndex(headers, "Sub Total (VND)", "Subtotal"));
        decimal.TryParse(subStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var subtotal);
        var feeStr = ColVal(row, HeaderIndex(headers, "Shipping Fee (VND)"));
        decimal.TryParse(feeStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var shippingFee);
        var origFeeStr = ColVal(row, HeaderIndex(headers, "Original Shipping Fee (VND)"));
        decimal.TryParse(origFeeStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origFee);
        var feeDiscStr = ColVal(row, HeaderIndex(headers, "Shipping Fee Platform Discount (VND)"));
        decimal.TryParse(feeDiscStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var feeDiscount);
        var sellerDiscStr = ColVal(row, HeaderIndex(headers, "Seller Discount (VND)"));
        decimal.TryParse(sellerDiscStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var sellerDiscount);
        var platDiscStr = ColVal(row, HeaderIndex(headers, "Platform Discount (VND)"));
        decimal.TryParse(platDiscStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var platDiscount);
        var qtyStr = ColVal(row, HeaderIndex(headers, "Quantity"));
        int.TryParse(qtyStr, out var qty); if (qty <= 0) qty = 1;
        var isCodStr = ColVal(row, HeaderIndex(headers, "Is COD")).ToLower();
        var isCod = isCodStr is "true" or "1" or "yes" or "có";

        return new MappedOrder(
            OrderCode:           code,
            PlatformOrderId:     code,
            CustomerUsername: ColVal(row, HeaderIndex(headers, "Buyer User ID", "Buyer Username")),
            RecipientName:       ColVal(row, HeaderIndex(headers, "Recipient Name", "Recipient")),
            Phone:               ColVal(row, HeaderIndex(headers, "Recipient Phone", "Phone", "Phone #")),
            Province:            ColVal(row, HeaderIndex(headers, "Province")),
            District:            ColVal(row, HeaderIndex(headers, "District", "City")),
            Ward:                ColVal(row, HeaderIndex(headers, "Ward")),
            ShippingAddress:     ColVal(row, HeaderIndex(headers, "Address Detail")),
            ShippingFullAddress: ColVal(row, HeaderIndex(headers, "Full Address")),
            ProductName:         ColVal(row, HeaderIndex(headers, "Product Name")),
            Sku:                 ColVal(row, HeaderIndex(headers, "Seller SKU")),
            VariationName:       ColVal(row, HeaderIndex(headers, "SKU Name")),
            UnitPrice:           origPrice > 0 ? origPrice : salePrice,
            SalePrice:           salePrice,
            OriginalPrice:       origPrice,
            Quantity:            qty,
            TotalAmount:         total > 0 ? total : subtotal,
            ShippingFee:         shippingFee,
            OriginalShippingFee: origFee,
            ShippingFeeDiscount: feeDiscount,
            SellerDiscount:      sellerDiscount,
            PlatformDiscount:    platDiscount,
            PaymentMethod:       ColVal(row, HeaderIndex(headers, "Payment Method", "Payment Method Name")),
            IsCod:               isCod,
            TrackingNumber:      ColVal(row, HeaderIndex(headers, "Item Tracking Number", "Tracking Number", "Tracking ID")),
            ShippingCarrier:     ColVal(row, HeaderIndex(headers, "Shipping Provider", "Shipping Provider Name")),
            LogisticsStatus:     ColVal(row, HeaderIndex(headers, "Package Status")),
            FulfillmentType:     ColVal(row, HeaderIndex(headers, "Fulfillment Type")),
            PlatformStatus:      ColVal(row, HeaderIndex(headers, "Order Status")),
            Status:              ColVal(row, HeaderIndex(headers, "Order Status")),
            OrderDate:           orderDate,
            Channel:             "tiktok",
            TiktokProductId:     ColVal(row, HeaderIndex(headers, "Product ID"))
        );
    }

    private static MappedOrder? MapLazadaRow(string[] row, string[] headers)
    {
        // Lazada: Order Number là mã chính, Order ID là mã phụ
        var orderNumber = ColVal(row, HeaderIndex(headers, "Order Number"));
        var orderId     = ColVal(row, HeaderIndex(headers, "Order ID"));
        var code = !string.IsNullOrEmpty(orderNumber) ? orderNumber : orderId;
        if (string.IsNullOrEmpty(code)) return null;

        var createdStr = ColVal(row, HeaderIndex(headers, "Created At"));
        // Lazada trả về ISO 8601 với timezone +07:00
        var orderDate = DateTime.TryParse(createdStr, null, System.Globalization.DateTimeStyles.RoundtripKind, out var od)
            ? od.ToUniversalTime()
            : DateTime.UtcNow;

        // Price (VND) là tổng đơn hàng (STRING theo Lazada spec)
        var totalStr  = ColVal(row, HeaderIndex(headers, "Price (VND)", "Order Value (VND)", "Order Value"));
        decimal.TryParse(totalStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var total);
        var paidStr   = ColVal(row, HeaderIndex(headers, "Paid Price (VND)", "Paid Price"));
        decimal.TryParse(paidStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        var unitStr   = ColVal(row, HeaderIndex(headers, "Item Price (VND)", "Unit Price (VND)", "Unit Price"));
        decimal.TryParse(unitStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        var feeStr    = ColVal(row, HeaderIndex(headers, "Shipping Fee (VND)", "Shipping Fee", "Shipping Amount (VND)"));
        decimal.TryParse(feeStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var shippingFee);
        var qtyStr    = ColVal(row, HeaderIndex(headers, "Quantity"));
        int.TryParse(qtyStr, out var qty); if (qty <= 0) qty = 1;

        var firstName     = ColVal(row, HeaderIndex(headers, "Customer First Name"));
        var lastName      = ColVal(row, HeaderIndex(headers, "Customer Last Name"));
        var recipientName = (firstName + " " + lastName).Trim();
        if (string.IsNullOrWhiteSpace(recipientName))
            recipientName = ColVal(row, HeaderIndex(headers, "Shipping Name", "Customer Name"));

        // Lazada Vietnam: "City" = tỉnh/thành phố, "District (Address3)" = quận/huyện
        var city      = ColVal(row, HeaderIndex(headers, "City"));
        var address3  = ColVal(row, HeaderIndex(headers, "District (Address3)", "Address3"));
        var address4  = ColVal(row, HeaderIndex(headers, "Ward (Address4)", "Address4"));
        var addrLine1 = ColVal(row, HeaderIndex(headers, "Address Line 1"));
        var country   = ColVal(row, HeaderIndex(headers, "Country"));
        var phone     = ColVal(row, HeaderIndex(headers, "Phone", "Shipping Phone", "Buyer Phone"));

        // Email fallback: dùng tên+mã đơn khi Lazada CSV không có phone/email
        var lazadaEmail = !string.IsNullOrEmpty(phone) ? phone
                        : !string.IsNullOrEmpty(recipientName)
                            ? $"{recipientName.Replace(" ", "").ToLower()}_{code}@import.local"
                            : $"{code}@import.local";

        return new MappedOrder(
            OrderCode:           code,
            PlatformOrderId:     orderId,
            CustomerUsername:    lazadaEmail,
            RecipientName:       recipientName,
            Phone:               phone,
            Province:            city,       // Lazada "City" = tỉnh/thành phố
            District:            address3,   // Lazada "District (Address3)" = quận/huyện
            Ward:                address4,
            ShippingAddress:     addrLine1,
            ShippingFullAddress: string.Join(", ", new[] { addrLine1, address4, city, address3, country }
                                     .Where(s => !string.IsNullOrEmpty(s))),
            ProductName:         ColVal(row, HeaderIndex(headers, "Item Name")),
            Sku:                 ColVal(row, HeaderIndex(headers, "SKU", "Seller SKU", "Shop SKU")),
            VariationName:       ColVal(row, HeaderIndex(headers, "Variation")),
            UnitPrice:           origPrice > 0 ? origPrice : salePrice,
            SalePrice:           salePrice,
            OriginalPrice:       origPrice,
            Quantity:            qty,
            TotalAmount:         total,
            ShippingFee:         shippingFee,
            OriginalShippingFee: 0,
            ShippingFeeDiscount: 0,
            SellerDiscount:      0,
            PlatformDiscount:    0,
            PaymentMethod:       ColVal(row, HeaderIndex(headers, "Payment Method")),
            IsCod:               ColVal(row, HeaderIndex(headers, "Payment Method")).Equals("COD", StringComparison.OrdinalIgnoreCase),
            TrackingNumber:      ColVal(row, HeaderIndex(headers, "Tracking Code")),
            ShippingCarrier:     ColVal(row, HeaderIndex(headers, "Shipment Provider")),
            LogisticsStatus:     ColVal(row, HeaderIndex(headers, "Status Item", "Status")),
            FulfillmentType:     "FULFILLMENT_BY_SELLER",
            PlatformStatus:      ColVal(row, HeaderIndex(headers, "Status")),
            Status:              ColVal(row, HeaderIndex(headers, "Status")),
            OrderDate:           orderDate,
            Channel:             "lazada"
        );
    }

    // ── Parse date tiếng Việt dd/MM/yyyy HH:mm hoặc ISO ─────────────────────────
    private static DateTime ParseViDate(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return DateTime.UtcNow;
        if (DateTime.TryParseExact(s, new[] { "dd/MM/yyyy HH:mm", "dd/MM/yyyy", "d/M/yyyy HH:mm", "d/M/yyyy" },
                CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d1))
            return d1.ToUniversalTime();
        if (DateTime.TryParse(s, null, System.Globalization.DateTimeStyles.RoundtripKind, out var d2))
            return d2.ToUniversalTime();
        return DateTime.UtcNow;
    }

    // ── Normalize status → MSAS internal (UPPERCASE theo DB constraint) ────────

    private static string NormalizeStatus(string raw, string platform)
    {
        var s = (raw ?? "").Trim().ToUpper();
        return platform switch
        {
            "shopee" => s switch
            {
                "HOÀN THÀNH" or "COMPLETED"     => "DELIVERED",
                "ĐANG VẬN CHUYỂN" or "SHIPPED"  => "SHIPPING",
                "PROCESSED" or "ĐÃ XỬ LÝ"       => "CONFIRMED",
                "UNPAID" or "CHƯA THANH TOÁN"   => "PENDING",
                "ĐÃ HỦY" or "CANCELLED"          => "CANCELLED",
                "RETURN_REFUND" or "HOÀN HÀNG"  => "RETURNED",
                _ => "PENDING",
            },
            "tiktok" => s switch
            {
                "COMPLETED" or "105"                      => "DELIVERED",
                "IN_TRANSIT" or "121"                     => "SHIPPING",
                "AWAITING_SHIPMENT" or "111"              => "CONFIRMED",
                "UNPAID" or "100"                         => "PENDING",
                "CANCELLED" or "106"                      => "CANCELLED",
                "RETURNED" or "RETURN_REFUND" or "122"    => "RETURNED",
                _ => "PENDING",
            },
            "lazada" => s switch
            {
                "DELIVERED"                               => "DELIVERED",
                "SHIPPED" or "READY_TO_SHIP"              => "SHIPPING",
                "PENDING" or "CONFIRMED"                  => "PENDING",
                "CANCELLED" or "CANCELED"                 => "CANCELLED",
                "RETURNED" or "RETURN_FAILED_DELIVERY"    => "RETURNED",
                _ => "PENDING",
            },
            _ => "PENDING",
        };
    }

    // ── Upsert 1 đơn hàng vào OLTP ───────────────────────────────────────────

    private async Task<int> UpsertOrder(NpgsqlConnection conn, MappedOrder o)
    {
        // Tìm channel theo tên hoặc loại kênh (vd: "shopee" match cả "Shopee Phú Thịnh" lẫn channel_type='SHOPEE')
        // Khớp linh hoạt: "tiktok" match cả "TIKTOK_SHOP", "tiktok" match "TIKTOK", v.v.
        var channelSql = """
            SELECT channel_id FROM public.sales_channels
            WHERE (LOWER(channel_name) = LOWER(@ch)
               OR LOWER(channel_type) = LOWER(@ch)
               OR LOWER(channel_type) LIKE '%' || LOWER(@ch) || '%')
              AND company_id = @cid::uuid
            LIMIT 1
            """;
        await using var chCmd = new NpgsqlCommand(channelSql, conn);
        chCmd.Parameters.AddWithValue("ch",  o.Channel);
        chCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        var channelIdObj = await chCmd.ExecuteScalarAsync();
        // Nếu không có channel thì không thể insert đúng FK — bỏ qua
        if (channelIdObj is null or DBNull) return 0;
        int channelId = Convert.ToInt32(channelIdObj);

        // Tìm hoặc tạo customer theo username/phone — dùng SELECT-then-INSERT để tránh lỗi ON CONFLICT
        // vì customers.email không có UNIQUE constraint (chỉ customer_code và phone+company_id là unique)
        var customerEmail = string.IsNullOrEmpty(o.CustomerUsername)
            ? $"{o.Phone}@import.local"
            : $"{o.CustomerUsername}@import.local";

        await using var findCuCmd = new NpgsqlCommand(
            "SELECT customer_id FROM public.customers WHERE email=@email AND company_id=@cid::uuid LIMIT 1", conn);
        findCuCmd.Parameters.AddWithValue("email", customerEmail);
        findCuCmd.Parameters.AddWithValue("cid",   tenant.CompanyId!.Value.ToString());
        var cusIdObj = await findCuCmd.ExecuteScalarAsync();
        int customerId;
        if (cusIdObj is null or DBNull)
        {
            var insertCuSql = """
                INSERT INTO public.customers
                    (email, full_name, phone, province, district, is_active, company_id, created_at, updated_at)
                VALUES
                    (@email, @name, @phone, @province, @district, TRUE, @cid::uuid, NOW(), NOW())
                RETURNING customer_id
                """;
            await using var insertCuCmd = new NpgsqlCommand(insertCuSql, conn);
            insertCuCmd.Parameters.AddWithValue("email",    customerEmail);
            insertCuCmd.Parameters.AddWithValue("name",     o.RecipientName.Length > 0 ? o.RecipientName : "Unknown");
            insertCuCmd.Parameters.AddWithValue("phone",    (object?)o.Phone ?? DBNull.Value);
            insertCuCmd.Parameters.AddWithValue("province", (object?)o.Province ?? DBNull.Value);
            insertCuCmd.Parameters.AddWithValue("district", (object?)o.District ?? DBNull.Value);
            insertCuCmd.Parameters.AddWithValue("cid",      tenant.CompanyId!.Value.ToString());
            customerId = Convert.ToInt32(await insertCuCmd.ExecuteScalarAsync() ?? 0);
        }
        else
        {
            customerId = Convert.ToInt32(cusIdObj);
        }

        // Detect category từ tên sản phẩm (thay vì để "Nhập khẩu")
        int defaultCatId = GuessProductCategoryId(o.ProductName, conn, tenant.CompanyId!.Value);
        if (defaultCatId == 0)
            defaultCatId = await GetOrCreateCategoryAsync(conn, "Thời trang", tenant.CompanyId!.Value);

        // Bước 1: Kiểm tra SKU có khớp biến thể đã có trong catalog không
        // Nếu có → dùng product cha + variation_id, KHÔNG tạo product mới
        int productId;
        int? variationId = null;
        var importSku = o.Sku.Length > 0 ? o.Sku : "";

        await using var varChk = new NpgsqlCommand("""
            SELECT product_id, id
            FROM public.product_variations
            WHERE sku = @sku AND company_id = @cid::uuid AND is_active = TRUE
            LIMIT 1
            """, conn);
        varChk.Parameters.AddWithValue("sku", importSku);
        varChk.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        await using (var varR = await varChk.ExecuteReaderAsync())
        {
            if (await varR.ReadAsync())
            {
                productId  = varR.GetInt32(0);
                variationId = varR.GetInt32(1);
            }
            else
            {
                productId = 0;
            }
        }

        if (productId == 0)
        {
            // Bước 2: Tìm hoặc tạo product theo SKU (behavior gốc)
            var productSql = """
                INSERT INTO public.products
                    (sku, product_name, base_price, cost_price, category_id, is_active, company_id, created_at, updated_at)
                VALUES
                    (@sku, @name, @price, 0, @catId, TRUE, @cid::uuid, NOW(), NOW())
                ON CONFLICT (sku, company_id) DO NOTHING
                RETURNING product_id
                """;
            await using var prCmd = new NpgsqlCommand(productSql, conn);
            prCmd.Parameters.AddWithValue("sku",   importSku.Length > 0 ? importSku : $"IMPORT-{Guid.NewGuid():N}"[..20]);
            prCmd.Parameters.AddWithValue("name",  o.ProductName.Length > 0 ? o.ProductName : importSku);
            prCmd.Parameters.AddWithValue("price", o.UnitPrice);
            prCmd.Parameters.AddWithValue("catId", defaultCatId);
            prCmd.Parameters.AddWithValue("cid",   tenant.CompanyId!.Value.ToString());
            var prodIdObj = await prCmd.ExecuteScalarAsync();
            if (prodIdObj is null or DBNull)
            {
                await using var getCmd = new NpgsqlCommand(
                    "SELECT product_id FROM public.products WHERE sku=@sku AND company_id=@cid::uuid LIMIT 1", conn);
                getCmd.Parameters.AddWithValue("sku", importSku);
                getCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
                productId = Convert.ToInt32(await getCmd.ExecuteScalarAsync() ?? 0);
            }
            else { productId = Convert.ToInt32(prodIdObj); }
        }

        if (customerId <= 0 || productId <= 0) return 0;

        // Insert order — bao gồm tất cả cột mới (Open Platform fields)
        var orderSql = """
            INSERT INTO public.orders
                (order_code, platform_order_id, customer_id, channel_id,
                 order_date, platform_created_at, status, platform_status,
                 total_amount, shipping_fee, original_shipping_fee,
                 shipping_fee_platform_discount,
                 seller_discount, platform_discount,
                 payment_method, is_cod,
                 customer_name, customer_phone,
                 buyer_username,
                 shipping_name, shipping_phone, shipping_address,
                 shipping_ward, shipping_district, shipping_province,
                 shipping_full_address,
                 tracking_number, shipping_carrier, logistics_status,
                 fulfillment_type,
                 company_id, created_at, updated_at)
            VALUES
                (@code, @platOrderId, @custId, @chanId,
                 @date, @platDate, @status, @platStatus,
                 @total, @ship, @origShip,
                 @shipDisc,
                 @sellerDisc, @platDisc,
                 @pay, @isCod,
                 @custName, @custPhone,
                 @buyerUser,
                 @shipName, @shipPhone, @shipAddr,
                 @shipWard, @shipDist, @shipProv,
                 @shipFull,
                 @track, @carrier, @logStatus,
                 @fulfillType,
                 @cid::uuid, NOW(), NOW())
            ON CONFLICT (order_code) DO NOTHING
            """;
        await using var orCmd = new NpgsqlCommand(orderSql, conn);
        static object Nv(string? v) => string.IsNullOrEmpty(v) ? DBNull.Value : v;
        orCmd.Parameters.AddWithValue("code",       o.OrderCode);
        orCmd.Parameters.AddWithValue("platOrderId",(object?)(!string.IsNullOrEmpty(o.PlatformOrderId) ? o.PlatformOrderId : null) ?? DBNull.Value);
        orCmd.Parameters.AddWithValue("custId",     customerId);
        orCmd.Parameters.AddWithValue("chanId",     channelId);
        orCmd.Parameters.AddWithValue("date",       o.OrderDate.ToUniversalTime());
        orCmd.Parameters.AddWithValue("platDate",   o.OrderDate.ToUniversalTime());
        orCmd.Parameters.AddWithValue("status",     o.Status);
        orCmd.Parameters.AddWithValue("platStatus", Nv(o.PlatformStatus));
        orCmd.Parameters.AddWithValue("total",      o.TotalAmount);
        orCmd.Parameters.AddWithValue("ship",       o.ShippingFee);
        orCmd.Parameters.AddWithValue("origShip",   o.OriginalShippingFee);
        orCmd.Parameters.AddWithValue("shipDisc",   o.ShippingFeeDiscount);
        orCmd.Parameters.AddWithValue("sellerDisc", o.SellerDiscount);
        orCmd.Parameters.AddWithValue("platDisc",   o.PlatformDiscount);
        orCmd.Parameters.AddWithValue("pay",        Nv(o.PaymentMethod));
        orCmd.Parameters.AddWithValue("isCod",      o.IsCod);
        orCmd.Parameters.AddWithValue("custName",   Nv(o.RecipientName));
        orCmd.Parameters.AddWithValue("custPhone",  Nv(o.Phone));
        orCmd.Parameters.AddWithValue("buyerUser",  Nv(o.CustomerUsername));
        orCmd.Parameters.AddWithValue("shipName",   Nv(o.RecipientName));
        orCmd.Parameters.AddWithValue("shipPhone",  Nv(o.Phone));
        orCmd.Parameters.AddWithValue("shipAddr",   Nv(o.ShippingAddress));
        orCmd.Parameters.AddWithValue("shipWard",   Nv(o.Ward));
        orCmd.Parameters.AddWithValue("shipDist",   Nv(o.District));
        orCmd.Parameters.AddWithValue("shipProv",   Nv(o.Province));
        orCmd.Parameters.AddWithValue("shipFull",   Nv(o.ShippingFullAddress));
        orCmd.Parameters.AddWithValue("track",      Nv(o.TrackingNumber));
        orCmd.Parameters.AddWithValue("carrier",    Nv(o.ShippingCarrier));
        orCmd.Parameters.AddWithValue("logStatus",  Nv(o.LogisticsStatus));
        orCmd.Parameters.AddWithValue("fulfillType",Nv(o.FulfillmentType));
        orCmd.Parameters.AddWithValue("cid",        tenant.CompanyId!.Value.ToString());
        var orderAff = await orCmd.ExecuteNonQueryAsync();

        if (orderAff > 0)
        {
            // Lấy order_id vừa insert để thêm order_item
            await using var getOrdCmd = new NpgsqlCommand(
                "SELECT order_id FROM public.orders WHERE order_code=@code LIMIT 1", conn);
            getOrdCmd.Parameters.AddWithValue("code", o.OrderCode);
            var orderId = Convert.ToInt32(await getOrdCmd.ExecuteScalarAsync() ?? 0);

            if (orderId > 0)
            {
                var itemSql = """
                    INSERT INTO public.order_items
                        (order_id, product_id, variation_id, quantity, unit_price, sale_price,
                         original_price, subtotal,
                         product_name, sku, variation_name,
                         seller_discount, platform_discount,
                         created_at)
                    VALUES
                        (@oid, @pid, @vid, @qty, @price, @saleP,
                         @origP, @sub,
                         @pname, @sku, @vname,
                         @sellDisc, @platDisc,
                         NOW())
                    ON CONFLICT DO NOTHING
                    """;
                var effectiveSale = o.SalePrice > 0 ? o.SalePrice : o.UnitPrice;
                await using var itmCmd = new NpgsqlCommand(itemSql, conn);
                itmCmd.Parameters.AddWithValue("oid",      orderId);
                itmCmd.Parameters.AddWithValue("pid",      productId);
                itmCmd.Parameters.Add(new NpgsqlParameter("vid", NpgsqlTypes.NpgsqlDbType.Integer)
                    { Value = variationId.HasValue ? (object)variationId.Value : DBNull.Value });
                itmCmd.Parameters.AddWithValue("qty",      o.Quantity);
                itmCmd.Parameters.AddWithValue("price",    effectiveSale);
                itmCmd.Parameters.AddWithValue("saleP",    effectiveSale);
                itmCmd.Parameters.AddWithValue("origP",    o.OriginalPrice > 0 ? o.OriginalPrice : effectiveSale);
                itmCmd.Parameters.AddWithValue("sub",      effectiveSale * o.Quantity);
                itmCmd.Parameters.AddWithValue("pname",    (object?)(!string.IsNullOrEmpty(o.ProductName) ? o.ProductName : null) ?? DBNull.Value);
                itmCmd.Parameters.AddWithValue("sku",      (object?)(!string.IsNullOrEmpty(o.Sku) ? o.Sku : null) ?? DBNull.Value);
                itmCmd.Parameters.AddWithValue("vname",    (object?)(!string.IsNullOrEmpty(o.VariationName) ? o.VariationName : null) ?? DBNull.Value);
                itmCmd.Parameters.AddWithValue("sellDisc", o.SellerDiscount);
                itmCmd.Parameters.AddWithValue("platDisc", o.PlatformDiscount);
                await itmCmd.ExecuteNonQueryAsync();
            }
        }

        return orderAff;
    }

    // ── Helper: Detect category từ tên sản phẩm (keyword matching) ──────────
    private static int GuessProductCategoryId(string? name, NpgsqlConnection _, Guid __)
    {
        if (string.IsNullOrWhiteSpace(name)) return 0;
        var n = name.ToLowerInvariant();
        if (n.Contains("giày") || n.Contains("dép") || n.Contains("boot") || n.Contains("sneaker")) return 58;
        if (n.Contains("túi") || n.Contains("balo") || n.Contains("ví clutch")) return 59;
        if (n.Contains("mũ") || n.Contains("khăn") || n.Contains("vòng tay")) return 60;
        if (n.Contains(" nữ") || n.Contains("đầm") || n.Contains("váy") || n.Contains("chân váy")) return 49;
        return 48; // Thời trang nam mặc định
    }

    // ── Helper: Tìm hoặc tạo category theo tên + company ─────────────────────
    private static async Task<int> GetOrCreateCategoryAsync(
        NpgsqlConnection conn, string? categoryName, Guid companyId)
    {
        var name = string.IsNullOrWhiteSpace(categoryName) ? "Chưa phân loại" : categoryName.Trim();

        // Tìm category đã tồn tại theo tên + company
        await using var selCmd = new NpgsqlCommand(
            "SELECT category_id FROM public.categories WHERE category_name=@n AND company_id=@cid LIMIT 1",
            conn);
        selCmd.Parameters.AddWithValue("n",   name);
        selCmd.Parameters.AddWithValue("cid", companyId);
        var existing = await selCmd.ExecuteScalarAsync();
        if (existing is not null and not DBNull) return Convert.ToInt32(existing);

        // Tạo mới
        await using var insCmd = new NpgsqlCommand(
            "INSERT INTO public.categories (category_name, level, is_active, company_id, created_at) VALUES (@n, 1, TRUE, @cid, NOW()) RETURNING category_id",
            conn);
        insCmd.Parameters.AddWithValue("n",   name);
        insCmd.Parameters.AddWithValue("cid", companyId);
        var result = await insCmd.ExecuteScalarAsync();
        return Convert.ToInt32(result ?? 1);
    }

    // ── POST /api/import/orders ───────────────────────────────────────────────
    [HttpPost("orders")]
    public async Task<IActionResult> ImportOrders(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        List<string[]> rows;
        try { rows = ParseCsv(file.OpenReadStream()); }
        catch { return BadRequest(new { message = "Không thể đọc file. Kiểm tra định dạng CSV." }); }

        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        NpgsqlConnection conn;
        try
        {
            conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
        }
        catch
        {
            return StatusCode(503, new { message = "Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại." });
        }
        await using var _ = conn;

        // Bỏ hàng header (row[0])
        for (int r = 1; r < rows.Count; r++)
        {
            var row = rows[r];
            try
            {
                var orderCode = Cell(row, 0);
                if (string.IsNullOrEmpty(orderCode)) { skipped++; continue; }

                var customerEmail = Cell(row, 1);
                var productSku    = Cell(row, 2);
                var qty           = int.TryParse(Cell(row, 3), out var q) ? q : 1;
                var unitPrice     = decimal.TryParse(Cell(row, 4), NumberStyles.Any, CultureInfo.InvariantCulture, out var up) ? up : 0m;
                var channel       = Cell(row, 5);
                var orderDate     = DateTime.TryParse(Cell(row, 6), out var od) ? od : DateTime.UtcNow;
                var status        = Cell(row, 7);
                if (string.IsNullOrEmpty(status)) status = "pending";

                var sql = """
                    INSERT INTO public.orders (external_order_id, customer_email, product_sku,
                        quantity, unit_price, channel_name, order_date, status,
                        company_id, created_at, updated_at)
                    VALUES (@code, @email, @sku, @qty, @price, @channel, @date, @status,
                        @companyId::uuid, NOW(), NOW())
                    ON CONFLICT (external_order_id) DO NOTHING
                    """;

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("code",      orderCode);
                cmd.Parameters.AddWithValue("email",     (object?)customerEmail ?? DBNull.Value);
                cmd.Parameters.AddWithValue("sku",       (object?)productSku ?? DBNull.Value);
                cmd.Parameters.AddWithValue("qty",       qty);
                cmd.Parameters.AddWithValue("price",     unitPrice);
                cmd.Parameters.AddWithValue("channel",   (object?)channel ?? DBNull.Value);
                cmd.Parameters.AddWithValue("date",      orderDate);
                cmd.Parameters.AddWithValue("status",    status);
                cmd.Parameters.AddWithValue("companyId", (object?)tenant.CompanyId?.ToString() ?? DBNull.Value);

                var affected = await cmd.ExecuteNonQueryAsync();
                if (affected > 0) success++; else skipped++;
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
            }
        }

        return Ok(new { success, skipped, errors });
    }

    // ── POST /api/import/products ─────────────────────────────────────────────
    [HttpPost("products")]
    public async Task<IActionResult> ImportProducts(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        List<string[]> rows;
        try { rows = ParseCsv(file.OpenReadStream()); }
        catch { return BadRequest(new { message = "Không thể đọc file. Kiểm tra định dạng CSV." }); }

        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        NpgsqlConnection conn;
        try
        {
            conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
        }
        catch
        {
            return StatusCode(503, new { message = "Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại." });
        }
        await using var _ = conn;

        for (int r = 1; r < rows.Count; r++)
        {
            var row = rows[r];
            try
            {
                var sku = Cell(row, 0);
                if (string.IsNullOrEmpty(sku)) { skipped++; continue; }

                var name        = Cell(row, 1);
                var category    = Cell(row, 2);
                var description = Cell(row, 3);
                var price       = decimal.TryParse(Cell(row, 4), NumberStyles.Any, CultureInfo.InvariantCulture, out var p) ? p : 0m;
                var costPrice   = decimal.TryParse(Cell(row, 5), NumberStyles.Any, CultureInfo.InvariantCulture, out var cp) ? cp : 0m;
                var stock       = int.TryParse(Cell(row, 6), out var s) ? s : 0;

                // Upsert category (nếu không có → dùng "Chưa phân loại")
                int catId = await GetOrCreateCategoryAsync(conn, category, tenant.CompanyId!.Value);

                var sql = """
                    INSERT INTO public.products (sku, product_name, description, base_price, cost_price,
                        stock_quantity, category_id, is_active, company_id, created_at, updated_at)
                    VALUES (@sku, @name, @desc, @price, @cost, @stock, @catId, TRUE, @companyId::uuid, NOW(), NOW())
                    ON CONFLICT (sku, company_id) DO NOTHING
                    """;

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("sku",       sku);
                cmd.Parameters.AddWithValue("name",      name);
                cmd.Parameters.AddWithValue("desc",      (object?)description ?? DBNull.Value);
                cmd.Parameters.AddWithValue("price",     price);
                cmd.Parameters.AddWithValue("cost",      costPrice);
                cmd.Parameters.AddWithValue("stock",     stock);
                cmd.Parameters.AddWithValue("catId",     catId);
                cmd.Parameters.AddWithValue("companyId", tenant.CompanyId!.Value.ToString());

                var affected = await cmd.ExecuteNonQueryAsync();
                if (affected > 0) success++; else skipped++;
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
            }
        }

        return Ok(new { success, skipped, errors });
    }

    // ── POST /api/import/customers ────────────────────────────────────────────
    [HttpPost("customers")]
    public async Task<IActionResult> ImportCustomers(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        List<string[]> rows;
        try { rows = ParseCsv(file.OpenReadStream()); }
        catch { return BadRequest(new { message = "Không thể đọc file. Kiểm tra định dạng CSV." }); }

        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        NpgsqlConnection conn;
        try
        {
            conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
        }
        catch
        {
            return StatusCode(503, new { message = "Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại." });
        }
        await using var _ = conn;

        for (int r = 1; r < rows.Count; r++)
        {
            var row = rows[r];
            try
            {
                var email = Cell(row, 0);
                if (string.IsNullOrEmpty(email)) { skipped++; continue; }

                var fullName   = Cell(row, 1);
                var phone      = Cell(row, 2);
                var address    = Cell(row, 3);
                var district   = Cell(row, 4);  // CSV column "city" map sang district
                var province   = Cell(row, 5);
                var regDate    = DateTime.TryParse(Cell(row, 6), out var rd) ? rd : DateTime.UtcNow;

                // SELECT-then-INSERT vì customers.email không có UNIQUE constraint
                await using var checkCmd = new NpgsqlCommand(
                    "SELECT customer_id FROM public.customers WHERE email=@email AND company_id=@companyId::uuid LIMIT 1", conn);
                checkCmd.Parameters.AddWithValue("email",     email);
                checkCmd.Parameters.AddWithValue("companyId", (object?)tenant.CompanyId?.ToString() ?? DBNull.Value);
                var exists = await checkCmd.ExecuteScalarAsync();
                if (exists is not null and not DBNull) { skipped++; continue; }

                var insertSql = """
                    INSERT INTO public.customers (email, full_name, phone, address,
                        district, province, is_active, company_id, created_at, updated_at)
                    VALUES (@email, @name, @phone, @addr, @district, @province, TRUE, @companyId::uuid, @reg, NOW())
                    """;

                await using var cmd = new NpgsqlCommand(insertSql, conn);
                cmd.Parameters.AddWithValue("email",     email);
                cmd.Parameters.AddWithValue("name",      fullName);
                cmd.Parameters.AddWithValue("phone",     (object?)phone ?? DBNull.Value);
                cmd.Parameters.AddWithValue("addr",      (object?)address ?? DBNull.Value);
                cmd.Parameters.AddWithValue("district",  (object?)district ?? DBNull.Value);
                cmd.Parameters.AddWithValue("province",  (object?)province ?? DBNull.Value);
                cmd.Parameters.AddWithValue("reg",       regDate);
                cmd.Parameters.AddWithValue("companyId", (object?)tenant.CompanyId?.ToString() ?? DBNull.Value);

                var affected = await cmd.ExecuteNonQueryAsync();
                if (affected > 0) success++; else skipped++;
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
            }
        }

        return Ok(new { success, skipped, errors });
    }

    // ── POST /api/import/platform-products ──────────────────────────────────────
    // Import file Sản phẩm từ Shopee/TikTok/Lazada Seller Center.
    // source=shopee|tiktok|lazada|auto
    [HttpPost("platform-products")]
    public async Task<IActionResult> ImportPlatformProducts(IFormFile file, [FromQuery] string source = "auto")
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        List<string[]> rows;
        try { rows = ParseCsv(file.OpenReadStream()); }
        catch { return BadRequest(new { message = "Không thể đọc file. Kiểm tra định dạng CSV." }); }

        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        var headers = rows[0];
        var platform = source.ToLower() switch
        {
            "shopee" => "shopee",
            "tiktok" => "tiktok",
            "lazada" => "lazada",
            _        => DetectPlatformProducts(headers),
        };

        if (platform is null)
            return BadRequest(new
            {
                message = "Không nhận diện được format sàn. Chọn nguồn (shopee/tiktok/lazada) hoặc kiểm tra header CSV.",
                detectedHeaders = headers.Take(5),
            });

        NpgsqlConnection conn;
        try { conn = new NpgsqlConnection(_connStr); await conn.OpenAsync(); }
        catch { return StatusCode(503, new { message = "Không thể kết nối cơ sở dữ liệu." }); }
        await using var _ = conn;

        int successProd = 0, successCat = 0, skipped = 0;
        var errors = new List<object>();

        for (int r = 1; r < rows.Count; r++)
        {
            try
            {
                var mapped = platform switch
                {
                    "shopee" => MapShopeeProductRow(rows[r], headers),
                    "tiktok" => MapTikTokProductRow(rows[r], headers),
                    "lazada" => MapLazadaProductRow(rows[r], headers),
                    _        => null,
                };

                if (mapped is null || string.IsNullOrEmpty(mapped.Sku)) { skipped++; continue; }

                var (affected, catNew) = await UpsertProductFull(conn, mapped);
                if (affected > 0) { successProd++; successCat += catNew ? 1 : 0; }
                else skipped++;
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
            }
        }

        if (successProd > 0)
        {
            var userId   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null;
            var username = User.FindFirstValue(ClaimTypes.Name) ?? "";
            await audit.LogAsync(
                userId:     userId,
                username:   username,
                action:     "IMPORT_CSV",
                entityType: "Product",
                entityId:   platform,
                newValue:   $"imported={successProd} cats={successCat} skipped={skipped} file={file.FileName}",
                status:     "SUCCESS");
        }

        return Ok(new
        {
            success  = successProd,
            newCategories = successCat,
            skipped,
            errors,
            platform,
            message  = $"Đã import {successProd} sản phẩm, {successCat} danh mục mới từ {platform}.",
        });
    }

    // ── Product record ────────────────────────────────────────────────────────

    private record MappedProduct(
        string PlatformProductId, string ProductName, string Sku,
        string CategoryName, decimal SalePrice, decimal OriginalPrice,
        int StockQuantity, bool IsActive);

    // ── Product platform detection ────────────────────────────────────────────

    private static string? DetectPlatformProducts(string[] headers)
    {
        var h = headers.Select(x => x.Trim().ToLower()).ToHashSet();
        if (h.Contains("shopee id") || (h.Contains("tên sản phẩm") && h.Contains("kho hàng")))
            return "shopee";
        if (h.Contains("product id") && h.Contains("seller sku") && h.Contains("sales price"))
            return "tiktok";
        if ((h.Contains("item id") || h.Contains("sellersku")) && h.Contains("special price"))
            return "lazada";
        return null;
    }

    // ── Shopee Product mapper ────────────────────────────────────────────────
    // Headers: Shopee ID, Tên sản phẩm, SKU, Danh mục, Giá bán, Giá gốc, Kho hàng, Trạng thái, Thương hiệu

    private static MappedProduct? MapShopeeProductRow(string[] row, string[] headers)
    {
        var sku = ColVal(row, HeaderIndex(headers, "SKU"));
        if (string.IsNullOrEmpty(sku)) return null;

        var statusStr  = ColVal(row, HeaderIndex(headers, "Trạng thái")).ToUpper();
        var isActive   = statusStr == "NORMAL" || statusStr == "ACTIVE" || statusStr == "ĐANG HOẠT ĐỘNG";
        decimal.TryParse(ColVal(row, HeaderIndex(headers, "Giá bán")).Replace(",", ""),
            NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        decimal.TryParse(ColVal(row, HeaderIndex(headers, "Giá gốc")).Replace(",", ""),
            NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        int.TryParse(ColVal(row, HeaderIndex(headers, "Kho hàng")), out var stock);

        return new MappedProduct(
            PlatformProductId: ColVal(row, HeaderIndex(headers, "Shopee ID")),
            ProductName:       ColVal(row, HeaderIndex(headers, "Tên sản phẩm")),
            Sku:               sku,
            CategoryName:      ColVal(row, HeaderIndex(headers, "Danh mục")),
            SalePrice:         salePrice,
            OriginalPrice:     origPrice > 0 ? origPrice : salePrice,
            StockQuantity:     stock,
            IsActive:          isActive
        );
    }

    // ── TikTok Shop Product mapper ────────────────────────────────────────────
    // Headers: Product ID, Product Name, Seller SKU, Category, Original Price, Sales Price, Warehouse Stock, Status, Brand

    private static MappedProduct? MapTikTokProductRow(string[] row, string[] headers)
    {
        var sku = ColVal(row, HeaderIndex(headers, "Seller SKU", "Seller Sku"));
        if (string.IsNullOrEmpty(sku)) return null;

        var statusStr  = ColVal(row, HeaderIndex(headers, "Status")).ToUpper();
        var isActive   = statusStr is "ACTIVE" or "ACTIVATED" or "4";
        decimal.TryParse(ColVal(row, HeaderIndex(headers, "Original Price")).Replace(",", ""),
            NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        decimal.TryParse(ColVal(row, HeaderIndex(headers, "Sales Price", "Sale Price")).Replace(",", ""),
            NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        int.TryParse(ColVal(row, HeaderIndex(headers, "Warehouse Stock", "Stock")), out var stock);

        return new MappedProduct(
            PlatformProductId: ColVal(row, HeaderIndex(headers, "Product ID")),
            ProductName:       ColVal(row, HeaderIndex(headers, "Product Name")),
            Sku:               sku,
            CategoryName:      ColVal(row, HeaderIndex(headers, "Category")),
            SalePrice:         salePrice > 0 ? salePrice : origPrice,
            OriginalPrice:     origPrice > 0 ? origPrice : salePrice,
            StockQuantity:     stock,
            IsActive:          isActive
        );
    }

    // ── Lazada Product mapper ─────────────────────────────────────────────────
    // Headers: Item ID, Name, SellerSKU, Category, Price, Special Price, Stock, Active Status, Brand

    private static MappedProduct? MapLazadaProductRow(string[] row, string[] headers)
    {
        var sku = ColVal(row, HeaderIndex(headers, "SellerSKU", "Seller SKU", "SKU"));
        if (string.IsNullOrEmpty(sku)) return null;

        var statusStr  = ColVal(row, HeaderIndex(headers, "Active Status", "Status")).ToLower();
        var isActive   = statusStr is "active" or "1" or "true";
        decimal.TryParse(ColVal(row, HeaderIndex(headers, "Price")).Replace(",", ""),
            NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        decimal.TryParse(ColVal(row, HeaderIndex(headers, "Special Price", "Paid Price")).Replace(",", ""),
            NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        int.TryParse(ColVal(row, HeaderIndex(headers, "Stock", "Quantity")), out var stock);

        return new MappedProduct(
            PlatformProductId: ColVal(row, HeaderIndex(headers, "Item ID")),
            ProductName:       ColVal(row, HeaderIndex(headers, "Name", "Product Name")),
            Sku:               sku,
            CategoryName:      ColVal(row, HeaderIndex(headers, "Category")),
            SalePrice:         salePrice > 0 ? salePrice : origPrice,
            OriginalPrice:     origPrice > 0 ? origPrice : salePrice,
            StockQuantity:     stock,
            IsActive:          isActive
        );
    }

    // ── Upsert product đầy đủ (category + product) ──────────────────────────

    private async Task<(int affected, bool categoryNew)> UpsertProductFull(NpgsqlConnection conn, MappedProduct p)
    {
        // Kiểm tra category trước để xác định xem có mới không
        var checkCatSql = "SELECT category_id FROM public.categories WHERE category_name=@n AND company_id=@cid LIMIT 1";
        await using var checkCmd = new NpgsqlCommand(checkCatSql, conn);
        checkCmd.Parameters.AddWithValue("n",   string.IsNullOrWhiteSpace(p.CategoryName) ? "Chưa phân loại" : p.CategoryName.Trim());
        checkCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value);
        var existingCat = await checkCmd.ExecuteScalarAsync();
        bool categoryNew = existingCat is null or DBNull;

        int catId = await GetOrCreateCategoryAsync(conn, p.CategoryName, tenant.CompanyId!.Value);

        // Upsert product: nếu SKU đã có → cập nhật tên/giá/tồn kho/category
        var sql = """
            INSERT INTO public.products
                (sku, product_name, base_price, cost_price, stock_quantity,
                 category_id, is_active, company_id, created_at, updated_at)
            VALUES
                (@sku, @name, @price, 0, @stock, @catId, @active, @cid::uuid, NOW(), NOW())
            ON CONFLICT (sku, company_id) DO UPDATE SET
                product_name   = EXCLUDED.product_name,
                base_price     = EXCLUDED.base_price,
                stock_quantity = EXCLUDED.stock_quantity,
                category_id    = EXCLUDED.category_id,
                is_active      = EXCLUDED.is_active,
                updated_at     = NOW()
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("sku",    p.Sku.Length > 0 ? p.Sku : $"IMPORT-{Guid.NewGuid():N}"[..20]);
        cmd.Parameters.AddWithValue("name",   p.ProductName.Length > 0 ? p.ProductName : p.Sku);
        cmd.Parameters.AddWithValue("price",  p.OriginalPrice > 0 ? p.OriginalPrice : p.SalePrice);
        cmd.Parameters.AddWithValue("stock",  p.StockQuantity);
        cmd.Parameters.AddWithValue("catId",  catId);
        cmd.Parameters.AddWithValue("active", p.IsActive);
        cmd.Parameters.AddWithValue("cid",    tenant.CompanyId!.Value.ToString());
        var affected = await cmd.ExecuteNonQueryAsync();
        return (affected, categoryNew);
    }


    // ── GET /api/templates/download ─────────────────────────────────────────────
    // Tạo file CSV template chuẩn Open Platform với dữ liệu mẫu thực tế.
    // platform=shopee|tiktok|lazada|ghn  type=orders|products
    [HttpGet("/api/templates/download")]
    [AllowAnonymous]
    public async Task<IActionResult> DownloadTemplate(
        [FromQuery] string platform = "shopee",
        [FromQuery] string type     = "orders")
    {
        var plt = platform.ToLower();
        var typ = type.ToLower();

        if (plt is not ("shopee" or "tiktok" or "lazada" or "ghn"))
            return BadRequest(new { message = "platform phải là: shopee, tiktok, lazada, ghn" });
        if (typ is not ("orders" or "products"))
            return BadRequest(new { message = "type phải là: orders, products" });

        var now  = DateTime.Now;
        var sb   = new StringBuilder();

        // GHN chỉ có orders
        if (plt == "ghn") typ = "orders";

        // ── Headers ──────────────────────────────────────────────────────────
        string header = (plt, typ) switch
        {
            ("shopee", "orders")   =>
                "Mã đơn hàng,Trạng thái đơn hàng,Lý do hủy/hoàn,Ngày đặt hàng,Ngày cập nhật," +
                "Ngày thanh toán,Tên đăng nhập người mua,Tên người nhận,Số điện thoại,Địa chỉ giao hàng," +
                "Phường/Xã,Quận/Huyện,Tỉnh/Thành phố,Vùng,Mã bưu điện," +
                "Tên sản phẩm,Phân loại hàng,SKU phân loại,Mã sản phẩm Shopee,Giá gốc (VND)," +
                "Giá bán (VND),Số lượng,Tổng tiền hàng (VND),Phí vận chuyển (VND),Phí ship gốc (VND)," +
                "Giảm phí ship sàn (VND),Tổng thanh toán (VND),Phương thức thanh toán," +
                "Đơn vị vận chuyển,Mã vận đơn,Trạng thái vận chuyển,Loại thực hiện đơn,Ghi chú từ người mua",

            ("shopee", "products") =>
                "Mã sản phẩm Shopee,Tên sản phẩm,SKU,Danh mục,Thương hiệu," +
                "Giá gốc (VND),Giá bán (VND),Tồn kho,Trạng thái,Cân nặng (kg),Mô tả,Ảnh sản phẩm",

            ("tiktok", "orders")   =>
                "Order ID,Order Status,Create Time,Update Time,Paid Time,RTS SLA Time," +
                "Buyer User ID,Buyer Message,Payment Method,Is COD," +
                "Recipient Name,Recipient Phone,Full Address,Address Detail,Province,District,Ward,Postal Code,Region Code," +
                "Shipping Type,Shipping Provider,Tracking Number,Fulfillment Type,Currency," +
                "Sub Total (VND),Shipping Fee (VND),Original Shipping Fee (VND)," +
                "Shipping Fee Platform Discount (VND),Seller Discount (VND),Platform Discount (VND)," +
                "Total Amount (VND),Original Total Product Price (VND)," +
                "Line Item ID,SKU ID,Product ID,Product Name,Seller SKU,SKU Name," +
                "Original Price (VND),Sale Price (VND),Platform Discount Item (VND),Seller Discount Item (VND)," +
                "Package ID,Package Status,Item Tracking Number,Shipping Provider Name,Display Status",

            ("tiktok", "products") =>
                "Product ID,Title,Status,Category,Brand," +
                "SKU ID,Seller SKU,SKU Name,Sale Price (VND),Inventory,Create Time,Update Time",

            ("lazada", "orders")   =>
                "Order ID,Order Number,Created At,Updated At,Status,Payment Method," +
                "Price (VND),Shipping Fee (VND),Shipping Fee Original (VND),Shipping Fee Discount Platform (VND)," +
                "Voucher (VND),Voucher Platform (VND),Voucher Seller (VND)," +
                "Customer First Name,Customer Last Name,Address Line 1,City,District (Address3),Ward (Address4),Country," +
                "Items Count,Warehouse Code,Order Item ID,Item Name,SKU,Shop SKU,Variation," +
                "Item Price (VND),Paid Price (VND),Shipping Amount (VND),Status Item," +
                "Shipment Provider,Tracking Code,Currency,Product ID,Product Main Image",

            ("lazada", "products") =>
                "Item ID,Name,Status,Category,Brand,Seller SKU," +
                "Price (VND),Special Price (VND),Quantity,Weight (kg),Description",

            ("ghn", "orders")      =>
                "order_code,client_order_code,status,created_date,updated_date," +
                "to_name,to_phone,to_address,to_district_id,cod_amount,insurance_value," +
                "content,weight,service_type_id,payment_type_id",

            _ => ""
        };

        sb.AppendLine(header);
        // Nếu user đã đăng nhập và có company → lấy sample từ DB thực tế
        if (typ == "orders" && plt is "shopee" or "tiktok" or "lazada" && tenant.CompanyId.HasValue)
        {
            var sampleRows = await BuildSampleRowsFromDb(plt, tenant.CompanyId.Value);
            foreach (var row in sampleRows)
                sb.AppendLine(row);
        }

        var fileName = $"template_{plt}_{typ}_{now:yyyyMMdd_HHmmss}.csv";
        var bytes    = Encoding.UTF8.GetBytes(sb.ToString());
        return File(bytes, "text/csv", fileName);
    }

    // ── POST /api/import/sales-data ───────────────────────────────────────────
    [HttpPost("sales-data")]
    public async Task<IActionResult> ImportSalesData(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        List<string[]> rows;
        try { rows = ParseCsv(file.OpenReadStream()); }
        catch { return BadRequest(new { message = "Không thể đọc file. Kiểm tra định dạng CSV." }); }

        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        NpgsqlConnection conn;
        try
        {
            conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
        }
        catch
        {
            return StatusCode(503, new { message = "Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại." });
        }
        await using var _ = conn;

        for (int r = 1; r < rows.Count; r++)
        {
            var row = rows[r];
            try
            {
                var dateStr = Cell(row, 0);
                if (string.IsNullOrEmpty(dateStr)) { skipped++; continue; }

                if (!DateOnly.TryParse(dateStr, out var saleDate)) { skipped++; continue; }

                var channel    = Cell(row, 1);
                var sku        = Cell(row, 2);
                var qtySold    = int.TryParse(Cell(row, 3), out var qs) ? qs : 0;
                var revenue    = decimal.TryParse(Cell(row, 4), NumberStyles.Any, CultureInfo.InvariantCulture, out var rv) ? rv : 0m;
                var orderCount = int.TryParse(Cell(row, 5), out var oc) ? oc : 0;

                // Thêm vào staging table — ETL pipeline sẽ transform vào fact_sales
                var sql = """
                    INSERT INTO staging.sales_raw (sale_date, channel_name, product_sku,
                        quantity_sold, net_revenue, order_count, imported_at)
                    VALUES (@date, @channel, @sku, @qty, @revenue, @orders, NOW())
                    ON CONFLICT (sale_date, channel_name, product_sku) DO NOTHING
                    """;

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("date",    saleDate.ToDateTime(TimeOnly.MinValue));
                cmd.Parameters.AddWithValue("channel", (object?)channel ?? DBNull.Value);
                cmd.Parameters.AddWithValue("sku",     (object?)sku ?? DBNull.Value);
                cmd.Parameters.AddWithValue("qty",     qtySold);
                cmd.Parameters.AddWithValue("revenue", revenue);
                cmd.Parameters.AddWithValue("orders",  orderCount);

                var affected = await cmd.ExecuteNonQueryAsync();
                if (affected > 0) success++; else skipped++;
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
            }
        }

        return Ok(new { success, skipped, errors });
    }
}
