using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController(
    AppDbContext db,
    ITenantContext tenant) : ControllerBase
{
    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

    // ── GET /api/notifications ────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int    page    = 1,
        [FromQuery] int    limit   = 20,
        [FromQuery] bool?  isRead  = null,
        [FromQuery] string? category = null)
    {
        var userId    = CurrentUserId;
        var companyId = tenant.CompanyId;

        // Filter theo userId + companyId (defense in depth cho multi-tenant)
        // CompanyId nullable → giữ lại notification không gắn company (system-wide)
        var query = db.Notifications
            .Where(n => n.UserId == userId && (n.CompanyId == null || n.CompanyId == companyId))
            .AsQueryable();

        if (isRead.HasValue)    query = query.Where(n => n.IsRead == isRead.Value);
        if (!string.IsNullOrEmpty(category)) query = query.Where(n => n.Category == category);

        var total       = await query.CountAsync();
        var unreadCount = await db.Notifications.CountAsync(
            n => n.UserId == userId && !n.IsRead && (n.CompanyId == null || n.CompanyId == companyId));

        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(n => new
            {
                n.Id, n.Type, n.Category, n.Title, n.Body, n.Data,
                n.IsRead, n.ReadAt, n.Channels, n.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, data = items, unreadCount, total, page });
    }

    // ── PATCH /api/notifications/{id}/read ───────────────────────────────────
    [HttpPatch("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var notif = await db.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == CurrentUserId);

        if (notif == null) return NotFound();

        notif.IsRead = true;
        notif.ReadAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { success = true });
    }

    // ── PATCH /api/notifications/read-all ────────────────────────────────────
    [HttpPatch("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var userId = CurrentUserId;
        await db.Notifications
            .Where(n => n.UserId == userId && !n.IsRead)
            .ExecuteUpdateAsync(s => s
                .SetProperty(n => n.IsRead, true)
                .SetProperty(n => n.ReadAt, DateTime.UtcNow));

        return Ok(new { success = true });
    }

    // ── DELETE /api/notifications/{id} ───────────────────────────────────────
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var notif = await db.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == CurrentUserId);

        if (notif == null) return NotFound();

        db.Notifications.Remove(notif);
        await db.SaveChangesAsync();

        return Ok(new { success = true });
    }

    // ── POST /api/notifications/push-token ───────────────────────────────────
    [HttpPost("push-token")]
    public async Task<IActionResult> RegisterPushToken([FromBody] PushTokenRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ExpoToken))
            return BadRequest(new { success = false, message = "Expo token không hợp lệ." });

        var userId    = CurrentUserId;
        var companyId = tenant.CompanyId;

        var existing = await db.PushTokens
            .FirstOrDefaultAsync(t => t.UserId == userId && t.ExpoToken == req.ExpoToken);

        if (existing != null)
        {
            existing.IsActive   = true;
            existing.LastUsedAt = DateTime.UtcNow;
            existing.DeviceName = req.DeviceName;
            existing.Platform   = req.Platform;
        }
        else
        {
            db.PushTokens.Add(new PushToken
            {
                UserId     = userId,
                CompanyId  = companyId,
                ExpoToken  = req.ExpoToken,
                DeviceName = req.DeviceName,
                Platform   = req.Platform,
            });
        }

        await db.SaveChangesAsync();
        return Ok(new { success = true });
    }
}

public class PushTokenRequest
{
    public string  ExpoToken  { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public string? Platform   { get; set; }
}
