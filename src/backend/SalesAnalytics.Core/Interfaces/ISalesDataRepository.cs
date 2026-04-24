using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.Core.Interfaces;

/// <summary>Repository dữ liệu bán hàng tổng hợp – thêm các truy vấn nghiệp vụ đặc thù</summary>
public interface ISalesDataRepository : IRepository<SalesData>
{
    /// <summary>Lấy dữ liệu doanh thu theo khoảng ngày và kênh</summary>
    Task<IEnumerable<SalesData>> GetRevenueByDateRangeAsync(
        DateOnly from, DateOnly to, int? channelId = null);

    /// <summary>Lấy dữ liệu bán hàng theo kênh cụ thể</summary>
    Task<IEnumerable<SalesData>> GetByChannelAsync(int channelId);

    /// <summary>
    /// Tổng hợp doanh thu theo ngày (dùng cho Prophet forecasting).
    /// Trả về chuỗi thời gian: ngày → tổng doanh thu.
    /// </summary>
    Task<IEnumerable<(DateOnly Date, decimal Revenue)>> GetDailyRevenueSummaryAsync(
        DateOnly from, DateOnly to, int? channelId = null);

    /// <summary>Lấy dữ liệu mới nhất chưa được xử lý bởi ETL</summary>
    Task<IEnumerable<SalesData>> GetUnprocessedAsync(DateTime since);
}
