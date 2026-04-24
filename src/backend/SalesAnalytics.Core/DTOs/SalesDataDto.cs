namespace SalesAnalytics.Core.DTOs;

/// <summary>Dữ liệu bán hàng tổng hợp trả về cho client</summary>
public class SalesDataResponseDto
{
    public int     SalesDataId { get; set; }
    public int?    OrderId     { get; set; }
    public int     ChannelId   { get; set; }
    public string? ChannelName { get; set; }
    public decimal Revenue     { get; set; }
    public decimal Cost        { get; set; }
    public decimal Profit      { get; set; }
    public DateOnly SaleDate   { get; set; }
    public DateTime CreatedAt  { get; set; }
}

/// <summary>Tổng hợp doanh thu theo ngày (dùng cho Prophet forecast)</summary>
public class DailyRevenueSummaryDto
{
    /// <summary>Ngày (ds: yyyy-MM-dd)</summary>
    public string Date    { get; set; } = string.Empty;

    /// <summary>Tổng doanh thu trong ngày</summary>
    public decimal Revenue { get; set; }
}
