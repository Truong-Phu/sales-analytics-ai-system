using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Hai phần:
/// 1. Tenant Admin (/api/admin/users, /api/admin/audit-logs) – quản lý user trong công ty mình.
/// 2. Super Admin (/api/admin/sa/*) – quản lý toàn hệ thống, yêu cầu [RequireSuperAdmin].
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AdminController(
    AppDbContext db,
    IAuditLogService audit,
    ITenantContext tenant) : ControllerBase
{
    // ══════════════════════════════════════════════════════════════════════════
    // PHẦN 1 – Tenant Admin: quản lý user và audit log trong công ty mình
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>Danh sách user trong company hiện tại</summary>
    [HttpGet("users")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetUsers()
    {
        var query = db.Users.AsQueryable();

        // Admin thường chỉ xem user trong công ty mình
        if (!tenant.IsSuperAdmin && tenant.CompanyId.HasValue)
            query = query.Where(u => u.CompanyId == tenant.CompanyId.Value);

        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id, u.Username, u.FullName, u.Email,
                Role         = u.Role.ToString(),
                u.IsActive,  u.CompanyId,
                u.CreatedAt, u.LastLoginAt
            })
            .ToListAsync();

        return Ok(users);
    }

    /// <summary>Phê duyệt tài khoản (IsActive = true)</summary>
    [HttpPatch("users/{id}/approve")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ApproveUser(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        // Chỉ cho phép phê duyệt user trong cùng công ty
        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền phê duyệt tài khoản này." });

        user.IsActive = true;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "APPROVE_USER", entityType: "User", entityId: id.ToString(),
            newValue: $"{{\"isActive\":true,\"username\":\"{user.Username}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã phê duyệt tài khoản {user.Username}." });
    }

    /// <summary>Khóa tài khoản</summary>
    [HttpPatch("users/{id}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeactivateUser(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền khóa tài khoản này." });

        user.IsActive     = false;
        user.RefreshToken = null;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "DEACTIVATE_USER", entityType: "User", entityId: id.ToString(),
            newValue: $"{{\"isActive\":false,\"username\":\"{user.Username}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã khóa tài khoản {user.Username}." });
    }

    /// <summary>Kích hoạt lại tài khoản đã khóa</summary>
    [HttpPatch("users/{id}/activate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ActivateUser(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền kích hoạt tài khoản này." });

        user.IsActive = true;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "ACTIVATE_USER", entityType: "User", entityId: id.ToString(),
            newValue: $"{{\"isActive\":true,\"username\":\"{user.Username}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã kích hoạt lại tài khoản {user.Username}." });
    }

    /// <summary>Đổi role người dùng</summary>
    [HttpPatch("users/{id}/role")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ChangeRole(int id, [FromBody] ChangeRoleRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền đổi role tài khoản này." });

        if (!Enum.TryParse<UserRole>(req.Role, true, out var role))
            return BadRequest(new { message = "Role không hợp lệ." });

        var oldRole = user.Role.ToString();
        user.Role   = role;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "CHANGE_ROLE", entityType: "User", entityId: id.ToString(),
            oldValue: $"{{\"role\":\"{oldRole}\"}}",
            newValue: $"{{\"role\":\"{role}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã đổi role của {user.Username} thành {role}." });
    }

    /// <summary>Audit log trong company hiện tại (Admin) hoặc toàn hệ thống (SuperAdmin)</summary>
    [HttpGet("audit-logs")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] int?      userId   = null,
        [FromQuery] string?   action   = null,
        [FromQuery] string?   status   = null,
        [FromQuery] DateTime? from     = null,
        [FromQuery] DateTime? to       = null,
        [FromQuery] int       page     = 1,
        [FromQuery] int       pageSize = 50)
    {
        if (page     < 1) page     = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var query = db.AuditLogs.AsQueryable();

        if (userId.HasValue)                      query = query.Where(a => a.UserId == userId.Value);
        if (!string.IsNullOrWhiteSpace(action))   query = query.Where(a => a.Action == action.ToUpper());
        if (!string.IsNullOrWhiteSpace(status))   query = query.Where(a => a.Status == status.ToUpper());
        if (from.HasValue)                         query = query.Where(a => a.CreatedAt >= from.Value);
        if (to.HasValue)                           query = query.Where(a => a.CreatedAt <= to.Value);

        var total = await query.CountAsync();
        var logs  = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id, a.UserId, a.Username, a.Action, a.EntityType,
                a.EntityId, a.Status, a.ErrorMessage, a.IpAddress,
                createdAt = a.CreatedAt.ToString("O"),
            })
            .ToListAsync();

        return Ok(new { data = logs, total, page, pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize) });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHẦN 2 – Super Admin: quản lý toàn hệ thống (yêu cầu is_super_admin=TRUE)
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>[SA] Danh sách tất cả công ty trong hệ thống</summary>
    [HttpGet("sa/companies")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetAllCompanies()
    {
        var companies = await db.Companies
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id, c.Name, c.Slug, c.Email, c.Phone,
                c.IsActive, c.OnboardingCompleted, c.CreatedAt,
                UserCount = db.Users.Count(u => u.CompanyId == c.Id),
                Subscription = db.Subscriptions
                    .Where(s => s.CompanyId == c.Id)
                    .Select(s => new { s.Plan, s.Status, s.ExpiresAt })
                    .FirstOrDefault(),
            })
            .ToListAsync();

        return Ok(companies);
    }

    /// <summary>[SA] Kích hoạt / khóa một công ty</summary>
    [HttpPatch("sa/companies/{id}/toggle")]
    [RequireSuperAdmin]
    public async Task<IActionResult> ToggleCompany(Guid id, [FromBody] ToggleRequest req)
    {
        var company = await db.Companies.FindAsync(id);
        if (company is null) return NotFound();

        company.IsActive = req.IsActive;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: req.IsActive ? "ACTIVATE_COMPANY" : "DEACTIVATE_COMPANY",
            entityType: "Company", entityId: id.ToString(),
            newValue: $"{{\"isActive\":{req.IsActive.ToString().ToLower()}}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Công ty '{company.Name}' đã được {(req.IsActive ? "kích hoạt" : "khóa")}." });
    }

    /// <summary>[SA] Danh sách tất cả user trong hệ thống (toàn tenant)</summary>
    [HttpGet("sa/users")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetAllUsers(
        [FromQuery] Guid?   companyId = null,
        [FromQuery] string? role      = null,
        [FromQuery] int     page      = 1,
        [FromQuery] int     pageSize  = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var query = db.Users.Include(u => u.Company).AsQueryable();
        if (companyId.HasValue)               query = query.Where(u => u.CompanyId == companyId.Value);
        if (!string.IsNullOrWhiteSpace(role)) query = query.Where(u => u.Role.ToString() == role);

        var total = await query.CountAsync();
        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new
            {
                u.Id, u.Username, u.FullName, u.Email,
                Role        = u.Role.ToString(),
                u.IsActive, u.IsSuperAdmin,
                u.CompanyId, CompanyName = u.Company != null ? u.Company.Name : null,
                u.CreatedAt, u.LastLoginAt,
            })
            .ToListAsync();

        return Ok(new { data = users, total, page, pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize) });
    }

    /// <summary>[SA] Xem audit log toàn hệ thống (không giới hạn company)</summary>
    [HttpGet("sa/audit-logs")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetSystemAuditLogs(
        [FromQuery] string?   action   = null,
        [FromQuery] DateTime? from     = null,
        [FromQuery] DateTime? to       = null,
        [FromQuery] int       page     = 1,
        [FromQuery] int       pageSize = 100)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 500) pageSize = 100;

        var query = db.AuditLogs.AsQueryable();
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action.ToUpper());
        if (from.HasValue)                       query = query.Where(a => a.CreatedAt >= from.Value);
        if (to.HasValue)                         query = query.Where(a => a.CreatedAt <= to.Value);

        var total = await query.CountAsync();
        var logs  = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.Id, a.UserId, a.Username, a.Action, a.EntityType,
                a.EntityId, a.Status, a.ErrorMessage, a.IpAddress,
                createdAt = a.CreatedAt.ToString("O"),
            })
            .ToListAsync();

        return Ok(new { data = logs, total, page, pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize) });
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private int?   GetCurrentUserId()   =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private string GetCurrentUsername() =>
        User.FindFirstValue(ClaimTypes.Name) ?? "unknown";
}

public record ChangeRoleRequest([System.ComponentModel.DataAnnotations.Required] string Role);
public record ToggleRequest(bool IsActive);
