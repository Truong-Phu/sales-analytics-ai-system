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

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
