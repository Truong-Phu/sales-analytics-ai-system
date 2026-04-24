using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SalesAnalytics.Core.Enums;

namespace SalesAnalytics.Core.Entities;

/// <summary>Kênh bán hàng – ánh xạ bảng public.sales_channels</summary>
[Table("sales_channels", Schema = "public")]
public class Channel
{
    /// <summary>Mã kênh bán hàng – khóa chính tự tăng</summary>
    [Key]
    [Column("channel_id")]
    public int ChannelId { get; set; }

    /// <summary>Tên kênh (VD: "Shopee Official", "TikTok Shop VN")</summary>
    [Required]
    [MaxLength(255)]
    [Column("channel_name")]
    public string ChannelName { get; set; } = string.Empty;

    /// <summary>Loại kênh: SHOPEE | LAZADA | TIKTOK_SHOP | FACEBOOK_SHOP | WEBSITE | OFFLINE</summary>
    [Required]
    [MaxLength(50)]
    [Column("channel_type")]
    public string ChannelType { get; set; } = string.Empty;

    /// <summary>API Key kết nối (lưu mã hóa trong production)</summary>
    [Column("api_key")]
    public string? ApiKey { get; set; }

    /// <summary>OAuth2 Access Token (mã hóa)</summary>
    [Column("access_token")]
    public string? AccessToken { get; set; }

    /// <summary>Refresh Token của API bên ngoài (khác JWT nội bộ)</summary>
    [Column("refresh_token_api")]
    public string? RefreshTokenApi { get; set; }

    /// <summary>Shop ID trên sàn TMĐT</summary>
    [MaxLength(100)]
    [Column("shop_id")]
    public string? ShopId { get; set; }

    /// <summary>Trạng thái kết nối (true = đang hoạt động)</summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>Lần đồng bộ dữ liệu gần nhất</summary>
    [Column("last_sync_at")]
    public DateTime? LastSyncAt { get; set; }

    /// <summary>Trạng thái đồng bộ: IDLE | RUNNING | SUCCESS | FAILED</summary>
    [MaxLength(50)]
    [Column("sync_status")]
    public string SyncStatus { get; set; } = "IDLE";

    /// <summary>Thời điểm tạo</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Thời điểm cập nhật gần nhất</summary>
    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Danh sách đơn hàng từ kênh này</summary>
    public ICollection<Order> Orders { get; set; } = [];

    // Ghi chú: Customer không có FK trực tiếp đến Channel trong OLTP schema
}
