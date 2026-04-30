using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

[Table("login_history", Schema = "public")]
public class LoginHistory
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("user_id")]
    public int UserId { get; set; }

    [MaxLength(45)]
    [Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("user_agent")]
    public string? UserAgent { get; set; }

    [Column("logged_at")]
    public DateTime LoggedAt { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(20)]
    [Column("status")]
    public string Status { get; set; } = "SUCCESS";

    public User? User { get; set; }
}
