using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly DashboardService _service;

    public DashboardController(DashboardService service) => _service = service;

    /// <summary>Lấy dữ liệu Dashboard (KPI, doanh thu, kênh, sản phẩm)</summary>
    [HttpGet]
    [Authorize(Roles = "Owner,Manager,DataIT,Admin")]
    public async Task<IActionResult> GetDashboard(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var data = await _service.GetDashboardAsync(dateFrom, dateTo, channel);
        return Ok(data);
    }
}
