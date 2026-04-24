using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>
/// Dữ liệu bán hàng tổng hợp – ánh xạ bảng public.sales_data.
/// Bảng này lưu dữ liệu bán hàng sau khi được ETL chuẩn hóa từ nhiều kênh,
/// phục vụ cho Dashboard BI và AI Service (Prophet forecasting).
/// </summary>
[Table("sales_data", Schema = "public")]
public class SalesData
{
    /// <summary>Mã bản ghi – khóa chính tự tăng</summary>
    [Key]
    [Column("sales_data_id")]
    public int SalesDataId { get; set; }

    /// <summary>Mã đơn hàng tương ứng (FK → orders, nullable vì có thể là dữ liệu import)</summary>
    [Column("order_id")]
    public int? OrderId { get; set; }

    /// <summary>Mã kênh bán hàng (FK → sales_channels)</summary>
    [Column("channel_id")]
    public int ChannelId { get; set; }

    /// <summary>Doanh thu (VND) – tổng tiền thu được</summary>
    [Column("revenue")]
    public decimal Revenue { get; set; }

    /// <summary>Giá vốn / chi phí (VND)</summary>
    [Column("cost")]
    public decimal Cost { get; set; } = 0;

    /// <summary>Lợi nhuận gộp = Revenue - Cost (VND)</summary>
    [Column("profit")]
    public decimal Profit { get; set; }

    /// <summary>Ngày phát sinh giao dịch (dùng cho time-series AI)</summary>
    [Column("sale_date")]
    public DateOnly SaleDate { get; set; }

    /// <summary>Thời điểm tạo bản ghi</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Đơn hàng tương ứng (nếu có)</summary>
    [ForeignKey("OrderId")]
    public Order? Order { get; set; }

    /// <summary>Kênh bán hàng</summary>
    [ForeignKey("ChannelId")]
    public Channel? Channel { get; set; }
}
