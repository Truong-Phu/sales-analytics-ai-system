using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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
    public async Task<AuthResponse?> LoginAsync(
        LoginRequest req,
        string? ipAddress = null,
        string? userAgent = null)
    {
        // Tìm user theo email (ưu tiên) hoặc username
        User? user = null;
        if (!string.IsNullOrWhiteSpace(req.Email))
            user = await _db.Users
                .Include(u => u.Company)
                .FirstOrDefaultAsync(u => u.Email == req.Email && u.IsActive);
        if (user is null && !string.IsNullOrWhiteSpace(req.Username))
            user = await _db.Users
                .Include(u => u.Company)
                .FirstOrDefaultAsync(u => u.Username == req.Username && u.IsActive);

        if (user is null || !VerifyPassword(req.Password, user.PasswordHash))
        {
            if (user is not null)
                await RecordLoginHistoryAsync(user.Id, ipAddress, userAgent, "FAILED");
            return null;
        }

        // Kiểm tra công ty có bị khóa không
        if (user.Company is not null && !user.Company.IsActive)
        {
            await RecordLoginHistoryAsync(user.Id, ipAddress, userAgent, "FAILED");
            throw new InvalidOperationException("COMPANY_LOCKED:" + (user.Company.LockReason ?? "Công ty đã bị khóa"));
        }

        var result = await IssueTokensAsync(user);
        await RecordLoginHistoryAsync(user.Id, ipAddress, userAgent, "SUCCESS");
        return result;
    }

    /// <summary>
    /// Đăng nhập Super Admin – chỉ cho phép user có is_super_admin=TRUE.
    /// Trả về JWT với claim đặc biệt (không có company_id).
    /// </summary>
    public async Task<AuthResponse?> LoginSuperAdminAsync(
        LoginRequest req,
        string? ipAddress = null,
        string? userAgent = null)
    {
        User? user = null;
        if (!string.IsNullOrWhiteSpace(req.Email))
            user = await _db.Users.FirstOrDefaultAsync(
                u => u.Email == req.Email && u.IsActive && u.IsSuperAdmin);
        if (user is null && !string.IsNullOrWhiteSpace(req.Username))
            user = await _db.Users.FirstOrDefaultAsync(
                u => u.Username == req.Username && u.IsActive && u.IsSuperAdmin);

        if (user is null || !VerifyPassword(req.Password, user.PasswordHash))
        {
            if (user is not null)
                await RecordLoginHistoryAsync(user.Id, ipAddress, userAgent, "FAILED");
            return null;
        }

        var result = await IssueTokensAsync(user);
        await RecordLoginHistoryAsync(user.Id, ipAddress, userAgent, "SUCCESS");
        return result;
    }

    /// <summary>
    /// Đăng ký Owner mới: tạo Company + User + Subscription Free trong 1 transaction.
    /// Tự động đăng nhập sau khi tạo thành công.
    /// </summary>
    public async Task<(bool Success, string Message, AuthResponse? Response)>
        RegisterOwnerAsync(OwnerRegisterRequest req, string? ipAddress = null, string? userAgent = null)
    {
        // Validate
        if (!req.AgreedToTerms)
            return (false, "Bạn phải đồng ý với điều khoản dịch vụ.", null);

        if (req.Password != req.ConfirmPassword)
            return (false, "Mật khẩu xác nhận không khớp.", null);

        if (await _db.Users.AnyAsync(u => u.Email == req.Email))
            return (false, "Email đã được sử dụng.", null);

        // Tạo slug từ tên công ty (unique)
        var baseSlug = GenerateSlug(req.CompanyName);
        var slug     = baseSlug;
        var counter  = 1;
        while (await _db.Companies.AnyAsync(c => c.Slug == slug))
            slug = $"{baseSlug}-{counter++}";

        // Transaction: tạo company + user + subscription
        await using var tx = await _db.Database.BeginTransactionAsync();
        try
        {
            var company = new Company
            {
                Name          = req.CompanyName,
                Slug          = slug,
                Email         = req.Email,
                Phone         = req.Phone,
                Industry      = req.Industry,
                BusinessScale = req.BusinessScale,
                ShopName      = req.ShopName,
            };
            _db.Companies.Add(company);
            await _db.SaveChangesAsync();

            var user = new User
            {
                Email        = req.Email,
                Username     = req.Email,   // Dùng email làm username mặc định
                FullName     = req.FullName,
                PasswordHash = HashPassword(req.Password),
                Role         = UserRole.Owner,
                IsActive     = true,
                CompanyId    = company.Id,
                Phone        = req.Phone,
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            var subscription = new Subscription
            {
                CompanyId       = company.Id,
                Plan            = "pro",
                Status          = "trial",
                TrialEndsAt     = DateTime.UtcNow.AddDays(7),
                MaxChannels     = 5,
                MaxUsers        = 20,
                AiEnabled       = true,
                AdvancedReports = true,
            };
            _db.Subscriptions.Add(subscription);
            await _db.SaveChangesAsync();

            await tx.CommitAsync();

            // Gán navigation để IssueTokensAsync lấy được company.Slug
            user.Company = company;
            var response = await IssueTokensAsync(user);
            await RecordLoginHistoryAsync(user.Id, ipAddress, userAgent, "SUCCESS");

            return (true, "Đăng ký thành công. Chào mừng bạn đến với MSAS!", response);
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    private async Task RecordLoginHistoryAsync(int userId, string? ip, string? ua, string status)
    {
        try
        {
            _db.LoginHistories.Add(new Core.Entities.LoginHistory
            {
                UserId    = userId,
                IpAddress = ip,
                UserAgent = ua,
                Status    = status,
                LoggedAt  = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();
        }
        catch { /* Không chặn luồng chính nếu ghi lịch sử thất bại */ }
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

    // ── Forgot / Reset Password ──────────────────────────────────────────────

    /// <summary>Khởi tạo yêu cầu đặt lại mật khẩu – tạo token 6 chữ số, lưu hash vào DB</summary>
    public async Task<User?> InitiatePasswordResetAsync(string email)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email && u.IsActive);
        if (user is null) return null;

        // Token là 6 chữ số ngẫu nhiên, an toàn
        var token = RandomNumberGenerator.GetInt32(100_000, 999_999).ToString();
        user.ResetToken       = HashResetToken(token);
        user.ResetTokenExpiry = DateTime.UtcNow.AddMinutes(15);
        await _db.SaveChangesAsync();

        // Ghi token gốc vào config tạm (chỉ dùng ở Dev để lấy lại bằng GetResetTokenAsync)
        // Thực tế sẽ gửi qua email
        _pendingResetTokens[email] = token;
        return user;
    }

    // Lưu tạm token cho Dev mode (không cần SMTP)
    private static readonly Dictionary<string, string> _pendingResetTokens = new();

    /// <summary>Trả về raw token cho Dev mode (không gọi trong Production)</summary>
    public Task<string?> GetResetTokenAsync(string email)
    {
        _pendingResetTokens.TryGetValue(email, out var token);
        return Task.FromResult(token);
    }

    /// <summary>Kiểm tra token reset có hợp lệ không</summary>
    public async Task<bool> VerifyResetTokenAsync(string email, string token)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email && u.IsActive);
        if (user?.ResetToken is null || user.ResetTokenExpiry < DateTime.UtcNow)
            return false;
        return CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(user.ResetToken),
            System.Text.Encoding.UTF8.GetBytes(HashResetToken(token)));
    }

    /// <summary>Đặt mật khẩu mới sau khi verify token thành công</summary>
    public async Task<(bool Success, string Message)> ResetPasswordAsync(ResetPasswordRequest req)
    {
        var valid = await VerifyResetTokenAsync(req.Email, req.Token);
        if (!valid) return (false, "Token không hợp lệ hoặc đã hết hạn.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email && u.IsActive);
        if (user is null) return (false, "Tài khoản không tồn tại.");

        user.PasswordHash    = HashPassword(req.NewPassword);
        user.ResetToken      = null;
        user.ResetTokenExpiry = null;
        user.RefreshToken    = null;  // Bắt đăng nhập lại
        _pendingResetTokens.Remove(req.Email);
        await _db.SaveChangesAsync();
        return (true, "Đặt lại mật khẩu thành công.");
    }

    /// <summary>Lấy user theo email (dùng cho audit log)</summary>
    public async Task<User?> GetUserByEmailAsync(string email)
        => await _db.Users.FirstOrDefaultAsync(u => u.Email == email);

    private static string HashResetToken(string token)
    {
        var bytes = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToBase64String(bytes);
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    private async Task<AuthResponse> IssueTokensAsync(User user)
    {
        var companySlug = user.Company?.Slug ?? string.Empty;
        var accessToken  = _jwt.GenerateAccessToken(user, companySlug);
        var refreshToken = _jwt.GenerateRefreshToken();
        var refreshDays  = int.Parse(_config["Jwt:RefreshTokenDays"] ?? "30");

        user.RefreshToken          = refreshToken;
        user.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(refreshDays);
        user.LastLoginAt           = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return new AuthResponse(
            AccessToken:         accessToken,
            RefreshToken:        refreshToken,
            ExpiresAt:           DateTime.UtcNow.AddMinutes(
                double.Parse(_config["Jwt:AccessTokenMinutes"] ?? "60")),
            Role:                user.Role.ToString(),
            FullName:            user.FullName,
            UserId:              user.Id,
            Username:            user.Username,
            CompanyId:           user.CompanyId,
            CompanySlug:         companySlug,
            IsSuperAdmin:        user.IsSuperAdmin,
            OnboardingCompleted: user.Company?.OnboardingCompleted ?? false
        );
    }

    /// <summary>Chuyển tên thành URL-friendly slug (hỗ trợ tiếng Việt)</summary>
    private static string GenerateSlug(string name)
    {
        // Bỏ dấu tiếng Việt → Latin
        var normalized = name.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var c in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        // Chuyển thường, thay khoảng trắng bằng '-', xóa ký tự đặc biệt
        return Regex.Replace(
            sb.ToString().ToLowerInvariant().Replace(' ', '-'),
            @"[^a-z0-9\-]", string.Empty
        ).Trim('-');
    }

    public static string HashPassword(string password)
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
