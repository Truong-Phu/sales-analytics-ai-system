using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Background job chạy mỗi 1 giờ, tự động tạo cảnh báo thông minh:
/// 1. Sản phẩm tồn kho &lt; 10 đơn vị
/// 2. Doanh thu ngày giảm &gt; 30% so với TB 7 ngày
/// 3. Tỷ lệ hoàn/hủy đơn kênh bán hàng &gt; 5%
/// 4. Đơn hàng "Chờ xử lý" quá 24 giờ
/// </summary>
public class SmartAlertJob : BackgroundService
{
    private readonly IServiceScopeFactory      _scopeFactory;
    private readonly ILogger<SmartAlertJob>    _logger;
    private static readonly TimeSpan           _interval = TimeSpan.FromHours(1);

    public SmartAlertJob(IServiceScopeFactory scopeFactory, ILogger<SmartAlertJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SmartAlertJob khởi động – kiểm tra cảnh báo mỗi {Hours}h", _interval.TotalHours);

        // Chạy ngay lần đầu sau khi khởi động xong (delay 30s để DB sẵn sàng)
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            await RunChecksAsync();
            try { await Task.Delay(_interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    public async Task RunChecksAsync()
    {
        _logger.LogInformation("SmartAlertJob: bắt đầu kiểm tra – {Time:HH:mm}", DateTime.Now);
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db  = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var now = DateTime.UtcNow;

            var companyIds = await db.Companies
                .Where(c => c.IsActive)
                .Select(c => c.Id)
                .ToListAsync();

            var notifs = new List<Notification>();

            foreach (var companyId in companyIds)
            {
                notifs.AddRange(await CheckLowStockAsync(db, companyId, now));
                notifs.AddRange(await CheckRevenueDropAsync(db, companyId, now));
                notifs.AddRange(await CheckReturnRateAsync(db, companyId, now));
                notifs.AddRange(await CheckPendingOrdersAsync(db, companyId, now));
            }

            if (notifs.Count > 0)
            {
                db.Notifications.AddRange(notifs);
                await db.SaveChangesAsync();
                _logger.LogInformation("SmartAlertJob: tạo {Count} cảnh báo mới", notifs.Count);
                await SendAlertEmailsAsync(scope, db, notifs);
            }
            else
            {
                _logger.LogInformation("SmartAlertJob: không có cảnh báo mới");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SmartAlertJob gặp lỗi trong RunChecksAsync");
        }
    }

    // ── 1. Tồn kho thấp ────────────────────────────────────────────────────────
    private static async Task<List<Notification>> CheckLowStockAsync(
        AppDbContext db, Guid companyId, DateTime now)
    {
        var result = new List<Notification>();

        var lowStock = await db.Products
            .Where(p => p.CompanyId == companyId && p.IsActive && p.StockQuantity < 10)
            .Select(p => new { p.ProductId, p.ProductName, p.StockQuantity })
            .ToListAsync();

        foreach (var p in lowStock)
        {
            var alertKey = $"low_stock_{p.ProductId}";
            if (await HasRecentAlertAsync(db, companyId, alertKey)) continue;

            var title = $"⚠️ Sắp hết hàng: {p.ProductName}";
            var body  = $"Tồn kho chỉ còn {p.StockQuantity} đơn vị. Cần nhập thêm hàng.";
            result.AddRange(await BuildNotificationsAsync(db, companyId, "warning", title, body, alertKey, now));
        }

        return result;
    }

    // ── 2. Doanh thu giảm > 30% so với TB 7 ngày ──────────────────────────────
    private static async Task<List<Notification>> CheckRevenueDropAsync(
        AppDbContext db, Guid companyId, DateTime now)
    {
        var result   = new List<Notification>();
        var today    = now.Date;

        // Chỉ check nếu đã có ít nhất 1 đơn hôm nay
        var todayCount = await db.Orders
            .CountAsync(o => o.CompanyId == companyId && o.OrderDate.Date == today);
        if (todayCount == 0) return result;

        var todayRevenue = await db.Orders
            .Where(o => o.CompanyId == companyId
                     && o.Status != "CANCELLED"
                     && o.OrderDate.Date == today)
            .SumAsync(o => (decimal?)o.TotalAmount) ?? 0m;

        var sevenDaysAgo = today.AddDays(-7);
        var dailyRevenues = await db.Orders
            .Where(o => o.CompanyId == companyId
                     && o.Status != "CANCELLED"
                     && o.OrderDate.Date >= sevenDaysAgo
                     && o.OrderDate.Date < today)
            .GroupBy(o => o.OrderDate.Date)
            .Select(g => g.Sum(o => (decimal?)o.TotalAmount) ?? 0m)
            .ToListAsync();

        if (dailyRevenues.Count == 0) return result;

        var avg7d = dailyRevenues.Average();
        if (avg7d <= 0) return result;

        var dropPct = (avg7d - todayRevenue) / avg7d * 100m;
        if (dropPct <= 30m) return result;

        var alertKey = $"revenue_drop_{companyId}_{today:yyyyMMdd}";
        if (await HasRecentAlertAsync(db, companyId, alertKey)) return result;

        var title = "📉 Doanh thu giảm mạnh hôm nay";
        var body  = $"Doanh thu hôm nay ({todayRevenue:N0}đ) giảm {dropPct:F0}% so với TB 7 ngày ({avg7d:N0}đ).";
        result.AddRange(await BuildNotificationsAsync(db, companyId, "warning", title, body, alertKey, now));
        return result;
    }

    // ── 3. Tỷ lệ hoàn/hủy > 5% theo kênh (7 ngày qua) ───────────────────────
    private static async Task<List<Notification>> CheckReturnRateAsync(
        AppDbContext db, Guid companyId, DateTime now)
    {
        var result       = new List<Notification>();
        var sevenDaysAgo = now.Date.AddDays(-7);

        var stats = await db.Orders
            .Where(o => o.CompanyId == companyId && o.OrderDate.Date >= sevenDaysAgo)
            .GroupBy(o => o.ChannelId)
            .Select(g => new
            {
                ChannelId  = g.Key,
                Total      = g.Count(),
                Cancelled  = g.Count(o => o.Status == "CANCELLED" || o.ShippingStatus == "RETURNED"),
            })
            .ToListAsync();

        foreach (var s in stats)
        {
            if (s.Total < 10) continue; // Chưa đủ mẫu
            var rate = (double)s.Cancelled / s.Total * 100.0;
            if (rate <= 5.0) continue;

            var alertKey = $"return_rate_{s.ChannelId}_{now.Date:yyyyMMdd}";
            if (await HasRecentAlertAsync(db, companyId, alertKey)) continue;

            var ch = await db.Channels.FindAsync(s.ChannelId);
            var channelName = ch?.ChannelName ?? $"Kênh #{s.ChannelId}";

            var title = $"🔄 Tỷ lệ hoàn đơn cao: {channelName}";
            var body  = $"{channelName}: {rate:F1}% đơn bị hủy/hoàn trong 7 ngày qua ({s.Cancelled}/{s.Total} đơn).";
            result.AddRange(await BuildNotificationsAsync(db, companyId, "warning", title, body, alertKey, now));
        }

        return result;
    }

    // ── 4. Đơn hàng Pending > 24h ──────────────────────────────────────────────
    private static async Task<List<Notification>> CheckPendingOrdersAsync(
        AppDbContext db, Guid companyId, DateTime now)
    {
        var result    = new List<Notification>();
        var threshold = now.AddHours(-24);

        var count = await db.Orders
            .CountAsync(o => o.CompanyId == companyId
                          && o.Status == "PENDING"
                          && o.CreatedAt < threshold);
        if (count == 0) return result;

        var alertKey = $"pending_orders_{companyId}_{now.Date:yyyyMMdd}";
        if (await HasRecentAlertAsync(db, companyId, alertKey)) return result;

        var title = "⏰ Đơn hàng chờ xử lý quá lâu";
        var body  = $"Có {count} đơn hàng đang ở trạng thái \"Chờ xử lý\" hơn 24 giờ. Vui lòng xử lý sớm.";
        result.AddRange(await BuildNotificationsAsync(db, companyId, "warning", title, body, alertKey, now));
        return result;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// <summary>Kiểm tra đã có cảnh báo tương tự trong 24h qua chưa (tránh spam)</summary>
    private static async Task<bool> HasRecentAlertAsync(AppDbContext db, Guid companyId, string alertKey)
    {
        // JSONB không hỗ trợ LIKE trực tiếp → dùng raw SQL với ::text cast
        var cutoff  = DateTime.UtcNow.AddHours(-23);
        var pattern = $"%{alertKey}%";
        return await db.Database
            .SqlQuery<bool>($"""
                SELECT EXISTS(
                    SELECT 1 FROM public.notifications
                    WHERE company_id = {companyId}::uuid
                      AND category   = 'anomaly'
                      AND data       IS NOT NULL
                      AND data::text LIKE {pattern}
                      AND created_at > {cutoff}
                )
                """)
            .SingleAsync();
    }

    /// <summary>Tạo Notification record cho tất cả Owner và Manager trong công ty</summary>
    private static async Task<List<Notification>> BuildNotificationsAsync(
        AppDbContext db, Guid companyId,
        string type, string title, string body, string alertKey, DateTime now)
    {
        var userIds = await db.Users
            .Where(u => u.CompanyId == companyId
                     && u.IsActive
                     && (u.Role == UserRole.Owner || u.Role == UserRole.Manager))
            .Select(u => u.Id)
            .ToListAsync();

        return userIds.Select(uid => new Notification
        {
            UserId    = uid,
            CompanyId = companyId,
            Type      = type,
            Category  = "anomaly",
            Title     = title,
            Body      = body,
            Data      = $"{{\"alertKey\":\"{alertKey}\"}}",
            Channels  = ["in_app"],
            IsRead    = false,
            CreatedAt = now,
        }).ToList();
    }

    private async Task SendAlertEmailsAsync(IServiceScope scope, AppDbContext db, List<Notification> notifs)
    {
        try
        {
            var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();
            var userIds      = notifs.Select(n => n.UserId).Distinct().ToList();

            var users = await db.Users
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.Email })
                .ToListAsync();

            // Users đã tắt EmailNotify hoặc AnomalyAlert → không gửi
            var disabledIds = (await db.NotificationPreferences
                .Where(p => userIds.Contains(p.UserId) && (!p.EmailNotify || !p.AnomalyAlert))
                .Select(p => p.UserId)
                .ToListAsync()).ToHashSet();

            foreach (var user in users)
            {
                if (disabledIds.Contains(user.Id)) continue;

                var userNotifs = notifs.Where(n => n.UserId == user.Id).ToList();
                var title = userNotifs.Count == 1
                    ? userNotifs[0].Title
                    : $"[MSAS] {userNotifs.Count} cảnh báo mới";
                var body = string.Join("\n\n", userNotifs.Select(n => $"• {n.Title}\n  {n.Body}"));

                await emailService.SendAlertAsync(user.Email, title, body);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SmartAlertJob: lỗi gửi email cảnh báo");
        }
    }
}
