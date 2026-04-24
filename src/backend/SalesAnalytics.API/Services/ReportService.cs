using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.API.Services;

/// <summary>Xuất báo cáo PDF bằng QuestPDF</summary>
public class ReportService
{
    private readonly DashboardService _dashboard;

    public ReportService(DashboardService dashboard) => _dashboard = dashboard;

    /// <summary>Sinh file PDF báo cáo doanh thu và trả về byte[]</summary>
    public async Task<byte[]> GenerateReportAsync(
        DateOnly from, DateOnly to,
        string? channel,
        string? chartBase64 = null)   // Base64 image của biểu đồ từ Frontend
    {
        var data = await _dashboard.GetDashboardAsync(from, to, channel);

        QuestPDF.Settings.License = LicenseType.Community;

        var pdf = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(11).FontFamily("Arial"));

                // ── Header ──────────────────────────────────────────────────
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        row.RelativeItem().Text("BÁO CÁO PHÂN TÍCH BÁN HÀNG")
                            .FontSize(16).Bold().FontColor(Color.FromHex("#1a5276"));
                        row.ConstantItem(150).AlignRight().Text(
                            $"Ngày xuất: {DateTime.Now:dd/MM/yyyy HH:mm}"
                        ).FontSize(9).FontColor(Colors.Grey.Medium);
                    });
                    col.Item().PaddingVertical(2)
                        .LineHorizontal(1.5f).LineColor(Color.FromHex("#1a5276"));
                    col.Item().Text(
                        $"Kỳ báo cáo: {from:dd/MM/yyyy} – {to:dd/MM/yyyy}" +
                        (channel is not null ? $" | Kênh: {channel}" : " | Tất cả kênh")
                    ).FontSize(10).Italic().FontColor(Colors.Grey.Darken1);
                });

                // ── Content ─────────────────────────────────────────────────
                page.Content().PaddingTop(1, Unit.Centimetre).Column(col =>
                {
                    // KPI Summary
                    col.Item().Text("I. CHỈ SỐ KINH DOANH TỔNG QUAN")
                        .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                    col.Item().PaddingVertical(5).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn();
                            c.RelativeColumn();
                        });
                        AddKpiRow(table, "Doanh thu thuần",   $"{data.Kpi.TotalRevenue:N0} VNĐ");
                        AddKpiRow(table, "Lợi nhuận gộp",     $"{data.Kpi.TotalProfit:N0} VNĐ");
                        AddKpiRow(table, "Số đơn hàng",       $"{data.Kpi.TotalOrders:N0}");
                        AddKpiRow(table, "Giá trị đơn TB",    $"{data.Kpi.AvgOrderValue:N0} VNĐ");
                        AddKpiRow(table, "Biên lợi nhuận",    $"{data.Kpi.ProfitMarginPct:N1}%");
                        AddKpiRow(table, "Số khách hàng",     $"{data.Kpi.NewCustomers:N0}");
                    });

                    // Biểu đồ (nếu Frontend gửi base64)
                    if (!string.IsNullOrEmpty(chartBase64))
                    {
                        col.Item().PaddingTop(15)
                            .Text("II. BIỂU ĐỒ DOANH THU")
                            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(5).Image(
                            Convert.FromBase64String(chartBase64)
                        ).FitWidth();
                    }

                    // Doanh thu theo kênh
                    col.Item().PaddingTop(15)
                        .Text("III. DOANH THU THEO KÊNH")
                        .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                    col.Item().PaddingTop(5).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.RelativeColumn(3);
                            c.RelativeColumn(2);
                            c.RelativeColumn(1);
                            c.RelativeColumn(1);
                        });
                        // Header
                        table.Header(h =>
                        {
                            foreach (var title in new[] { "Kênh", "Doanh thu", "Đơn hàng", "Tỷ trọng" })
                                h.Cell().Background(Color.FromHex("#d6eaf8")).Padding(5)
                                    .Text(title).Bold().FontSize(10);
                        });
                        foreach (var ch in data.RevenueByChannel)
                        {
                            table.Cell().Padding(4).Text(ch.ChannelName);
                            table.Cell().Padding(4).AlignRight().Text($"{ch.Revenue:N0}");
                            table.Cell().Padding(4).AlignRight().Text($"{ch.Orders:N0}");
                            table.Cell().Padding(4).AlignRight().Text($"{ch.RevenuePct:N1}%");
                        }
                    });

                    // Top sản phẩm
                    col.Item().PaddingTop(15)
                        .Text("IV. TOP 10 SẢN PHẨM BÁN CHẠY")
                        .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                    col.Item().PaddingTop(5).Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(25);
                            c.RelativeColumn(3);
                            c.RelativeColumn(1);
                            c.RelativeColumn(2);
                        });
                        table.Header(h =>
                        {
                            foreach (var t in new[] { "#", "Sản phẩm", "SL bán", "Doanh thu" })
                                h.Cell().Background(Color.FromHex("#d6eaf8")).Padding(5)
                                    .Text(t).Bold().FontSize(10);
                        });
                        int i = 1;
                        foreach (var p in data.TopProducts)
                        {
                            var bg = i % 2 == 0 ? Color.FromHex("#f2f3f4") : Colors.White;
                            table.Cell().Background(bg).Padding(4).AlignCenter().Text($"{i++}");
                            table.Cell().Background(bg).Padding(4).Text(p.ProductName);
                            table.Cell().Background(bg).Padding(4).AlignRight().Text($"{p.QtySold:N0}");
                            table.Cell().Background(bg).Padding(4).AlignRight().Text($"{p.Revenue:N0}");
                        }
                    });
                });

                // ── Footer ───────────────────────────────────────────────────
                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("Hệ thống Phân tích Bán hàng Đa kênh – ").FontSize(9).FontColor(Colors.Grey.Medium);
                    text.CurrentPageNumber().FontSize(9);
                    text.Span(" / ").FontSize(9);
                    text.TotalPages().FontSize(9);
                });
            });
        });

        return pdf.GeneratePdf();
    }

    private static void AddKpiRow(TableDescriptor table, string label, string value)
    {
        table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2)
            .Padding(6).Text(label).Bold().FontSize(10);
        table.Cell().BorderBottom(0.5f).BorderColor(Colors.Grey.Lighten2)
            .Padding(6).AlignRight().Text(value).FontSize(10);
    }
}
