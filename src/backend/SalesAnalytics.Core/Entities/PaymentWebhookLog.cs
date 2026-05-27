namespace SalesAnalytics.Core.Entities;

/// <summary>
/// Log toàn bộ webhook/callback nhận được – ánh xạ bảng public.payment_webhook_logs.
/// Ghi cả mock lẫn (tương lai) webhook thật từ SePay/MoMo/VNPAY.
/// </summary>
public class PaymentWebhookLog
{
    public Guid   Id              { get; set; }
    public string Provider        { get; set; } = string.Empty;  // SEPAY | MOMO | VNPAY
    public string Payload         { get; set; } = string.Empty;  // JSON payload
    public string? Signature      { get; set; }                  // Chữ ký (nếu có)
    public string ProcessedStatus { get; set; } = "PENDING";     // SUCCESS | FAILED | IGNORED
    public string? Notes          { get; set; }                  // Ghi chú xử lý
    public DateTime CreatedAt     { get; set; } = DateTime.UtcNow;
}
