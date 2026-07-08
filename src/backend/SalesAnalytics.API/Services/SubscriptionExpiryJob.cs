using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Background job chạy hàng ngày lúc 8:00 sáng:
/// - Downgrade về Free khi subscription hết hạn
/// - Khóa tính năng Pro khi qua grace period
/// - Gửi email cảnh báo sắp hết hạn (7 ngày và 1 ngày trước)
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
            var db    = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
            var now   = DateTime.UtcNow;

            // 1. Hết trial → downgrade về Free + gửi email
            var trialExpired = await db.Subscriptions
                .Include(s => s.Company)
                .Where(s => s.Status == "trial"
                         && s.TrialEndsAt.HasValue
                         && s.TrialEndsAt.Value < now)
                .ToListAsync();

            foreach (var sub in trialExpired)
            {
                sub.Plan            = "free";
                sub.Status          = "active";
                sub.AiEnabled       = false;
                sub.AdvancedReports = false;
                sub.MaxChannels     = 1;
                sub.MaxUsers        = 3;
                sub.TrialEndsAt     = null;
                sub.ExpiresAt       = null;
                sub.UpdatedAt       = now;
                _logger.LogInformation("Trial hết hạn → downgrade Free: company_id={CompanyId}", sub.CompanyId);

                if (sub.Company is null) continue;
                var ownerEmail = await db.Users
                    .Where(u => u.CompanyId == sub.CompanyId && u.Role == UserRole.Owner && u.IsActive)
                    .Select(u => u.Email)
                    .FirstOrDefaultAsync();
                var target = ownerEmail ?? sub.Company.Email;
                if (!string.IsNullOrEmpty(target))
                    await email.SendTrialExpiredAsync(target, sub.Company.Name);
            }

            // 2. Đánh dấu expired cho subscriptions quá hạn nhưng còn trong grace period
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
                sub.MaxChannels     = 1;
                sub.MaxUsers        = 3;
                sub.ExpiresAt       = null;
                sub.GraceEndsAt     = null;
                sub.UpdatedAt       = now;
                _logger.LogInformation("Downgrade về Free: company_id={CompanyId}", sub.CompanyId);
            }

            await db.SaveChangesAsync();

            // 3. Gửi email cảnh báo sắp hết hạn (7 ngày và 1 ngày trước)
            // Job chạy 1 lần/ngày → dùng window ±12h để tránh bỏ sót hoặc gửi 2 lần
            var warningWindows = new[] { 7, 1 };
            foreach (var daysLeft in warningWindows)
            {
                var windowStart = now.AddDays(daysLeft - 0.5);
                var windowEnd   = now.AddDays(daysLeft + 0.5);

                var soonExpiring = await db.Subscriptions
                    .Include(s => s.Company)
                    .Where(s => s.Status == "active"
                             && s.Plan != "free"
                             && s.ExpiresAt.HasValue
                             && s.ExpiresAt.Value >= windowStart
                             && s.ExpiresAt.Value <  windowEnd)
                    .ToListAsync();

                foreach (var sub in soonExpiring)
                {
                    if (sub.Company is null || sub.ExpiresAt is null) continue;

                    // Lấy email Owner của công ty
                    var ownerEmail = await db.Users
                        .Where(u => u.CompanyId == sub.CompanyId && u.Role == UserRole.Owner && u.IsActive)
                        .Select(u => u.Email)
                        .FirstOrDefaultAsync();

                    var target = ownerEmail ?? sub.Company.Email;
                    if (string.IsNullOrEmpty(target)) continue;

                    var sent = await email.SendSubscriptionExpiryWarningAsync(
                        target, sub.Company.Name, sub.ExpiresAt.Value, daysLeft);

                    _logger.LogInformation(
                        "Cảnh báo hết hạn ({Days}d): company={CompanyId} email={Email} sent={Sent}",
                        daysLeft, sub.CompanyId, target, sent);
                }
            }

            _logger.LogInformation(
                "SubscriptionExpiryJob hoàn thành: {Trial} trial→free, {Expired} hết hạn, {Downgraded} downgrade",
                trialExpired.Count, justExpired.Count, gracePassed.Count);
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
