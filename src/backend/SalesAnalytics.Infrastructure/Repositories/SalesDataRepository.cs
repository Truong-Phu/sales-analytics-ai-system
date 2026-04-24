using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Infrastructure.Repositories;

/// <summary>Triển khai Repository dữ liệu bán hàng tổng hợp dùng EF Core</summary>
public class SalesDataRepository(AppDbContext db)
    : GenericRepository<SalesData>(db), ISalesDataRepository
{
    /// <inheritdoc/>
    public async Task<IEnumerable<SalesData>> GetRevenueByDateRangeAsync(
        DateOnly from, DateOnly to, int? channelId = null)
    {
        var query = _set
            .AsNoTracking()
            .Include(s => s.Channel)
            .Where(s => s.SaleDate >= from && s.SaleDate <= to);

        if (channelId.HasValue)
            query = query.Where(s => s.ChannelId == channelId.Value);

        return await query.OrderBy(s => s.SaleDate).ToListAsync();
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<SalesData>> GetByChannelAsync(int channelId)
        => await _set
            .AsNoTracking()
            .Where(s => s.ChannelId == channelId)
            .OrderByDescending(s => s.SaleDate)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<IEnumerable<(DateOnly Date, decimal Revenue)>> GetDailyRevenueSummaryAsync(
        DateOnly from, DateOnly to, int? channelId = null)
    {
        // Tổng hợp doanh thu theo ngày – dùng cho Prophet forecasting
        var query = _set
            .AsNoTracking()
            .Where(s => s.SaleDate >= from && s.SaleDate <= to);

        if (channelId.HasValue)
            query = query.Where(s => s.ChannelId == channelId.Value);

        var result = await query
            .GroupBy(s => s.SaleDate)
            .Select(g => new { Date = g.Key, Revenue = g.Sum(s => s.Revenue) })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return result.Select(x => (x.Date, x.Revenue));
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<SalesData>> GetUnprocessedAsync(DateTime since)
        => await _set
            .AsNoTracking()
            .Where(s => s.CreatedAt >= since)
            .OrderBy(s => s.CreatedAt)
            .ToListAsync();
}
