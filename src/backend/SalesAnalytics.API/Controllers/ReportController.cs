using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Manager,DataIT,Admin,SuperAdmin")]
public class ReportController(
    ReportService report,
    IAuditLogService audit,
    ITenantContext tenant) : ControllerBase
{

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
        [FromQuery] string    lang                 = "vi",
        [FromQuery] bool      includeOverview      = true,
        [FromQuery] bool      includeSales         = true,
        [FromQuery] bool      includeMultichannel  = true,
        [FromQuery] bool      includeAI            = false)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var ch        = channel == "all" ? null : channel;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        var userId   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? (int?)id : null;
        var username = User.FindFirstValue(ClaimTypes.Name) ?? "";

        var language = (lang == "en") ? "en" : "vi";

        var pdfBytes = await report.GenerateReportAsync(
            dateFrom, dateTo, ch, chart,
            language:     language,
            inclOverview: includeOverview,
            inclSales:    includeSales,
            inclChannel:  includeMultichannel,
            inclAI:       includeAI,
            companyId:    companyId);

        await audit.LogAsync(
            userId:     userId, username: username,
            action:     "EXPORT_PDF",
            entityType: "Report",
            newValue:   $"{{\"from\":\"{dateFrom}\",\"to\":\"{dateTo}\",\"channel\":\"{channel}\",\"lang\":\"{language}\"}}",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        var prefix   = language == "en" ? "SalesReport" : "BaoCao";
        var fileName = $"{prefix}_{dateFrom:ddMMyyyy}_{dateTo:ddMMyyyy}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }
}
