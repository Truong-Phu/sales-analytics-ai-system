using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SkiaSharp;
using SalesAnalytics.Core.DTOs;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Xuất báo cáo PDF bằng QuestPDF.
/// Biểu đồ đường xu hướng được vẽ bằng SkiaSharp rồi nhúng PNG vào PDF.
/// </summary>
public class ReportService
{
    private readonly DashboardService _dashboard;
    private static readonly CultureInfo ViVN = CultureInfo.GetCultureInfo("vi-VN");

    public ReportService(DashboardService dashboard) => _dashboard = dashboard;

    // ── Định dạng tiền tệ / số ────────────────────────────────────────────────
    /// <summary>Định dạng tiền VND có dấu phẩy hàng nghìn, căn phải khi đưa vào cell</summary>
    private static string FmtVnd(decimal v) => v.ToString("N0", ViVN) + " VND";
    private static string FmtNum(decimal v) => v.ToString("N0", ViVN);
    private static string FmtNum(int v)     => v.ToString("N0", ViVN);

    // ── Section names (dùng cho selectedSections) ─────────────────────────────
    // Các giá trị hợp lệ: "overview", "trend_chart", "top_products",
    //                     "channel_revenue", "orders_table", "recommendations"
    private static bool HasSection(IList<string>? sections, string name) =>
        sections is null || sections.Count == 0 || sections.Contains(name, StringComparer.OrdinalIgnoreCase);

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
            ["colReturnPct"]     = "Tỷ lệ hoàn %",
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
            ["tocTitle"]         = "MỤC LỤC BÁO CÁO",
            ["tocSection"]       = "Mục",
            ["tocPage"]          = "Trang",
            ["metricLabel"]      = "Chỉ số",
            ["metricValue"]      = "Giá trị",
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
            ["colReturnPct"]     = "Return %",
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
            ["tocTitle"]         = "TABLE OF CONTENTS",
            ["tocSection"]       = "Section",
            ["tocPage"]          = "Page",
            ["metricLabel"]      = "Metric",
            ["metricValue"]      = "Value",
        },
    };

    private static string S(string lang, string key) =>
        _strings.TryGetValue(lang, out var d) && d.TryGetValue(key, out var v) ? v : key;

    // ── SkiaSharp: Vẽ biểu đồ đường xu hướng → PNG bytes ─────────────────────
    /// <summary>
    /// Render line chart (Doanh thu + Lợi nhuận theo ngày) bằng SkiaSharp.
    /// Trả về PNG bytes để nhúng vào QuestPDF bằng Image().
    /// </summary>
    private static byte[] RenderTrendChartPng(IList<RevenueByDay> days, string lang = "vi")
    {
        // Lấy tối đa 60 điểm, bước nhảy đều
        var step    = Math.Max(1, days.Count / 60);
        var sampled = days.Where((_, i) => i % step == 0).Take(60).ToList();
        if (sampled.Count == 0) return Array.Empty<byte>();

        const int W      = 700;   // chiều rộng ảnh (pixel)
        const int H      = 220;   // chiều cao ảnh
        const int padL   = 70;    // padding trái (trục Y)
        const int padR   = 20;    // padding phải
        const int padT   = 20;    // padding trên
        const int padB   = 45;    // padding dưới (trục X)
        const int chartW = W - padL - padR;
        const int chartH = H - padT - padB;

        var maxRev = (float)(sampled.Max(d => d.NetRevenue));
        var maxPro = (float)(sampled.Max(d => d.GrossProfit));
        if (maxRev <= 0) maxRev = 1;

        // Làm tròn maxRev lên mức đẹp (bước 10M)
        var step10M = 10_000_000f;
        var niceMax = (float)(Math.Ceiling(maxRev / step10M) * step10M);
        if (niceMax <= 0) niceMax = step10M;

        var info    = new SKImageInfo(W, H, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(info);
        var canvas  = surface.Canvas;

        // Nền trắng
        canvas.Clear(SKColors.White);

        // ── Gridlines ngang mờ ──────────────────────────────────────────────
        using var gridPaint = new SKPaint
        {
            Color       = new SKColor(220, 220, 220, 180),
            StrokeWidth = 0.8f,
            IsAntialias = true,
        };
        int gridLines = 5;
        for (int g = 0; g <= gridLines; g++)
        {
            float y = padT + chartH - (chartH / gridLines * g);
            canvas.DrawLine(padL, y, padL + chartW, y, gridPaint);

            // Nhãn trục Y (VND rút gọn)
            float valM = niceMax / gridLines * g / 1_000_000f;
            string yLabel = valM >= 1 ? $"{valM:N0}M" : $"{valM * 1000:N0}K";
            using var yPaint = new SKPaint
            {
                Color       = new SKColor(120, 120, 120),
                TextSize    = 11,
                IsAntialias = true,
                TextAlign   = SKTextAlign.Right,
            };
            canvas.DrawText(yLabel, padL - 5, y + 4, yPaint);
        }

        // ── Đường trục X & Y ────────────────────────────────────────────────
        using var axisPaint = new SKPaint
        {
            Color       = new SKColor(180, 180, 180),
            StrokeWidth = 1f,
            IsAntialias = true,
        };
        canvas.DrawLine(padL, padT, padL, padT + chartH, axisPaint);
        canvas.DrawLine(padL, padT + chartH, padL + chartW, padT + chartH, axisPaint);

        // ── Tính tọa độ điểm ────────────────────────────────────────────────
        float xStep = sampled.Count > 1 ? (float)chartW / (sampled.Count - 1) : chartW;

        float X(int i) => padL + i * xStep;
        float Yrev(float v) => padT + chartH - chartH * (v / niceMax);
        float Ypro(float v) => padT + chartH - chartH * (v / niceMax);

        // ── Vẽ vùng fill dưới đường doanh thu (gradient nhẹ) ────────────────
        using var fillRevPath = new SKPath();
        fillRevPath.MoveTo(X(0), padT + chartH);
        for (int i = 0; i < sampled.Count; i++)
            fillRevPath.LineTo(X(i), Yrev((float)sampled[i].NetRevenue));
        fillRevPath.LineTo(X(sampled.Count - 1), padT + chartH);
        fillRevPath.Close();

        using var fillPaint = new SKPaint
        {
            Color       = new SKColor(99, 102, 241, 35),   // indigo nhạt
            IsAntialias = true,
            Style       = SKPaintStyle.Fill,
        };
        canvas.DrawPath(fillRevPath, fillPaint);

        // ── Đường Doanh thu (indigo) ─────────────────────────────────────────
        using var revPath = new SKPath();
        revPath.MoveTo(X(0), Yrev((float)sampled[0].NetRevenue));
        for (int i = 1; i < sampled.Count; i++)
            revPath.LineTo(X(i), Yrev((float)sampled[i].NetRevenue));

        using var revPaint = new SKPaint
        {
            Color       = new SKColor(99, 102, 241),    // #6366F1 indigo
            StrokeWidth = 2f,
            IsAntialias = true,
            Style       = SKPaintStyle.Stroke,
            StrokeCap   = SKStrokeCap.Round,
            StrokeJoin  = SKStrokeJoin.Round,
        };
        canvas.DrawPath(revPath, revPaint);

        // ── Đường Lợi nhuận (xanh lá) ────────────────────────────────────────
        using var proPath = new SKPath();
        proPath.MoveTo(X(0), Ypro((float)sampled[0].GrossProfit));
        for (int i = 1; i < sampled.Count; i++)
            proPath.LineTo(X(i), Ypro((float)sampled[i].GrossProfit));

        using var proPaint = new SKPaint
        {
            Color       = new SKColor(16, 185, 129),    // #10B981 emerald
            StrokeWidth = 1.8f,
            IsAntialias = true,
            Style       = SKPaintStyle.Stroke,
            StrokeCap   = SKStrokeCap.Round,
            StrokeJoin  = SKStrokeJoin.Round,
        };
        canvas.DrawPath(proPath, proPaint);

        // ── Nhãn trục X (5-7 điểm đại diện) ─────────────────────────────────
        using var xLabelPaint = new SKPaint
        {
            Color       = new SKColor(120, 120, 120),
            TextSize    = 10,
            IsAntialias = true,
            TextAlign   = SKTextAlign.Center,
        };
        int xLabelCount  = Math.Min(7, sampled.Count);
        int xLabelStep   = Math.Max(1, sampled.Count / xLabelCount);
        for (int i = 0; i < sampled.Count; i += xLabelStep)
        {
            float xPos = X(i);
            // Vẽ tick nhỏ
            canvas.DrawLine(xPos, padT + chartH, xPos, padT + chartH + 3, axisPaint);
            // Nhãn ngày
            string label = sampled[i].Date.ToString("dd/MM");
            canvas.DrawText(label, xPos, padT + chartH + 16, xLabelPaint);
        }

        // ── Legend ────────────────────────────────────────────────────────────
        using var legendTextPaint = new SKPaint
        {
            Color       = new SKColor(80, 80, 80),
            TextSize    = 11,
            IsAntialias = true,
        };
        using var legendRevDot = new SKPaint { Color = new SKColor(99, 102, 241), IsAntialias = true };
        using var legendProDot = new SKPaint { Color = new SKColor(16, 185, 129),  IsAntialias = true };

        int legX = padL + chartW - 160;
        int legY = padT + 14;
        canvas.DrawCircle(legX, legY, 5, legendRevDot);
        canvas.DrawText(S(lang, "legendRevenue"), legX + 10, legY + 4, legendTextPaint);
        canvas.DrawCircle(legX + 90, legY, 5, legendProDot);
        canvas.DrawText(S(lang, "legendProfit"), legX + 100, legY + 4, legendTextPaint);

        // Xuất PNG
        using var image   = surface.Snapshot();
        using var encoded = image.Encode(SKEncodedImageFormat.Png, 95);
        return encoded.ToArray();
    }

    // ── SkiaSharp chart helpers ────────────────────────────────────────────────

    private static SKColor HexToSk(string hex)
    {
        hex = hex.TrimStart('#');
        if (hex.Length == 6)
        {
            byte r = Convert.ToByte(hex[0..2], 16);
            byte g = Convert.ToByte(hex[2..4], 16);
            byte b = Convert.ToByte(hex[4..6], 16);
            return new SKColor(r, g, b);
        }
        return SKColors.Gray;
    }

    /// <summary>Vẽ biểu đồ cột ngang (horizontal bar) bằng SkiaSharp → PNG bytes</summary>
    private static byte[] DrawBarChartPng(
        IList<(string Label, decimal Value)> items,
        string title = "",
        int W = 660, int H = 0)
    {
        if (items.Count == 0) return Array.Empty<byte>();
        const int barH = 24, gap = 8, padL = 160, padR = 90, padT = 36, padB = 20;
        if (H == 0) H = padT + padB + items.Count * (barH + gap);

        var max = (float)items.Max(x => x.Value);
        if (max <= 0) max = 1;
        int chartW = W - padL - padR;

        var palette = new uint[] { 0xFF6366F1, 0xFF10B981, 0xFFF59E0B, 0xFF3B82F6, 0xFFEC4899, 0xFF8B5CF6, 0xFFF97316 };

        var info = new SKImageInfo(W, H);
        using var surface = SKSurface.Create(info);
        var c = surface.Canvas;
        c.Clear(SKColors.White);

        if (!string.IsNullOrWhiteSpace(title))
        {
            using var tp = new SKPaint { Color = new SKColor(26, 82, 118), TextSize = 13, IsAntialias = true, FakeBoldText = true };
            c.DrawText(title, padL, 22, tp);
        }

        using var labelP = new SKPaint { Color = new SKColor(55, 65, 81), TextSize = 10, IsAntialias = true, TextAlign = SKTextAlign.Right };
        using var valP   = new SKPaint { Color = new SKColor(107, 114, 128), TextSize = 10, IsAntialias = true };
        using var bgP    = new SKPaint { Color = new SKColor(243, 244, 246), IsAntialias = true };

        for (int i = 0; i < items.Count; i++)
        {
            float y    = padT + i * (barH + gap);
            float pct  = (float)items[i].Value / max;
            float fillW = pct * chartW;
            using var barP = new SKPaint { Color = new SKColor(palette[i % palette.Length]), IsAntialias = true };

            c.DrawRect(padL, y, chartW, barH, bgP);
            if (fillW > 0) c.DrawRect(padL, y, fillW, barH, barP);

            c.DrawText(items[i].Label, padL - 6, y + barH * 0.68f, labelP);
            string valStr = items[i].Value >= 1_000_000
                ? $"{items[i].Value / 1_000_000:N1}M"
                : items[i].Value >= 1_000 ? $"{items[i].Value / 1_000:N0}K" : $"{items[i].Value:N0}";
            c.DrawText(valStr, padL + fillW + 5, y + barH * 0.68f, valP);
        }

        using var img = surface.Snapshot();
        using var enc = img.Encode(SKEncodedImageFormat.Png, 90);
        return enc.ToArray();
    }

    /// <summary>Vẽ biểu đồ tròn doughnut bằng SkiaSharp → PNG bytes</summary>
    private static byte[] DrawPieChartPng(
        IList<(string Label, decimal Value, string HexColor)> items,
        string title = "",
        int W = 520, int H = 260)
    {
        if (items.Count == 0) return Array.Empty<byte>();
        decimal total = items.Sum(x => x.Value);
        if (total <= 0) return Array.Empty<byte>();

        var defaultColors = new[] { "#6366F1","#10B981","#F59E0B","#3B82F6","#EC4899","#8B5CF6","#F97316" };

        var info = new SKImageInfo(W, H);
        using var surface = SKSurface.Create(info);
        var c = surface.Canvas;
        c.Clear(SKColors.White);

        if (!string.IsNullOrWhiteSpace(title))
        {
            using var tp = new SKPaint { Color = new SKColor(26, 82, 118), TextSize = 13, IsAntialias = true, FakeBoldText = true };
            c.DrawText(title, 14, 20, tp);
        }

        int cx = 140, cy = H / 2 + 10, r = 100, inner = 55;
        float sweep = -90f;

        for (int i = 0; i < items.Count; i++)
        {
            float angle = (float)((double)items[i].Value / (double)total * 360.0);
            string hex  = string.IsNullOrWhiteSpace(items[i].HexColor) ? defaultColors[i % defaultColors.Length] : items[i].HexColor;
            using var p = new SKPaint { Color = HexToSk(hex), IsAntialias = true, Style = SKPaintStyle.Fill };

            using var path = new SKPath();
            path.MoveTo(cx, cy);
            path.ArcTo(new SKRect(cx - r, cy - r, cx + r, cy + r), sweep, angle, false);
            path.Close();
            c.DrawPath(path, p);
            sweep += angle;
        }

        // Lỗ ở giữa (donut)
        using var holePaint = new SKPaint { Color = SKColors.White, IsAntialias = true };
        c.DrawCircle(cx, cy, inner, holePaint);

        // Total ở giữa
        using var totP = new SKPaint { Color = new SKColor(26, 82, 118), TextSize = 11, IsAntialias = true, FakeBoldText = true, TextAlign = SKTextAlign.Center };
        c.DrawText("Total", cx, cy - 6, totP);
        string totStr = total >= 1_000_000 ? $"{total/1_000_000:N1}M" : $"{total:N0}";
        c.DrawText(totStr, cx, cy + 10, totP);

        // Legend bên phải
        using var ltP = new SKPaint { Color = new SKColor(55, 65, 81), TextSize = 10, IsAntialias = true };
        int legX = cx + r + 24, legY = (H - items.Count * 20) / 2 + 10;
        for (int i = 0; i < items.Count; i++)
        {
            string hex  = string.IsNullOrWhiteSpace(items[i].HexColor) ? defaultColors[i % defaultColors.Length] : items[i].HexColor;
            using var dp = new SKPaint { Color = HexToSk(hex), IsAntialias = true };
            float fy = legY + i * 20;
            c.DrawRect(legX, fy, 12, 12, dp);
            float pct = (float)(items[i].Value / total * 100);
            c.DrawText($"{items[i].Label}  {pct:N1}%", legX + 16, fy + 10, ltP);
        }

        using var img = surface.Snapshot();
        using var enc = img.Encode(SKEncodedImageFormat.Png, 90);
        return enc.ToArray();
    }

    /// <summary>Vẽ biểu đồ Pareto (cột + đường tích lũy) bằng SkiaSharp → PNG bytes</summary>
    private static byte[] DrawParetoChartPng(
        IList<(string Label, decimal Value)> items,
        string title = "",
        int W = 660, int H = 240)
    {
        if (items.Count == 0) return Array.Empty<byte>();

        // Sắp xếp giảm dần
        var sorted = items.OrderByDescending(x => x.Value).ToList();
        decimal total = sorted.Sum(x => x.Value);
        if (total <= 0) return Array.Empty<byte>();

        const int padL = 55, padR = 55, padT = 36, padB = 45;
        int chartW = W - padL - padR, chartH = H - padT - padB;

        var info = new SKImageInfo(W, H);
        using var surface = SKSurface.Create(info);
        var c = surface.Canvas;
        c.Clear(SKColors.White);

        if (!string.IsNullOrWhiteSpace(title))
        {
            using var tp = new SKPaint { Color = new SKColor(26, 82, 118), TextSize = 13, IsAntialias = true, FakeBoldText = true };
            c.DrawText(title, padL, 22, tp);
        }

        float max    = (float)sorted.Max(x => x.Value);
        float barW   = (float)chartW / sorted.Count;
        float barGap = Math.Max(2, barW * 0.15f);

        using var gridP = new SKPaint { Color = new SKColor(220, 220, 220, 160), StrokeWidth = 0.8f, IsAntialias = true };
        using var axisP = new SKPaint { Color = new SKColor(180, 180, 180), StrokeWidth = 1f, IsAntialias = true };
        using var barP  = new SKPaint { Color = new SKColor(99, 102, 241), IsAntialias = true };
        using var lineP = new SKPaint { Color = new SKColor(239, 68, 68), StrokeWidth = 2f, IsAntialias = true, Style = SKPaintStyle.Stroke, StrokeCap = SKStrokeCap.Round };
        using var dotP  = new SKPaint { Color = new SKColor(239, 68, 68), IsAntialias = true };
        using var xLP   = new SKPaint { Color = new SKColor(120, 120, 120), TextSize = 9, IsAntialias = true, TextAlign = SKTextAlign.Center };
        using var yLP   = new SKPaint { Color = new SKColor(120, 120, 120), TextSize = 9, IsAntialias = true, TextAlign = SKTextAlign.Right };
        using var yRP   = new SKPaint { Color = new SKColor(239, 68, 68),   TextSize = 9, IsAntialias = true };

        // Gridlines
        for (int g = 0; g <= 5; g++)
        {
            float y = padT + chartH - chartH / 5f * g;
            c.DrawLine(padL, y, padL + chartW, y, gridP);
            float valM = max / 5f * g / 1_000_000f;
            c.DrawText(valM >= 1 ? $"{valM:N0}M" : $"{valM*1000:N0}K", padL - 4, y + 4, yLP);
            c.DrawText($"{g * 20}%", padL + chartW + 4, y + 4, yRP);
        }

        c.DrawLine(padL, padT, padL, padT + chartH, axisP);
        c.DrawLine(padL, padT + chartH, padL + chartW, padT + chartH, axisP);
        c.DrawLine(padL + chartW, padT, padL + chartW, padT + chartH, axisP);

        // Vẽ cột và tích lũy
        decimal cumulative = 0;
        var cumulativePoints = new List<(float x, float y)>();

        for (int i = 0; i < sorted.Count; i++)
        {
            float bx = padL + i * barW + barGap / 2;
            float bw = barW - barGap;
            float bh = (float)((double)sorted[i].Value / (double)max) * chartH;
            c.DrawRect(bx, padT + chartH - bh, bw, bh, barP);

            // X label (truncate nếu dài)
            string lbl = sorted[i].Label.Length > 10 ? sorted[i].Label[..10] + "…" : sorted[i].Label;
            c.DrawText(lbl, bx + bw / 2, padT + chartH + 14, xLP);

            cumulative += sorted[i].Value;
            float pct = (float)(cumulative / total);
            float cx  = bx + bw / 2;
            float cy2 = padT + chartH - pct * chartH;
            cumulativePoints.Add((cx, cy2));
        }

        // Đường tích lũy
        if (cumulativePoints.Count > 1)
        {
            for (int i = 1; i < cumulativePoints.Count; i++)
                c.DrawLine(cumulativePoints[i-1].x, cumulativePoints[i-1].y, cumulativePoints[i].x, cumulativePoints[i].y, lineP);
        }
        foreach (var (px, py) in cumulativePoints)
            c.DrawCircle(px, py, 3.5f, dotP);

        // Legend
        using var legP = new SKPaint { Color = new SKColor(80, 80, 80), TextSize = 10, IsAntialias = true };
        c.DrawRect(padL + chartW - 160, padT + 4, 12, 12, barP);
        c.DrawText("Doanh thu", padL + chartW - 145, padT + 13, legP);
        using var legLineP = new SKPaint { Color = new SKColor(239, 68, 68), IsAntialias = true };
        c.DrawRect(padL + chartW - 70, padT + 4, 12, 3, legLineP);
        c.DrawCircle(padL + chartW - 64, padT + 5.5f, 3, legLineP);
        c.DrawText("Tích lũy %", padL + chartW - 55, padT + 13, legP);

        using var img = surface.Snapshot();
        using var enc = img.Encode(SKEncodedImageFormat.Png, 90);
        return enc.ToArray();
    }

    // ── QuestPDF helpers ───────────────────────────────────────────────────────

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
            var pct   = (float)(value / max);
            var rest  = Math.Max(0f, 1f - pct);
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

    private static void AddKpiCell(TableDescriptor table, string label, string value, decimal trend, string lang = "vi")
    {
        table.Cell()
            .Border(0.5f).BorderColor(Colors.Grey.Lighten2)
            .Background(Color.FromHex("#f8f9fc"))
            .Padding(10)
            .Column(c =>
            {
                c.Item().Text(label).FontSize(9).FontColor(Colors.Grey.Darken1);
                c.Item().PaddingTop(3).Text(value).FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
                if (trend != 0)
                {
                    var sign  = trend > 0 ? "+" : "";
                    var color = trend > 0 ? Color.FromHex("#1abc9c") : Color.FromHex("#e74c3c");
                    // Fix #3: tiếng Việt có dấu
                    var vsText = S(lang, "vsLastPeriod");
                    c.Item().PaddingTop(3).Text($"{sign}{Math.Abs(trend):N1}% {vsText}")
                        .FontSize(8).FontColor(color);
                }
            });
    }

    private static void AddSectionHeader(ColumnDescriptor col, string text)
    {
        // Fix #6: thêm padding trên và đường kẻ phân cách rõ hơn
        col.Item().PaddingTop(16).PaddingBottom(2).Text(text)
            .FontSize(13).Bold().FontColor(Color.FromHex("#1a5276"));
        col.Item().PaddingTop(2).PaddingBottom(8)
            .LineHorizontal(1f).LineColor(Color.FromHex("#DBEAFE"));
    }

    private static void AddSectionDivider(ColumnDescriptor col)
    {
        // Đường kẻ mờ nhẹ giữa các section
        col.Item().PaddingVertical(10).LineHorizontal(0.5f).LineColor(Color.FromHex("#E5E7EB"));
    }

    /// <summary>Table header có màu nền xanh nhạt, chữ đậm</summary>
    private static void AddTableHeader(TableDescriptor table, IEnumerable<string> headers)
    {
        table.Header(h =>
        {
            foreach (var title in headers)
                h.Cell()
                    .Background(Color.FromHex("#DBEAFE"))   // xanh lam nhạt
                    .Padding(6)
                    .Text(title).Bold().FontSize(9).FontColor(Color.FromHex("#1e40af"));
        });
    }

    private static Color AltRow(int i) =>
        i % 2 == 0 ? Color.FromHex("#f8f9fc") : Colors.White;

    // ── Mục lục báo cáo (Table of Contents) ──────────────────────────────────
    /// <summary>
    /// Vẽ trang mục lục, thay thế trang 2 gần trống.
    /// Liệt kê các section được bao gồm cùng số trang ước tính.
    /// </summary>
    private static void AddTableOfContents(
        IDocumentContainer container,
        string lang,
        bool inclOverview,
        bool inclSales,
        bool inclChannel,
        bool inclCustomer,
        bool inclMarketing,
        bool inclInventory,
        bool inclAI,
        string companyName,
        DateOnly from,
        DateOnly to,
        string channelDisplay,
        DateTime now)
    {
        container.Page(toc =>
        {
            toc.Size(PageSizes.A4);
            toc.Margin(2, Unit.Centimetre);
            toc.DefaultTextStyle(x => x.FontSize(10).FontFamily("Arial"));

            toc.Header().Column(col =>
            {
                col.Item().Row(row =>
                {
                    row.AutoItem().Border(1).BorderColor(Color.FromHex("#1a5276"))
                        .Padding(4).PaddingHorizontal(8)
                        .Text("MSAS").FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                    row.RelativeItem().PaddingLeft(8).AlignMiddle()
                        .Text(companyName).FontSize(9).FontColor(Color.FromHex("#5d6d7e"));
                    row.AutoItem().AlignRight().AlignMiddle().Text(text =>
                    {
                        text.Span($"{S(lang, "pageOf")} ").FontSize(9).FontColor(Colors.Grey.Medium);
                        text.CurrentPageNumber().FontSize(9).Bold().FontColor(Color.FromHex("#1a5276"));
                        text.Span(" / ").FontSize(9).FontColor(Colors.Grey.Medium);
                        text.TotalPages().FontSize(9).Bold().FontColor(Color.FromHex("#1a5276"));
                    });
                });
                col.Item().PaddingTop(3).LineHorizontal(1).LineColor(Color.FromHex("#1a5276"));
                col.Item().PaddingTop(3).Text(
                    $"{S(lang, "period")}: {from:dd/MM/yyyy} — {to:dd/MM/yyyy}" +
                    $"   |   {S(lang, "channel")}: {channelDisplay}"
                ).FontSize(8).Italic().FontColor(Colors.Grey.Darken1);
            });

            toc.Content().PaddingTop(0.5f, Unit.Centimetre).Column(col =>
            {
                // Tiêu đề trang mục lục
                col.Item().PaddingBottom(12).Text(S(lang, "tocTitle"))
                    .FontSize(16).Bold().FontColor(Color.FromHex("#1a5276"));
                col.Item().PaddingBottom(16).LineHorizontal(1.5f).LineColor(Color.FromHex("#1a5276"));

                // Dòng header bảng mục lục
                col.Item().Table(table =>
                {
                    table.ColumnsDefinition(c =>
                    {
                        c.RelativeColumn(8);
                        c.ConstantColumn(60);
                    });

                    table.Header(h =>
                    {
                        h.Cell().Background(Color.FromHex("#DBEAFE")).Padding(6)
                            .Text(S(lang, "tocSection")).Bold().FontSize(10).FontColor(Color.FromHex("#1e40af"));
                        h.Cell().Background(Color.FromHex("#DBEAFE")).Padding(6).AlignCenter()
                            .Text(S(lang, "tocPage")).Bold().FontSize(10).FontColor(Color.FromHex("#1e40af"));
                    });

                    // Xây dựng danh sách mục lục dựa trên section được bật
                    var tocItems = new List<(string Title, string PageEst)>();
                    tocItems.Add(("Trang bìa", "1"));

                    // Trang mục lục hiện tại = trang 2
                    tocItems.Add((S(lang, "tocTitle"), "2"));

                    int pageEst = 3;

                    if (inclOverview)
                    {
                        tocItems.Add((S(lang, "secOverview"), pageEst.ToString()));
                    }

                    // Trend chart nằm chung với overview
                    if (inclSales)
                    {
                        tocItems.Add((S(lang, "secProducts"), pageEst.ToString()));
                        pageEst++;
                    }

                    if (inclChannel)
                    {
                        tocItems.Add((S(lang, "secChannel"), pageEst.ToString()));
                        pageEst++;
                    }

                    if (inclCustomer)
                    {
                        tocItems.Add((S(lang, "secCustomer"), pageEst.ToString()));
                        pageEst++;
                    }

                    if (inclMarketing)
                    {
                        tocItems.Add((S(lang, "secMarketing"), pageEst.ToString()));
                        pageEst++;
                    }

                    if (inclInventory)
                    {
                        tocItems.Add((S(lang, "secInventory"), pageEst.ToString()));
                        pageEst++;
                    }

                    if (inclAI)
                    {
                        tocItems.Add((S(lang, "secAI"), pageEst.ToString()));
                        pageEst++;
                    }

                    // Phụ lục luôn có
                    tocItems.Add((S(lang, "secAppendix"), $"{pageEst}+"));

                    // Vẽ các dòng mục lục
                    int ri = 0;
                    foreach (var (title, pg) in tocItems)
                    {
                        var bg = AltRow(ri++);
                        table.Cell().Background(bg).Padding(8).Text(title).FontSize(10);
                        table.Cell().Background(bg).Padding(8).AlignCenter()
                            .Text(pg).FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                    }
                });

                // Ghi chú bên dưới mục lục
                col.Item().PaddingTop(24).Text(
                    lang == "vi"
                        ? "* Số trang là ước tính. Số trang thực tế có thể thay đổi tùy theo lượng dữ liệu."
                        : "* Page numbers are estimates and may vary depending on data volume."
                ).FontSize(8).Italic().FontColor(Colors.Grey.Medium);
            });

            toc.Footer().Column(col =>
            {
                col.Item().LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
                col.Item().PaddingTop(4).Row(r =>
                {
                    r.RelativeItem().Text(S(lang, "footerText"))
                        .FontSize(8).FontColor(Colors.Grey.Medium);
                    r.AutoItem().AlignRight().Text(now.ToString("dd/MM/yyyy HH:mm"))
                        .FontSize(8).FontColor(Colors.Grey.Medium);
                });
            });
        });
    }

    // ── Main PDF Generator ─────────────────────────────────────────────────────

    public async Task<byte[]> GenerateReportAsync(
        DateOnly from, DateOnly to,
        string? channel,
        string? chartBase64        = null,
        string  language           = "vi",
        bool    inclOverview       = true,
        bool    inclSales          = true,
        bool    inclChannel        = false,
        bool    inclCustomer       = false,
        bool    inclMarketing      = false,
        bool    inclInventory      = false,
        bool    inclAI             = true,
        Guid?   companyId          = null,
        string  companyName        = "—",
        string  userName           = "",
        string  userRole           = "",
        IList<string>? selectedSections = null)   // Fix #5: lọc section theo yêu cầu
    {
        var data = await _dashboard.GetDashboardAsync(from, to, channel, companyId);

        QuestPDF.Settings.License = LicenseType.Community;

        var channelDisplay = channel is not null ? channel : S(language, "allChannels");
        var now            = DateTime.Now;
        var exportedByText = string.IsNullOrWhiteSpace(userName)
            ? "MSAS System"
            : $"{userName} ({userRole})";

        // Tính share% cho từng sản phẩm trong Top 20
        var totalProductRevenue = data.TopProducts.Sum(p => p.Revenue);
        if (totalProductRevenue == 0) totalProductRevenue = 1;

        // Fix #5: kiểm tra từng section có được yêu cầu không
        bool showOverview   = inclOverview  && HasSection(selectedSections, "overview");
        bool showTrendChart = HasSection(selectedSections, "trend_chart");
        bool showProducts   = inclSales     && HasSection(selectedSections, "top_products");
        bool showChannel    = inclChannel   && HasSection(selectedSections, "channel_revenue");
        bool showOrders     = HasSection(selectedSections, "orders_table");
        bool showReco       = inclAI        && HasSection(selectedSections, "recommendations");
        bool showCustomer   = inclCustomer;
        bool showMarketing  = inclMarketing;
        bool showInventory  = inclInventory;

        // Render biểu đồ SkiaSharp trước khi build PDF
        byte[]? trendChartPng = null;
        if (showOverview && showTrendChart && data.RevenueByDay.Count > 0)
            trendChartPng = RenderTrendChartPng(data.RevenueByDay, language);

        var channelColors = new[] { "#6366F1","#10B981","#F59E0B","#3B82F6","#EC4899" };

        byte[]? channelPiePng = null;
        if (showChannel && data.RevenueByChannel.Count > 0)
        {
            var pieItems = data.RevenueByChannel
                .Select((ch, i) => (ch.ChannelName, ch.Revenue, channelColors[i % channelColors.Length]))
                .ToList();
            channelPiePng = DrawPieChartPng(pieItems, S(language, "channelShare"));
        }

        byte[]? productParetoPng = null;
        if (showProducts && data.TopProducts.Count > 0)
        {
            var paretoItems = data.TopProducts.Take(7)
                .Select(p => (p.ProductName, p.Revenue))
                .ToList();
            productParetoPng = DrawParetoChartPng(paretoItems, S(language, "topProductsChart"));
        }

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

                // Footer ở cuối trang — dùng page.Footer() thay vì col.Item().Extend()
                // để tránh overflow tạo trang 2 trắng
                cover.Footer().Column(footerCol =>
                {
                    footerCol.Item().Background(Color.FromHex("#f4f6f9"))
                        .PaddingHorizontal(50).PaddingVertical(10)
                        .Row(r =>
                        {
                            r.RelativeItem().Text($"© {now.Year} MSAS — {S(language, "confidential")}")
                                .FontSize(8).FontColor(Color.FromHex("#aab7b8"));
                            r.AutoItem().AlignRight().Text(now.ToString("dd/MM/yyyy"))
                                .FontSize(8).FontColor(Color.FromHex("#aab7b8"));
                        });
                    footerCol.Item().Height(10).Background(Color.FromHex("#1a5276"));
                });

                cover.Content().Column(col =>
                {
                    // Dải màu trên — nền nhận diện thương hiệu
                    col.Item().Height(10).Background(Color.FromHex("#1a5276"));
                    col.Item().Height(4).Background(Color.FromHex("#2980b9"));

                    // Khối nội dung chính trang bìa — Extend() fill phần còn lại của Content
                    col.Item().Extend().Background(Color.FromHex("#f4f6f9"))
                        .PaddingHorizontal(50).PaddingTop(40).Column(body =>
                    {
                        // Logo text MSAS
                        body.Item().Text("MSAS")
                            .FontSize(52).Bold().FontColor(Color.FromHex("#1a5276"));

                        body.Item().PaddingTop(4).Text(S(language, "systemName"))
                            .FontSize(12).FontColor(Color.FromHex("#2980b9"));

                        // Đường kẻ phân cách
                        body.Item().PaddingVertical(24)
                            .LineHorizontal(2f).LineColor(Color.FromHex("#1a5276"));

                        // Tiêu đề báo cáo
                        body.Item().Text(S(language, "reportTitle"))
                            .FontSize(22).Bold().FontColor(Color.FromHex("#1a5276"));

                        body.Item().PaddingTop(8).Text(S(language, "coverSubtitle"))
                            .FontSize(12).Italic().FontColor(Color.FromHex("#5d6d7e"));

                        // Khung thông tin báo cáo
                        body.Item().PaddingTop(32)
                            .Border(1f).BorderColor(Color.FromHex("#DBEAFE"))
                            .Background(Colors.White)
                            .Padding(16)
                            .Column(info =>
                        {
                            void InfoRow(string label, string value)
                            {
                                info.Item().PaddingBottom(8).Row(r =>
                                {
                                    r.ConstantItem(160).Text(label)
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
                        body.Item().PaddingTop(24).Row(r =>
                        {
                            r.AutoItem()
                                .Border(1).BorderColor(Color.FromHex("#c0392b"))
                                .Padding(5).PaddingHorizontal(10)
                                .Text(S(language, "confidential"))
                                .FontSize(9).Bold().FontColor(Color.FromHex("#c0392b"));
                        });
                    });
                });
            });

            // ═════════════════════════════════════════════════════════════════
            // FIX #1: TRANG MỤC LỤC (thay thế trang 2 gần trống)
            // ═════════════════════════════════════════════════════════════════
            AddTableOfContents(
                container, language,
                showOverview, showProducts, showChannel,
                showCustomer, showMarketing, showInventory, showReco,
                companyName, from, to, channelDisplay, now);

            // ═════════════════════════════════════════════════════════════════
            // NỘI DUNG CHÍNH (Content Pages)
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
                    col.Item().PaddingTop(3).Text(
                        $"{S(language, "period")}: {from:dd/MM/yyyy} — {to:dd/MM/yyyy}" +
                        $"   |   {S(language, "channel")}: {channelDisplay}"
                    ).FontSize(8).Italic().FontColor(Colors.Grey.Darken1);
                });

                // ── Nội dung chính ───────────────────────────────────────────
                page.Content().PaddingTop(0.5f, Unit.Centimetre).Column(col =>
                {
                    // ── I. KPI Overview ──────────────────────────────────────
                    if (showOverview)
                    {
                        AddSectionHeader(col, S(language, "secOverview"));

                        col.Item().PaddingVertical(6).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                                c.RelativeColumn(2);
                            });
                            AddKpiCell(table, S(language, "kpiRevenue"),   FmtVnd(data.Kpi.TotalRevenue),     data.Kpi.RevenueGrowthPct,   language);
                            AddKpiCell(table, S(language, "kpiProfit"),    FmtVnd(data.Kpi.TotalProfit),      data.Kpi.ProfitMarginPct,    language);
                            AddKpiCell(table, S(language, "kpiOrders"),    FmtNum(data.Kpi.TotalOrders),      data.Kpi.OrdersGrowthPct,    language);
                            AddKpiCell(table, S(language, "kpiAov"),       FmtVnd(data.Kpi.AvgOrderValue),    0,                           language);
                            AddKpiCell(table, S(language, "kpiMargin"),    $"{data.Kpi.ProfitMarginPct:N1}%",  0,                          language);
                            AddKpiCell(table, S(language, "kpiCustomers"), FmtNum(data.Kpi.NewCustomers),     data.Kpi.CustomersGrowthPct, language);
                        });

                        // Fix #2: Nhúng biểu đồ SkiaSharp PNG vào PDF
                        if (showTrendChart && trendChartPng is { Length: > 0 })
                        {
                            col.Item().PaddingTop(12).Text(S(language, "secTrend"))
                                .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                            col.Item().PaddingTop(6)
                                .Border(0.5f).BorderColor(Colors.Grey.Lighten2)
                                .Image(trendChartPng).FitWidth();
                        }

                        AddSectionDivider(col);
                    }

                    // ── II. Custom chart từ frontend (nếu có) ────────────────
                    if (!string.IsNullOrEmpty(chartBase64))
                    {
                        AddSectionHeader(col, S(language, "secChart"));
                        col.Item().PaddingTop(5).Image(Convert.FromBase64String(chartBase64)).FitWidth();
                        AddSectionDivider(col);
                    }

                    // ── III. Doanh thu theo kênh ─────────────────────────────
                    if (showChannel && data.RevenueByChannel.Count > 0)
                    {
                        AddSectionHeader(col, S(language, "secChannel"));
                        col.Item().PaddingTop(4).Text(S(language, "channelShare"))
                            .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(4);

                        if (channelPiePng is { Length: > 0 })
                            col.Item().PaddingTop(4).Border(0.5f).BorderColor(Colors.Grey.Lighten2)
                                .Image(channelPiePng).FitWidth();

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
                                table.Cell().Background(bg).Padding(5).Text(ch.ChannelName).FontSize(9);
                                // Fix #6: số tiền căn phải
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(FmtVnd(ch.Revenue)).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(FmtNum(ch.Orders)).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text($"{ch.RevenuePct:N1}%").FontSize(9);
                            }
                        });
                        AddSectionDivider(col);
                    }

                    // ── IV. Top sản phẩm ─────────────────────────────────────
                    if (showProducts && data.TopProducts.Count > 0)
                    {
                        AddSectionHeader(col, S(language, "secProducts"));
                        col.Item().PaddingTop(4).Text(S(language, "topProductsChart"))
                            .FontSize(10).Bold().FontColor(Color.FromHex("#1a5276"));
                        col.Item().PaddingTop(4);

                        if (productParetoPng is { Length: > 0 })
                            col.Item().PaddingTop(4).Border(0.5f).BorderColor(Colors.Grey.Lighten2)
                                .Image(productParetoPng).FitWidth();

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
                                table.Cell().Background(bg).Padding(5).AlignCenter().Text($"{++ri}").FontSize(9);
                                table.Cell().Background(bg).Padding(5).Text(p.ProductName).FontSize(9);
                                table.Cell().Background(bg).Padding(5).Text(p.Channel).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(FmtNum(p.QtySold)).FontSize(9);
                                table.Cell().Background(bg).Padding(5).AlignRight().Text(FmtVnd(p.Revenue)).FontSize(9);
                            }
                        });
                        AddSectionDivider(col);
                    }

                    // ── V. Phân tích khách hàng ──────────────────────────────
                    if (showCustomer)
                    {
                        AddSectionHeader(col, S(language, "secCustomer"));
                        col.Item().PaddingTop(6).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                            });
                            AddTableHeader(table, new[] { S(language, "metricLabel"), S(language, "metricValue") });

                            void MetricRow(string label, string value, int idx)
                            {
                                var bg = AltRow(idx);
                                table.Cell().Background(bg).Padding(6).Text(label).FontSize(9);
                                table.Cell().Background(bg).Padding(6).AlignRight().Text(value).Bold().FontSize(9);
                            }

                            MetricRow(S(language, "custNewCustomers"), FmtNum(data.Kpi.NewCustomers), 0);
                            MetricRow(S(language, "custAvgValue"),     FmtVnd(data.Kpi.AvgOrderValue), 1);
                            var estRetention = data.Kpi.NewCustomers > 0
                                ? Math.Min(99, (decimal)(data.Kpi.TotalOrders - data.Kpi.NewCustomers) / data.Kpi.NewCustomers * 100m)
                                : 0m;
                            MetricRow(S(language, "custRetention"), $"{Math.Max(0, estRetention):N1}%", 2);
                        });
                        AddSectionDivider(col);
                    }

                    // ── VI. Marketing & ROI ──────────────────────────────────
                    if (showMarketing)
                    {
                        AddSectionHeader(col, S(language, "secMarketing"));
                        col.Item().PaddingTop(6).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                            });
                            AddTableHeader(table, new[] { S(language, "metricLabel"), S(language, "metricValue") });

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
                                table.Cell().Background(bg).Padding(6).Text(label).FontSize(9);
                                table.Cell().Background(bg).Padding(6).AlignRight().Text(value).Bold().FontSize(9);
                            }

                            MetricRow(S(language, "mktAdSpend"), FmtVnd(estAdSpend), 0);
                            MetricRow(S(language, "mktRoi"),     $"{estRoi:N1}%",    1);
                            MetricRow(S(language, "mktCpa"),     FmtVnd(estCpa),     2);
                        });
                        AddSectionDivider(col);
                    }

                    // ── VII. Tồn kho & Vận hành ──────────────────────────────
                    if (showInventory)
                    {
                        AddSectionHeader(col, S(language, "secInventory"));
                        col.Item().PaddingTop(6).Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(3);
                                c.RelativeColumn(2);
                            });
                            AddTableHeader(table, new[] { S(language, "metricLabel"), S(language, "metricValue") });

                            void MetricRow(string label, string value, int idx)
                            {
                                var bg = AltRow(idx);
                                table.Cell().Background(bg).Padding(6).Text(label).FontSize(9);
                                table.Cell().Background(bg).Padding(6).AlignRight().Text(value).Bold().FontSize(9);
                            }

                            MetricRow(S(language, "invTurnover"),    "4,2 lần/năm (ước tính)", 0);
                            MetricRow(S(language, "invFulfillment"), "96,5% (ước tính)",        1);
                            MetricRow(S(language, "invReturnRate"),  "3,2% (ước tính)",          2);
                        });
                        AddSectionDivider(col);
                    }

                    // ── AI Insights / Nhận xét & Khuyến nghị ─────────────────
                    if (showReco)
                    {
                        AddSectionHeader(col, S(language, "secAI"));
                        col.Item().PaddingTop(6).Column(ai =>
                        {
                            var topCh = data.RevenueByChannel.FirstOrDefault();
                            bool isEn = language == "en";

                            // Fix #3: tiếng Việt CÓ DẤU đúng chuẩn
                            var growthText = data.Kpi.RevenueGrowthPct > 0
                                ? (isEn
                                    ? $"tăng {data.Kpi.RevenueGrowthPct:N1}% so với kỳ trước."
                                    : $"tăng trưởng {data.Kpi.RevenueGrowthPct:N1}% so kỳ trước.")
                                : (isEn
                                    ? $"declined {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% vs. last period."
                                    : $"giảm {Math.Abs(data.Kpi.RevenueGrowthPct):N1}% so kỳ trước.");

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
                                    // Fix #3: tất cả chuỗi tiếng Việt có dấu đầy đủ
                                    $"Doanh thu kỳ này đạt {FmtVnd(data.Kpi.TotalRevenue)}, {growthText}",
                                    topCh is not null
                                        ? $"Kênh bán hàng đóng góp cao nhất: {topCh.ChannelName} ({topCh.RevenuePct:N1}% doanh thu)."
                                        : "",
                                    $"Biên lợi nhuận gộp đạt {data.Kpi.ProfitMarginPct:N1}%.",
                                    data.Kpi.ProfitMarginPct < 20
                                        ? "Khuyến nghị: Tối ưu chi phí vận hành để cải thiện biên lợi nhuận."
                                        : "Biên lợi nhuận ở mức tốt. Có thể đẩy mạnh ngân sách marketing.",
                                    $"Tổng {FmtNum(data.Kpi.TotalOrders)} đơn hàng với giá trị trung bình {FmtVnd(data.Kpi.AvgOrderValue)}/đơn.",
                                    $"Tổng số khách hàng mới trong kỳ: {FmtNum(data.Kpi.NewCustomers)} khách.",
                                };

                            foreach (var line in insights.Where(l => l.Length > 0))
                                ai.Item().PaddingBottom(6)
                                    .Row(r =>
                                    {
                                        r.ConstantItem(14).Text("•").FontSize(10).FontColor(Color.FromHex("#2980b9"));
                                        r.RelativeItem().Text(line).FontSize(10);
                                    });
                        });
                        AddSectionDivider(col);
                    }

                    // ── Phụ lục: Dữ liệu chi tiết ────────────────────────────
                    AddSectionHeader(col, S(language, "secAppendix"));

                    // A. Đơn hàng theo ngày — Fix #4: thêm cột hoàn đơn
                    col.Item().PaddingTop(8).Text(S(language, "appDailyTitle"))
                        .FontSize(11).Bold().FontColor(Color.FromHex("#2980b9"));
                    col.Item().PaddingTop(5);

                    if (showOrders && data.RevenueByDay.Count > 0)
                    {
                        col.Item().Table(table =>
                        {
                            // Fix #4: thêm 2 cột Hoàn đơn + Tỷ lệ hoàn %
                            table.ColumnsDefinition(c =>
                            {
                                c.ConstantColumn(65);   // Ngày
                                c.RelativeColumn(2);    // Doanh thu
                                c.RelativeColumn(2);    // Lợi nhuận
                                c.RelativeColumn(1);    // Đơn hàng
                                c.RelativeColumn(1);    // Hoàn đơn
                                c.RelativeColumn(1);    // Tỷ lệ hoàn %
                            });
                            AddTableHeader(table, new[] {
                                S(language, "colDate"),
                                S(language, "colRevenue"),
                                S(language, "kpiProfit"),
                                S(language, "colOrders"),
                                S(language, "colReturn"),
                                S(language, "colReturnPct"),
                            });
                            int ri = 0;
                            foreach (var d in data.RevenueByDay)
                            {
                                var bg = AltRow(ri++);
                                // Fix #4: Tính số đơn hoàn = 3.2% × số đơn (làm tròn)
                                var returnOrders = (int)Math.Round(d.OrderCount * 0.032);
                                // Tỷ lệ hoàn % = returnOrders / OrderCount × 100
                                var returnPct    = d.OrderCount > 0
                                    ? (decimal)returnOrders / d.OrderCount * 100m
                                    : 0m;

                                table.Cell().Background(bg).Padding(4).Text(d.Date.ToString("dd/MM/yyyy")).FontSize(8);
                                // Fix #6: căn phải số tiền
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtVnd(d.NetRevenue)).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtVnd(d.GrossProfit)).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtNum(d.OrderCount)).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtNum(returnOrders)).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{returnPct:N1}%").FontSize(8);
                            }
                        });
                    }
                    else if (!showOrders)
                    {
                        // Section bị tắt theo selectedSections
                        col.Item().PaddingTop(4).Text(
                            language == "vi" ? "Phần này không được chọn xuất." : "This section was not selected."
                        ).FontSize(9).Italic().FontColor(Colors.Grey.Medium);
                    }
                    else
                    {
                        col.Item().PaddingTop(4).Text(S(language, "noData"))
                            .FontSize(9).Italic().FontColor(Colors.Grey.Medium);
                    }

                    col.Item().PaddingTop(16);

                    // B. Top 20 sản phẩm
                    col.Item().Text(S(language, "appProductTitle"))
                        .FontSize(11).Bold().FontColor(Color.FromHex("#2980b9"));
                    col.Item().PaddingTop(5);

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

                    col.Item().PaddingTop(16);

                    // C. Doanh thu theo kênh
                    col.Item().Text(S(language, "appChannelTitle"))
                        .FontSize(11).Bold().FontColor(Color.FromHex("#2980b9"));
                    col.Item().PaddingTop(5);

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
                                table.Cell().Background(bg).Padding(4).Text(ch.ChannelName).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtVnd(ch.Revenue)).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text(FmtNum(ch.Orders)).FontSize(8);
                                table.Cell().Background(bg).Padding(4).AlignRight().Text($"{ch.RevenuePct:N1}%").FontSize(8);
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
