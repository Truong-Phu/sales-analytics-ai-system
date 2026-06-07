using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using NpgsqlTypes;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Profit Engine — Revenue, COGS, Gross Profit, Estimated Net Profit.
/// Tất cả net_profit là ước tính (chưa có settlement report từ sàn).
/// Routes: GET/PUT /api/finance/*
/// </summary>
[ApiController]
[Route("api/finance")]
[Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
public class FinanceController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    private string Cid => tenant.CompanyId!.Value.ToString();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GET /api/finance/profit/overview
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("profit/overview")]
    public async Task<IActionResult> ProfitOverview(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] string? channel)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var (dateFilter, dateParams) = BuildDateFilter(from, to);
            var (fromYM, toYM) = ComputeYearMonths(from, to);

            await using var cmd = new NpgsqlCommand($"""
                SELECT
                    COALESCE(SUM(fs.net_revenue),              0) AS revenue,
                    COALESCE(SUM(fs.cogs_amount),              0) AS cogs,
                    COALESCE(SUM(fs.gross_profit),             0) AS gross_profit,
                    COALESCE(SUM(fs.estimated_total_fee),      0) AS estimated_fees,
                    COALESCE(SUM(fs.estimated_net_profit),     0) AS estimated_net_profit,
                    CASE WHEN SUM(fs.net_revenue) > 0
                         THEN ROUND(SUM(fs.gross_profit) / SUM(fs.net_revenue) * 100, 2)
                         ELSE 0 END                              AS gross_margin,
                    CASE WHEN SUM(fs.net_revenue) > 0
                         THEN ROUND(SUM(fs.estimated_net_profit) / SUM(fs.net_revenue) * 100, 2)
                         ELSE 0 END                              AS estimated_net_margin,
                    COUNT(*) FILTER (WHERE fs.missing_cost = TRUE) AS missing_cost_orders,
                    BOOL_OR(fs.is_fee_estimated)                 AS is_estimated,
                    COALESCE((
                        SELECT SUM(asm.amount)
                        FROM public.ad_spend_monthly asm
                        JOIN public.sales_channels sc ON sc.channel_id = asm.channel_id
                        WHERE asm.company_id = @cid::uuid
                          AND asm.year * 12 + asm.month BETWEEN @fromYM AND @toYM
                          AND (
                              @channel IS NULL
                              OR sc.channel_name ILIKE '%' || @channel || '%'
                              OR sc.channel_type ILIKE '%' || @channel || '%'
                          )
                    ), 0)                                        AS advertising_cost
                FROM dw.fact_sales fs
                JOIN dw.dim_date  dd ON dd.date_key = fs.date_key
                JOIN dw.dim_channel dc ON dc.channel_key = fs.channel_key
                WHERE fs.company_id = @cid::uuid
                  AND (@channel IS NULL OR dc.channel_name ILIKE '%' || @channel || '%')
                {dateFilter}
                """, conn);
            cmd.Parameters.AddWithValue("cid",    Cid);
            cmd.Parameters.AddWithValue("fromYM", fromYM);
            cmd.Parameters.AddWithValue("toYM",   toYM);
            cmd.Parameters.Add(new NpgsqlParameter("channel", NpgsqlDbType.Text)
            {
                Value = (object?)NormalizeChannel(channel) ?? DBNull.Value
            });
            AddDateParams(cmd, dateParams, from, to);

            await using var r = await cmd.ExecuteReaderAsync();
            if (await r.ReadAsync())
            {
                var revenue            = r.GetDecimal(0);
                var estimatedNetProfit = r.GetDecimal(4);
                var advertisingCost    = r.GetDecimal(9);
                var (opProfit, opMargin, acos) =
                    ComputeOperatingMetrics(revenue, estimatedNetProfit, advertisingCost);
                return Ok(new
                {
                    revenue              = revenue,
                    cogs                 = r.GetDecimal(1),
                    grossProfit          = r.GetDecimal(2),
                    estimatedFees        = r.GetDecimal(3),
                    estimatedNetProfit   = estimatedNetProfit,
                    grossMargin          = r.GetDecimal(5),
                    estimatedNetMargin   = r.GetDecimal(6),
                    missingCostOrders    = r.GetInt64(7),
                    isEstimated          = !r.IsDBNull(8) && r.GetBoolean(8),
                    advertisingCost      = advertisingCost,
                    operatingProfit      = opProfit,
                    operatingMargin      = opMargin,
                    acos                 = acos,
                });
            }
            return Ok(new { revenue = 0, cogs = 0, grossProfit = 0, estimatedFees = 0,
                            estimatedNetProfit = 0, grossMargin = 0, estimatedNetMargin = 0,
                            missingCostOrders = 0, isEstimated = true,
                            advertisingCost = 0, operatingProfit = 0, operatingMargin = 0, acos = 0 });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { error = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GET /api/finance/profit/by-channel
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("profit/by-channel")]
    public async Task<IActionResult> ProfitByChannel(
        [FromQuery] string? from,
        [FromQuery] string? to)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var (dateFilter, dateParams) = BuildDateFilter(from, to);
            var (fromYM, toYM) = ComputeYearMonths(from, to);

            await using var cmd = new NpgsqlCommand($"""
                SELECT
                    dc.channel_name,
                    dc.platform,
                    COALESCE(SUM(fs.net_revenue),          0) AS revenue,
                    COALESCE(SUM(fs.cogs_amount),          0) AS cogs,
                    COALESCE(SUM(fs.gross_profit),         0) AS gross_profit,
                    COALESCE(SUM(fs.estimated_total_fee),  0) AS estimated_fees,
                    COALESCE(SUM(fs.estimated_net_profit), 0) AS estimated_net_profit,
                    CASE WHEN SUM(fs.net_revenue) > 0
                         THEN ROUND(SUM(fs.gross_profit) / SUM(fs.net_revenue) * 100, 2)
                         ELSE 0 END AS gross_margin,
                    CASE WHEN SUM(fs.net_revenue) > 0
                         THEN ROUND(SUM(fs.estimated_net_profit) / SUM(fs.net_revenue) * 100, 2)
                         ELSE 0 END AS estimated_net_margin,
                    COUNT(*) AS order_count,
                    COALESCE(ads.ad_spend, 0) AS advertising_cost
                FROM dw.fact_sales fs
                JOIN dw.dim_channel dc ON dc.channel_key = fs.channel_key
                JOIN dw.dim_date    dd ON dd.date_key    = fs.date_key
                LEFT JOIN (
                    SELECT LOWER(sc.channel_name) AS ch_lower, SUM(asm.amount) AS ad_spend
                    FROM public.ad_spend_monthly asm
                    JOIN public.sales_channels sc ON sc.channel_id = asm.channel_id
                    WHERE asm.company_id = @cid::uuid
                      AND asm.year * 12 + asm.month BETWEEN @fromYM AND @toYM
                    GROUP BY LOWER(sc.channel_name)
                ) ads ON ads.ch_lower LIKE '%' || LOWER(dc.channel_name) || '%'
                WHERE fs.company_id = @cid::uuid
                {dateFilter}
                GROUP BY dc.channel_name, dc.platform, ads.ad_spend
                ORDER BY revenue DESC
                """, conn);
            cmd.Parameters.AddWithValue("cid",    Cid);
            cmd.Parameters.AddWithValue("fromYM", fromYM);
            cmd.Parameters.AddWithValue("toYM",   toYM);
            AddDateParams(cmd, dateParams, from, to);

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var revenue            = r.GetDecimal(2);
                var estimatedNetProfit = r.GetDecimal(6);
                var advertisingCost    = r.GetDecimal(10);
                var (opProfit, opMargin, acos) =
                    ComputeOperatingMetrics(revenue, estimatedNetProfit, advertisingCost);
                list.Add(new
                {
                    channel              = r.GetString(0),
                    platform             = r.IsDBNull(1) ? "" : r.GetString(1),
                    revenue              = revenue,
                    cogs                 = r.GetDecimal(3),
                    grossProfit          = r.GetDecimal(4),
                    estimatedFees        = r.GetDecimal(5),
                    estimatedNetProfit   = estimatedNetProfit,
                    grossMargin          = r.GetDecimal(7),
                    estimatedNetMargin   = r.GetDecimal(8),
                    orderCount           = r.GetInt64(9),
                    advertisingCost      = advertisingCost,
                    operatingProfit      = opProfit,
                    operatingMargin      = opMargin,
                    acos                 = acos,
                });
            }
            return Ok(list);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { error = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. GET /api/finance/profit/by-product
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("profit/by-product")]
    public async Task<IActionResult> ProfitByProduct(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] int limit = 50)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var (dateFilter, dateParams) = BuildDateFilter(from, to);

            await using var cmd = new NpgsqlCommand($"""
                SELECT
                    dp.sku,
                    dp.product_name,
                    COALESCE(SUM(fs.net_revenue),          0) AS revenue,
                    COALESCE(SUM(fs.cogs_amount),          0) AS cogs,
                    COALESCE(SUM(fs.gross_profit),         0) AS gross_profit,
                    COALESCE(SUM(fs.estimated_total_fee),  0) AS estimated_fees,
                    COALESCE(SUM(fs.estimated_net_profit), 0) AS estimated_net_profit,
                    CASE WHEN SUM(fs.net_revenue) > 0
                         THEN ROUND(SUM(fs.gross_profit) / SUM(fs.net_revenue) * 100, 2)
                         ELSE 0 END AS gross_margin,
                    SUM(fs.item_quantity)                     AS total_qty,
                    BOOL_OR(fs.missing_cost)                  AS missing_cost
                FROM dw.fact_sales fs
                JOIN dw.dim_product dp ON dp.product_key = fs.product_key
                JOIN dw.dim_date    dd ON dd.date_key    = fs.date_key
                WHERE fs.company_id = @cid::uuid
                {dateFilter}
                GROUP BY dp.sku, dp.product_name
                ORDER BY revenue DESC
                LIMIT @limit
                """, conn);
            cmd.Parameters.AddWithValue("cid",   Cid);
            cmd.Parameters.AddWithValue("limit", limit);
            AddDateParams(cmd, dateParams, from, to);

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    sku                  = r.GetString(0),
                    productName          = r.GetString(1),
                    revenue              = r.GetDecimal(2),
                    cogs                 = r.GetDecimal(3),
                    grossProfit          = r.GetDecimal(4),
                    estimatedFees        = r.GetDecimal(5),
                    estimatedNetProfit   = r.GetDecimal(6),
                    grossMargin          = r.GetDecimal(7),
                    totalQty             = r.GetInt64(8),
                    missingCost          = !r.IsDBNull(9) && r.GetBoolean(9),
                });
            return Ok(list);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { error = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. GET /api/finance/profit/by-date
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("profit/by-date")]
    public async Task<IActionResult> ProfitByDate(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] string granularity = "month")
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var (dateFilter, dateParams) = BuildDateFilter(from, to);
            var (fromYM, toYM) = ComputeYearMonths(from, to);
            var truncExpr = granularity switch
            {
                "day"   => "TO_CHAR(dd.full_date, 'YYYY-MM-DD')",
                "week"  => "TO_CHAR(DATE_TRUNC('week', dd.full_date), 'YYYY-MM-DD')",
                _       => "TO_CHAR(dd.full_date, 'YYYY-MM')",
            };

            await using var cmd = new NpgsqlCommand($"""
                SELECT
                    {truncExpr}                                  AS period,
                    COALESCE(SUM(fs.net_revenue),          0)   AS revenue,
                    COALESCE(SUM(fs.cogs_amount),          0)   AS cogs,
                    COALESCE(SUM(fs.gross_profit),         0)   AS gross_profit,
                    COALESCE(SUM(fs.estimated_total_fee),  0)   AS estimated_fees,
                    COALESCE(SUM(fs.estimated_net_profit), 0)   AS estimated_net_profit,
                    COUNT(*)                                     AS order_count
                FROM dw.fact_sales fs
                JOIN dw.dim_date   dd ON dd.date_key = fs.date_key
                WHERE fs.company_id = @cid::uuid
                {dateFilter}
                GROUP BY 1
                ORDER BY 1
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);
            AddDateParams(cmd, dateParams, from, to);

            // Ad spend theo tháng — dùng cho granularity=month; day/week sẽ phân bổ tương đối
            await using var adCmd = new NpgsqlCommand("""
                SELECT year, month, SUM(amount) AS ad_spend
                FROM public.ad_spend_monthly
                WHERE company_id = @cid::uuid
                  AND year * 12 + month BETWEEN @fromYM AND @toYM
                GROUP BY year, month
                """, conn);
            adCmd.Parameters.AddWithValue("cid",    Cid);
            adCmd.Parameters.AddWithValue("fromYM", fromYM);
            adCmd.Parameters.AddWithValue("toYM",   toYM);
            var adByMonth = new Dictionary<string, decimal>();
            // Đóng reader adR trước khi mở reader chính — Npgsql không cho 2 readers cùng lúc trên 1 connection
            {
                await using var adR = await adCmd.ExecuteReaderAsync();
                while (await adR.ReadAsync())
                    adByMonth[$"{adR.GetInt32(0):D4}-{adR.GetInt32(1):D2}"] = adR.GetDecimal(2);
            } // adR disposed here

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var period             = r.GetString(0);
                var revenue            = r.GetDecimal(1);
                var estimatedNetProfit = r.GetDecimal(5);
                // Lấy ad_spend cho tháng tương ứng (period dạng YYYY-MM hoặc YYYY-MM-DD)
                var monthKey = period.Length >= 7 ? period[..7] : period;
                var advertisingCost = adByMonth.GetValueOrDefault(monthKey, 0m);
                var (opProfit, opMargin, acos) =
                    ComputeOperatingMetrics(revenue, estimatedNetProfit, advertisingCost);
                list.Add(new
                {
                    period             = period,
                    revenue            = revenue,
                    cogs               = r.GetDecimal(2),
                    grossProfit        = r.GetDecimal(3),
                    estimatedFees      = r.GetDecimal(4),
                    estimatedNetProfit = estimatedNetProfit,
                    orderCount         = r.GetInt64(6),
                    advertisingCost    = advertisingCost,
                    operatingProfit    = opProfit,
                    operatingMargin    = opMargin,
                    acos               = acos,
                });
            }
            return Ok(list);
        }
        catch (Exception)
        {
            // DW chưa có bảng hoặc lỗi query → trả empty list, page vẫn hoạt động
            return Ok(new List<object>());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. GET /api/finance/profit/orders  (danh sách đơn với profit)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("profit/orders")]
    public async Task<IActionResult> ProfitOrders(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize is < 1 or > 200) pageSize = 50;
        int offset = (page - 1) * pageSize;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var (dateFilter, dateParams) = BuildDateFilter(from, to);

            await using var cmd = new NpgsqlCommand($"""
                SELECT
                    fs.external_order_id,
                    dc.channel_name,
                    dd.full_date::text,
                    COALESCE(fs.net_revenue,          0) AS revenue,
                    COALESCE(fs.cogs_amount,          0) AS cogs,
                    COALESCE(fs.gross_profit,         0) AS gross_profit,
                    COALESCE(fs.estimated_total_fee,  0) AS estimated_fees,
                    COALESCE(fs.estimated_net_profit, 0) AS estimated_net_profit,
                    fs.missing_cost,
                    COUNT(*) OVER()                       AS total_count
                FROM dw.fact_sales fs
                JOIN dw.dim_channel dc ON dc.channel_key = fs.channel_key
                JOIN dw.dim_date    dd ON dd.date_key    = fs.date_key
                WHERE fs.company_id = @cid::uuid
                {dateFilter}
                ORDER BY dd.full_date DESC, fs.sales_key DESC
                LIMIT @limit OFFSET @offset
                """, conn);
            cmd.Parameters.AddWithValue("cid",    Cid);
            cmd.Parameters.AddWithValue("limit",  pageSize);
            cmd.Parameters.AddWithValue("offset", offset);
            AddDateParams(cmd, dateParams, from, to);

            var items = new List<object>();
            long totalCount = 0;
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                totalCount = r.GetInt64(9);
                items.Add(new
                {
                    orderId            = r.GetString(0),
                    channel            = r.GetString(1),
                    date               = r.GetString(2),
                    revenue            = r.GetDecimal(3),
                    cogs               = r.GetDecimal(4),
                    grossProfit        = r.GetDecimal(5),
                    estimatedFees      = r.GetDecimal(6),
                    estimatedNetProfit = r.GetDecimal(7),
                    missingCost        = !r.IsDBNull(8) && r.GetBoolean(8),
                });
            }
            return Ok(new { items, totalCount, page, pageSize });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { error = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. GET /api/finance/fee-configs
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("fee-configs")]
    public async Task<IActionResult> GetFeeConfigs()
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT fee_config_id, channel_name, platform_fee_rate,
                       payment_fee_rate, fixed_fee_per_order,
                       packaging_cost_per_order, shipping_cost_mode,
                       is_estimated, note, updated_at
                FROM public.channel_fee_configs
                WHERE company_id = @cid::uuid
                ORDER BY channel_name
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);

            var list = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                list.Add(new
                {
                    feeConfigId            = r.GetInt64(0),
                    channelName            = r.GetString(1),
                    platformFeeRate        = r.GetDecimal(2),
                    paymentFeeRate         = r.GetDecimal(3),
                    fixedFeePerOrder       = r.GetDecimal(4),
                    packagingCostPerOrder  = r.GetDecimal(5),
                    shippingCostMode       = r.GetString(6),
                    isEstimated            = r.GetBoolean(7),
                    note                   = r.IsDBNull(8) ? null : r.GetString(8),
                    updatedAt              = r.IsDBNull(9) ? null : (DateTime?)r.GetDateTime(9),
                });
            return Ok(list);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { error = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. PUT /api/finance/fee-configs/{id}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPut("fee-configs/{id:long}")]
    public async Task<IActionResult> UpdateFeeConfig(long id, [FromBody] FeeConfigUpdateDto dto)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                UPDATE public.channel_fee_configs SET
                    platform_fee_rate        = @pfRate,
                    payment_fee_rate         = @payRate,
                    fixed_fee_per_order      = @fixed,
                    packaging_cost_per_order = @pkg,
                    shipping_cost_mode       = @shipMode,
                    note                     = @note,
                    updated_at               = NOW()
                WHERE fee_config_id = @id AND company_id = @cid::uuid
                RETURNING fee_config_id
                """, conn);
            cmd.Parameters.AddWithValue("pfRate",   dto.PlatformFeeRate);
            cmd.Parameters.AddWithValue("payRate",  dto.PaymentFeeRate);
            cmd.Parameters.AddWithValue("fixed",    dto.FixedFeePerOrder);
            cmd.Parameters.AddWithValue("pkg",      dto.PackagingCostPerOrder);
            cmd.Parameters.AddWithValue("shipMode", dto.ShippingCostMode ?? "USE_ORDER_SHIPPING_FEE");
            cmd.Parameters.AddWithValue("note",     (object?)dto.Note ?? DBNull.Value);
            cmd.Parameters.AddWithValue("id",       id);
            cmd.Parameters.AddWithValue("cid",      Cid);

            var result = await cmd.ExecuteScalarAsync();
            if (result is null or DBNull)
                return NotFound(new { error = "Fee config không tồn tại hoặc không thuộc công ty này" });

            return Ok(new { feeConfigId = Convert.ToInt64(result), updated = true });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { error = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    private static (string filter, bool hasParams) BuildDateFilter(string? from, string? to)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(from)) parts.Add("dd.full_date >= @from::date");
        if (!string.IsNullOrWhiteSpace(to))   parts.Add("dd.full_date <= @to::date");
        string filter = parts.Count > 0 ? "AND " + string.Join(" AND ", parts) : "";
        return (filter, parts.Count > 0);
    }

    private static void AddDateParams(NpgsqlCommand cmd, bool hasParams, string? from, string? to)
    {
        if (!hasParams) return;
        if (!string.IsNullOrWhiteSpace(from)) cmd.Parameters.AddWithValue("from", from);
        if (!string.IsNullOrWhiteSpace(to))   cmd.Parameters.AddWithValue("to",   to);
    }

    private static string? NormalizeChannel(string? channel)
    {
        return string.IsNullOrWhiteSpace(channel) || channel.Equals("all", StringComparison.OrdinalIgnoreCase)
            ? null
            : channel.Trim();
    }

    // Chuyển từ chuỗi ngày sang year*12+month để so sánh với ad_spend_monthly
    private static (int fromYM, int toYM) ComputeYearMonths(string? from, string? to)
    {
        var now = DateTime.UtcNow;
        var f = string.IsNullOrWhiteSpace(from) ? now.AddMonths(-12) : DateTime.Parse(from);
        var t = string.IsNullOrWhiteSpace(to)   ? now               : DateTime.Parse(to);
        return (f.Year * 12 + f.Month, t.Year * 12 + t.Month);
    }

    // Tính operating profit và ACOS từ estimated_net_profit và advertising_cost
    private static (decimal operatingProfit, decimal operatingMargin, decimal acos)
        ComputeOperatingMetrics(decimal revenue, decimal estimatedNetProfit, decimal advertisingCost)
    {
        var op   = estimatedNetProfit - advertisingCost;
        var opM  = revenue > 0 ? Math.Round(op / revenue * 100, 2) : 0;
        var acos = revenue > 0 ? Math.Round(advertisingCost / revenue * 100, 2) : 0;
        return (op, opM, acos);
    }
}

public class FeeConfigUpdateDto
{
    public decimal PlatformFeeRate        { get; set; }
    public decimal PaymentFeeRate         { get; set; }
    public decimal FixedFeePerOrder       { get; set; }
    public decimal PackagingCostPerOrder  { get; set; }
    public string? ShippingCostMode       { get; set; }
    public string? Note                   { get; set; }
}
