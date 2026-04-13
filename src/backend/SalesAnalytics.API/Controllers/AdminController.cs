using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>Quản trị user – chỉ Admin mới truy cập được</summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;

    public AdminController(AppDbContext db) => _db = db;

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
        return Ok(new { message = $"Đã khóa tài khoản {user.Username}." });
    }

    /// <summary>Đổi role người dùng</summary>
    [HttpPatch("users/{id}/role")]
    public async Task<IActionResult> ChangeRole(int id, [FromBody] ChangeRoleRequest req)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();
        if (!Enum.TryParse<UserRole>(req.Role, true, out var role))
            return BadRequest(new { message = "Role không hợp lệ." });

        user.Role = role;
        await _db.SaveChangesAsync();
        return Ok(new { message = $"Đã đổi role của {user.Username} thành {role}." });
    }
}

public record ChangeRoleRequest([System.ComponentModel.DataAnnotations.Required] string Role);
