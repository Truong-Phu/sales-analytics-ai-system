using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Background job chạy hàng ngày lúc 8:00 sáng:
/// - Downgrade về Free khi subscription hết hạn
/// - Khóa tính năng Pro khi qua grace period
/// </summary>
public class SubscriptionExpiryJob : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SubscriptionExpiryJob> _logger;

    public SubscriptionExpiryJob(IServiceScopeFactory scopeFactory,
        ILogger<SubscriptionExpiryJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SubscriptionExpiryJob khởi động");

        while (!stoppingToken.IsCancellationRequested)
        {
            // Tính thời gian đợi đến 8:00 sáng hôm sau
            var delay = TimeUntilNextRun(TimeSpan.FromHours(8));
            _logger.LogInformation("SubscriptionExpiryJob: chạy tiếp theo sau {Delay:hh\\:mm}", delay);

            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }

            await RunChecksAsync();
        }
    }

    private async Task RunChecksAsync()
    {
        _logger.LogInformation("SubscriptionExpiryJob: bắt đầu kiểm tra hết hạn");
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = DateTime.UtcNow;

            // 1. Đánh dấu expired cho subscriptions quá hạn nhưng còn trong grace period
            var justExpired = await db.Subscriptions
                .Where(s => s.Status == "active"
                         && s.Plan != "free"
                         && s.ExpiresAt.HasValue
                         && s.ExpiresAt.Value < now)
                .ToListAsync();

            foreach (var sub in justExpired)
            {
                sub.Status    = "expired";
                sub.UpdatedAt = now;
                _logger.LogWarning("Subscription hết hạn: company_id={CompanyId}", sub.CompanyId);
            }

            // 2. Downgrade về Free khi qua grace period (3 ngày sau ExpiresAt)
            var gracePassed = await db.Subscriptions
                .Where(s => s.Status == "expired"
                         && s.GraceEndsAt.HasValue
                         && s.GraceEndsAt.Value < now)
                .ToListAsync();

            foreach (var sub in gracePassed)
            {
                sub.Plan            = "free";
                sub.Status          = "active";
                sub.AiEnabled       = false;
                sub.AdvancedReports = false;
                sub.MaxChannels     = 2;
                sub.MaxUsers        = 3;
                sub.ExpiresAt       = null;
                sub.GraceEndsAt     = null;
                sub.UpdatedAt       = now;
                _logger.LogInformation("Downgrade về Free: company_id={CompanyId}", sub.CompanyId);
            }

            await db.SaveChangesAsync();

            _logger.LogInformation(
                "SubscriptionExpiryJob hoàn thành: {Expired} hết hạn, {Downgraded} downgrade",
                justExpired.Count, gracePassed.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SubscriptionExpiryJob gặp lỗi");
        }
    }

    // Tính thời gian đến lần chạy tiếp theo (mặc định 8:00 sáng)
    private static TimeSpan TimeUntilNextRun(TimeSpan targetTime)
    {
        var now  = DateTime.Now;
        var next = DateTime.Today.Add(targetTime);
        if (next <= now) next = next.AddDays(1);
        return next - now;
    }
}
