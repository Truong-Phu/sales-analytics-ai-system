using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Infrastructure.Repositories;

/// <summary>Triển khai Repository kênh bán hàng dùng EF Core</summary>
public class ChannelRepository(AppDbContext db)
    : GenericRepository<Channel>(db), IChannelRepository
{
    /// <inheritdoc/>
    public async Task<IEnumerable<Channel>> GetActiveChannelsAsync()
        => await _set
            .AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.ChannelName)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<IEnumerable<Channel>> GetByTypeAsync(string channelType)
        => await _set
            .AsNoTracking()
            .Where(c => c.ChannelType == channelType)
            .OrderBy(c => c.ChannelName)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task UpdateSyncStatusAsync(int channelId, string status, DateTime? lastSyncAt = null)
    {
        var channel = await _set.FindAsync(channelId);
        if (channel is null) return;

        channel.SyncStatus = status;
        channel.UpdatedAt  = DateTime.UtcNow;
        if (lastSyncAt.HasValue)
            channel.LastSyncAt = lastSyncAt.Value;

        await _db.SaveChangesAsync();
    }
}
