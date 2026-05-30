namespace SalesAnalytics.Core.DTOs;

/// <summary>KPI tổng hợp cho Dashboard – khớp với DashboardPage.jsx</summary>
public record KpiSummary(
    decimal TotalRevenue,
    decimal TotalProfit,
    int     TotalOrders,
    decimal AvgOrderValue,
    int     NewCustomers,
    decimal RevenueGrowthPct,    // % tăng trưởng doanh thu so với kỳ trước
    decimal OrdersGrowthPct,     // % tăng trưởng đơn hàng so với kỳ trước
    decimal CustomersGrowthPct,  // % tăng trưởng khách hàng so với kỳ trước
    decimal ProfitMarginPct
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
    decimal  RevenuePct,
    decimal  AdSpend = 0,          // Chi phí QC từ ad_spend_monthly
    decimal  Roas    = 0           // Revenue / AdSpend (0 nếu chưa nhập chi phí)
);

public record TopProduct(
    int     ProductId,
    string  ProductName,
    string  Sku,
    string  Channel,
    int     QtySold,
    int     TotalOrders,
    decimal Revenue
);

public record DashboardResponse(
    KpiSummary             Kpi,
    List<RevenueByDay>     RevenueByDay,
    List<RevenueByChannel> RevenueByChannel,
    List<TopProduct>       TopProducts
);
