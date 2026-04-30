namespace SalesAnalytics.Core.Enums;

public enum UserRole
{
    Owner,
    Manager,
    Staff,
    DataIT,
    Admin,
    Viewer
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
