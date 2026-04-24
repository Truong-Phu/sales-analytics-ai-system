using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>Proxy đến AI Service FastAPI – Frontend chỉ gọi Backend, không gọi AI trực tiếp</summary>
[ApiController]
[Route("api/ai")]
[Authorize(Roles = "Owner,Manager,DataIT,Admin")]
public class AiController : ControllerBase
{
    private readonly AiProxyService _ai;

    public AiController(AiProxyService ai) => _ai = ai;

    /// <summary>Dự báo doanh thu N ngày tiếp theo</summary>
    [HttpGet("forecast")]
    public async Task<IActionResult> Forecast(
        [FromQuery] int horizon = 30,
        [FromQuery] string? channel = null)
    {
        var result = await _ai.GetForecastAsync(horizon, channel);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phát hiện bất thường doanh thu</summary>
    [HttpGet("anomaly")]
    public async Task<IActionResult> Anomaly(
        [FromQuery] int days = 90,
        [FromQuery] string? channel = null)
    {
        var result = await _ai.GetAnomalyAsync(days, channel);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Phân tích xu hướng</summary>
    [HttpGet("trend")]
    public async Task<IActionResult> Trend(
        [FromQuery] int days = 30,
        [FromQuery] string? channel = null)
    {
        var result = await _ai.GetTrendAsync(days, channel);
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Gợi ý hành động tự động từ AI (rule-based + anomaly)</summary>
    [HttpGet("recommendation")]
    public async Task<IActionResult> Recommendation()
    {
        var result = await _ai.GetRecommendationsAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }

    /// <summary>Metrics đánh giá độ chính xác model Prophet (MAE, RMSE, MAPE)</summary>
    [HttpGet("forecast/metrics")]
    public async Task<IActionResult> ForecastMetrics()
    {
        var result = await _ai.GetForecastMetricsAsync();
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

        var result = await _ai.PostRecommendationAsync(
            question: request.Question,
            language: request.Language ?? "vi"
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
}
