using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SalesAnalytics.Core.Entities;

/// <summary>Khách hàng – ánh xạ bảng public.customers (chuẩn hóa Open Platform 2026-05-21)</summary>
[Table("customers", Schema = "public")]
public class Customer
{
    [Key] [Column("customer_id")]
    public int CustomerId { get; set; }

    [MaxLength(50)] [Column("customer_code")]
    public string? CustomerCode { get; set; }

    [Required] [MaxLength(255)] [Column("full_name")]
    public string FullName { get; set; } = string.Empty;

    // ── Platform IDs ──────────────────────────────────────────────────────────
    [Column("shopee_buyer_id")]
    public long? ShopeeBuyerId { get; set; }

    [MaxLength(50)] [Column("tiktok_user_id")]
    public string? TiktokUserId { get; set; }

    [MaxLength(50)] [Column("lazada_customer_id")]
    public string? LazadaCustomerId { get; set; }

    // ── Thông tin cơ bản ────────────────────────────────────────────────────
    [MaxLength(255)] [Column("username")]
    public string? Username { get; set; }

    [MaxLength(100)] [Column("first_name")]
    public string? FirstName { get; set; }

    [MaxLength(100)] [Column("last_name")]
    public string? LastName { get; set; }

    [MaxLength(255)] [Column("email")]
    public string? Email { get; set; }

    [MaxLength(30)] [Column("phone")]
    public string? Phone { get; set; }

    // ── Địa chỉ ─────────────────────────────────────────────────────────────
    [Column("address")]
    public string? Address { get; set; }

    [MaxLength(100)] [Column("ward")]
    public string? Ward { get; set; }

    [MaxLength(100)] [Column("district")]
    public string? District { get; set; }

    [MaxLength(100)] [Column("province")]
    public string? Province { get; set; }

    [Column("full_address")]
    public string? FullAddress { get; set; }

    // ── Tổng hợp từ orders ──────────────────────────────────────────────────
    [Column("total_orders")]
    public int TotalOrders { get; set; } = 0;

    [Column("total_spent")]
    public decimal TotalSpent { get; set; } = 0;

    [Column("avg_order_value")]
    public decimal? AvgOrderValue { get; set; }

    [Column("first_order_at")]
    public DateTime? FirstOrderAt { get; set; }

    [Column("last_order_at")]
    public DateTime? LastOrderAt { get; set; }

    // ── Phân khúc cũ ────────────────────────────────────────────────────────
    [MaxLength(50)] [Column("segment_label")]
    public string? SegmentLabel { get; set; }

    // ── RFM (từ AI Service) ───────────────────────────────────────────────────
    [MaxLength(50)] [Column("rfm_segment")]
    public string? RfmSegment { get; set; }

    [Column("rfm_score")]
    public int? RfmScore { get; set; }

    [Column("rfm_r_score")]
    public int? RfmRScore { get; set; }

    [Column("rfm_f_score")]
    public int? RfmFScore { get; set; }

    [Column("rfm_m_score")]
    public int? RfmMScore { get; set; }

    [Column("rfm_updated_at")]
    public DateTime? RfmUpdatedAt { get; set; }

    // ── Loyalty ──────────────────────────────────────────────────────────────
    [Column("loyalty_points")]
    public int LoyaltyPoints { get; set; } = 0;

    [MaxLength(30)] [Column("loyalty_tier")]
    public string? LoyaltyTier { get; set; }

    [Column("birthday")]
    public DateOnly? Birthday { get; set; }

    // ── Nguồn chính ──────────────────────────────────────────────────────────
    [MaxLength(50)] [Column("primary_channel")]
    public string? PrimaryChannel { get; set; }

    // ── Trạng thái ───────────────────────────────────────────────────────────
    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // ── Multi-tenant ─────────────────────────────────────────────────────────
    [Column("company_id")]
    public Guid? CompanyId { get; set; }

    // ── Navigation ───────────────────────────────────────────────────────────
    public ICollection<Order> Orders { get; set; } = [];
}
