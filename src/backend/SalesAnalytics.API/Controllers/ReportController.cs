using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Owner,Manager,DataIT,Admin")]
public class ReportController : ControllerBase
{
    private readonly ReportService _report;

    public ReportController(ReportService report) => _report = report;

    /// <summary>
    /// Xuất báo cáo PDF.
    /// Body (JSON, optional): { "chartBase64": "..." } – base64 image của biểu đồ từ Frontend
    /// </summary>
    [HttpGet("export-pdf")]
    public async Task<IActionResult> ExportPdf(
        [FromQuery] DateOnly? from    = null,
        [FromQuery] DateOnly? to      = null,
        [FromQuery] string?   channel = null,
        [FromQuery] string?   chart   = null)   // base64 chart image (URL-encoded)
    {
        var dateFrom = from ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-30));
        var dateTo   = to   ?? DateOnly.FromDateTime(DateTime.UtcNow);

        var pdfBytes = await _report.GenerateReportAsync(dateFrom, dateTo, channel, chart);

        var fileName = $"BaoCao_{dateFrom:ddMMyyyy}_{dateTo:ddMMyyyy}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }
}
