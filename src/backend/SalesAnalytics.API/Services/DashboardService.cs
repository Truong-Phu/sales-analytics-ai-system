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

        // Tỷ lệ giữ chân = khách hàng mua trong kỳ này VÀ đã từng mua trước kỳ này
        // Tính từ OLTP orders (không phụ thuộc DW)
        decimal? retentionRate = null;
        if (companyId.HasValue && totalCustomers > 0)
        {
            var sqlRetention = """
                WITH customers_this_period AS (
                    SELECT DISTINCT customer_id
                    FROM public.orders
                    WHERE order_date::date BETWEEN @from AND @to
                      AND status NOT IN ('CANCELLED')
                      AND company_id = @companyId::uuid
                ),
                returning_customers AS (
                    SELECT ctp.customer_id
                    FROM customers_this_period ctp
                    WHERE EXISTS (
                        SELECT 1 FROM public.orders o2
                        WHERE o2.customer_id = ctp.customer_id
                          AND o2.order_date::date < @from
                          AND o2.status NOT IN ('CANCELLED')
                          AND o2.company_id = @companyId::uuid
                    )
                )
                SELECT
                    COUNT(*) FILTER (WHERE rc.customer_id IS NOT NULL) AS returning_count,
                    COUNT(ctp.customer_id) AS total_count
                FROM customers_this_period ctp
                LEFT JOIN returning_customers rc ON rc.customer_id = ctp.customer_id
                """;
            await using var retCmd = new NpgsqlCommand(sqlRetention, conn);
            retCmd.Parameters.AddWithValue("from",      from.ToDateTime(TimeOnly.MinValue));
            retCmd.Parameters.AddWithValue("to",        to.ToDateTime(TimeOnly.MinValue));
            retCmd.Parameters.AddWithValue("companyId", companyId.Value.ToString());
            await using var retReader = await retCmd.ExecuteReaderAsync();
            if (await retReader.ReadAsync())
            {
                var returningCount = retReader.GetInt64(0);
                var totalCount     = retReader.GetInt64(1);
                if (totalCount > 0)
                    retentionRate = Math.Round((decimal)returningCount / totalCount * 100, 1);
            }
            await retReader.CloseAsync();
        }

        return new KpiSummary(
            TotalRevenue:     totalRevenue,
            TotalProfit:      totalProfit,
            TotalOrders:      totalOrders,
            AvgOrderValue:    avgOrder,
            NewCustomers:     totalCustomers,
            RevenueGrowthPct: Trend(totalRevenue, prevRevenue),
            OrdersGrowthPct:  Trend(totalOrders, prevOrders),
            CustomersGrowthPct: Trend(totalCustomers, prevCustomers),
            ProfitMarginPct:  profitMarginPct,
            RetentionRate:    retentionRate
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
        // Tính year*12+month để so sánh khoảng tháng
        var fromYM = from.Year * 12 + from.Month;
        var toYM   = to.Year   * 12 + to.Month;

        var sql = """
            SELECT
                dc.channel_name,
                SUM(fs.net_revenue)                          AS revenue,
                SUM(fs.order_count)                          AS orders,
                COALESCE(ad.total_spend, 0)                  AS ad_spend,
                -- Return rate & cancel rate thực từ OLTP orders
                COALESCE(ret.return_count, 0)                AS return_count,
                COALESCE(ret.cancel_count, 0)                AS cancel_count,
                COALESCE(ret.total_count,  0)                AS total_oltp_count
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            -- LEFT JOIN chi phí QC từ OLTP
            -- LIKE matching vì dim_channel dùng tên ngắn ("shopee") còn sales_channels
            -- dùng tên đầy đủ ("Shopee Phú Thịnh")
            LEFT JOIN (
                SELECT LOWER(sc.channel_name) AS ch_lower, SUM(asm.amount) AS total_spend
                FROM public.ad_spend_monthly asm
                JOIN public.sales_channels sc ON sc.channel_id = asm.channel_id
                WHERE (@companyId IS NULL OR asm.company_id = @companyId::uuid)
                  AND (asm.year * 12 + asm.month) BETWEEN @fromYM AND @toYM
                GROUP BY LOWER(sc.channel_name)
            ) ad ON ad.ch_lower LIKE '%' || LOWER(dc.channel_name) || '%'
            -- LEFT JOIN tỷ lệ hoàn/huỷ thực từ OLTP orders
            LEFT JOIN (
                SELECT
                    LOWER(sc2.channel_name) AS ch_lower,
                    COUNT(*) FILTER (WHERE o.status = 'RETURNED')  AS return_count,
                    COUNT(*) FILTER (WHERE o.status = 'CANCELLED') AS cancel_count,
                    COUNT(*)                                        AS total_count
                FROM public.orders o
                JOIN public.sales_channels sc2 ON o.channel_id = sc2.channel_id
                WHERE o.order_date BETWEEN @from AND @to
                  AND (@companyId IS NULL OR o.company_id = @companyId::uuid)
                GROUP BY LOWER(sc2.channel_name)
            ) ret ON ret.ch_lower LIKE '%' || LOWER(dc.channel_name) || '%'
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            GROUP BY dc.channel_name, ad.total_spend, ret.return_count, ret.cancel_count, ret.total_count
            ORDER BY revenue DESC
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from",      from.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.AddWithValue("to",        to.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.AddWithValue("fromYM",    fromYM);
        cmd.Parameters.AddWithValue("toYM",      toYM);
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        var rows = new List<(string channel, decimal revenue, int orders, decimal adSpend, long returnCount, long cancelCount, long totalCount)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            rows.Add((
                reader.GetString(0), reader.GetDecimal(1), reader.GetInt32(2), reader.GetDecimal(3),
                reader.GetInt64(4),  reader.GetInt64(5),   reader.GetInt64(6)
            ));

        var total = rows.Sum(r => r.revenue);
        return rows.Select(r => {
            var roas       = r.adSpend > 0 ? Math.Round(r.revenue / r.adSpend, 2) : 0;
            var returnRate = r.totalCount > 0 ? Math.Round((decimal)r.returnCount / r.totalCount * 100, 1) : 0m;
            var cancelRate = r.totalCount > 0 ? Math.Round((decimal)r.cancelCount / r.totalCount * 100, 1) : 0m;
            return new RevenueByChannel(
                ChannelName: r.channel,
                Revenue:     r.revenue,
                Orders:      r.orders,
                RevenuePct:  total > 0 ? Math.Round(r.revenue / total * 100, 1) : 0,
                AdSpend:     r.adSpend,
                Roas:        roas,
                ReturnRate:  returnRate,
                CancelRate:  cancelRate
            );
        }).ToList();
    }

    // ── Mobile endpoints (revenue-trend, top-products, channel-revenue) ─────────

    private static readonly Dictionary<string, string> _channelColors =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["shopee"]      = "#EE4D2D",
            ["lazada"]      = "#0F146D",
            ["tiktok"]      = "#010101",
            ["tiktok shop"] = "#010101",
            ["facebook"]    = "#1877F2",
            ["website"]     = "#6B7280",
            ["zalo"]        = "#0066CC",
        };

    public async Task<List<object>> GetRevenueTrendAsync(int days, Guid? companyId)
    {
        if (days < 1)  days = 7;
        if (days > 90) days = 90;
        var to   = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = to.AddDays(-(days - 1));

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var rows = await GetRevenueByDayAsync(conn, from, to, null, companyId);
        var dayLabels = new[] { "CN", "T2", "T3", "T4", "T5", "T6", "T7" };
        return rows.Select(r => (object)new
        {
            label = dayLabels[(int)r.Date.DayOfWeek],
            date  = r.Date.ToString("MM-dd"),
            value = r.NetRevenue,
        }).ToList();
    }

    public async Task<List<object>> GetTopProductsMobileAsync(int limit, Guid? companyId)
    {
        if (limit < 1)  limit = 5;
        if (limit > 20) limit = 20;
        var to   = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = to.AddDays(-30);

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var rows = await GetTopProductsAsync(conn, from, to, null, companyId);
        return rows.Take(limit).Select(r => (object)new
        {
            name    = r.ProductName,
            channel = r.Channel,
            revenue = r.Revenue,
        }).ToList();
    }

    public async Task<List<object>> GetChannelRevenueMobileAsync(Guid? companyId)
    {
        var to   = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = to.AddDays(-30);

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var rows = await GetRevenueByChannelAsync(conn, from, to, companyId);
        return rows.Select(r => (object)new
        {
            channel = r.ChannelName,
            revenue = r.Revenue,
            color   = _channelColors.GetValueOrDefault(r.ChannelName.ToLower(), "#6366F1"),
        }).ToList();
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

    // ── Operations KPIs (return rate, cancel rate, delivery success) ─────────

    public async Task<object> GetOpsKpiAsync(DateOnly from, DateOnly to, string? channel, Guid? companyId)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT
                COUNT(*)::float                                                          AS total,
                COUNT(*) FILTER (WHERE o.status = 'RETURNED')::float                   AS returned,
                COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::float                  AS cancelled,
                COUNT(*) FILTER (WHERE o.shipping_status = 'DELIVERED')::float         AS delivered
            FROM public.orders o
            LEFT JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
            WHERE o.order_date >= @from
              AND o.order_date <  @to
              AND (@companyId IS NULL OR o.company_id = @companyId::uuid)
              AND (@channel   IS NULL OR sc.channel_name ILIKE '%' || @channel || '%')
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.AddWithValue("to",   to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });

        await using var r = await cmd.ExecuteReaderAsync();
        await r.ReadAsync();
        double total      = r.GetDouble(0);
        double returned   = r.GetDouble(1);
        double cancelled  = r.GetDouble(2);
        double delivered  = r.GetDouble(3);
        await r.CloseAsync();

        double returnRate      = total > 0 ? Math.Round(returned  / total * 100, 1) : 0;
        double cancelRate      = total > 0 ? Math.Round(cancelled / total * 100, 1) : 0;
        double deliverySuccess = total > 0 ? Math.Round(delivered / total * 100, 1) : 0;

        // returnByChannel
        var sqlCh = """
            SELECT
                sc.channel_name,
                COUNT(*)::float                                                  AS total,
                COUNT(*) FILTER (WHERE o.status = 'RETURNED')::float            AS returned
            FROM public.orders o
            JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
            WHERE o.order_date >= @from
              AND o.order_date <  @to
              AND (@companyId IS NULL OR o.company_id = @companyId::uuid)
            GROUP BY sc.channel_name
            ORDER BY sc.channel_name
            """;
        await using var cmdCh = new NpgsqlCommand(sqlCh, conn);
        cmdCh.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmdCh.Parameters.AddWithValue("to",   to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmdCh.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        var returnByChannel = new List<object>();
        await using var rCh = await cmdCh.ExecuteReaderAsync();
        while (await rCh.ReadAsync())
        {
            double tot = rCh.GetDouble(1), ret = rCh.GetDouble(2);
            returnByChannel.Add(new
            {
                channelName = rCh.GetString(0),
                returnRate  = tot > 0 ? (ret / tot * 100).ToString("F1") : "0.0",
            });
        }

        return new { returnRate, cancelRate, deliverySuccess, returnByChannel };
    }

    // ── Real inventory from OLTP products + order_items ───────────────────────

    public async Task<object> GetInventoryRealAsync(DateOnly from, DateOnly to, Guid? companyId)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        int days = Math.Max(1, to.DayNumber - from.DayNumber + 1);

        var sql = """
            SELECT
                p.product_id,
                p.product_name,
                p.stock_quantity,
                COALESCE(SUM(oi.quantity) FILTER (WHERE o.status NOT IN ('CANCELLED')), 0)::float   AS qty_sold,
                COALESCE(COUNT(DISTINCT o.order_id) FILTER (WHERE o.status = 'RETURNED'), 0)::float AS returned_cnt,
                COALESCE(COUNT(DISTINCT o.order_id) FILTER (WHERE o.status NOT IN ('CANCELLED')), 0)::float AS order_cnt
            FROM public.products p
            LEFT JOIN public.order_items oi ON p.product_id = oi.product_id
            LEFT JOIN public.orders o       ON oi.order_id  = o.order_id
                AND o.order_date >= @from
                AND o.order_date <  @to
                AND (@companyId IS NULL OR o.company_id = @companyId::uuid)
            WHERE p.is_active = TRUE
              AND (@companyId IS NULL OR p.company_id = @companyId::uuid)
            GROUP BY p.product_id, p.product_name, p.stock_quantity
            ORDER BY qty_sold DESC
            LIMIT 30
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.AddWithValue("to",   to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        var rows = new List<(string Name, int Stock, double DailySales, double ReturnRate, long Forecast, double DiffPct, int DaysOfStock)>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            string name    = reader.GetString(1);
            int    stock   = reader.GetInt32(2);
            double qtySold = reader.GetDouble(3);
            double retCnt  = reader.GetDouble(4);
            double ordCnt  = reader.GetDouble(5);

            double dailySales = qtySold / days;
            long   forecast   = Math.Max(1, (long)(dailySales * 30));
            double diffPct    = Math.Round((stock - forecast) / (double)forecast * 100, 1);
            int    daysLeft   = dailySales > 0 ? (int)(stock / dailySales) : 999;
            double retRate    = ordCnt > 0 ? Math.Round(retCnt / ordCnt * 100, 1) : 0;

            rows.Add((name, stock, Math.Round(dailySales, 1), retRate, forecast, diffPct, daysLeft));
        }

        var inventory = rows.Select(r => new
        {
            product      = r.Name,
            stock        = r.Stock,
            forecast     = (int)r.Forecast,
            dailySales   = r.DailySales,
            returnRate   = r.ReturnRate,
            stockDiffPct = r.DiffPct.ToString("F1"),
            daysOfStock  = r.DaysOfStock,
        }).ToList<object>();

        var top5Over  = rows.Where(r => r.Stock > r.Forecast * 1.3)
                           .OrderByDescending(r => r.Stock - r.Forecast)
                           .Take(5)
                           .Select(r => new { product = r.Name, stock = r.Stock, forecast = (int)r.Forecast, stockDiffPct = r.DiffPct.ToString("F1"), daysOfStock = r.DaysOfStock })
                           .ToList<object>();

        var top5Low   = rows.Where(r => r.DaysOfStock < 14 && r.DailySales > 0)
                           .OrderBy(r => r.DaysOfStock)
                           .Take(5)
                           .Select(r => new { product = r.Name, stock = r.Stock, dailySales = r.DailySales, daysOfStock = r.DaysOfStock })
                           .ToList<object>();

        int avgDIO          = rows.Count > 0 ? (int)rows.Average(r => Math.Min(r.DaysOfStock, 365)) : 0;
        int overstockCount  = rows.Count(r => r.Stock > r.Forecast * 1.3);
        int stockoutCount   = rows.Count(r => r.DaysOfStock < 14 && r.DailySales > 0);
        string overstockRate = rows.Count > 0 ? ((double)overstockCount / rows.Count * 100).ToString("F1") : "0.0";
        string stockoutRate  = rows.Count > 0 ? ((double)stockoutCount  / rows.Count * 100).ToString("F1") : "0.0";

        return new
        {
            inventory,
            top5Overstock = top5Over,
            top5LowStock  = top5Low,
            inventoryKpi  = new { avgDIO, overstockRate, stockoutRate },
        };
    }

    // ── Monthly revenue by channel (DW fact_sales) ──────────────────────────

    public async Task<List<object>> GetMonthlyByChannelAsync(
        DateOnly from, DateOnly to, Guid? companyId)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        // Lấy tất cả kênh
        var channelSql = """
            SELECT DISTINCT dc.channel_name
            FROM dw.fact_sales fs
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            ORDER BY dc.channel_name
            """;
        await using var chCmd = new NpgsqlCommand(channelSql, conn);
        chCmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue));
        chCmd.Parameters.AddWithValue("to",   to.ToDateTime(TimeOnly.MinValue));
        chCmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
        var channels = new List<string>();
        await using (var r = await chCmd.ExecuteReaderAsync())
            while (await r.ReadAsync()) channels.Add(r.GetString(0));

        // Lấy doanh thu theo tháng × kênh
        var sql = """
            SELECT
                TO_CHAR(dd.full_date, 'YYYY-MM') AS month_key,
                dc.channel_name,
                SUM(fs.net_revenue)::bigint AS revenue
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dd.full_date BETWEEN @from AND @to
              AND (@companyId IS NULL OR fs.company_id = @companyId::uuid)
            GROUP BY month_key, dc.channel_name
            ORDER BY month_key, dc.channel_name
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.AddWithValue("to",   to.ToDateTime(TimeOnly.MinValue));
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });

        // Pivot: month_key → { channelName: revenue }
        var pivot = new Dictionary<string, Dictionary<string, long>>();
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync())
            {
                var mk  = reader.GetString(0);
                var ch  = reader.GetString(1);
                var rev = reader.GetInt64(2);
                if (!pivot.ContainsKey(mk)) pivot[mk] = new Dictionary<string, long>();
                pivot[mk][ch] = rev;
            }
        }

        // Tên tháng tiếng Việt viết tắt: "2024-01" → "T1/24"
        static string MonthLabel(string mk)
        {
            var parts = mk.Split('-');
            return $"T{int.Parse(parts[1])}/{parts[0][2..]}";
        }

        var result = new List<object>();
        foreach (var (mk, chMap) in pivot.OrderBy(x => x.Key))
        {
            var row = new Dictionary<string, object> { ["month"] = MonthLabel(mk) };
            long total = 0;
            foreach (var ch in channels)
            {
                var rev = chMap.GetValueOrDefault(ch, 0L);
                row[ch] = rev;
                total  += rev;
            }
            row["Total"] = total;
            result.Add(row);
        }
        return result;
    }

    // ── Order heatmap (OLTP orders — theo giờ x thứ trong tuần) ─────────────

    private static readonly string[] _dowVi = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

    public async Task<List<object>> GetOrderHeatmapAsync(
        DateOnly from, DateOnly to, string? channel, Guid? companyId)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        // Query OLTP orders theo giờ (làm tròn 2h) × thứ trong tuần (giờ VN)
        var sql = """
            SELECT
                EXTRACT(DOW  FROM order_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::int           AS dow,
                (EXTRACT(HOUR FROM order_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::int / 2) * 2 AS hour_slot,
                COUNT(*)::int AS order_count
            FROM public.orders o
            LEFT JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
            WHERE o.order_date >= @from
              AND o.order_date <  @to
              AND (@companyId IS NULL OR o.company_id = @companyId::uuid)
              AND (@channel   IS NULL OR sc.channel_name ILIKE '%' || @channel || '%')
            GROUP BY dow, hour_slot
            ORDER BY dow, hour_slot
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.AddWithValue("to",   to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });

        var result = new List<object>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            int dow      = reader.GetInt32(0);
            int hourSlot = reader.GetInt32(1);
            int count    = reader.GetInt32(2);
            result.Add(new
            {
                day    = _dowVi[dow],
                hour   = $"{hourSlot}:00",
                orders = count,
            });
        }
        return result;
    }

    // ── Order status funnel (OLTP orders) ────────────────────────────────────

    public async Task<List<object>> GetOrderFunnelAsync(
        DateOnly from, DateOnly to, string? channel, Guid? companyId)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT status, COUNT(*)::int AS cnt
            FROM public.orders o
            LEFT JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
            WHERE o.order_date >= @from
              AND o.order_date <  @to
              AND (@companyId IS NULL OR o.company_id = @companyId::uuid)
              AND (@channel   IS NULL OR sc.channel_name ILIKE '%' || @channel || '%')
            GROUP BY status
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("from", from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.AddWithValue("to",   to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
        cmd.Parameters.Add(new NpgsqlParameter("companyId", NpgsqlDbType.Text) { Value = (object?)companyId?.ToString() ?? DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("channel",   NpgsqlDbType.Text) { Value = (object?)channel   ?? DBNull.Value });

        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            counts[reader.GetString(0)] = reader.GetInt32(1);

        int total    = counts.Values.Sum();
        int confirmed = counts.GetValueOrDefault("CONFIRMED") + counts.GetValueOrDefault("SHIPPING")
                      + counts.GetValueOrDefault("DELIVERED") + counts.GetValueOrDefault("RETURNED");
        int shipping  = counts.GetValueOrDefault("SHIPPING")  + counts.GetValueOrDefault("DELIVERED")
                      + counts.GetValueOrDefault("RETURNED");
        int delivered = counts.GetValueOrDefault("DELIVERED");
        int returned  = counts.GetValueOrDefault("RETURNED");
        int cancelled = counts.GetValueOrDefault("CANCELLED");

        return new List<object>
        {
            new { stage = "Tổng đơn hàng",    value = total },
            new { stage = "Đã xác nhận",       value = confirmed },
            new { stage = "Đang giao",         value = shipping },
            new { stage = "Giao thành công",   value = delivered },
            new { stage = "Hoàn/Hủy",         value = returned + cancelled },
        };
    }

    // ── Top sản phẩm phân tách theo kênh bán (OLTP) ─────────────────────────
    public async Task<List<object>> GetTopProductsByChannelAsync(
        DateOnly from, DateOnly to, int limit, Guid? companyId)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("""
            WITH ranked AS (
                SELECT
                    sc.channel_name,
                    p.product_name,
                    COUNT(DISTINCT o.order_id)   AS order_count,
                    COALESCE(SUM(oi.subtotal), 0) AS revenue,
                    ROW_NUMBER() OVER (
                        PARTITION BY sc.channel_id
                        ORDER BY COALESCE(SUM(oi.subtotal), 0) DESC
                    ) AS rn
                FROM public.order_items  oi
                JOIN public.orders       o  ON o.order_id   = oi.order_id
                JOIN public.products     p  ON p.product_id = oi.product_id
                JOIN public.sales_channels sc ON sc.channel_id = o.channel_id
                WHERE (@cid IS NULL OR o.company_id = @cid::uuid)
                  AND o.order_date::date BETWEEN @from AND @to
                  AND o.status NOT IN ('CANCELLED', 'RETURNED')
                GROUP BY sc.channel_id, sc.channel_name, p.product_id, p.product_name
            )
            SELECT channel_name, product_name, order_count, revenue
            FROM   ranked
            WHERE  rn <= @limit
            ORDER  BY channel_name, revenue DESC
            """, conn);

        cmd.Parameters.AddWithValue("cid",   companyId.HasValue ? (object)companyId.Value.ToString() : DBNull.Value);
        cmd.Parameters.Add(new NpgsqlParameter("from", NpgsqlDbType.Date) { Value = from });
        cmd.Parameters.Add(new NpgsqlParameter("to",   NpgsqlDbType.Date) { Value = to   });
        cmd.Parameters.AddWithValue("limit", limit);

        var rows = new List<(string channel, string product, long orders, decimal revenue)>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            rows.Add((r.GetString(0), r.GetString(1), r.GetInt64(2), r.GetDecimal(3)));

        // Group theo kênh
        return rows
            .GroupBy(x => x.channel)
            .Select(g => (object)new
            {
                channelName = g.Key,
                products = g.Select(p => new
                {
                    productName = p.product,
                    orders      = p.orders,
                    revenue     = p.revenue,
                }).ToList(),
            })
            .ToList();
    }
}
