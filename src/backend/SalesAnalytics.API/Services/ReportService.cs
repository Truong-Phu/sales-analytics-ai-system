using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.API.Services;

/// <summary>Xuất báo cáo PDF bằng QuestPDF, biểu đồ native (không dùng ScottPlot)</summary>
public class ReportService
{
    private readonly DashboardService _dashboard;

    public ReportService(DashboardService dashboard) => _dashboard = dashboard;

    // ── Chuỗi dịch PDF theo ngôn ngữ ─────────────────────────────────────────
    private static readonly Dictionary<string, Dictionary<string, string>> _strings = new()
    {
        ["vi"] = new()
        {
            ["reportTitle"]      = "BÁO CÁO PHÂN TÍCH BÁN HÀNG ĐA KÊNH",
            ["systemName"]       = "MSAS — Hệ thống Phân tích Bán hàng Đa kênh",
            ["generatedAt"]      = "Ngày xuất",
            ["period"]           = "Kỳ báo cáo",
            ["allChannels"]      = "Tất cả kênh",
            ["channel"]          = "Kênh",
            ["sampleNotice"]     = "(Dữ liệu mẫu — chưa có dữ liệu thực)",
            ["secOverview"]      = "I. CHỈ SỐ KINH DOANH TỔNG QUAN",
            ["secTrend"]         = "Xu hướng Doanh thu & Lợi nhuận (theo ngày):",
            ["secChart"]         = "II. BIỂU ĐỒ TỪ NGƯỜI DÙNG",
            ["secChannel"]       = "III. DOANH THU THEO KÊNH BÁN HÀNG",
            ["channelShare"]     = "Tỷ trọng doanh thu theo kênh:",
            ["secProducts"]      = "IV. TOP SẢN PHẨM BÁN CHẠY",
            ["topProductsChart"] = "Doanh thu Top 5 sản phẩm:",
            ["secAI"]            = "V. NHẬN XÉT & KHUYẾN NGHỊ",
            ["pageOf"]           = "Trang",
            ["colRevenue"]       = "Doanh thu (VND)",
            ["colOrders"]        = "Đơn hàng",
            ["colShare"]         = "Tỷ trọng",
            ["colChannel"]       = "Kênh",
            ["colProduct"]       = "Sản phẩm",
            ["colQty"]           = "SL bán",
            ["rank"]             = "#",
            ["kpiRevenue"]       = "Doanh thu thuần",
            ["kpiProfit"]        = "Lợi nhuận gộp",
            ["kpiOrders"]        = "Số đơn hàng",
            ["kpiAov"]           = "Giá trị đơn TB",
            ["kpiMargin"]        = "Biên lợi nhuận",
            ["kpiCustomers"]     = "Khách hàng mới",
            ["vsLastPeriod"]     = "% so kỳ trước",
            ["legendRevenue"]    = "Doanh thu",
            ["legendProfit"]     = "Lợi nhuận",
        },
        ["en"] = new()
        {
            ["reportTitle"]      = "SALES ANALYTICS REPORT",
            ["systemName"]       = "MSAS — Multi-channel Sales Analytics System",
            ["generatedAt"]      = "Generated at",
            ["period"]           = "Period",
            ["allChannels"]      = "All channels",
            ["channel"]          = "Channel",
            ["sampleNotice"]     = "(Sample data — no real data yet)",
            ["secOverview"]      = "I. BUSINESS KPI OVERVIEW",
            ["secTrend"]         = "Revenue & Profit Trend (daily):",
            ["secChart"]         = "II. USER-PROVIDED CHART",
            ["secChannel"]       = "III. REVENUE BY SALES CHANNEL",
            ["channelShare"]     = "Revenue share by channel:",
            ["secProducts"]      = "IV. TOP SELLING PRODUCTS",
            ["topProductsChart"] = "Revenue — Top 5 Products:",
            ["secAI"]            = "V. AI INSIGHTS & RECOMMENDATIONS",
            ["pageOf"]           = "Page",
            ["colRevenue"]       = "Revenue (VND)",
            ["colOrders"]        = "Orders",
            ["colShare"]         = "Share",
            ["colChannel"]       = "Channel",
            ["colProduct"]       = "Product",
            ["colQty"]           = "Qty Sold",
            ["rank"]             = "#",
            ["kpiRevenue"]       = "Net Revenue",
            ["kpiProfit"]        = "Gross Profit",
            ["kpiOrders"]        = "Total Orders",
            ["kpiAov"]           = "Avg. Order Value",
            ["kpiMargin"]        = "Profit Margin",
            ["kpiCustomers"]     = "New Customers",
            ["vsLastPeriod"]     = "% vs last period",
            ["legendRevenue"]    = "Revenue",
            ["legendProfit"]     = "Profit",
        },
    };

