using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Interfaces;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.Infrastructure.Repositories;

/// <summary>Triển khai Repository sản phẩm dùng EF Core</summary>
public class ProductRepository(AppDbContext db)
    : GenericRepository<Product>(db), IProductRepository
{
    /// <inheritdoc/>
    public async Task<IEnumerable<Product>> SearchByNameAsync(string keyword)
        => await _set
            .AsNoTracking()
            .Include(p => p.Category)
            .Where(p => p.IsActive &&
                        (EF.Functions.ILike(p.ProductName, $"%{keyword}%") ||
                         EF.Functions.ILike(p.Sku, $"%{keyword}%")))
            .OrderBy(p => p.ProductName)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<IEnumerable<Product>> GetByCategoryAsync(int categoryId)
        => await _set
            .AsNoTracking()
            .Include(p => p.Category)
            .Where(p => p.CategoryId == categoryId && p.IsActive)
            .OrderBy(p => p.ProductName)
            .ToListAsync();

    /// <inheritdoc/>
    public async Task<(IEnumerable<Product> Items, int Total)> GetFilteredAsync(
        string? search, int? categoryId, bool? isActive, int page, int pageSize,
        Guid? companyId = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 200) pageSize = 20;

        var query = _set
            .AsNoTracking()
            .Include(p => p.Category)
            .AsQueryable();

        // Lọc theo company (null = SuperAdmin xem tất cả)
        if (companyId.HasValue)
            query = query.Where(p => p.CompanyId == companyId.Value);

        // Lọc theo trạng thái
        if (isActive.HasValue)
            query = query.Where(p => p.IsActive == isActive.Value);

        // Lọc theo danh mục — bao gồm danh mục con, xử lý cả duplicate global/company
        if (categoryId.HasValue)
        {
            // 1. Lấy tên của danh mục được chọn
            var selectedName = await _db.Set<Category>()
                .Where(c => c.CategoryId == categoryId.Value)
                .Select(c => c.CategoryName)
                .FirstOrDefaultAsync();

            if (selectedName != null)
            {
                // 2. Tìm tất cả ID có cùng tên (global + company duplicate)
                var sameNameIds = await _db.Set<Category>()
                    .Where(c => c.CategoryName == selectedName)
                    .Select(c => c.CategoryId)
                    .ToListAsync();

                // 3. Bao gồm chính nó + tất cả con của bất kỳ danh mục cùng tên
                var allIds = await _db.Set<Category>()
                    .Where(c => sameNameIds.Contains(c.CategoryId)
                             || (c.ParentId.HasValue && sameNameIds.Contains(c.ParentId.Value)))
                    .Select(c => c.CategoryId)
                    .ToListAsync();

                query = query.Where(p => allIds.Contains(p.CategoryId));
            }
        }

        // Tìm kiếm theo tên hoặc SKU
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(p =>
                EF.Functions.ILike(p.ProductName, $"%{search}%") ||
                EF.Functions.ILike(p.Sku, $"%{search}%"));

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, total);
    }

    /// <inheritdoc/>
    public async Task<bool> SkuExistsAsync(string sku, int? excludeId = null)
    {
        var query = _set.Where(p => p.Sku == sku);
        if (excludeId.HasValue)
            query = query.Where(p => p.ProductId != excludeId.Value);
        return await query.AnyAsync();
    }
}
