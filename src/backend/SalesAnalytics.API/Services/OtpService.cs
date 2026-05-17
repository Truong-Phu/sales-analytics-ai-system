using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

public interface IOtpService
{
    Task<string> GenerateAndSaveOtpAsync(string email, string purpose);
    /// <summary>Kiểm tra OTP hợp lệ MÀ KHÔNG đánh dấu đã dùng (peek). Dùng cho bước xác nhận trước khi fill form.</summary>
    Task<bool>   PeekOtpAsync(string email, string otp, string purpose);
    /// <summary>Kiểm tra OTP hợp lệ VÀ đánh dấu đã dùng (consume). Dùng cho bước tạo tài khoản.</summary>
    Task<bool>   VerifyOtpAsync(string email, string otp, string purpose);
    Task<bool>   CanSendOtpAsync(string email, string purpose);
}

public class OtpService(AppDbContext db, IConfiguration config, ILogger<OtpService> logger) : IOtpService
{
    private readonly string _salt = config["Resend:OtpSalt"] ?? "MSAS_OTP_SALT_2026";

    /// <summary>Tạo OTP 6 chữ số, hash rồi lưu vào DB. Trả về OTP plaintext để gửi email.</summary>
    public async Task<string> GenerateAndSaveOtpAsync(string email, string purpose)
    {
        // Xóa OTP cũ chưa dùng cùng email+purpose
        var oldRecords = await db.EmailVerifications
            .Where(v => v.Email == email && v.Purpose == purpose && !v.IsUsed)
            .ToListAsync();
        db.EmailVerifications.RemoveRange(oldRecords);

        // Tạo OTP 6 chữ số
        var otp  = Random.Shared.Next(100_000, 999_999).ToString();
        var hash = HashOtp(otp, email);

        var record = new EmailVerification
        {
            Email     = email,
            OtpCode   = otp[..2] + "****",   // lưu partial (chỉ để debug log)
            OtpHash   = hash,
            Purpose   = purpose,
            ExpiresAt = DateTime.UtcNow.AddMinutes(10),
        };

        db.EmailVerifications.Add(record);
        await db.SaveChangesAsync();

        logger.LogInformation("OTP đã tạo cho {Email} | purpose={Purpose}", email, purpose);
        return otp;
    }

    /// <summary>Chỉ kiểm tra hash có đúng không, KHÔNG đánh dấu is_used. Dùng cho bước xác nhận OTP trước khi fill form đăng ký.</summary>
    public async Task<bool> PeekOtpAsync(string email, string otp, string purpose)
    {
        var record = await db.EmailVerifications
            .Where(v => v.Email == email && v.Purpose == purpose && !v.IsUsed && v.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null) return false;

        record.Attempts++;
        if (record.Attempts > 5)
        {
            db.EmailVerifications.Remove(record);
            await db.SaveChangesAsync();
            return false;
        }

        var hash = HashOtp(otp, email);
        if (hash != record.OtpHash)
        {
            await db.SaveChangesAsync();
            return false;
        }

        // Peek: OTP đúng nhưng chưa đánh dấu is_used — chờ register endpoint consume
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>Xác minh OTP VÀ đánh dấu đã dùng (consume). Dùng cho bước tạo tài khoản.</summary>
    public async Task<bool> VerifyOtpAsync(string email, string otp, string purpose)
    {
        var record = await db.EmailVerifications
            .Where(v => v.Email == email && v.Purpose == purpose && !v.IsUsed && v.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync();

        if (record == null) return false;

        record.Attempts++;
        if (record.Attempts > 5)
        {
            db.EmailVerifications.Remove(record);
            await db.SaveChangesAsync();
            return false;
        }

        var hash = HashOtp(otp, email);
        if (hash != record.OtpHash)
        {
            await db.SaveChangesAsync();
            return false;
        }

        // OTP đúng → consume (đánh dấu đã dùng, không cho verify lại)
        record.IsUsed = true;
        await db.SaveChangesAsync();
        return true;
    }

    /// <summary>Kiểm tra rate limit: chỉ cho gửi 1 lần/phút per email+purpose</summary>
    public async Task<bool> CanSendOtpAsync(string email, string purpose)
    {
        var lastOtp = await db.EmailVerifications
            .Where(v => v.Email == email && v.Purpose == purpose)
            .OrderByDescending(v => v.CreatedAt)
            .FirstOrDefaultAsync();

        if (lastOtp == null) return true;
        return (DateTime.UtcNow - lastOtp.CreatedAt).TotalSeconds >= 60;
    }

    // ── SHA256(otp + email + salt) ────────────────────────────────────────────
    private string HashOtp(string otp, string email)
    {
        var raw  = $"{otp}{email.ToLowerInvariant()}{_salt}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
