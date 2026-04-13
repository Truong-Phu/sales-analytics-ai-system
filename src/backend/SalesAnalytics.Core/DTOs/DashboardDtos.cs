namespace SalesAnalytics.Core.DTOs;

/// <summary>KPI tổng hợp cho Dashboard</summary>
public record KpiSummary(
    decimal TotalRevenue,
    decimal TotalProfit,
    int     TotalOrders,
    decimal AvgOrderValue,
    decimal RevenueGrowthPct,   // % tăng trưởng so với kỳ trước
    decimal ProfitMarginPct,
    int     TotalCustomers
);

public record RevenueByDay(
    DateOnly Date,
    decimal  NetRevenue,
    decimal  GrossProfit,
    int      OrderCount
);

public record RevenueByChannel(
    string   ChannelName,
    decimal  Revenue,
    int      Orders,
    decimal  RevenuePct         // % tỷ trọng
);

public record TopProduct(
    string  ProductName,
    string  Sku,
    int     QtySold,
    decimal Revenue
);

public record DashboardResponse(
    KpiSummary           Kpi,
    List<RevenueByDay>   RevenueByDay,
    List<RevenueByChannel> RevenueByChannel,
    List<TopProduct>     TopProducts
);
