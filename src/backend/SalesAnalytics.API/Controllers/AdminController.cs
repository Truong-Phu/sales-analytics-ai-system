using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>Quản trị user và audit log – chỉ Admin mới truy cập được</summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext    _db;
    private readonly IAuditLogService _audit;

    public AdminController(AppDbContext db, IAuditLogService audit)
    {
        _db    = db;
        _audit = audit;
    }

    // ── Quản lý người dùng ──────────────────────────────────────────────────

    /// <summary>Danh sách tất cả người dùng</summary>
    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        var users = await _db.Users
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id, u.Username, u.FullName, u.Email,
                Role = u.Role.ToString(),
                u.IsActive, u.CreatedAt, u.LastLoginAt
            })
            .ToListAsync();

        return Ok(users);
    }

    /// <summary>Phê duyệt tài khoản (IsActive = true)</summary>
    [HttpPatch("users/{id}/approve")]
    public async Task<IActionResult> ApproveUser(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.IsActive = true;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            userId:     GetCurrentUserId(), username: GetCurrentUsername(),
            action:     "APPROVE_USER",
            entityType: "User", entityId: id.ToString(),
            newValue:   $"{{\"isActive\":true,\"username\":\"{user.Username}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã phê duyệt tài khoản {user.Username}." });
    }

    /// <summary>Khóa tài khoản</summary>
    [HttpPatch("users/{id}/deactivate")]
    public async Task<IActionResult> DeactivateUser(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.IsActive     = false;
        user.RefreshToken = null;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            userId:     GetCurrentUserId(), username: GetCurrentUsername(),
            action:     "DEACTIVATE_USER",
            entityType: "User", entityId: id.ToString(),
            newValue:   $"{{\"isActive\":false,\"username\":\"{user.Username}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã khóa tài khoản {user.Username}." });
    }

    /// <summary>Kích hoạt lại tài khoản đã khóa</summary>
    [HttpPatch("users/{id}/activate")]
    public async Task<IActionResult> ActivateUser(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        user.IsActive = true;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            userId:     GetCurrentUserId(), username: GetCurrentUsername(),
            action:     "ACTIVATE_USER",
            entityType: "User", entityId: id.ToString(),
            newValue:   $"{{\"isActive\":true,\"username\":\"{user.Username}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã kích hoạt lại tài khoản {user.Username}." });
    }

    /// <summary>Đổi role người dùng</summary>
    [HttpPatch("users/{id}/role")]
    public async Task<IActionResult> ChangeRole(int id, [FromBody] ChangeRoleRequest req)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();
        if (!Enum.TryParse<UserRole>(req.Role, true, out var role))
            return BadRequest(new { message = "Role không hợp lệ." });

        var oldRole = user.Role.ToString();
        user.Role = role;
        await _db.SaveChangesAsync();

        await _audit.LogAsync(
            userId:     GetCurrentUserId(), username: GetCurrentUsername(),
            action:     "CHANGE_ROLE",
            entityType: "User", entityId: id.ToString(),
            oldValue:   $"{{\"role\":\"{oldRole}\"}}",
            newValue:   $"{{\"role\":\"{role}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã đổi role của {user.Username} thành {role}." });
    }

    // ── Audit Log ───────────────────────────────────────────────────────────

    /// <summary>
    /// Xem lịch sử hành động người dùng.
    /// Chỉ Admin mới truy cập được (kế thừa từ [Authorize(Roles = "Admin")] của class).
    /// </summary>
    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] int?    userId   = null,
        [FromQuery] string? action   = null,
        [FromQuery] string? status   = null,
        [FromQuery] DateTime? from   = null,
        [FromQuery] DateTime? to     = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
    {
        if (page     < 1) page     = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var query = _db.AuditLogs.AsQueryable();

        if (userId.HasValue)
            query = query.Where(a => a.UserId == userId.Value);
        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(a => a.Action == action.ToUpper());
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(a => a.Status == status.ToUpper());
        if (from.HasValue)
            query = query.Where(a => a.CreatedAt >= from.Value);
        if (to.HasValue)
            query = query.Where(a => a.CreatedAt <= to.Value);

        var total = await query.CountAsync();

        var logs = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id,
                a.UserId,
                a.Username,
                a.Action,
                a.EntityType,
                a.EntityId,
                a.Status,
                a.ErrorMessage,
                a.IpAddress,
                createdAt = a.CreatedAt.ToString("O"),
            })
            .ToListAsync();

        return Ok(new
        {
            data       = logs,
            total,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize),
        });
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private int?   GetCurrentUserId()  =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private string GetCurrentUsername() =>
        User.FindFirstValue(ClaimTypes.Name) ?? "unknown";
}

public record ChangeRoleRequest([System.ComponentModel.DataAnnotations.Required] string Role);
