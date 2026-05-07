using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Đơn hàng – ánh xạ bảng public.orders</summary>
[Table("orders", Schema = "public")]
public class Order
{
    /// <summary>Mã đơn hàng – khóa chính tự tăng</summary>
    [Key]
    [Column("order_id")]
    public int OrderId { get; set; }

    /// <summary>Mã đơn nội bộ (định dạng: ORD-YYYYMMDD-XXXX) – duy nhất</summary>
    [Required]
    [MaxLength(100)]
    [Column("order_code")]
    public string OrderCode { get; set; } = string.Empty;

    /// <summary>Mã khách hàng đặt đơn (FK → customers)</summary>
    [Column("customer_id")]
    public int CustomerId { get; set; }

    /// <summary>Mã kênh bán hàng phát sinh đơn (FK → sales_channels)</summary>
    [Column("channel_id")]
    public int ChannelId { get; set; }

    /// <summary>Trạng thái đơn: PENDING | CONFIRMED | SHIPPING | DELIVERED | CANCELLED | RETURNED</summary>
    [Required]
    [MaxLength(50)]
    [Column("status")]
    public string Status { get; set; } = "PENDING";

    /// <summary>Tổng giá trị đơn hàng trước giảm giá (VND)</summary>
    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    /// <summary>Tổng tiền giảm giá (VND)</summary>
    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; } = 0;

    /// <summary>Phí vận chuyển (VND)</summary>
    [Column("shipping_fee")]
    public decimal ShippingFee { get; set; } = 0;

    /// <summary>Phương thức thanh toán (COD, MOMO, VNPAY...)</summary>
    [MaxLength(50)]
    [Column("payment_method")]
    public string? PaymentMethod { get; set; }

    /// <summary>Trạng thái thanh toán: UNPAID | PAID | REFUNDED</summary>
    [MaxLength(50)]
    [Column("payment_status")]
    public string PaymentStatus { get; set; } = "UNPAID";

    /// <summary>Trạng thái vận chuyển: NOT_SHIPPED | IN_TRANSIT | DELIVERED | FAILED</summary>
    [MaxLength(50)]
    [Column("shipping_status")]
    public string ShippingStatus { get; set; } = "NOT_SHIPPED";

    /// <summary>Ngày giờ đặt hàng</summary>
    [Column("order_date")]
    public DateTime OrderDate { get; set; }

    /// <summary>Ngày giờ giao hàng thành công (null nếu chưa giao)</summary>
    [Column("delivered_at")]
    public DateTime? DeliveredAt { get; set; }

    /// <summary>Mã đơn hàng từ sàn TMĐT bên ngoài (Shopee order_sn, Lazada...)</summary>
    [MaxLength(200)]
    [Column("external_order_id")]
    public string? ExternalOrderId { get; set; }

    /// <summary>Thời điểm tạo bản ghi</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Thời điểm cập nhật gần nhất</summary>
    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Công ty sở hữu đơn hàng – multi-tenant isolation</summary>
    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Khách hàng đặt đơn</summary>
    [ForeignKey("CustomerId")]
    public Customer? Customer { get; set; }

    /// <summary>Kênh bán hàng phát sinh đơn</summary>
    [ForeignKey("ChannelId")]
    public Channel? Channel { get; set; }

    /// <summary>Danh sách sản phẩm trong đơn hàng</summary>
    public ICollection<OrderDetail> OrderDetails { get; set; } = [];
}
