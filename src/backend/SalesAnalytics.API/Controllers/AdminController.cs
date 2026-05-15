using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Entities;
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
    [Authorize(Roles = "Owner,Manager,Admin")]
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

    /// <summary>Owner/Manager tạo user mới trong công ty (is_active = true ngay lập tức)</summary>
    [HttpPost("users")]
    [Authorize(Roles = "Owner,Manager,Admin")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FullName)  ||
            string.IsNullOrWhiteSpace(req.Email)     ||
            string.IsNullOrWhiteSpace(req.TempPassword))
            return BadRequest(new { message = "Thiếu thông tin bắt buộc." });

        if (!tenant.CompanyId.HasValue && !tenant.IsSuperAdmin)
            return BadRequest(new { message = "Không xác định được công ty." });

        // Kiểm tra email trùng
        if (await db.Users.AnyAsync(u => u.Email == req.Email))
            return BadRequest(new { message = "Email đã tồn tại trong hệ thống." });

        if (!Enum.TryParse<UserRole>(req.Role, true, out var role) ||
            role is UserRole.Owner or UserRole.Admin)
            return BadRequest(new { message = "Vai trò không hợp lệ. Chỉ được tạo Manager, Staff, Viewer, DataIT." });

        var user = new User
        {
            FullName     = req.FullName.Trim(),
            Email        = req.Email.Trim().ToLower(),
            Username     = req.Email.Trim().ToLower(),
            PasswordHash = AuthService.HashPassword(req.TempPassword),
            Role         = role,
            IsActive     = true,
            CompanyId    = tenant.CompanyId,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "CREATE_USER", entityType: "User", entityId: user.Id.ToString(),
            newValue: $"{{\"email\":\"{user.Email}\",\"role\":\"{role}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã tạo tài khoản {user.Email} với vai trò {role}.", userId = user.Id });
    }

    /// <summary>Cập nhật thông tin user (tên, role, active)</summary>
    [HttpPut("users/{id}")]
    [Authorize(Roles = "Owner,Manager,Admin")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền chỉnh sửa tài khoản này." });

        if (user.Role == UserRole.Owner)
            return BadRequest(new { message = "Không thể chỉnh sửa tài khoản Owner." });

        if (req.FullName is not null) user.FullName = req.FullName.Trim();
        if (req.Role is not null && Enum.TryParse<UserRole>(req.Role, true, out var newRole)
            && newRole is not UserRole.Owner and not UserRole.Admin)
            user.Role = newRole;
        if (req.IsActive.HasValue) user.IsActive = req.IsActive.Value;

        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "UPDATE_USER", entityType: "User", entityId: id.ToString(),
            newValue: $"{{\"fullName\":\"{user.FullName}\",\"role\":\"{user.Role}\",\"isActive\":{user.IsActive.ToString().ToLower()}}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã cập nhật tài khoản {user.Email}." });
    }

    /// <summary>Xóa user (chỉ Owner mới được xóa)</summary>
    [HttpDelete("users/{id}")]
    [Authorize(Roles = "Owner,Admin")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền xóa tài khoản này." });

        if (user.Role == UserRole.Owner)
            return BadRequest(new { message = "Không thể xóa tài khoản Owner." });

        db.Users.Remove(user);
        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "DELETE_USER", entityType: "User", entityId: id.ToString(),
            newValue: $"{{\"email\":\"{user.Email}\",\"role\":\"{user.Role}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = $"Đã xóa tài khoản {user.Email}." });
    }

    /// <summary>Phê duyệt tài khoản (IsActive = true)</summary>
    [HttpPatch("users/{id}/approve")]
    [Authorize(Roles = "Owner,Manager,Admin")]
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
    [Authorize(Roles = "Owner,Manager,Admin")]
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
    [Authorize(Roles = "Owner,Manager,Admin")]
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
    [Authorize(Roles = "Owner,Manager,Admin")]
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

    /// <summary>[SA] Kích hoạt / khóa một công ty (kèm lý do nếu khóa)</summary>
    [HttpPatch("sa/companies/{id}/toggle")]
    [RequireSuperAdmin]
    public async Task<IActionResult> ToggleCompany(Guid id, [FromBody] ToggleCompanyRequest req)
    {
        var company = await db.Companies.FindAsync(id);
        if (company is null) return NotFound();

        company.IsActive  = req.IsActive;
        company.UpdatedAt = DateTime.UtcNow;

        if (!req.IsActive)
        {
            company.LockReason = req.Reason?.Trim();
            company.LockedAt   = DateTime.UtcNow;
            // Vô hiệu hoá tất cả refresh token của user trong công ty khi bị khóa
            await db.Users
                .Where(u => u.CompanyId == id)
                .ExecuteUpdateAsync(s => s.SetProperty(u => u.RefreshToken, (string?)null));
        }
        else
        {
            company.LockReason = null;
            company.LockedAt   = null;
        }

        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: req.IsActive ? "ACTIVATE_COMPANY" : "DEACTIVATE_COMPANY",
            entityType: "Company", entityId: id.ToString(),
            newValue: $"{{\"isActive\":{req.IsActive.ToString().ToLower()},\"reason\":\"{req.Reason}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new {
            message = $"Công ty '{company.Name}' đã được {(req.IsActive ? "kích hoạt" : "khóa")}.",
            lockReason = company.LockReason
        });
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

    /// <summary>[SA] Dashboard tổng hệ thống – KPIs, companies đăng ký theo tháng, top companies</summary>
    [HttpGet("sa/dashboard")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetSystemDashboard()
    {
        var now          = DateTime.UtcNow;
        var startOfMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var sixMonthsAgo = now.AddMonths(-6);

        var totalCompanies  = await db.Companies.CountAsync();
        var activeCompanies = await db.Companies.CountAsync(c => c.IsActive);
        var totalUsers      = await db.Users.CountAsync(u => !u.IsSuperAdmin);
        var activeUsers     = await db.Users.CountAsync(u => u.IsActive && !u.IsSuperAdmin);
        var proSubs         = await db.Subscriptions.CountAsync(s => s.Plan == "pro" && s.Status == "active");
        var monthRevenue    = await db.Invoices
            .Where(i => i.PaymentStatus == "paid" && i.PaidAt >= startOfMonth)
            .SumAsync(i => (decimal?)i.Amount) ?? 0;

        // Số công ty đăng ký theo tháng (6 tháng gần nhất)
        var registrations = await db.Companies
            .Where(c => c.CreatedAt >= sixMonthsAgo)
            .GroupBy(c => new { c.CreatedAt.Year, c.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .OrderBy(x => x.Year).ThenBy(x => x.Month)
            .ToListAsync();

        // Top 5 công ty gần nhất
        var topCompanies = await db.Companies
            .OrderByDescending(c => c.CreatedAt)
            .Take(5)
            .Select(c => new {
                c.Id, c.Name, c.Email, c.IsActive, c.CreatedAt,
                UserCount    = db.Users.Count(u => u.CompanyId == c.Id),
                Subscription = db.Subscriptions
                    .Where(s => s.CompanyId == c.Id)
                    .OrderByDescending(s => s.CreatedAt)
                    .Select(s => new { s.Plan, s.Status })
                    .FirstOrDefault(),
            })
            .ToListAsync();

        return Ok(new {
            success = true,
            data = new {
                totalCompanies, activeCompanies, totalUsers, activeUsers,
                proSubscriptions = proSubs, monthlyRevenue = monthRevenue,
                registrationsByMonth = registrations,
                topCompanies,
            }
        });
    }

    /// <summary>[SA] Danh sách tất cả subscriptions trong hệ thống</summary>
    [HttpGet("sa/subscriptions")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetAllSubscriptions(
        [FromQuery] string? plan     = null,
        [FromQuery] string? status   = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var query = db.Subscriptions.Include(s => s.Company).AsQueryable();
        if (!string.IsNullOrWhiteSpace(plan))   query = query.Where(s => s.Plan   == plan);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(s => s.Status == status);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new {
                s.Id, s.CompanyId,
                CompanyName = s.Company != null ? s.Company.Name : null,
                CompanyEmail = s.Company != null ? s.Company.Email : null,
                s.Plan, s.Status, s.AutoRenew,
                s.MaxChannels, s.MaxUsers, s.AiEnabled, s.AdvancedReports,
                s.StartedAt, s.ExpiresAt, s.GraceEndsAt, s.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, data = items, total, page, pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize) });
    }

    /// <summary>[SA] Cập nhật subscription thủ công (nâng/hạ cấp, thay đổi expires_at)</summary>
    [HttpPut("sa/subscriptions/{id}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> UpdateSubscription(Guid id,
        [FromBody] UpdateSubscriptionRequest req)
    {
        var sub = await db.Subscriptions.FindAsync(id);
        if (sub is null) return NotFound(new { success = false, message = "Subscription không tồn tại" });

        if (!string.IsNullOrWhiteSpace(req.Plan))
        {
            sub.Plan            = req.Plan;
            sub.AiEnabled       = req.Plan is "pro" or "enterprise";
            sub.AdvancedReports = req.Plan is "pro" or "enterprise";
            sub.MaxChannels     = req.Plan == "free" ? 2  : -1;
            sub.MaxUsers        = req.Plan == "free" ? 3  : -1;
        }
        if (!string.IsNullOrWhiteSpace(req.Status)) sub.Status    = req.Status;
        if (req.ExpiresAt.HasValue)                 sub.ExpiresAt = req.ExpiresAt;
        if (req.MaxChannels.HasValue)               sub.MaxChannels = req.MaxChannels.Value;
        if (req.MaxUsers.HasValue)                  sub.MaxUsers    = req.MaxUsers.Value;
        sub.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "SA_UPDATE_SUBSCRIPTION", entityType: "Subscription", entityId: id.ToString(),
            newValue: $"{{\"plan\":\"{sub.Plan}\",\"status\":\"{sub.Status}\"}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Đã cập nhật subscription" });
    }

    /// <summary>[SA] ETL / Sync logs toàn hệ thống</summary>
    [HttpGet("sa/sync-logs")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetSyncLogs(
        [FromQuery] string? level    = null,
        [FromQuery] string? phase    = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 50;

        var query = db.EtlLogs.AsQueryable();
        if (!string.IsNullOrWhiteSpace(level)) query = query.Where(l => l.Level == level.ToUpper());
        if (!string.IsNullOrWhiteSpace(phase)) query = query.Where(l => l.Phase == phase.ToUpper());

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(l => new {
                l.LogId, l.JobId, l.Phase, l.Level,
                l.Message, l.RecordsCount, l.CreatedAt,
            })
            .ToListAsync();

        return Ok(new { success = true, data = items, total, page, pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize) });
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private int?   GetCurrentUserId()   =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private string GetCurrentUsername() =>
        User.FindFirstValue(ClaimTypes.Name) ?? "unknown";
}

public record CreateUserRequest(
    string FullName,
    string Email,
    string TempPassword,
    string Role,
    bool   SendInvite = false
);

public record UpdateUserRequest(
    string? FullName,
    string? Role,
    bool?   IsActive
);

public record ChangeRoleRequest([System.ComponentModel.DataAnnotations.Required] string Role);
public record ToggleRequest(bool IsActive);
public record ToggleCompanyRequest(bool IsActive, string? Reason);
public record UpdateSubscriptionRequest(
    string?   Plan,
    string?   Status,
    DateTime? ExpiresAt,
    int?      MaxChannels,
    int?      MaxUsers
);
