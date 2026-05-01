using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Manager,DataIT,Admin")]
public class ReportController : ControllerBase
{
    private readonly ReportService    _report;
    private readonly IAuditLogService _audit;

    public ReportController(ReportService report, IAuditLogService audit)
    {
        _report = report;
        _audit  = audit;
    }

    /// <summary>
    /// Xuất báo cáo PDF.
    /// Query params: from, to, channel, chart (base64 ảnh biểu đồ, optional),
    ///               includeOverview, includeSales, includeMultichannel, includeAI
    /// </summary>
    [HttpGet("export-pdf")]
    public async Task<IActionResult> ExportPdf(
        [FromQuery] DateOnly? from                 = null,
        [FromQuery] DateOnly? to                   = null,
        [FromQuery] string?   channel              = null,
        [FromQuery] string?   chart                = null,
        [FromQuery] bool      includeOverview      = true,
        [FromQuery] bool      includeSales         = true,
        [FromQuery] bool      includeMultichannel  = true,
        [FromQuery] bool      includeAI            = false)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var ch = channel == "all" ? null : channel;

        var userId   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? (int?)id : null;
        var username = User.FindFirstValue(ClaimTypes.Name) ?? "";

        var pdfBytes = await _report.GenerateReportAsync(
            dateFrom, dateTo, ch, chart,
            inclOverview: includeOverview,
            inclSales:    includeSales,
            inclChannel:  includeMultichannel,
            inclAI:       includeAI);

        await _audit.LogAsync(
            userId:     userId, username: username,
            action:     "EXPORT_PDF",
            entityType: "Report",
            newValue:   $"{{\"from\":\"{dateFrom}\",\"to\":\"{dateTo}\",\"channel\":\"{channel}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        var fileName = $"BaoCao_{dateFrom:ddMMyyyy}_{dateTo:ddMMyyyy}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }
}
