namespace SalesAnalytics.Core.Entities;

/// <summary>Gói dịch vụ của tenant – ánh xạ bảng public.subscriptions</summary>
public class Subscription
{
    public Guid      Id              { get; set; }
    public Guid      CompanyId       { get; set; }
    public string    Plan            { get; set; } = "free";   // free | pro | enterprise
    public string    Status          { get; set; } = "active"; // trial | active | expired | cancelled
    public DateTime  StartedAt       { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt       { get; set; }
    public DateTime? TrialEndsAt     { get; set; }
    public DateTime? GraceEndsAt     { get; set; }
    public bool      AutoRenew       { get; set; } = true;
    public int       MaxChannels     { get; set; } = 2;    // -1 = không giới hạn
    public int       MaxUsers        { get; set; } = 3;    // -1 = không giới hạn
    public bool      AiEnabled       { get; set; } = false;
    public bool      AdvancedReports { get; set; } = false;
    public DateTime  CreatedAt       { get; set; } = DateTime.UtcNow;
    public DateTime  UpdatedAt       { get; set; } = DateTime.UtcNow;

    public Company? Company { get; set; }
}
