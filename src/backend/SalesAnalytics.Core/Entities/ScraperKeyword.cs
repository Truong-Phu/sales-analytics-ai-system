using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

[Table("scraper_keywords", Schema = "public")]
public class ScraperKeyword
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [MaxLength(500)]
    [Column("keyword")]
    public string Keyword { get; set; } = string.Empty;

    [MaxLength(50)]
    [Column("source_type")]
    public string SourceType { get; set; } = "google";

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("last_used_at")]
    public DateTime? LastUsedAt { get; set; }

    [Column("use_count")]
    public int UseCount { get; set; } = 0;

    [Column("created_by")]
    public int? CreatedBy { get; set; }

    // Multi-tenant isolation — thêm 2026-05-14
    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    [ForeignKey(nameof(CreatedBy))]
    public User? Creator { get; set; }
}
