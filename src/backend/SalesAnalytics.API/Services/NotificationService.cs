using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

public class NotificationRequest
{
    public string   Title    { get; set; } = string.Empty;
    public string?  Body     { get; set; }
    public string   Type     { get; set; } = "info";         // info|warning|error|success
    public string?  Category { get; set; }                   // sync|subscription|anomaly|system|auth
    public string?  Data     { get; set; }                   // JSON bổ sung
    public string[] Channels { get; set; } = ["in_app"];     // in_app|email|push
}

public interface INotificationService
{
    Task SendAsync(int userId, NotificationRequest req);
    Task SendToCompanyAsync(Guid companyId, NotificationRequest req);
    Task SendToRoleAsync(Guid companyId, string role, NotificationRequest req);
}

public class NotificationService(
    AppDbContext         db,
    IEmailService        emailService,
    IExpoPushService     expoPush,
    ILogger<NotificationService> logger) : INotificationService
{
    /// <summary>Gửi thông báo đến 1 user</summary>
    public async Task SendAsync(int userId, NotificationRequest req)
    {
        var user = await db.Users
            .Include(u => u.Company)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null) return;

        var notif = await SaveNotificationAsync(userId, user.CompanyId, req);

        // Email
        if (req.Channels.Contains("email") && user.Email != null)
            await TrySendEmailAsync(user, notif, req);

        // Push
        if (req.Channels.Contains("push"))
            await expoPush.SendToUserAsync(userId, req.Title, req.Body ?? "", req.Data);
    }

    /// <summary>Gửi đến tất cả user trong company</summary>
    public async Task SendToCompanyAsync(Guid companyId, NotificationRequest req)
    {
        var users = await db.Users
            .Where(u => u.CompanyId == companyId && u.IsActive)
            .ToListAsync();

        foreach (var user in users)
            await SendAsync(user.Id, req);
    }

    /// <summary>Gửi đến 1 role trong company</summary>
    public async Task SendToRoleAsync(Guid companyId, string role, NotificationRequest req)
    {
        var users = await db.Users
            .Where(u => u.CompanyId == companyId && u.IsActive && u.Role.ToString() == role)
            .ToListAsync();

        foreach (var user in users)
            await SendAsync(user.Id, req);
    }

    // ── Lưu vào DB ────────────────────────────────────────────────────────────
    private async Task<Notification> SaveNotificationAsync(int userId, Guid? companyId, NotificationRequest req)
    {
        var notif = new Notification
        {
            UserId    = userId,
            CompanyId = companyId,
            Type      = req.Type,
            Category  = req.Category,
            Title     = req.Title,
            Body      = req.Body,
            Data      = req.Data,
            Channels  = req.Channels,
        };
        db.Notifications.Add(notif);
        await db.SaveChangesAsync();
        return notif;
    }

    // ── Gửi email theo preference của user ───────────────────────────────────
    private async Task TrySendEmailAsync(User user, Notification notif, NotificationRequest req)
    {
        var pref = await db.NotificationPreferences
            .FirstOrDefaultAsync(p => p.UserId == user.Id);

        if (pref != null && !pref.EmailNotify) return;

        try
        {
            await emailService.SendOtpAsync(user.Email!, req.Title, req.Category ?? "system");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi gửi email notification cho user {UserId}", user.Id);
        }

        notif.SentEmail = true;
        await db.SaveChangesAsync();
    }
}
