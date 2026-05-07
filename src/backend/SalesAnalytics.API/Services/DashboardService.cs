using Npgsql;
using NpgsqlTypes;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Truy vấn Data Warehouse (schema dw) để lấy dữ liệu Dashboard/KPI.
/// Dùng Npgsql trực tiếp (không qua EF Core) vì DW là read-only analytics queries.
///
/// Join keys đúng theo schema 02_create_warehouse_tables.sql:
///   fact_sales.date_key    = dim_date.date_key
///   fact_sales.channel_key = dim_channel.channel_key
///   fact_sales.product_key = dim_product.product_key
///   fact_sales.customer_key = dim_customer.customer_key
/// </summary>
public class DashboardService
{
    private readonly string _connStr;

    public DashboardService(IConfiguration config)
    {
        _connStr = config.GetConnectionString("Default")!;
    }

    public virtual async Task<DashboardResponse> GetDashboardAsync(
        DateOnly from, DateOnly to, string? channel = null, Guid? companyId = null)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var kpi              = await GetKpiAsync(conn, from, to, channel, companyId);
        var revenueByDay     = await GetRevenueByDayAsync(conn, from, to, channel, companyId);
        var revenueByChannel = await GetRevenueByChannelAsync(conn, from, to, companyId);
        var topProducts      = await GetTopProductsAsync(conn, from, to, channel, companyId);

