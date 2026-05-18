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

        // Fallback header-only nếu file chưa tồn tại
        var fallback = (src, type) switch
        {
            ("shopee", "orders")   => "Mã đơn hàng,Trạng thái đơn hàng,Ngày đặt hàng,Tên người dùng (Tên đăng nhập),Tên người nhận,Số điện thoại,Tỉnh,Tên sản phẩm,SKU sản phẩm,Giá niêm yết (VND),Số lượng,Tổng thanh toán,Phương thức thanh toán,Mã vận đơn",
            ("shopee", "products") => "Shopee ID,Tên sản phẩm,SKU,Danh mục,Giá bán,Giá gốc,Kho hàng,Trạng thái,Thương hiệu",
            ("tiktok", "orders")   => "Order ID,Order Status,Buyer Username,Recipient,Phone #,Province,City,Product Name,Seller SKU,Original Price,After-discount Price,Quantity,Subtotal,Tracking ID,Shipping Provider,Order Creation Time,Order Amount,Payment Method",
            ("tiktok", "products") => "Product ID,Product Name,Seller SKU,Category,Original Price,Sales Price,Warehouse Stock,Status,Brand",
            ("lazada", "orders")   => "Order ID,Order Number,Created At,Updated At,Status,Customer Name,Customer Email,Shipping Name,Shipping Phone,Shipping Address,Shipping City,Payment Method,Item Name,SKU,Seller SKU,Unit Price,Paid Price,Quantity,Shipping Provider,Tracking Code,Shipping Fee,Order Value",
            ("lazada", "products") => "Item ID,Name,SellerSKU,Category,Price,Special Price,Stock,Active Status,Brand",
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
        // Shopee: có "mã đơn hàng" + "tên người dùng (tên đăng nhập)"
        if (h.Contains("mã đơn hàng") && h.Any(x => x.Contains("tên người dùng")))
            return "shopee";
        // TikTok: có "order id" + "buyer username" + "sku id"
        if (h.Contains("order id") && h.Contains("buyer username"))
            return "tiktok";
        // Lazada: có "order id" + "order number" + "customer email"
        if (h.Contains("order id") && h.Contains("order number") && h.Contains("customer email"))
            return "lazada";
        return null;
    }

    // ── Field mappers ─────────────────────────────────────────────────────────

    private record MappedOrder(
        string OrderCode, string CustomerUsername, string RecipientName,
        string Phone, string Province, string District,
        string ProductName, string Sku, decimal UnitPrice, decimal SalePrice,
        int Quantity, decimal TotalAmount, decimal ShippingFee,
        string PaymentMethod, string TrackingNumber, string Status,
        DateTime OrderDate, string Channel);

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

        var orderDate = DateTime.TryParse(
            ColVal(row, HeaderIndex(headers, "Ngày đặt hàng")), out var od) ? od : DateTime.UtcNow;
        var totalStr  = ColVal(row, HeaderIndex(headers, "Tổng thanh toán"));
        decimal.TryParse(totalStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var total);
        var priceStr  = ColVal(row, HeaderIndex(headers, "Giá niêm yết (VND)"));
        decimal.TryParse(priceStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        var origStr   = ColVal(row, HeaderIndex(headers, "Giá gốc (VND)"));
        decimal.TryParse(origStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        var qtyStr    = ColVal(row, HeaderIndex(headers, "Số lượng"));
        int.TryParse(qtyStr, out var qty); if (qty <= 0) qty = 1;
        var feeStr    = ColVal(row, HeaderIndex(headers, "Phí vận chuyển (VND)"));
        decimal.TryParse(feeStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var shippingFee);

        return new MappedOrder(
            OrderCode:       code,
            CustomerUsername: ColVal(row, HeaderIndex(headers, "Tên người dùng (Tên đăng nhập)")),
            RecipientName:   ColVal(row, HeaderIndex(headers, "Tên người nhận")),
            Phone:           ColVal(row, HeaderIndex(headers, "Số điện thoại")),
            Province:        ColVal(row, HeaderIndex(headers, "Tỉnh")),
            District:        ColVal(row, HeaderIndex(headers, "Thành phố")),
            ProductName:     ColVal(row, HeaderIndex(headers, "Tên sản phẩm")),
            Sku:             ColVal(row, HeaderIndex(headers, "SKU sản phẩm")),
            UnitPrice:       origPrice > 0 ? origPrice : salePrice,
            SalePrice:       salePrice,
            Quantity:        qty,
            TotalAmount:     total,
            ShippingFee:     shippingFee,
            PaymentMethod:   ColVal(row, HeaderIndex(headers, "Phương thức thanh toán")),
            TrackingNumber:  ColVal(row, HeaderIndex(headers, "Mã vận đơn")),
            Status:          ColVal(row, HeaderIndex(headers, "Trạng thái đơn hàng")),
            OrderDate:       orderDate,
            Channel:         "shopee"
        );
    }

    private static MappedOrder? MapTikTokRow(string[] row, string[] headers)
    {
        var code = ColVal(row, HeaderIndex(headers, "Order ID"));
        if (string.IsNullOrEmpty(code)) return null;

        var createTimeStr = ColVal(row, HeaderIndex(headers, "Order Creation Time"));
        var orderDate = DateTime.TryParse(createTimeStr, out var od) ? od : DateTime.UtcNow;
        var totalStr  = ColVal(row, HeaderIndex(headers, "Order Amount"));
        decimal.TryParse(totalStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var total);
        var afterDiscStr = ColVal(row, HeaderIndex(headers, "After-discount Price"));
        decimal.TryParse(afterDiscStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        var origStr = ColVal(row, HeaderIndex(headers, "Original Price"));
        decimal.TryParse(origStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        var subStr = ColVal(row, HeaderIndex(headers, "Subtotal"));
        decimal.TryParse(subStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var subtotal);
        var qtyStr = ColVal(row, HeaderIndex(headers, "Quantity"));
        int.TryParse(qtyStr, out var qty); if (qty <= 0) qty = 1;

        return new MappedOrder(
            OrderCode:       code,
            CustomerUsername: ColVal(row, HeaderIndex(headers, "Buyer Username")),
            RecipientName:   ColVal(row, HeaderIndex(headers, "Recipient")),
            Phone:           ColVal(row, HeaderIndex(headers, "Phone #")),
            Province:        ColVal(row, HeaderIndex(headers, "Province")),
            District:        ColVal(row, HeaderIndex(headers, "City")),
            ProductName:     ColVal(row, HeaderIndex(headers, "Product Name")),
            Sku:             ColVal(row, HeaderIndex(headers, "Seller SKU")),
            UnitPrice:       origPrice > 0 ? origPrice : salePrice,
            SalePrice:       salePrice,
            Quantity:        qty,
            TotalAmount:     total > 0 ? total : subtotal,
            ShippingFee:     0,
            PaymentMethod:   ColVal(row, HeaderIndex(headers, "Payment Method")),
            TrackingNumber:  ColVal(row, HeaderIndex(headers, "Tracking ID")),
            Status:          ColVal(row, HeaderIndex(headers, "Order Status")),
            OrderDate:       orderDate,
            Channel:         "tiktok"
        );
    }

    private static MappedOrder? MapLazadaRow(string[] row, string[] headers)
    {
        var code = ColVal(row, HeaderIndex(headers, "Order Number", "Order ID"));
        if (string.IsNullOrEmpty(code)) return null;

        var createdStr = ColVal(row, HeaderIndex(headers, "Created At"));
        var orderDate = DateTime.TryParse(createdStr, out var od) ? od : DateTime.UtcNow;
        var totalStr  = ColVal(row, HeaderIndex(headers, "Order Value"));
        decimal.TryParse(totalStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var total);
        var paidStr   = ColVal(row, HeaderIndex(headers, "Paid Price"));
        decimal.TryParse(paidStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var salePrice);
        var unitStr   = ColVal(row, HeaderIndex(headers, "Unit Price"));
        decimal.TryParse(unitStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var origPrice);
        var feeStr    = ColVal(row, HeaderIndex(headers, "Shipping Fee"));
        decimal.TryParse(feeStr.Replace(",",""), NumberStyles.Any, CultureInfo.InvariantCulture, out var shippingFee);
        var qtyStr    = ColVal(row, HeaderIndex(headers, "Quantity"));
        int.TryParse(qtyStr, out var qty); if (qty <= 0) qty = 1;

        return new MappedOrder(
            OrderCode:       code,
            CustomerUsername: ColVal(row, HeaderIndex(headers, "Customer Email")),
            RecipientName:   ColVal(row, HeaderIndex(headers, "Shipping Name", "Customer Name")),
            Phone:           ColVal(row, HeaderIndex(headers, "Shipping Phone")),
            Province:        ColVal(row, HeaderIndex(headers, "Shipping Region", "Shipping City")),
            District:        ColVal(row, HeaderIndex(headers, "Shipping City")),
            ProductName:     ColVal(row, HeaderIndex(headers, "Item Name")),
            Sku:             ColVal(row, HeaderIndex(headers, "Seller SKU", "SKU")),
            UnitPrice:       origPrice > 0 ? origPrice : salePrice,
            SalePrice:       salePrice,
            Quantity:        qty,
            TotalAmount:     total,
            ShippingFee:     shippingFee,
            PaymentMethod:   ColVal(row, HeaderIndex(headers, "Payment Method")),
            TrackingNumber:  ColVal(row, HeaderIndex(headers, "Tracking Code")),
            Status:          ColVal(row, HeaderIndex(headers, "Status")),
            OrderDate:       orderDate,
            Channel:         "lazada"
        );
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

        // Insert order
        var orderSql = """
            INSERT INTO public.orders
                (order_code, customer_id, channel_id, order_date, status,
                 total_amount, shipping_fee, payment_method, tracking_number,
                 company_id, created_at, updated_at)
            VALUES
                (@code, @custId, @chanId, @date, @status,
                 @total, @ship, @pay, @track,
                 @cid::uuid, NOW(), NOW())
            ON CONFLICT (order_code) DO NOTHING
            """;
        await using var orCmd = new NpgsqlCommand(orderSql, conn);
        orCmd.Parameters.AddWithValue("code",   o.OrderCode);
        orCmd.Parameters.AddWithValue("custId", customerId);
        orCmd.Parameters.AddWithValue("chanId", channelId);
        orCmd.Parameters.AddWithValue("date",   o.OrderDate.ToUniversalTime());
        orCmd.Parameters.AddWithValue("status", o.Status);
        orCmd.Parameters.AddWithValue("total",  o.TotalAmount);
        orCmd.Parameters.AddWithValue("ship",   o.ShippingFee);
        orCmd.Parameters.AddWithValue("pay",    (object?)o.PaymentMethod ?? DBNull.Value);
        orCmd.Parameters.AddWithValue("track",  (object?)(o.TrackingNumber.Length > 0 ? o.TrackingNumber : null) ?? DBNull.Value);
        orCmd.Parameters.AddWithValue("cid",    tenant.CompanyId!.Value.ToString());
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
                        (order_id, product_id, quantity, unit_price, subtotal, created_at)
                    VALUES
                        (@oid, @pid, @qty, @price, @sub, NOW())
                    ON CONFLICT DO NOTHING
                    """;
                await using var itmCmd = new NpgsqlCommand(itemSql, conn);
                itmCmd.Parameters.AddWithValue("oid",   orderId);
                itmCmd.Parameters.AddWithValue("pid",   productId);
                itmCmd.Parameters.AddWithValue("qty",   o.Quantity);
                itmCmd.Parameters.AddWithValue("price", o.SalePrice > 0 ? o.SalePrice : o.UnitPrice);
                itmCmd.Parameters.AddWithValue("sub",   (o.SalePrice > 0 ? o.SalePrice : o.UnitPrice) * o.Quantity);
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
