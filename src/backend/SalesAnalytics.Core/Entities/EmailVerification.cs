using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Bảng xác thực OTP qua email – Register + Forgot Password</summary>
[Table("email_verifications", Schema = "public")]
public class EmailVerification
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150)]
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(6)]
    [Column("otp_code")]
    public string OtpCode { get; set; } = string.Empty;

    /// <summary>SHA256(otp + email + salt) – không lưu OTP plaintext</summary>
    [Required, MaxLength(200)]
    [Column("otp_hash")]
    public string OtpHash { get; set; } = string.Empty;

    /// <summary>register | forgot_password</summary>
    [MaxLength(50)]
    [Column("purpose")]
    public string Purpose { get; set; } = "register";

    [Column("is_used")]
    public bool IsUsed { get; set; } = false;

    /// <summary>Số lần nhập sai – quá 5 lần xóa OTP</summary>
    [Column("attempts")]
    public int Attempts { get; set; } = 0;

    [Column("expires_at")]
    public DateTime ExpiresAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
