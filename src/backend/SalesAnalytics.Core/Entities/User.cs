using SalesAnalytics.Core.Enums;

namespace SalesAnalytics.Core.Entities;

/// <summary>Người dùng hệ thống – ánh xạ bảng public.users</summary>
public class User
{
    public int       Id           { get; set; }
    public string    Username     { get; set; } = string.Empty;
    public string    PasswordHash { get; set; } = string.Empty;
    public string    Email        { get; set; } = string.Empty;
    public string    FullName     { get; set; } = string.Empty;
    public UserRole  Role         { get; set; } = UserRole.Staff;
    public bool      IsActive     { get; set; } = false;  // Cần Admin phê duyệt
    public string    PreferredLanguage { get; set; } = "vi";
    public DateTime  CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt  { get; set; }

    // Refresh token (lưu trong DB để hỗ trợ rotation)
    public string?   RefreshToken          { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }
}
