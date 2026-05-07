using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Import dữ liệu thủ công từ file CSV.
/// POST /api/import/{type}     — import file CSV
/// GET  /api/import/template/{type} — tải file CSV mẫu
/// </summary>
[ApiController]
[Route("api/import")]
[Authorize(Roles = "Owner,Manager,Admin")]
public class ImportController(IConfiguration cfg, ITenantContext tenant) : ControllerBase
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
            "customers"  => ("email,full_name,phone,address,city,province,registered_date",
                             "template_customers.csv"),
            "sales-data" => ("date,channel,product_sku,quantity_sold,revenue,order_count",
                             "template_sales_data.csv"),
            _            => (null, null)
        };

        if (header is null) return NotFound(new { message = "Loại dữ liệu không hợp lệ." });

        var bytes = Encoding.UTF8.GetBytes(header + "\r\n");
        return File(bytes, "text/csv", filename);
    }

    // ── POST /api/import/orders ───────────────────────────────────────────────
    [HttpPost("orders")]
    public async Task<IActionResult> ImportOrders(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        var rows = ParseCsv(file.OpenReadStream());
        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

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

        var rows = ParseCsv(file.OpenReadStream());
        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

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

                var sql = """
                    INSERT INTO public.products (sku, product_name, description, base_price, cost_price,
                        stock_quantity, is_active, company_id, created_at, updated_at)
                    VALUES (@sku, @name, @desc, @price, @cost, @stock, TRUE, @companyId::uuid, NOW(), NOW())
                    ON CONFLICT (sku) DO NOTHING
                    """;

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("sku",       sku);
                cmd.Parameters.AddWithValue("name",      name);
                cmd.Parameters.AddWithValue("desc",      (object?)description ?? DBNull.Value);
                cmd.Parameters.AddWithValue("price",     price);
                cmd.Parameters.AddWithValue("cost",      costPrice);
                cmd.Parameters.AddWithValue("stock",     stock);
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

    // ── POST /api/import/customers ────────────────────────────────────────────
    [HttpPost("customers")]
    public async Task<IActionResult> ImportCustomers(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        var rows = ParseCsv(file.OpenReadStream());
        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

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
                var city       = Cell(row, 4);
                var province   = Cell(row, 5);
                var regDate    = DateTime.TryParse(Cell(row, 6), out var rd) ? rd : DateTime.UtcNow;

                var sql = """
                    INSERT INTO public.customers (email, full_name, phone_number, address,
                        city, province, is_active, company_id, created_at, updated_at)
                    VALUES (@email, @name, @phone, @addr, @city, @province, TRUE, @companyId::uuid, @reg, NOW())
                    ON CONFLICT (email) DO NOTHING
                    """;

                await using var cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("email",     email);
                cmd.Parameters.AddWithValue("name",      fullName);
                cmd.Parameters.AddWithValue("phone",     (object?)phone ?? DBNull.Value);
                cmd.Parameters.AddWithValue("addr",      (object?)address ?? DBNull.Value);
                cmd.Parameters.AddWithValue("city",      (object?)city ?? DBNull.Value);
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

    // ── POST /api/import/sales-data ───────────────────────────────────────────
    [HttpPost("sales-data")]
    public async Task<IActionResult> ImportSalesData(IFormFile file)
    {
        if (file is null || file.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        var rows = ParseCsv(file.OpenReadStream());
        if (rows.Count < 2) return BadRequest(new { message = "File trống hoặc chỉ có header." });

        int success = 0, skipped = 0;
        var errors = new List<object>();

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

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
