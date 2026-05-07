using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Core.Interfaces;

/// <summary>Repository khách hàng – thêm các truy vấn nghiệp vụ đặc thù</summary>
public interface ICustomerRepository : IRepository<Customer>
{
    /// <summary>Tìm khách hàng theo số điện thoại</summary>
    Task<Customer?> SearchByPhoneAsync(string phone);

    /// <summary>Tìm khách hàng theo email</summary>
    Task<Customer?> GetByEmailAsync(string email);

    /// <summary>
    /// Lấy danh sách có phân trang, tìm kiếm và lọc theo phân khúc.
    /// </summary>
    Task<(IEnumerable<Customer> Items, int Total)> GetFilteredAsync(
        string? search, string? segment, int page, int pageSize,
        Guid? companyId = null);

    /// <summary>Lấy top khách hàng theo tổng chi tiêu</summary>
    Task<IEnumerable<Customer>> GetTopBySpendingAsync(int topN = 10);
}
