using System.Text.Json;

namespace SalesAnalytics.Core.Entities;

/// <summary>Tài khoản thanh toán hệ thống — ánh xạ public.system_payment_accounts</summary>
public class SystemPaymentAccount
{
    public Guid     Id          { get; set; }
    public string   Method      { get; set; } = string.Empty;   // vnpay | momo | bank_transfer | zalopay
    public string   DisplayName { get; set; } = string.Empty;
    public bool     IsActive    { get; set; } = true;
    public bool     IsDefault   { get; set; } = false;
    public JsonDocument Config       { get; set; } = JsonDocument.Parse("{}");
    public JsonDocument ConfigMasked { get; set; } = JsonDocument.Parse("{}");
    public string?  Note        { get; set; }
    public int      SortOrder   { get; set; } = 0;
    public int?     CreatedBy   { get; set; }
    public DateTime CreatedAt   { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt   { get; set; } = DateTime.UtcNow;
}
