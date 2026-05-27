namespace SalesAnalytics.Core.Entities;

/// <summary>
/// Cấu hình từng phương thức thanh toán – ánh xạ bảng public.payment_method_configs.
/// Lưu enable/disable và config JSON (thông tin ngân hàng, toggle mock, credentials sandbox tương lai).
/// Khác với SystemPaymentAccount (lưu credentials thật đã mã hóa cho gateway production).
/// </summary>
public class PaymentMethodConfig
{
    public Guid   Id            { get; set; }

    /// <summary>
    /// Key định danh phương thức: CASH | BANK_TRANSFER | VIETQR | MOMO | VNPAY
    ///                              | MOCK_SEPAY | MOCK_MOMO | MOCK_VNPAY
    /// </summary>
    public string PaymentMethod { get; set; } = string.Empty;

    public bool   Enabled       { get; set; } = true;

    /// <summary>
    /// JSON config linh hoạt theo từng method:
    /// - BANK_TRANSFER / VIETQR: bankName, bankBin, accountNumber, accountHolder, transferPrefix, qrTemplate
    /// - MOMO (future):  partnerCode, accessKey, secretKey
    /// - VNPAY (future): tmnCode, hashSecret
    /// - SEPAY (future): apiKey, webhookUrl
    /// </summary>
    public string? ConfigJson   { get; set; }

    public DateTime UpdatedAt   { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt   { get; set; } = DateTime.UtcNow;
}
