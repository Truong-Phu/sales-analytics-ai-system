using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("auth")]   // 5 req/phút/IP – chống brute-force
public class AuthController : ControllerBase
{
    private readonly AuthService      _authService;
    private readonly IAuditLogService _audit;

    public AuthController(AuthService authService, IAuditLogService audit)
    {
        _authService = authService;
        _audit       = audit;
    }

    /// <summary>Đăng nhập – trả về Access Token + Refresh Token</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString();
        var result    = await _authService.LoginAsync(req, ip, userAgent);
        if (result is null)
        {
            await _audit.LogAsync(
                userId: null, username: req.Username ?? "",
                action: "LOGIN", entityType: "User",
                status: "FAILED", errorMessage: "Sai tên đăng nhập hoặc mật khẩu",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

            return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không đúng." });
        }

        await _audit.LogAsync(
            userId: result.UserId, username: result.Username,
            action: "LOGIN", entityType: "User", entityId: result.UserId.ToString(),
            status: "SUCCESS",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(result);
    }

    /// <summary>Đăng ký tài khoản mới (chờ Admin phê duyệt)</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var (success, message) = await _authService.RegisterAsync(req);
        if (!success) return BadRequest(new { message });
        return Ok(new { message });
    }

    /// <summary>Làm mới Access Token bằng Refresh Token</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var result = await _authService.RefreshAsync(req.RefreshToken);
        if (result is null)
            return Unauthorized(new { message = "Refresh token không hợp lệ hoặc đã hết hạn." });

        return Ok(result);
    }

    /// <summary>Đổi mật khẩu (yêu cầu đăng nhập)</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
    {
        var userId   = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var username = User.FindFirstValue(ClaimTypes.Name) ?? "";
        var result   = await _authService.ChangePasswordAsync(userId, req);

        if (!result)
        {
            await _audit.LogAsync(
                userId: userId, username: username,
                action: "CHANGE_PASSWORD", entityType: "User", entityId: userId.ToString(),
                status: "FAILED", errorMessage: "Mật khẩu cũ không đúng",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

            return BadRequest(new { message = "Mật khẩu cũ không đúng." });
        }

        await _audit.LogAsync(
            userId: userId, username: username,
            action: "CHANGE_PASSWORD", entityType: "User", entityId: userId.ToString(),
            status: "SUCCESS",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { message = "Đổi mật khẩu thành công." });
    }
}
