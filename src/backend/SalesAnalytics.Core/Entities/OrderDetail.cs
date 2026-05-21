using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Chi tiết đơn hàng – ánh xạ bảng public.order_items (chuẩn hóa Open Platform 2026-05-21)</summary>
[Table("order_items", Schema = "public")]
public class OrderDetail
{
    [Key] [Column("item_id")]
    public int ItemId { get; set; }

    [Column("order_id")]
    public int OrderId { get; set; }

    [Column("product_id")]
    public int ProductId { get; set; }

    // ── Platform IDs ──────────────────────────────────────────────────────────
    [MaxLength(100)] [Column("platform_item_id")]
    public string? PlatformItemId { get; set; }

    [MaxLength(100)] [Column("platform_order_item_id")]
    public string? PlatformOrderItemId { get; set; }

    [MaxLength(100)] [Column("model_id")]
    public string? ModelId { get; set; }

    [MaxLength(100)] [Column("sku_id")]
    public string? SkuId { get; set; }

    // ── Sản phẩm ─────────────────────────────────────────────────────────────
    [Column("product_name")]
    public string? ProductName { get; set; }

    [MaxLength(100)] [Column("sku")]
    public string? Sku { get; set; }

    [MaxLength(255)] [Column("variation_name")]
    public string? VariationName { get; set; }

    // ── Giá ──────────────────────────────────────────────────────────────────
    [Column("unit_price")]
    public decimal UnitPrice { get; set; }

    [Column("original_price")]
    public decimal? OriginalPrice { get; set; }

    [Column("sale_price")]
    public decimal? SalePrice { get; set; }

    [Column("discount")]
    public decimal Discount { get; set; } = 0;

    [Column("platform_discount")]
    public decimal PlatformDiscount { get; set; } = 0;

    [Column("seller_discount")]
    public decimal SellerDiscount { get; set; } = 0;

    // ── Số lượng & tổng ──────────────────────────────────────────────────────
    [Column("quantity")]
    public int Quantity { get; set; }

    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    [Column("weight")]
    public decimal? Weight { get; set; }

    // ── Media ────────────────────────────────────────────────────────────────
    [Column("image_url")]
    public string? ImageUrl { get; set; }

    // ── Tracking ─────────────────────────────────────────────────────────────
    [MaxLength(100)] [Column("package_id")]
    public string? PackageId { get; set; }

    [MaxLength(100)] [Column("tracking_number")]
    public string? TrackingNumber { get; set; }

    [MaxLength(50)] [Column("package_status")]
    public string? PackageStatus { get; set; }

    // ── Promotion ────────────────────────────────────────────────────────────
    [MaxLength(100)] [Column("promotion_type")]
    public string? PromotionType { get; set; }

    [MaxLength(100)] [Column("promotion_id")]
    public string? PromotionId { get; set; }

    [MaxLength(10)] [Column("currency")]
    public string Currency { get; set; } = "VND";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation ────────────────────────────────────────────────────────────
    [ForeignKey("OrderId")]
    public Order? Order { get; set; }

    [ForeignKey("ProductId")]
    public Product? Product { get; set; }
}
