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

    /// <summary>
    /// Đăng ký tài khoản Owner mới – tạo Company + User + Subscription Free.
    /// Tự động đăng nhập và trả về JWT sau khi tạo thành công.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] OwnerRegisterRequest req)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { success = false, message = "Dữ liệu không hợp lệ.", errors = ModelState });

        var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString();

        try
        {
            var (success, message, response) = await _authService.RegisterOwnerAsync(req, ip, userAgent);
            if (!success)
                return BadRequest(new { success = false, message });

            await _audit.LogAsync(
                userId: response!.UserId, username: response.Username,
                action: "REGISTER", entityType: "User",
                entityId: response.UserId.ToString(), status: "SUCCESS",
                ipAddress: ip, userAgent: userAgent);

            return Ok(new { success = true, message, data = response });
        }
        catch
        {
            return StatusCode(500, new { success = false, message = "Lỗi hệ thống. Vui lòng thử lại." });
        }
    }

    /// <summary>Đăng nhập – hỗ trợ Email hoặc Username, trả về JWT + thông tin tenant</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) && string.IsNullOrWhiteSpace(req.Username))
            return BadRequest(new { success = false, message = "Vui lòng cung cấp Email hoặc Tên đăng nhập." });

        var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString();

        AuthResponse? result;
        try
        {
            result = await _authService.LoginAsync(req, ip, userAgent);
        }
        catch (InvalidOperationException ex) when (ex.Message.StartsWith("COMPANY_LOCKED:"))
        {
            var reason = ex.Message["COMPANY_LOCKED:".Length..];
            return StatusCode(403, new { success = false, message = "Công ty đã bị khóa. " + reason });
        }

        if (result is null)
        {
            await _audit.LogAsync(
                userId: null, username: req.Username ?? req.Email ?? "",
                action: "LOGIN", entityType: "User",
                status: "FAILED", errorMessage: "Sai tên đăng nhập hoặc mật khẩu",
                ipAddress: ip, userAgent: userAgent);

            return Unauthorized(new { success = false, message = "Tên đăng nhập hoặc mật khẩu không đúng." });
        }

        await _audit.LogAsync(
            userId: result.UserId, username: result.Username,
            action: "LOGIN", entityType: "User", entityId: result.UserId.ToString(),
            status: "SUCCESS", ipAddress: ip, userAgent: userAgent);

        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Đăng nhập Super Admin – chỉ cho phép tài khoản có is_super_admin=TRUE.
    /// Trả về JWT với claim đặc biệt (không có company_id).
    /// </summary>
    [HttpPost("login/super-admin")]
    [AllowAnonymous]
    public async Task<IActionResult> LoginSuperAdmin([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) && string.IsNullOrWhiteSpace(req.Username))
            return BadRequest(new { success = false, message = "Vui lòng cung cấp Email hoặc Tên đăng nhập." });

        var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString();
        var result    = await _authService.LoginSuperAdminAsync(req, ip, userAgent);

        if (result is null)
            return Unauthorized(new { success = false, message = "Thông tin không đúng hoặc tài khoản không có quyền Super Admin." });

        await _audit.LogAsync(
            userId: result.UserId, username: result.Username,
            action: "LOGIN_SUPER_ADMIN", entityType: "User", entityId: result.UserId.ToString(),
            status: "SUCCESS", ipAddress: ip, userAgent: userAgent);

        return Ok(new { success = true, data = result });
    }

    /// <summary>Làm mới Access Token bằng Refresh Token</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest req)
    {
        var result = await _authService.RefreshAsync(req.RefreshToken);
        if (result is null)
            return Unauthorized(new { success = false, message = "Refresh token không hợp lệ hoặc đã hết hạn." });

        return Ok(new { success = true, data = result });
    }

    /// <summary>Yêu cầu reset mật khẩu — gửi token qua email (hoặc log nếu là dev)</summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { success = false, message = "Email không hợp lệ." });

        // Luôn trả về success để tránh email enumeration attack
        var user = await _authService.InitiatePasswordResetAsync(req.Email);

        if (user != null)
        {
            // DEV mode: trả về token trong response (không cần SMTP thật)
            var isDev = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development";
            if (isDev)
            {
                var token = await _authService.GetResetTokenAsync(req.Email);
                return Ok(new
                {
                    success = true,
                    message = "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn.",
                    devToken = token   // Chỉ trả về trong Development!
                });
            }
        }

        return Ok(new { success = true, message = "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn." });
    }

    /// <summary>Kiểm tra token reset có hợp lệ không</summary>
    [HttpPost("verify-reset-token")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyResetToken([FromBody] VerifyResetTokenRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Token))
            return BadRequest(new { success = false });

        var valid = await _authService.VerifyResetTokenAsync(req.Email, req.Token);
        return Ok(new { success = valid });
    }

    /// <summary>Đặt mật khẩu mới sau khi verify token</summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
    {
        if (req.NewPassword != req.ConfirmPassword)
            return BadRequest(new { success = false, message = "Mật khẩu xác nhận không khớp." });

        var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = HttpContext.Request.Headers["User-Agent"].ToString();

        var (success, message) = await _authService.ResetPasswordAsync(req);

        if (!success)
            return BadRequest(new { success = false, message });

        // Ghi audit log
        var user = await _authService.GetUserByEmailAsync(req.Email);
        if (user != null)
            await _audit.LogAsync(
                userId: user.Id, username: user.Username,
                action: "RESET_PASSWORD", entityType: "User", entityId: user.Id.ToString(),
                status: "SUCCESS", ipAddress: ip, userAgent: userAgent);

        return Ok(new { success = true, message });
    }

#if DEBUG
    /// <summary>[DEV ONLY] Tạo PBKDF2 hash cho mật khẩu — dùng để sửa password_hash trong DB khi debug</summary>
    [HttpGet("debug/hash")]
    [AllowAnonymous]
    public IActionResult GetHash([FromQuery] string pwd)
    {
        if (string.IsNullOrWhiteSpace(pwd))
            return BadRequest(new { message = "Cần truyền ?pwd=..." });

        // Dùng cùng thuật toán PBKDF2+SHA256 100k iterations với AuthService
        var salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(16);
        var hash = System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2(
            System.Text.Encoding.UTF8.GetBytes(pwd), salt,
            iterations: 100_000,
            System.Security.Cryptography.HashAlgorithmName.SHA256,
            outputLength: 32
        );
        var passwordHash = $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
        return Ok(new { pwd, passwordHash });
    }
#endif

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

            return BadRequest(new { success = false, message = "Mật khẩu cũ không đúng." });
        }

        await _audit.LogAsync(
            userId: userId, username: username,
            action: "CHANGE_PASSWORD", entityType: "User", entityId: userId.ToString(),
            status: "SUCCESS",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Đổi mật khẩu thành công." });
    }
}
