using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý đồng bộ dữ liệu đa nguồn và ETL pipeline.
/// Trả về trạng thái sync từ ETL logs, hỗ trợ trigger đồng bộ thủ công.
/// </summary>
[ApiController]
[Authorize(Roles = "Owner,Manager,DataIT,Admin")]
public class DataSyncController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<DataSyncController> _logger;

    public DataSyncController(AppDbContext db, ILogger<DataSyncController> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ── Trạng thái đồng bộ đa nguồn ─────────────────────────────────────────

    /// <summary>Lấy trạng thái đồng bộ tất cả nguồn dữ liệu.</summary>
    [HttpGet("api/datasync/status")]
    public async Task<IActionResult> GetSyncStatus()
    {
        // Đọc log ETL gần nhất theo từng nguồn (job_id nhóm theo phase message)
        var recentLogs = await _db.EtlLogs
            .OrderByDescending(l => l.CreatedAt)
            .Take(200)
            .ToListAsync();

        // Danh sách nguồn cố định — khớp với MOCK_DATA_SYNC của Frontend
        var sources = new[]
        {
            "shopee", "lazada", "tiktok", "facebook", "ghn", "vnpay",
        };

        var result = sources.Select(src =>
        {
            // Tìm log gần nhất có phase/message chứa tên nguồn
            var last = recentLogs.FirstOrDefault(l =>
                (l.Phase?.Contains(src, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (l.Message?.Contains(src, StringComparison.OrdinalIgnoreCase) ?? false));

            string status     = last is null ? "idle" : (last.Level == "ERROR" ? "error" : "success");
            string? errMsg    = last?.Level == "ERROR" ? last.Message : null;
            int     records   = last?.RecordsCount ?? 0;
            DateTime? lastAt  = last?.CreatedAt;

            return new
            {
                sourceKey      = src,
                sourceName     = FormatSourceName(src),
                status,
                lastSync       = lastAt?.ToString("O"),
                recordsSynced  = records,
                errorMessage   = errMsg,
            };
        }).ToList();

        return Ok(new { sources = result });
    }

    /// <summary>Kích hoạt đồng bộ một nguồn dữ liệu thủ công.</summary>
    [HttpPost("api/datasync/trigger")]
    public async Task<IActionResult> TriggerSync([FromBody] TriggerSyncRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Source))
            return BadRequest(new { message = "source không được để trống." });

        // Ghi log ETL: trigger thủ công
        _db.EtlLogs.Add(new()
        {
            JobId        = 0,                   // 0 = manual trigger
            Phase        = "EXTRACT",
            Message      = $"Manual trigger: {req.Source}",
            Level        = "INFO",
            RecordsCount = 0,
            CreatedAt    = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("DataSync trigger: source={Source}", req.Source);

        return Accepted(new
        {
            message = $"Đã kích hoạt đồng bộ nguồn '{req.Source}'. Kết quả sẽ cập nhật sau vài phút.",
            source  = req.Source,
        });
    }

    // ── ETL Pipeline status ──────────────────────────────────────────────────

    /// <summary>Lấy trạng thái ETL pipeline gần nhất (50 log entries mới nhất).</summary>
    [HttpGet("api/etl/status")]
    public async Task<IActionResult> GetEtlStatus()
    {
        var logs = await _db.EtlLogs
            .OrderByDescending(l => l.CreatedAt)
            .Take(50)
            .Select(l => new
            {
                l.LogId,
                l.JobId,
                l.Phase,
                l.Level,
                l.Message,
                l.RecordsCount,
                createdAt = l.CreatedAt.ToString("O"),
            })
            .ToListAsync();

        var lastRun     = logs.FirstOrDefault()?.createdAt;
        var hasError    = logs.Any(l => l.Level == "ERROR");
        var totalLoaded = logs.Where(l => l.Phase == "LOAD").Sum(l => l.RecordsCount ?? 0);

        return Ok(new
        {
            status      = hasError ? "error" : (logs.Any() ? "success" : "idle"),
            lastRun,
            totalLoaded,
            logs,
        });
    }

    /// <summary>Kích hoạt ETL pipeline thủ công.</summary>
    [HttpPost("api/etl/trigger")]
    [Authorize(Roles = "DataIT,Admin")]
    public async Task<IActionResult> TriggerEtl([FromBody] TriggerEtlRequest req)
    {
        var pipeline = req.Pipeline ?? "full";

        _db.EtlLogs.Add(new()
        {
            JobId    = 0,
            Phase    = "GENERAL",
            Message  = $"Manual ETL trigger: pipeline={pipeline}",
            Level    = "INFO",
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("ETL trigger: pipeline={Pipeline}", pipeline);

        return Accepted(new
        {
            message  = $"Đã kích hoạt ETL pipeline '{pipeline}'. Tiến trình sẽ cập nhật trong EtlMonitor.",
            pipeline,
        });
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private static string FormatSourceName(string key) => key switch
    {
        "shopee"   => "Shopee",
        "lazada"   => "Lazada",
        "tiktok"   => "TikTok Shop",
        "facebook" => "Facebook",
        "ghn"      => "GHN",
        "vnpay"    => "VNPay",
        _          => key,
    };
}

public class TriggerSyncRequest { public string? Source { get; set; } }
public class TriggerEtlRequest  { public string? Pipeline { get; set; } }
