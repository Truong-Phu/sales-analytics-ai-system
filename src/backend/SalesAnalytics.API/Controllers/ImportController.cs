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
public class ImportController(IConfiguration cfg, ITenantContext tenant, IAuditLogService audit) : ControllerBase
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
        var (header, filename) = type.ToLower() switch
        {
            "orders"     => ("order_code,customer_email,product_sku,quantity,unit_price,channel,order_date,status",
                             "template_orders.csv"),
            "products"   => ("sku,name,category,description,price,cost_price,stock_quantity",
                             "template_products.csv"),
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
    // Trả về template CSV chuẩn format của từng sàn TMĐT (backward compat — mặc định orders).
    [HttpGet("template/platform/{source}")]
    public IActionResult GetPlatformTemplate(string source) =>
        GetPlatformTemplateByType(source, "orders");

    // ── GET /api/import/template/platform/{source}/{fileType} ────────────────
    // Trả về template đúng theo sàn + loại file (orders / products).
    [HttpGet("template/platform/{source}/{fileType}")]
    public IActionResult GetPlatformTemplateTyped(string source, string fileType) =>
        GetPlatformTemplateByType(source, fileType);

    private IActionResult GetPlatformTemplateByType(string source, string fileType)
    {
        var src  = source.ToLower();
        var type = fileType.ToLower();

        if (src is not ("shopee" or "tiktok" or "lazada"))
            return NotFound(new { message = "Nguồn không hợp lệ. Chọn: shopee, tiktok, lazada." });
        if (type is not ("orders" or "products"))
            return NotFound(new { message = "Loại file không hợp lệ. Chọn: orders, products." });

        var basePath = Path.Combine(
            Directory.GetCurrentDirectory(),
            "..", "..", "..", "..",
            "docs", "sample-data", "templates"
        );

        var fileName    = $"template_{src}_{type}.csv";
        var displayName = fileName;
        var fullPath    = Path.GetFullPath(Path.Combine(basePath, fileName));

        if (System.IO.File.Exists(fullPath))
        {
            var csvBytes = System.IO.File.ReadAllBytes(fullPath);
            return File(csvBytes, "text/csv", displayName);
        }

        // Fallback header-only (chuẩn template mới Open Platform 2026-05-21)
        var fallback = (src, type) switch
        {
            ("shopee", "orders")   => "Mã đơn hàng,Trạng thái đơn hàng,Lý do hủy/hoàn,Ngày đặt hàng,Ngày cập nhật,Ngày thanh toán,Tên đăng nhập người mua,Tên người nhận,Số điện thoại,Địa chỉ giao hàng,Phường/Xã,Quận/Huyện,Tỉnh/Thành phố,Vùng,Mã bưu điện,Tên sản phẩm,Phân loại hàng,SKU phân loại,Mã sản phẩm Shopee,Giá gốc (VND),Giá bán (VND),Số lượng,Tổng tiền hàng (VND),Phí vận chuyển (VND),Phí ship gốc (VND),Giảm phí ship sàn (VND),Tổng thanh toán (VND),Phương thức thanh toán,Đơn vị vận chuyển,Mã vận đơn,Trạng thái vận chuyển,Loại thực hiện đơn,Ghi chú từ người mua",
            ("shopee", "products") => "Mã sản phẩm Shopee,Tên sản phẩm,Mã SKU gốc,Danh mục,ID danh mục,Thương hiệu,Giá gốc (VND),Giá bán (VND),Tồn kho,Tồn kho đặt trước,Trạng thái,Tình trạng,Cân nặng (kg),Chiều dài (cm),Chiều rộng (cm),Chiều cao (cm),Mô tả,Ảnh chính,Có phân loại,Ngày tạo,Ngày cập nhật",
            ("tiktok", "orders")   => "Order ID,Order Status,Create Time,Update Time,Paid Time,RTS SLA Time,Buyer User ID,Buyer Message,Payment Method,Is COD,Recipient Name,Recipient Phone,Full Address,Address Detail,Province,District,Ward,Postal Code,Region Code,Shipping Type,Shipping Provider,Tracking Number,Fulfillment Type,Currency,Sub Total (VND),Shipping Fee (VND),Original Shipping Fee (VND),Shipping Fee Platform Discount (VND),Seller Discount (VND),Platform Discount (VND),Total Amount (VND),Original Total Product Price (VND),Line Item ID,SKU ID,Product ID,Product Name,Seller SKU,SKU Name,Original Price (VND),Sale Price (VND),Platform Discount Item (VND),Seller Discount Item (VND),Package ID,Package Status,Item Tracking Number,Shipping Provider Name,Display Status",
            ("tiktok", "products") => "Product ID,Title,Status,Create Time,Update Time,Category ID,Category Name,Brand ID,Brand Name,SKU ID,Seller SKU,SKU Name,Sale Price (VND),Currency,Warehouse ID,Quantity,Color,Size,Image URL,Package Weight (kg),Package Weight Unit,Package Length (cm),Package Width (cm),Package Height (cm),Description",
            ("lazada", "orders")   => "Order ID,Order Number,Created At,Updated At,Status,Payment Method,Price (VND),Shipping Fee (VND),Shipping Fee Original (VND),Shipping Fee Discount Platform (VND),Voucher (VND),Voucher Platform (VND),Voucher Seller (VND),Customer First Name,Customer Last Name,Address Line 1,City,District (Address3),Ward (Address4),Country,Items Count,Warehouse Code,Order Item ID,Item Name,SKU,Shop SKU,Variation,Item Price (VND),Paid Price (VND),Shipping Amount (VND),Status Item,Shipment Provider,Tracking Code,Currency,Product ID,Product Main Image",
            ("lazada", "products") => "Item ID,Name,Status,Created Time,Updated Time,Primary Category,Brand,Short Description,Seller SKU,Shop SKU,Price (VND),Special Price (VND),Special From,Special To,Quantity,Package Width (cm),Package Height (cm),Package Length (cm),Package Weight (kg),Images,Product URL,Warehouse Code",
            _                      => "",
        };
        return File(Encoding.UTF8.GetBytes(fallback + "\r\n"), "text/csv", displayName);
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
        var errors = new List<object>();

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

                if (mapped is null || string.IsNullOrEmpty(mapped.OrderCode)) { skipped++; continue; }

                // Chuẩn hóa status → MSAS internal (record dùng with-expression)
                mapped = mapped with { Status = NormalizeStatus(mapped.Status, platform) };

                var affected = await UpsertOrder(conn, mapped);
                if (affected > 0) success++; else skipped++;
            }
            catch (Exception ex)
            {
                errors.Add(new { row = r + 1, message = ex.Message });
                skipped++;
            }
        }

        // Ghi audit log để trace ai đã import gì
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
        }

        return Ok(new
        {
            success,
            skipped,
            errors,
            platform,
            message = $"Đã import {success} đơn hàng từ {platform}. Đang đồng bộ lên Data Warehouse..."
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
            IsCod:               ColVal(row, HeaderIndex(headers, "Phương thức thanh toán")).Contains("Delivery", StringComparison.OrdinalIgnoreCase),
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

        // Lazada: City = quận/huyện, District (Address3) = tỉnh/thành phố
        var city      = ColVal(row, HeaderIndex(headers, "City"));
        var address3  = ColVal(row, HeaderIndex(headers, "District (Address3)", "Address3"));
        var address4  = ColVal(row, HeaderIndex(headers, "Ward (Address4)", "Address4"));
        var addrLine1 = ColVal(row, HeaderIndex(headers, "Address Line 1"));
        var country   = ColVal(row, HeaderIndex(headers, "Country"));

        return new MappedOrder(
            OrderCode:           code,
            PlatformOrderId:     orderId,
            CustomerUsername:    ColVal(row, HeaderIndex(headers, "Customer Email")),
            RecipientName:       recipientName,
            Phone:               ColVal(row, HeaderIndex(headers, "Phone", "Shipping Phone")),
            Province:            address3,   // Lazada Address3 = tỉnh/thành
            District:            city,       // Lazada City = quận/huyện
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
                "COMPLETED" or "105"             => "DELIVERED",
                "IN_TRANSIT" or "121"            => "SHIPPING",
                "AWAITING_SHIPMENT" or "111"     => "CONFIRMED",
                "UNPAID" or "100"                => "PENDING",
                "CANCELLED" or "106"             => "CANCELLED",
                "RETURNED" or "122"              => "RETURNED",
                _ => "PENDING",
            },
            "lazada" => s switch
            {
                "DELIVERED"                      => "DELIVERED",
                "SHIPPED" or "READY_TO_SHIP"     => "SHIPPING",
                "PENDING" or "CONFIRMED"         => "PENDING",
                "CANCELLED"                      => "CANCELLED",
                "RETURNED"                       => "RETURNED",
                _ => "PENDING",
            },
            _ => "PENDING",
        };
    }

    // ── Upsert 1 đơn hàng vào OLTP ───────────────────────────────────────────

    private async Task<int> UpsertOrder(NpgsqlConnection conn, MappedOrder o)
    {
        // Tìm company channel_id theo tên kênh
        var channelSql = """
            SELECT channel_id FROM public.sales_channels
            WHERE LOWER(channel_name) = LOWER(@ch) AND company_id = @cid::uuid
            LIMIT 1
            """;
        await using var chCmd = new NpgsqlCommand(channelSql, conn);
        chCmd.Parameters.AddWithValue("ch",  o.Channel);
        chCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
        var channelIdObj = await chCmd.ExecuteScalarAsync();
        // Nếu không có channel thì không thể insert đúng FK — bỏ qua
        if (channelIdObj is null or DBNull) return 0;
        int channelId = Convert.ToInt32(channelIdObj);

        // Tìm hoặc tạo customer theo username/phone
        var customerSql = """
            INSERT INTO public.customers
                (email, full_name, phone_number, province, district, is_active, company_id, created_at, updated_at)
            VALUES
                (@email, @name, @phone, @province, @district, TRUE, @cid::uuid, NOW(), NOW())
            ON CONFLICT (email) DO NOTHING
            RETURNING customer_id
            """;
        var customerEmail = string.IsNullOrEmpty(o.CustomerUsername)
            ? $"{o.Phone}@import.local"
            : $"{o.CustomerUsername}@import.local";

        await using var cuCmd = new NpgsqlCommand(customerSql, conn);
        cuCmd.Parameters.AddWithValue("email",    customerEmail);
        cuCmd.Parameters.AddWithValue("name",     o.RecipientName.Length > 0 ? o.RecipientName : "Unknown");
        cuCmd.Parameters.AddWithValue("phone",    (object?)o.Phone ?? DBNull.Value);
        cuCmd.Parameters.AddWithValue("province", (object?)o.Province ?? DBNull.Value);
        cuCmd.Parameters.AddWithValue("district", (object?)o.District ?? DBNull.Value);
        cuCmd.Parameters.AddWithValue("cid",      tenant.CompanyId!.Value.ToString());
        var cusIdObj = await cuCmd.ExecuteScalarAsync();
        int customerId;
        if (cusIdObj is null or DBNull)
        {
            // Đã tồn tại — lấy ID
            await using var getCmd = new NpgsqlCommand(
                "SELECT customer_id FROM public.customers WHERE email=@email LIMIT 1", conn);
            getCmd.Parameters.AddWithValue("email", customerEmail);
            customerId = Convert.ToInt32(await getCmd.ExecuteScalarAsync() ?? 0);
        }
        else
        {
            customerId = Convert.ToInt32(cusIdObj);
        }

        // Lấy hoặc tạo category mặc định "Nhập khẩu" cho đơn hàng từ sàn
        int defaultCatId = await GetOrCreateCategoryAsync(conn, "Nhập khẩu", tenant.CompanyId!.Value);

        // Tìm hoặc tạo product theo SKU (scope theo company để tránh xung đột multi-tenant)
        var productSql = """
            INSERT INTO public.products
                (sku, product_name, base_price, cost_price, category_id, is_active, company_id, created_at, updated_at)
            VALUES
                (@sku, @name, @price, 0, @catId, TRUE, @cid::uuid, NOW(), NOW())
            ON CONFLICT (sku, company_id) DO NOTHING
            RETURNING product_id
            """;
        await using var prCmd = new NpgsqlCommand(productSql, conn);
        prCmd.Parameters.AddWithValue("sku",   o.Sku.Length > 0 ? o.Sku : $"IMPORT-{Guid.NewGuid():N}"[..20]);
        prCmd.Parameters.AddWithValue("name",  o.ProductName.Length > 0 ? o.ProductName : o.Sku);
        prCmd.Parameters.AddWithValue("price", o.UnitPrice);
        prCmd.Parameters.AddWithValue("catId", defaultCatId);
        prCmd.Parameters.AddWithValue("cid",   tenant.CompanyId!.Value.ToString());
        var prodIdObj = await prCmd.ExecuteScalarAsync();
        int productId;
        if (prodIdObj is null or DBNull)
        {
            await using var getCmd = new NpgsqlCommand(
                "SELECT product_id FROM public.products WHERE sku=@sku AND company_id=@cid::uuid LIMIT 1", conn);
            getCmd.Parameters.AddWithValue("sku", o.Sku.Length > 0 ? o.Sku : "");
            getCmd.Parameters.AddWithValue("cid", tenant.CompanyId!.Value.ToString());
            productId = Convert.ToInt32(await getCmd.ExecuteScalarAsync() ?? 0);
        }
        else { productId = Convert.ToInt32(prodIdObj); }

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
                        (order_id, product_id, quantity, unit_price, sale_price,
                         original_price, subtotal,
                         product_name, sku, variation_name,
                         seller_discount, platform_discount,
                         created_at)
                    VALUES
                        (@oid, @pid, @qty, @price, @saleP,
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

                // DB customers co 'district' thay vi 'city'
                var sql = """
                    INSERT INTO public.customers (email, full_name, phone_number, address,
                        district, province, is_active, company_id, created_at, updated_at)
                    VALUES (@email, @name, @phone, @addr, @district, @province, TRUE, @companyId::uuid, @reg, NOW())
                    ON CONFLICT (email) DO NOTHING
                    """;

                await using var cmd = new NpgsqlCommand(sql, conn);
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
    // platform=shopee|tiktok|lazada|ghn  type=orders|products  includeSample=true|false
    [HttpGet("/api/templates/download")]
    [AllowAnonymous]  // cho phép tải template không cần login (chỉ tải mẫu)
    public IActionResult DownloadTemplate(
        [FromQuery] string platform    = "shopee",
        [FromQuery] string type        = "orders",
        [FromQuery] bool   includeSample = true)
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
                "Mã đơn hàng,Trạng thái đơn hàng,Lý do hủy,Ngày đặt hàng,Ngày cập nhật," +
                "Tên người mua,Tên người nhận,Số điện thoại,Địa chỉ giao hàng,Phường/Xã,Quận/Huyện,Tỉnh/Thành," +
                "Tên sản phẩm,Phân loại hàng,SKU sản phẩm,Giá gốc (VND),Giá bán (VND),Số lượng," +
                "Tổng tiền hàng (VND),Phí vận chuyển (VND),Tổng thanh toán (VND)," +
                "Phương thức thanh toán,Đơn vị vận chuyển,Mã vận đơn,Ghi chú",

            ("shopee", "products") =>
                "Mã sản phẩm Shopee,Tên sản phẩm,SKU,Danh mục,Thương hiệu," +
                "Giá gốc (VND),Giá bán (VND),Tồn kho,Trạng thái,Cân nặng (kg),Mô tả,Ảnh sản phẩm",

            ("tiktok", "orders")   =>
                "Order ID,Order Status,Create Time,Update Time,Paid Time," +
                "Buyer Username,Recipient Name,Phone,Full Address,Province,District,Ward,Postal Code," +
                "Product Name,SKU ID,Seller SKU,SKU Name,Original Price (VND),Sale Price (VND),Quantity," +
                "Sub Total (VND),Shipping Fee (VND),Platform Discount (VND),Total Amount (VND)," +
                "Payment Method,Shipping Provider,Tracking Number,Package ID,Package Status",

            ("tiktok", "products") =>
                "Product ID,Title,Status,Category,Brand," +
                "SKU ID,Seller SKU,SKU Name,Sale Price (VND),Inventory,Create Time,Update Time",

            ("lazada", "orders")   =>
                "Order ID,Order Number,Created At,Updated At,Status," +
                "Customer First Name,Customer Last Name,Phone,Address,City,District,Province," +
                "Item Name,SKU,Seller SKU,Variation,Unit Price (VND),Paid Price (VND),Quantity," +
                "Shipping Provider,Tracking Code,Payment Method,Voucher Platform,Voucher Seller," +
                "Shipping Fee (VND),Order Value (VND)",

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

        // ── Sample rows ──────────────────────────────────────────────────────
        if (includeSample)
        {
            var samples = (plt, typ) switch
            {
                ("shopee", "orders") => new[]
                {
                    $"2605{now:MMdd}001,COMPLETED,,{now.AddDays(-25):dd/MM/yyyy HH:mm},{now.AddDays(-23):dd/MM/yyyy HH:mm},nguyenvanan,Nguyễn Văn An,0901234567,\"123 Nguyễn Trãi P.3 Q.5\",Phường 3,Quận 5,TP. Hồ Chí Minh,\"Áo thun nam basic cotton\",\"Trắng - L\",AT-NAM-001-TRANG-L,250000,220000,2,440000,25000,465000,COD,Giao Hàng Nhanh,SPX{now:yyyyMMdd}001,",
                    $"2605{now:MMdd}002,COMPLETED,,{now.AddDays(-20):dd/MM/yyyy HH:mm},{now.AddDays(-18):dd/MM/yyyy HH:mm},tranthib,Trần Thị Bình,0912345678,\"45 Hoàng Hoa Thám P.7 Q.Bình Thạnh\",Phường 7,Quận Bình Thạnh,TP. Hồ Chí Minh,\"Đầm maxi nữ đi biển\",\"Xanh - M\",DAM-NU-003-XANH-M,450000,399000,1,399000,30000,429000,MOMO,Giao Hàng Nhanh,SPX{now:yyyyMMdd}002,",
                    $"2605{now:MMdd}003,SHIPPED,,{now.AddDays(-10):dd/MM/yyyy HH:mm},{now.AddDays(-8):dd/MM/yyyy HH:mm},leminhduc,Lê Minh Đức,0923456789,\"78 Lê Lợi P.Bến Nghé Q.1\",Phường Bến Nghé,Quận 1,TP. Hồ Chí Minh,\"Quần jean nam slim fit\",\"Xanh đậm - 32\",QJ-NAM-002-XANH-32,580000,520000,1,520000,25000,545000,VNPAY,Giao Hàng Nhanh,SPX{now:yyyyMMdd}003,",
                    $"2605{now:MMdd}004,CANCELLED,Không muốn mua nữa,{now.AddDays(-5):dd/MM/yyyy HH:mm},{now.AddDays(-4):dd/MM/yyyy HH:mm},phamthuh,Phạm Thu Hà,0934567890,\"12 Trần Phú P.Hải Châu 1 Q.Hải Châu\",Phường Hải Châu 1,Quận Hải Châu,Đà Nẵng,\"Áo sơ mi nam công sở\",\"Trắng - M\",ASM-NAM-004-TRANG-M,320000,280000,1,280000,30000,310000,COD,Giao Hàng Nhanh,,",
                    $"2605{now:MMdd}005,COMPLETED,,{now.AddDays(-3):dd/MM/yyyy HH:mm},{now.AddDays(-1):dd/MM/yyyy HH:mm},hoangqk,Hoàng Quốc Khải,0945678901,\"56 Đinh Tiên Hoàng P.ĐaKao Q.1\",Phường ĐaKao,Quận 1,TP. Hồ Chí Minh,\"Túi xách nữ da PU\",\"Đen - One Size\",TX-NU-005-DEN-OS,680000,599000,1,599000,35000,634000,ZALOPAY,Giao Hàng Nhanh,SPX{now:yyyyMMdd}005,",
                },
                ("shopee", "products") => new[]
                {
                    $"100001,Áo thun nam basic cotton thoáng mát,AT-NAM-001,Áo nam,PhuThinh Fashion,250000,220000,150,NORMAL,0.3,\"Chất cotton 100% thoáng mát\",https://cf.shopee.vn/file/at_nam_001.jpg",
                    $"100002,Áo sơ mi nam công sở dài tay,ASM-NAM-004,Áo nam,PhuThinh Fashion,320000,280000,120,NORMAL,0.35,\"Vải lụa cotton mềm mại\",https://cf.shopee.vn/file/asm_nam_004.jpg",
                    $"100003,Quần jean nam slim fit,QJ-NAM-002,Quần nam,PhuThinh Fashion,580000,520000,80,NORMAL,0.6,\"Denim cao cấp co giãn 4 chiều\",https://cf.shopee.vn/file/qj_nam_002.jpg",
                    $"100004,Đầm maxi nữ đi biển,DAM-NU-003,Đầm & Váy,PhuThinh Fashion,450000,399000,60,NORMAL,0.4,\"Chất vải musselin nhẹ nhàng\",https://cf.shopee.vn/file/dam_nu_003.jpg",
                    $"100005,Túi xách nữ da PU,TX-NU-005,Túi xách & Ba lô,PhuThinh Fashion,750000,650000,45,NORMAL,0.5,\"Da PU cao cấp chống nước\",https://cf.shopee.vn/file/tx_nu_005.jpg",
                },
                ("tiktok", "orders") => new[]
                {
                    $"576{now:yyyyMMddHH}0001,COMPLETED,{now.AddDays(-25):yyyy-MM-dd HH:mm:ss},{now.AddDays(-23):yyyy-MM-dd HH:mm:ss},{now.AddDays(-25):yyyy-MM-dd HH:mm:ss},user_12345,Nguyễn Văn An,0901234567,\"123 Nguyễn Trãi P.3 Q.5 TP.HCM\",TP. Hồ Chí Minh,Quận 5,Phường 3,,\"Áo thun nam basic cotton\",172001,AT-NAM-001-TRANG-L,\"Trắng - L\",250000,220000,2,440000,25000,0,465000,COD,GHN,TTKGHN{now:yyyyMMdd}01,115001,COMPLETED",
                    $"576{now:yyyyMMddHH}0002,COMPLETED,{now.AddDays(-18):yyyy-MM-dd HH:mm:ss},{now.AddDays(-16):yyyy-MM-dd HH:mm:ss},{now.AddDays(-18):yyyy-MM-dd HH:mm:ss},user_23456,Trần Thị Bình,0912345678,\"45 Hoàng Hoa Thám Q.Bình Thạnh TP.HCM\",TP. Hồ Chí Minh,Quận Bình Thạnh,Phường 7,,\"Đầm maxi nữ đi biển\",172002,DAM-NU-003-XANH-M,\"Xanh - M\",450000,399000,1,399000,30000,0,429000,Momo,GHN,TTKGHN{now:yyyyMMdd}02,115002,COMPLETED",
                    $"576{now:yyyyMMddHH}0003,IN_TRANSIT,{now.AddDays(-8):yyyy-MM-dd HH:mm:ss},{now.AddDays(-6):yyyy-MM-dd HH:mm:ss},{now.AddDays(-8):yyyy-MM-dd HH:mm:ss},user_34567,Lê Minh Đức,0923456789,\"78 Lê Lợi Q.1 TP.HCM\",TP. Hồ Chí Minh,Quận 1,Phường Bến Nghé,,\"Quần jean nam slim fit\",172003,QJ-NAM-002-XANH-32,\"Xanh đậm - 32\",580000,520000,1,520000,25000,0,545000,VNPay,GHN,TTKGHN{now:yyyyMMdd}03,115003,IN_TRANSIT",
                    $"576{now:yyyyMMddHH}0004,CANCELLED,{now.AddDays(-5):yyyy-MM-dd HH:mm:ss},{now.AddDays(-4):yyyy-MM-dd HH:mm:ss},{now.AddDays(-5):yyyy-MM-dd HH:mm:ss},user_45678,Phạm Thu Hà,0934567890,\"12 Trần Phú Q.Hải Châu Đà Nẵng\",Đà Nẵng,Quận Hải Châu,Phường Hải Châu 1,,\"Áo sơ mi nam công sở\",172004,ASM-NAM-004-TRANG-M,\"Trắng - M\",320000,280000,1,280000,30000,0,310000,COD,GHN,,115004,CANCELLED",
                    $"576{now:yyyyMMddHH}0005,COMPLETED,{now.AddDays(-2):yyyy-MM-dd HH:mm:ss},{now.AddDays(-1):yyyy-MM-dd HH:mm:ss},{now.AddDays(-2):yyyy-MM-dd HH:mm:ss},user_56789,Hoàng Quốc Khải,0945678901,\"56 Đinh Tiên Hoàng Q.1 TP.HCM\",TP. Hồ Chí Minh,Quận 1,Phường ĐaKao,,\"Túi xách nữ da PU\",172005,TX-NU-005-DEN-OS,\"Đen - One Size\",750000,650000,1,650000,35000,0,685000,ZaloPay,GHN,TTKGHN{now:yyyyMMdd}05,115005,COMPLETED",
                },
                ("tiktok", "products") => new[]
                {
                    $"1729{now:yyyyMMdd}001,Áo thun nam basic cotton thoáng mát,ACTIVATE,Thời trang nam,PhuThinh Fashion,2729001,AT-NAM-001-TRANG-L,\"Trắng - L\",220000,150,{now.AddDays(-90):yyyy-MM-dd},{now.AddDays(-10):yyyy-MM-dd}",
                    $"1729{now:yyyyMMdd}002,Đầm maxi nữ đi biển,ACTIVATE,Thời trang nữ,PhuThinh Fashion,2729002,DAM-NU-003-XANH-M,\"Xanh - M\",399000,60,{now.AddDays(-80):yyyy-MM-dd},{now.AddDays(-5):yyyy-MM-dd}",
                    $"1729{now:yyyyMMdd}003,Quần jean nam slim fit,ACTIVATE,Thời trang nam,PhuThinh Fashion,2729003,QJ-NAM-002-XANH-32,\"Xanh đậm - 32\",520000,80,{now.AddDays(-75):yyyy-MM-dd},{now.AddDays(-3):yyyy-MM-dd}",
                    $"1729{now:yyyyMMdd}004,Áo sơ mi nam công sở dài tay,ACTIVATE,Thời trang nam,PhuThinh Fashion,2729004,ASM-NAM-004-TRANG-M,\"Trắng - M\",280000,120,{now.AddDays(-70):yyyy-MM-dd},{now.AddDays(-2):yyyy-MM-dd}",
                    $"1729{now:yyyyMMdd}005,Túi xách nữ da PU,ACTIVATE,Túi & Ví,PhuThinh Fashion,2729005,TX-NU-005-DEN-OS,\"Đen - One Size\",650000,45,{now.AddDays(-60):yyyy-MM-dd},{now.AddDays(-1):yyyy-MM-dd}",
                },
                ("lazada", "orders") => new[]
                {
                    $"7010{now:MMddHH}01,150{now:MMddHH}001,{now.AddDays(-25):yyyy-MM-ddTHH:mm:ss}+07:00,{now.AddDays(-23):yyyy-MM-ddTHH:mm:ss}+07:00,delivered,Văn An,Nguyễn,0901234567,\"123 Nguyễn Trãi P.3 Q.5\",Quận 5,Quận 5,TP. Hồ Chí Minh,Áo thun nam basic cotton,AT-NAM-001-TRANG-L,AT-NAM-001-TRANG-L,\"Trắng;L\",250000,220000,2,Lazada Logistics,LZD-VN-{now:yyyyMMdd}01,COD,0,0,25000,465000",
                    $"7010{now:MMddHH}02,150{now:MMddHH}002,{now.AddDays(-20):yyyy-MM-ddTHH:mm:ss}+07:00,{now.AddDays(-18):yyyy-MM-ddTHH:mm:ss}+07:00,delivered,Thị Bình,Trần,0912345678,\"45 Hoàng Hoa Thám P.7 Q.Bình Thạnh\",Quận Bình Thạnh,Quận Bình Thạnh,TP. Hồ Chí Minh,Đầm maxi nữ đi biển,DAM-NU-003-XANH-M,DAM-NU-003-XANH-M,\"Xanh;M\",450000,399000,1,Lazada Logistics,LZD-VN-{now:yyyyMMdd}02,Momo,0,0,30000,429000",
                    $"7010{now:MMddHH}03,150{now:MMddHH}003,{now.AddDays(-12):yyyy-MM-ddTHH:mm:ss}+07:00,{now.AddDays(-10):yyyy-MM-ddTHH:mm:ss}+07:00,shipped,Minh Đức,Lê,0923456789,\"78 Lê Lợi P.Bến Nghé Q.1\",Quận 1,Quận 1,TP. Hồ Chí Minh,Quần jean nam slim fit,QJ-NAM-002-XANH-32,QJ-NAM-002-XANH-32,\"Xanh đậm;32\",580000,520000,1,Lazada Logistics,LZD-VN-{now:yyyyMMdd}03,COD,0,0,25000,545000",
                    $"7010{now:MMddHH}04,150{now:MMddHH}004,{now.AddDays(-5):yyyy-MM-ddTHH:mm:ss}+07:00,{now.AddDays(-4):yyyy-MM-ddTHH:mm:ss}+07:00,cancelled,Thu Hà,Phạm,0934567890,\"12 Trần Phú P.Hải Châu 1 Q.Hải Châu\",Quận Hải Châu,Quận Hải Châu,Đà Nẵng,Áo sơ mi nam công sở dài tay,ASM-NAM-004-TRANG-M,ASM-NAM-004-TRANG-M,\"Trắng;M\",320000,280000,1,Lazada Logistics,,COD,0,0,30000,310000",
                    $"7010{now:MMddHH}05,150{now:MMddHH}005,{now.AddDays(-2):yyyy-MM-ddTHH:mm:ss}+07:00,{now.AddDays(-1):yyyy-MM-ddTHH:mm:ss}+07:00,delivered,Quốc Khải,Hoàng,0945678901,\"56 Đinh Tiên Hoàng P.ĐaKao Q.1\",Quận 1,Quận 1,TP. Hồ Chí Minh,Túi xách nữ da PU,TX-NU-005-DEN-OS,TX-NU-005-DEN-OS,\"Đen;One Size\",750000,650000,1,Lazada Logistics,LZD-VN-{now:yyyyMMdd}05,VNPay,0,0,35000,685000",
                },
                ("lazada", "products") => new[]
                {
                    $"100001,Áo thun nam basic cotton thoáng mát,Active,Thời trang nam,PhuThinh Fashion,AT-NAM-001,250000,220000,150,0.30,\"Chất cotton 100% thoáng mát\"",
                    $"100002,Áo sơ mi nam công sở dài tay,Active,Thời trang nam,PhuThinh Fashion,ASM-NAM-004,320000,280000,120,0.35,\"Vải lụa cotton mềm mại\"",
                    $"100003,Quần jean nam slim fit,Active,Thời trang nam,PhuThinh Fashion,QJ-NAM-002,580000,520000,80,0.60,\"Denim cao cấp co giãn 4 chiều\"",
                    $"100004,Đầm maxi nữ đi biển,Active,Thời trang nữ,PhuThinh Fashion,DAM-NU-003,450000,399000,60,0.40,\"Chất vải musselin nhẹ nhàng\"",
                    $"100005,Túi xách nữ da PU,Active,Túi xách & Ba lô,PhuThinh Fashion,TX-NU-005,750000,650000,45,0.50,\"Da PU cao cấp chống nước\"",
                },
                ("ghn", "orders") => new[]
                {
                    $"SPXVN{now:yyyyMMdd}01,2605{now:MMdd}001,delivered,{now.AddDays(-23):yyyy-MM-dd HH:mm:ss},{now.AddDays(-22):yyyy-MM-dd HH:mm:ss},Nguyễn Văn An,0901234567,\"123 Nguyễn Trãi P.3 Q.5 TP.HCM\",1442,465000,465000,\"Áo thun nam\",300,2,1",
                    $"SPXVN{now:yyyyMMdd}02,2605{now:MMdd}002,delivered,{now.AddDays(-18):yyyy-MM-dd HH:mm:ss},{now.AddDays(-17):yyyy-MM-dd HH:mm:ss},Trần Thị Bình,0912345678,\"45 Hoàng Hoa Thám Q.Bình Thạnh TP.HCM\",1444,0,429000,\"Đầm maxi nữ\",400,2,2",
                    $"SPXVN{now:yyyyMMdd}03,2605{now:MMdd}003,transporting,{now.AddDays(-6):yyyy-MM-dd HH:mm:ss},{now.AddDays(-5):yyyy-MM-dd HH:mm:ss},Lê Minh Đức,0923456789,\"78 Lê Lợi Q.1 TP.HCM\",1452,545000,545000,\"Quần jean nam\",600,2,1",
                    $"SPXVN{now:yyyyMMdd}04,2605{now:MMdd}004,cancel,{now.AddDays(-4):yyyy-MM-dd HH:mm:ss},{now.AddDays(-3):yyyy-MM-dd HH:mm:ss},Phạm Thu Hà,0934567890,\"12 Trần Phú Q.Hải Châu Đà Nẵng\",1553,310000,310000,\"Áo sơ mi nam\",350,2,1",
                    $"SPXVN{now:yyyyMMdd}05,2605{now:MMdd}005,delivered,{now.AddDays(-1):yyyy-MM-dd HH:mm:ss},{now:yyyy-MM-dd HH:mm:ss},Hoàng Quốc Khải,0945678901,\"56 Đinh Tiên Hoàng Q.1 TP.HCM\",1456,0,685000,\"Túi xách nữ\",500,2,2",
                },
                _ => Array.Empty<string>(),
            };

            foreach (var row in samples)
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
