using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Sản phẩm – ánh xạ bảng public.products (chuẩn hóa Open Platform 2026-05-21)</summary>
[Table("products", Schema = "public")]
public class Product
{
    [Key] [Column("product_id")]
    public int ProductId { get; set; }

    [Required] [MaxLength(100)] [Column("sku")]
    public string Sku { get; set; } = string.Empty;

    [Required] [MaxLength(500)] [Column("product_name")]
    public string ProductName { get; set; } = string.Empty;

    [Column("description")]
    public string? Description { get; set; }

    // ── Platform IDs ──────────────────────────────────────────────────────────
    [Column("shopee_item_id")]
    public long? ShopeeItemId { get; set; }

    [MaxLength(50)] [Column("tiktok_product_id")]
    public string? TiktokProductId { get; set; }

    [Column("lazada_item_id")]
    public long? LazadaItemId { get; set; }

    // ── Danh mục theo sàn ────────────────────────────────────────────────────
    [Column("shopee_category_id")]
    public int? ShopeeCategoryId { get; set; }

    [MaxLength(50)] [Column("tiktok_category_id")]
    public string? TiktokCategoryId { get; set; }

    [MaxLength(50)] [Column("lazada_primary_category")]
    public string? LazadaPrimaryCategory { get; set; }

    // ── Thông tin sản phẩm ───────────────────────────────────────────────────
    [MaxLength(100)] [Column("item_sku")]
    public string? ItemSku { get; set; }

    [MaxLength(255)] [Column("brand")]
    public string? Brand { get; set; }

    [MaxLength(20)] [Column("condition")]
    public string? Condition { get; set; } = "NEW";

    [Column("weight")]
    public decimal? Weight { get; set; }

    [Column("package_length")]
    public int? PackageLength { get; set; }

    [Column("package_width")]
    public int? PackageWidth { get; set; }

    [Column("package_height")]
    public int? PackageHeight { get; set; }

    // ── Giá ──────────────────────────────────────────────────────────────────
    [Column("base_price")]
    public decimal BasePrice { get; set; }

    [Column("original_price")]
    public decimal? OriginalPrice { get; set; }

    [Column("sale_price")]
    public decimal? SalePrice { get; set; }

    [Column("cost_price")]
    public decimal? CostPrice { get; set; }

    [MaxLength(10)] [Column("currency")]
    public string Currency { get; set; } = "VND";

    // ── Tồn kho ──────────────────────────────────────────────────────────────
    [Column("stock_quantity")]
    public int StockQuantity { get; set; } = 0;

    [Column("reserved_stock")]
    public int ReservedStock { get; set; } = 0;

    // ── Trạng thái ───────────────────────────────────────────────────────────
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [MaxLength(50)] [Column("platform_status")]
    public string? PlatformStatus { get; set; }

    // ── Logistics ────────────────────────────────────────────────────────────
    [Column("is_pre_order")]
    public bool IsPreOrder { get; set; } = false;

    [Column("days_to_ship")]
    public int DaysToShip { get; set; } = 2;

    // ── Media ────────────────────────────────────────────────────────────────
    [Column("image_url")]
    public string? ImageUrl { get; set; }

    [Column("image_url_list")]
    public string? ImageUrlList { get; set; }

    [Column("video_url")]
    public string? VideoUrl { get; set; }

    // ── Variations ───────────────────────────────────────────────────────────
    [Column("has_model")]
    public bool HasModel { get; set; } = false;

    // ── Timestamps ───────────────────────────────────────────────────────────
    [Column("platform_created_at")]
    public DateTime? PlatformCreatedAt { get; set; }

    [Column("platform_updated_at")]
    public DateTime? PlatformUpdatedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Multi-tenant ─────────────────────────────────────────────────────────
    [Column("category_id")]
    public int CategoryId { get; set; }

    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    [ForeignKey("CategoryId")]
    public Category? Category { get; set; }

    public ICollection<OrderDetail> OrderDetails { get; set; } = [];
    public ICollection<ProductVariation> Variations { get; set; } = [];
}
