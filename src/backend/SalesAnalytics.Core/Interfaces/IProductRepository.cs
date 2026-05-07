using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Core.Interfaces;

/// <summary>Repository sản phẩm – thêm các truy vấn nghiệp vụ đặc thù</summary>
public interface IProductRepository : IRepository<Product>
{
    /// <summary>Tìm sản phẩm theo tên (không phân biệt hoa/thường)</summary>
    Task<IEnumerable<Product>> SearchByNameAsync(string keyword);

    /// <summary>Lấy danh sách sản phẩm theo danh mục</summary>
    Task<IEnumerable<Product>> GetByCategoryAsync(int categoryId);

    /// <summary>Lấy sản phẩm đang hoạt động, có phân trang và tìm kiếm</summary>
    Task<(IEnumerable<Product> Items, int Total)> GetFilteredAsync(
        string? search, int? categoryId, bool? isActive, int page, int pageSize,
        Guid? companyId = null);

    /// <summary>Kiểm tra SKU đã tồn tại chưa (để tránh trùng)</summary>
    Task<bool> SkuExistsAsync(string sku, int? excludeId = null);
}
