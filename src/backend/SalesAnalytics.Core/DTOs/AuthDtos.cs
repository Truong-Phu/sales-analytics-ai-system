using System.ComponentModel.DataAnnotations;

namespace SalesAnalytics.Core.DTOs;

public class LoginRequest
{
    [EmailAddress]
    public string? Email    { get; set; }

    public string? Username { get; set; }

    [Required(ErrorMessage = "Mật khẩu là bắt buộc")]
    public string Password { get; set; } = string.Empty;
}

/// <summary>Đăng ký tài khoản Owner – tạo Company + User + Subscription Free trong 1 transaction</summary>
public class OwnerRegisterRequest
{
    [Required(ErrorMessage = "Tên công ty là bắt buộc")]
    [MaxLength(200)]
    public string CompanyName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Họ tên là bắt buộc")]
    [MaxLength(255)]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email là bắt buộc")]
    [EmailAddress(ErrorMessage = "Email không đúng định dạng")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Số điện thoại là bắt buộc")]
    [RegularExpression(@"^(0|\+84)[3-9][0-9]{8}$", ErrorMessage = "Số điện thoại Việt Nam không hợp lệ")]
    public string Phone { get; set; } = string.Empty;

    [Required(ErrorMessage = "Mật khẩu là bắt buộc")]
    [MinLength(8, ErrorMessage = "Mật khẩu tối thiểu 8 ký tự")]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Xác nhận mật khẩu là bắt buộc")]
    public string ConfirmPassword { get; set; } = string.Empty;

    // Thời trang | Điện tử | Mỹ phẩm | Nội thất | Thực phẩm | Khác
    public string? Industry { get; set; }

    // under_500m | 500m_2b | over_2b
    public string? BusinessScale { get; set; }

    public string? ShopName { get; set; }

    [Required(ErrorMessage = "Bạn phải đồng ý với điều khoản dịch vụ")]
    public bool AgreedToTerms { get; set; }

    /// <summary>Mã OTP xác thực email (tùy chọn – bắt buộc nếu bật OTP flow)</summary>
    [MaxLength(6)]
    public string? OtpCode { get; set; }
}

/// <summary>Đăng ký thủ công (chờ Admin phê duyệt) – giữ nguyên từ phiên bản cũ</summary>
public record RegisterRequest(
    [Required, MinLength(3)] string Username,
    [Required, MinLength(6)] string Password,
    [Required, EmailAddress]  string Email,
    [Required]                string FullName
);

/// <summary>Response đăng nhập – mở rộng thêm thông tin tenant</summary>
public record AuthResponse(
    string   AccessToken,
    string   RefreshToken,
    DateTime ExpiresAt,
    string   Role,
    string   FullName,
    int      UserId              = 0,
    string   Username            = "",
    Guid?    CompanyId           = null,
    string   CompanySlug         = "",
    bool     IsSuperAdmin        = false,
    bool     OnboardingCompleted = false
);

public record RefreshRequest(
    [Required] string RefreshToken
);

public record ChangePasswordRequest(
    [Required] string OldPassword,
    [Required, MinLength(6)] string NewPassword
);

public class ForgotPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}

/// <summary>Yêu cầu gửi OTP qua email</summary>
public class SendOtpRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
}

/// <summary>Xác minh OTP</summary>
public class VerifyOtpRequest
{
    [Required, EmailAddress]
    public string Email   { get; set; } = string.Empty;
    [Required, MaxLength(6)]
    public string Otp     { get; set; } = string.Empty;
    /// <summary>register | forgot_password</summary>
    public string? Purpose { get; set; } = "register";
}

public class VerifyResetTokenRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
    [Required]
    public string Token { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
    [Required]
    public string Token { get; set; } = string.Empty;
    [Required, MinLength(8)]
    public string NewPassword { get; set; } = string.Empty;
    [Required]
    public string ConfirmPassword { get; set; } = string.Empty;
}
