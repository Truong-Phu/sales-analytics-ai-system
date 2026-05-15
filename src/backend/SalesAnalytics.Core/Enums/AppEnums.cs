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
