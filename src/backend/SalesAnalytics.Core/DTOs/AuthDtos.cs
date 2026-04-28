using System.ComponentModel.DataAnnotations;

namespace SalesAnalytics.Core.DTOs;

public record LoginRequest(
    [Required] string Username,
    [Required] string Password
);

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
