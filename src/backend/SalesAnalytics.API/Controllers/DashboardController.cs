using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController(DashboardService service, ITenantContext tenant) : ControllerBase
{
    /// <summary>Lấy dữ liệu Dashboard (KPI, doanh thu, kênh, sản phẩm)</summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetDashboard(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null)
    {
        var dateFrom  = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo    = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        var data = await service.GetDashboardAsync(dateFrom, dateTo, channel, companyId);
        return Ok(data);
    }

    /// <summary>Xu hướng doanh thu N ngày gần nhất — dùng cho mobile DashboardScreen.</summary>
    [HttpGet("revenue-trend")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetRevenueTrend([FromQuery] int days = 7)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetRevenueTrendAsync(days, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>Top N sản phẩm bán chạy 30 ngày gần nhất — dùng cho mobile DashboardScreen.</summary>
    [HttpGet("top-products")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetTopProducts([FromQuery] int limit = 5)
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetTopProductsMobileAsync(limit, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>Doanh thu theo kênh 30 ngày gần nhất — dùng cho mobile DashboardScreen.</summary>
    [HttpGet("channel-revenue")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetChannelRevenue()
    {
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetChannelRevenueMobileAsync(companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>So sánh doanh thu & đơn hàng hôm nay vs hôm qua</summary>
    [HttpGet("today-vs-yesterday")]
    [Authorize(Roles = "Owner,Manager,DataIT,Staff,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetTodayVsYesterday()
    {
        var today     = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = today.AddDays(-1);
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        var t = await service.GetDashboardAsync(today,     today,     null, companyId);
        var y = await service.GetDashboardAsync(yesterday, yesterday, null, companyId);

        decimal revPct = y.Kpi.TotalRevenue > 0
            ? Math.Round((t.Kpi.TotalRevenue - y.Kpi.TotalRevenue) / y.Kpi.TotalRevenue * 100, 1)
            : 0;
        decimal ordPct = y.Kpi.TotalOrders > 0
            ? Math.Round((t.Kpi.TotalOrders - y.Kpi.TotalOrders) / (decimal)y.Kpi.TotalOrders * 100, 1)
            : 0;

        return Ok(new
        {
            today     = new { revenue = t.Kpi.TotalRevenue, orders = t.Kpi.TotalOrders, profit = t.Kpi.TotalProfit },
            yesterday = new { revenue = y.Kpi.TotalRevenue, orders = y.Kpi.TotalOrders, profit = y.Kpi.TotalProfit },
            revenuePct = revPct,
            ordersPct  = ordPct,
        });
    }
}
