using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Danh mục sản phẩm – ánh xạ bảng public.categories</summary>
[Table("categories", Schema = "public")]
public class Category
{
    /// <summary>Mã danh mục – khóa chính tự tăng</summary>
    [Key]
    [Column("category_id")]
    public int CategoryId { get; set; }

    /// <summary>Tên danh mục sản phẩm</summary>
    [Required]
    [MaxLength(255)]
    [Column("category_name")]
    public string CategoryName { get; set; } = string.Empty;

    /// <summary>Mô tả danh mục (tùy chọn)</summary>
    [Column("description")]
    public string? Description { get; set; }

    /// <summary>Danh mục cha (NULL nếu là danh mục gốc)</summary>
    [Column("parent_id")]
    public int? ParentId { get; set; }

    /// <summary>Cấp độ trong cây phân cấp (1 = gốc, tối đa 5)</summary>
    [Column("level")]
    public short Level { get; set; } = 1;

    /// <summary>Trạng thái hoạt động</summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>Thời điểm tạo bản ghi</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Danh mục cha (self-reference)</summary>
    [ForeignKey("ParentId")]
    public Category? Parent { get; set; }

    /// <summary>Danh sách danh mục con</summary>
    public ICollection<Category> Children { get; set; } = [];

    /// <summary>Danh sách sản phẩm thuộc danh mục này</summary>
    public ICollection<Product> Products { get; set; } = [];
}
