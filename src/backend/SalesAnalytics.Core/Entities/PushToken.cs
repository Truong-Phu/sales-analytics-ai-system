using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Expo push token của từng thiết bị mobile</summary>
[Table("push_tokens", Schema = "public")]
public class PushToken
{
    [Key]
    [Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("user_id")]
    public int UserId { get; set; }

    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    [Required, MaxLength(200)]
    [Column("expo_token")]
    public string ExpoToken { get; set; } = string.Empty;

    [MaxLength(100)]
    [Column("device_name")]
    public string? DeviceName { get; set; }

    /// <summary>ios | android</summary>
    [MaxLength(20)]
    [Column("platform")]
    public string? Platform { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("last_used_at")]
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("UserId")]
    public User? User { get; set; }
}
