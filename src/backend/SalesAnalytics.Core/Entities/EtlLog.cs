using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>
/// Nhật ký ETL – ánh xạ bảng public.etl_logs.
/// Ghi lại chi tiết từng bước Extract-Transform-Load để theo dõi và debug.
/// </summary>
[Table("etl_logs", Schema = "public")]
public class EtlLog
{
    /// <summary>Mã bản ghi log – khóa chính tự tăng</summary>
    [Key]
    [Column("log_id")]
    public int LogId { get; set; }

    /// <summary>Mã công việc ETL (FK → etl_jobs, nullable khi ghi log từ scheduler)</summary>
    [Column("job_id")]
    public int? JobId { get; set; }

    /// <summary>Giai đoạn ETL: EXTRACT | TRANSFORM | QUALITY_CHECK | LOAD | GENERAL</summary>
    [Required]
    [MaxLength(100)]
    [Column("phase")]
    public string Phase { get; set; } = "GENERAL";

    /// <summary>Nội dung thông báo log</summary>
    [Column("message")]
    public string? Message { get; set; }

    /// <summary>Mức độ log: DEBUG | INFO | WARN | ERROR | CRITICAL</summary>
    [Required]
    [MaxLength(20)]
    [Column("level")]
    public string Level { get; set; } = "INFO";

    /// <summary>Số bản ghi đã xử lý trong bước này</summary>
    [Column("records_count")]
    public int? RecordsCount { get; set; }

    /// <summary>Thời điểm ghi log</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation properties ────────────────────────────────────────────────
    // Không cần navigation về EtlJob vì EtlJob không nằm trong scope entity này
}
