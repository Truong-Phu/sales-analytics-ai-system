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

public record RegisterRequest(
    [Required, MinLength(3)] string Username,
    [Required, MinLength(6)] string Password,
    [Required, EmailAddress]  string Email,
    [Required]                string FullName
);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    string Role,
    string FullName,
    int    UserId   = 0,
    string Username = ""
);

public record RefreshRequest(
    [Required] string RefreshToken
);

public record ChangePasswordRequest(
    [Required] string OldPassword,
    [Required, MinLength(6)] string NewPassword
);
