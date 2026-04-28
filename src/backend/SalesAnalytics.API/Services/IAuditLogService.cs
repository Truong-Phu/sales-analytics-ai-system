namespace SalesAnalytics.API.Services;

public interface IAuditLogService
{
    Task LogAsync(
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
        string? userAgent    = null);
}
