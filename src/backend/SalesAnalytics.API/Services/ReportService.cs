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

    // ── Sample data fallback khi Data Warehouse chưa có dữ liệu thật ──────────
    private static DashboardResponse GenerateSampleData(DateOnly from, DateOnly to)
    {
        var days = Math.Max(1, to.DayNumber - from.DayNumber + 1);
        var totalRevenue = 285_000_000m;
        var totalProfit  =  71_250_000m;
        var totalOrders  = 1_240;

        var kpi = new KpiSummary(
            TotalRevenue:       totalRevenue,
            TotalProfit:        totalProfit,
            TotalOrders:        totalOrders,
            AvgOrderValue:      Math.Round(totalRevenue / totalOrders, 0),
            NewCustomers:       372,
            RevenueGrowthPct:   12.5m,
            OrdersGrowthPct:    8.3m,
            CustomersGrowthPct: 5.1m,
            ProfitMarginPct:    25.0m
        );

        var channels = new List<RevenueByChannel>
        {
            new("Shopee",      totalRevenue * 0.35m, (int)(totalOrders * 0.35), 35.0m),
            new("Lazada",      totalRevenue * 0.25m, (int)(totalOrders * 0.25), 25.0m),
            new("TikTok Shop", totalRevenue * 0.20m, (int)(totalOrders * 0.20), 20.0m),
            new("Facebook",    totalRevenue * 0.12m, (int)(totalOrders * 0.12), 12.0m),
            new("Website",     totalRevenue * 0.08m, (int)(totalOrders * 0.08),  8.0m),
        };

        var products = new List<TopProduct>
        {
            new(1, "Áo thun Unisex Cotton",  "AT-001", "Shopee",      380, 380, totalRevenue * 0.12m),
            new(2, "Quần jeans Slim Fit",     "QJ-002", "Lazada",      295, 295, totalRevenue * 0.09m),
            new(3, "Giày thể thao Nam",       "GT-003", "TikTok Shop", 260, 260, totalRevenue * 0.08m),
            new(4, "Túi xách Nữ HQ",          "TX-004", "Shopee",      225, 225, totalRevenue * 0.07m),
            new(5, "Đầm maxi Boho",           "DM-005", "Facebook",    190, 190, totalRevenue * 0.06m),
        };

        // Sinh doanh thu theo ngày
        var rand = new Random(42);
        var revenueByDay = new List<RevenueByDay>();
        for (int i = 0; i < days; i++)
        {
            var d = from.AddDays(i);
            var rev = 8_000_000m + (decimal)(Math.Sin(i / 10.0) * 3_000_000) + (decimal)(rand.NextDouble() * 2_000_000);
            revenueByDay.Add(new RevenueByDay(d, Math.Round(rev, 0), Math.Round(rev * 0.25m, 0), rand.Next(15, 36)));
        }

        return new DashboardResponse(kpi, revenueByDay, channels, products);
    }

    /// <summary>Sinh file PDF báo cáo và trả về byte[]</summary>
    public async Task<byte[]> GenerateReportAsync(
        DateOnly from, DateOnly to,
        string? channel,
        string? chartBase64   = null,
        bool    inclOverview  = true,
        bool    inclSales     = true,
        bool    inclChannel   = true,
        bool    inclAI        = false)
    {
        var data = await _dashboard.GetDashboardAsync(from, to, channel);

        // Fallback: khi DW chưa có dữ liệu thật → dùng sample data để demo
        var usingSample = data.Kpi.TotalRevenue == 0;
        if (usingSample) data = GenerateSampleData(from, to);

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
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("BÁO CÁO PHÂN TÍCH BÁN HÀNG ĐA KÊNH")
                                .FontSize(15).Bold().FontColor(Color.FromHex("#1a5276"));
                            c.Item().Text("MSAS – Multi-channel Sales Analytics System")
                                .FontSize(9).FontColor(Colors.Grey.Medium);
                        });
                        row.ConstantItem(150).AlignRight().Column(c =>
                        {
                            c.Item().AlignRight().Text($"Ngày xuất: {DateTime.Now:dd/MM/yyyy HH:mm}")
                                .FontSize(9).FontColor(Colors.Grey.Medium);
                            if (usingSample)
                                c.Item().AlignRight().Text("⚠ Dữ liệu mẫu (DW chưa có dữ liệu)")
                                    .FontSize(8).FontColor(Colors.Orange.Medium);
                        });
                    });
                    col.Item().PaddingVertical(3)
                        .LineHorizontal(1.5f).LineColor(Color.FromHex("#1a5276"));
                    col.Item().Text(
                        $"Kỳ báo cáo: {from:dd/MM/yyyy} – {to:dd/MM/yyyy}" +
                        (channel is not null ? $" | Kênh: {channel}" : " | Tất cả kênh")
                    ).FontSize(10).Italic().FontColor(Colors.Grey.Darken1);
                });

                // ── Content ─────────────────────────────────────────────────
                page.Content().PaddingTop(1, Unit.Centimetre).Column(col =>
                {
                    // I. KPI
                    if (inclOverview)
                    {
                        col.Item().Text("I. CHỈ SỐ KINH DOANH TỔNG QUAN")
                            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingVertical(5).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                            });
                            // Row 1
                            AddKpiCell(table, "Doanh thu thuần",  $"{data.Kpi.TotalRevenue:N0} VNĐ",  data.Kpi.RevenueGrowthPct);
                            AddKpiCell(table, "Lợi nhuận gộp",    $"{data.Kpi.TotalProfit:N0} VNĐ",   data.Kpi.ProfitMarginPct);
                            AddKpiCell(table, "Số đơn hàng",      $"{data.Kpi.TotalOrders:N0}",        data.Kpi.OrdersGrowthPct);
                            // Row 2
                            AddKpiCell(table, "Giá trị đơn TB",   $"{data.Kpi.AvgOrderValue:N0} VNĐ", 0);
                            AddKpiCell(table, "Biên lợi nhuận",   $"{data.Kpi.ProfitMarginPct:N1}%",   0);
                            AddKpiCell(table, "Khách hàng mới",   $"{data.Kpi.NewCustomers:N0}",       data.Kpi.CustomersGrowthPct);
                        });
                        col.Item().PaddingBottom(10);
                    }

                    // II. Biểu đồ (nếu Frontend gửi base64)
                    if (!string.IsNullOrEmpty(chartBase64))
                    {
                        col.Item().Text("II. BIỂU ĐỒ DOANH THU")
                            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(5).Image(
                            Convert.FromBase64String(chartBase64)
                        ).FitWidth();
                        col.Item().PaddingBottom(15);
                    }

                    // III. Doanh thu theo kênh
                    if (inclChannel && data.RevenueByChannel.Count > 0)
                    {
                        col.Item().Text("III. DOANH THU THEO KÊNH BÁN HÀNG")
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
                            table.Header(h =>
                            {
                                foreach (var title in new[] { "Kênh", "Doanh thu (VNĐ)", "Đơn hàng", "Tỷ trọng" })
                                    h.Cell().Background(Color.FromHex("#d6eaf8")).Padding(5)
                                        .Text(title).Bold().FontSize(10);
                            });
                            bool alt = false;
                            foreach (var ch in data.RevenueByChannel)
                            {
                                var bg = alt ? Color.FromHex("#f8f9fc") : Colors.White;
                                table.Cell().Background(bg).Padding(4).Text(ch.ChannelName);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{ch.Revenue:N0}");
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{ch.Orders:N0}");
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{ch.RevenuePct:N1}%");
                                alt = !alt;
                            }
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // IV. Top sản phẩm
                    if (inclSales && data.TopProducts.Count > 0)
                    {
                        col.Item().Text("IV. TOP SẢN PHẨM BÁN CHẠY")
                            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(5).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(25);
                                c.RelativeColumn(3);
                                c.RelativeColumn(1);
                                c.RelativeColumn(1);
                                c.RelativeColumn(2);
                            });
                            table.Header(h =>
                            {
                                foreach (var t in new[] { "#", "Sản phẩm", "Kênh", "SL bán", "Doanh thu" })
                                    h.Cell().Background(Color.FromHex("#d6eaf8")).Padding(5)
                                        .Text(t).Bold().FontSize(10);
                            });
                            int i = 1;
                            foreach (var p in data.TopProducts)
                            {
                                var bg = i % 2 == 0 ? Color.FromHex("#f2f3f4") : Colors.White;
                                table.Cell().Background(bg).Padding(4).AlignCenter().Text($"{i++}");
                                table.Cell().Background(bg).Padding(4).Text(p.ProductName);
                                table.Cell().Background(bg).Padding(4).Text(p.Channel);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{p.QtySold:N0}");
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{p.Revenue:N0}");
                            }
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // V. Nhận xét AI (đơn giản, rule-based)
                    if (inclAI)
                    {
                        col.Item().Text("V. NHẬN XÉT & KHUYẾN NGHỊ")
                            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(5).Column(ai =>
                        {
                            var topCh = data.RevenueByChannel.FirstOrDefault();
                            var insights = new List<string>
                            {
                                $"• Doanh thu kỳ này đạt {data.Kpi.TotalRevenue:N0} VNĐ" +
                                    (data.Kpi.RevenueGrowthPct > 0
                                        ? $", tăng trưởng {data.Kpi.RevenueGrowthPct:N1}% so với kỳ trước."
                                        : $", giảm {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% so với kỳ trước."),
                                topCh is not null
                                    ? $"• Kênh bán hàng đóng góp cao nhất là {topCh.ChannelName} ({topCh.RevenuePct:N1}% doanh thu)."
                                    : "",
                                $"• Biên lợi nhuận gộp đạt {data.Kpi.ProfitMarginPct:N1}%.",
                                data.Kpi.ProfitMarginPct < 20
                                    ? "• Khuyến nghị: Tối ưu chi phí vận hành để cải thiện biên lợi nhuận."
                                    : "• Biên lợi nhuận ở mức tốt. Có thể đẩy mạnh ngân sách marketing.",
                            };
                            foreach (var line in insights.Where(l => l.Length > 0))
                                ai.Item().PaddingBottom(4).Text(line).FontSize(10);
                        });
                    }
                });

                // ── Footer ───────────────────────────────────────────────────
                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("MSAS – Hệ thống Phân tích Bán hàng Đa kênh  |  Trang ").FontSize(9).FontColor(Colors.Grey.Medium);
                    text.CurrentPageNumber().FontSize(9).FontColor(Colors.Grey.Medium);
                    text.Span(" / ").FontSize(9).FontColor(Colors.Grey.Medium);
                    text.TotalPages().FontSize(9).FontColor(Colors.Grey.Medium);
                });
            });
        });

        return pdf.GeneratePdf();
    }

    private static void AddKpiCell(TableDescriptor table, string label, string value, decimal trend)
    {
        table.Cell()
            .Border(0.5f).BorderColor(Colors.Grey.Lighten2)
            .Background(Color.FromHex("#f8f9fc"))
            .Padding(8)
            .Column(c =>
            {
                c.Item().Text(label).FontSize(9).FontColor(Colors.Grey.Darken1);
                c.Item().Text(value).FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                if (trend != 0)
                {
                    var sign  = trend > 0 ? "▲" : "▼";
                    var color = trend > 0 ? Color.FromHex("#1abc9c") : Color.FromHex("#e74c3c");
                    c.Item().Text($"{sign} {Math.Abs(trend):N1}% so với kỳ trước")
                        .FontSize(8).FontColor(color);
                }
            });
    }
}
