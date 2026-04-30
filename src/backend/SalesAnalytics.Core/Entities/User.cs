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
    public bool      IsActive     { get; set; } = false;
    public string    PreferredLanguage { get; set; } = "vi";
    public DateTime  CreatedAt    { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt  { get; set; }

    // Thông tin hồ sơ mở rộng (PROMPT 6)
    public string?   AvatarUrl  { get; set; }
    public string?   Phone      { get; set; }
    public DateOnly? Birthdate  { get; set; }
    public string    Timezone   { get; set; } = "Asia/Ho_Chi_Minh";
    public string    LangPref   { get; set; } = "vi";

    // Refresh token (lưu trong DB để hỗ trợ rotation)
    public string?   RefreshToken          { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }
}
