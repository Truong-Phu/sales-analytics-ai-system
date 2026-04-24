using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Infrastructure.Repositories;

/// <summary>
/// Triển khai Repository generic dùng EF Core + AppDbContext.
/// Tất cả Repository cụ thể kế thừa class này.
/// </summary>
public class GenericRepository<T>(AppDbContext db) : IRepository<T> where T : class
{
    protected readonly AppDbContext _db = db;
    protected readonly DbSet<T> _set = db.Set<T>();

    /// <inheritdoc/>
    public async Task<T?> GetByIdAsync(int id)
        => await _set.FindAsync(id);

    /// <inheritdoc/>
    public async Task<IEnumerable<T>> GetAllAsync()
        => await _set.AsNoTracking().ToListAsync();

    /// <inheritdoc/>
    public async Task<(IEnumerable<T> Items, int Total)> GetPagedAsync(int page, int pageSize)
    {
        // Đảm bảo giá trị hợp lệ
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 20;

        var total = await _set.CountAsync();
        var items = await _set
            .AsNoTracking()
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, total);
    }

    /// <inheritdoc/>
    public async Task<T> AddAsync(T entity)
    {
        await _set.AddAsync(entity);
        await _db.SaveChangesAsync();
        return entity;
    }

    /// <inheritdoc/>
    public async Task UpdateAsync(T entity)
    {
        _set.Update(entity);
        await _db.SaveChangesAsync();
    }

    /// <inheritdoc/>
    public async Task DeleteAsync(int id)
    {
        var entity = await _set.FindAsync(id);
        if (entity is null) return;
        _set.Remove(entity);
        await _db.SaveChangesAsync();
    }

    /// <inheritdoc/>
    public async Task<bool> ExistsAsync(int id)
        => await _set.FindAsync(id) is not null;
}
