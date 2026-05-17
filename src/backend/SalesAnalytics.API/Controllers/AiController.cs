using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>Proxy đến AI Service FastAPI – Frontend chỉ gọi Backend, không gọi AI trực tiếp</summary>
[ApiController]
[Route("api/ai")]
[Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
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
