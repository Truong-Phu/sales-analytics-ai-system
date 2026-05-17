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
    private readonly string _apiKey = cfg["Gemini:ApiKey"] ?? "";
    private readonly string _model  = cfg["Gemini:Model"]  ?? "gemini-2.0-flash";
    private readonly int    _maxTok = int.TryParse(cfg["Gemini:MaxTokens"],    out var t) ? t : 1024;
    private readonly double _temp   = double.TryParse(cfg["Gemini:Temperature"],
                                         System.Globalization.NumberStyles.Any,
                                         System.Globalization.CultureInfo.InvariantCulture,
                                         out var d) ? Math.Clamp(d, 0.0, 2.0) : 0.7;

    // ── Build context từ DB theo companyId ───────────────────────────────────

    private async Task<string> BuildBusinessContext(Guid companyId)
    {
        try
        {
            var now        = DateTime.UtcNow;
            var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);

            // Doanh thu tháng hiện tại (tổng subtotal từ order_items join orders)
            var revenue = await db.OrderDetails
                .Join(db.Orders,
                      od => od.OrderId,
                      o  => o.OrderId,
                      (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= monthStart
                         && x.o.Status    != "CANCELLED"
                         && x.o.Status    != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;

            // Top 5 sản phẩm bán chạy theo doanh thu tháng này
            var topProducts = await db.OrderDetails
                .Join(db.Orders,
                      od => od.OrderId,
                      o  => o.OrderId,
                      (od, o) => new { od, o })
                .Join(db.Products,
                      x  => x.od.ProductId,
                      p  => p.ProductId,
                      (x, p) => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= monthStart
                         && x.o.Status    != "CANCELLED")
                .GroupBy(x => x.p.ProductName)
                .OrderByDescending(g => g.Sum(x => x.od.Subtotal))
                .Take(5)
                .Select(g => $"{g.Key}: {g.Sum(x => x.od.Subtotal):N0} VND")
                .ToListAsync();

            // Top kênh bán hàng theo số đơn tháng này
            var channels = await db.Orders
                .Join(db.Channels,
                      o  => o.ChannelId,
                      ch => ch.ChannelId,
                      (o, ch) => new { o, ch })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= monthStart)
                .GroupBy(x => x.ch.ChannelName)
                .OrderByDescending(g => g.Count())
                .Take(4)
                .Select(g => $"{g.Key}: {g.Count()} đơn")
                .ToListAsync();

            return $"""
                Dữ liệu kinh doanh thực tế tháng {now:MM/yyyy}:
                - Doanh thu tháng này: {revenue:N0} VND
                - Top sản phẩm bán chạy: {(topProducts.Any() ? string.Join(", ", topProducts) : "Chưa có dữ liệu")}
                - Kênh bán hàng: {(channels.Any() ? string.Join(", ", channels) : "Chưa có dữ liệu")}
                Hãy trả lời bằng tiếng Việt, ngắn gọn và thực tế dựa trên dữ liệu trên.
                """;
        }
        catch (Exception ex)
        {
            logger.LogWarning("BuildBusinessContext lỗi: {Msg}", ex.Message);
            return "Dữ liệu kinh doanh hiện chưa có. Hãy trả lời câu hỏi một cách chung chung.";
        }
    }

    // ── Build context xu hướng thị trường từ raw_google_data ────────────────

    private async Task<string> BuildMarketContext(Guid companyId)
    {
        try
        {
            // Toàn bộ keywords + số lần xuất hiện + số URL duy nhất (không giới hạn)
            var trends = await db.Database
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
                    """)
                .ToListAsync();

            // Toàn bộ nội dung thu thập: title, snippet, product_name, domain (không giới hạn)
            var items = await db.Database
                .SqlQuery<PageItemRow>($"""
                    SELECT keyword,
                           title,
                           COALESCE(snippet, trend_description) AS snippet,
                           source_domain,
                           product_name
                    FROM   public.raw_google_data
                    WHERE  scraped_at >= NOW() - INTERVAL '30 days'
                      AND  (company_id = {companyId} OR company_id IS NULL)
                      AND  (title IS NOT NULL OR snippet IS NOT NULL OR trend_description IS NOT NULL)
                    ORDER  BY scraped_at DESC
                    """)
                .ToListAsync();

            var totalResult = await db.Database
                .SqlQuery<CountRow>($"""
                    SELECT CAST(COUNT(*) AS INTEGER) AS total
                    FROM   public.raw_google_data
                    WHERE  scraped_at >= NOW() - INTERVAL '30 days'
                      AND  (company_id = {companyId} OR company_id IS NULL)
                    """)
                .FirstOrDefaultAsync();

            if (!trends.Any())
                return "Chưa có dữ liệu xu hướng thị trường. Hãy chạy Google Scraper trong Data Sync để thu thập dữ liệu.";

            var total = totalResult?.Total ?? 0;

            // Phần 1: danh sách keywords
            var kwLines = string.Join("\n", trends.Select((t, i) =>
                $"  {i + 1}. \"{t.Keyword}\" — {t.HitCount} lần xuất hiện, {t.UrlCount} URL duy nhất"));

            // Phần 2: toàn bộ nội dung thu thập
            var itemLines = string.Join("\n", items.Select(it =>
            {
                var parts = new List<string> { $"KW: \"{it.Keyword}\"" };
                if (!string.IsNullOrWhiteSpace(it.SourceDomain)) parts.Add($"Trang: {it.SourceDomain}");
                if (!string.IsNullOrWhiteSpace(it.ProductName))  parts.Add($"SP: {it.ProductName}");
                if (!string.IsNullOrWhiteSpace(it.Title))        parts.Add($"Tiêu đề: {it.Title}");
                if (!string.IsNullOrWhiteSpace(it.Snippet))      parts.Add($"Mô tả: {it.Snippet}");
                return "  • " + string.Join(" | ", parts);
            }));

            return $"""
                === DỮ LIỆU XU HƯỚNG THỊ TRƯỜNG ===
                Thu thập từ Google Search trong 30 ngày qua — tổng {total} URL từ {trends.Count} từ khóa.

                [Từ khóa xu hướng ({trends.Count} từ khóa)]
                {kwLines}

                [Toàn bộ nội dung thu thập được ({items.Count} bản ghi)]
                {(itemLines.Length > 0 ? itemLines : "  (Chưa có nội dung)")}

                BẮT BUỘC: Chỉ phân tích và trả lời dựa trên dữ liệu thực tế ở trên.
                Không được tự bịa số liệu hay xu hướng ngoài dữ liệu đã cung cấp.
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

    private async Task<string> BuildFeedbackContext(Guid companyId)
    {
        try
        {
            // Thống kê sentiment tổng hợp
            var sentiments = await db.Database
                .SqlQuery<SentimentRow>($"""
                    SELECT sentiment,
                           CAST(COUNT(*) AS INTEGER) AS cnt
                    FROM   public.facebook_feedback
                    WHERE  (company_id = {companyId} OR company_id IS NULL)
                    GROUP  BY sentiment
                    """)
                .ToListAsync();

            // Toàn bộ bình luận — không giới hạn, nội dung đầy đủ
            var comments = await db.Database
                .SqlQuery<CommentRow>($"""
                    SELECT message,
                           COALESCE(author_name, 'Ẩn danh') AS author_name,
                           COALESCE(sentiment, 'neutral')   AS sentiment,
                           COALESCE(like_count, 0)          AS like_count
                    FROM   public.facebook_feedback
                    WHERE  (company_id = {companyId} OR company_id IS NULL)
                      AND  message IS NOT NULL
                    ORDER  BY scraped_at DESC NULLS LAST
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

        // Lấy context dữ liệu thực tế từ DB theo từng tab
        var context = (tab, companyId.HasValue) switch
        {
            ("business", true) => await BuildBusinessContext(companyId!.Value),
            ("market",   true) => await BuildMarketContext  (companyId!.Value),
            ("feedback", true) => await BuildFeedbackContext(companyId!.Value),
            _                  => string.Empty,
        };

        // System prompt: mỗi tab có vai trò AI riêng + context dữ liệu thực
        var systemPrompt = tab switch
        {
            "business" => $"Bạn là AI phân tích kinh doanh chuyên nghiệp cho doanh nghiệp Việt Nam. BẮT BUỘC chỉ trả lời dựa trên dữ liệu sau, không tự bịa số liệu. {context}",
            "market"   => $"Bạn là AI chuyên phân tích xu hướng thị trường thương mại điện tử Việt Nam. BẮT BUỘC chỉ phân tích dựa trên dữ liệu sau, không tự bịa số liệu. {context}",
            "feedback" => $"Bạn là AI phân tích phản hồi và cảm xúc khách hàng (sentiment analysis). BẮT BUỘC chỉ phân tích dựa trên dữ liệu sau, không tự bịa số liệu. {context}",
            _          => $"Bạn là AI hỗ trợ kinh doanh cho doanh nghiệp Việt Nam. {context}",
        };

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

                return status switch
                {
                    429 => BuildRuleBasedResponse(userMessage, context), // quota → fallback DB
                    403 => "🔑 AI chưa được cấp quyền (403). Model hiện tại có thể yêu cầu tài khoản trả phí — vui lòng báo quản trị viên đổi model.",
                    _   => BuildRuleBasedResponse(userMessage, context),
                };
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
            logger.LogError(ex, "Gemini ChatAsync lỗi");
            return BuildRuleBasedResponse(userMessage, context);
        }
    }

    // ── Fallback rule-based khi Gemini không khả dụng ────────────────────────

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
