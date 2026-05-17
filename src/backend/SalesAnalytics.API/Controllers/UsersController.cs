using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý thông tin cá nhân người dùng (self-service).
/// Mọi role đã đăng nhập đều có thể gọi — chỉ được cập nhật tài khoản của chính mình.
/// </summary>
[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<UsersController> _logger;

    public UsersController(AppDbContext db, IWebHostEnvironment env, ILogger<UsersController> logger)
    {
        _db     = db;
        _env    = env;
        _logger = logger;
    }

    private int CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    // ── GET /api/users/me ────────────────────────────────────────────────────
    /// <summary>Lấy thông tin cá nhân của chính mình.</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        try
        {
            var user = await _db.Users.FindAsync(CurrentUserId());
            if (user is null) return NotFound(new { message = "Không tìm thấy tài khoản." });

            return Ok(new
            {
                user.Id, user.Username, user.FullName, user.Email,
                Role     = user.Role.ToString(),
                user.IsActive, user.AvatarUrl, user.Phone,
                birthdate = user.Birthdate?.ToString("yyyy-MM-dd"),
                user.Timezone, user.LangPref, user.LastLoginAt,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy thông tin user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể tải thông tin tài khoản. Vui lòng thử lại." });
        }
    }

    // ── PATCH /api/users/profile ─────────────────────────────────────────────
    /// <summary>Cập nhật thông tin cá nhân (partial update).</summary>
    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
    {
        try
        {
            var user = await _db.Users.FindAsync(CurrentUserId());
            if (user is null) return NotFound(new { message = "Không tìm thấy tài khoản." });

            if (req.FullName  is not null) user.FullName  = req.FullName.Trim();
            if (req.Phone     is not null) user.Phone     = req.Phone.Trim();
            if (req.Timezone  is not null) user.Timezone  = req.Timezone;
            if (req.LangPref  is not null) user.LangPref  = req.LangPref;
            if (req.Birthdate is not null)
                user.Birthdate = DateOnly.TryParse(req.Birthdate, out var bd) ? bd : null;

            await _db.SaveChangesAsync();
            return Ok(new { message = "Đã cập nhật thông tin." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi cập nhật profile user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể lưu thông tin. Vui lòng thử lại." });
        }
    }

    // ── POST /api/users/avatar ───────────────────────────────────────────────
    /// <summary>Upload ảnh đại diện (PNG/JPG, max 2MB).</summary>
    [HttpPost("avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile avatar)
    {
        if (avatar is null || avatar.Length == 0)
            return BadRequest(new { message = "File không hợp lệ." });

        if (avatar.Length > 2 * 1024 * 1024)
            return BadRequest(new { message = "Ảnh tối đa 2MB." });

        var ext = Path.GetExtension(avatar.FileName).ToLowerInvariant();
        if (ext is not (".jpg" or ".jpeg" or ".png" or ".webp"))
            return BadRequest(new { message = "Chỉ chấp nhận JPG/PNG/WEBP." });

        try
        {
            var user = await _db.Users.FindAsync(CurrentUserId());
            if (user is null) return NotFound(new { message = "Không tìm thấy tài khoản." });

            var webRoot    = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var uploadsDir = Path.Combine(webRoot, "avatars");
            Directory.CreateDirectory(uploadsDir);
            var fileName  = $"user_{user.Id}_{DateTime.UtcNow.Ticks}{ext}";
            var filePath  = Path.Combine(uploadsDir, fileName);

            await using var stream = System.IO.File.Create(filePath);
            await avatar.CopyToAsync(stream);

            user.AvatarUrl = $"/avatars/{fileName}";
            await _db.SaveChangesAsync();

            return Ok(new { avatarUrl = user.AvatarUrl });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi upload avatar user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể lưu ảnh đại diện. Vui lòng thử lại." });
        }
    }

    // ── GET /api/users/login-history ────────────────────────────────────────
    /// <summary>Lịch sử đăng nhập gần đây (50 bản ghi mới nhất).</summary>
    [HttpGet("login-history")]
    public async Task<IActionResult> GetLoginHistory()
    {
        try
        {
            var history = await _db.LoginHistories
                .Where(l => l.UserId == CurrentUserId())
                .OrderByDescending(l => l.LoggedAt)
                .Take(50)
                .Select(l => new {
                    ip        = l.IpAddress,
                    userAgent = l.UserAgent,
                    time      = l.LoggedAt,
                    status    = l.Status
                })
                .ToListAsync();

            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy lịch sử đăng nhập user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể tải lịch sử đăng nhập. Vui lòng thử lại." });
        }
    }

    // ── POST /api/users/logout-all ───────────────────────────────────────────
    /// <summary>Đăng xuất tất cả thiết bị (xóa refresh token).</summary>
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll()
    {
        try
        {
            var user = await _db.Users.FindAsync(CurrentUserId());
            if (user is null) return NotFound(new { message = "Không tìm thấy tài khoản." });

            user.RefreshToken          = null;
            user.RefreshTokenExpiresAt = null;
            await _db.SaveChangesAsync();

            return Ok(new { message = "Đã đăng xuất tất cả thiết bị." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi logout-all user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể thực hiện đăng xuất. Vui lòng thử lại." });
        }
    }

    // ── GET /api/users/notification-preferences ─────────────────────────────
    /// <summary>Lấy tùy chọn thông báo.</summary>
    [HttpGet("notification-preferences")]
    public async Task<IActionResult> GetNotifPrefs()
    {
        try
        {
            var prefs = await _db.NotificationPreferences
                .FirstOrDefaultAsync(n => n.UserId == CurrentUserId());

            if (prefs is null)
                return Ok(new { emailNotify = true, anomalyAlert = true, dailyReport = false, weeklyReport = true });

            return Ok(new {
                emailNotify  = prefs.EmailNotify,
                anomalyAlert = prefs.AnomalyAlert,
                dailyReport  = prefs.DailyReport,
                weeklyReport = prefs.WeeklyReport,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy notification prefs user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể tải tùy chọn thông báo. Vui lòng thử lại." });
        }
    }

    // ── PUT /api/users/notification-preferences ──────────────────────────────
    /// <summary>Cập nhật tùy chọn thông báo.</summary>
    [HttpPut("notification-preferences")]
    public async Task<IActionResult> UpdateNotifPrefs([FromBody] NotifPrefsRequest req)
    {
        try
        {
            var prefs = await _db.NotificationPreferences
                .FirstOrDefaultAsync(n => n.UserId == CurrentUserId());

            if (prefs is null)
            {
                _db.NotificationPreferences.Add(new SalesAnalytics.Core.Entities.NotificationPreference
                {
                    UserId       = CurrentUserId(),
                    EmailNotify  = req.EmailNotify,
                    AnomalyAlert = req.AnomalyAlert,
                    DailyReport  = req.DailyReport,
                    WeeklyReport = req.WeeklyReport,
                    UpdatedAt    = DateTime.UtcNow,
                });
            }
            else
            {
                prefs.EmailNotify  = req.EmailNotify;
                prefs.AnomalyAlert = req.AnomalyAlert;
                prefs.DailyReport  = req.DailyReport;
                prefs.WeeklyReport = req.WeeklyReport;
                prefs.UpdatedAt    = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            return Ok(new { message = "Đã lưu tùy chọn thông báo." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lưu notification prefs user id={Id}", CurrentUserId());
            return StatusCode(503, new { message = "Không thể lưu tùy chọn thông báo. Vui lòng thử lại." });
        }
    }
}

public record UpdateProfileRequest(
    string? FullName,
    string? Phone,
    string? Birthdate,
    string? Timezone,
    string? LangPref
);

public record NotifPrefsRequest(
    bool EmailNotify,
    bool AnomalyAlert,
    bool DailyReport,
    bool WeeklyReport
);
