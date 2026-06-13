using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController(DashboardService service, ITenantContext tenant) : ControllerBase
{
    private static readonly TimeZoneInfo VietnamTimeZone = ResolveVietnamTimeZone();

    /// <summary>Lấy dữ liệu Dashboard (KPI, doanh thu, kênh, sản phẩm)</summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,DataIT,Staff,Staff_Sales,Staff_Marketing,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetDashboard(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-30);
        var dateTo    = to   ?? today;
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

    /// <summary>Facebook Ads performance — yêu cầu kết nối Facebook Ads Account qua /api/integrations</summary>
    [HttpGet("fb-ads")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public IActionResult GetFbAds(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to   = null)
    {
        return Ok(new
        {
            notConfigured = true,
            message       = "Chưa cấu hình Facebook Ads Account. Vui lòng kết nối tại Tích hợp dữ liệu.",
            daily         = Array.Empty<object>(),
            summary       = new { totalSpend = 0, totalClicks = 0, totalImpressions = 0,
                                  totalConversions = 0, totalRevenue = 0, roas = 0, ctr = 0, cpc = 0, cpa = 0 },
            byCampaign    = Array.Empty<object>(),
            byAdType      = Array.Empty<object>(),
        });
    }

    /// <summary>Doanh thu theo tháng và kênh — dùng cho biểu đồ stacked bar Tab Sales</summary>
    [HttpGet("monthly-by-channel")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetMonthlyByChannel(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to   = null)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-180);
        var dateTo    = to   ?? today;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetMonthlyByChannelAsync(dateFrom, dateTo, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>Nhiệt đồ đơn hàng theo giờ trong ngày và thứ trong tuần (OLTP orders)</summary>
    [HttpGet("heatmap")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetOrderHeatmap(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-30);
        var dateTo    = to   ?? today;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetOrderHeatmapAsync(dateFrom, dateTo, channel, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>Phễu trạng thái đơn hàng (OLTP orders) — thay thế funnel web-tracking</summary>
    [HttpGet("order-funnel")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetOrderFunnel(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-30);
        var dateTo    = to   ?? today;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetOrderFunnelAsync(dateFrom, dateTo, channel, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>KPI vận hành: tỷ lệ hoàn, huỷ, giao hàng thành công (OLTP orders)</summary>
    [HttpGet("ops-kpi")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetOpsKpi(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-30);
        var dateTo    = to   ?? today;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetOpsKpiAsync(dateFrom, dateTo, channel, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>Dữ liệu tồn kho thực tế từ OLTP products + order_items</summary>
    [HttpGet("inventory-real")]
    [Authorize(Roles = "Owner,Manager,DataIT,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetInventoryReal(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to   = null)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-30);
        var dateTo    = to   ?? today;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;
        try
        {
            var data = await service.GetInventoryRealAsync(dateFrom, dateTo, companyId);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    /// <summary>So sánh doanh thu & đơn hàng hôm nay vs hôm qua</summary>
    [HttpGet("today-vs-yesterday")]
    [Authorize(Roles = "Owner,Manager,DataIT,Staff,Staff_Sales,Staff_Marketing,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetTodayVsYesterday()
    {
        var today     = VietnamToday();
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
        decimal custPct = y.Kpi.NewCustomers > 0
            ? Math.Round((t.Kpi.NewCustomers - y.Kpi.NewCustomers) / (decimal)y.Kpi.NewCustomers * 100, 1)
            : 0;
        // % thay đổi lợi nhuận gộp so hôm qua (dùng Abs để tránh chia số âm gây nghịch chiều)
        decimal profPct = y.Kpi.TotalProfit != 0
            ? Math.Round((t.Kpi.TotalProfit - y.Kpi.TotalProfit) / Math.Abs(y.Kpi.TotalProfit) * 100, 1)
            : 0;

        return Ok(new
        {
            today     = new { revenue = t.Kpi.TotalRevenue, orders = t.Kpi.TotalOrders, profit = t.Kpi.TotalProfit, newCustomers = t.Kpi.NewCustomers },
            yesterday = new { revenue = y.Kpi.TotalRevenue, orders = y.Kpi.TotalOrders, profit = y.Kpi.TotalProfit, newCustomers = y.Kpi.NewCustomers },
            revenuePct   = revPct,
            ordersPct    = ordPct,
            customersPct = custPct,
            profitPct    = profPct,
        });
    }

    /// <summary>Top sản phẩm bán chạy phân tách theo từng kênh bán hàng.</summary>
    [HttpGet("top-products-by-channel")]
    [Authorize(Roles = "Owner,Manager,DataIT,Staff,Staff_Sales,Staff_Marketing,Viewer,SuperAdmin")]
    public async Task<IActionResult> GetTopProductsByChannel(
        [FromQuery] DateOnly? from  = null,
        [FromQuery] DateOnly? to    = null,
        [FromQuery] int       limit = 3)
    {
        var today = VietnamToday();
        var dateFrom  = from ?? today.AddDays(-30);
        var dateTo    = to   ?? today;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        if (limit < 1 || limit > 10) limit = 3;

        try
        {
            var data = await service.GetTopProductsByChannelAsync(dateFrom, dateTo, limit, companyId);
            return Ok(new { success = true, data });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    private static DateOnly VietnamToday()
    {
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, VietnamTimeZone);
        return DateOnly.FromDateTime(localNow);
    }

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        foreach (var timeZoneId in new[] { "Asia/Ho_Chi_Minh", "SE Asia Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.Local;
    }
}
