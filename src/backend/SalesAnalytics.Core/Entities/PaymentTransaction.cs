using SalesAnalytics.Core.Enums;

namespace SalesAnalytics.Core.Entities;

/// <summary>
/// Giao dịch thanh toán – ánh xạ bảng public.payment_transactions.
/// Dùng cho cả thanh toán đơn hàng (OrderId != null) và thanh toán gói dịch vụ (InvoiceId != null).
/// </summary>
public class PaymentTransaction
{
    public Guid   Id          { get; set; }

    // Liên kết đơn hàng (nullable – chỉ set khi thanh toán đơn)
    public int?   OrderId     { get; set; }

    // Liên kết hóa đơn gói dịch vụ (nullable – chỉ set khi thanh toán subscription)
    public Guid?  InvoiceId   { get; set; }

    public Guid   TenantId    { get; set; }     // Company ID

    public string PaymentCode { get; set; } = string.Empty;  // DH_{OrderId} | SUB_{InvoiceCode}

    public PaymentMethod PaymentMethod { get; set; }

    public decimal Amount   { get; set; }
    public string  Currency { get; set; } = "VND";

    public PaymentStatus Status { get; set; } = PaymentStatus.Pending;

    public string? TransactionCode  { get; set; }   // Mã GD từ gateway/ngân hàng
    public string? GatewayResponse  { get; set; }   // JSON phản hồi gateway

    public DateTime  CreatedAt  { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt     { get; set; }
    public DateTime? ExpiredAt  { get; set; }
    public int?      CreatedBy  { get; set; }   // User ID tạo giao dịch

    // ── Navigation ────────────────────────────────────────────────────────────
    public Order?   Order   { get; set; }
    public Invoice? Invoice { get; set; }
    public User?    Creator { get; set; }
}
