using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

[Table("notification_preferences", Schema = "public")]
public class NotificationPreference
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("email_notify")]
    public bool EmailNotify { get; set; } = true;

    [Column("anomaly_alert")]
    public bool AnomalyAlert { get; set; } = true;

    [Column("daily_report")]
    public bool DailyReport { get; set; } = false;

    [Column("weekly_report")]
    public bool WeeklyReport { get; set; } = true;

    [Column("sync_error_notify")]
    public bool SyncErrorNotify { get; set; } = true;

    [Column("subscription_notify")]
    public bool SubscriptionNotify { get; set; } = true;

    [Column("push_notify")]
    public bool PushNotify { get; set; } = false;

    [Column("low_stock_alert")]
    public bool LowStockAlert { get; set; } = true;

    [Column("ai_recommend_alert")]
    public bool AiRecommendAlert { get; set; } = false;

    [Column("new_order_notify")]
    public bool NewOrderNotify { get; set; } = true;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
