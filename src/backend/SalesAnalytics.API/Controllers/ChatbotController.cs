using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>Chatbot AI – gọi Gemini/Groq với context dữ liệu kinh doanh + lưu lịch sử hội thoại</summary>
[ApiController]
[Route("api/chatbot")]
[Authorize]
public class ChatbotController(
    GeminiService              gemini,
    AppDbContext               db,
    ITenantContext             tenant,
    IServiceScopeFactory       scopeFactory,
    ILogger<ChatbotController> logger) : ControllerBase
{
    /// <summary>
    /// POST /api/chatbot/chat
    /// Gửi câu hỏi → Gemini/Groq trả lời, tự động load + lưu lịch sử DB
    /// </summary>
    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] ChatRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Message))
            return BadRequest(new { message = "Câu hỏi không được để trống." });

        var companyId = tenant.CompanyId;
        var userId    = tenant.UserId;

        // Nếu frontend không truyền history → tự load từ DB (50 tin nhắn gần nhất)
        var history = req.History is { Count: > 0 }
            ? req.History
            : await LoadHistoryFromDb(userId, companyId, req.Tab, limit: 50);

        logger.LogInformation("Chatbot: tab={Tab} user={U} company={C} historyLen={H}",
            req.Tab, userId, companyId, history.Count);

        var response = await gemini.ChatAsync(companyId, req.Message, req.Tab, history);

        // Lưu cặp hỏi-đáp vào DB (fire-and-forget, không block response)
        _ = SaveTurnAsync(userId, companyId, req.Tab, req.Message, response);

        return Ok(response);
    }

    /// <summary>
    /// GET /api/chatbot/history?tab=business&limit=50
    /// Trả về lịch sử hội thoại của user hiện tại theo tab
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string tab = "business", [FromQuery] int limit = 50)
    {
        var userId    = tenant.UserId;
        var companyId = tenant.CompanyId;

        var rows = await db.Set<ChatHistory>()
            .Where(c => c.UserId == userId
                     && (companyId == null || c.CompanyId == companyId)
                     && c.Tab == tab)
            .OrderByDescending(c => c.CreatedAt)
            .Take(Math.Clamp(limit, 1, 200))
            .OrderBy(c => c.CreatedAt)           // đảo lại để frontend hiển thị đúng thứ tự
            .Select(c => new
            {
                id           = c.Id,
                question     = c.Question,
                answer       = c.Answer,
                intent       = c.Intent,
                modelUsed    = c.ModelUsed,
                fallbackUsed = c.FallbackUsed,
                createdAt    = c.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, data = rows, tab });
    }

    /// <summary>
    /// DELETE /api/chatbot/history?tab=business
    /// Xóa toàn bộ lịch sử của user theo tab
    /// </summary>
    [HttpDelete("history")]
    public async Task<IActionResult> ClearHistory([FromQuery] string tab = "business")
    {
        var userId    = tenant.UserId;
        var companyId = tenant.CompanyId;

        var deleted = await db.Set<ChatHistory>()
            .Where(c => c.UserId == userId
                     && (companyId == null || c.CompanyId == companyId)
                     && c.Tab == tab)
            .ExecuteDeleteAsync();

        logger.LogInformation("Chatbot: cleared {N} history rows for user={U} tab={T}", deleted, userId, tab);
        return Ok(new { success = true, deleted });
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

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<List<ChatMessage>> LoadHistoryFromDb(int userId, Guid? companyId, string tab, int limit)
    {
        try
        {
            var rows = await db.Set<ChatHistory>()
                .Where(c => c.UserId == userId
                         && (companyId == null || c.CompanyId == companyId)
                         && c.Tab == tab)
                .OrderByDescending(c => c.CreatedAt)
                .Take(limit)
                .OrderBy(c => c.CreatedAt)
                .ToListAsync();

            var msgs = new List<ChatMessage>(rows.Count * 2);
            foreach (var r in rows)
            {
                msgs.Add(new ChatMessage { Role = "user",  Content = r.Question });
                msgs.Add(new ChatMessage { Role = "model", Content = r.Answer   });
            }
            return msgs;
        }
        catch (Exception ex)
        {
            logger.LogWarning("LoadHistoryFromDb lỗi: {M}", ex.Message);
            return [];
        }
    }

    private async Task SaveTurnAsync(int userId, Guid? companyId, string tab, string question, ChatResponse response)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var scopedDb = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            scopedDb.Set<ChatHistory>().Add(new ChatHistory
            {
                UserId       = userId,
                CompanyId    = companyId,
                Tab          = tab,
                Question     = question,
                Answer       = response.Answer ?? "",
                Intent       = response.Intent,
                ModelUsed    = response.ModelUsed,
                FallbackUsed = response.FallbackUsed,
                CreatedAt    = DateTime.UtcNow,
            });
            await scopedDb.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning("SaveTurnAsync lỗi: {M}", ex.Message);
        }
    }
}
