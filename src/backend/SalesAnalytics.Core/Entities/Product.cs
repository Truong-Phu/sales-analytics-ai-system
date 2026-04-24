using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Sản phẩm – ánh xạ bảng public.products</summary>
[Table("products", Schema = "public")]
public class Product
{
    /// <summary>Mã sản phẩm – khóa chính tự tăng</summary>
    [Key]
    [Column("product_id")]
    public int ProductId { get; set; }

    /// <summary>Mã SKU nội bộ – duy nhất trên toàn hệ thống</summary>
    [Required]
    [MaxLength(100)]
    [Column("sku")]
    public string Sku { get; set; } = string.Empty;

    /// <summary>Tên sản phẩm</summary>
    [Required]
    [MaxLength(500)]
    [Column("product_name")]
    public string ProductName { get; set; } = string.Empty;

    /// <summary>Mô tả chi tiết sản phẩm</summary>
    [Column("description")]
    public string? Description { get; set; }

    /// <summary>Giá bán niêm yết (VND)</summary>
    [Column("base_price")]
    public decimal BasePrice { get; set; }

    /// <summary>Giá nhập / giá vốn (VND)</summary>
    [Column("cost_price")]
    public decimal? CostPrice { get; set; }

    /// <summary>Số lượng tồn kho hiện tại</summary>
    [Column("stock_quantity")]
    public int StockQuantity { get; set; } = 0;

    /// <summary>Mã danh mục sản phẩm (FK → categories)</summary>
    [Column("category_id")]
    public int CategoryId { get; set; }

    /// <summary>URL hình ảnh đại diện</summary>
    [Column("image_url")]
    public string? ImageUrl { get; set; }

    /// <summary>Trạng thái kinh doanh (true = đang bán)</summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>Thời điểm tạo bản ghi</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Thời điểm cập nhật gần nhất</summary>
    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Danh mục sản phẩm</summary>
    [ForeignKey("CategoryId")]
    public Category? Category { get; set; }

    /// <summary>Chi tiết đơn hàng chứa sản phẩm này</summary>
    public ICollection<OrderDetail> OrderDetails { get; set; } = [];
}
