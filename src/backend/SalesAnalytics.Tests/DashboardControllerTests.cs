using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using SalesAnalytics.API.Controllers;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.Tests;

/// <summary>
/// Unit test cho DashboardController – dùng Moq để giả lập DashboardService.
/// GetDashboardAsync được khai báo virtual để Moq có thể override.
/// </summary>
public class DashboardControllerTests
{
    private readonly Mock<DashboardService>  _mockService;
    private readonly Mock<ITenantContext>    _mockTenant;
    private readonly DashboardController    _controller;

    public DashboardControllerTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = "Host=localhost;Database=test;Username=test;Password=test",
            })
            .Build();

        _mockService = new Mock<DashboardService>(config);
        _mockTenant  = new Mock<ITenantContext>();
        _mockTenant.Setup(t => t.IsSuperAdmin).Returns(false);
        _mockTenant.Setup(t => t.CompanyId).Returns(Guid.NewGuid());

        _controller = new DashboardController(_mockService.Object, _mockTenant.Object);
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private static DashboardResponse BuildSampleResponse() => new(
        Kpi: new KpiSummary(
            TotalRevenue:       5_000_000,
            TotalProfit:        1_500_000,
            TotalOrders:        42,
            AvgOrderValue:      119_047,
            NewCustomers:       8,
            RevenueGrowthPct:   12.5m,
            OrdersGrowthPct:    8.3m,
            CustomersGrowthPct: 5.1m,
            ProfitMarginPct:    30.0m
        ),
        RevenueByDay:     [],
        RevenueByChannel: [],
        TopProducts:      []
    );

    // ── Test cases ────────────────────────────────────────────────────────────

    [Fact]
    [Trait("Category", "DashboardController")]
    public async Task GetDashboard_NoParams_ReturnsOkWithData()
    {
        _mockService
            .Setup(s => s.GetDashboardAsync(
                It.IsAny<DateOnly>(), It.IsAny<DateOnly>(),
                It.IsAny<string?>(),  It.IsAny<Guid?>()))
            .ReturnsAsync(BuildSampleResponse());

        var result = await _controller.GetDashboard(null, null, null);

        var ok   = Assert.IsType<OkObjectResult>(result);
        var data = Assert.IsType<DashboardResponse>(ok.Value);
        Assert.Equal(5_000_000, data.Kpi.TotalRevenue);
        Assert.Equal(42,        data.Kpi.TotalOrders);
    }

    [Fact]
    [Trait("Category", "DashboardController")]
    public async Task GetDashboard_WithDateRange_PassesCorrectDates()
    {
        var from = new DateOnly(2025, 10, 1);
        var to   = new DateOnly(2025, 10, 31);
        DateOnly capturedFrom = default;
        DateOnly capturedTo   = default;

        _mockService
            .Setup(s => s.GetDashboardAsync(
                It.IsAny<DateOnly>(), It.IsAny<DateOnly>(),
                It.IsAny<string?>(),  It.IsAny<Guid?>()))
            .Callback<DateOnly, DateOnly, string?, Guid?>((f, t, _, _) => { capturedFrom = f; capturedTo = t; })
            .ReturnsAsync(BuildSampleResponse());

        await _controller.GetDashboard(from, to, null);

        Assert.Equal(from, capturedFrom);
        Assert.Equal(to,   capturedTo);
    }

    [Fact]
    [Trait("Category", "DashboardController")]
    public async Task GetDashboard_NoParams_UsesDefaultDateRange()
    {
        DateOnly capturedFrom = default;
        DateOnly capturedTo   = default;
        var before = DateOnly.FromDateTime(DateTime.UtcNow);

        _mockService
            .Setup(s => s.GetDashboardAsync(
                It.IsAny<DateOnly>(), It.IsAny<DateOnly>(),
                It.IsAny<string?>(),  It.IsAny<Guid?>()))
            .Callback<DateOnly, DateOnly, string?, Guid?>((f, t, _, _) => { capturedFrom = f; capturedTo = t; })
            .ReturnsAsync(BuildSampleResponse());

        await _controller.GetDashboard(null, null, null);

        Assert.True(capturedTo >= before);
        Assert.True(capturedFrom < capturedTo);
    }

    [Fact]
    [Trait("Category", "DashboardController")]
    public async Task GetDashboard_ServiceCalledExactlyOnce()
    {
        _mockService
            .Setup(s => s.GetDashboardAsync(
                It.IsAny<DateOnly>(), It.IsAny<DateOnly>(),
                It.IsAny<string?>(),  It.IsAny<Guid?>()))
            .ReturnsAsync(BuildSampleResponse());

        await _controller.GetDashboard(null, null, null);

        _mockService.Verify(
            s => s.GetDashboardAsync(
                It.IsAny<DateOnly>(), It.IsAny<DateOnly>(),
                It.IsAny<string?>(),  It.IsAny<Guid?>()),
            Times.Once
        );
    }
}
