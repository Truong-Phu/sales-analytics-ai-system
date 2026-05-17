using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Thông báo in-app: sync, subscription, anomaly, system</summary>
[Table("notifications", Schema = "public")]
public class Notification
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    /// <summary>info | warning | error | success</summary>
    [MaxLength(50)]
    [Column("type")]
    public string Type { get; set; } = "info";

    /// <summary>sync | subscription | anomaly | system | auth</summary>
    [MaxLength(50)]
    [Column("category")]
    public string? Category { get; set; }

    [Required, MaxLength(200)]
    [Column("title")]
    public string Title { get; set; } = string.Empty;

    [Column("body")]
    public string? Body { get; set; }

    /// <summary>Dữ liệu bổ sung dạng JSON (link, entityId...)</summary>
    [Column("data", TypeName = "jsonb")]
    public string? Data { get; set; }

    [Column("is_read")]
    public bool IsRead { get; set; } = false;

    [Column("read_at")]
    public DateTime? ReadAt { get; set; }

    /// <summary>Kênh gửi: in_app, email, push</summary>
    [Column("channels")]
    public string[] Channels { get; set; } = ["in_app"];

    [Column("sent_email")]
    public bool SentEmail { get; set; } = false;

    [Column("sent_push")]
    public bool SentPush { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("UserId")]
    public User? User { get; set; }
}
