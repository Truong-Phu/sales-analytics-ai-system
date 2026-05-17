namespace SalesAnalytics.Core.DTOs;

/// <summary>Thông tin gói dịch vụ hiện tại của company</summary>
public record SubscriptionDto(
    Guid      Id,
    string    Plan,
    string    Status,
    bool      AutoRenew,
    int       MaxChannels,
    int       MaxUsers,
    bool      AiEnabled,
    bool      AdvancedReports,
    DateTime  StartedAt,
    DateTime? ExpiresAt,
    DateTime? TrialEndsAt,
    DateTime? GraceEndsAt
);

/// <summary>Yêu cầu nâng cấp gói</summary>
public record UpgradeRequest(
    string Plan,           // "pro"
    string BillingCycle,   // "monthly" | "yearly"
    string PaymentMethod   // "vnpay" | "momo" | "bank_transfer"
);

/// <summary>Kết quả tạo invoice và URL thanh toán</summary>
public record UpgradeResponse(
    string            InvoiceCode,
    decimal           Amount,
    decimal           Tax,
    decimal           Total,
    string            PaymentMethod,
    string?           PaymentUrl,       // redirect nếu VNPay/Momo
    BankTransferInfo? BankInfo          // thông tin chuyển khoản nếu bank_transfer
);

/// <summary>Thông tin chuyển khoản ngân hàng</summary>
public record BankTransferInfo(
    string BankName,
    string AccountNumber,
    string AccountName,
    string Content,
    decimal Amount
);

/// <summary>Hóa đơn trong lịch sử thanh toán</summary>
public record InvoiceDto(
    Guid      Id,
    string    InvoiceCode,
    string    Plan,
    decimal   Amount,
    string    Currency,
    string?   PaymentMethod,
    string    PaymentStatus,
    DateTime? BillingPeriodStart,
    DateTime? BillingPeriodEnd,
    DateTime? PaidAt,
    string?   PdfUrl,
    DateTime  CreatedAt
);

/// <summary>Yêu cầu bật/tắt tự động gia hạn</summary>
public record AutoRenewRequest(
    bool AutoRenew
);

/// <summary>Webhook callback từ Momo</summary>
public record MomoWebhookDto(
    string  PartnerCode,
    string  OrderId,
    string  RequestId,
    long    Amount,
    string  OrderInfo,
    string  OrderType,
    long    TransId,
    int     ResultCode,
    string  Message,
    string  PayType,
    long    ResponseTime,
    string  ExtraData,
    string  Signature
);
