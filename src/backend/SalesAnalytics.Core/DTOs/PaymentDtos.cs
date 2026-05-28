using SalesAnalytics.Core.Enums;

namespace SalesAnalytics.Core.DTOs;

// ── Requests ──────────────────────────────────────────────────────────────────

/// <summary>Khởi tạo thanh toán cho đơn hàng</summary>
public record InitiateOrderPaymentRequest(
    PaymentMethod Method  // CASH | VIETQR | MOMO | VNPAY
);

/// <summary>Xác nhận thanh toán thủ công (Cash)</summary>
public record ManualConfirmPaymentRequest(
    string? TransactionCode,
    string? Notes
);

/// <summary>Mock SePay webhook – giả lập thanh toán VietQR thành công</summary>
public record MockSePayRequest(
    string PaymentCode,
    decimal Amount,
    string? TransactionCode
);

/// <summary>Mock MoMo callback – giả lập kết quả thanh toán MoMo</summary>
public record MockMoMoRequest(
    string PaymentCode,
    string Result  // success | failed | cancelled
);

/// <summary>Mock VNPAY callback – giả lập kết quả thanh toán VNPAY</summary>
public record MockVNPayRequest(
    string PaymentCode,
    string Result  // success | failed | cancelled
);

/// <summary>Khởi tạo thanh toán gói dịch vụ</summary>
public record InitiateSubscriptionPaymentRequest(
    string Plan,           // pro | enterprise
    string BillingCycle,   // monthly | yearly
    PaymentMethod Method
);

/// <summary>Cập nhật cấu hình một phương thức thanh toán</summary>
public record UpdatePaymentMethodConfigRequest(
    bool Enabled,
    string? ConfigJson
);

// ── Responses ─────────────────────────────────────────────────────────────────

/// <summary>Thông tin giao dịch thanh toán</summary>
public record PaymentTransactionDto(
    Guid    Id,
    int?    OrderId,
    Guid?   InvoiceId,
    string  PaymentCode,
    string  PaymentMethod,
    decimal Amount,
    string  Currency,
    string  Status,
    string? TransactionCode,
    DateTime  CreatedAt,
    DateTime? PaidAt,
    DateTime? ExpiredAt,
    VietQRInfoDto? VietQRInfo   // có khi method là VIETQR
);

/// <summary>Thông tin VietQR (bao gồm thông tin CK để hiện dự phòng)</summary>
public record VietQRInfoDto(
    string QrDataUrl,
    string BankName,
    string? BankBin,
    string AccountNumber,
    string AccountHolder,
    string TransferContent,
    decimal Amount
);

/// <summary>Kết quả khởi tạo thanh toán đơn hàng</summary>
public record InitiatePaymentResponse(
    Guid    TransactionId,
    int?    OrderId,
    string  PaymentCode,
    string  PaymentMethod,
    string  Status,
    decimal Amount,
    string? MockPaymentUrl,
    VietQRInfoDto? VietQRInfo
);

/// <summary>Cấu hình phương thức thanh toán (response)</summary>
public record PaymentMethodConfigDto(
    Guid    Id,
    string  PaymentMethod,
    bool    Enabled,
    object? Config,
    DateTime UpdatedAt
);

/// <summary>Tóm tắt tổng quan payment cho SuperAdmin</summary>
public record PaymentSummaryDto(
    int TotalTransactions,
    int PendingCount,
    int PaidCount,
    int FailedCount,
    decimal TotalPaidAmount
);
