namespace SalesAnalytics.Core.Enums;

public enum UserRole
{
    Owner,       // Chủ doanh nghiệp – quản trị toàn bộ công ty
    Manager,
    Staff,
    DataIT,
    Viewer,
    SuperAdmin   // Quản trị hệ thống – không thuộc tenant nào
}

public enum OrderStatus
{
    Pending,
    Confirmed,
    Shipped,
    Delivered,
    Cancelled,
    Returned
}

public enum ChannelType
{
    ECommerce,
    Social,
    Website,
    Other
}

/// <summary>Phương thức thanh toán hiển thị cho người dùng</summary>
public enum PaymentMethod
{
    CASH,           // Tiền mặt – xác nhận thủ công
    BANK_TRANSFER,  // Chuyển khoản ngân hàng – xác nhận thủ công
    VIETQR,         // VietQR – sinh QR thật, xác nhận qua SePay mock
    MOMO,           // Ví MoMo – mock callback nội bộ
    VNPAY           // VNPAY – mock callback nội bộ
}

/// <summary>Trạng thái giao dịch thanh toán</summary>
public enum PaymentStatus
{
    Pending,    // Chờ thanh toán
    Paid,       // Đã thanh toán
    Failed,     // Thất bại
    Cancelled,  // Đã huỷ
    Expired     // Hết hạn
}
