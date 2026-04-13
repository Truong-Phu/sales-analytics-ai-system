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

    /// <summary>Gợi ý hành động từ AI</summary>
    [HttpGet("recommendation")]
    public async Task<IActionResult> Recommendation()
    {
        var result = await _ai.GetRecommendationsAsync();
        if (result is null) return StatusCode(503, new { message = "AI Service không khả dụng." });
        return Ok(result);
    }
}
