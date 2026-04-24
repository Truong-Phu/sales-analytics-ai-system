namespace SalesAnalytics.Core.Interfaces;

/// <summary>
/// Repository generic – CRUD cơ bản cho mọi entity.
/// Tất cả repository cụ thể kế thừa từ interface này.
/// </summary>
public interface IRepository<T> where T : class
{
    /// <summary>Lấy entity theo khóa chính</summary>
    Task<T?> GetByIdAsync(int id);

    /// <summary>Lấy toàn bộ danh sách (không phân trang – dùng cẩn thận với dữ liệu lớn)</summary>
    Task<IEnumerable<T>> GetAllAsync();

    /// <summary>Lấy danh sách có phân trang</summary>
    /// <param name="page">Số trang (bắt đầu từ 1)</param>
    /// <param name="pageSize">Số bản ghi mỗi trang</param>
    Task<(IEnumerable<T> Items, int Total)> GetPagedAsync(int page, int pageSize);

    /// <summary>Thêm entity mới</summary>
    Task<T> AddAsync(T entity);

    /// <summary>Cập nhật entity đã có</summary>
    Task UpdateAsync(T entity);

    /// <summary>Xóa entity theo khóa chính</summary>
    Task DeleteAsync(int id);

    /// <summary>Kiểm tra entity tồn tại</summary>
    Task<bool> ExistsAsync(int id);
}