        return new DashboardResponse(kpi, revenueByDay, revenueByChannel, topProducts);
    }

    // ── KPI Summary ─────────────────────────────────────────────────────────

    private static async Task<KpiSummary> GetKpiAsync(
        NpgsqlConnection conn, DateOnly from, DateOnly to, string? channel, Guid? companyId = null)
    {
        // Tính kỳ trước để so sánh trend
        var days     = to.DayNumber - from.DayNumber;
        var prevFrom = from.AddDays(-days - 1);
        var prevTo   = from.AddDays(-1);

        // Kỳ hiện tại
        var sqlCurr = """
            SELECT
                COALESCE(SUM(fs.net_revenue),  0) AS total_revenue,
                COALESCE(SUM(fs.gross_profit), 0) AS total_profit,
                COALESCE(SUM(fs.order_count),  0) AS total_orders,
                COALESCE(AVG(fs.net_revenue),  0) AS avg_order_value,
                COUNT(DISTINCT fs.customer_key)    AS total_customers
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@channel   IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            """;

        await using var cmdCurr = new NpgsqlCommand(sqlCurr, conn);
        cmdCurr.Parameters.AddWithValue("from",    from.ToDateTime(TimeOnly.MinValue));
        cmdCurr.Parameters.AddWithValue("to",      to.ToDateTime(TimeOnly.MinValue));
        cmdCurr.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });
        cmdCurr.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        await using var rCurr = await cmdCurr.ExecuteReaderAsync();
        await rCurr.ReadAsync();

        var totalRevenue   = rCurr.GetDecimal(0);
        var totalProfit    = rCurr.GetDecimal(1);
        var totalOrders    = rCurr.GetInt32(2);
        var avgOrder       = rCurr.GetDecimal(3);
        var totalCustomers = rCurr.GetInt32(4);
        await rCurr.CloseAsync();

        // Kỳ trước (để tính % trend)
        var sqlPrev = """
            SELECT
                COALESCE(SUM(fs.net_revenue), 0) AS prev_revenue,
                COALESCE(SUM(fs.order_count), 0) AS prev_orders,
                COUNT(DISTINCT fs.customer_key)   AS prev_customers
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@channel   IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            """;

        await using var cmdPrev = new NpgsqlCommand(sqlPrev, conn);
        cmdPrev.Parameters.AddWithValue("from",    prevFrom.ToDateTime(TimeOnly.MinValue));
        cmdPrev.Parameters.AddWithValue("to",      prevTo.ToDateTime(TimeOnly.MinValue));
        cmdPrev.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });
        cmdPrev.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        await using var rPrev = await cmdPrev.ExecuteReaderAsync();
        await rPrev.ReadAsync();

        var prevRevenue   = rPrev.GetDecimal(0);
        var prevOrders    = rPrev.GetInt32(1);
        var prevCustomers = rPrev.GetInt32(2);
        await rPrev.CloseAsync();

        // Tính % thay đổi
        decimal Trend(decimal curr, decimal prev) =>
            prev > 0 ? Math.Round((curr - prev) / prev * 100, 1) : 0;

        var profitMarginPct = totalRevenue > 0
            ? Math.Round(totalProfit / totalRevenue * 100, 2) : 0m;

        return new KpiSummary(
            TotalRevenue:     totalRevenue,
            TotalProfit:      totalProfit,
            TotalOrders:      totalOrders,
            AvgOrderValue:    avgOrder,
            NewCustomers:     totalCustomers,
            RevenueGrowthPct: Trend(totalRevenue, prevRevenue),
            OrdersGrowthPct:  Trend(totalOrders, prevOrders),
            CustomersGrowthPct: Trend(totalCustomers, prevCustomers),
            ProfitMarginPct:  profitMarginPct
        );
    }

    // ── Revenue by day ───────────────────────────────────────────────────────

    private static async Task<List<RevenueByDay>> GetRevenueByDayAsync(
        NpgsqlConnection conn, DateOnly from, DateOnly to, string? channel, Guid? companyId = null)
    {
        var sql = """
            SELECT
                dd.full_date,
                SUM(fs.net_revenue)  AS net_revenue,
                SUM(fs.gross_profit) AS gross_profit,
                SUM(fs.order_count)  AS order_count
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@channel   IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            GROUP BY dd.full_date
            ORDER BY dd.full_date
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from",    from.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.AddWithValue("to",      to.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        var result = new List<RevenueByDay>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new RevenueByDay(
                Date:        DateOnly.FromDateTime(reader.GetDateTime(0)),
                NetRevenue:  reader.GetDecimal(1),
                GrossProfit: reader.GetDecimal(2),
                OrderCount:  reader.GetInt32(3)
            ));
        }
        return result;
    }

    // ── Revenue by channel ───────────────────────────────────────────────────

    private static async Task<List<RevenueByChannel>> GetRevenueByChannelAsync(
        NpgsqlConnection conn, DateOnly from, DateOnly to, Guid? companyId = null)
    {
        var sql = """
            SELECT
                dc.channel_name,
                SUM(fs.net_revenue) AS revenue,
                SUM(fs.order_count) AS orders
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            GROUP BY dc.channel_name
            ORDER BY revenue DESC
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.AddWithValue("to",   to.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        var rows = new List<(string, decimal, int)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            rows.Add((reader.GetString(0), reader.GetDecimal(1), reader.GetInt32(2)));

        var total = rows.Sum(r => r.Item2);
        return rows.Select(r => new RevenueByChannel(
            ChannelName: r.Item1,
            Revenue:     r.Item2,
            Orders:      r.Item3,
            RevenuePct:  total > 0 ? Math.Round(r.Item2 / total * 100, 1) : 0
        )).ToList();
    }

    // ── Top products ─────────────────────────────────────────────────────────

    private static async Task<List<TopProduct>> GetTopProductsAsync(
        NpgsqlConnection conn, DateOnly from, DateOnly to, string? channel, Guid? companyId = null)
    {
        var sql = """
            SELECT
                dp.product_key,
                dp.product_name,
                dp.sku,
                dc.channel_name,
                SUM(fs.item_quantity) AS qty_sold,
                SUM(fs.order_count)   AS total_orders,
                SUM(fs.net_revenue)   AS revenue
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_product dp ON fs.product_key = dp.product_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND dp.is_current = TRUE
              AND (@channel   IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            GROUP BY dp.product_key, dp.product_name, dp.sku, dc.channel_name
            ORDER BY revenue DESC
            LIMIT 10
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from",    from.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.AddWithValue("to",      to.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        var result = new List<TopProduct>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            result.Add(new TopProduct(
                ProductId:   reader.GetInt32(0),
                ProductName: reader.GetString(1),
                Sku:         reader.GetString(2),
                Channel:     reader.GetString(3),
                QtySold:     reader.GetInt32(4),
                TotalOrders: reader.GetInt32(5),
                Revenue:     reader.GetDecimal(6)
            ));
        }
        return result;
    }
}
