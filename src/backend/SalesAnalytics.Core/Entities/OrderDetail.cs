using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Chi tiết đơn hàng – ánh xạ bảng public.order_items</summary>
[Table("order_items", Schema = "public")]
public class OrderDetail
{
    /// <summary>Mã dòng chi tiết – khóa chính tự tăng</summary>
    [Key]
    [Column("item_id")]
    public int ItemId { get; set; }

    /// <summary>Mã đơn hàng chứa dòng này (FK → orders)</summary>
    [Column("order_id")]
    public int OrderId { get; set; }

    /// <summary>Mã sản phẩm (FK → products)</summary>
    [Column("product_id")]
    public int ProductId { get; set; }

    /// <summary>Số lượng sản phẩm trong dòng này</summary>
    [Column("quantity")]
    public int Quantity { get; set; }

    /// <summary>Đơn giá tại thời điểm mua (không phải giá hiện tại)</summary>
    [Column("unit_price")]
    public decimal UnitPrice { get; set; }

    /// <summary>Giảm giá cho dòng sản phẩm này (VND)</summary>
    [Column("discount")]
    public decimal Discount { get; set; } = 0;

    /// <summary>Thành tiền = quantity × unit_price - discount</summary>
    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Đơn hàng chứa dòng này</summary>
    [ForeignKey("OrderId")]
    public Order? Order { get; set; }

    /// <summary>Sản phẩm trong dòng này</summary>
    [ForeignKey("ProductId")]
    public Product? Product { get; set; }
}
