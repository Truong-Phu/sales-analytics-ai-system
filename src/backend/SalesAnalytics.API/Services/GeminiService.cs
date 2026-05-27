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
    private readonly string _apiKey      = cfg["Gemini:ApiKey"] ?? "";
    private readonly string _model       = cfg["Gemini:Model"]  ?? "gemini-2.0-flash";
    private readonly int    _maxTok      = int.TryParse(cfg["Gemini:MaxTokens"], out var t) ? t : 1024;
    private readonly double _temp        = double.TryParse(cfg["Gemini:Temperature"],
                                              System.Globalization.NumberStyles.Any,
                                              System.Globalization.CultureInfo.InvariantCulture,
                                              out var d) ? Math.Clamp(d, 0.0, 2.0) : 0.7;
    private readonly string _aiServiceUrl = cfg["AiService:BaseUrl"] ?? "http://localhost:8001";

    // ── Trích xuất từ khóa đơn giản từ câu hỏi ──────────────────────────────
    // Dùng để lọc DB trước khi build context, tránh nạp toàn bộ dữ liệu
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

            // Lọc bình luận theo keyword câu hỏi (tối đa 20 bình luận liên quan)
            var kwFilter = keywords.Count > 0
                ? "AND (" + string.Join(" OR ", keywords.Select(kw =>
                    $"message ILIKE '%{kw.Replace("'", "''")}%'")) + ")"
                : "";

            // SqlQueryRaw để kwFilter ghép thẳng vào SQL (không bị EF tham số hóa)
            var commentSql = $$"""
                SELECT message,
                       COALESCE(author_name, 'Ẩn danh') AS author_name,
                       COALESCE(sentiment, 'neutral')   AS sentiment,
                       COALESCE(like_count, 0)          AS like_count
                FROM   public.facebook_feedback
                WHERE  (company_id = {0} OR company_id IS NULL)
                  AND  message IS NOT NULL
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

            // Toàn bộ bình luận, nội dung đầy đủ không cắt bớt
            var commentLines = comments.Any()
                ? string.Join("\n", comments.Select(c =>
                    $"  [{c.Sentiment.ToUpper()}] {c.AuthorName}"
                    + (c.LikeCount > 0 ? $" ({c.LikeCount} like)" : "")
                    + $": {c.Message}"))
                : "  (Chưa có bình luận)";

            return $"""
                === DỮ LIỆU PHẢN HỒI KHÁCH HÀNG TỪ FACEBOOK PAGE ===
                Tổng {total} bình luận đã thu thập.

                [Thống kê cảm xúc]
                - Tích cực : {pos} bình luận ({posPct}%)
                - Tiêu cực : {neg} bình luận ({negPct}%)
                - Trung tính: {neu} bình luận ({neuPct}%)

                [Toàn bộ bình luận ({comments.Count} bình luận)]
                {commentLines}

                BẮT BUỘC: Phân tích dựa trên toàn bộ bình luận thực tế ở trên.
                Nêu vấn đề nổi bật (tiêu cực nhiều nhất), điểm được khen (tích cực nhiều nhất),
                và đề xuất hành động cụ thể. Không được tự bịa nội dung ngoài dữ liệu đã cung cấp.
                Trả lời bằng tiếng Việt.
                """;
        }
        catch (Exception ex)
        {
            logger.LogWarning("BuildFeedbackContext lỗi: {Msg}", ex.Message);
            return "Dữ liệu phản hồi Facebook chưa có. Hãy kết nối Facebook Page trong Data Sync.";
        }
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

    // ── Gọi Gemini API với chat history ──────────────────────────────────────

    public async Task<string> ChatAsync(
        Guid?             companyId,
        string            userMessage,
        string            tab,
        List<ChatMessage> history)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
            return "Gemini API key chưa được cấu hình. Vui lòng liên hệ quản trị viên.";

        // Trích xuất từ khóa từ câu hỏi để lọc dữ liệu có liên quan
        var keywords = ExtractKeywords(userMessage);

        // Lấy context có lọc theo từ khóa câu hỏi
        var context = (tab, companyId.HasValue) switch
        {
            ("business", true) => await BuildBusinessContext(companyId!.Value, keywords),
            ("market",   true) => await BuildMarketContext  (companyId!.Value, keywords),
            ("feedback", true) => await BuildFeedbackContext(companyId!.Value, keywords),
            _                  => string.Empty,
        };

        // System prompt: gắn câu hỏi vào prompt để AI trả lời đúng ý, không bị lạc đề
        var roleDesc = tab switch
        {
            "business" => "AI phân tích kinh doanh (doanh thu, đơn hàng, sản phẩm, kênh bán hàng)",
            "market"   => "AI phân tích xu hướng thị trường thương mại điện tử Việt Nam",
            "feedback" => "AI phân tích phản hồi và cảm xúc khách hàng (sentiment analysis)",
            _          => "AI hỗ trợ kinh doanh",
        };
        var systemPrompt = $"""
            Bạn là {roleDesc} cho doanh nghiệp Việt Nam.

            NHIỆM VỤ: Trả lời chính xác câu hỏi sau của người dùng:
            "{userMessage}"

            QUY TẮC BẮT BUỘC:
            1. Trả lời đúng ý câu hỏi, không lạc sang chủ đề khác.
            2. Chỉ dùng dữ liệu thực tế bên dưới — không tự bịa hoặc ước tính số liệu.
            3. Nếu dữ liệu không đủ để trả lời, hãy nói rõ "Hệ thống chưa có dữ liệu về [X]" và gợi ý người dùng xem mục khác hoặc cập nhật dữ liệu.
            4. Câu trả lời ngắn gọn, có cấu trúc rõ ràng, bằng tiếng Việt.

            {(string.IsNullOrEmpty(context) ? "Chưa có dữ liệu từ hệ thống." : context)}
            """;

        // Xây dựng mảng contents (lịch sử chat + tin nhắn mới)
        var contents = new List<object>();
        foreach (var msg in history.TakeLast(10)) // Giới hạn 10 lượt để tránh vượt token
        {
            contents.Add(new
            {
                role  = msg.Role,
                parts = new[] { new { text = msg.Content } },
            });
        }
        contents.Add(new
        {
            role  = "user",
            parts = new[] { new { text = userMessage } },
        });

        var requestBody = new
        {
            system_instruction = new { parts = new[] { new { text = systemPrompt } } },
            contents,
            generationConfig = new
            {
                temperature     = _temp,
                maxOutputTokens = _maxTok,
                candidateCount  = 1,
            },
        };

        var json = JsonSerializer.Serialize(requestBody);
        var url  = $"https://generativelanguage.googleapis.com/v1beta/models/{_model}:generateContent?key={_apiKey}";

        try
        {
            var http    = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(30);

            var httpContent = new StringContent(json, Encoding.UTF8, "application/json");
            var response    = await http.PostAsync(url, httpContent);

            // Retry 1 lần sau 2s nếu 429 (rate limit tạm thời)
            if ((int)response.StatusCode == 429)
            {
                logger.LogWarning("Gemini 429 — retry sau 2s");
                await Task.Delay(2000);
                httpContent = new StringContent(json, Encoding.UTF8, "application/json");
                response    = await http.PostAsync(url, httpContent);
            }

            var body   = await response.Content.ReadAsStringAsync();
            var status = (int)response.StatusCode;

            if (!response.IsSuccessStatusCode)
            {
                logger.LogError("Gemini API lỗi {Status}: {Body}",
                    status, body[..Math.Min(300, body.Length)]);

                // 403 = vấn đề API key/quyền → không fallback AI khác, báo ngay
                if (status == 403)
                    return "🔑 AI chưa được cấp quyền (403). Model hiện tại có thể yêu cầu tài khoản trả phí — vui lòng báo quản trị viên đổi model.";

                // Tier 2: thử FastAPI recommendation
                logger.LogWarning("Gemini thất bại (HTTP {Status}) — thử Tier-2 FastAPI", status);
                var tier2 = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
                if (tier2 is not null) return tier2;

                // Tier 3: rule-based
                logger.LogWarning("Tier-2 cũng thất bại — dùng Tier-3 rule-based");
                return BuildRuleBasedResponse(userMessage, context);
            }

            using var doc = JsonDocument.Parse(body);
            var text = doc.RootElement
                .GetProperty("candidates")[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString() ?? "";

            return text;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Gemini ChatAsync lỗi — thử Tier-2 FastAPI");

            // Tier 2: thử FastAPI recommendation
            var tier2 = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
            if (tier2 is not null) return tier2;

            // Tier 3: rule-based
            return BuildRuleBasedResponse(userMessage, context);
        }
    }

    // ── Tier 2: Gọi FastAPI /recommendation khi Gemini thất bại ─────────────
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

    // ── Tier 3: Fallback rule-based khi cả Gemini lẫn FastAPI thất bại ──────

    private static string BuildRuleBasedResponse(string question, string context)
    {
        var q = question.ToLowerInvariant();

        // Nếu có context từ DB, trích xuất thông tin để trả lời
        if (!string.IsNullOrWhiteSpace(context) && context.Contains("Doanh thu"))
        {
            if (q.Contains("doanh thu") || q.Contains("oanh") || q.Contains("tiền"))
                return $"📊 Dựa trên dữ liệu hệ thống:\n{ExtractLine(context, "Doanh thu")}\n\n*(Trả lời tự động — AI đang tạm quá tải)*";

            if (q.Contains("sản phẩm") || q.Contains("bán chạy") || q.Contains("top"))
                return $"📦 Dựa trên dữ liệu hệ thống:\n{ExtractLine(context, "Top sản phẩm")}\n\n*(Trả lời tự động — AI đang tạm quá tải)*";

            if (q.Contains("kênh") || q.Contains("shopee") || q.Contains("lazada") || q.Contains("tiktok"))
                return $"🛒 Dựa trên dữ liệu hệ thống:\n{ExtractLine(context, "Kênh bán hàng")}\n\n*(Trả lời tự động — AI đang tạm quá tải)*";

            return $"📋 Tóm tắt kinh doanh:\n{context.Replace("Hãy trả lời bằng tiếng Việt, ngắn gọn và thực tế dựa trên dữ liệu trên.", "").Trim()}\n\n*(Trả lời tự động — AI đang tạm quá tải)*";
        }

        // Không có context (tab market, feedback) → trả lời chung
        return q switch
        {
            var x when x.Contains("xu hướng") || x.Contains("trend")
                => "📈 Thương mại điện tử Việt Nam đang tăng trưởng mạnh, đặc biệt các kênh TikTok Shop và Shopee. Livestream bán hàng và video ngắn là xu hướng chủ đạo.\n\n*(AI đang tạm quá tải — câu trả lời sẽ chi tiết hơn khi AI hoạt động lại)*",
            var x when x.Contains("khách hàng") || x.Contains("review") || x.Contains("đánh giá")
                => "⭐ Để tăng tỷ lệ đánh giá 5 sao: phản hồi khách nhanh trong 2 giờ, giao hàng đúng hẹn, đóng gói cẩn thận, và gửi tin nhắn xin review sau khi khách nhận hàng.\n\n*(AI đang tạm quá tải)*",
            _   => "🤖 AI đang tạm thời quá tải (quota Gemini). Vui lòng thử lại sau vài phút. Trong thời gian chờ, bạn có thể xem Dashboard để tra cứu số liệu trực tiếp.",
        };
    }

    private static string ExtractLine(string context, string keyword)
    {
        var line = context.Split('\n')
            .FirstOrDefault(l => l.Contains(keyword));
        return line?.Trim() ?? string.Empty;
    }
}
