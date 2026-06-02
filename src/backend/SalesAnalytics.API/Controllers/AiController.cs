using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>Proxy đến AI Service FastAPI – Frontend chỉ gọi Backend, không gọi AI trực tiếp</summary>
[ApiController]
[Route("api/ai")]
[Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
[RequirePlan("pro")]
public class AiController(AiProxyService ai, ITenantContext tenant) : ControllerBase
{
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
        [FromQuery] double minSupport = 0.02,
        [FromQuery] double minConfidence = 0.3,
        [FromQuery] double minLift = 1.0,
        [FromQuery] int topN = 20)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        static string F(double v) => v.ToString("G", CultureInfo.InvariantCulture);
        var qs = $"basket?days={days}&min_support={F(minSupport)}&min_confidence={F(minConfidence)}&min_lift={F(minLift)}&top_n={topN}"
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
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        var qs = $"leaderboard?category={category}&days={days}&top_n={topN}"
            + (companyId.HasValue ? $"&company_id={companyId}" : "")
            + (!string.IsNullOrEmpty(startDate) ? $"&start_date={startDate}" : "")
            + (!string.IsNullOrEmpty(endDate) ? $"&end_date={endDate}" : "");
        var result = await ai.ProxyGetAsync(qs);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Sinh nhận xét doanh thu tự động bằng ngôn ngữ tự nhiên (Smart Narrative)</summary>
    [HttpGet("narrative")]
    public async Task<IActionResult> SmartNarrative(
        [FromQuery] int days = 30,
        [FromQuery] string language = "vi")
    {
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
