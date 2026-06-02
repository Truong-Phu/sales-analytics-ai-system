using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

/// <summary>Service gọi Gemini API, tích hợp context dữ liệu kinh doanh từ DB</summary>
public class GeminiService(
    IHttpClientFactory     httpFactory,
    IConfiguration         cfg,
    AppDbContext           db,
    ILogger<GeminiService> logger)
{
    // ── DTO records cho SqlQuery (không cần EF mapping) ─────────────────────
    private record TrendRow(string Keyword, int HitCount, int UrlCount);
    private record PageItemRow(string Keyword, string? Title, string? Snippet, string? SourceDomain, string? ProductName);
    private record CountRow(int Total);
    private record SentimentRow(string Sentiment, int Cnt);
    private record CommentRow(string Message, string AuthorName, string Sentiment, int LikeCount);
    private readonly string _apiKey       = cfg["Gemini:ApiKey"]   ?? "";
    private readonly string _model        = cfg["Gemini:Model"]    ?? "gemini-2.0-flash";
    private readonly int    _maxTok       = int.TryParse(cfg["Gemini:MaxTokens"], out var t) ? t : 1024;
    private readonly double _temp         = double.TryParse(cfg["Gemini:Temperature"],
                                               System.Globalization.NumberStyles.Any,
                                               System.Globalization.CultureInfo.InvariantCulture,
                                               out var d) ? Math.Clamp(d, 0.0, 2.0) : 0.7;
    private readonly string _aiServiceUrl = cfg["AiService:BaseUrl"] ?? "http://localhost:8001";
    // Groq free-tier fallback (https://console.groq.com — 14,400 req/ngày miễn phí)
    private readonly string _groqApiKey   = cfg["Groq:ApiKey"]     ?? "";
    private readonly string _groqModel    = cfg["Groq:Model"]      ?? "llama-3.3-70b-versatile";

    // ── Danh sách intent hợp lệ cho business tab ─────────────────────────────
    private static readonly string[] BusinessIntents =
    [
        "top_product", "declining_product", "trending_product",
        "revenue_summary", "order_summary",
        "top_channel", "channel_comparison",
        "customer_overview", "inventory_alert",
        "business_recommendation", "performance_overview",
        "employee_performance",
        "unknown",  // câu hỏi ngoài phạm vi hệ thống
    ];

    // ── Phát hiện câu hỏi phân tích chéo nhiều nguồn dữ liệu ────────────────
    // Trả true khi câu hỏi đề cập dữ liệu nội bộ VÀ ít nhất một nguồn ngoài (Facebook/thị trường).
    private static bool IsCrossAnalysis(string question)
    {
        var q = question.ToLowerInvariant();
        static bool Has(string text, params string[] words) => words.Any(text.Contains);

        var hasInternal = Has(q, "doanh thu", "bán chậm", "bán kém", "sản phẩm", "đơn hàng", "giảm", "tăng");
        var hasFacebook = Has(q, "facebook", "phàn nàn", "khách chê", "bình luận", "phản hồi", "sentiment", "khách hàng chê");
        var hasMarket   = Has(q, "đối thủ", "thị trường", "giá đối thủ", "google", "sàn", "xu hướng thị trường");

        return hasInternal && (hasFacebook || hasMarket);
    }

    // ── Map UI tab + nội dung câu hỏi → taxonomy tab chuẩn ───────────────────
    private static string MapToTaxonomyTab(string uiTab, string question) => uiTab switch
    {
        "market"   => "scraped_market",
        "feedback" => "facebook_feedback",
        _          => IsCrossAnalysis(question) ? "cross_analysis" : "internal_business",
    };

    // ── Trích xuất từ khóa đơn giản từ câu hỏi ──────────────────────────────
    private static List<string> ExtractKeywords(string question)
    {
        if (string.IsNullOrWhiteSpace(question)) return [];
        var stopwords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "là","có","được","và","của","trong","cho","với","tôi","bạn",
            "đang","sẽ","nào","gì","không","như","thế","này","về","từ",
            "lên","xuống","ra","vào","đó","đây","khi","mà","nhất","hơn",
            "rất","thì","cũng","đã","để","hay","hoặc","theo","các","những",
            "một","hai","ba","nhiều","ít","tất","cả","mọi","ai","nên","phải",
        };
        return question
            .ToLowerInvariant()
            .Split([' ', ',', '.', '?', '!', ':', ';'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length >= 2 && !stopwords.Contains(w))
            .Distinct()
            .Take(5)
            .ToList();
    }

    // ── Phân loại ý định câu hỏi (rule-based fast path) ─────────────────────
    // Xử lý ~90% câu hỏi thường gặp không cần gọi API.
    // Nếu trả về "unknown" → gọi ClassifyIntentWithGeminiAsync() để phân loại chính xác.
    public static string DetectIntent(string question)
    {
        var q = question.ToLowerInvariant();
        static bool Has(string text, params string[] words) => words.Any(text.Contains);

        // Tồn kho — kiểm tra trước sản phẩm vì "hết hàng" dễ nhầm với sản phẩm
        if (Has(q, "tồn kho", "hết hàng", "sắp hết", "nhập thêm", "nhập hàng", "còn bao nhiêu hàng",
                   "kho", "stock", "cần nhập", "thiếu hàng"))
            return "inventory_alert";

        // Khách hàng
        if (Has(q, "khách hàng", "khách vip", "khách mới", "khách trung thành", "rfm", "loyalty",
                   "khách quay lại", "tỷ lệ quay lại", "khách cũ", "phân khúc khách"))
            return "customer_overview";

        // declining trước trending để "xu hướng giảm" không bị match trending
        if (Has(q, "sụt giảm", "xu hướng giảm", "bán ít hơn", "bán kém", "sụt", "ít đơn hơn",
                   "giảm doanh số", "giảm bán", "bán kém hơn")
            || (Has(q, "giảm") && Has(q, "sản phẩm", "mặt hàng", "hàng hóa")))
            return "declining_product";

        if (Has(q, "xu hướng tăng", "đang hot", "trending", "bán tốt gần đây", "tăng doanh số")
            || (Has(q, "xu hướng", "tăng") && Has(q, "sản phẩm", "mặt hàng")))
            return "trending_product";

        if (Has(q, "bán chạy", "bán nhiều nhất", "bán tốt nhất", "top sản phẩm", "sản phẩm hot",
                   "sản phẩm tốt nhất", "hàng bán chạy")
            || (Has(q, "sản phẩm nào", "mặt hàng nào") && !Has(q, "xu hướng", "giảm", "nên bán")))
            return "top_product";

        if (Has(q, "nên bán", "nên tập trung", "tập trung bán", "chiến lược", "nên kinh doanh",
                   "nên làm gì", "làm thế nào để tăng", "cải thiện doanh", "tư vấn", "gợi ý kinh doanh",
                   "đề xuất", "nên đầu tư"))
            return "business_recommendation";

        if ((Has(q, "so sánh") && Has(q, "kênh"))
            || (Has(q, "shopee", "lazada", "tiktok", "facebook shop") && Has(q, "so sánh")))
            return "channel_comparison";

        if (Has(q, "kênh nào tốt", "kênh nào doanh thu", "kênh bán hàng nào")
            || (Has(q, "doanh thu") && Has(q, "kênh") && Has(q, "cao nhất", "tốt nhất", "hiệu quả nhất")))
            return "top_channel";

        if (Has(q, "shopee", "lazada", "tiktok", "facebook shop")
            && Has(q, "doanh thu", "bán", "đơn", "hiệu quả"))
            return "channel_comparison";

        if (Has(q, "doanh thu", "doanh số", "tiền về", "thu nhập", "bán được bao nhiêu tiền") && !Has(q, "kênh"))
            return "revenue_summary";

        // employee_performance phải kiểm tra TRƯỚC order_summary vì "bán được nhiều nhất" dễ nhầm
        if (Has(q, "nhân viên", "nhân viên nào", "staff", "kpi nhân viên", "hiệu suất nhân viên",
                   "nhân viên bán", "top nhân viên", "nhân viên đạt", "sales team", "ai bán được",
                   "ai xử lý", "người bán", "bán được nhiều nhất tháng", "bán nhiều nhất trong"))
            return "employee_performance";

        if (Has(q, "đơn hàng", "số đơn", "bao nhiêu đơn", "đơn bán", "bao nhiêu đơn hàng")
            || (Has(q, "bán được") && !Has(q, "tiền", "doanh thu") && !Has(q, "nhân viên", "người")))
            return "order_summary";

        if (Has(q, "phản hồi", "đánh giá khách", "review", "bình luận", "nhận xét", "cảm xúc khách", "sentiment"))
            return "customer_feedback";

        // Câu hỏi tổng quan — trả về performance_overview để có full context
        if (Has(q, "tình hình", "tổng quan", "tháng này thế nào", "tuần này", "hôm nay",
                   "kinh doanh thế nào", "báo cáo", "tóm tắt", "overview", "summary"))
            return "performance_overview";

        return "unknown"; // → sẽ được Gemini phân loại tiếp
    }

    // ── Phân loại intent bằng Gemini khi rule-based không nhận ra ────────────
    // Dùng prompt ngắn, maxTokens=15, temperature=0 → fast (<500ms), giá rẻ.
    private async Task<string> ClassifyIntentWithGeminiAsync(string question)
    {
        if (string.IsNullOrWhiteSpace(_apiKey)) return "performance_overview";
        try
        {
            var prompt = $"""
                Classify this Vietnamese business analytics question into exactly one intent name.
                Reply with ONLY the intent name — no explanation, no punctuation.

                INTENTS:
                - top_product: sản phẩm bán chạy nhất, nhiều đơn nhất, doanh thu cao nhất
                - declining_product: sản phẩm giảm doanh số, bán kém, sụt giảm
                - trending_product: sản phẩm đang tăng doanh số, xu hướng tăng
                - revenue_summary: doanh thu, doanh số, tiền bán hàng
                - order_summary: số đơn hàng, bao nhiêu đơn
                - top_channel: kênh bán hàng nào tốt nhất, doanh thu cao nhất
                - channel_comparison: so sánh nhiều kênh bán hàng
                - customer_overview: khách hàng, khách VIP, khách mới, tỷ lệ quay lại, RFM
                - inventory_alert: tồn kho, sắp hết hàng, cần nhập thêm
                - business_recommendation: gợi ý, chiến lược, nên làm gì, cách tăng doanh thu
                - performance_overview: tổng quan tình hình kinh doanh, tóm tắt, không rõ mục tiêu cụ thể
                - employee_performance: nhân viên bán nhiều nhất, KPI nhân viên, hiệu suất nhân viên, ai bán được nhiều
                - unknown: câu hỏi hoàn toàn ngoài phạm vi kinh doanh (thời tiết, lịch sử, giải trí, v.v.)

                QUESTION: {question}
                """;

            var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(10);
            var requestBody = new
            {
                contents         = new[] { new { role = "user", parts = new[] { new { text = prompt } } } },
                generationConfig = new { temperature = 0.0, maxOutputTokens = 15, candidateCount = 1 },
            };
            var response = await http.PostAsync(
                $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}",
                new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode) return "performance_overview";

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var text = doc.RootElement
                .GetProperty("candidates")[0].GetProperty("content")
                .GetProperty("parts")[0].GetProperty("text").GetString()
                ?.Trim().ToLowerInvariant() ?? "";

            // Chỉ chấp nhận intent trong danh sách hợp lệ
            return BusinessIntents.Contains(text) ? text : "performance_overview";
        }
        catch (Exception ex)
        {
            logger.LogWarning("ClassifyIntentWithGeminiAsync lỗi: {M}", ex.Message);
            return "performance_overview";
        }
    }

    // ── System prompt tập trung theo intent — đúng cấu trúc spec ────────────
    private static string BuildFocusedSystemPrompt(string question, string intent, string context, string taxonomyTab = "internal_business")
    {
        var intentRule = intent switch
        {
            "top_product"             => "Bắt đầu bằng tên sản phẩm bán chạy nhất và số lượng đã bán. Không liệt kê doanh thu, đơn hàng, kênh.",
            "declining_product"       => "Nếu context ghi 'KHÔNG ĐỦ DỮ LIỆU', trả lời: 'Hệ thống chưa có đủ dữ liệu tháng trước để so sánh xu hướng.' Nếu có dữ liệu, liệt kê sản phẩm giảm và % giảm cụ thể.",
            "trending_product"        => "Nêu sản phẩm có xu hướng tăng và % tăng cụ thể. Không liệt kê doanh thu hay kênh.",
            "revenue_summary"         => "Chỉ nói về doanh thu và so sánh kỳ trước. Không đề cập sản phẩm hay kênh.",
            "order_summary"           => "Chỉ nói về số lượng đơn hàng và so sánh kỳ trước. Không đề cập doanh thu hay sản phẩm.",
            "top_channel"             => "Nêu tên kênh có doanh thu cao nhất và con số cụ thể. Không liệt kê sản phẩm.",
            "channel_comparison"      => "Liệt kê và so sánh các kênh theo doanh thu, có số liệu cụ thể mỗi kênh.",
            "customer_feedback"       => "Phân tích đúng loại bình luận người dùng hỏi (tiêu cực/tích cực/chung). Trích dẫn nội dung cụ thể từ dữ liệu đã cung cấp.",
            "business_recommendation" => "Đưa GỢI Ý kinh doanh cụ thể, hành động được (actionable) dựa trên top sản phẩm và kênh hiệu quả nhất trong dữ liệu. Không chỉ tóm tắt số liệu.",
            "customer_overview"       => "Nêu số KH mới, top KH chi tiêu cao, phân khúc RFM nếu có. Không đề cập doanh thu hay sản phẩm cụ thể.",
            "inventory_alert"         => "Liệt kê sản phẩm sắp hết hàng (tồn kho thấp nhất trước). Đề xuất nhập thêm sản phẩm nào. Không đề cập doanh thu hay kênh.",
            "performance_overview"    => "Tóm tắt ngắn gọn theo thứ tự: doanh thu → đơn hàng → sản phẩm nổi bật → kênh dẫn đầu. Mỗi mục 1 câu.",
            "market"                  => "Phân tích xu hướng thị trường từ dữ liệu Google được cung cấp. Nêu từ khóa hot, xu hướng nổi bật.",
            "cross_analysis"          => "Phân tích mối liên hệ giữa dữ liệu nội bộ và dữ liệu ngoài. Nêu rõ nếu thiếu dữ liệu từ bất kỳ nguồn nào.",
            "employee_performance"    => "Xếp hạng nhân viên theo doanh thu POS. Nêu rõ top 3-5 nhân viên và % đóng góp. Nhắc rõ chỉ tính đơn POS, không tính đơn online sàn.",
            _                         => "Trả lời đúng câu hỏi dựa trên dữ liệu có sẵn. Không liệt kê toàn bộ dashboard.",
        };

        var tabDesc = taxonomyTab switch
        {
            "scraped_market"    => "scraped_market (dữ liệu thị trường – Google Search)",
            "facebook_feedback" => "facebook_feedback (phản hồi khách hàng Facebook)",
            "cross_analysis"    => "cross_analysis (phân tích chéo nhiều nguồn dữ liệu)",
            _                   => "internal_business (dữ liệu kinh doanh nội bộ)",
        };

        return $"""
            [ROLE]
            Bạn là Trợ lý AI phân tích dữ liệu kinh doanh đa kênh cho hệ thống MSAS.

            [STRICT RULES]
            1. Chỉ trả lời dựa trên dữ liệu trong CONTEXT — không bịa số liệu, không suy đoán.
            2. Câu hỏi thuộc tab {tabDesc} — chỉ dùng dữ liệu tab đó, trừ khi tab là cross_analysis.
            3. Nếu dữ liệu không đủ, trả lời rõ: "Hệ thống chưa có đủ dữ liệu để trả lời câu hỏi này."
            4. Trả lời ngắn gọn, đúng trọng tâm, tối đa 3-4 câu, bằng tiếng Việt.
            5. Giữ nguyên số liệu backend cung cấp — không tự làm tròn hoặc thay đổi.
            6. Không liệt kê thông tin không liên quan đến câu hỏi.
            7. {intentRule}

            [USER QUESTION]
            {question}

            [ROUTE RESULT]
            tab={tabDesc} | sub_intent={intent}

            [CONTEXT]
            {(string.IsNullOrEmpty(context) ? "Chưa có dữ liệu từ hệ thống." : context)}

            [OUTPUT FORMAT]
            Nếu câu hỏi phức tạp, trả lời theo:
            - Kết luận: (1 câu trực tiếp)
            - Số liệu liên quan: (nếu có)
            - Gợi ý hành động: (nếu phù hợp)
            Nếu câu hỏi đơn giản, trả lời 1-2 câu, không cần đủ 3 mục.
            """;
    }

    // ── Build context từ DB theo companyId ───────────────────────────────────

    private async Task<string> BuildBusinessContext(Guid companyId, List<string> keywords)
    {
        try
        {
            var now           = DateTime.UtcNow;
            var monthStart    = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var prevMonthStart = monthStart.AddMonths(-1);

            // Doanh thu tháng này và tháng trước
            var revenue = await db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED"
                         && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;

            var prevRevenue = await db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= prevMonthStart
                         && x.o.OrderDate < monthStart
                         && x.o.Status != "CANCELLED"
                         && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;

            // Số đơn hàng tháng này và tháng trước
            var orderCount = await db.Orders
                .CountAsync(o => o.CompanyId == companyId && o.OrderDate >= monthStart
                              && o.Status != "CANCELLED");
            var prevOrderCount = await db.Orders
                .CountAsync(o => o.CompanyId == companyId
                              && o.OrderDate >= prevMonthStart && o.OrderDate < monthStart
                              && o.Status != "CANCELLED");

            // Lọc sản phẩm theo keyword nếu có, ngược lại lấy top 5
            var productQuery = db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Join(db.Products, x => x.od.ProductId, p => p.ProductId, (x, p) => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED");

            if (keywords.Count > 0)
                productQuery = productQuery.Where(x =>
                    keywords.Any(kw => x.p.ProductName.ToLower().Contains(kw)));

            var topProducts = await productQuery
                .GroupBy(x => x.p.ProductName)
                .OrderByDescending(g => g.Sum(x => x.od.Subtotal))
                .Take(5)
                .Select(g => $"{g.Key}: {g.Sum(x => x.od.Subtotal):N0} VND ({g.Count()} đơn)")
                .ToListAsync();

            // Fallback: nếu không có kết quả khớp keyword → lấy top 5 tổng
            if (topProducts.Count == 0 && keywords.Count > 0)
            {
                topProducts = await db.OrderDetails
                    .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                    .Join(db.Products, x => x.od.ProductId, p => p.ProductId, (x, p) => new { x.od, x.o, p })
                    .Where(x => x.o.CompanyId == companyId
                             && x.o.OrderDate >= monthStart
                             && x.o.Status != "CANCELLED")
                    .GroupBy(x => x.p.ProductName)
                    .OrderByDescending(g => g.Sum(x => x.od.Subtotal))
                    .Take(5)
                    .Select(g => $"{g.Key}: {g.Sum(x => x.od.Subtotal):N0} VND ({g.Count()} đơn)")
                    .ToListAsync();
            }

            // Kênh bán hàng (lọc theo keyword nếu đề cập kênh cụ thể)
            var channelQuery = db.Orders
                .Join(db.Channels, o => o.ChannelId, ch => ch.ChannelId, (o, ch) => new { o, ch })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart);

            if (keywords.Any(kw => new[] { "shopee", "lazada", "tiktok", "kênh", "channel" }.Contains(kw)))
                channelQuery = channelQuery.Where(x =>
                    keywords.Any(kw => x.ch.ChannelName.ToLower().Contains(kw)));

            var channels = await channelQuery
                .GroupBy(x => x.ch.ChannelName)
                .OrderByDescending(g => g.Count())
                .Take(4)
                .Select(g => $"{g.Key}: {g.Count()} đơn")
                .ToListAsync();

            // So sánh tháng trước
            var revenueChange = prevRevenue > 0
                ? $"{(revenue >= prevRevenue ? "+" : "")}{(revenue - prevRevenue) / prevRevenue * 100:F1}% so tháng trước ({prevRevenue:N0} VND)"
                : "(chưa có dữ liệu tháng trước)";
            var orderChange = prevOrderCount > 0
                ? $"{(orderCount >= prevOrderCount ? "+" : "")}{orderCount - prevOrderCount} đơn so tháng trước ({prevOrderCount} đơn)"
                : "(chưa có dữ liệu tháng trước)";

            return $"""
                === DỮ LIỆU KINH DOANH THỰC TẾ ===
                Tháng hiện tại: {now:MM/yyyy}  |  Tháng trước: {prevMonthStart:MM/yyyy}

                [Doanh thu]
                - Tháng này  : {revenue:N0} VND  ({revenueChange})
                - Tháng trước: {prevRevenue:N0} VND

                [Đơn hàng]
                - Tháng này  : {orderCount} đơn  ({orderChange})
                - Tháng trước: {prevOrderCount} đơn

                [Top sản phẩm bán chạy tháng này]
                {(topProducts.Any() ? string.Join("\n", topProducts.Select((p, i) => $"  {i + 1}. {p}")) : "  Chưa có dữ liệu")}

                [Kênh bán hàng tháng này]
                {(channels.Any() ? string.Join("\n", channels.Select(c => $"  • {c}")) : "  Chưa có dữ liệu")}

                Lưu ý: Nếu câu hỏi hỏi về dữ liệu ngoài phạm vi trên (ví dụ: tháng cụ thể khác, năm, quý), hãy nói rõ "Hệ thống chỉ có dữ liệu 2 tháng gần nhất".
                """;
        }
        catch (Exception ex)
        {
            logger.LogWarning("BuildBusinessContext lỗi: {Msg}", ex.Message);
            return "Dữ liệu kinh doanh hiện chưa có. Hãy trả lời câu hỏi một cách chung chung.";
        }
    }

    // ── Build context xu hướng thị trường từ raw_google_data ────────────────

    private async Task<string> BuildMarketContext(Guid companyId, List<string> keywords)
    {
        try
        {
            // Xây điều kiện lọc theo keyword câu hỏi (dùng chuỗi ghép tường minh để tránh nhầm với EF FormattableString)
            var kwFilter = keywords.Count > 0
                ? "AND (" + string.Join(" OR ", keywords.Select(kw =>
                    {
                        var safe = kw.Replace("'", "''");
                        return $"(keyword ILIKE '%{safe}%' OR title ILIKE '%{safe}%' OR trend_description ILIKE '%{safe}%')";
                    })) + ")"
                : "";

            // Dùng SqlQueryRaw để kwFilter được ghép thẳng vào SQL (không bị EF tham số hóa thành @p)
            // Dùng $$""" để {0} là literal placeholder cho SqlQueryRaw, {{kwFilter}} là C# interpolation
            var trendSql = $$"""
                SELECT keyword,
                       CAST(COUNT(*)           AS INTEGER) AS hit_count,
                       CAST(COUNT(DISTINCT url) AS INTEGER) AS url_count
                FROM   public.raw_google_data
                WHERE  scraped_at >= NOW() - INTERVAL '30 days'
                  AND  (company_id = {0} OR company_id IS NULL)
                  AND  keyword IS NOT NULL
                  {{kwFilter}}
                GROUP  BY keyword
                ORDER  BY hit_count DESC
                LIMIT  10
                """;

            // Top keywords liên quan đến câu hỏi (tối đa 10)
            var trends = await db.Database
                .SqlQueryRaw<TrendRow>(trendSql, companyId)
                .ToListAsync();

            // Fallback: nếu filter quá hẹp → lấy top 10 chung
            if (trends.Count == 0)
                trends = await db.Database
                    .SqlQuery<TrendRow>($"""
                        SELECT keyword,
                               CAST(COUNT(*)           AS INTEGER) AS hit_count,
                               CAST(COUNT(DISTINCT url) AS INTEGER) AS url_count
                        FROM   public.raw_google_data
                        WHERE  scraped_at >= NOW() - INTERVAL '30 days'
                          AND  (company_id = {companyId} OR company_id IS NULL)
                          AND  keyword IS NOT NULL
                        GROUP  BY keyword
                        ORDER  BY hit_count DESC
                        LIMIT  10
                        """)
                    .ToListAsync();

            if (!trends.Any())
                return "Chưa có dữ liệu xu hướng thị trường. Hãy chạy Google Scraper trong Data Sync để thu thập dữ liệu.";

            // Nội dung liên quan đến câu hỏi (tối đa 15 bản ghi)
            var itemSql = $$"""
                SELECT keyword,
                       title,
                       COALESCE(snippet, trend_description) AS snippet,
                       source_domain,
                       product_name
                FROM   public.raw_google_data
                WHERE  scraped_at >= NOW() - INTERVAL '30 days'
                  AND  (company_id = {0} OR company_id IS NULL)
                  AND  (title IS NOT NULL OR snippet IS NOT NULL OR trend_description IS NOT NULL)
                  {{kwFilter}}
                ORDER  BY scraped_at DESC
                LIMIT  15
                """;
            var items = await db.Database
                .SqlQueryRaw<PageItemRow>(itemSql, companyId)
                .ToListAsync();

            var kwHint   = keywords.Count > 0 ? $" (liên quan: {string.Join(", ", keywords)})" : "";
            var kwLines  = string.Join("\n", trends.Select((t, i) =>
                $"  {i + 1}. \"{t.Keyword}\" — {t.HitCount} lần xuất hiện, {t.UrlCount} URL"));
            var itemLines = string.Join("\n", items.Select(it =>
            {
                var parts = new List<string> { $"KW: \"{it.Keyword}\"" };
                if (!string.IsNullOrWhiteSpace(it.SourceDomain)) parts.Add($"Trang: {it.SourceDomain}");
                if (!string.IsNullOrWhiteSpace(it.ProductName))  parts.Add($"SP: {it.ProductName}");
                if (!string.IsNullOrWhiteSpace(it.Title))        parts.Add($"Tiêu đề: {it.Title}");
                if (!string.IsNullOrWhiteSpace(it.Snippet))      parts.Add($"Mô tả: {it.Snippet?[..Math.Min(150, it.Snippet.Length)]}");
                return "  • " + string.Join(" | ", parts);
            }));

            return $"""
                === DỮ LIỆU XU HƯỚNG THỊ TRƯỜNG{kwHint} ===

                [Từ khóa xu hướng ({trends.Count} từ khóa phù hợp)]
                {kwLines}

                [Nội dung thu thập ({items.Count} bản ghi liên quan)]
                {(itemLines.Length > 0 ? itemLines : "  (Chưa có nội dung phù hợp)")}

                BẮT BUỘC: Chỉ phân tích dựa trên dữ liệu trên. Không tự bịa số liệu.
                Trả lời bằng tiếng Việt, rõ ràng và có căn cứ từ dữ liệu.
                """;
        }
        catch (Exception ex)
        {
            logger.LogWarning("BuildMarketContext lỗi: {Msg}", ex.Message);
            return "Dữ liệu xu hướng thị trường chưa có. Hãy chạy Google Scraper trong Data Sync trước.";
        }
    }

    // ── Build context phản hồi KH từ facebook_feedback ──────────────────────

    private async Task<string> BuildFeedbackContext(Guid companyId, List<string> keywords)
    {
        try
        {
            var sentiments = await db.Database
                .SqlQuery<SentimentRow>($"""
                    SELECT sentiment,
                           CAST(COUNT(*) AS INTEGER) AS cnt
                    FROM   public.facebook_feedback
                    WHERE  (company_id = {companyId} OR company_id IS NULL)
                    GROUP  BY sentiment
                    """)
                .ToListAsync();

            // Phát hiện intent cảm xúc từ keyword câu hỏi
            var allKw = string.Join(" ", keywords).ToLower();
            var negWords = new[]{"tiêu cực","negative","phàn nàn","xấu","tệ","không hài lòng","chê","kém","dở"};
            var posWords = new[]{"tích cực","positive","khen","tốt","hài lòng","thích","hay","tuyệt"};
            var sentimentSql = negWords.Any(w => allKw.Contains(w)) ? "AND sentiment = 'negative'"
                             : posWords.Any(w => allKw.Contains(w)) ? "AND sentiment = 'positive'"
                             : "";
            var sectionLabel = string.IsNullOrEmpty(sentimentSql) ? "Toàn bộ bình luận"
                             : sentimentSql.Contains("negative")  ? "Bình luận tiêu cực"
                             : "Bình luận tích cực";

            // Lọc bình luận theo keyword câu hỏi (tối đa 20 bình luận liên quan)
            var kwFilter = keywords.Count > 0
                ? "AND (" + string.Join(" OR ", keywords.Select(kw =>
                    $"message ILIKE '%{kw.Replace("'", "''")}%'")) + ")"
                : "";

            // SqlQueryRaw để sentimentSql + kwFilter ghép thẳng vào SQL
            var commentSql = $$"""
                SELECT message,
                       COALESCE(author_name, 'Ẩn danh') AS author_name,
                       COALESCE(sentiment, 'neutral')   AS sentiment,
                       COALESCE(like_count, 0)          AS like_count
                FROM   public.facebook_feedback
                WHERE  (company_id = {0} OR company_id IS NULL)
                  AND  message IS NOT NULL
                  {{sentimentSql}}
                  {{kwFilter}}
                ORDER  BY scraped_at DESC NULLS LAST
                LIMIT  20
                """;
            var comments = await db.Database
                .SqlQueryRaw<CommentRow>(commentSql, companyId)
                .ToListAsync();

            // Fallback: nếu không khớp keyword → lấy 20 mới nhất
            if (comments.Count == 0 && keywords.Count > 0)
                comments = await db.Database
                    .SqlQuery<CommentRow>($"""
                        SELECT message,
                               COALESCE(author_name, 'Ẩn danh') AS author_name,
                               COALESCE(sentiment, 'neutral')   AS sentiment,
                               COALESCE(like_count, 0)          AS like_count
                        FROM   public.facebook_feedback
                        WHERE  (company_id = {companyId} OR company_id IS NULL)
                          AND  message IS NOT NULL
                        ORDER  BY scraped_at DESC NULLS LAST
                        LIMIT  20
                        """)
                    .ToListAsync();

            if (!sentiments.Any())
                return "Chưa có dữ liệu phản hồi khách hàng từ Facebook. Hãy kết nối Facebook Page trong Data Sync.";

            var total  = sentiments.Sum(s => s.Cnt);
            var pos    = sentiments.FirstOrDefault(s => s.Sentiment == "positive")?.Cnt ?? 0;
            var neg    = sentiments.FirstOrDefault(s => s.Sentiment == "negative")?.Cnt ?? 0;
            var neu    = sentiments.FirstOrDefault(s => s.Sentiment == "neutral") ?.Cnt ?? 0;
            var posPct = total > 0 ? Math.Round(pos * 100.0 / total, 1) : 0;
            var negPct = total > 0 ? Math.Round(neg * 100.0 / total, 1) : 0;
            var neuPct = total > 0 ? Math.Round(neu * 100.0 / total, 1) : 0;

            var commentLines = comments.Any()
                ? string.Join("\n", comments.Select(c =>
                    $"  [{c.Sentiment.ToUpper()}] {c.AuthorName}"
                    + (c.LikeCount > 0 ? $" ({c.LikeCount} like)" : "")
                    + $": {c.Message}"))
                : "  (Chưa có bình luận phù hợp)";

            var instruction = string.IsNullOrEmpty(sentimentSql)
                ? "Phân tích tổng quan, nêu vấn đề tiêu cực nổi bật và điểm được khen. Không bịa nội dung ngoài dữ liệu."
                : sentimentSql.Contains("negative")
                  ? "Liệt kê và phân tích CÁC BÌNH LUẬN TIÊU CỰC ở trên. Nêu vấn đề cụ thể từng bình luận."
                  : "Liệt kê và phân tích CÁC BÌNH LUẬN TÍCH CỰC ở trên. Nêu điểm được khen cụ thể.";

            return $"""
                INTENT: customer_feedback | {sectionLabel}
                === DỮ LIỆU PHẢN HỒI KHÁCH HÀNG TỪ FACEBOOK PAGE ===
                Tổng {total} bình luận đã thu thập.

                [Thống kê cảm xúc]
                - Tích cực : {pos} ({posPct}%)  Tiêu cực: {neg} ({negPct}%)  Trung tính: {neu} ({neuPct}%)

                [{sectionLabel} — {comments.Count} bình luận]
                {commentLines}

                BẮT BUỘC: {instruction}
                Trả lời bằng tiếng Việt, ngắn gọn và dựa trên dữ liệu thực tế ở trên.
                """;
        }
        catch (Exception ex)
        {
            logger.LogWarning("BuildFeedbackContext lỗi: {Msg}", ex.Message);
            return "Dữ liệu phản hồi Facebook chưa có. Hãy kết nối Facebook Page trong Data Sync.";
        }
    }

    // ── Context builders tập trung theo intent ───────────────────────────────

    private async Task<string> BuildContext_TopProduct(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        try
        {
            var products = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductName)
                .OrderByDescending(g => g.Sum(x => x.od.Quantity))
                .Take(5)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity), Rev = g.Sum(x => x.od.Subtotal) })
                .ToListAsync();

            if (!products.Any())
                return $"Chưa có dữ liệu sản phẩm bán trong tháng {now:MM/yyyy}.";

            return $"""
                INTENT: top_product | Tháng: {now:MM/yyyy}
                [Sản phẩm bán chạy nhất theo số lượng]
                {string.Join("\n", products.Select((p, i) => $"  {i + 1}. {p.Name}: {p.Qty} sản phẩm đã bán, doanh thu {p.Rev:N0} VND"))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_TopProduct lỗi: {M}", ex.Message); return "Chưa có dữ liệu sản phẩm."; }
    }

    private async Task<string> BuildContext_DecliningProduct(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = monthStart.AddMonths(-1);
        try
        {
            var current = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductName)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity) })
                .ToListAsync();

            var prev = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= prevMonthStart && x.o.OrderDate < monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductName)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity) })
                .ToListAsync();

            if (!prev.Any())
                return "KHÔNG ĐỦ DỮ LIỆU: Hệ thống chưa có dữ liệu tháng trước để phân tích xu hướng giảm.";

            var declining = current
                .Join(prev, c => c.Name, p => p.Name, (c, p) => new {
                    c.Name, Current = c.Qty, Prev = p.Qty,
                    Pct = p.Qty > 0 ? (c.Qty - p.Qty) * 100.0 / p.Qty : 0.0 })
                .Where(x => x.Current < x.Prev)
                .OrderBy(x => x.Pct)
                .Take(5).ToList();

            if (!declining.Any())
                return $"INTENT: declining_product | Tháng {now:MM/yyyy} vs {prevMonthStart:MM/yyyy}\nKhông có sản phẩm nào giảm doanh số trong tháng này.";

            return $"""
                INTENT: declining_product | Tháng {now:MM/yyyy} vs {prevMonthStart:MM/yyyy}
                [Sản phẩm giảm doanh số]
                {string.Join("\n", declining.Select((x, i) => $"  {i + 1}. {x.Name}: tháng này {x.Current} sp, tháng trước {x.Prev} sp ({x.Pct:F1}%)"))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_DecliningProduct lỗi: {M}", ex.Message); return "Chưa có dữ liệu để phân tích xu hướng."; }
    }

    private async Task<string> BuildContext_TrendingProduct(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = monthStart.AddMonths(-1);
        try
        {
            var current = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductName)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity) })
                .ToListAsync();

            var prev = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= prevMonthStart && x.o.OrderDate < monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductName)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity) })
                .ToListAsync();

            if (!prev.Any())
                return "KHÔNG ĐỦ DỮ LIỆU: Hệ thống chưa có dữ liệu tháng trước để phân tích xu hướng tăng.";

            var trending = current
                .Join(prev, c => c.Name, p => p.Name, (c, p) => new {
                    c.Name, Current = c.Qty, Prev = p.Qty,
                    Pct = p.Qty > 0 ? (c.Qty - p.Qty) * 100.0 / p.Qty : 0.0 })
                .Where(x => x.Current > x.Prev)
                .OrderByDescending(x => x.Pct)
                .Take(5).ToList();

            if (!trending.Any())
                return $"INTENT: trending_product | Tháng {now:MM/yyyy}\nKhông có sản phẩm nào có xu hướng tăng đáng kể trong tháng này.";

            return $"""
                INTENT: trending_product | Tháng {now:MM/yyyy} vs {prevMonthStart:MM/yyyy}
                [Sản phẩm đang có xu hướng tăng doanh số]
                {string.Join("\n", trending.Select((x, i) => $"  {i + 1}. {x.Name}: tháng này {x.Current} sp, tháng trước {x.Prev} sp (+{x.Pct:F1}%)"))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_TrendingProduct lỗi: {M}", ex.Message); return "Chưa có dữ liệu xu hướng."; }
    }

    // ── Parse tháng/năm từ câu hỏi: "tháng 7/2025", "7/2025", "tháng 7 năm 2025" ──
    private static (int Month, int Year)? ParseDateFromQuestion(string question)
    {
        var q = question.ToLowerInvariant();

        // "tháng 7/2025" | "tháng 7 năm 2025" | "tháng 07/2025"
        var m = System.Text.RegularExpressions.Regex.Match(
            q, @"tháng\s*(\d{1,2})(?:[/\-\s]+(?:năm\s*)?(\d{4}))?");
        if (m.Success && int.TryParse(m.Groups[1].Value, out var mo) && mo >= 1 && mo <= 12)
        {
            if (m.Groups[2].Success && int.TryParse(m.Groups[2].Value, out var yr) && yr >= 2020 && yr <= 2030)
                return (mo, yr);
            return (mo, DateTime.UtcNow.Year);
        }

        // "7/2025" (standalone)
        m = System.Text.RegularExpressions.Regex.Match(q, @"\b(\d{1,2})/(\d{4})\b");
        if (m.Success
            && int.TryParse(m.Groups[1].Value, out var mo2) && mo2 >= 1 && mo2 <= 12
            && int.TryParse(m.Groups[2].Value, out var yr2) && yr2 >= 2020 && yr2 <= 2030)
            return (mo2, yr2);

        return null;
    }

    // ── Parse năm từ câu hỏi: "năm 2025", "năm nay vs năm ngoái", "2025 vs 2026" ──
    private static (int Year1, int? Year2)? ParseYearsFromQuestion(string question)
    {
        var q   = question.ToLowerInvariant();
        var now = DateTime.UtcNow.Year;

        // Lấy tất cả năm có trong câu hỏi (2020-2030)
        var yearMatches = System.Text.RegularExpressions.Regex
            .Matches(q, @"\b(20[2-9]\d)\b")
            .Cast<System.Text.RegularExpressions.Match>()
            .Select(m => int.Parse(m.Value))
            .Distinct().OrderBy(y => y).ToList();

        if (yearMatches.Count >= 2) return (yearMatches[0], yearMatches[1]);
        if (yearMatches.Count == 1)
        {
            // "năm 2025 vs năm ngoái" hoặc chỉ "năm 2025"
            var y = yearMatches[0];
            var wantsCompare = q.Contains("so sánh") || q.Contains(" vs ") || q.Contains(" với ");
            if (wantsCompare && (q.Contains("năm ngoái") || q.Contains("năm trước")))
                return (y, y - 1);
            return (y, null);
        }

        // Không có số năm → kiểm tra từ khoá tương đối
        if (q.Contains("năm nay") && (q.Contains("năm ngoái") || q.Contains("năm trước")))
            return (now, now - 1);
        if (q.Contains("năm ngoái") || q.Contains("năm trước"))
            return (now - 1, null);
        if (q.Contains("năm nay"))
            return (now, null);

        return null;
    }

    // ── Phát hiện câu hỏi về năm (không phải câu hỏi tháng cụ thể) ──────────
    private static bool IsYearLevelQuery(string question)
    {
        var q = question.ToLowerInvariant();
        // Có "năm" hoặc 2 năm khác nhau, và KHÔNG phải "tháng X/năm Y"
        var hasYearKw  = q.Contains("năm nay") || q.Contains("năm ngoái") || q.Contains("năm trước")
                      || System.Text.RegularExpressions.Regex.IsMatch(q, @"\bnăm\s+20[2-9]\d\b")
                      || (System.Text.RegularExpressions.Regex.Matches(q, @"\b20[2-9]\d\b").Count >= 2);
        var hasMonthKw = q.Contains("tháng ");
        return hasYearKw && !hasMonthKw;
    }

    // ── Parse quý từ câu hỏi: "quý 1", "Q1/2025", "quý 2 năm 2025" ──────────
    private static (int Quarter, int Year)? ParseQuarterFromQuestion(string question)
    {
        var q   = question.ToLowerInvariant();
        var now = DateTime.UtcNow;

        var m = System.Text.RegularExpressions.Regex.Match(q,
            @"(?:quý|q)\s*([1-4])(?:[/\-\s]+(?:năm\s*)?(20[2-9]\d))?");
        if (!m.Success) return null;
        if (!int.TryParse(m.Groups[1].Value, out var qn)) return null;
        var yr = m.Groups[2].Success && int.TryParse(m.Groups[2].Value, out var y) ? y : now.Year;
        return (qn, yr);
    }

    // ── Parse "N tháng" hoặc "nửa năm" từ câu hỏi ───────────────────────────
    // Trả về (startMonth, endMonth, year)
    private static (int StartMonth, int EndMonth, int Year)? ParseMonthRangeFromQuestion(string question)
    {
        var q   = question.ToLowerInvariant();
        var now = DateTime.UtcNow;

        // "6 tháng đầu năm" / "nửa đầu năm"
        if (q.Contains("6 tháng đầu") || q.Contains("nửa đầu năm") || q.Contains("6 tháng đầu năm"))
        {
            var yr = System.Text.RegularExpressions.Regex.Match(q, @"\b(20[2-9]\d)\b") is { Success: true } ym
                && int.TryParse(ym.Value, out var y) ? y : now.Year;
            return (1, 6, yr);
        }
        // "6 tháng cuối năm" / "nửa cuối năm"
        if (q.Contains("6 tháng cuối") || q.Contains("nửa cuối năm"))
        {
            var yr = System.Text.RegularExpressions.Regex.Match(q, @"\b(20[2-9]\d)\b") is { Success: true } ym
                && int.TryParse(ym.Value, out var y) ? y : now.Year;
            return (7, 12, yr);
        }
        // "từ tháng X đến tháng Y"
        var fm = System.Text.RegularExpressions.Regex.Match(q,
            @"từ tháng\s*(\d{1,2})(?:[/\-\s]+\d{4})?\s*đến\s*tháng\s*(\d{1,2})");
        if (fm.Success
            && int.TryParse(fm.Groups[1].Value, out var sm) && sm >= 1 && sm <= 12
            && int.TryParse(fm.Groups[2].Value, out var em) && em >= 1 && em <= 12)
        {
            var yr = System.Text.RegularExpressions.Regex.Match(q, @"\b(20[2-9]\d)\b") is { Success: true } ym
                && int.TryParse(ym.Value, out var y) ? y : now.Year;
            return (sm, em, yr);
        }
        return null;
    }

    // ── Parse "tuần này", "tuần trước" → (startDate, endDate) ────────────────
    private static (DateTime Start, DateTime End, string Label)? ParseWeekFromQuestion(string question)
    {
        var q   = question.ToLowerInvariant();
        var now = DateTime.UtcNow;
        // Đầu tuần = thứ Hai
        var dayOffset = (int)now.DayOfWeek == 0 ? -6 : 1 - (int)now.DayOfWeek;

        if (q.Contains("tuần này"))
        {
            var start = now.AddDays(dayOffset).Date;
            return (start, start.AddDays(7), "tuần này");
        }
        if (q.Contains("tuần trước") || q.Contains("tuần vừa rồi"))
        {
            var start = now.AddDays(dayOffset - 7).Date;
            return (start, start.AddDays(7), "tuần trước");
        }
        return null;
    }

    // ── Helper: doanh thu + đơn theo khoảng ngày ─────────────────────────────
    private async Task<(decimal Revenue, int Orders)> GetRevenueInRange(Guid companyId, DateTime start, DateTime end)
    {
        var rev = await db.OrderDetails
            .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
            .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= start && x.o.OrderDate < end
                     && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
            .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;
        var cnt = await db.Orders.CountAsync(o => o.CompanyId == companyId
            && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED");
        return (rev, cnt);
    }

    // ── Helper: doanh thu theo từng tháng trong năm ──────────────────────────
    private async Task<string> GetMonthlyBreakdown(Guid companyId, int year)
    {
        var start = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var end   = start.AddYears(1);
        try
        {
            var monthly = await db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= start && x.o.OrderDate < end
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.o.OrderDate.Month)
                .Select(g => new { Month = g.Key, Revenue = g.Sum(x => x.od.Subtotal), Cnt = g.Select(x => x.o.OrderId).Distinct().Count() })
                .OrderBy(x => x.Month).ToListAsync();

            if (!monthly.Any()) return "  (Chưa có dữ liệu)";
            return string.Join("\n", monthly.Select(m =>
                $"  T{m.Month:D2}/{year}: {m.Revenue:N0} VND ({m.Cnt} đơn)"));
        }
        catch { return "  (Lỗi lấy dữ liệu)"; }
    }

    private async Task<string> BuildContext_Revenue(Guid companyId, string question = "")
    {
        var now = DateTime.UtcNow;
        try
        {
            // Ưu tiên 1: Năm (năm 2025, so sánh 2025 vs 2026, năm nay vs năm ngoái)
            if (IsYearLevelQuery(question))
            {
                var years = ParseYearsFromQuestion(question);
                if (years.HasValue)
                    return await BuildContext_Revenue_Year(companyId, years.Value.Year1, years.Value.Year2);
            }

            // Ưu tiên 2: Quý (quý 1, Q2/2025)
            var quarter = ParseQuarterFromQuestion(question);
            if (quarter.HasValue)
                return await BuildContext_Revenue_Quarter(companyId, quarter.Value.Quarter, quarter.Value.Year);

            // Ưu tiên 3: Khoảng tháng (6 tháng đầu năm, từ tháng X đến Y)
            var range = ParseMonthRangeFromQuestion(question);
            if (range.HasValue)
            {
                var (sm, em, yr) = range.Value;
                var start = new DateTime(yr, sm, 1, 0, 0, 0, DateTimeKind.Utc);
                var end   = new DateTime(yr, em, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1);
                var (rev, cnt) = await GetRevenueInRange(companyId, start, end);
                return $"""
                    INTENT: revenue_summary | T{sm:D2}-T{em:D2}/{yr}
                    [Doanh thu từ tháng {sm} đến tháng {em}/{yr}]
                    - Tổng doanh thu: {rev:N0} VND ({cnt} đơn)
                    """;
            }

            // Ưu tiên 4: Tuần (tuần này, tuần trước)
            var week = ParseWeekFromQuestion(question);
            if (week.HasValue)
            {
                var (ws, we, wlabel) = week.Value;
                var (rev, cnt) = await GetRevenueInRange(companyId, ws, we);
                var (prevRev, prevCnt) = await GetRevenueInRange(companyId, ws.AddDays(-7), ws);
                var change = prevRev > 0
                    ? $"{(rev >= prevRev ? "+" : "")}{(rev - prevRev) / prevRev * 100:F1}% so với tuần trước"
                    : "(chưa có dữ liệu tuần trước)";
                return $"""
                    INTENT: revenue_summary | {wlabel} ({ws:dd/MM} – {we.AddDays(-1):dd/MM/yyyy})
                    [Doanh thu {wlabel}]
                    - Doanh thu: {rev:N0} VND, {cnt} đơn ({change})
                    - Tuần trước: {prevRev:N0} VND, {prevCnt} đơn
                    """;
            }

            // Mặc định: Tháng (tháng X/Y hoặc tháng hiện tại)
            var parsed = ParseDateFromQuestion(question);
            DateTime monthStart, prevMonthStart;
            if (parsed.HasValue)
            {
                monthStart     = new DateTime(parsed.Value.Year, parsed.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                prevMonthStart = monthStart.AddMonths(-1);
            }
            else
            {
                monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                prevMonthStart = monthStart.AddMonths(-1);
            }

            var (revM, _) = await GetRevenueInRange(companyId, monthStart, monthStart.AddMonths(1));
            var (prevM, _) = await GetRevenueInRange(companyId, prevMonthStart, monthStart);
            var changeM = prevM > 0
                ? $"{(revM >= prevM ? "+" : "")}{(revM - prevM) / prevM * 100:F1}% so với tháng {prevMonthStart:MM/yyyy}"
                : "(chưa có dữ liệu tháng trước để so sánh)";

            return $"""
                INTENT: revenue_summary | Kỳ truy vấn: {monthStart:MM/yyyy}
                [Doanh thu]
                - Tháng {monthStart:MM/yyyy}   : {revM:N0} VND ({changeM})
                - Tháng {prevMonthStart:MM/yyyy}: {prevM:N0} VND
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_Revenue lỗi: {M}", ex.Message); return "Chưa có dữ liệu doanh thu."; }
    }

    // ── Doanh thu theo năm với breakdown tháng ────────────────────────────────
    private async Task<string> BuildContext_Revenue_Year(Guid companyId, int year1, int? year2)
    {
        try
        {
            var (rev1, cnt1) = await GetRevenueInRange(companyId,
                new DateTime(year1, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                new DateTime(year1 + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc));

            var monthly1 = await GetMonthlyBreakdown(companyId, year1);

            if (year2.HasValue)
            {
                var (rev2, cnt2) = await GetRevenueInRange(companyId,
                    new DateTime(year2.Value, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                    new DateTime(year2.Value + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc));

                var revChange = rev2 > 0
                    ? $"{(rev1 >= rev2 ? "+" : "")}{(rev1 - rev2) / rev2 * 100:F1}%"
                    : "(chưa có dữ liệu để so sánh)";
                var cntChange = cnt2 > 0
                    ? $"{(cnt1 >= cnt2 ? "+" : "")}{cnt1 - cnt2} đơn"
                    : "";

                var monthly2 = await GetMonthlyBreakdown(companyId, year2.Value);

                return $"""
                    INTENT: revenue_summary | So sánh năm {year1} vs {year2}
                    [Tổng quan so sánh]
                    - Năm {year1}: {rev1:N0} VND, {cnt1} đơn  ({revChange} so năm {year2}; {cntChange})
                    - Năm {year2}: {rev2:N0} VND, {cnt2} đơn

                    [Breakdown tháng — Năm {year1}]
                    {monthly1}

                    [Breakdown tháng — Năm {year2}]
                    {monthly2}
                    """;
            }

            return $"""
                INTENT: revenue_summary | Năm {year1}
                [Doanh thu năm {year1}]
                - Tổng doanh thu: {rev1:N0} VND
                - Tổng đơn hàng : {cnt1} đơn

                [Breakdown theo tháng]
                {monthly1}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_Revenue_Year lỗi: {M}", ex.Message); return "Chưa có dữ liệu doanh thu theo năm."; }
    }

    // ── Doanh thu theo quý ────────────────────────────────────────────────────
    private async Task<string> BuildContext_Revenue_Quarter(Guid companyId, int quarter, int year)
    {
        var sm      = (quarter - 1) * 3 + 1;
        var start   = new DateTime(year, sm, 1, 0, 0, 0, DateTimeKind.Utc);
        var end     = start.AddMonths(3);
        var prevStart = start.AddMonths(-3);
        var prevQ   = quarter == 1 ? 4 : quarter - 1;
        var prevY   = quarter == 1 ? year - 1 : year;
        try
        {
            var (rev, cnt)   = await GetRevenueInRange(companyId, start, end);
            var (prev, pcnt) = await GetRevenueInRange(companyId, prevStart, start);

            var change = prev > 0
                ? $"{(rev >= prev ? "+" : "")}{(rev - prev) / prev * 100:F1}% so Q{prevQ}/{prevY}"
                : "(chưa có Q trước để so sánh)";

            var monthly = await GetMonthlyBreakdown(companyId, year);
            // Chỉ lấy tháng thuộc quý
            var qMonths = Enumerable.Range(sm, 3).Select(m => $"T{m:D2}/{year}");

            return $"""
                INTENT: revenue_summary | Q{quarter}/{year} (T{sm:D2}–T{sm + 2:D2}/{year})
                [Doanh thu Quý {quarter}/{year}]
                - Tổng doanh thu: {rev:N0} VND, {cnt} đơn ({change})
                - Q{prevQ}/{prevY}        : {prev:N0} VND, {pcnt} đơn

                [Chi tiết tháng trong Q{quarter}/{year}]
                {string.Join("\n", monthly.Split('\n').Where(l => qMonths.Any(qm => l.Contains(qm))))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_Revenue_Quarter lỗi: {M}", ex.Message); return "Chưa có dữ liệu doanh thu theo quý."; }
    }

    private async Task<string> BuildContext_OrderSummary(Guid companyId, string question = "")
    {
        var now = DateTime.UtcNow;
        try
        {
            // Năm
            if (IsYearLevelQuery(question))
            {
                var years = ParseYearsFromQuestion(question);
                if (years.HasValue)
                {
                    var (_, cnt1) = await GetRevenueInRange(companyId,
                        new DateTime(years.Value.Year1, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                        new DateTime(years.Value.Year1 + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc));
                    if (years.Value.Year2.HasValue)
                    {
                        var (_, cnt2) = await GetRevenueInRange(companyId,
                            new DateTime(years.Value.Year2.Value, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                            new DateTime(years.Value.Year2.Value + 1, 1, 1, 0, 0, 0, DateTimeKind.Utc));
                        var chg = cnt2 > 0 ? $"{(cnt1 >= cnt2 ? "+" : "")}{cnt1 - cnt2} đơn" : "";
                        return $"""
                            INTENT: order_summary | Năm {years.Value.Year1} vs {years.Value.Year2}
                            [Số đơn hàng]
                            - Năm {years.Value.Year1}: {cnt1} đơn {(chg.Length > 0 ? $"({chg} so năm {years.Value.Year2})" : "")}
                            - Năm {years.Value.Year2}: {cnt2} đơn
                            """;
                    }
                    return $"INTENT: order_summary | Năm {years.Value.Year1}\n[Số đơn hàng năm {years.Value.Year1}]\n- Tổng đơn: {cnt1} đơn";
                }
            }

            // Quý
            var quarter = ParseQuarterFromQuestion(question);
            if (quarter.HasValue)
            {
                var sm = (quarter.Value.Quarter - 1) * 3 + 1;
                var start = new DateTime(quarter.Value.Year, sm, 1, 0, 0, 0, DateTimeKind.Utc);
                var (_, cnt) = await GetRevenueInRange(companyId, start, start.AddMonths(3));
                return $"INTENT: order_summary | Q{quarter.Value.Quarter}/{quarter.Value.Year}\n[Đơn hàng Q{quarter.Value.Quarter}/{quarter.Value.Year}]\n- Tổng đơn: {cnt} đơn";
            }

            // Tuần
            var week = ParseWeekFromQuestion(question);
            if (week.HasValue)
            {
                var (_, wcnt) = await GetRevenueInRange(companyId, week.Value.Start, week.Value.End);
                var (_, pcnt) = await GetRevenueInRange(companyId, week.Value.Start.AddDays(-7), week.Value.Start);
                var chg = pcnt > 0 ? $"{(wcnt >= pcnt ? "+" : "")}{wcnt - pcnt} đơn so tuần trước" : "";
                return $"""
                    INTENT: order_summary | {week.Value.Label}
                    [Số đơn {week.Value.Label}]
                    - {week.Value.Label}: {wcnt} đơn {(chg.Length > 0 ? $"({chg})" : "")}
                    - Tuần trước: {pcnt} đơn
                    """;
            }

            // Tháng (mặc định)
            var parsed = ParseDateFromQuestion(question);
            DateTime monthStart, prevMonthStart;
            if (parsed.HasValue)
            {
                monthStart     = new DateTime(parsed.Value.Year, parsed.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                prevMonthStart = monthStart.AddMonths(-1);
            }
            else
            {
                monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                prevMonthStart = monthStart.AddMonths(-1);
            }

            var cntM  = await db.Orders.CountAsync(o => o.CompanyId == companyId
                && o.OrderDate >= monthStart && o.OrderDate < monthStart.AddMonths(1) && o.Status != "CANCELLED");
            var prevM = await db.Orders.CountAsync(o => o.CompanyId == companyId
                && o.OrderDate >= prevMonthStart && o.OrderDate < monthStart && o.Status != "CANCELLED");
            var changeM2 = prevM > 0
                ? $"{(cntM >= prevM ? "+" : "")}{cntM - prevM} đơn so với tháng {prevMonthStart:MM/yyyy} ({prevM} đơn)"
                : "(chưa có dữ liệu tháng trước)";

            return $"""
                INTENT: order_summary | Kỳ truy vấn: {monthStart:MM/yyyy}
                [Đơn hàng]
                - Tháng {monthStart:MM/yyyy}   : {cntM} đơn ({changeM2})
                - Tháng {prevMonthStart:MM/yyyy}: {prevM} đơn
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_OrderSummary lỗi: {M}", ex.Message); return "Chưa có dữ liệu đơn hàng."; }
    }

    private async Task<string> BuildContext_Channels(Guid companyId, bool topOnly)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        try
        {
            var channels = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o  => o.OrderId,   (od, o)  => new { od, o })
                .Join(db.Channels, x  => x.o.ChannelId, ch => ch.ChannelId, (x, ch) => new { x.od, x.o, ch })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED")
                .GroupBy(x => x.ch.ChannelName)
                .Select(g => new {
                    Name       = g.Key,
                    Revenue    = g.Sum(x => x.od.Subtotal),
                    OrderCount = g.Select(x => x.o.OrderId).Distinct().Count()
                })
                .OrderByDescending(c => c.Revenue)
                .ToListAsync();

            if (!channels.Any()) return $"Chưa có dữ liệu kênh bán hàng trong tháng {now:MM/yyyy}.";

            var intent = topOnly ? "top_channel" : "channel_comparison";
            var list   = topOnly ? channels.Take(1).ToList() : channels;

            return $"""
                INTENT: {intent} | Tháng: {now:MM/yyyy}
                [Kênh bán hàng theo doanh thu]
                {string.Join("\n", list.Select((c, i) => $"  {i + 1}. {c.Name}: {c.Revenue:N0} VND, {c.OrderCount} đơn"))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_Channels lỗi: {M}", ex.Message); return "Chưa có dữ liệu kênh bán hàng."; }
    }

    private async Task<string> BuildContext_BusinessRecommendation(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        try
        {
            var products = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductName)
                .OrderByDescending(g => g.Sum(x => x.od.Quantity))
                .Take(5)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity), Rev = g.Sum(x => x.od.Subtotal) })
                .ToListAsync();

            var channels = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o  => o.OrderId,   (od, o)  => new { od, o })
                .Join(db.Channels, x  => x.o.ChannelId, ch => ch.ChannelId, (x, ch) => new { x.od, x.o, ch })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED")
                .GroupBy(x => x.ch.ChannelName)
                .Select(g => new { Name = g.Key, Revenue = g.Sum(x => x.od.Subtotal) })
                .OrderByDescending(c => c.Revenue)
                .Take(3)
                .ToListAsync();

            var totalRev = await db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;

            return $"""
                INTENT: business_recommendation | Tháng: {now:MM/yyyy}
                [Doanh thu tháng này: {totalRev:N0} VND]

                [Top sản phẩm bán chạy]
                {(products.Any() ? string.Join("\n", products.Select((p, i) => $"  {i + 1}. {p.Name}: {p.Qty} sp, {p.Rev:N0} VND")) : "  Chưa có dữ liệu")}

                [Kênh bán hàng hiệu quả]
                {(channels.Any() ? string.Join("\n", channels.Select((c, i) => $"  {i + 1}. {c.Name}: {c.Revenue:N0} VND")) : "  Chưa có dữ liệu")}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_BusinessRecommendation lỗi: {M}", ex.Message); return "Chưa có dữ liệu để đưa gợi ý."; }
    }

    private async Task<string> BuildContext_CustomerOverview(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        try
        {
            var totalActive  = await db.Customers.CountAsync(c => c.CompanyId == companyId && c.IsActive);
            var newThisMonth = await db.Customers.CountAsync(c => c.CompanyId == companyId && c.CreatedAt >= monthStart);

            var topSpenders = await db.Customers
                .Where(c => c.CompanyId == companyId && c.IsActive && c.TotalOrders > 0)
                .OrderByDescending(c => c.TotalSpent)
                .Take(5)
                .Select(c => new { c.FullName, c.TotalOrders, c.TotalSpent, c.RfmSegment })
                .ToListAsync();

            var rfmGroups = await db.Customers
                .Where(c => c.CompanyId == companyId && c.IsActive && c.RfmSegment != null)
                .GroupBy(c => c.RfmSegment!)
                .Select(g => new { Segment = g.Key, Count = g.Count() })
                .OrderByDescending(g => g.Count)
                .Take(5)
                .ToListAsync();

            return $"""
                INTENT: customer_overview | Tháng: {now:MM/yyyy}
                [Tổng quan khách hàng]
                - Tổng KH đang hoạt động: {totalActive}
                - KH mới tháng này      : {newThisMonth}

                [Top 5 KH chi tiêu cao nhất]
                {(topSpenders.Any()
                    ? string.Join("\n", topSpenders.Select((c, i) =>
                        $"  {i + 1}. {c.FullName}: {c.TotalOrders} đơn, {c.TotalSpent:N0} VND"
                        + (c.RfmSegment is not null ? $" [{c.RfmSegment}]" : "")))
                    : "  Chưa có dữ liệu")}

                [Phân khúc RFM]
                {(rfmGroups.Any()
                    ? string.Join("\n", rfmGroups.Select(g => $"  {g.Segment}: {g.Count} KH"))
                    : "  Chưa có dữ liệu RFM — chạy AI → RFM Analysis để phân loại")}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_CustomerOverview lỗi: {M}", ex.Message); return "Chưa có dữ liệu khách hàng."; }
    }

    private async Task<string> BuildContext_Inventory(Guid companyId)
    {
        try
        {
            var totalActive  = await db.Products.CountAsync(p => p.CompanyId == companyId && p.IsActive);
            var outOfStock   = await db.Products.CountAsync(p => p.CompanyId == companyId && p.IsActive && p.StockQuantity == 0);
            var lowStockCnt  = await db.Products.CountAsync(p => p.CompanyId == companyId && p.IsActive && p.StockQuantity > 0 && p.StockQuantity <= 10);

            var lowStock = await db.Products
                .Where(p => p.CompanyId == companyId && p.IsActive && p.StockQuantity <= 10)
                .OrderBy(p => p.StockQuantity)
                .Take(10)
                .Select(p => new { p.ProductName, p.StockQuantity, p.Sku })
                .ToListAsync();

            return $"""
                INTENT: inventory_alert
                [Tổng quan tồn kho]
                - Tổng sản phẩm đang bán: {totalActive}
                - Hết hàng (0 sp)        : {outOfStock} sản phẩm
                - Sắp hết (≤10 sp)       : {lowStockCnt} sản phẩm

                [Danh sách cần nhập thêm]
                {(lowStock.Any()
                    ? string.Join("\n", lowStock.Select(p =>
                        $"  • {p.ProductName} [{p.Sku}]: còn {p.StockQuantity} sp"))
                    : "  Không có sản phẩm sắp hết — tồn kho ổn định")}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_Inventory lỗi: {M}", ex.Message); return "Chưa có dữ liệu tồn kho."; }
    }

    private async Task<string> BuildContext_PerformanceOverview(Guid companyId)
    {
        var now            = DateTime.UtcNow;
        var monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = monthStart.AddMonths(-1);
        try
        {
            var rev = await db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;
            var prevRev = await db.OrderDetails
                .Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= prevMonthStart && x.o.OrderDate < monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;

            var cnt     = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= monthStart && o.Status != "CANCELLED");
            var prevCnt = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= prevMonthStart && o.OrderDate < monthStart && o.Status != "CANCELLED");

            var topProducts = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart && x.o.Status != "CANCELLED")
                .GroupBy(x => x.p.ProductName)
                .OrderByDescending(g => g.Sum(x => x.od.Quantity))
                .Take(3)
                .Select(g => $"  • {g.Key}: {g.Sum(x => x.od.Quantity)} sp")
                .ToListAsync();

            var topChannel = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o  => o.OrderId,   (od, o)  => new { od, o })
                .Join(db.Channels, x  => x.o.ChannelId, ch => ch.ChannelId, (x, ch) => new { x.od, x.o, ch })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart && x.o.Status != "CANCELLED")
                .GroupBy(x => x.ch.ChannelName)
                .OrderByDescending(g => g.Sum(x => x.od.Subtotal))
                .Select(g => $"{g.Key}: {g.Sum(x => x.od.Subtotal):N0} VND")
                .FirstOrDefaultAsync();

            var revChange = prevRev > 0
                ? $"{(rev >= prevRev ? "+" : "")}{(rev - prevRev) / prevRev * 100:F1}% so tháng trước"
                : "chưa có dữ liệu tháng trước";
            var cntChange = prevCnt > 0
                ? $"{(cnt >= prevCnt ? "+" : "")}{cnt - prevCnt} đơn so tháng trước"
                : "";

            return $"""
                INTENT: performance_overview | Tháng: {now:MM/yyyy}
                [Tổng quan kinh doanh]
                - Doanh thu : {rev:N0} VND ({revChange})
                - Số đơn    : {cnt} đơn {(cntChange.Length > 0 ? $"({cntChange})" : "")}
                - Kênh tốt  : {topChannel ?? "Chưa có dữ liệu"}

                [Top sản phẩm bán chạy]
                {(topProducts.Any() ? string.Join("\n", topProducts) : "  Chưa có dữ liệu")}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_PerformanceOverview lỗi: {M}", ex.Message); return "Chưa có dữ liệu tổng quan."; }
    }

    // ── Build context hiệu suất nhân viên ────────────────────────────────────
    // Dùng CreatedByUserId (đơn POS) + join Users để xếp hạng nhân viên bán offline.
    private async Task<string> BuildContext_EmployeePerformance(Guid companyId, string question)
    {
        var now   = DateTime.UtcNow;
        var q     = question.ToLowerInvariant();

        // Xác định kỳ từ câu hỏi
        DateTime start, end;
        string   label;

        if (IsYearLevelQuery(question))
        {
            var years = ParseYearsFromQuestion(question) ?? (now.Year, (int?)null);
            start = new DateTime(years.Year1, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            end   = start.AddYears(1);
            label = $"Năm {years.Year1}";
        }
        else if (ParseQuarterFromQuestion(question) is { } qtr)
        {
            var sm2 = (qtr.Quarter - 1) * 3 + 1;
            start = new DateTime(qtr.Year, sm2, 1, 0, 0, 0, DateTimeKind.Utc);
            end   = start.AddMonths(3);
            label = $"Q{qtr.Quarter}/{qtr.Year}";
        }
        else
        {
            var parsed = ParseDateFromQuestion(question);
            start = parsed.HasValue
                ? new DateTime(parsed.Value.Year, parsed.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc)
                : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            end   = start.AddMonths(1);
            label = $"Tháng {start:MM/yyyy}";
        }

        try
        {
            // Xếp hạng theo đơn POS do nhân viên tạo (CreatedByUserId != null)
            var posRank = await db.Orders
                .Join(db.Users, o => o.CreatedByUserId, u => u.Id, (o, u) => new { o, u })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= start && x.o.OrderDate < end
                         && x.o.Status != "CANCELLED"
                         && x.o.CreatedByUserId != null)
                .GroupBy(x => new { x.u.Id, x.u.FullName, x.u.Username })
                .Select(g => new {
                    g.Key.FullName, g.Key.Username,
                    OrderCount = g.Count(),
                    Revenue    = g.Sum(x => x.o.TotalAmount)
                })
                .OrderByDescending(x => x.Revenue)
                .Take(10)
                .ToListAsync();

            // Tổng đơn và doanh thu POS trong kỳ để tính %
            var totalPosRev = posRank.Sum(x => x.Revenue);

            if (!posRank.Any())
            {
                return $"""
                    INTENT: employee_performance | {label}
                    Hệ thống chưa có dữ liệu bán hàng POS của nhân viên trong {label}.
                    Lưu ý: Chỉ có thể theo dõi hiệu suất nhân viên cho đơn hàng tại quầy (POS). Đơn từ sàn (Shopee/Lazada/TikTok) không gắn nhân viên cụ thể.
                    """;
            }

            return $"""
                INTENT: employee_performance | {label}
                [Xếp hạng nhân viên theo doanh thu POS — {label}]
                {string.Join("\n", posRank.Select((e, i) =>
                    $"  {i + 1}. {e.FullName} ({e.Username}): {e.OrderCount} đơn — {e.Revenue:N0} VND"
                    + (totalPosRev > 0 ? $" ({e.Revenue / totalPosRev * 100:F1}%)" : "")))}

                [Tổng POS trong kỳ]
                - Tổng đơn : {posRank.Sum(x => x.OrderCount)} đơn
                - Tổng doanh thu: {totalPosRev:N0} VND
                Ghi chú: Chỉ tính đơn POS do nhân viên nhập trực tiếp. Đơn online (sàn TMĐT) không có dữ liệu nhân viên.
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_EmployeePerformance lỗi: {M}", ex.Message); return "Chưa có dữ liệu hiệu suất nhân viên."; }
    }

    // ── Build context phân tích chéo nhiều nguồn ─────────────────────────────
    // Kết hợp dữ liệu nội bộ + Facebook/thị trường theo nội dung câu hỏi.
    private async Task<string> BuildContext_CrossAnalysis(Guid companyId, string question, List<string> keywords)
    {
        var q     = question.ToLowerInvariant();
        var parts = new List<string>();

        // Luôn bao gồm tổng quan kinh doanh nội bộ
        var bizCtx = await BuildContext_PerformanceOverview(companyId);
        parts.Add(bizCtx);

        // Thêm dữ liệu Facebook nếu câu hỏi đề cập phản hồi KH
        static bool Has(string text, params string[] words) => words.Any(text.Contains);
        if (Has(q, "facebook", "phàn nàn", "khách chê", "bình luận", "phản hồi", "khách hàng chê"))
        {
            var fbCtx = await BuildFeedbackContext(companyId, keywords);
            parts.Add("\n--- DỮ LIỆU PHẢN HỒI FACEBOOK ---\n" + fbCtx);
        }

        // Thêm dữ liệu thị trường nếu câu hỏi đề cập đối thủ/xu hướng
        if (Has(q, "đối thủ", "thị trường", "giá đối thủ", "google", "xu hướng thị trường"))
        {
            var mktCtx = await BuildMarketContext(companyId, keywords);
            parts.Add("\n--- DỮ LIỆU XU HƯỚNG THỊ TRƯỜNG ---\n" + mktCtx);
        }

        return string.Join("\n", parts);
    }

    // ── Gợi ý câu hỏi thông minh theo tab ────────────────────────────────────

    public Task<List<string>> GetSmartSuggestions(Guid? companyId, string tab)
    {
        var suggestions = tab switch
        {
            "business" => new List<string>
            {
                "Sản phẩm nào đang bán chạy nhất tháng này?",
                "Kênh bán hàng nào mang lại doanh thu cao nhất?",
                "Doanh thu tháng này so với tháng trước thế nào?",
            },
            "market" => new List<string>
            {
                "Xu hướng thời trang nào đang hot tại Việt Nam?",
                "Mùa hè nên tập trung bán sản phẩm gì?",
                "Thương mại điện tử Việt Nam đang có xu hướng gì?",
            },
            "feedback" => new List<string>
            {
                "Khách hàng đánh giá sản phẩm của tôi như thế nào?",
                "Vấn đề nào được khách phàn nàn nhiều nhất?",
                "Làm thế nào để tăng tỷ lệ review 5 sao?",
            },
            _ => new List<string> { "Tôi có thể giúp gì cho bạn hôm nay?" },
        };
        return Task.FromResult(suggestions);
    }

    // ── Gọi Gemini API với intent-aware context ───────────────────────────────

    public async Task<ChatResponse> ChatAsync(
        Guid?             companyId,
        string            userMessage,
        string            tab,
        List<ChatMessage> history)
    {
        var result = new ChatResponse { Question = userMessage, Timestamp = DateTime.UtcNow };

        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            result.Answer        = "Gemini API key chưa được cấu hình. Vui lòng liên hệ quản trị viên.";
            result.IsAiGenerated = false;
            result.FallbackUsed  = true;
            result.FallbackReason = "API key not configured";
            result.ModelUsed  = "none";
            return result;
        }

        // 1. Xác định taxonomy tab từ UI tab + nội dung câu hỏi
        var taxonomyTab = MapToTaxonomyTab(tab, userMessage);
        result.Tab = taxonomyTab;

        // Xác định DataSource theo tab
        result.DataSource = taxonomyTab switch
        {
            "scraped_market"    => "google_data",
            "facebook_feedback" => "facebook_data",
            "cross_analysis"    => "mixed",
            _                   => "database",
        };

        // 2. Detect sub-intent — rule-based fast path
        var intent = taxonomyTab switch
        {
            "facebook_feedback" => "customer_feedback",
            "scraped_market"    => "market",
            "cross_analysis"    => "cross_analysis",
            _                   => DetectIntent(userMessage),  // internal_business
        };

        if (intent == "unknown")
        {
            intent = await ClassifyIntentWithGeminiAsync(userMessage);
            logger.LogInformation("[CHATBOT] Gemini classified intent: {I}", intent);
        }

        // 3. Nếu intent vẫn là unknown → câu hỏi ngoài phạm vi hệ thống, trả template
        if (intent == "unknown")
        {
            result.Tab       = "unknown";
            result.Intent    = "unknown";
            result.SubIntent = "unknown";
            result.DataSource = "none";
            result.ModelUsed = "template_fallback";
            result.Answer    = "Câu hỏi này hiện chưa nằm trong phạm vi dữ liệu mà hệ thống có thể phân tích. " +
                               "Bạn có thể hỏi về doanh thu, sản phẩm, kênh bán hàng, tồn kho, " +
                               "phản hồi khách hàng hoặc xu hướng thị trường.";
            result.IsAiGenerated = false;
            result.FallbackUsed  = true;
            result.FallbackReason = "unknown intent — template response, no LLM call";
            logger.LogInformation("[CHATBOT] unknown intent, trả template cho câu hỏi: {Q}",
                userMessage[..Math.Min(60, userMessage.Length)]);
            return result;
        }

        result.Intent    = intent;
        result.SubIntent = intent;

        // 4. Extract keywords để lọc DB (dùng cho market/feedback/cross tab)
        var keywords = ExtractKeywords(userMessage);

        // 5. Build focused context theo taxonomy tab + intent
        var context = string.Empty;
        if (companyId.HasValue)
        {
            context = (taxonomyTab, intent) switch
            {
                ("scraped_market",    _)                        => await BuildMarketContext              (companyId.Value, keywords),
                ("facebook_feedback", _)                        => await BuildFeedbackContext            (companyId.Value, keywords),
                ("cross_analysis",    _)                        => await BuildContext_CrossAnalysis      (companyId.Value, userMessage, keywords),
                (_,                   "top_product")            => await BuildContext_TopProduct         (companyId.Value),
                (_,                   "declining_product")      => await BuildContext_DecliningProduct   (companyId.Value),
                (_,                   "trending_product")       => await BuildContext_TrendingProduct    (companyId.Value),
                (_,                   "revenue_summary")        => await BuildContext_Revenue            (companyId.Value, userMessage),
                (_,                   "order_summary")          => await BuildContext_OrderSummary       (companyId.Value, userMessage),
                (_,                   "top_channel")            => await BuildContext_Channels              (companyId.Value, topOnly: true),
                (_,                   "channel_comparison")     => await BuildContext_Channels              (companyId.Value, topOnly: false),
                (_,                   "business_recommendation")=> await BuildContext_BusinessRecommendation(companyId.Value),
                (_,                   "customer_overview")      => await BuildContext_CustomerOverview      (companyId.Value),
                (_,                   "inventory_alert")        => await BuildContext_Inventory             (companyId.Value),
                (_,                   "employee_performance")   => await BuildContext_EmployeePerformance   (companyId.Value, userMessage),
                _                                               => await BuildContext_PerformanceOverview   (companyId.Value),
            };
        }

        // 6. Debug log
        logger.LogInformation(
            "[CHATBOT] user_question={Q} | taxonomy_tab={TT} | sub_intent={I} | context_len={L}",
            userMessage[..Math.Min(80, userMessage.Length)], taxonomyTab, intent, context.Length);

        // 7. Build focused system prompt theo spec
        var systemPrompt = BuildFocusedSystemPrompt(userMessage, intent, context, taxonomyTab);

        // 6. Build request body
        var contents = new List<object>();
        foreach (var msg in history.TakeLast(10))
            contents.Add(new { role = msg.Role, parts = new[] { new { text = msg.Content } } });
        contents.Add(new { role = "user", parts = new[] { new { text = userMessage } } });

        var requestBody = new
        {
            system_instruction = new { parts = new[] { new { text = systemPrompt } } },
            contents,
            generationConfig   = new { temperature = _temp, maxOutputTokens = _maxTok, candidateCount = 1 },
        };

        var json = JsonSerializer.Serialize(requestBody);
        var url  = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";

        try
        {
            var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(30);

            var httpContent = new StringContent(json, Encoding.UTF8, "application/json");
            var response    = await http.PostAsync(url, httpContent);

            var body   = await response.Content.ReadAsStringAsync();
            var status = (int)response.StatusCode;

            // Gemini hết quota (429) hoặc quá tải (503) → thử Groq trước khi rule-based
            if (status == 429 || status == 503)
            {
                logger.LogWarning("Gemini {Status} — thử Groq fallback", status);
                var groqText = await CallGroqAsync(systemPrompt, userMessage, history);
                if (groqText is not null)
                {
                    result.Answer         = groqText;
                    result.ModelUsed      = _groqModel;
                    result.FallbackUsed   = true;
                    result.FallbackReason = $"Gemini {status}, dùng Groq ({_groqModel})";
                    logger.LogInformation("[CHATBOT] Groq trả lời thành công cho intent={I}", intent);
                    return result;
                }
            }

            if (!response.IsSuccessStatusCode)
            {
                logger.LogError("Gemini API lỗi {Status}: {Body}", status, body[..Math.Min(300, body.Length)]);

                if (status == 403)
                {
                    result.Answer        = "AI chưa được cấp quyền (403). Vui lòng báo quản trị viên kiểm tra API key.";
                    result.ModelUsed     = "none";
                    result.IsAiGenerated = false;
                    result.FallbackUsed  = true;
                    result.FallbackReason = "Gemini 403";
                    return result;
                }

                // Thử FastAPI fallback cho non-business tab
                if (taxonomyTab != "internal_business")
                {
                    var fastApi = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
                    if (fastApi is not null)
                    {
                        result.Answer         = fastApi;
                        result.ModelUsed      = "fastapi_fallback";
                        result.FallbackUsed   = true;
                        result.FallbackReason = $"Gemini HTTP {status}, FastAPI";
                        return result;
                    }
                }

                var rb = BuildRuleBasedResponse(userMessage, intent, context);
                result.Answer         = rb;
                result.ModelUsed      = "template_fallback";
                result.IsAiGenerated  = false;
                result.FallbackUsed   = true;
                result.FallbackReason = $"Gemini HTTP {status}, rule-based intent={intent}";
                return result;
            }

            using var doc = JsonDocument.Parse(body);
            var aiText = doc.RootElement
                .GetProperty("candidates")[0].GetProperty("content")
                .GetProperty("parts")[0].GetProperty("text").GetString() ?? "";

            result.Answer    = aiText;
            result.ModelUsed = _model;
            logger.LogInformation("[CHATBOT] Gemini trả lời ({I}): {A}", intent, aiText[..Math.Min(120, aiText.Length)]);
            return result;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Gemini ChatAsync exception — thử Groq");

            // Exception (timeout, network) → thử Groq
            var groqText = await CallGroqAsync(systemPrompt, userMessage, history);
            if (groqText is not null)
            {
                result.Answer         = groqText;
                result.ModelUsed      = _groqModel;
                result.FallbackUsed   = true;
                result.FallbackReason = "Gemini exception, dùng Groq";
                return result;
            }

            if (taxonomyTab != "internal_business")
            {
                var fastApi = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
                if (fastApi is not null)
                {
                    result.Answer         = fastApi;
                    result.ModelUsed      = "fastapi_fallback";
                    result.FallbackUsed   = true;
                    result.FallbackReason = "Gemini exception, FastAPI";
                    return result;
                }
            }

            var rb = BuildRuleBasedResponse(userMessage, intent, context);
            result.Answer         = rb;
            result.ModelUsed      = "template_fallback";
            result.IsAiGenerated  = false;
            result.FallbackUsed   = true;
            result.FallbackReason = $"Gemini exception, rule-based intent={intent}";
            return result;
        }
    }

    // ── Tier 2A: Groq free-tier fallback (OpenAI-compatible API) ────────────
    // Dùng khi Gemini hết quota (429) hoặc quá tải — Groq miễn phí, latency thấp.
    private async Task<string?> CallGroqAsync(string systemPrompt, string userMessage, List<ChatMessage> history)
    {
        if (string.IsNullOrWhiteSpace(_groqApiKey)) return null;
        try
        {
            var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _groqApiKey);

            var messages = new List<object>
            {
                new { role = "system", content = systemPrompt }
            };
            foreach (var msg in history.TakeLast(10))
                messages.Add(new { role = msg.Role == "model" ? "assistant" : msg.Role, content = msg.Content });
            messages.Add(new { role = "user", content = userMessage });

            var payload = JsonSerializer.Serialize(new
            {
                model       = _groqModel,
                messages,
                temperature = _temp,
                max_tokens  = _maxTok,
            });

            var response = await http.PostAsync(
                "https://api.groq.com/openai/v1/chat/completions",
                new StringContent(payload, Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Groq API lỗi HTTP {Status}", (int)response.StatusCode);
                return null;
            }

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var text = doc.RootElement
                .GetProperty("choices")[0].GetProperty("message")
                .GetProperty("content").GetString();

            if (!string.IsNullOrWhiteSpace(text))
                logger.LogInformation("[CHATBOT] Groq thành công ({M}): {A}",
                    _groqModel, text[..Math.Min(80, text.Length)]);
            return text;
        }
        catch (Exception ex)
        {
            logger.LogWarning("Groq fallback thất bại: {Msg}", ex.Message);
            return null;
        }
    }

    // ── Tier 2B: Gọi FastAPI /recommendation khi Gemini thất bại ─────────────
    // Map tab → context_type FastAPI hiểu được
    private static string TabToContextType(string tab) => tab switch
    {
        "business" => "business_data",
        "market"   => "market_trends",
        "feedback" => "customer_feedback",
        _          => "business_data",
    };

    private async Task<string?> CallRecommendationFallbackAsync(
        string  question,
        string  tab,
        Guid?   companyId)
    {
        try
        {
            var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(25);

            var payload = JsonSerializer.Serialize(new
            {
                question,
                language = "vi",
                context  = TabToContextType(tab),
                sources  = (string[]?)null,
            });

            var url      = $"{_aiServiceUrl}/recommendation";
            var response = await http.PostAsync(
                url,
                new StringContent(payload, Encoding.UTF8, "application/json"));

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Tier-2 FastAPI /recommendation lỗi HTTP {Status}", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadAsStringAsync();
            using var doc  = JsonDocument.Parse(body);
            var root        = doc.RootElement;

            var text = root.TryGetProperty("recommendation", out var rec) ? rec.GetString()
                     : root.TryGetProperty("message",        out var msg) ? msg.GetString()
                     : null;

            if (string.IsNullOrWhiteSpace(text)) return null;

            logger.LogInformation("Tier-2 FastAPI thành công cho câu hỏi: {Q}", question[..Math.Min(60, question.Length)]);
            return text + "\n\n*(Phản hồi từ AI dự phòng — Gemini tạm thời không khả dụng)*";
        }
        catch (Exception ex)
        {
            logger.LogWarning("Tier-2 FastAPI thất bại: {Msg}", ex.Message);
            return null;
        }
    }

    // ── Tier 3: Fallback rule-based theo intent ──────────────────────────────

    private static string BuildRuleBasedResponse(string question, string intent, string context)
    {
        var note = "\n\n*(Dữ liệu từ hệ thống — AI đang xử lý, vui lòng thử lại sau)*";

        if (!string.IsNullOrWhiteSpace(context))
        {
            return intent switch
            {
                "top_product"       => $"Dựa trên dữ liệu hệ thống:\n{ExtractSection(context, "Sản phẩm bán chạy")}{note}",
                "declining_product" => context.Contains("KHÔNG ĐỦ DỮ LIỆU")
                    ? "Hệ thống chưa có đủ dữ liệu để xác định sản phẩm đang giảm doanh số." + note
                    : $"Dựa trên dữ liệu:\n{ExtractSection(context, "Sản phẩm giảm")}{note}",
                "trending_product"  => context.Contains("KHÔNG ĐỦ DỮ LIỆU")
                    ? "Hệ thống chưa có đủ dữ liệu tháng trước để xác định xu hướng tăng." + note
                    : $"Dựa trên dữ liệu:\n{ExtractSection(context, "xu hướng tăng")}{note}",
                "revenue_summary"   => FormatRevenueAnswer(context, note),
                "order_summary"     => FormatOrderAnswer(context, note),
                "top_channel"
                or "channel_comparison" => $"Dựa trên dữ liệu:\n{ExtractSection(context, "Kênh bán hàng")}{note}",
                _ => $"Dựa trên dữ liệu hệ thống:\n{context.Split('\n').Take(8).Aggregate((a, b) => a + "\n" + b)}{note}",
            };
        }

        // Không có context → thông báo rõ ràng
        return "Hệ thống đang tải dữ liệu. Vui lòng thử lại sau vài giây hoặc kiểm tra Dashboard để tra cứu số liệu." + note;
    }

    // Định dạng câu trả lời doanh thu trực tiếp từ context
    private static string FormatRevenueAnswer(string context, string note)
    {
        // Trích kỳ truy vấn từ context header
        var periodMatch = System.Text.RegularExpressions.Regex.Match(
            context, @"Kỳ truy vấn:\s*(\d{2}/\d{4})");
        var period = periodMatch.Success ? periodMatch.Groups[1].Value : "";

        var section = ExtractSection(context, "Doanh thu");

        // Parse dòng "Tháng XX/YYYY : NNN VND (change)"
        var lines = section.Split('\n')
            .Where(l => l.TrimStart().StartsWith("- Tháng"))
            .Select(l => l.Trim())
            .ToList();

        if (lines.Count == 0)
            return $"Dựa trên dữ liệu:\n{section}{note}";

        var sb = new System.Text.StringBuilder();
        if (!string.IsNullOrEmpty(period))
            sb.AppendLine($"Doanh thu tháng {period}:");
        else
            sb.AppendLine("Doanh thu:");

        foreach (var l in lines)
            sb.AppendLine(l.TrimStart('-').Trim());

        sb.Append(note);
        return sb.ToString().Trim();
    }

    // Định dạng câu trả lời số đơn hàng
    private static string FormatOrderAnswer(string context, string note)
    {
        var periodMatch = System.Text.RegularExpressions.Regex.Match(
            context, @"Kỳ truy vấn:\s*(\d{2}/\d{4})");
        var period = periodMatch.Success ? periodMatch.Groups[1].Value : "";

        var section = ExtractSection(context, "Đơn hàng");
        var lines   = section.Split('\n')
            .Where(l => l.TrimStart().StartsWith("- Tháng"))
            .Select(l => l.Trim())
            .ToList();

        if (lines.Count == 0)
            return $"Dựa trên dữ liệu:\n{section}{note}";

        var sb = new System.Text.StringBuilder();
        sb.AppendLine(!string.IsNullOrEmpty(period)
            ? $"Số đơn hàng tháng {period}:"
            : "Số đơn hàng:");

        foreach (var l in lines)
            sb.AppendLine(l.TrimStart('-').Trim());

        sb.Append(note);
        return sb.ToString().Trim();
    }

    private static string ExtractSection(string context, string keyword)
    {
        var lines  = context.Split('\n');
        var startI = Array.FindIndex(lines, l => l.Contains(keyword, StringComparison.OrdinalIgnoreCase));
        if (startI < 0) return context.Split('\n').Take(5).Aggregate((a, b) => a + "\n" + b);
        return lines.Skip(startI).Take(6).Aggregate((a, b) => a + "\n" + b).Trim();
    }
}
