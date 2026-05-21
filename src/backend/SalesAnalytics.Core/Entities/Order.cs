using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Đơn hàng – ánh xạ bảng public.orders (chuẩn hóa Open Platform 2026-05-21)</summary>
[Table("orders", Schema = "public")]
public class Order
{
    [Key] [Column("order_id")]
    public int OrderId { get; set; }

    [Required] [MaxLength(100)] [Column("order_code")]
    public string OrderCode { get; set; } = string.Empty;

    [Column("customer_id")]
    public int CustomerId { get; set; }

    [Column("channel_id")]
    public int ChannelId { get; set; }

    // ── Status ───────────────────────────────────────────────────────────────
    [Required] [MaxLength(50)] [Column("status")]
    public string Status { get; set; } = "PENDING";

    [MaxLength(50)] [Column("platform_status")]
    public string? PlatformStatus { get; set; }

    // ── Platform identifiers ─────────────────────────────────────────────────
    [MaxLength(100)] [Column("platform_order_id")]
    public string? PlatformOrderId { get; set; }

    [MaxLength(200)] [Column("external_order_id")]
    public string? ExternalOrderId { get; set; }

    // ── Timestamps ───────────────────────────────────────────────────────────
    [Column("order_date")]
    public DateTime OrderDate { get; set; }

    [Column("platform_created_at")]
    public DateTime? PlatformCreatedAt { get; set; }

    [Column("platform_updated_at")]
    public DateTime? PlatformUpdatedAt { get; set; }

    [Column("paid_at")]
    public DateTime? PaidAt { get; set; }

    [Column("shipped_at")]
    public DateTime? ShippedAt { get; set; }

    [Column("delivered_at")]
    public DateTime? DeliveredAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Khách hàng ───────────────────────────────────────────────────────────
    [MaxLength(255)] [Column("buyer_username")]
    public string? BuyerUsername { get; set; }

    [MaxLength(255)] [Column("customer_name")]
    public string? CustomerName { get; set; }

    [MaxLength(30)] [Column("customer_phone")]
    public string? CustomerPhone { get; set; }

    [MaxLength(255)] [Column("customer_email")]
    public string? CustomerEmail { get; set; }

    // ── Địa chỉ giao hàng ────────────────────────────────────────────────────
    [MaxLength(255)] [Column("shipping_name")]
    public string? ShippingName { get; set; }

    [MaxLength(30)] [Column("shipping_phone")]
    public string? ShippingPhone { get; set; }

    [Column("shipping_address")]
    public string? ShippingAddress { get; set; }

    [MaxLength(100)] [Column("shipping_ward")]
    public string? ShippingWard { get; set; }

    [MaxLength(100)] [Column("shipping_district")]
    public string? ShippingDistrict { get; set; }

    [MaxLength(100)] [Column("shipping_province")]
    public string? ShippingProvince { get; set; }

    [MaxLength(10)] [Column("shipping_country")]
    public string? ShippingCountry { get; set; } = "VN";

    [MaxLength(20)] [Column("shipping_zipcode")]
    public string? ShippingZipcode { get; set; }

    [Column("shipping_full_address")]
    public string? ShippingFullAddress { get; set; }

    // ── Tài chính ────────────────────────────────────────────────────────────
    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    [Column("subtotal")]
    public decimal? Subtotal { get; set; }

    [Column("original_total")]
    public decimal? OriginalTotal { get; set; }

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; } = 0;

    [Column("seller_discount")]
    public decimal SellerDiscount { get; set; } = 0;

    [Column("platform_discount")]
    public decimal PlatformDiscount { get; set; } = 0;

    [Column("voucher_amount")]
    public decimal VoucherAmount { get; set; } = 0;

    [MaxLength(100)] [Column("voucher_code")]
    public string? VoucherCode { get; set; }

    [Column("tax_amount")]
    public decimal TaxAmount { get; set; } = 0;

    [Column("shipping_fee")]
    public decimal ShippingFee { get; set; } = 0;

    [Column("original_shipping_fee")]
    public decimal? OriginalShippingFee { get; set; }

    [Column("shipping_fee_seller_discount")]
    public decimal ShippingFeeSellerDiscount { get; set; } = 0;

    [Column("shipping_fee_platform_discount")]
    public decimal ShippingFeePlatformDiscount { get; set; } = 0;

    [MaxLength(10)] [Column("currency")]
    public string Currency { get; set; } = "VND";

    // ── Thanh toán ────────────────────────────────────────────────────────────
    [MaxLength(100)] [Column("payment_method")]
    public string? PaymentMethod { get; set; }

    [MaxLength(50)] [Column("payment_status")]
    public string PaymentStatus { get; set; } = "UNPAID";

    [Column("is_cod")]
    public bool IsCod { get; set; } = false;

    // ── Vận chuyển ───────────────────────────────────────────────────────────
    [MaxLength(50)] [Column("shipping_status")]
    public string ShippingStatus { get; set; } = "NOT_SHIPPED";

    [MaxLength(100)] [Column("shipping_carrier")]
    public string? ShippingCarrier { get; set; }

    [MaxLength(200)] [Column("tracking_number")]
    public string? TrackingNumber { get; set; }

    [MaxLength(50)] [Column("logistics_status")]
    public string? LogisticsStatus { get; set; }

    [MaxLength(50)] [Column("ghn_order_code")]
    public string? GhnOrderCode { get; set; }

    [Column("expected_delivery_at")]
    public DateTime? ExpectedDeliveryAt { get; set; }

    // ── Fulfillment & Channel ────────────────────────────────────────────────
    [MaxLength(50)] [Column("fulfillment_type")]
    public string? FulfillmentType { get; set; }

    [MaxLength(20)] [Column("channel_type")]
    public string ChannelType { get; set; } = "online";

    // ── Offline POS ──────────────────────────────────────────────────────────
    [Column("created_by_user_id")]
    public int? CreatedByUserId { get; set; }

    [Column("pos_note")]
    public string? PosNote { get; set; }

    // ── Metadata ─────────────────────────────────────────────────────────────
    [Column("note")]
    public string? Note { get; set; }

    [Column("cancel_reason")]
    public string? CancelReason { get; set; }

    [MaxLength(50)] [Column("cancel_by")]
    public string? CancelBy { get; set; }

    [Column("days_to_ship")]
    public int? DaysToShip { get; set; }

    [Column("ship_by_date")]
    public DateTime? ShipByDate { get; set; }

    // ── Multi-tenant ─────────────────────────────────────────────────────────
    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    [ForeignKey("CustomerId")]
    public Customer? Customer { get; set; }

    [ForeignKey("ChannelId")]
    public Channel? Channel { get; set; }

    public ICollection<OrderDetail> OrderDetails { get; set; } = [];
}
