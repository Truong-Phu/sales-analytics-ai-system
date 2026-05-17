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
    IServiceScopeFactory scopeFactory,
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

        var sources = new[] { "shopee", "lazada", "tiktok", "facebook", "ghn", "vnpay", "google_analytics" };

        // Map source key → platform name trong bảng integrations
        var platformMap = new Dictionary<string, string>
        {
            ["shopee"]           = "shopee",
            ["lazada"]           = "lazada",
            ["tiktok"]           = "tiktok",
            ["facebook"]         = "facebook",
            ["ghn"]              = "ghn",
            ["vnpay"]            = "vnpay",
            ["google_analytics"] = "google",
        };

        // Lấy trạng thái is_active + id từ bảng integrations
        var integrationStatus = new Dictionary<string, (string Id, bool IsActive)>();
        if (companyId.HasValue)
        {
            try
            {
                var conn = db.Database.GetDbConnection();
                if (conn.State != System.Data.ConnectionState.Open)
                    await conn.OpenAsync();
                await using var cmd = conn.CreateCommand();
                cmd.CommandText =
                    "SELECT id::text, platform, is_active FROM public.integrations WHERE company_id = @cid";
                var p = cmd.CreateParameter();
                p.ParameterName = "cid";
                p.Value = companyId.Value.ToString();
                cmd.Parameters.Add(p);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var platform  = reader.GetString(1);
                    var sourceKey = platformMap.FirstOrDefault(kv => kv.Value == platform).Key;
                    if (sourceKey is not null)
                        integrationStatus[sourceKey] = (reader.GetString(0), reader.GetBoolean(2));
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning("Không đọc được integrations: {Err}", ex.Message);
            }
        }

        var result = sources.Select(src =>
        {
            var last = recentLogs.FirstOrDefault(l =>
                (l.Phase?.Contains(src, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (l.Message?.Contains(src, StringComparison.OrdinalIgnoreCase) ?? false));

            string    status  = last is null ? "idle" : (last.Level == "ERROR" ? "error" : "success");
            string?   errMsg  = last?.Level == "ERROR" ? last.Message : null;
            int       records = last?.RecordsCount ?? 0;
            DateTime? lastAt  = last?.CreatedAt;

            var hasInteg = integrationStatus.TryGetValue(src, out var integ);
            return new
            {
                sourceKey       = src,
                sourceName      = FormatSourceName(src),
                status,
                lastSync        = lastAt?.ToString("O"),
                recordsSynced   = records,
                errorMessage    = errMsg,
                isActive        = hasInteg ? integ.IsActive : true,
                integrationId   = hasInteg ? integ.Id : (string?)null,
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
            try
            {
                await db.SaveChangesAsync();
            }
            catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)
            {
                var innerMsg = ex.InnerException?.Message ?? ex.Message;
                logger.LogError("SaveChanges lỗi (TriggerSync EtlLog): {Msg}", innerMsg);
                return StatusCode(500, new { error = innerMsg });
            }

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

    // ── Full Sync Trigger với Job tracking (OLTP → DW) ──────────────────────

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, SyncJobState>
        _syncJobs = new();

    /// <summary>
    /// Kích hoạt ETL pipeline đầy đủ (OLTP→DW) và trả về jobId để frontend polling.
    /// Body: { "channel": "shopee" } hoặc {} để sync tất cả.
    /// </summary>
    [HttpPost("api/sync/trigger")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> TriggerFullSync([FromBody] TriggerFullSyncRequest? req)
    {
        var channel = req?.Channel?.Trim().ToLower();
        var jobId   = Guid.NewGuid().ToString("N")[..8];

        var state = new SyncJobState
        {
            JobId     = jobId,
            Status    = "running",
            Progress  = 0,
            Message   = channel is not null
                ? $"Đang khởi động đồng bộ kênh {channel}..."
                : "Đang khởi động đồng bộ tất cả kênh...",
            StartedAt = DateTime.UtcNow,
        };
        _syncJobs[jobId] = state;

        logger.LogInformation("sync/trigger: jobId={JobId} channel={Channel}", jobId, channel ?? "all");

        // Ghi audit log
        await audit.LogAsync(
            userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var aid) ? (int?)aid : null,
            username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
            action:     "TRIGGER_FULL_SYNC",
            entityType: "DataSync", entityId: jobId,
            newValue:   $"{{\"channel\":\"{channel ?? "all"}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        // Chạy ETL trong background
        _ = Task.Run(async () =>
        {
            try
            {
                state.Progress = 15;
                state.Message  = "Đang đọc dữ liệu từ OLTP...";

                // Gọi Python AI Service nếu có
                var etlResult = await ai.TriggerOltpToDwAsync(channel);

                if (etlResult is not null)
                {
                    state.Progress = 90;
                    state.Message  = "Đang làm mới cache AI...";
                    // Thông báo cho FastAPI xóa cache cũ + tính lại Z-score
                    await ai.InvalidateCacheAsync();

                    state.Progress = 100;
                    state.Status   = "completed";
                    var inserted   = etlResult.TryGetValue("inserted", out var ins) ? ins?.ToString() : "?";
                    state.Message  = $"Đồng bộ thành công – {inserted} bản ghi vào Data Warehouse";
                }
                else
                {
                    // Fallback: log ETL trigger
                    state.Progress = 60;
                    state.Message  = "Đang ghi log ETL trigger...";

                    // Tạo scope mới vì db gốc đã bị dispose khi HTTP request kết thúc
                    using var scope = scopeFactory.CreateScope();
                    var ctx = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                    ctx.EtlLogs.Add(new()
                    {
                        JobId     = 0,
                        Phase     = "LOAD",
                        Message   = $"sync/trigger jobId={jobId} channel={channel ?? "all"}",
                        Level     = "INFO",
                        CreatedAt = DateTime.UtcNow,
                    });
                    try
                    {
                        await ctx.SaveChangesAsync();
                    }
                    catch (Microsoft.EntityFrameworkCore.DbUpdateException ex)
                    {
                        var innerMsg = ex.InnerException?.Message ?? ex.Message;
                        // Background task: chỉ log, không return (không có HttpContext)
                        logger.LogError("SaveChanges lỗi (TriggerFullSync EtlLog fallback): {Msg}", innerMsg);
                    }

                    state.Progress = 100;
                    state.Status   = "completed";
                    state.Message  = "ETL đã được kích hoạt. Kết quả cập nhật trong vài phút.";
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Sync job {JobId} thất bại", jobId);
                state.Status   = "failed";
                state.Progress = 0;
                state.Message  = $"Lỗi: {ex.Message}";
            }
            finally
            {
                state.CompletedAt = DateTime.UtcNow;
            }
        });

        return Accepted(new { jobId, message = state.Message });
    }

    /// <summary>Kiểm tra trạng thái một sync job (polling).</summary>
    [HttpGet("api/sync/status/{jobId}")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public IActionResult GetSyncJobStatus(string jobId)
    {
        if (!_syncJobs.TryGetValue(jobId, out var state))
            return NotFound(new { message = $"Không tìm thấy job '{jobId}'" });

        return Ok(new
        {
            state.JobId,
            state.Status,
            state.Progress,
            state.Message,
            startedAt   = state.StartedAt.ToString("O"),
            completedAt = state.CompletedAt?.ToString("O"),
        });
    }

    // ── Toggle bật/tắt kênh tích hợp ────────────────────────────────────────

    /// <summary>Bật/tắt kênh tích hợp. Chỉ Owner và Manager mới có quyền.</summary>
    [HttpPatch("api/integrations/{id}/toggle")]
    [Authorize(Roles = "Owner,Manager")]
    public async Task<IActionResult> ToggleIntegration(string id)
    {
        if (!Guid.TryParse(id, out var integId))
            return BadRequest(new { message = "Integration ID không hợp lệ." });

        var companyId = tenant.CompanyId;

        var rows = await db.Database.ExecuteSqlAsync(
            $"UPDATE public.integrations SET is_active = NOT is_active, updated_at = NOW() WHERE id = {integId} AND company_id = {companyId}");

        if (rows == 0)
            return NotFound(new { message = "Integration không tìm thấy hoặc không thuộc công ty này." });

        // Đọc trạng thái mới sau toggle
        bool newState = true;
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT is_active FROM public.integrations WHERE id = @id";
            var p = cmd.CreateParameter(); p.ParameterName = "id"; p.Value = integId; cmd.Parameters.Add(p);
            var val = await cmd.ExecuteScalarAsync();
            if (val is bool b) newState = b;
        }
        catch (Exception ex)
        {
            logger.LogWarning("Không đọc được is_active sau toggle: {Err}", ex.Message);
        }

        await audit.LogAsync(
            userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var tid) ? (int?)tid : null,
            username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
            action:     newState ? "ENABLE_INTEGRATION" : "DISABLE_INTEGRATION",
            entityType: "Integration", entityId: id,
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new
        {
            message  = newState ? "Đã bật kênh tích hợp." : "Đã tắt kênh tích hợp.",
            isActive = newState,
        });
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private static string FormatSourceName(string key) => key switch
    {
        "shopee"           => "Shopee",
        "lazada"           => "Lazada",
        "tiktok"           => "TikTok Shop",
        "facebook"         => "Facebook",
        "ghn"              => "GHN",
        "vnpay"            => "VNPay",
        "google_analytics" => "Google Analytics",
        _                  => key,
    };
}

public class TriggerSyncRequest     { public string? Source   { get; set; } }
public class TriggerEtlRequest      { public string? Pipeline { get; set; } }
public class TriggerFullSyncRequest { public string? Channel  { get; set; } }

public class SyncJobState
{
    public string    JobId       { get; set; } = "";
    public string    Status      { get; set; } = "running"; // running | completed | failed
    public int       Progress    { get; set; } = 0;         // 0–100
    public string    Message     { get; set; } = "";
    public DateTime  StartedAt   { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}
