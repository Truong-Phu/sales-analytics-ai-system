using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Core.Interfaces;

/// <summary>Repository đơn hàng – thêm các truy vấn nghiệp vụ đặc thù</summary>
public interface IOrderRepository : IRepository<Order>
{
    /// <summary>Lấy đơn hàng theo khoảng thời gian</summary>
    Task<IEnumerable<Order>> GetByDateRangeAsync(DateTime from, DateTime to);

    /// <summary>Lấy đơn hàng theo trạng thái</summary>
    Task<IEnumerable<Order>> GetByStatusAsync(string status);

    /// <summary>Lấy tất cả đơn hàng của một khách hàng</summary>
    Task<IEnumerable<Order>> GetByCustomerAsync(int customerId);

    /// <summary>
    /// Lấy danh sách đơn hàng có phân trang, tìm kiếm và lọc theo trạng thái.
    /// Include Customer và Channel để tránh N+1.
    /// </summary>
    Task<(IEnumerable<Order> Items, int Total)> GetFilteredAsync(
        string? search, string? status, int? channelId, int page, int pageSize);

    /// <summary>Lấy đơn hàng kèm chi tiết (OrderDetails + Products)</summary>
    Task<Order?> GetWithDetailsAsync(int orderId);

    /// <summary>Kiểm tra mã đơn hàng đã tồn tại chưa</summary>
    Task<bool> OrderCodeExistsAsync(string orderCode, int? excludeId = null);
}
