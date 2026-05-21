using SalesAnalytics.Infrastructure.Data;
using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Background job tự động đồng bộ dữ liệu OLTP → Data Warehouse theo lịch:
/// - Incremental sync: mỗi 6 giờ (chỉ record mới từ lần sync trước)
/// - Full sync:        mỗi ngày lúc 2:00 sáng (toàn bộ dữ liệu)
/// Nếu AI Service không khả dụng → ghi EtlLog "scheduled_trigger" và bỏ qua.
/// </summary>
public class EtlSchedulerJob : BackgroundService
{
    private readonly IServiceScopeFactory        _scopeFactory;
    private readonly ILogger<EtlSchedulerJob>    _logger;

    private static readonly TimeSpan IncrementalInterval = TimeSpan.FromHours(6);
    private static readonly TimeSpan FullSyncHour        = TimeSpan.FromHours(2); // 2:00 sáng

    // Theo dõi ngày đã chạy full sync để không chạy lại trong cùng ngày
    private DateTime _lastFullSyncDate = DateTime.MinValue;

    public EtlSchedulerJob(
        IServiceScopeFactory     scopeFactory,
        ILogger<EtlSchedulerJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "EtlSchedulerJob khởi động — incremental mỗi {Hours}h, full sync lúc 02:00 sáng",
            IncrementalInterval.TotalHours);

        // Delay 60s sau khi khởi động để DB và AI Service sẵn sàng
        try { await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            var now = DateTime.Now;

            // Kiểm tra cửa sổ full sync (02:00–02:30) và chưa chạy hôm nay
            var isFullSyncWindow  = now.TimeOfDay >= FullSyncHour
                                 && now.TimeOfDay <  FullSyncHour.Add(TimeSpan.FromMinutes(30));
            var fullSyncNotToday  = _lastFullSyncDate.Date < now.Date;

            if (isFullSyncWindow && fullSyncNotToday)
            {
                _logger.LogInformation("EtlSchedulerJob: FULL sync lúc {Time}", now.ToString("HH:mm"));
                await RunSyncAsync(syncType: "full");
                _lastFullSyncDate = now;
            }
            else
            {
                _logger.LogInformation("EtlSchedulerJob: INCREMENTAL sync lúc {Time}", now.ToString("HH:mm"));
                await RunSyncAsync(syncType: "incremental");
            }

            try { await Task.Delay(IncrementalInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunSyncAsync(string syncType)
    {
        try
        {
            // Resolve AiProxyService từ scope riêng (HttpClient typed service = transient)
            using var scope = _scopeFactory.CreateScope();
            var ai = scope.ServiceProvider.GetRequiredService<AiProxyService>();

            var result = await ai.TriggerOltpToDwAsync(channel: null);

            if (result is not null)
            {
                await ai.InvalidateCacheAsync();

                var inserted = result.TryGetValue("inserted", out var ins) ? ins?.ToString() : "?";
                _logger.LogInformation(
                    "EtlSchedulerJob [{Type}]: hoàn thành — {Inserted} bản ghi vào DW",
                    syncType, inserted);

                // Trigger retrain AI model nếu có data mới (fire-and-forget, không block)
                var newRecords = int.TryParse(inserted, out var r) ? r : 0;
                if (newRecords > 0)
                {
                    var retrainResult = await ai.TriggerRetrainAsync();
                    if (retrainResult is not null)
                        _logger.LogInformation(
                            "EtlSchedulerJob [{Type}]: đã kích hoạt retrain AI (+{Records} records mới)",
                            syncType, newRecords);
                    else
                        _logger.LogWarning(
                            "EtlSchedulerJob [{Type}]: AI Service không phản hồi retrain — bỏ qua",
                            syncType);
                }

                await WriteEtlLogAsync(
                    phase:   "LOAD",
                    message: $"Auto {syncType} OK — inserted={inserted}" +
                             (newRecords > 0 ? " | retrain triggered" : ""),
                    level:   "INFO",
                    records: newRecords);
            }
            else
            {
                _logger.LogWarning(
                    "EtlSchedulerJob [{Type}]: AI Service không khả dụng — bỏ qua",
                    syncType);

                await WriteEtlLogAsync(
                    phase:   "GENERAL",
                    message: $"Auto {syncType} — AI Service unavailable, skipped",
                    level:   "WARN",
                    records: 0);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "EtlSchedulerJob [{Type}]: lỗi không mong đợi", syncType);

            await WriteEtlLogAsync(
                phase:   "GENERAL",
                message: $"Auto {syncType} FAILED: {ex.Message}",
                level:   "ERROR",
                records: 0);
        }
    }

    private async Task WriteEtlLogAsync(string phase, string message, string level, int records)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.EtlLogs.Add(new EtlLog
            {
                JobId        = 0,
                Phase        = phase,
                Message      = message,
                Level        = level,
                RecordsCount = records,
                CreatedAt    = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EtlSchedulerJob: không ghi được EtlLog");
        }
    }
}