    private static string S(string lang, string key) =>
        _strings.TryGetValue(lang, out var d) && d.TryGetValue(key, out var v) ? v : key;

    // ── Sample data fallback khi Data Warehouse chưa có dữ liệu thật ──────────
    private static DashboardResponse GenerateSampleData(DateOnly from, DateOnly to)
    {
        var days         = Math.Max(1, to.DayNumber - from.DayNumber + 1);
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
            new(1, "Ao thun Unisex Cotton",  "AT-001", "Shopee",      380, 380, totalRevenue * 0.12m),
            new(2, "Quan jeans Slim Fit",     "QJ-002", "Lazada",      295, 295, totalRevenue * 0.09m),
            new(3, "Giay the thao Nam",       "GT-003", "TikTok Shop", 260, 260, totalRevenue * 0.08m),
            new(4, "Tui xach Nu HQ",          "TX-004", "Shopee",      225, 225, totalRevenue * 0.07m),
            new(5, "Dam maxi Boho",           "DM-005", "Facebook",    190, 190, totalRevenue * 0.06m),
        };

        var rand = new Random(42);
        var revenueByDay = new List<RevenueByDay>();
        for (int i = 0; i < days; i++)
        {
            var d   = from.AddDays(i);
            var rev = 8_000_000m + (decimal)(Math.Sin(i / 10.0) * 3_000_000)
                    + (decimal)(rand.NextDouble() * 2_000_000);
            revenueByDay.Add(new RevenueByDay(d, Math.Round(rev, 0), Math.Round(rev * 0.25m, 0), rand.Next(15, 36)));
        }

