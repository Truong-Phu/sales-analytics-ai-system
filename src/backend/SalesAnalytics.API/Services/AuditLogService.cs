using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

public class AuditLogService : IAuditLogService
{
    private readonly AppDbContext _db;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(AppDbContext db, ILogger<AuditLogService> logger)
    {
        _db     = db;
        _logger = logger;
    }

    public async Task LogAsync(
        int?    userId,
        string  username,
        string  action,
        string? entityType   = null,
        string? entityId     = null,
        string? oldValue     = null,
        string? newValue     = null,
        string  status       = "SUCCESS",
        string? errorMessage = null,
        string? ipAddress    = null,
        string? userAgent    = null)
    {
        try
        {
            _db.AuditLogs.Add(new AuditLog
            {
                UserId       = userId,
                Username     = username,
                Action       = action,
                EntityType   = entityType,
                EntityId     = entityId,
                OldValue     = oldValue,
                NewValue     = newValue,
                Status       = status,
                ErrorMessage = errorMessage,
                IpAddress    = ipAddress,
                UserAgent    = userAgent,
                CreatedAt    = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Lỗi ghi audit log không được làm gián đoạn luồng nghiệp vụ chính
            _logger.LogWarning(ex, "Không thể ghi audit log: action={Action}", action);
        }
    }
}
