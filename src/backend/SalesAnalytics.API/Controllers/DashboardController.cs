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
    [Authorize(Roles = "Owner,Manager,DataIT,Admin,Viewer,SuperAdmin")]
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
}
