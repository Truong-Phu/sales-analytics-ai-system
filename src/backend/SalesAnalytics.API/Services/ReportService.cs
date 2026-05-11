using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.API.Services;

/// <summary>Xuất báo cáo PDF bằng QuestPDF, biểu đồ native (không dùng ScottPlot)</summary>
public class ReportService
{
    private readonly DashboardService _dashboard;
    private static readonly CultureInfo ViVN = CultureInfo.GetCultureInfo("vi-VN");

    public ReportService(DashboardService dashboard) => _dashboard = dashboard;

    // Định dạng tiền tệ VND chuẩn: 285.000.000 VND
    private static string FmtVnd(decimal v) => v.ToString("N0", ViVN) + " VND";
    private static string FmtNum(decimal v) => v.ToString("N0", ViVN);

    // ── Chuỗi dịch PDF theo ngôn ngữ ─────────────────────────────────────────
    private static readonly Dictionary<string, Dictionary<string, string>> _strings = new()
    {
        ["vi"] = new()
        {
            ["reportTitle"]      = "BÁO CÁO PHÂN TÍCH BÁN HÀNG ĐA KÊNH",
            ["systemName"]       = "MSAS — Hệ thống Phân tích Bán hàng Đa kênh",
            ["generatedAt"]      = "Ngày xuất",
            ["exportedBy"]       = "Người xuất",
            ["period"]           = "Kỳ báo cáo",
            ["allChannels"]      = "Tất cả kênh",
            ["channel"]          = "Kênh",
            ["confidential"]     = "Nội bộ — Không phổ biến ra ngoài",
            ["sampleNotice"]     = "Dữ liệu mẫu — chưa có đủ dữ liệu thực",
            ["footerText"]       = "Báo cáo được tạo bởi MSAS — Bảo mật nội bộ",
            ["secOverview"]      = "I. CHỈ SỐ KINH DOANH TỔNG QUAN",
            ["secTrend"]         = "Xu hướng Doanh thu & Lợi nhuận (theo ngày):",
            ["secChart"]         = "II. BIỂU ĐỒ TỪ NGƯỜI DÙNG",
            ["secChannel"]       = "III. DOANH THU THEO KÊNH BÁN HÀNG",
            ["channelShare"]     = "Tỷ trọng doanh thu theo kênh:",
            ["secProducts"]      = "IV. TOP SẢN PHẨM BÁN CHẠY",
            ["topProductsChart"] = "Doanh thu Top 5 sản phẩm:",
            ["secCustomer"]      = "V. PHÂN TÍCH KHÁCH HÀNG",
            ["secMarketing"]     = "VI. MARKETING & ROI",
            ["secInventory"]     = "VII. TỒN KHO & VẬN HÀNH",
            ["secAI"]            = "NHẬN XÉT & KHUYẾN NGHỊ",
            ["secAppendix"]      = "PHỤ LỤC — DỮ LIỆU CHI TIẾT",
            ["pageOf"]           = "Trang",
            ["colDate"]          = "Ngày",
            ["colRevenue"]       = "Doanh thu",
            ["colOrders"]        = "Đơn hàng",
            ["colReturn"]        = "Hoàn đơn",
            ["colShare"]         = "Tỷ trọng",
            ["colChannel"]       = "Kênh",
            ["colProduct"]       = "Sản phẩm",
            ["colSku"]           = "SKU",
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
            ["appDailyTitle"]    = "A. ĐƠN HÀNG THEO NGÀY",
            ["appProductTitle"]  = "B. TOP 20 SẢN PHẨM BÁN CHẠY",
            ["appChannelTitle"]  = "C. DOANH THU THEO KÊNH",
            ["noData"]           = "Chưa có dữ liệu",
            ["coverSubtitle"]    = "Báo cáo phân tích dữ liệu bán hàng đa kênh tích hợp AI",
            ["company"]          = "Doanh nghiệp",
            ["preparedBy"]       = "Được chuẩn bị bởi",
            ["custNewCustomers"] = "Khách hàng mới trong kỳ",
            ["custAvgValue"]     = "Giá trị đơn hàng trung bình",
            ["custRetention"]    = "Tỷ lệ khách quay lại (ước tính)",
            ["mktAdSpend"]       = "Chi phí quảng cáo (ước tính)",
            ["mktRoi"]           = "ROI quảng cáo (ước tính)",
            ["mktCpa"]           = "Chi phí mỗi khách hàng mới (ước tính)",
            ["invTurnover"]      = "Vòng quay hàng tồn kho (ước tính)",
            ["invFulfillment"]   = "Tỷ lệ hoàn thành đơn (ước tính)",
            ["invReturnRate"]    = "Tỷ lệ hoàn đơn (ước tính)",
        },
        ["en"] = new()
        {
            ["reportTitle"]      = "MULTI-CHANNEL SALES ANALYTICS REPORT",
            ["systemName"]       = "MSAS — Multi-channel Sales Analytics System",
            ["generatedAt"]      = "Generated at",
            ["exportedBy"]       = "Exported by",
            ["period"]           = "Period",
            ["allChannels"]      = "All channels",
            ["channel"]          = "Channel",
            ["confidential"]     = "Internal — Not for external distribution",
            ["sampleNotice"]     = "Sample data — insufficient real data",
            ["footerText"]       = "Report generated by MSAS — Internal Confidential",
            ["secOverview"]      = "I. BUSINESS KPI OVERVIEW",
            ["secTrend"]         = "Revenue & Profit Trend (daily):",
            ["secChart"]         = "II. USER-PROVIDED CHART",
            ["secChannel"]       = "III. REVENUE BY SALES CHANNEL",
            ["channelShare"]     = "Revenue share by channel:",
            ["secProducts"]      = "IV. TOP SELLING PRODUCTS",
            ["topProductsChart"] = "Revenue — Top 5 Products:",
            ["secCustomer"]      = "V. CUSTOMER ANALYSIS",
            ["secMarketing"]     = "VI. MARKETING & ROI",
            ["secInventory"]     = "VII. INVENTORY & OPERATIONS",
            ["secAI"]            = "AI INSIGHTS & RECOMMENDATIONS",
            ["secAppendix"]      = "APPENDIX — DETAILED DATA",
            ["pageOf"]           = "Page",
            ["colDate"]          = "Date",
            ["colRevenue"]       = "Revenue (VND)",
            ["colOrders"]        = "Orders",
            ["colReturn"]        = "Returns",
            ["colShare"]         = "Share",
            ["colChannel"]       = "Channel",
            ["colProduct"]       = "Product",
            ["colSku"]           = "SKU",
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
            ["appDailyTitle"]    = "A. DAILY ORDERS",
            ["appProductTitle"]  = "B. TOP 20 PRODUCTS",
            ["appChannelTitle"]  = "C. REVENUE BY CHANNEL",
            ["noData"]           = "No data available",
            ["coverSubtitle"]    = "AI-powered multi-channel sales analytics report",
            ["company"]          = "Company",
            ["preparedBy"]       = "Prepared by",
            ["custNewCustomers"] = "New customers this period",
            ["custAvgValue"]     = "Average order value",
            ["custRetention"]    = "Repeat customer rate (est.)",
            ["mktAdSpend"]       = "Ad spend (est.)",
            ["mktRoi"]           = "Advertising ROI (est.)",
            ["mktCpa"]           = "Cost per new customer (est.)",
            ["invTurnover"]      = "Inventory turnover (est.)",
            ["invFulfillment"]   = "Order fulfillment rate (est.)",
            ["invReturnRate"]    = "Return rate (est.)",
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
            var pct  = (float)(value / max);
            var rest = Math.Max(0f, 1f - pct);
            var color = string.IsNullOrWhiteSpace(hex) ? palette[0] : hex;

            col.Item().PaddingBottom(6).Row(row =>
            {
                row.ConstantItem(130)
                    .AlignMiddle().AlignRight().PaddingRight(8)
                    .Text(label).FontSize(9).FontColor(Color.FromHex("#374151"));

                row.RelativeItem().Height(18).Background(Color.FromHex("#F3F4F6")).Row(barRow =>
                {
                    if (pct > 0)
                        barRow.RelativeItem(pct * 100f).Background(Color.FromHex(color));
                    if (rest > 0)
                        barRow.RelativeItem(rest * 100f);
                });

                row.ConstantItem(95).AlignMiddle().PaddingLeft(6)
                    .Text($"{value / 1_000_000:N1}M").FontSize(9).FontColor(Color.FromHex("#6B7280"));
            });
        }
    }

