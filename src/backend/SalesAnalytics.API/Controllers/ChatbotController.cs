using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.API.Controllers;

/// <summary>Chatbot AI – gọi Gemini với context dữ liệu kinh doanh thực tế</summary>
[ApiController]
[Route("api/chatbot")]
[Authorize]
public class ChatbotController(
    GeminiService              gemini,
    ITenantContext             tenant,
    ILogger<ChatbotController> logger) : ControllerBase
{
    /// <summary>
    /// POST /api/chatbot/chat
    /// Gửi câu hỏi → Gemini trả lời, có lịch sử chat và context DB
    /// </summary>
    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] ChatRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new { message = "Câu hỏi không được để trống." });

        var companyId = tenant.CompanyId; // Guid? – lấy từ JWT claim
        logger.LogInformation("Chatbot request: tab={Tab}, companyId={CompanyId}", req.Tab, companyId);

        var response = await gemini.ChatAsync(
            companyId, req.Message, req.Tab, req.History);

        return Ok(response);
    }

    /// <summary>
    /// GET /api/chatbot/suggestions?tab=business
    /// Trả về danh sách câu hỏi gợi ý theo tab
    /// </summary>
    [HttpGet("suggestions")]
    public async Task<IActionResult> GetSuggestions([FromQuery] string tab = "business")
    {
        var companyId   = tenant.CompanyId;
        var suggestions = await gemini.GetSmartSuggestions(companyId, tab);
        return Ok(new { success = true, data = suggestions });
    }
}
