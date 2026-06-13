using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>Proxy đến AI Service FastAPI – Frontend chỉ gọi Backend, không gọi AI trực tiếp</summary>
[ApiController]
[Route("api/ai")]
[Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
[RequirePlan("pro")]
public class AiController(AiProxyService ai, ITenantContext tenant, IConfiguration cfg) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    /// <summary>Dự báo doanh thu N ngày tiếp theo</summary>
    [HttpGet("forecast")]
    public async Task<IActionResult> Forecast(
        [FromQuery] int horizon = 30,
        [FromQuery] string? channel = null)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var result = await ai.GetForecastAsync(horizon, channel, companyId);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phát hiện bất thường doanh thu</summary>
    [HttpGet("anomaly")]
    public async Task<IActionResult> Anomaly(
        [FromQuery] int days = 90,
        [FromQuery] string? channel = null)
    {
        days = Math.Clamp(days, 14, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var result = await ai.GetAnomalyAsync(days, channel, companyId);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phân tích xu hướng</summary>
    [HttpGet("trend")]
    public async Task<IActionResult> Trend(
        [FromQuery] int days = 30,
        [FromQuery] string? channel = null)
    {
        days = Math.Clamp(days, 7, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var result = await ai.GetTrendAsync(days, channel, companyId);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Gợi ý hành động tự động từ AI (rule-based + anomaly)</summary>
    [HttpGet("recommendation")]
    public async Task<IActionResult> Recommendation()
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var result = await ai.GetRecommendationsAsync(companyId);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Metrics đánh giá độ chính xác model Prophet (MAE, RMSE, MAPE)</summary>
    [HttpGet("forecast/metrics")]
    public async Task<IActionResult> ForecastMetrics()
    {
        var result = await ai.GetForecastMetricsAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>So sánh Prophet vs Holt-Winters vs LightGBM (từ comparison_metrics.json)</summary>
    [HttpGet("forecast/model-comparison")]
    public async Task<IActionResult> ForecastModelComparison()
    {
        var result = await ai.GetModelComparisonAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Kích hoạt retrain model Prophet thủ công (chạy nền, Owner/DataIT)</summary>
    [HttpPost("forecast/retrain")]
    [Authorize(Roles = "Owner,DataIT,SuperAdmin")]
    public async Task<IActionResult> RetrainForecast()
    {
        var result = await ai.TriggerRetrainAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng. Không thể retrain." });
        return Ok(new { message = "Đã kích hoạt retrain model Prophet. Kiểm tra trạng thái tại /api/ai/forecast/retrain-status.", status = result });
    }

    /// <summary>Trạng thái retrain model Prophet</summary>
    [HttpGet("forecast/retrain-status")]
    [Authorize(Roles = "Owner,DataIT,SuperAdmin")]
    public async Task<IActionResult> RetrainStatus()
    {
        var result = await ai.ProxyGetAsync("retrain/status");
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Tổng hợp phản hồi Facebook (sentiment, top issues/praises, recent comments)</summary>
    [HttpGet("feedback-summary")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> FeedbackSummary()
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var result    = await ai.GetFeedbackSummaryAsync(companyId);
        if (result is null) return Ok(new { total_comments = 0, positive = 0, negative = 0, neutral = 0,
            top_issues = Array.Empty<string>(), top_praises = Array.Empty<string>(), recent_comments = Array.Empty<object>() });
        return Ok(result);
    }

    /// <summary>Phân khúc khách hàng RFM (kết quả từ notebook 04)</summary>
    [HttpGet("customers/segments")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> RfmSegments()
    {
        var result = await ai.GetRfmSegmentsAsync();
        if (result is null) return StatusCode(503, new { message = "RFM data chưa có. Hãy chạy notebook 04_RFM_Analysis.ipynb." });
        return Ok(result);
    }

    /// <summary>AI Insights tổng hợp từ forecast + anomaly + RFM (cache 1h)</summary>
    [HttpGet("insights")]
    public async Task<IActionResult> Insights()
    {
        var result = await ai.GetInsightsAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Trạng thái cache AI</summary>
    [HttpGet("cache/status")]
    public async Task<IActionResult> CacheStatus()
    {
        var result = await ai.GetCacheStatusAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Xóa cache AI sau khi ETL xong (gọi tự động từ DataSyncController)</summary>
    [HttpPost("cache/invalidate")]
    [Authorize(Roles = "Owner,DataIT,SuperAdmin")]
    public async Task<IActionResult> InvalidateCache()
    {
        var result = await ai.InvalidateCacheAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>
    /// Hỏi AI bằng câu hỏi tự nhiên – nhận gợi ý dựa trên dữ liệu thực tế.
    /// Pipeline: câu hỏi → QueryEngine → AI (Claude/OpenAI/fallback) → gợi ý.
    /// </summary>
    /// <remarks>
    /// Request body: { "question": "string", "language": "vi" }
    /// Response: { question, recommendation, data_sources, confidence, note }
    /// </remarks>
    [HttpPost("recommend")]
    public async Task<IActionResult> AskRecommendation(
        [FromBody] AskRecommendationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Question))
            return BadRequest(new { message = "question không được để trống" });

        var result = await ai.PostRecommendationAsync(
            question: request.Question,
            language: request.Language ?? "vi",
            context:  request.Context,
            sources:  request.Sources
        );

        if (result is null)
            return StatusCode(503, new
            {
                message = "AI Service tạm thời không khả dụng. Vui lòng thử lại sau."
            });

        return Ok(result);
    }

    // ── Chức năng sáng tạo mới ────────────────────────────────────────────────

    /// <summary>Dự báo nguy cơ churn khách hàng (RandomForest + RFM)</summary>
    [HttpGet("churn")]
    public async Task<IActionResult> ChurnPrediction(
        [FromQuery] int topN = 50,
        [FromQuery] bool retrain = false)
    {
        topN = Math.Clamp(topN, 1, 500);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var result = await ai.ProxyGetAsync($"churn?top_n={topN}&retrain={retrain.ToString().ToLower()}"
            + (companyId.HasValue ? $"&company_id={companyId}" : ""));
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phân tích sản phẩm hay mua chung – Market Basket Analysis (Apriori)</summary>
    [HttpGet("basket")]
    public async Task<IActionResult> BasketAnalysis(
        [FromQuery] int days = 180,
        [FromQuery(Name = "min_support")] double? minSupport = null,
        [FromQuery(Name = "min_confidence")] double? minConfidence = null,
        [FromQuery(Name = "min_lift")] double? minLift = null,
        [FromQuery(Name = "top_n")] int? topN = null,
        [FromQuery(Name = "minSupport")] double? minSupportCamel = null,
        [FromQuery(Name = "minConfidence")] double? minConfidenceCamel = null,
        [FromQuery(Name = "minLift")] double? minLiftCamel = null,
        [FromQuery(Name = "topN")] int? topNCamel = null)
    {
        days = Math.Clamp(days, 30, 365);
        var effectiveMinSupport = minSupport ?? minSupportCamel ?? 0.001;
        var effectiveMinConfidence = minConfidence ?? minConfidenceCamel ?? 0.1;
        var effectiveMinLift = minLift ?? minLiftCamel ?? 1.0;
        var effectiveTopN = Math.Clamp(topN ?? topNCamel ?? 20, 1, 100);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        static string F(double v) => v.ToString("G", CultureInfo.InvariantCulture);
        var qs = $"basket?days={days}&min_support={F(effectiveMinSupport)}&min_confidence={F(effectiveMinConfidence)}&min_lift={F(effectiveMinLift)}&top_n={effectiveTopN}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Thông minh dự báo tồn kho và gợi ý đặt thêm hàng</summary>
    [HttpGet("inventory")]
    public async Task<IActionResult> InventoryIntelligence(
        [FromQuery] int days = 30,
        [FromQuery] string? status = null)
    {
        days = Math.Clamp(days, 7, 90);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"inventory?days={days}"
            + (status is not null ? $"&status={status}" : "")
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Mô phỏng kịch bản What-If (thay đổi giá, discount, kênh mới...)</summary>
    [HttpPost("whatif")]
    public async Task<IActionResult> WhatIfSimulator([FromBody] object body)
    {
        var result = await ai.ProxyPostAsync("whatif", body);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phân bổ doanh thu theo kênh bán hàng và ROI quảng cáo</summary>
    [HttpGet("attribution")]
    public async Task<IActionResult> ChannelAttribution(
        [FromQuery] int days = 30,
        [FromQuery] string model = "last_touch")
    {
        days = Math.Clamp(days, 7, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"attribution?days={days}&model={model}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Lên lịch chiến dịch marketing thông minh (seasonal analysis)</summary>
    [HttpGet("campaign")]
    public async Task<IActionResult> CampaignPlanner([FromQuery] int daysAhead = 60)
    {
        daysAhead = Math.Clamp(daysAhead, 7, 180);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"campaign?days_ahead={daysAhead}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phân bổ khách hàng theo địa lý (dữ liệu cho Geo Heatmap)</summary>
    [HttpGet("geo")]
    public async Task<IActionResult> GeoDistribution(
        [FromQuery] int days = 30,
        [FromQuery] string metric = "customers")
    {
        days = Math.Clamp(days, 7, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"geo?days={days}&metric={metric}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Bảng xếp hạng hiệu suất bán hàng (sản phẩm/khách hàng/kênh/nhân viên)</summary>
    [HttpGet("leaderboard")]
    public async Task<IActionResult> Leaderboard(
        [FromQuery] string category = "product",
        [FromQuery] int days = 30,
        [FromQuery] int topN = 10,
        [FromQuery(Name = "start_date")] string? startDate = null,
        [FromQuery(Name = "end_date")]   string? endDate = null)
    {
        days = Math.Clamp(days, 1, 3650);
        topN = Math.Clamp(topN, 3, 50);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        if (category is "staff" or "staff_warehouse" or "staff_marketing")
            return await BuildStaffLeaderboardAsync(category, days, topN, startDate, endDate, companyId);

        var qs = $"leaderboard?category={category}&days={days}&top_n={topN}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "")
            + (!string.IsNullOrEmpty(startDate) ? $"&start_date={startDate}" : "")
            + (!string.IsNullOrEmpty(endDate) ? $"&end_date={endDate}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    private async Task<IActionResult> BuildStaffLeaderboardAsync(
        string category,
        int days,
        int topN,
        string? startDate,
        string? endDate,
        Guid? companyId)
    {
        if (!companyId.HasValue)
            return BadRequest(new { message = "Không xác định được công ty." });

        var today = DateTime.UtcNow.Date;
        var start = DateOnly.TryParse(startDate, out var sd)
            ? DateTime.SpecifyKind(sd.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc)
            : today.AddDays(-days + 1);
        var endExclusive = DateOnly.TryParse(endDate, out var ed)
            ? DateTime.SpecifyKind(ed.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc)
            : today.AddDays(1);
        if (endExclusive <= start) endExclusive = start.AddDays(1);

        var span = endExclusive - start;
        var prevStart = start - span;
        var prevEnd = start;
        var lastIncludedDate = endExclusive.AddDays(-1);
        var kpiMonthMatch = start.Day == 1
            && lastIncludedDate.Year == start.Year
            && lastIncludedDate.Month == start.Month;

        var roleFilter = category switch
        {
            "staff_warehouse" => "u.role = 'Staff_Warehouse'",
            "staff_marketing" => "u.role = 'Staff_Marketing'",
            _ => "u.role IN ('Staff','Staff_Sales')"
        };

        var metricExpr = category switch
        {
            "staff_warehouse" => "COALESCE(curr.warehouse_value, 0)",
            "staff_marketing" => "COALESCE(curr.marketing_spend, 0)",
            _ => "COALESCE(curr.sales_revenue, 0)"
        };
        var prevMetricExpr = category switch
        {
            "staff_warehouse" => "COALESCE(prev.warehouse_value, 0)",
            "staff_marketing" => "COALESCE(prev.marketing_spend, 0)",
            _ => "COALESCE(prev.sales_revenue, 0)"
        };
        var activityExpr = category switch
        {
            "staff_warehouse" => "COALESCE(curr.warehouse_tasks, 0)",
            "staff_marketing" => "COALESCE(curr.marketing_activities, 0)",
            _ => "COALESCE(curr.sales_orders, 0)"
        };
        var actualRevenueExpr = category switch
        {
            "staff_warehouse" => "COALESCE(curr.warehouse_value, 0)",
            "staff_marketing" => "COALESCE(curr.marketing_spend, 0)",
            _ => "COALESCE(curr.sales_revenue, 0)"
        };
        var actualOrdersExpr = category switch
        {
            "staff_warehouse" => "COALESCE(curr.warehouse_tasks, 0)",
            "staff_marketing" => "COALESCE(curr.marketing_activities, 0)",
            _ => "COALESCE(curr.sales_orders, 0)"
        };
        var actualTertiaryExpr = category switch
        {
            "staff_warehouse" => "COALESCE(curr.warehouse_documents, 0)",
            "staff_marketing" => "COALESCE(curr.marketing_channels, 0)",
            _ => "COALESCE(curr.new_customers, 0)"
        };

        var sql = $$"""
            WITH sales_curr AS (
                SELECT o.created_by_user_id AS user_id,
                       COUNT(DISTINCT o.order_id)::bigint AS sales_orders,
                       COALESCE(SUM(o.total_amount), 0) AS sales_revenue,
                       COUNT(DISTINCT CASE
                           WHEN COALESCE(c.first_order_at, c.created_at) >= @start
                            AND COALESCE(c.first_order_at, c.created_at) < @end THEN c.customer_id
                       END)::bigint AS new_customers
                FROM public.orders o
                LEFT JOIN public.customers c ON c.customer_id = o.customer_id AND c.company_id = @cid::uuid
                WHERE o.company_id = @cid::uuid
                  AND o.created_by_user_id IS NOT NULL
                  AND o.order_date >= @start AND o.order_date < @end
                GROUP BY o.created_by_user_id
            ),
            sales_prev AS (
                SELECT o.created_by_user_id AS user_id,
                       COALESCE(SUM(o.total_amount), 0) AS sales_revenue
                FROM public.orders o
                WHERE o.company_id = @cid::uuid
                  AND o.created_by_user_id IS NOT NULL
                  AND o.order_date >= @prevStart AND o.order_date < @prevEnd
                GROUP BY o.created_by_user_id
            ),
            warehouse_curr AS (
                SELECT user_id,
                       COUNT(*)::bigint AS warehouse_tasks,
                       COALESCE(SUM(quantity_amount), 0) AS warehouse_value,
                       COALESCE(SUM(document_count), 0)::bigint AS warehouse_documents
                FROM (
                    SELECT created_by AS user_id, created_at, ABS(quantity_change)::numeric AS quantity_amount, 0::bigint AS document_count
                    FROM public.inventory_transactions
                    WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    UNION ALL
                    SELECT created_by AS user_id, created_at, total_quantity::numeric AS quantity_amount, 1::bigint AS document_count
                    FROM public.goods_receipts
                    WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    UNION ALL
                    SELECT po.created_by AS user_id, po.created_at, COALESCE(SUM(poi.quantity), 0)::numeric AS quantity_amount, 1::bigint AS document_count
                    FROM public.purchase_orders po
                    LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.purchase_order_id
                    WHERE po.company_id = @cid::uuid AND po.created_by IS NOT NULL
                    GROUP BY po.purchase_order_id, po.created_by, po.created_at
                ) x
                WHERE created_at >= @start AND created_at < @end
                GROUP BY user_id
            ),
            warehouse_prev AS (
                SELECT user_id,
                       COALESCE(SUM(quantity_amount), 0) AS warehouse_value
                FROM (
                    SELECT created_by AS user_id, created_at, ABS(quantity_change)::numeric AS quantity_amount
                    FROM public.inventory_transactions
                    WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    UNION ALL
                    SELECT created_by AS user_id, created_at, total_quantity::numeric AS quantity_amount
                    FROM public.goods_receipts
                    WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    UNION ALL
                    SELECT po.created_by AS user_id, po.created_at, COALESCE(SUM(poi.quantity), 0)::numeric AS quantity_amount
                    FROM public.purchase_orders po
                    LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.purchase_order_id
                    WHERE po.company_id = @cid::uuid AND po.created_by IS NOT NULL
                    GROUP BY po.purchase_order_id, po.created_by, po.created_at
                ) x
                WHERE created_at >= @prevStart AND created_at < @prevEnd
                GROUP BY user_id
            ),
            marketing_curr AS (
                SELECT created_by AS user_id,
                       COUNT(*)::bigint AS marketing_activities,
                       COUNT(DISTINCT channel_id)::bigint AS marketing_channels,
                       COALESCE(SUM(amount), 0) AS marketing_spend
                FROM public.ad_spend_monthly
                WHERE company_id = @cid::uuid
                  AND created_by IS NOT NULL
                  AND (year * 12 + month) BETWEEN
                      (EXTRACT(YEAR FROM @start)::int * 12 + EXTRACT(MONTH FROM @start)::int)
                      AND (EXTRACT(YEAR FROM (@end - INTERVAL '1 day'))::int * 12 + EXTRACT(MONTH FROM (@end - INTERVAL '1 day'))::int)
                GROUP BY created_by
            ),
            marketing_prev AS (
                SELECT created_by AS user_id,
                       COALESCE(SUM(amount), 0) AS marketing_spend
                FROM public.ad_spend_monthly
                WHERE company_id = @cid::uuid
                  AND created_by IS NOT NULL
                  AND (year * 12 + month) BETWEEN
                      (EXTRACT(YEAR FROM @prevStart)::int * 12 + EXTRACT(MONTH FROM @prevStart)::int)
                      AND (EXTRACT(YEAR FROM (@prevEnd - INTERVAL '1 day'))::int * 12 + EXTRACT(MONTH FROM (@prevEnd - INTERVAL '1 day'))::int)
                GROUP BY created_by
            ),
            curr AS (
                SELECT u.user_id,
                       sc.sales_orders, sc.sales_revenue, sc.new_customers,
                       wc.warehouse_tasks, wc.warehouse_value, wc.warehouse_documents,
                       mc.marketing_activities, mc.marketing_channels, mc.marketing_spend
                FROM public.users u
                LEFT JOIN sales_curr sc ON sc.user_id = u.user_id
                LEFT JOIN warehouse_curr wc ON wc.user_id = u.user_id
                LEFT JOIN marketing_curr mc ON mc.user_id = u.user_id
                WHERE u.company_id = @cid::uuid
            ),
            prev AS (
                SELECT u.user_id,
                       sp.sales_revenue,
                       wp.warehouse_value,
                       mp.marketing_spend
                FROM public.users u
                LEFT JOIN sales_prev sp ON sp.user_id = u.user_id
                LEFT JOIN warehouse_prev wp ON wp.user_id = u.user_id
                LEFT JOIN marketing_prev mp ON mp.user_id = u.user_id
                WHERE u.company_id = @cid::uuid
            )
            SELECT u.user_id, u.full_name, u.role,
                   {{metricExpr}} AS metric_value,
                   {{activityExpr}} AS activity_count,
                   {{prevMetricExpr}} AS prev_metric_value,
                   {{actualRevenueExpr}} AS actual_revenue,
                   {{actualOrdersExpr}} AS actual_orders,
                   {{actualTertiaryExpr}} AS actual_new_customers,
                   t.revenue_target,
                   t.order_count_target,
                   t.new_customer_target
            FROM public.users u
            LEFT JOIN curr ON curr.user_id = u.user_id
            LEFT JOIN prev ON prev.user_id = u.user_id
            LEFT JOIN public.staff_kpi_targets t
                ON t.user_id = u.user_id
               AND t.period_type = 'MONTHLY'
               AND t.period_start = DATE_TRUNC('month', @start)
            WHERE u.company_id = @cid::uuid
              AND u.is_active = TRUE
              AND {{roleFilter}}
            ORDER BY metric_value DESC, activity_count DESC, u.full_name
            LIMIT @topN
            """;

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("cid", companyId.Value.ToString());
        cmd.Parameters.AddWithValue("start", start);
        cmd.Parameters.AddWithValue("end", endExclusive);
        cmd.Parameters.AddWithValue("prevStart", prevStart);
        cmd.Parameters.AddWithValue("prevEnd", prevEnd);
        cmd.Parameters.AddWithValue("topN", topN);

        var entries = new List<object>();
        decimal totalValue = 0;
        await using var r = await cmd.ExecuteReaderAsync();
        var rank = 1;
        while (await r.ReadAsync())
        {
            var value = r.GetDecimal(3);
            var activity = r.GetInt64(4);
            var prevValue = r.GetDecimal(5);
            var changePct = prevValue > 0 ? Math.Round((double)((value - prevValue) / prevValue * 100), 1) : (value > 0 ? 100.0 : 0.0);
            var trend = changePct > 0 ? "UP" : changePct < 0 ? "DOWN" : "STABLE";
            var actualRevenue = r.GetDecimal(6);
            var actualOrders = r.GetInt64(7);
            var actualNewCustomers = r.GetInt64(8);
            var revTarget = r.IsDBNull(9) ? (decimal?)null : r.GetDecimal(9);
            var ordTarget = r.IsDBNull(10) ? (int?)null : r.GetInt32(10);
            var custTarget = r.IsDBNull(11) ? (int?)null : r.GetInt32(11);
            double? revPct = revTarget is > 0 ? Math.Round((double)(actualRevenue / revTarget.Value * 100), 1) : null;
            double? ordPct = ordTarget is > 0 ? Math.Round(actualOrders / (double)ordTarget.Value * 100, 1) : null;
            double? custPct = custTarget is > 0 ? Math.Round(actualNewCustomers / (double)custTarget.Value * 100, 1) : null;
            var validPcts = new[] { revPct, ordPct, custPct }.Where(x => x.HasValue).Select(x => x!.Value).ToList();
            double? overallPct = validPcts.Count > 0 ? Math.Round(validPcts.Average(), 1) : null;
            var hasAnyTarget = revTarget.HasValue || ordTarget.HasValue || custTarget.HasValue;

            totalValue += value;
            entries.Add(new
            {
                rank,
                name = r.GetString(1),
                role = r.GetString(2),
                value,
                value_label = category == "staff_warehouse" ? value.ToString("N0", CultureInfo.InvariantCulture) : null,
                orders = activity,
                trend,
                change_pct = changePct,
                actualRevenue,
                actualOrders,
                actualNewCustomers,
                revTarget,
                ordTarget,
                custTarget,
                revenuePct = revPct,
                orderPct = ordPct,
                customerPct = custPct,
                overallPct,
                hasAnyTarget,
                isKpiAchieved = hasAnyTarget && validPcts.Count > 0 && validPcts.All(p => p >= 100.0),
            });
            rank++;
        }

        return Ok(new
        {
            category,
            period_label = $"{start:dd/MM/yyyy} – {endExclusive.AddDays(-1):dd/MM/yyyy}",
            total_revenue = totalValue,
            kpi_period_match = kpiMonthMatch,
            kpi_period = start.ToString("yyyy-MM"),
            entries
        });
    }

    /// <summary>Sinh nhận xét doanh thu tự động bằng ngôn ngữ tự nhiên (Smart Narrative)</summary>
    [HttpGet("narrative")]
    public async Task<IActionResult> SmartNarrative(
        [FromQuery] int days = 30,
        [FromQuery] string language = "vi")
    {
        days = Math.Clamp(days, 7, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"narrative?days={days}&language={language}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Hiệu suất nhà cung cấp – tỷ lệ đúng hạn, thời gian giao hàng</summary>
    [HttpGet("supplier")]
    public async Task<IActionResult> SupplierPerformance([FromQuery] int days = 90)
    {
        days = Math.Clamp(days, 7, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"supplier?days={days}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Thông minh giá – so sánh giá sản phẩm với thị trường</summary>
    [HttpGet("price")]
    public async Task<IActionResult> PriceIntelligence(
        [FromQuery] string? category = null,
        [FromQuery] int days = 30)
    {
        days = Math.Clamp(days, 7, 365);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"price?days={days}"
            + (category is not null ? $"&category={category}" : "")
            + (companyId.HasValue ? $"&company_id={companyId}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }
}

/// <summary>Request body cho POST /api/ai/recommend</summary>
public class AskRecommendationRequest
{
    /// <summary>Câu hỏi tự nhiên của người dùng</summary>
    public string? Question { get; set; }

    /// <summary>Ngôn ngữ trả về: "vi" (mặc định) hoặc "en"</summary>
    public string? Language { get; set; } = "vi";

    /// <summary>Loại context: "business_data" | "market_trends" | "customer_feedback"</summary>
    public string? Context { get; set; }

    /// <summary>Danh sách nguồn: ["fact_sales","oltp"] | ["google","external"] | ["facebook"]</summary>
    public string[]? Sources { get; set; }
}
