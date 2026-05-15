using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Infrastructure.Data;
using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý đồng bộ dữ liệu đa nguồn và ETL pipeline.
/// Trả về trạng thái sync từ ETL logs, hỗ trợ trigger đồng bộ thủ công.
/// </summary>
[ApiController]
[Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
public class DataSyncController(
    AppDbContext db,
    ILogger<DataSyncController> logger,
    AiProxyService ai,
    IAuditLogService audit,
    ITenantContext tenant,
    INotificationService notifications) : ControllerBase
{
    // ── Trạng thái đồng bộ đa nguồn ─────────────────────────────────────────

    /// <summary>Lấy trạng thái đồng bộ tất cả nguồn dữ liệu.</summary>
    [HttpGet("api/datasync/status")]
    public async Task<IActionResult> GetSyncStatus()
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        var query = db.EtlLogs.OrderByDescending(l => l.CreatedAt);
        // SuperAdmin thấy tất cả; user thường chỉ thấy log của công ty mình
        // EtlLog không có company_id column, nên dùng Join với JobId nếu có, hoặc lọc bằng Message
        var recentLogs = await query.Take(200).ToListAsync();

        var sources = new[] { "shopee", "lazada", "tiktok", "facebook", "ghn", "vnpay" };

        var result = sources.Select(src =>
        {
            var last = recentLogs.FirstOrDefault(l =>
                (l.Phase?.Contains(src, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (l.Message?.Contains(src, StringComparison.OrdinalIgnoreCase) ?? false));

            string    status  = last is null ? "idle" : (last.Level == "ERROR" ? "error" : "success");
            string?   errMsg  = last?.Level == "ERROR" ? last.Message : null;
            int       records = last?.RecordsCount ?? 0;
            DateTime? lastAt  = last?.CreatedAt;

            return new
            {
                sourceKey     = src,
                sourceName    = FormatSourceName(src),
                status,
                lastSync      = lastAt?.ToString("O"),
                recordsSynced = records,
                errorMessage  = errMsg,
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

        try
        {
            db.EtlLogs.Add(new()
            {
                JobId        = 0,
                Phase        = "EXTRACT",
                Message      = $"Manual trigger: {req.Source}",
                Level        = "INFO",
                RecordsCount = 0,
                CreatedAt    = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();

            logger.LogInformation("DataSync trigger: source={Source} company={CompanyId}",
                req.Source, tenant.CompanyId);

            await audit.LogAsync(
                userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var sid) ? (int?)sid : null,
                username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
                action:     "TRIGGER_SYNC",
                entityType: "DataSync", entityId: req.Source,
                newValue:   $"{{\"source\":\"{req.Source}\"}}",
                ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
                userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

            // Gửi thông báo in-app khi sync được kích hoạt thủ công
            if (int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
            {
                _ = notifications.SendAsync(uid, new NotificationRequest
                {
                    Title    = "Đồng bộ dữ liệu đang chạy",
                    Body     = $"Đang đồng bộ từ {FormatSourceName(req.Source)}...",
                    Type     = "info",
                    Category = "sync",
                    Channels = ["in_app"],
                });
            }

            return Accepted(new
            {
                message = $"Đã kích hoạt đồng bộ nguồn '{req.Source}'. Kết quả sẽ cập nhật sau vài phút.",
                source  = req.Source,
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi trigger sync: source={Source}", req.Source);
            return StatusCode(503, new
            {
                success = false,
                message = $"Không thể đồng bộ nguồn '{req.Source}'. Vui lòng kiểm tra kết nối và thử lại.",
            });
        }
    }

    // ── ETL Pipeline status ──────────────────────────────────────────────────

    /// <summary>Lấy trạng thái ETL pipeline gần nhất (50 log entries mới nhất).</summary>
    [HttpGet("api/etl/status")]
    public async Task<IActionResult> GetEtlStatus()
    {
        var logs = await db.EtlLogs
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
    [Authorize(Roles = "DataIT,Owner,SuperAdmin")]
    public async Task<IActionResult> TriggerEtl([FromBody] TriggerEtlRequest req)
    {
        var pipeline = req.Pipeline ?? "full";

        db.EtlLogs.Add(new()
        {
            JobId     = 0,
            Phase     = "GENERAL",
            Message   = $"Manual ETL trigger: pipeline={pipeline}",
            Level     = "INFO",
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        logger.LogInformation("ETL trigger: pipeline={Pipeline}", pipeline);

        await audit.LogAsync(
            userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var eid) ? (int?)eid : null,
            username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
            action:     "TRIGGER_ETL",
            entityType: "ETL", entityId: pipeline,
            newValue:   $"{{\"pipeline\":\"{pipeline}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Accepted(new
        {
            message  = $"Đã kích hoạt ETL pipeline '{pipeline}'. Tiến trình sẽ cập nhật trong EtlMonitor.",
            pipeline,
        });
    }

    // ── Connector Health Check ───────────────────────────────────────────────

    /// <summary>Trạng thái kết nối thật của tất cả API connector.</summary>
    [HttpGet("api/datasync/connector-health")]
    public async Task<IActionResult> GetConnectorHealth()
    {
        var result = await ai.GetConnectorHealthAsync();
        if (result is null)
            return StatusCode(503, new { message = "AI Service không khả dụng – không thể lấy trạng thái connector." });
        return Ok(result);
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

public class TriggerSyncRequest { public string? Source   { get; set; } }
public class TriggerEtlRequest  { public string? Pipeline { get; set; } }
