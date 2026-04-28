using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

public class AuthService
{
    private readonly AppDbContext _db;
    private readonly JwtService   _jwt;
    private readonly IConfiguration _config;

    public AuthService(AppDbContext db, JwtService jwt, IConfiguration config)
    {
        _db     = db;
        _jwt    = jwt;
        _config = config;
    }

    /// <summary>Đăng nhập – trả về AuthResponse hoặc null nếu thông tin sai</summary>
    public async Task<AuthResponse?> LoginAsync(LoginRequest req)
    {
        var user = await _db.Users
            .FirstOrDefaultAsync(u => u.Username == req.Username && u.IsActive);

        if (user is null || !VerifyPassword(req.Password, user.PasswordHash))
            return null;

        return await IssueTokensAsync(user);
    }

    /// <summary>Đăng ký tài khoản mới (chờ Admin phê duyệt)</summary>
    public async Task<(bool Success, string Message)> RegisterAsync(RegisterRequest req)
    {
        if (await _db.Users.AnyAsync(u => u.Username == req.Username))
            return (false, "Tên đăng nhập đã tồn tại.");

        if (await _db.Users.AnyAsync(u => u.Email == req.Email))
            return (false, "Email đã được sử dụng.");

        var user = new User
        {
            Username     = req.Username,
            Email        = req.Email,
            FullName     = req.FullName,
            PasswordHash = HashPassword(req.Password),
            Role         = UserRole.Staff,
            IsActive     = false,   // Chờ Admin phê duyệt
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return (true, "Đăng ký thành công. Vui lòng chờ Admin phê duyệt tài khoản.");
    }

    /// <summary>Refresh Access Token bằng Refresh Token còn hiệu lực</summary>
    public async Task<AuthResponse?> RefreshAsync(string refreshToken)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u =>
            u.RefreshToken == refreshToken &&
            u.RefreshTokenExpiresAt > DateTime.UtcNow &&
            u.IsActive
        );

        if (user is null) return null;
        return await IssueTokensAsync(user);
    }

    /// <summary>Đổi mật khẩu</summary>
    public async Task<bool> ChangePasswordAsync(int userId, ChangePasswordRequest req)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null || !VerifyPassword(req.OldPassword, user.PasswordHash))
            return false;

        user.PasswordHash     = HashPassword(req.NewPassword);
        user.RefreshToken     = null;   // Bắt đăng nhập lại
        user.LastLoginAt      = null;
        await _db.SaveChangesAsync();
        return true;
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private async Task<AuthResponse> IssueTokensAsync(User user)
    {
        var accessToken  = _jwt.GenerateAccessToken(user);
        var refreshToken = _jwt.GenerateRefreshToken();
        var refreshDays  = int.Parse(_config["Jwt:RefreshTokenDays"] ?? "30");

        user.RefreshToken          = refreshToken;
        user.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(refreshDays);
        user.LastLoginAt           = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return new AuthResponse(
            AccessToken:  accessToken,
            RefreshToken: refreshToken,
            ExpiresAt:    DateTime.UtcNow.AddMinutes(
                double.Parse(_config["Jwt:AccessTokenMinutes"] ?? "60")
            ),
            Role:         user.Role.ToString(),
            FullName:     user.FullName,
            UserId:       user.Id,
            Username:     user.Username
        );
    }

    private static string HashPassword(string password)
    {
        // PBKDF2 + SHA256, 100,000 iterations
        var salt   = RandomNumberGenerator.GetBytes(16);
        var hash   = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt,
            iterations: 100_000, HashAlgorithmName.SHA256, outputLength: 32
        );
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    private static bool VerifyPassword(string password, string storedHash)
    {
        var parts = storedHash.Split('.');
        if (parts.Length != 2) return false;
        var salt = Convert.FromBase64String(parts[0]);
        var expected = Convert.FromBase64String(parts[1]);
        var actual   = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password), salt,
            iterations: 100_000, HashAlgorithmName.SHA256, outputLength: 32
        );
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
