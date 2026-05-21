using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Biến thể sản phẩm – ánh xạ bảng public.product_variations (tạo mới 2026-05-21)</summary>
[Table("product_variations", Schema = "public")]
public class ProductVariation
{
    [Key] [Column("id")]
    public int Id { get; set; }

    [Column("company_id")]
    public Guid CompanyId { get; set; }

    [Column("product_id")]
    public int ProductId { get; set; }

    // ── Platform IDs ──────────────────────────────────────────────────────────
    [Column("shopee_model_id")]
    public long? ShopeeModelId { get; set; }

    [MaxLength(50)] [Column("tiktok_sku_id")]
    public string? TiktokSkuId { get; set; }

    [Column("lazada_sku_id")]
    public long? LazadaSkuId { get; set; }

    // ── Variation info ────────────────────────────────────────────────────────
    [Required] [MaxLength(100)] [Column("sku")]
    public string Sku { get; set; } = string.Empty;

    [MaxLength(255)] [Column("variation_name")]
    public string? VariationName { get; set; }

    [MaxLength(100)] [Column("attribute_color")]
    public string? AttributeColor { get; set; }

    [MaxLength(50)] [Column("attribute_size")]
    public string? AttributeSize { get; set; }

    // ── Giá ──────────────────────────────────────────────────────────────────
    [Column("original_price")]
    public decimal? OriginalPrice { get; set; }

    [Column("sale_price")]
    public decimal? SalePrice { get; set; }

    [MaxLength(10)] [Column("currency")]
    public string Currency { get; set; } = "VND";

    // ── Tồn kho ──────────────────────────────────────────────────────────────
    [Column("stock_quantity")]
    public int StockQuantity { get; set; } = 0;

    [MaxLength(100)] [Column("warehouse_id")]
    public string? WarehouseId { get; set; }

    // ── Media ────────────────────────────────────────────────────────────────
    [Column("image_url")]
    public string? ImageUrl { get; set; }

    // ── Trạng thái ───────────────────────────────────────────────────────────
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [MaxLength(50)] [Column("platform_status")]
    public string? PlatformStatus { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation ───────────────────────────────────────────────────────────
    [ForeignKey("ProductId")]
    public Product? Product { get; set; }
}
