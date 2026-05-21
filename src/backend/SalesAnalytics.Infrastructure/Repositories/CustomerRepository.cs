using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Infrastructure.Repositories;

/// <summary>Triển khai Repository khách hàng dùng EF Core</summary>
public class CustomerRepository(AppDbContext db)
    : GenericRepository<Customer>(db), ICustomerRepository
{
    /// <inheritdoc/>
    public async Task<Customer?> SearchByPhoneAsync(string phone)
        => await _set
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Phone == phone && c.IsActive);

    /// <inheritdoc/>
    public async Task<Customer?> GetByEmailAsync(string email)
        => await _set
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Email == email && c.IsActive);

    /// <inheritdoc/>
    public async Task<(IEnumerable<Customer> Items, int Total)> GetFilteredAsync(
        string? search, string? segment, int page, int pageSize,
        Guid? companyId = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 20;

        var query = _set
            .AsNoTracking()
            .Where(c => c.IsActive)
            .AsQueryable();

        // Lọc theo company (null = SuperAdmin xem tất cả)
        if (companyId.HasValue)
            query = query.Where(c => c.CompanyId == companyId.Value);

        // Lọc theo phân khúc khách hàng
        if (!string.IsNullOrWhiteSpace(segment))
            query = query.Where(c => c.SegmentLabel == segment);

        // Tìm kiếm theo tên, số điện thoại hoặc mã KH
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(c =>
                EF.Functions.ILike(c.FullName, $"%{search}%") ||
                (c.Phone != null && EF.Functions.ILike(c.Phone, $"%{search}%")) ||
                (c.CustomerCode != null && EF.Functions.ILike(c.CustomerCode, $"%{search}%")));

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(c => c.TotalSpent)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, total);
    }

    /// <inheritdoc/>
    public async Task<IEnumerable<Customer>> GetTopBySpendingAsync(int topN = 10)
        => await _set
            .AsNoTracking()
            .Where(c => c.IsActive)
            .OrderByDescending(c => c.TotalSpent)
            .Take(topN)
            .ToListAsync();
}
