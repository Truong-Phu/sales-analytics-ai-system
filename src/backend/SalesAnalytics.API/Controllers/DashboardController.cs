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
    [Authorize(Roles = "Owner,Manager,DataIT,Staff,Viewer,SuperAdmin")]
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

    /// <summary>GA4 website traffic analytics — mock khi chưa cấu hình Service Account</summary>
    [HttpGet("website-analytics")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public IActionResult GetWebsiteAnalytics(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to   = null)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);
        int days     = Math.Max(1, dateTo.DayNumber - dateFrom.DayNumber + 1);
        var rng      = new Random(dateFrom.DayNumber);

        int totSessions = 0, totUsers = 0;
        double totBounce = 0, totDur = 0;
        var daily = new List<object>(days);
        for (int i = 0; i < days; i++)
        {
            var    d        = dateFrom.AddDays(i);
            int    sessions = 1100 + rng.Next(-200, 400);
            int    users    = (int)(sessions * (0.72 + rng.NextDouble() * 0.12));
            double bounce   = Math.Round(36.0 + rng.NextDouble() * 18, 1);
            double dur      = Math.Round(110.0 + rng.NextDouble() * 80, 0);
            daily.Add(new { date = d.ToString("yyyy-MM-dd"), sessions, users,
                            pageViews = sessions * 3 + rng.Next(-100, 300),
                            bounceRate = bounce, avgDuration = dur });
            totSessions += sessions; totUsers += users;
            totBounce   += bounce;   totDur   += dur;
        }

        return Ok(new
        {
            isMock  = true,
            summary = new
            {
                totalSessions   = totSessions,
                totalUsers      = totUsers,
                avgBounceRate   = Math.Round(totBounce / days, 1),
                avgDurationSec  = (int)(totDur / days),
                newUsersPct     = 61.8,
                pagesPerSession = 3.1,
            },
            daily,
            topSources = new object[]
            {
                new { source = "google / organic",   sessions = (int)(totSessions * 0.38) },
                new { source = "direct / none",       sessions = (int)(totSessions * 0.24) },
                new { source = "facebook / referral", sessions = (int)(totSessions * 0.19) },
                new { source = "tiktok / social",     sessions = (int)(totSessions * 0.12) },
                new { source = "(other)",             sessions = (int)(totSessions * 0.07) },
            },
            topPages = new object[]
            {
                new { page = "/san-pham",   views = (int)(totSessions * 0.62) },
                new { page = "/",           views = (int)(totSessions * 0.52) },
                new { page = "/gio-hang",   views = (int)(totSessions * 0.38) },
                new { page = "/thanh-toan", views = (int)(totSessions * 0.24) },
                new { page = "/lien-he",    views = (int)(totSessions * 0.16) },
            },
            deviceShare = new object[]
            {
                new { device = "Mobile",  pct = 68.4 },
                new { device = "Desktop", pct = 26.1 },
                new { device = "Tablet",  pct =  5.5 },
            },
        });
    }

    /// <summary>Facebook Ads performance — mock khi chưa cấu hình Ad Account</summary>
    [HttpGet("fb-ads")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public IActionResult GetFbAds(
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to   = null)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);
        int days     = Math.Max(1, dateTo.DayNumber - dateFrom.DayNumber + 1);
        var rng      = new Random(dateFrom.DayNumber + 77);

        double totSpend = 0, totRev = 0;
        int    totClicks = 0, totImpr = 0, totConv = 0;
        var    daily = new List<object>(days);
        for (int i = 0; i < days; i++)
        {
            var    d       = dateFrom.AddDays(i);
            double spend   = Math.Round(650_000 + rng.NextDouble() * 550_000);
            int    clicks  = (int)(spend / 1_600 + rng.Next(-20, 50));
            int    impr    = clicks * (15 + rng.Next(0, 10));
            int    conv    = Math.Max(0, (int)(clicks * 0.028 + rng.NextDouble() * 3));
            double revenue = conv * (380_000 + rng.Next(-30_000, 120_000));
            daily.Add(new
            {
                date        = d.ToString("yyyy-MM-dd"),
                spend, clicks,
                impressions = impr,
                conversions = conv,
                revenue,
                ctr  = impr   > 0 ? Math.Round((double)clicks / impr  * 100, 2) : 0,
                cpc  = clicks > 0 ? Math.Round(spend / clicks)                  : 0,
                roas = spend  > 0 ? Math.Round(revenue / spend, 2)              : 0,
            });
            totSpend  += spend;  totClicks += clicks;
            totImpr   += impr;   totConv   += conv;  totRev += revenue;
        }

        return Ok(new
        {
            isMock  = true,
            summary = new
            {
                totalSpend       = Math.Round(totSpend),
                totalClicks      = totClicks,
                totalImpressions = totImpr,
                totalConversions = totConv,
                totalRevenue     = Math.Round(totRev),
                roas  = totSpend  > 0 ? Math.Round(totRev    / totSpend, 2)              : 0,
                ctr   = totImpr   > 0 ? Math.Round((double)totClicks / totImpr * 100, 2) : 0,
                cpc   = totClicks > 0 ? Math.Round(totSpend  / totClicks)                : 0,
                cpa   = totConv   > 0 ? Math.Round(totSpend  / totConv)                  : 0,
            },
            daily,
            byCampaign = new object[]
            {
                new { campaign = "Retargeting Shoppers", spend = Math.Round(totSpend * 0.35), roas = 4.8, conversions = (int)(totConv * 0.42) },
                new { campaign = "Flash Sale Traffic",    spend = Math.Round(totSpend * 0.28), roas = 3.9, conversions = (int)(totConv * 0.31) },
                new { campaign = "Brand Awareness",       spend = Math.Round(totSpend * 0.22), roas = 2.1, conversions = (int)(totConv * 0.17) },
                new { campaign = "Lookalike Audience",    spend = Math.Round(totSpend * 0.15), roas = 3.2, conversions = (int)(totConv * 0.10) },
            },
            byAdType = new object[]
            {
                new { adType = "Video / Reels", spend = Math.Round(totSpend * 0.40) },
                new { adType = "Image Static",  spend = Math.Round(totSpend * 0.28) },
                new { adType = "Carousel",      spend = Math.Round(totSpend * 0.20) },
                new { adType = "Stories",       spend = Math.Round(totSpend * 0.12) },
            },
        });
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
