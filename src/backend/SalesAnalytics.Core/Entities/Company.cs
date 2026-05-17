namespace SalesAnalytics.Core.Entities;

/// <summary>Công ty/tenant – ánh xạ bảng public.companies</summary>
public class Company
{
    public Guid    Id                   { get; set; }
    public string  Name                 { get; set; } = string.Empty;
    public string  Slug                 { get; set; } = string.Empty;
    public string  Email                { get; set; } = string.Empty;
    public string? Phone                { get; set; }
    public string? LogoUrl              { get; set; }
    public string? Industry             { get; set; }
    public string? BusinessScale        { get; set; }
    public string? ShopName             { get; set; }
    public string? Address              { get; set; }
    public string  Timezone             { get; set; } = "Asia/Ho_Chi_Minh";
    public string  LangPref             { get; set; } = "vi";
    public bool    OnboardingCompleted  { get; set; } = false;
    public int     OnboardingStep       { get; set; } = 0;
    public bool    IsActive             { get; set; } = true;
    public string? LockReason           { get; set; }
    public DateTime? LockedAt           { get; set; }
    public DateTime CreatedAt           { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt           { get; set; } = DateTime.UtcNow;

    public ICollection<Subscription> Subscriptions { get; set; } = [];
    public ICollection<User>         Users          { get; set; } = [];
}
