using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Infrastructure.Repositories;

/// <summary>Triển khai Repository đơn hàng dùng EF Core</summary>
public class OrderRepository(AppDbContext db)
    : GenericRepository<Order>(db), IOrderRepository
{
    /// <inheritdoc/>
    public async Task<IEnumerable<Order>> GetByDateRangeAsync(DateTime from, DateTime to)
        => await _set
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Channel)
            .Where(o => o.OrderDate >= from && o.OrderDate <= to)
            .OrderByDescending(o => o.OrderDate)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<IEnumerable<Order>> GetByStatusAsync(string status)
        => await _set
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Channel)
            .Where(o => o.Status == status)
            .OrderByDescending(o => o.OrderDate)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<IEnumerable<Order>> GetByCustomerAsync(int customerId)
        => await _set
            .AsNoTracking()
            .Include(o => o.Channel)
            .Include(o => o.OrderDetails).ThenInclude(d => d.Product)
            .Where(o => o.CustomerId == customerId)
            .OrderByDescending(o => o.OrderDate)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<(IEnumerable<Order> Items, int Total)> GetFilteredAsync(
        string? search, string? status, int? channelId, int page, int pageSize,
        Guid? companyId = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 20;

        var query = _set
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Channel)
            .AsQueryable();

        // Lọc theo company (null = SuperAdmin xem tất cả)
        if (companyId.HasValue)
            query = query.Where(o => o.CompanyId == companyId.Value);

        // Lọc theo trạng thái — hỗ trợ nhiều giá trị phân cách bằng dấu phẩy, case-insensitive
        // VD: status="PENDING,CONFIRMED" hoặc "pending,confirmed"
        if (!string.IsNullOrWhiteSpace(status))
        {
            var statuses = status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                 .Select(s => s.ToUpper())
                                 .ToArray();
            query = statuses.Length == 1
                ? query.Where(o => o.Status.ToUpper() == statuses[0])
                : query.Where(o => statuses.Contains(o.Status.ToUpper()));
        }

        // Lọc theo kênh
        if (channelId.HasValue)
            query = query.Where(o => o.ChannelId == channelId.Value);

        // Tìm kiếm theo mã đơn, tên khách hoặc external ID
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(o =>
                EF.Functions.ILike(o.OrderCode, $"%{search}%") ||
                (o.ExternalOrderId != null && EF.Functions.ILike(o.ExternalOrderId, $"%{search}%")) ||
                (o.Customer != null && EF.Functions.ILike(o.Customer.FullName, $"%{search}%")));

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(o => o.OrderDate)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, total);
    }

    /// <inheritdoc/>
    public async Task<Order?> GetWithDetailsAsync(int orderId)
        => await _set
            .Include(o => o.Customer)
            .Include(o => o.Channel)
            .Include(o => o.OrderDetails).ThenInclude(d => d.Product).ThenInclude(p => p!.Category)
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

    /// <inheritdoc/>
    public async Task<bool> OrderCodeExistsAsync(string orderCode, int? excludeId = null)
    {
        var query = _set.Where(o => o.OrderCode == orderCode);
        if (excludeId.HasValue)
            query = query.Where(o => o.OrderId != excludeId.Value);
        return await query.AnyAsync();
    }
}
