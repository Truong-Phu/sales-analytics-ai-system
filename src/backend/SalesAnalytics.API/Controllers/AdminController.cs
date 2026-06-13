using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
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
    ITenantContext tenant,
    IConfiguration cfg,
    IEmailService email) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    // ══════════════════════════════════════════════════════════════════════════
    // PHẦN 1 – Tenant Admin: quản lý user và audit log trong công ty mình
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>Danh sách user trong company hiện tại</summary>
    [HttpGet("users")]
    [Authorize(Roles = "Owner,Manager")]
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
    [Authorize(Roles = "Owner,Manager")]
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
            role is UserRole.Owner or UserRole.SuperAdmin)
            return BadRequest(new { message = "Vai trò không hợp lệ." });

        var companyName = (await db.Set<SalesAnalytics.Core.Entities.Company>()
            .FirstOrDefaultAsync(c => c.Id == tenant.CompanyId))?.Name ?? "Công ty";

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

        // Gửi email mời nếu sendInvite = true
        if (req.SendInvite)
            _ = email.SendInviteUserAsync(
                req.Email.Trim(), req.FullName.Trim(),
                companyName, req.Role, req.TempPassword);

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "CREATE_USER", entityType: "User", entityId: user.Id.ToString(),
            newValue: $"{{\"email\":\"{user.Email}\",\"role\":\"{role}\",\"invited\":{req.SendInvite.ToString().ToLower()}}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new
        {
            message  = $"Đã tạo tài khoản {user.Email} với vai trò {role}." +
                       (req.SendInvite ? " Email mời đã gửi." : ""),
            userId   = user.Id,
            invited  = req.SendInvite,
        });
    }

    /// <summary>Cập nhật thông tin user (tên, role, active)</summary>
    [HttpPut("users/{id}")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest req)
    {
        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (!tenant.IsSuperAdmin && user.CompanyId != tenant.CompanyId)
            return StatusCode(403, new { message = "Không có quyền chỉnh sửa tài khoản này." });

        if (user.Role == UserRole.Owner)
            return BadRequest(new { message = "Không thể chỉnh sửa tài khoản Owner." });

        var oldRole     = user.Role.ToString();
        var wasActive   = user.IsActive;

        if (req.FullName is not null) user.FullName = req.FullName.Trim();
        if (req.Role is not null && Enum.TryParse<UserRole>(req.Role, true, out var newRole)
            && newRole is not UserRole.Owner and not UserRole.SuperAdmin)
            user.Role = newRole;
        if (req.IsActive.HasValue) user.IsActive = req.IsActive.Value;

        await db.SaveChangesAsync();

        await audit.LogAsync(
            userId: GetCurrentUserId(), username: GetCurrentUsername(),
            action: "UPDATE_USER", entityType: "User", entityId: id.ToString(),
            newValue: $"{{\"fullName\":\"{user.FullName}\",\"role\":\"{user.Role}\",\"isActive\":{user.IsActive.ToString().ToLower()}}}",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        // Gửi email thông báo khi role hoặc trạng thái thay đổi (fire-and-forget)
        if (req.NotifyEmail && !string.IsNullOrEmpty(user.Email))
        {
            var companyName = (await db.Set<SalesAnalytics.Core.Entities.Company>()
                .FirstOrDefaultAsync(c => c.Id == tenant.CompanyId))?.Name ?? "Công ty";
            _ = email.SendRoleChangeNotificationAsync(
                user.Email, user.FullName ?? user.Email,
                oldRole, user.Role.ToString(),
                user.IsActive, companyName);
        }

        return Ok(new { message = $"Đã cập nhật tài khoản {user.Email}." });
    }

    /// <summary>Xóa user (chỉ Owner mới được xóa)</summary>
    [HttpDelete("users/{id}")]
    [Authorize(Roles = "Owner")]
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
    [Authorize(Roles = "Owner,Manager")]
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
    [Authorize(Roles = "Owner,Manager")]
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
    [Authorize(Roles = "Owner,Manager")]
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
    [Authorize(Roles = "Owner,Manager")]
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
    [Authorize(Roles = "Owner,SuperAdmin")]
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

    /// <summary>[Dev Only] Trigger SmartAlertJob thủ công để test – không cần chờ 1 giờ</summary>
    [HttpPost("trigger-alert-job")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> TriggerAlertJob(
        [FromServices] SmartAlertJob alertJob,
        [FromServices] IWebHostEnvironment env)
    {
        if (!env.IsDevelopment())
            return StatusCode(403, new { message = "Endpoint này chỉ khả dụng trong môi trường Development." });

        await alertJob.RunChecksAsync();
        return Ok(new { message = "SmartAlertJob đã chạy thủ công. Kiểm tra notifications trong DB và bell icon." });
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

    // ══════════════════════════════════════════════════════════════════════════
    // PHẦN 4 – KPI Nhân viên
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>GET /api/admin/staff/kpi?period=2026-05 — KPI tổng hợp tất cả staff</summary>
    [HttpGet("staff/kpi")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> GetStaffKpi([FromQuery] string? period)
    {
        // period = "2026-05" (YYYY-MM). Nếu không có → tháng hiện tại
        DateTime start, end;
        if (!string.IsNullOrEmpty(period) && DateTime.TryParse(period + "-01", out var pd))
        {
            start = DateTime.SpecifyKind(pd, DateTimeKind.Utc);
            end   = start.AddMonths(1).AddSeconds(-1);
        }
        else
        {
            var now = DateTime.UtcNow;
            start   = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            end     = start.AddMonths(1).AddSeconds(-1);
        }

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            WITH warehouse_actuals AS (
                SELECT user_id,
                       COUNT(*)::bigint AS task_count,
                       COALESCE(SUM(quantity_amount), 0) AS activity_value,
                       COALESCE(SUM(document_count), 0)::bigint AS document_count
                FROM (
                    SELECT created_by AS user_id, created_at, ABS(quantity_change)::numeric AS quantity_amount, 0::bigint AS document_count
                    FROM public.inventory_transactions
                    WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    UNION ALL
                    SELECT created_by AS user_id, created_at, total_quantity::numeric AS quantity_amount, 1::bigint AS document_count
                    FROM public.goods_receipts
                    WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    UNION ALL
                    SELECT po.created_by AS user_id, po.created_at, COALESCE(SUM(poi.quantity), 0)::numeric AS quantity_amount, 1::bigint AS document_count
                    FROM public.purchase_orders po
                    LEFT JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.purchase_order_id
                    WHERE po.company_id = @cid::uuid AND po.created_by IS NOT NULL
                    GROUP BY po.purchase_order_id, po.created_by, po.created_at
                ) x
                WHERE created_at BETWEEN @start AND @end
                GROUP BY user_id
            ),
            marketing_actuals AS (
                SELECT created_by AS user_id,
                       COUNT(*)::bigint AS activity_count,
                       COUNT(DISTINCT channel_id)::bigint AS channel_count,
                       COALESCE(SUM(amount), 0) AS spend_amount
                FROM public.ad_spend_monthly
                WHERE company_id = @cid::uuid
                  AND created_by IS NOT NULL
                  AND year = EXTRACT(YEAR FROM @start)::int
                  AND month = EXTRACT(MONTH FROM @start)::int
                GROUP BY created_by
            )
            SELECT u.user_id, u.full_name, u.role,
                   CASE WHEN u.role = 'Manager'
                        THEN (
                            SELECT COUNT(DISTINCT mo.order_id)
                            FROM public.orders mo
                            WHERE mo.company_id = @cid::uuid
                              AND mo.order_date BETWEEN @start AND @end
                        )
                        WHEN u.role = 'Staff_Warehouse'
                        THEN COALESCE(MAX(wa.task_count), 0)
                        WHEN u.role = 'Staff_Marketing'
                        THEN COALESCE(MAX(ma.activity_count), 0)
                        ELSE COUNT(DISTINCT o.order_id)
                   END AS order_count,
                   CASE WHEN u.role = 'Manager'
                        THEN (
                            SELECT COALESCE(SUM(mo.total_amount), 0)
                            FROM public.orders mo
                            WHERE mo.company_id = @cid::uuid
                              AND mo.order_date BETWEEN @start AND @end
                        )
                        WHEN u.role = 'Staff_Marketing'
                        THEN COALESCE(MAX(ma.spend_amount), 0)
                        WHEN u.role = 'Staff_Warehouse'
                        THEN COALESCE(MAX(wa.activity_value), 0)
                        ELSE COALESCE(SUM(o.total_amount), 0)
                   END AS revenue,
                   CASE WHEN u.role = 'Manager'
                        THEN (
                            SELECT COUNT(DISTINCT mc.customer_id)
                            FROM public.customers mc
                            WHERE mc.company_id = @cid::uuid
                              AND COALESCE(mc.first_order_at, mc.created_at) BETWEEN @start AND @end
                        )
                        WHEN u.role = 'Staff_Marketing'
                        THEN COALESCE(MAX(ma.channel_count), 0)
                        WHEN u.role = 'Staff_Warehouse'
                        THEN COALESCE(MAX(wa.document_count), 0)
                        ELSE COUNT(DISTINCT CASE
                            WHEN COALESCE(c.first_order_at, c.created_at) BETWEEN @start AND @end THEN c.customer_id
                        END)
                   END AS new_customers,
                   t.revenue_target,
                   t.order_count_target,
                   t.new_customer_target
            FROM public.users u
            LEFT JOIN public.orders o
                ON o.created_by_user_id = u.user_id
               AND o.order_date BETWEEN @start AND @end
               AND o.company_id = @cid::uuid
            LEFT JOIN public.customers c
                ON c.customer_id = o.customer_id
               AND c.company_id = @cid::uuid
            LEFT JOIN warehouse_actuals wa ON wa.user_id = u.user_id
            LEFT JOIN marketing_actuals ma ON ma.user_id = u.user_id
            LEFT JOIN public.staff_kpi_targets t
                ON t.user_id     = u.user_id
               AND t.period_type = 'MONTHLY'
               AND t.period_start = DATE_TRUNC('month', @start)
            WHERE u.company_id = @cid::uuid
              AND u.is_active   = TRUE
              AND u.role IN ('Manager','Staff','Staff_Sales','Staff_Warehouse','Staff_Marketing')
            GROUP BY u.user_id, u.full_name, u.role,
                     t.revenue_target, t.order_count_target, t.new_customer_target
            ORDER BY revenue DESC, order_count DESC
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("cid",   tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("start", start);
        cmd.Parameters.AddWithValue("end",   end);

        await using var r = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await r.ReadAsync())
        {
            var orderCount   = (long)r.GetInt64(3);
            var revenue      = r.GetDecimal(4);
            var newCustomers = (long)r.GetInt64(5);
            var revTarget    = r.IsDBNull(6) ? (decimal?)null : r.GetDecimal(6);
            var ordTarget    = r.IsDBNull(7) ? (int?)null    : r.GetInt32(7);
            var custTarget   = r.IsDBNull(8) ? (int?)null    : r.GetInt32(8);

            double? revPct  = revTarget  is > 0 ? Math.Round((double)(revenue / revTarget.Value * 100), 1) : null;
            double? ordPct  = ordTarget  is > 0 ? Math.Round((double)(orderCount / (double)ordTarget.Value * 100), 1) : null;
            double? custPct = custTarget is > 0 ? Math.Round((double)(newCustomers / (double)custTarget.Value * 100), 1) : null;
            var validPcts = new[] { revPct, ordPct, custPct }.Where(x => x.HasValue).Select(x => x!.Value).ToList();
            double? overallPct = validPcts.Count > 0 ? Math.Round(validPcts.Average(), 1) : null;
            bool hasAnyTarget = revTarget.HasValue || ordTarget.HasValue || custTarget.HasValue;
            bool isKpiAchieved = hasAnyTarget && validPcts.Count > 0 && validPcts.All(p => p >= 100.0);

            list.Add(new
            {
                userId         = r.GetInt32(0),
                fullName       = r.GetString(1),
                role           = r.GetString(2),
                orderCount,
                revenue,
                newCustomers,
                revTarget,
                ordTarget,
                custTarget,
                revenuePct     = revPct,
                orderPct       = ordPct,
                customerPct    = custPct,
                overallPct,
                kpiPercent     = overallPct,
                hasAnyTarget,
                isKpiAchieved,
            });
        }

        return Ok(new { period = start.ToString("yyyy-MM"), staff = list });
    }

    /// <summary>POST /api/admin/staff/kpi/targets — Đặt KPI target cho nhân viên</summary>
    [HttpPost("staff/kpi/targets")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> SetKpiTarget([FromBody] SetKpiTargetDto dto)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var start = new DateTime(dto.Year, dto.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var end   = start.AddMonths(1).AddSeconds(-1);

        await using var cmd = new NpgsqlCommand("""
            INSERT INTO public.staff_kpi_targets
                (company_id, user_id, period_type, period_start, period_end,
                 revenue_target, order_count_target, new_customer_target, created_at, updated_at)
            VALUES
                (@cid::uuid, @uid, 'MONTHLY', @start, @end,
                 @rev, @ord, @cust, NOW(), NOW())
            ON CONFLICT (user_id, period_start, period_type) DO UPDATE SET
                revenue_target      = EXCLUDED.revenue_target,
                order_count_target  = EXCLUDED.order_count_target,
                new_customer_target = EXCLUDED.new_customer_target,
                updated_at          = NOW()
            """, conn);
        cmd.Parameters.AddWithValue("cid",   tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("uid",   dto.UserId);
        cmd.Parameters.AddWithValue("start", start);
        cmd.Parameters.AddWithValue("end",   end);
        cmd.Parameters.AddWithValue("rev",   (object?)dto.RevenueTarget    ?? DBNull.Value);
        cmd.Parameters.AddWithValue("ord",   (object?)dto.OrderCountTarget  ?? DBNull.Value);
        cmd.Parameters.AddWithValue("cust",  (object?)dto.NewCustomerTarget ?? DBNull.Value);

        await cmd.ExecuteNonQueryAsync();

        // Gửi email thông báo KPI cho nhân viên (fire-and-forget, không block)
        if (dto.NotifyEmail)
        {
            var staffUser = await db.Users.FindAsync(dto.UserId);
            if (staffUser != null && !string.IsNullOrEmpty(staffUser.Email))
            {
                var companyName = (await db.Set<SalesAnalytics.Core.Entities.Company>()
                    .FirstOrDefaultAsync(c => c.Id == tenant.CompanyId))?.Name ?? "Công ty";
                _ = email.SendKpiNotificationAsync(
                    staffUser.Email, staffUser.FullName ?? staffUser.Email,
                    companyName, dto.Year, dto.Month,
                    dto.RevenueTarget, dto.OrderCountTarget, dto.NewCustomerTarget,
                    dto.Note);
            }
        }

        return Ok(new { message = "Đã lưu KPI target." + (dto.NotifyEmail ? " Đã gửi email thông báo cho nhân viên." : "") });
    }

    // ── GET /api/admin/customers/{id}/history ──────────────────────────────────
    /// <summary>Lịch sử mua hàng KH (online + offline)</summary>
    [HttpGet("customers/{id}/history")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
    public async Task<IActionResult> GetCustomerHistory(
        int id,
        [FromQuery] int page = 1,
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to = null)
    {
        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        var sql = """
            SELECT o.order_id, o.order_code, o.order_date, o.status,
                   o.total_amount, o.payment_method, o.shipping_status,
                   sc.channel_name, sc.channel_type
            FROM public.orders o
            JOIN public.sales_channels sc ON sc.channel_id = o.channel_id
            WHERE o.customer_id  = @cid
              AND o.company_id   = @companyId::uuid
              AND (@from IS NULL OR o.order_date::date >= @from::date)
              AND (@to   IS NULL OR o.order_date::date <= @to::date)
            ORDER BY o.order_date DESC
            LIMIT 20 OFFSET @offset
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("cid",       id);
        cmd.Parameters.AddWithValue("companyId", tenant.CompanyId!.Value.ToString());
        cmd.Parameters.AddWithValue("offset",    (page - 1) * 20);
        cmd.Parameters.Add(new NpgsqlParameter("from", NpgsqlTypes.NpgsqlDbType.Text) { Value = from.HasValue ? from.Value.ToString("yyyy-MM-dd") : DBNull.Value });
        cmd.Parameters.Add(new NpgsqlParameter("to",   NpgsqlTypes.NpgsqlDbType.Text) { Value = to.HasValue   ? to.Value.ToString("yyyy-MM-dd")   : DBNull.Value });

        await using var r = await cmd.ExecuteReaderAsync();
        var orders = new List<object>();
        while (await r.ReadAsync())
        {
            orders.Add(new
            {
                orderId       = r.GetInt32(0),
                orderCode     = r.GetString(1),
                orderDate     = r.GetDateTime(2),
                status        = r.GetString(3),
                totalAmount   = r.GetDecimal(4),
                paymentMethod = r.IsDBNull(5) ? null : r.GetString(5),
                shippingStatus= r.GetString(6),
                channelName   = r.IsDBNull(7) ? null : r.GetString(7),
                channelType   = r.IsDBNull(8) ? null : r.GetString(8),
            });
        }
        return Ok(new { customerId = id, page, orders });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHẦN 5 – [SA] Platform Analytics & Usage Monitor
    // ══════════════════════════════════════════════════════════════════════════

    /// <summary>[SA] Thống kê nền tảng — tổng công ty, phân bổ gói, tăng trưởng theo tháng</summary>
    [HttpGet("sa/analytics")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetPlatformAnalytics()
    {
        var totalCompanies   = await db.Companies.CountAsync();
        var activeCompanies  = await db.Companies.CountAsync(c => c.IsActive);
        var totalUsers       = await db.Users.CountAsync(u => u.IsActive);
        var activeUsers      = await db.Users.CountAsync(u => u.IsActive);

        var subscriptions    = await db.Subscriptions.ToListAsync();
        var byPlan = new
        {
            free       = subscriptions.Count(s => s.Plan == "free"),
            pro        = subscriptions.Count(s => s.Plan == "pro"),
            enterprise = subscriptions.Count(s => s.Plan == "enterprise"),
        };
        var proSubscriptions  = byPlan.pro + byPlan.enterprise;
        var trialCompanies    = subscriptions.Count(s => s.Status == "trial");
        var expiredCompanies  = subscriptions.Count(s => s.Status == "expired");

        // Tăng trưởng công ty mới theo tháng (6 tháng gần nhất)
        var sixMonthsAgo = DateTime.UtcNow.AddMonths(-5);
        var monthlyGrowthRaw = await db.Companies
            .Where(c => c.CreatedAt >= sixMonthsAgo)
            .GroupBy(c => new { c.CreatedAt.Year, c.CreatedAt.Month })
            .Select(g => new { g.Key.Year, g.Key.Month, Count = g.Count() })
            .OrderBy(r => r.Year).ThenBy(r => r.Month)
            .ToListAsync();
        var monthlyGrowth = monthlyGrowthRaw.Select(r => new
        {
            month        = $"{r.Year}-{r.Month:D2}",
            newCompanies = r.Count,
        }).ToList();

        return Ok(new
        {
            totalCompanies, activeCompanies, trialCompanies, expiredCompanies,
            totalUsers, activeUsers, proSubscriptions,
            byPlan, monthlyGrowth,
        });
    }

    /// <summary>[SA] Giám sát sử dụng — mức dùng kênh & user theo từng công ty</summary>
    [HttpGet("sa/usage")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetUsageMonitor(
        [FromQuery] string? search   = null,
        [FromQuery] int     page     = 1,
        [FromQuery] int     pageSize = 20)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var query = db.Companies.AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(c => c.Name.Contains(search) || c.Email.Contains(search));

        var total = await query.CountAsync();

        var companies = await query
            .OrderBy(c => c.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new { companyId = c.Id, companyName = c.Name, companyEmail = c.Email })
            .ToListAsync();

        var companyIds = companies.Select(c => c.companyId).ToList();

        var subs = await db.Subscriptions
            .Where(s => companyIds.Contains(s.CompanyId))
            .Select(s => new { s.CompanyId, s.Plan, s.Status, s.ExpiresAt, s.MaxChannels, s.MaxUsers })
            .ToListAsync();

        var userCounts = await db.Users
            .Where(u => u.CompanyId.HasValue && companyIds.Contains(u.CompanyId.Value) && u.IsActive)
            .GroupBy(u => u.CompanyId!.Value)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToListAsync();

        // Channel count từ raw SQL (không có DbSet<SalesChannel>)
        var channelCountMap = new Dictionary<Guid, int>();
        await using var conn2 = new NpgsqlConnection(_connStr);
        await conn2.OpenAsync();
        await using var cmd2 = new NpgsqlCommand(
            "SELECT company_id, COUNT(*) FROM public.sales_channels WHERE is_active = TRUE GROUP BY company_id", conn2);
        await using var r2 = await cmd2.ExecuteReaderAsync();
        while (await r2.ReadAsync())
            channelCountMap[r2.GetGuid(0)] = (int)r2.GetInt64(1);

        var result = companies.Select(c =>
        {
            var sub   = subs.FirstOrDefault(s => s.CompanyId == c.companyId);
            var users = userCounts.FirstOrDefault(u => u.CompanyId == c.companyId)?.Count ?? 0;
            channelCountMap.TryGetValue(c.companyId, out var chans);
            return new
            {
                c.companyId, c.companyName, c.companyEmail,
                plan         = sub?.Plan    ?? "free",
                status       = sub?.Status  ?? "active",
                expiresAt    = sub?.ExpiresAt,
                maxChannels  = sub?.MaxChannels ?? 1,
                maxUsers     = sub?.MaxUsers    ?? 3,
                channelsUsed = chans,
                usersCount   = users,
            };
        });

        return Ok(new { data = result, total, page, pageSize,
            totalPages = (int)Math.Ceiling((double)total / pageSize) });
    }

    /// <summary>[SA] Cấu hình mặc định theo gói — dùng cho frontend auto-fill form</summary>
    [HttpGet("sa/plan-configs")]
    [RequireSuperAdmin]
    public IActionResult GetPlanConfigs()
    {
        return Ok(new object[]
        {
            new { planName = "free",       maxChannels = 1,  maxUsers = 3,  price = 0,      features = new[] { "1 kênh bán hàng", "3 người dùng", "Import CSV/Excel", "Dashboard cơ bản" } },
            new { planName = "pro",        maxChannels = 5,  maxUsers = 20, price = 499000, features = new[] { "5 kênh bán hàng", "20 người dùng", "AI dự báo & anomaly", "Báo cáo nâng cao", "Export PDF" } },
            new { planName = "enterprise", maxChannels = -1, maxUsers = -1, price = -1,     features = new[] { "Kênh không giới hạn", "Người dùng không giới hạn", "Tất cả tính năng AI", "SLA ưu tiên", "Tùy chỉnh theo yêu cầu" } },
        });
    }
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
    bool?   IsActive,
    bool    NotifyEmail = false
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

public record SetKpiTargetDto(
    int       UserId,
    int       Year,
    int       Month,
    decimal?  RevenueTarget,
    int?      OrderCountTarget,
    int?      NewCustomerTarget,
    bool      NotifyEmail = false,
    string?   Note        = null
);
