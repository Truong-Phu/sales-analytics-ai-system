using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Khách hàng – ánh xạ bảng public.customers</summary>
[Table("customers", Schema = "public")]
public class Customer
{
    /// <summary>Mã khách hàng – khóa chính tự tăng</summary>
    [Key]
    [Column("customer_id")]
    public int CustomerId { get; set; }

    /// <summary>Mã nội bộ của khách hàng (tự sinh, VD: KH-000001)</summary>
    [MaxLength(50)]
    [Column("customer_code")]
    public string? CustomerCode { get; set; }

    /// <summary>Họ và tên đầy đủ</summary>
    [Required]
    [MaxLength(255)]
    [Column("full_name")]
    public string FullName { get; set; } = string.Empty;

    /// <summary>Địa chỉ email (tùy chọn)</summary>
    [MaxLength(255)]
    [Column("email")]
    public string? Email { get; set; }

    /// <summary>Số điện thoại</summary>
    [MaxLength(20)]
    [Column("phone_number")]
    public string? PhoneNumber { get; set; }

    /// <summary>Địa chỉ giao hàng (số nhà, đường, phường...)</summary>
    [Column("address")]
    public string? Address { get; set; }

    /// <summary>Tỉnh/Thành phố</summary>
    [MaxLength(100)]
    [Column("province")]
    public string? Province { get; set; }

    /// <summary>Quận/Huyện</summary>
    [MaxLength(100)]
    [Column("district")]
    public string? District { get; set; }

    /// <summary>Tổng số đơn hàng đã đặt (cập nhật tự động)</summary>
    [Column("total_orders")]
    public int TotalOrders { get; set; } = 0;

    /// <summary>Tổng chi tiêu tích lũy (VND) – cập nhật qua trigger</summary>
    [Column("total_spent")]
    public decimal TotalSpent { get; set; } = 0;

    /// <summary>Phân khúc khách hàng: VIP | REGULAR | NEW | INACTIVE</summary>
    [MaxLength(50)]
    [Column("segment_label")]
    public string? SegmentLabel { get; set; }

    /// <summary>Trạng thái hoạt động</summary>
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    /// <summary>Thời điểm tạo bản ghi</summary>
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Thời điểm cập nhật gần nhất</summary>
    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Navigation properties ────────────────────────────────────────────────

    /// <summary>Danh sách đơn hàng của khách hàng</summary>
    public ICollection<Order> Orders { get; set; } = [];
}
