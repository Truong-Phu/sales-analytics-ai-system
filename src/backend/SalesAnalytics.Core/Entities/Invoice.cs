namespace SalesAnalytics.Core.Entities;

/// <summary>Hóa đơn thanh toán gói dịch vụ – ánh xạ bảng public.invoices</summary>
public class Invoice
{
    public Guid      Id                  { get; set; }
    public Guid      CompanyId           { get; set; }
    public Guid?     SubscriptionId      { get; set; }
    public string    InvoiceCode         { get; set; } = string.Empty;  // INV-20250507-001
    public string    Plan                { get; set; } = string.Empty;
    public decimal   Amount              { get; set; }
    public string    Currency            { get; set; } = "VND";
    public string?   PaymentMethod       { get; set; }  // vnpay | momo | bank_transfer
    public string    PaymentStatus       { get; set; } = "pending";  // pending | paid | failed | refunded
    public string?   PaymentGatewayRef   { get; set; }  // mã giao dịch VNPay/Momo
    public DateTime? BillingPeriodStart  { get; set; }
    public DateTime? BillingPeriodEnd    { get; set; }
    public DateTime? PaidAt              { get; set; }
    public string?   PdfUrl              { get; set; }
    public string?   Metadata            { get; set; }  // JSON
    public DateTime  CreatedAt           { get; set; } = DateTime.UtcNow;

    public Company?      Company      { get; set; }
    public Subscription? Subscription { get; set; }
}
