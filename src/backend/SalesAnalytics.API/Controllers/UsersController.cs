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

    public UsersController(AppDbContext db, IWebHostEnvironment env)
    {
        _db  = db;
        _env = env;
    }

    private int CurrentUserId() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    // ── GET /api/users/me ────────────────────────────────────────────────────
    /// <summary>Lấy thông tin cá nhân của chính mình.</summary>
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var user = await _db.Users.FindAsync(CurrentUserId());
        if (user is null) return NotFound();

        return Ok(new
        {
            user.Id, user.Username, user.FullName, user.Email,
            Role     = user.Role.ToString(),
            user.IsActive, user.AvatarUrl, user.Phone,
            birthdate = user.Birthdate?.ToString("yyyy-MM-dd"),
            user.Timezone, user.LangPref, user.LastLoginAt,
        });
    }

    // ── PATCH /api/users/profile ─────────────────────────────────────────────
    /// <summary>Cập nhật thông tin cá nhân (partial update).</summary>
    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
    {
        var user = await _db.Users.FindAsync(CurrentUserId());
        if (user is null) return NotFound();

        if (req.FullName  is not null) user.FullName  = req.FullName.Trim();
        if (req.Phone     is not null) user.Phone     = req.Phone.Trim();
        if (req.Timezone  is not null) user.Timezone  = req.Timezone;
        if (req.LangPref  is not null) user.LangPref  = req.LangPref;
        if (req.Birthdate is not null)
            user.Birthdate = DateOnly.TryParse(req.Birthdate, out var bd) ? bd : null;

        await _db.SaveChangesAsync();
        return Ok(new { message = "Đã cập nhật thông tin." });
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
        if (ext is not (".jpg" or ".jpeg" or ".png"))
            return BadRequest(new { message = "Chỉ chấp nhận JPG/PNG." });

        var user = await _db.Users.FindAsync(CurrentUserId());
        if (user is null) return NotFound();

        // Lưu file vào wwwroot/avatars/
        var uploadsDir = Path.Combine(_env.WebRootPath ?? "wwwroot", "avatars");
        Directory.CreateDirectory(uploadsDir);
        var fileName  = $"user_{user.Id}_{DateTime.UtcNow.Ticks}{ext}";
        var filePath  = Path.Combine(uploadsDir, fileName);

        await using var stream = System.IO.File.Create(filePath);
        await avatar.CopyToAsync(stream);

        user.AvatarUrl = $"/avatars/{fileName}";
        await _db.SaveChangesAsync();

        return Ok(new { avatarUrl = user.AvatarUrl });
    }

    // ── GET /api/users/login-history ────────────────────────────────────────
    /// <summary>Lịch sử đăng nhập gần đây (mock — chưa có bảng login_history).</summary>
    [HttpGet("login-history")]
    public IActionResult GetLoginHistory()
    {
        // TODO: Tạo bảng login_history và ghi khi đăng nhập
        var mock = new[]
        {
            new { ip = "14.225.10.xxx", device = "Chrome / Windows 11", time = DateTime.UtcNow.AddHours(-1).ToString("O"), status = "success" },
            new { ip = "14.225.10.xxx", device = "Chrome / Windows 11", time = DateTime.UtcNow.AddDays(-1).ToString("O"),  status = "success" },
        };
        return Ok(mock);
    }

    // ── POST /api/users/logout-all ───────────────────────────────────────────
    /// <summary>Đăng xuất tất cả thiết bị (xóa refresh token).</summary>
    [HttpPost("logout-all")]
    public async Task<IActionResult> LogoutAll()
    {
        var user = await _db.Users.FindAsync(CurrentUserId());
        if (user is null) return NotFound();

        user.RefreshToken          = null;
        user.RefreshTokenExpiresAt = null;
        await _db.SaveChangesAsync();

        return Ok(new { message = "Đã đăng xuất tất cả thiết bị." });
    }

    // ── PATCH /api/users/notification-preferences ───────────────────────────
    /// <summary>Lưu tùy chọn thông báo (lưu tạm theo session, cần bảng notification_preferences).</summary>
    [HttpPatch("notification-preferences")]
    public IActionResult UpdateNotifPrefs([FromBody] NotifPrefsRequest req)
    {
        // TODO: Tạo bảng notification_preferences và persist
        return Ok(new { message = "Đã lưu tùy chọn thông báo.", saved = req });
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
