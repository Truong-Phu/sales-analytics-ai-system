using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.API.Services;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
[RequirePlan("pro")]
public class ReportController(
    ReportService report,
    IAuditLogService audit,
    ITenantContext tenant,
    AppDbContext db) : ControllerBase
{

    /// <summary>
    /// Xuất báo cáo PDF.
    /// Query params: from, to, channel, chart (base64 ảnh biểu đồ, optional),
    ///               includeOverview, includeSales, includeMultichannel,
    ///               includeCustomer, includeMarketing, includeInventory, includeAI,
    ///               sections (danh sách tên section, ví dụ: sections=overview&sections=trend_chart)
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
        [FromQuery] bool      includeMultichannel  = false,
        [FromQuery] bool      includeCustomer      = false,
        [FromQuery] bool      includeMarketing     = false,
        [FromQuery] bool      includeInventory     = false,
        [FromQuery] bool      includeAI            = true,
        [FromQuery] List<string>? sections         = null)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var ch        = channel == "all" ? null : channel;
        var companyId = tenant.IsSuperAdmin ? (Guid?)null : tenant.CompanyId;

        var userId   = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null;
        var username = User.FindFirstValue(ClaimTypes.Name) ?? "";
        var userRole = User.FindFirstValue(ClaimTypes.Role) ?? "";

        // Lấy tên công ty từ DB (nếu có)
        var companyName = "—";
        if (companyId.HasValue)
        {
            var company = await db.Companies
                .AsNoTracking()
                .Where(c => c.Id == companyId.Value)
                .Select(c => new { c.Name })
                .FirstOrDefaultAsync();
            if (company != null) companyName = company.Name;
        }

        var language = (lang == "en") ? "en" : "vi";

        var pdfBytes = await report.GenerateReportAsync(
            dateFrom, dateTo, ch, chart,
            language:         language,
            inclOverview:     includeOverview,
            inclSales:        includeSales,
            inclChannel:      includeMultichannel,
            inclCustomer:     includeCustomer,
            inclMarketing:    includeMarketing,
            inclInventory:    includeInventory,
            inclAI:           includeAI,
            companyId:        companyId,
            companyName:      companyName,
            userName:         username,
            userRole:         userRole,
            selectedSections: sections);

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
