namespace SalesAnalytics.Core.Entities;

public class ChatHistory
{
    public long      Id        { get; set; }
    public int       UserId    { get; set; }
    public Guid?     CompanyId { get; set; }
    public string    Tab       { get; set; } = "business";
    public string    Question  { get; set; } = string.Empty;
    public string    Answer    { get; set; } = string.Empty;
    public string?   Intent    { get; set; }
    public string?   ModelUsed { get; set; }
    public bool      FallbackUsed { get; set; }
    public DateTime  CreatedAt { get; set; } = DateTime.UtcNow;
}
