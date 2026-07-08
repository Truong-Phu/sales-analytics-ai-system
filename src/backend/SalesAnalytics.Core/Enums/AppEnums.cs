namespace SalesAnalytics.Core.Enums;

public enum UserRole
{
    Owner,           // Chủ doanh nghiệp – quản trị toàn bộ công ty
    Manager,
    Staff,           // Legacy – dùng Staff_Sales/Warehouse/Marketing thay thế
    Staff_Sales,     // Nhân viên bán hàng – POS, đơn hàng, khách hàng
    Staff_Warehouse, // Nhân viên kho – nhập hàng, tồn kho, phiếu nhập
    Staff_Marketing, // Nhân viên marketing – báo cáo, phân tích
    DataIT,
    Viewer,
    SuperAdmin       // Quản trị hệ thống – không thuộc tenant nào
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
    CASH,    // Tiền mặt – xác nhận thủ công
    VIETQR,  // VietQR – sinh QR thật + hiện thông tin CK, xác nhận qua SePay mock
    MOMO,    // Ví MoMo – mock callback nội bộ
    VNPAY,   // VNPAY – mock callback nội bộ
    BANK_TRANSFER // Chuyển khoản ngân hàng – xác nhận thủ công
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