        return new DashboardResponse(kpi, revenueByDay, channels, products);
    }

    // ── QuestPDF-native chart helpers ──────────────────────────────────────────

    /// <summary>Horizontal bar chart bằng QuestPDF layout thuần túy</summary>
    private static void AddHorizontalBarChart(
        ColumnDescriptor col,
        IList<(string Label, decimal Value, string HexColor)> items)
    {
        if (items.Count == 0) return;

        var max = items.Max(x => x.Value);
        if (max <= 0) max = 1;

        var palette = new[] { "#6366F1", "#10B981", "#F59E0B", "#3B82F6", "#EC4899" };

        foreach (var (label, value, hex) in items)
        {
            var pct  = (float)(value / max);      // 0 → 1
            var rest = Math.Max(0f, 1f - pct);
            var color = string.IsNullOrWhiteSpace(hex) ? palette[0] : hex;

            col.Item().PaddingBottom(6).Row(row =>
            {
                // Label
                row.ConstantItem(130)
                    .AlignMiddle().AlignRight().PaddingRight(8)
                    .Text(label).FontSize(9).FontColor(Color.FromHex("#374151"));

                // Bar (nền xám + thanh màu)
                row.RelativeItem().Height(18).Background(Color.FromHex("#F3F4F6")).Row(barRow =>
                {
                    if (pct > 0)
                        barRow.RelativeItem(pct * 100f).Background(Color.FromHex(color));
                    if (rest > 0)
                        barRow.RelativeItem(rest * 100f);
                });

                // Giá trị
                row.ConstantItem(85).AlignMiddle().PaddingLeft(6)
                    .Text($"{value / 1_000_000:N0} M").FontSize(9).FontColor(Color.FromHex("#6B7280"));
            });
        }
    }

    /// <summary>Revenue trend bar chart nhỏ theo ngày</summary>
    private static void AddRevenueTrendBars(ColumnDescriptor col, IList<RevenueByDay> days, string lang = "vi")
    {
        // Lấy tối đa 28 điểm (4 tuần nếu daily)
        var step    = Math.Max(1, days.Count / 28);
        var sampled = days.Where((_, i) => i % step == 0).Take(28).ToList();
        if (sampled.Count == 0) return;

        var maxRev = sampled.Max(d => d.NetRevenue);
        var maxPro = sampled.Max(d => d.GrossProfit);
        if (maxRev <= 0) maxRev = 1;

        const float chartH = 60f;

        // Chart title + legend
        col.Item().PaddingBottom(4).Row(r =>
        {
            r.RelativeItem();
            r.ConstantItem(12).Height(10).Background(Color.FromHex("#6366F1"));
            r.ConstantItem(55).PaddingLeft(3).Text(S(lang, "legendRevenue")).FontSize(8).FontColor(Color.FromHex("#6366F1"));
            r.ConstantItem(12).Height(10).Background(Color.FromHex("#10B981"));
            r.ConstantItem(50).PaddingLeft(3).Text(S(lang, "legendProfit")).FontSize(8).FontColor(Color.FromHex("#10B981"));
        });

        // Khung chart
        col.Item().Height(chartH + 14).Border(0.5f).BorderColor(Colors.Grey.Lighten2)
            .Padding(2).Row(outer =>
            {
                // Y-axis min/max label
                outer.ConstantItem(28).Column(yAxis =>
                {
                    yAxis.Item().AlignTop().Text($"{maxRev / 1_000_000:N0}M")
                        .FontSize(6).FontColor(Color.FromHex("#9CA3AF"));
                    yAxis.Item().AlignBottom().Text("0")
                        .FontSize(6).FontColor(Color.FromHex("#9CA3AF"));
                });

                // Bars
                outer.RelativeItem().Row(barsRow =>
                {
                    foreach (var d in sampled)
                    {
                        var revPct = (float)(d.NetRevenue / maxRev);
                        var proPct = maxPro > 0 ? (float)(d.GrossProfit / maxRev) : 0;

                        barsRow.RelativeItem().Column(c =>
                        {
                            // Khoảng trống phía trên (chiều cao phần trống)
                            var topSpace = chartH * (1f - revPct);
                            var revH     = chartH * revPct;
                            var proH     = chartH * proPct;

                            c.Item().Height(topSpace);
                            // Doanh thu bar
                            c.Item().Height(revH - proH > 0 ? revH - proH : 0)
                                .Background(Color.FromHex("#6366F1"));
                            // Lợi nhuận bar (phần dưới cùng)
                            c.Item().Height(proH).Background(Color.FromHex("#10B981"));
                            // Day label
                            c.Item().Height(14).AlignCenter()
                                .Text($"{d.Date.Day}").FontSize(5.5f).FontColor(Color.FromHex("#9CA3AF"));
                        });
                    }
                });
            });
    }

    // ── QuestPDF helpers ───────────────────────────────────────────────────────

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
                    var sign  = trend > 0 ? "+" : "";
                    var color = trend > 0 ? Color.FromHex("#1abc9c") : Color.FromHex("#e74c3c");
                    c.Item().Text($"{sign}{Math.Abs(trend):N1}% so ky truoc")
                        .FontSize(8).FontColor(color);
                }
            });
    }

    private static void AddSectionHeader(ColumnDescriptor col, string text)
    {
        col.Item().PaddingTop(12).Text(text)
            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
        col.Item().PaddingTop(3).PaddingBottom(5)
            .LineHorizontal(0.5f).LineColor(Color.FromHex("#DBEAFE"));
    }

    // ── Main PDF Generator ─────────────────────────────────────────────────────

    public async Task<byte[]> GenerateReportAsync(
        DateOnly from, DateOnly to,
        string? channel,
        string? chartBase64    = null,
        string  language       = "vi",
        bool    inclOverview   = true,
        bool    inclSales      = true,
        bool    inclChannel    = true,
        bool    inclAI         = false)
    {
        var data = await _dashboard.GetDashboardAsync(from, to, channel);

        // Fallback: dùng sample data nếu bất kỳ section nào thiếu dữ liệu
        var usingSample = data.Kpi.TotalRevenue == 0
                       || data.RevenueByChannel.Count == 0
                       || data.TopProducts.Count == 0;
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
                            c.Item().Text(S(language, "reportTitle"))
                                .FontSize(15).Bold().FontColor(Color.FromHex("#1a5276"));
                            c.Item().Text(S(language, "systemName"))
                                .FontSize(9).FontColor(Colors.Grey.Medium);
                        });
                        row.ConstantItem(175).AlignRight().Column(c =>
                        {
                            c.Item().AlignRight()
                                .Text($"{S(language, "generatedAt")}: {DateTime.Now:dd/MM/yyyy HH:mm}")
                                .FontSize(9).FontColor(Colors.Grey.Medium);
                            if (usingSample)
                                c.Item().AlignRight().Text(S(language, "sampleNotice"))
                                    .FontSize(8).FontColor(Colors.Orange.Medium);
                        });
                    });
                    col.Item().PaddingVertical(3)
                        .LineHorizontal(1.5f).LineColor(Color.FromHex("#1a5276"));
                    col.Item().Text(
                        $"{S(language, "period")}: {from:dd/MM/yyyy} — {to:dd/MM/yyyy}" +
                        (channel is not null
                            ? $" | {S(language, "channel")}: {channel}"
                            : $" | {S(language, "allChannels")}")
                    ).FontSize(10).Italic().FontColor(Colors.Grey.Darken1);
                });

                // ── Content ─────────────────────────────────────────────────
                page.Content().PaddingTop(1, Unit.Centimetre).Column(col =>
                {
                    // ── I. KPI Overview ──────────────────────────────────────
                    if (inclOverview)
                    {
                        AddSectionHeader(col, S(language, "secOverview"));

                        col.Item().PaddingVertical(5).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                            });
                            AddKpiCell(table, S(language, "kpiRevenue"),   $"{data.Kpi.TotalRevenue:N0} VND",  data.Kpi.RevenueGrowthPct);
                            AddKpiCell(table, S(language, "kpiProfit"),    $"{data.Kpi.TotalProfit:N0} VND",   data.Kpi.ProfitMarginPct);
                            AddKpiCell(table, S(language, "kpiOrders"),    $"{data.Kpi.TotalOrders:N0}",        data.Kpi.OrdersGrowthPct);
                            AddKpiCell(table, S(language, "kpiAov"),       $"{data.Kpi.AvgOrderValue:N0} VND",  0);
                            AddKpiCell(table, S(language, "kpiMargin"),    $"{data.Kpi.ProfitMarginPct:N1}%",   0);
                            AddKpiCell(table, S(language, "kpiCustomers"), $"{data.Kpi.NewCustomers:N0}",        data.Kpi.CustomersGrowthPct);
                        });

                        if (data.RevenueByDay.Count > 0)
                        {
                            col.Item().PaddingTop(8).Text(S(language, "secTrend"))
                                .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                            col.Item().PaddingTop(4).PaddingBottom(8);
                            AddRevenueTrendBars(col, data.RevenueByDay, language);
                        }

                        col.Item().PaddingBottom(8);
                    }

                    // ── II. Custom chart từ frontend (nếu có) ───────────────
                    if (!string.IsNullOrEmpty(chartBase64))
                    {
                        AddSectionHeader(col, S(language, "secChart"));
                        col.Item().PaddingTop(5).Image(
                            Convert.FromBase64String(chartBase64)
                        ).FitWidth();
                        col.Item().PaddingBottom(15);
                    }

                    // ── III. Doanh thu theo kênh ─────────────────────────────
                    if (inclChannel && data.RevenueByChannel.Count > 0)
                    {
                        AddSectionHeader(col, S(language, "secChannel"));

                        col.Item().PaddingTop(6).Text(S(language, "channelShare"))
                            .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(4).PaddingBottom(4);

                        var channelPalette = new[] { "#6366F1", "#10B981", "#F59E0B", "#3B82F6", "#EC4899" };
                        var channelBars = data.RevenueByChannel
                            .Select((ch, i) => (ch.ChannelName, ch.Revenue, channelPalette[i % channelPalette.Length]))
                            .ToList();
                        AddHorizontalBarChart(col, channelBars);

                        col.Item().PaddingTop(8).Table(table =>
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
                                foreach (var title in new[] {
                                    S(language, "colChannel"),
                                    S(language, "colRevenue"),
                                    S(language, "colOrders"),
                                    S(language, "colShare"),
                                })
                                    h.Cell().Background(Color.FromHex("#DBEAFE")).Padding(5)
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

                    // ── IV. Top sản phẩm ─────────────────────────────────────
                    if (inclSales && data.TopProducts.Count > 0)
                    {
                        AddSectionHeader(col, S(language, "secProducts"));

                        col.Item().PaddingTop(6).Text(S(language, "topProductsChart"))
                            .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(4).PaddingBottom(4);

                        var productPalette = new[] { "#6366F1", "#10B981", "#F59E0B", "#3B82F6", "#EC4899" };
                        var productBars = data.TopProducts
                            .Take(5)
                            .Select((p, i) => (p.ProductName, p.Revenue, productPalette[i % productPalette.Length]))
                            .ToList();
                        AddHorizontalBarChart(col, productBars);

                        col.Item().PaddingTop(8).Table(table =>
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
                                foreach (var t in new[] {
                                    S(language, "rank"),
                                    S(language, "colProduct"),
                                    S(language, "colChannel"),
                                    S(language, "colQty"),
                                    S(language, "colRevenue"),
                                })
                                    h.Cell().Background(Color.FromHex("#DBEAFE")).Padding(5)
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

                    // ── V. Nhận xét AI (rule-based, theo ngôn ngữ) ───────────
                    if (inclAI)
                    {
                        AddSectionHeader(col, S(language, "secAI"));
                        col.Item().PaddingTop(5).Column(ai =>
                        {
                            var topCh = data.RevenueByChannel.FirstOrDefault();
                            bool isEn = language == "en";

                            var growthText = data.Kpi.RevenueGrowthPct > 0
                                ? (isEn ? $"grew {data.Kpi.RevenueGrowthPct:N1}% vs. last period."
                                        : $"tăng trưởng {data.Kpi.RevenueGrowthPct:N1}% so kỳ trước.")
                                : (isEn ? $"declined {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% vs. last period."
                                        : $"giảm {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% so kỳ trước.");

                            var insights = isEn
                                ? new List<string>
                                {
                                    $"• Period revenue: {data.Kpi.TotalRevenue:N0} VND — {growthText}",
                                    topCh is not null
                                        ? $"• Top channel: {topCh.ChannelName} contributes {topCh.RevenuePct:N1}% of revenue."
                                        : "",
                                    $"• Gross profit margin: {data.Kpi.ProfitMarginPct:N1}%.",
                                    data.Kpi.ProfitMarginPct < 20
                                        ? "• Recommendation: Optimize operating costs to improve profit margin."
                                        : "• Margin is healthy. Consider increasing marketing budget.",
                                    $"• Total {data.Kpi.TotalOrders:N0} orders, avg. value {data.Kpi.AvgOrderValue:N0} VND.",
                                    $"• New customers acquired: {data.Kpi.NewCustomers:N0}.",
                                }
                                : new List<string>
                                {
                                    $"• Doanh thu kỳ này đạt {data.Kpi.TotalRevenue:N0} VND, {growthText}",
                                    topCh is not null
                                        ? $"• Kênh bán hàng đóng góp cao nhất: {topCh.ChannelName} ({topCh.RevenuePct:N1}% doanh thu)."
                                        : "",
                                    $"• Biên lợi nhuận gộp đạt {data.Kpi.ProfitMarginPct:N1}%.",
                                    data.Kpi.ProfitMarginPct < 20
                                        ? "• Khuyến nghị: Tối ưu chi phí vận hành để cải thiện biên lợi nhuận."
                                        : "• Biên lợi nhuận ở mức tốt. Có thể đẩy mạnh ngân sách marketing.",
                                    $"• Tổng {data.Kpi.TotalOrders:N0} đơn hàng với giá trị trung bình {data.Kpi.AvgOrderValue:N0} VND/đơn.",
                                    $"• Tổng số khách hàng mới trong kỳ: {data.Kpi.NewCustomers:N0} khách.",
                                };

                            foreach (var line in insights.Where(l => l.Length > 0))
                                ai.Item().PaddingBottom(4).Text(line).FontSize(10);
                        });
                    }
                });

                // ── Footer ───────────────────────────────────────────────────
                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span($"{S(language, "systemName")}  |  {S(language, "pageOf")} ")
                        .FontSize(9).FontColor(Colors.Grey.Medium);
                    text.CurrentPageNumber().FontSize(9).FontColor(Colors.Grey.Medium);
                    text.Span(" / ").FontSize(9).FontColor(Colors.Grey.Medium);
                    text.TotalPages().FontSize(9).FontColor(Colors.Grey.Medium);
                });
            });
        });

        return pdf.GeneratePdf();
    }
}