    /// <summary>Revenue trend bar chart nhỏ theo ngày</summary>
    private static void AddRevenueTrendBars(ColumnDescriptor col, IList<RevenueByDay> days, string lang = "vi")
    {
        var step    = Math.Max(1, days.Count / 28);
        var sampled = days.Where((_, i) => i % step == 0).Take(28).ToList();
        if (sampled.Count == 0) return;

        var maxRev = sampled.Max(d => d.NetRevenue);
        var maxPro = sampled.Max(d => d.GrossProfit);
        if (maxRev <= 0) maxRev = 1;

        const float chartH = 60f;

        col.Item().PaddingBottom(4).Row(r =>
        {
            r.RelativeItem();
            r.ConstantItem(12).Height(10).Background(Color.FromHex("#6366F1"));
            r.ConstantItem(55).PaddingLeft(3).Text(S(lang, "legendRevenue")).FontSize(8).FontColor(Color.FromHex("#6366F1"));
            r.ConstantItem(12).Height(10).Background(Color.FromHex("#10B981"));
            r.ConstantItem(50).PaddingLeft(3).Text(S(lang, "legendProfit")).FontSize(8).FontColor(Color.FromHex("#10B981"));
        });

        col.Item().Height(chartH + 14).Border(0.5f).BorderColor(Colors.Grey.Lighten2)
            .Padding(2).Row(outer =>
            {
                outer.ConstantItem(28).Column(yAxis =>
                {
                    yAxis.Item().AlignTop().Text($"{maxRev / 1_000_000:N0}M")
                        .FontSize(6).FontColor(Color.FromHex("#9CA3AF"));
                    yAxis.Item().AlignBottom().Text("0")
                        .FontSize(6).FontColor(Color.FromHex("#9CA3AF"));
                });

                outer.RelativeItem().Row(barsRow =>
                {
                    foreach (var d in sampled)
                    {
                        var revPct = (float)(d.NetRevenue / maxRev);
                        var proPct = maxPro > 0 ? (float)(d.GrossProfit / maxRev) : 0;

                        barsRow.RelativeItem().Column(c =>
                        {
                            var topSpace = chartH * (1f - revPct);
                            var revH     = chartH * revPct;
                            var proH     = chartH * proPct;

                            c.Item().Height(topSpace);
                            c.Item().Height(revH - proH > 0 ? revH - proH : 0)
                                .Background(Color.FromHex("#6366F1"));
                            c.Item().Height(proH).Background(Color.FromHex("#10B981"));
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

    private static void AddTableHeader(TableDescriptor table, IEnumerable<string> headers)
    {
        table.Header(h =>
        {
            foreach (var title in headers)
                h.Cell().Background(Color.FromHex("#DBEAFE")).Padding(5)
                    .Text(title).Bold().FontSize(9).FontColor(Color.FromHex("#1a5276"));
        });
    }

    private static Color AltRow(int i) =>
        i % 2 == 0 ? Color.FromHex("#f8f9fc") : Colors.White;

    // ── Main PDF Generator ─────────────────────────────────────────────────────

    public async Task<byte[]> GenerateReportAsync(
        DateOnly from, DateOnly to,
        string? channel,
        string? chartBase64    = null,
        string  language       = "vi",
        bool    inclOverview   = true,
        bool    inclSales      = true,
        bool    inclChannel    = false,
        bool    inclCustomer   = false,
        bool    inclMarketing  = false,
        bool    inclInventory  = false,
        bool    inclAI         = true,
        Guid?   companyId      = null,
        string  companyName    = "—",
        string  userName       = "",
        string  userRole       = "")
    {
        var data = await _dashboard.GetDashboardAsync(from, to, channel, companyId);

        var usingSample = data.Kpi.TotalRevenue == 0
                       || data.RevenueByChannel.Count == 0
                       || data.TopProducts.Count == 0;
        if (usingSample) data = GenerateSampleData(from, to);

        QuestPDF.Settings.License = LicenseType.Community;

        var channelDisplay = channel is not null ? channel : S(language, "allChannels");
        var now            = DateTime.Now;
        var exportedByText = string.IsNullOrWhiteSpace(userName)
            ? "MSAS System"
            : $"{userName} ({userRole})";

        // Tính share% cho từng sản phẩm trong Top 20
        var totalProductRevenue = data.TopProducts.Sum(p => p.Revenue);
        if (totalProductRevenue == 0) totalProductRevenue = 1;

        var pdf = Document.Create(container =>
        {
            // ═════════════════════════════════════════════════════════════════
            // TRANG BÌA (Cover Page)
            // ═════════════════════════════════════════════════════════════════
            container.Page(cover =>
            {
                cover.Size(PageSizes.A4);
                cover.Margin(0);
                cover.DefaultTextStyle(x => x.FontSize(11).FontFamily("Arial"));

                cover.Content().Column(col =>
                {
                    // Dải màu trên (header brand)
                    col.Item().Height(8).Background(Color.FromHex("#1a5276"));

                    // Dải xanh nhạt thứ hai
                    col.Item().Height(3).Background(Color.FromHex("#2980b9"));

                    col.Item().PaddingHorizontal(50).PaddingTop(50).Column(body =>
                    {
                        // Logo text MSAS
                        body.Item().Text("MSAS")
                            .FontSize(48).Bold().FontColor(Color.FromHex("#1a5276"));

                        body.Item().PaddingTop(4).Text(S(language, "systemName"))
                            .FontSize(12).FontColor(Color.FromHex("#2980b9"));

                        // Đường kẻ phân cách
                        body.Item().PaddingVertical(30)
                            .LineHorizontal(1.5f).LineColor(Color.FromHex("#1a5276"));

                        // Tiêu đề báo cáo
                        body.Item().Text(S(language, "reportTitle"))
                            .FontSize(22).Bold().FontColor(Color.FromHex("#1a5276"));

                        body.Item().PaddingTop(10).Text(S(language, "coverSubtitle"))
                            .FontSize(13).Italic().FontColor(Color.FromHex("#5d6d7e"));

                        // Thông tin báo cáo
                        body.Item().PaddingTop(50).Column(info =>
                        {
                            void InfoRow(string label, string value)
                            {
                                info.Item().PaddingBottom(12).Row(r =>
                                {
                                    r.ConstantItem(180).Text(label)
                                        .FontSize(10).FontColor(Color.FromHex("#7f8c8d"));
                                    r.RelativeItem().Text(value)
                                        .FontSize(10).Bold().FontColor(Color.FromHex("#2c3e50"));
                                });
                            }

                            InfoRow(S(language, "company"),     companyName);
                            InfoRow(S(language, "period"),      $"{from:dd/MM/yyyy} — {to:dd/MM/yyyy}");
                            InfoRow(S(language, "channel"),     channelDisplay);
                            InfoRow(S(language, "generatedAt"), now.ToString("dd/MM/yyyy HH:mm"));
                            InfoRow(S(language, "exportedBy"),  exportedByText);
                        });

                        // Nhãn bảo mật
                        body.Item().PaddingTop(60).Row(r =>
                        {
                            r.AutoItem()
                                .Border(1).BorderColor(Color.FromHex("#c0392b"))
                                .Padding(6).PaddingHorizontal(12)
                                .Text(S(language, "confidential"))
                                .FontSize(9).Bold().FontColor(Color.FromHex("#c0392b"));
                        });

                        // Banner dữ liệu mẫu (nếu cần)
                        if (usingSample)
                        {
                            body.Item().PaddingTop(12).Row(r =>
                            {
                                r.AutoItem()
                                    .Background(Color.FromHex("#fef9e7"))
                                    .Border(1).BorderColor(Color.FromHex("#f39c12"))
                                    .Padding(6).PaddingHorizontal(12)
                                    .Text(S(language, "sampleNotice"))
                                    .FontSize(9).FontColor(Color.FromHex("#d68910"));
                            });
                        }
                    });

                    // Spacer để đẩy footer xuống
                    col.Item().Extend();

                    // Footer trang bìa
                    col.Item().PaddingHorizontal(50).PaddingBottom(20)
                        .Row(r =>
                        {
                            r.RelativeItem().Text($"© {now.Year} MSAS — {S(language, "confidential")}")
                                .FontSize(8).FontColor(Color.FromHex("#aab7b8"));
                            r.AutoItem().AlignRight().Text(now.ToString("dd/MM/yyyy"))
                                .FontSize(8).FontColor(Color.FromHex("#aab7b8"));
                        });

                    // Dải màu dưới
                    col.Item().Height(8).Background(Color.FromHex("#1a5276"));
                });
            });

            // ═════════════════════════════════════════════════════════════════
            // NỘI DUNG (Content Pages)
            // ═════════════════════════════════════════════════════════════════
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(2, Unit.Centimetre);
                page.DefaultTextStyle(x => x.FontSize(10).FontFamily("Arial"));

                // ── Header mỗi trang ─────────────────────────────────────────
                page.Header().Column(col =>
                {
                    col.Item().Row(row =>
                    {
                        // Logo text nhỏ
                        row.AutoItem().Border(1).BorderColor(Color.FromHex("#1a5276"))
                            .Padding(4).PaddingHorizontal(8)
                            .Text("MSAS").FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));

                        row.RelativeItem().PaddingLeft(8).AlignMiddle()
                            .Text(companyName).FontSize(9).FontColor(Color.FromHex("#5d6d7e"));

                        // Số trang
                        row.AutoItem().AlignRight().AlignMiddle().Text(text =>
                        {
                            text.Span($"{S(language, "pageOf")} ").FontSize(9).FontColor(Colors.Grey.Medium);
                            text.CurrentPageNumber().FontSize(9).Bold().FontColor(Color.FromHex("#1a5276"));
                            text.Span(" / ").FontSize(9).FontColor(Colors.Grey.Medium);
                            text.TotalPages().FontSize(9).Bold().FontColor(Color.FromHex("#1a5276"));
                        });
                    });
                    col.Item().PaddingTop(3).LineHorizontal(1).LineColor(Color.FromHex("#1a5276"));

                    // Dòng meta: kỳ báo cáo + kênh
                    col.Item().PaddingTop(3).Text(
                        $"{S(language, "period")}: {from:dd/MM/yyyy} — {to:dd/MM/yyyy}" +
                        $"   |   {S(language, "channel")}: {channelDisplay}"
                    ).FontSize(8).Italic().FontColor(Colors.Grey.Darken1);
                });

                // ── Nội dung chính ───────────────────────────────────────────
                page.Content().PaddingTop(0.5f, Unit.Centimetre).Column(col =>
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
                            AddKpiCell(table, S(language, "kpiRevenue"),   FmtVnd(data.Kpi.TotalRevenue),     data.Kpi.RevenueGrowthPct);
                            AddKpiCell(table, S(language, "kpiProfit"),    FmtVnd(data.Kpi.TotalProfit),      data.Kpi.ProfitMarginPct);
                            AddKpiCell(table, S(language, "kpiOrders"),    FmtNum(data.Kpi.TotalOrders),       data.Kpi.OrdersGrowthPct);
                            AddKpiCell(table, S(language, "kpiAov"),       FmtVnd(data.Kpi.AvgOrderValue),    0);
                            AddKpiCell(table, S(language, "kpiMargin"),    $"{data.Kpi.ProfitMarginPct:N1}%",  0);
                            AddKpiCell(table, S(language, "kpiCustomers"), FmtNum(data.Kpi.NewCustomers),      data.Kpi.CustomersGrowthPct);
                        });

                        if (data.RevenueByDay.Count > 0)
                        {
                            col.Item().PaddingTop(8).Text(S(language, "secTrend"))
                                .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                            col.Item().PaddingTop(4);
                            AddRevenueTrendBars(col, data.RevenueByDay, language);
                        }

                        col.Item().PaddingBottom(8);
                    }

                    // ── II. Custom chart từ frontend (nếu có) ────────────────
                    if (!string.IsNullOrEmpty(chartBase64))
                    {
                        AddSectionHeader(col, S(language, "secChart"));
                        col.Item().PaddingTop(5).Image(Convert.FromBase64String(chartBase64)).FitWidth();
                        col.Item().PaddingBottom(15);
                    }

                    // ── III. Doanh thu theo kênh ─────────────────────────────
                    if (inclChannel && data.RevenueByChannel.Count > 0)
                    {
                        AddSectionHeader(col, S(language, "secChannel"));
                        col.Item().PaddingTop(4).Text(S(language, "channelShare"))
                            .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(4);

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
                            AddTableHeader(table, new[] {
                                S(language, "colChannel"),
                                S(language, "colRevenue"),
                                S(language, "colOrders"),
                                S(language, "colShare"),
                            });
                            int ri = 0;
                            foreach (var ch in data.RevenueByChannel)
                            {
                                var bg = AltRow(ri++);
                                table.Cell().Background(bg).Padding(4).Text(ch.ChannelName).FontSize(9);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtVnd(ch.Revenue)).FontSize(9);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtNum(ch.Orders)).FontSize(9);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{ch.RevenuePct:N1}%").FontSize(9);
                            }
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // ── IV. Top sản phẩm ─────────────────────────────────────
                    if (inclSales && data.TopProducts.Count > 0)
                    {
                        AddSectionHeader(col, S(language, "secProducts"));
                        col.Item().PaddingTop(4).Text(S(language, "topProductsChart"))
                            .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(4);

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
                            AddTableHeader(table, new[] {
                                S(language, "rank"),
                                S(language, "colProduct"),
                                S(language, "colChannel"),
                                S(language, "colQty"),
                                S(language, "colRevenue"),
                            });
                            int ri = 0;
                            foreach (var p in data.TopProducts.Take(10))
                            {
                                var bg = AltRow(ri);
                                table.Cell().Background(bg).Padding(4).AlignCenter().Text($"{++ri}").FontSize(9);
                                table.Cell().Background(bg).Padding(4).Text(p.ProductName).FontSize(9);
                                table.Cell().Background(bg).Padding(4).Text(p.Channel).FontSize(9);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtNum(p.QtySold)).FontSize(9);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtVnd(p.Revenue)).FontSize(9);
                            }
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // ── V. Phân tích khách hàng ──────────────────────────────
                    if (inclCustomer)
                    {
                        AddSectionHeader(col, S(language, "secCustomer"));
                        col.Item().PaddingTop(5).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                            });
                            AddTableHeader(table, new[] { "Chỉ số", "Giá trị" });

                            void MetricRow(string label, string value, int idx)
                            {
                                var bg = AltRow(idx);
                                table.Cell().Background(bg).Padding(5).Text(label).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(value).Bold().FontSize(9);
                            }

                            MetricRow(S(language, "custNewCustomers"), FmtNum(data.Kpi.NewCustomers), 0);
                            MetricRow(S(language, "custAvgValue"),     FmtVnd(data.Kpi.AvgOrderValue), 1);
                            // Tỷ lệ khách quay lại ước tính từ tỷ lệ đơn/khách
                            var estRetention = data.Kpi.NewCustomers > 0
                                ? Math.Min(99, (decimal)(data.Kpi.TotalOrders - data.Kpi.NewCustomers) / data.Kpi.NewCustomers * 100m)
                                : 0m;
                            MetricRow(S(language, "custRetention"), $"{Math.Max(0, estRetention):N1}%", 2);
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // ── VI. Marketing & ROI ──────────────────────────────────
                    if (inclMarketing)
                    {
                        AddSectionHeader(col, S(language, "secMarketing"));
                        col.Item().PaddingTop(5).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                            });
                            AddTableHeader(table, new[] { "Chỉ số", "Giá trị" });

                            // Chi phí quảng cáo ước tính = 15% doanh thu
                            var estAdSpend = data.Kpi.TotalRevenue * 0.15m;
                            var estRoi     = estAdSpend > 0
                                ? (data.Kpi.TotalRevenue - estAdSpend) / estAdSpend * 100m
                                : 0m;
                            var estCpa     = data.Kpi.NewCustomers > 0
                                ? estAdSpend / data.Kpi.NewCustomers
                                : 0m;

                            void MetricRow(string label, string value, int idx)
                            {
                                var bg = AltRow(idx);
                                table.Cell().Background(bg).Padding(5).Text(label).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(value).Bold().FontSize(9);
                            }

                            MetricRow(S(language, "mktAdSpend"), FmtVnd(estAdSpend), 0);
                            MetricRow(S(language, "mktRoi"),     $"{estRoi:N1}%",    1);
                            MetricRow(S(language, "mktCpa"),     FmtVnd(estCpa),     2);
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // ── VII. Tồn kho & Vận hành ──────────────────────────────
                    if (inclInventory)
                    {
                        AddSectionHeader(col, S(language, "secInventory"));
                        col.Item().PaddingTop(5).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                            });
                            AddTableHeader(table, new[] { "Chỉ số", "Giá trị" });

                            void MetricRow(string label, string value, int idx)
                            {
                                var bg = AltRow(idx);
                                table.Cell().Background(bg).Padding(5).Text(label).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(value).Bold().FontSize(9);
                            }

                            // Các số liệu tồn kho ước tính (cần tích hợp thực tế sau)
                            MetricRow(S(language, "invTurnover"),    "4.2 lần/năm (ước tính)", 0);
                            MetricRow(S(language, "invFulfillment"), "96.5% (ước tính)",        1);
                            MetricRow(S(language, "invReturnRate"),  "3.2% (ước tính)",          2);
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // ── AI Insights ──────────────────────────────────────────
                    if (inclAI)
                    {
                        AddSectionHeader(col, S(language, "secAI"));
                        col.Item().PaddingTop(5).Column(ai =>
                        {
                            var topCh = data.RevenueByChannel.FirstOrDefault();
                            bool isEn = language == "en";

                            var growthText = data.Kpi.RevenueGrowthPct > 0
                                ? (isEn ? $"grew {data.Kpi.RevenueGrowthPct:N1}% vs. last period."
                                        : $"tang truong {data.Kpi.RevenueGrowthPct:N1}% so ky truoc.")
                                : (isEn ? $"declined {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% vs. last period."
                                        : $"giam {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% so ky truoc.");

                            var insights = isEn
                                ? new List<string>
                                {
                                    $"Revenue this period: {FmtVnd(data.Kpi.TotalRevenue)} — {growthText}",
                                    topCh is not null
                                        ? $"Top channel: {topCh.ChannelName} contributes {topCh.RevenuePct:N1}% of total revenue."
                                        : "",
                                    $"Gross profit margin: {data.Kpi.ProfitMarginPct:N1}%.",
                                    data.Kpi.ProfitMarginPct < 20
                                        ? "Recommendation: Optimize operating costs to improve profit margin."
                                        : "Margin is healthy. Consider increasing the marketing budget.",
                                    $"Total {FmtNum(data.Kpi.TotalOrders)} orders, average value {FmtVnd(data.Kpi.AvgOrderValue)}.",
                                    $"New customers acquired this period: {FmtNum(data.Kpi.NewCustomers)}.",
                                }
                                : new List<string>
                                {
                                    $"Doanh thu ky nay dat {FmtVnd(data.Kpi.TotalRevenue)}, {growthText}",
                                    topCh is not null
                                        ? $"Kenh ban hang dong gop cao nhat: {topCh.ChannelName} ({topCh.RevenuePct:N1}% doanh thu)."
                                        : "",
                                    $"Bien loi nhuan gop dat {data.Kpi.ProfitMarginPct:N1}%.",
                                    data.Kpi.ProfitMarginPct < 20
                                        ? "Khuyen nghi: Toi uu chi phi van hanh de cai thien bien loi nhuan."
                                        : "Bien loi nhuan o muc tot. Co the day manh ngan sach marketing.",
                                    $"Tong {FmtNum(data.Kpi.TotalOrders)} don hang voi gia tri trung binh {FmtVnd(data.Kpi.AvgOrderValue)}/don.",
                                    $"Tong so khach hang moi trong ky: {FmtNum(data.Kpi.NewCustomers)} khach.",
                                };

                            foreach (var line in insights.Where(l => l.Length > 0))
                                ai.Item().PaddingBottom(5)
                                    .Row(r =>
                                    {
                                        r.ConstantItem(14).Text("•").FontSize(10).FontColor(Color.FromHex("#2980b9"));
                                        r.RelativeItem().Text(line).FontSize(10);
                                    });
                        });
                        col.Item().PaddingBottom(15);
                    }

                    // ── Phụ lục: Dữ liệu chi tiết ────────────────────────────
                    AddSectionHeader(col, S(language, "secAppendix"));

                    // A. Đơn hàng theo ngày
                    col.Item().PaddingTop(8).Text(S(language, "appDailyTitle"))
                        .FontSize(11).Bold().FontColor(Color.FromHex("#2980b9"));
                    col.Item().PaddingTop(4);

                    if (data.RevenueByDay.Count > 0)
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(70);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(1);
                            });
                            AddTableHeader(table, new[] {
                                S(language, "colDate"),
                                S(language, "colRevenue"),
                                S(language, "kpiProfit"),
                                S(language, "colOrders"),
                            });
                            int ri = 0;
                            foreach (var d in data.RevenueByDay)
                            {
                                var bg = AltRow(ri++);
                                table.Cell().Background(bg).Padding(3).Text(d.Date.ToString("dd/MM/yyyy")).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtVnd(d.NetRevenue)).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtVnd(d.GrossProfit)).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtNum(d.OrderCount)).FontSize(8);
                            }
                        });
                    }
                    else
                    {
                        col.Item().PaddingTop(4).Text(S(language, "noData"))
                            .FontSize(9).Italic().FontColor(Colors.Grey.Medium);
                    }

                    col.Item().PaddingTop(15);

                    // B. Top 20 sản phẩm
                    col.Item().Text(S(language, "appProductTitle"))
                        .FontSize(11).Bold().FontColor(Color.FromHex("#2980b9"));
                    col.Item().PaddingTop(4);

                    if (data.TopProducts.Count > 0)
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(22);
                                c.RelativeColumn(3);
                                c.ConstantColumn(60);
                                c.RelativeColumn(1);
                                c.RelativeColumn(1);
                                c.RelativeColumn(2);
                                c.ConstantColumn(50);
                            });
                            AddTableHeader(table, new[] {
                                S(language, "rank"),
                                S(language, "colProduct"),
                                S(language, "colSku"),
                                S(language, "colChannel"),
                                S(language, "colQty"),
                                S(language, "colRevenue"),
                                S(language, "colShare"),
                            });
                            int ri = 0;
                            foreach (var p in data.TopProducts.Take(20))
                            {
                                var sharePct = totalProductRevenue > 0
                                    ? p.Revenue / totalProductRevenue * 100m
                                    : 0m;
                                var bg = AltRow(ri);
                                table.Cell().Background(bg).Padding(3).AlignCenter().Text($"{++ri}").FontSize(8);
                                table.Cell().Background(bg).Padding(3).Text(p.ProductName).FontSize(8);
                                table.Cell().Background(bg).Padding(3).Text(p.Sku).FontSize(8);
                                table.Cell().Background(bg).Padding(3).Text(p.Channel).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtNum(p.QtySold)).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtVnd(p.Revenue)).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text($"{sharePct:N1}%").FontSize(8);
                            }
                        });
                    }
                    else
                    {
                        col.Item().PaddingTop(4).Text(S(language, "noData"))
                            .FontSize(9).Italic().FontColor(Colors.Grey.Medium);
                    }

                    col.Item().PaddingTop(15);

                    // C. Doanh thu theo kênh
                    col.Item().Text(S(language, "appChannelTitle"))
                        .FontSize(11).Bold().FontColor(Color.FromHex("#2980b9"));
                    col.Item().PaddingTop(4);

                    if (data.RevenueByChannel.Count > 0)
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(1);
                                c.RelativeColumn(1);
                            });
                            AddTableHeader(table, new[] {
                                S(language, "colChannel"),
                                S(language, "colRevenue"),
                                S(language, "colOrders"),
                                S(language, "colShare"),
                            });
                            int ri = 0;
                            foreach (var ch in data.RevenueByChannel)
                            {
                                var bg = AltRow(ri++);
                                table.Cell().Background(bg).Padding(3).Text(ch.ChannelName).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtVnd(ch.Revenue)).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text(FmtNum(ch.Orders)).FontSize(8);
                                table.Cell().Background(bg).Padding(3).AlignRight().Text($"{ch.RevenuePct:N1}%").FontSize(8);
                            }
                        });
                    }
                    else
                    {
                        col.Item().PaddingTop(4).Text(S(language, "noData"))
                            .FontSize(9).Italic().FontColor(Colors.Grey.Medium);
                    }
                });

                // ── Footer mỗi trang ─────────────────────────────────────────
                page.Footer().Column(col =>
                {
                    col.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
                    col.Item().PaddingTop(4).Row(r =>
                    {
                        r.RelativeItem().Text(S(language, "footerText"))
                            .FontSize(8).FontColor(Colors.Grey.Medium);
                        r.AutoItem().AlignRight().Text(now.ToString("dd/MM/yyyy HH:mm"))
                            .FontSize(8).FontColor(Colors.Grey.Medium);
                    });
                });
            });
        });

        return pdf.GeneratePdf();
    }
}
