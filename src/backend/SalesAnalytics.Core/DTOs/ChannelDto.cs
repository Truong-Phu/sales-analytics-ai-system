namespace SalesAnalytics.Core.DTOs;

/// <summary>Dữ liệu kênh bán hàng trả về cho client</summary>
public class ChannelResponseDto
{
    public int     ChannelId    { get; set; }
    public string  ChannelName  { get; set; } = string.Empty;
    public string  ChannelType  { get; set; } = string.Empty;
    public string? ShopId       { get; set; }
    public bool    IsActive     { get; set; }
    public string  SyncStatus   { get; set; } = "IDLE";
    public DateTime? LastSyncAt { get; set; }
    public DateTime CreatedAt   { get; set; }
}
