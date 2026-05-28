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

    // ── Phân loại ý định câu hỏi (rule-based) ────────────────────────────────
    public static string DetectIntent(string question)
    {
        var q = question.ToLowerInvariant();
        static bool Has(string text, params string[] words) => words.Any(text.Contains);

        // declining trước trending (giảm có "xu hướng giảm", trending có "xu hướng tăng")
        if (Has(q, "giảm", "sụt giảm", "xu hướng giảm", "bán ít hơn", "bán kém", "sụt"))
            return "declining_product";

        if (Has(q, "xu hướng tăng", "đang hot", "trending", "bán tốt gần đây")
            || (Has(q, "xu hướng", "tăng") && Has(q, "sản phẩm", "mặt hàng", "hàng hóa")))
            return "trending_product";

        if (Has(q, "bán chạy", "bán nhiều nhất", "bán tốt nhất", "top sản phẩm", "sản phẩm hot")
            || (Has(q, "sản phẩm nào", "mặt hàng nào") && !Has(q, "xu hướng", "giảm", "nên bán", "nên tập trung")))
            return "top_product";

        if (Has(q, "nên bán", "nên tập trung", "tập trung bán", "gợi ý", "đề xuất", "chiến lược", "nên kinh doanh", "nên làm gì"))
            return "business_recommendation";

        if (Has(q, "so sánh") && Has(q, "kênh"))
            return "channel_comparison";

        if (Has(q, "kênh nào", "kênh bán hàng nào") || (Has(q, "doanh thu") && Has(q, "kênh", "cao nhất")))
            return "top_channel";

        if (Has(q, "shopee", "lazada", "tiktok", "facebook shop") && Has(q, "doanh thu", "bán", "đơn", "so sánh"))
            return "channel_comparison";

        if (Has(q, "doanh thu", "doanh số", "tiền về") && !Has(q, "kênh"))
            return "revenue_summary";

        if (Has(q, "đơn hàng", "số đơn", "bao nhiêu đơn", "đơn bán"))
            return "order_summary";

        if (Has(q, "phản hồi", "đánh giá", "review", "bình luận", "nhận xét", "cảm xúc", "sentiment"))
            return "customer_feedback";

        return "unknown";
    }

    // ── System prompt tập trung theo intent ──────────────────────────────────
    private static string BuildFocusedSystemPrompt(string question, string intent, string context)
    {
        var intentRule = intent switch
        {
            "top_product"             => "Câu trả lời PHẢI bắt đầu bằng tên sản phẩm bán chạy nhất và số lượng đã bán. Không liệt kê doanh thu, đơn hàng, kênh.",
            "declining_product"       => "Nếu context ghi 'KHÔNG ĐỦ DỮ LIỆU', PHẢI trả lời: Hệ thống chưa có đủ dữ liệu theo thời gian để xác định sản phẩm giảm doanh số. Nếu có dữ liệu, liệt kê sản phẩm giảm và % giảm cụ thể.",
            "trending_product"        => "Câu trả lời PHẢI nêu sản phẩm có xu hướng tăng và mức % tăng. Không liệt kê doanh thu hay kênh.",
            "revenue_summary"         => "Câu trả lời CHỈ nói về doanh thu và so sánh kỳ trước. Không đề cập sản phẩm hay kênh.",
            "order_summary"           => "Câu trả lời CHỈ nói về số lượng đơn hàng. Không đề cập doanh thu hay sản phẩm.",
            "top_channel"             => "Câu trả lời PHẢI nêu tên kênh có doanh thu cao nhất và con số cụ thể. Không liệt kê sản phẩm.",
            "channel_comparison"      => "Liệt kê và so sánh CÁC KÊNH theo doanh thu. Không liệt kê sản phẩm.",
            "customer_feedback"       => "Phân tích đúng loại bình luận người dùng hỏi (tiêu cực/tích cực/chung). Trích dẫn nội dung cụ thể từ dữ liệu đã cung cấp.",
            "business_recommendation" => "Đưa GỢI Ý kinh doanh CỤ THỂ dựa trên top sản phẩm và kênh doanh thu cao nhất. Không chỉ tóm tắt dữ liệu.",
            _                         => "Trả lời đúng câu hỏi của người dùng dựa trên dữ liệu có sẵn. Không liệt kê toàn bộ dashboard.",
        };

        return $"""
            Bạn là trợ lý AI phân tích dữ liệu kinh doanh trong hệ thống MSAS.

            QUY TẮC BẮT BUỘC:
            1. Chỉ trả lời dựa trên CONTEXT bên dưới — không bịa số liệu, không suy đoán.
            2. Trả lời trực tiếp đúng câu hỏi, tối đa 3-4 câu, bằng tiếng Việt.
            3. Nếu dữ liệu không đủ, nói rõ: "Hệ thống chưa có đủ dữ liệu để trả lời."
            4. {intentRule}
            5. Tuyệt đối không liệt kê đồng thời doanh thu + đơn hàng + sản phẩm + kênh trừ intent = business_recommendation.

            CÂU HỎI: {question}
            INTENT: {intent}

            CONTEXT:
            {(string.IsNullOrEmpty(context) ? "Chưa có dữ liệu từ hệ thống." : context)}
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

    private async Task<string> BuildContext_Revenue(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = monthStart.AddMonths(-1);
        try
        {
            var rev  = await db.OrderDetails.Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;
            var prev = await db.OrderDetails.Join(db.Orders, od => od.OrderId, o => o.OrderId, (od, o) => new { od, o })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= prevMonthStart && x.o.OrderDate < monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .SumAsync(x => (decimal?)x.od.Subtotal) ?? 0;

            var change = prev > 0
                ? $"{(rev >= prev ? "+" : "")}{(rev - prev) / prev * 100:F1}% so với tháng trước"
                : "(chưa có dữ liệu tháng trước để so sánh)";

            return $"""
                INTENT: revenue_summary | Tháng: {now:MM/yyyy}
                [Doanh thu]
                - Tháng này  : {rev:N0} VND ({change})
                - Tháng trước: {prev:N0} VND
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_Revenue lỗi: {M}", ex.Message); return "Chưa có dữ liệu doanh thu."; }
    }

    private async Task<string> BuildContext_OrderSummary(Guid companyId)
    {
        var now = DateTime.UtcNow;
        var monthStart     = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = monthStart.AddMonths(-1);
        try
        {
            var cnt  = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= monthStart
                                                    && o.Status != "CANCELLED");
            var prev = await db.Orders.CountAsync(o => o.CompanyId == companyId
                                                    && o.OrderDate >= prevMonthStart && o.OrderDate < monthStart
                                                    && o.Status != "CANCELLED");
            var change = prev > 0 ? $"{(cnt >= prev ? "+" : "")}{cnt - prev} đơn so với tháng trước ({prev} đơn)" : "(chưa có dữ liệu tháng trước)";

            return $"""
                INTENT: order_summary | Tháng: {now:MM/yyyy}
                [Đơn hàng]
                - Tháng này  : {cnt} đơn ({change})
                - Tháng trước: {prev} đơn
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
            return result;
        }

        // 1. Detect intent
        var intent   = tab == "feedback" ? "customer_feedback"
                     : tab == "market"   ? "market"
                     : DetectIntent(userMessage);
        result.Intent = intent;

        // 2. Extract keywords để lọc DB
        var keywords = ExtractKeywords(userMessage);

        // 3. Build focused context theo intent
        var context = string.Empty;
        if (companyId.HasValue)
        {
            context = (tab, intent) switch
            {
                ("market",   _)                        => await BuildMarketContext  (companyId.Value, keywords),
                ("feedback", _)                        => await BuildFeedbackContext(companyId.Value, keywords),
                ("business", "top_product")            => await BuildContext_TopProduct           (companyId.Value),
                ("business", "declining_product")      => await BuildContext_DecliningProduct     (companyId.Value),
                ("business", "trending_product")       => await BuildContext_TrendingProduct      (companyId.Value),
                ("business", "revenue_summary")        => await BuildContext_Revenue              (companyId.Value),
                ("business", "order_summary")          => await BuildContext_OrderSummary         (companyId.Value),
                ("business", "top_channel")            => await BuildContext_Channels             (companyId.Value, topOnly: true),
                ("business", "channel_comparison")     => await BuildContext_Channels             (companyId.Value, topOnly: false),
                ("business", "business_recommendation")=> await BuildContext_BusinessRecommendation(companyId.Value),
                _                                      => await BuildBusinessContext              (companyId.Value, keywords),
            };
        }

        // 4. Debug log
        logger.LogInformation(
            "[CHATBOT] user_question={Q} | detected_intent={I} | tab={T} | context_len={L}",
            userMessage[..Math.Min(80, userMessage.Length)], intent, tab, context.Length);

        // 5. Build focused system prompt
        var systemPrompt = BuildFocusedSystemPrompt(userMessage, intent, context);

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
                logger.LogError("Gemini API lỗi {Status}: {Body}", status, body[..Math.Min(300, body.Length)]);

                if (status == 403)
                {
                    result.Answer = "AI chưa được cấp quyền (403). Vui lòng báo quản trị viên kiểm tra API key.";
                    result.IsAiGenerated = false; result.FallbackUsed = true; result.FallbackReason = "Gemini 403";
                    return result;
                }

                logger.LogWarning("Gemini thất bại (HTTP {Status}) — fallback", status);
                // business tab: dùng tier-3 intent-aware trực tiếp (context đã focused theo intent)
                // market/feedback tab: thử FastAPI vì QueryEngine có dữ liệu riêng
                if (tab != "business")
                {
                    var tier2 = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
                    if (tier2 is not null)
                    {
                        result.Answer = tier2; result.FallbackUsed = true; result.FallbackReason = $"Gemini HTTP {status}";
                        return result;
                    }
                }

                var rb = BuildRuleBasedResponse(userMessage, intent, context);
                result.Answer = rb; result.IsAiGenerated = false;
                result.FallbackUsed = true; result.FallbackReason = $"Gemini HTTP {status}, rule-based intent={intent}";
                return result;
            }

            using var doc = JsonDocument.Parse(body);
            var aiText = doc.RootElement
                .GetProperty("candidates")[0].GetProperty("content")
                .GetProperty("parts")[0].GetProperty("text").GetString() ?? "";

            result.Answer = aiText;
            logger.LogInformation("[CHATBOT] final_answer={A}", aiText[..Math.Min(120, aiText.Length)]);
            return result;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Gemini ChatAsync exception — fallback");

            if (tab != "business")
            {
                var tier2 = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
                if (tier2 is not null)
                {
                    result.Answer = tier2; result.FallbackUsed = true; result.FallbackReason = "Gemini exception";
                    return result;
                }
            }

            var rb = BuildRuleBasedResponse(userMessage, intent, context);
            result.Answer = rb; result.IsAiGenerated = false;
            result.FallbackUsed = true; result.FallbackReason = $"Gemini exception, rule-based intent={intent}";
            return result;
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

    // ── Tier 3: Fallback rule-based theo intent ──────────────────────────────

    private static string BuildRuleBasedResponse(string question, string intent, string context)
    {
        var note = "\n\n*(Trả lời tự động — AI đang tạm quá tải)*";

        // Dữ liệu đã có trong context → trích đúng phần liên quan theo intent
        if (!string.IsNullOrWhiteSpace(context))
        {
            return intent switch
            {
                "top_product"       => $"Dựa trên dữ liệu hệ thống:\n{ExtractSection(context, "Sản phẩm bán chạy")}{note}",
                "declining_product" => context.Contains("KHÔNG ĐỦ DỮ LIỆU")
                    ? "Hệ thống chưa có đủ dữ liệu theo thời gian để xác định sản phẩm đang giảm doanh số." + note
                    : $"Dựa trên dữ liệu:\n{ExtractSection(context, "Sản phẩm giảm")}{note}",
                "trending_product"  => context.Contains("KHÔNG ĐỦ DỮ LIỆU")
                    ? "Hệ thống chưa có đủ dữ liệu tháng trước để xác định xu hướng tăng." + note
                    : $"Dựa trên dữ liệu:\n{ExtractSection(context, "xu hướng tăng")}{note}",
                "revenue_summary"   => $"Dựa trên dữ liệu:\n{ExtractSection(context, "Doanh thu")}{note}",
                "order_summary"     => $"Dựa trên dữ liệu:\n{ExtractSection(context, "Đơn hàng")}{note}",
                "top_channel"
                or "channel_comparison" => $"Dựa trên dữ liệu:\n{ExtractSection(context, "Kênh bán hàng")}{note}",
                _ => $"Dựa trên dữ liệu hệ thống:\n{context.Split('\n').Take(8).Aggregate((a, b) => a + "\n" + b)}{note}",
            };
        }

        // Không có context → trả lời chung theo câu hỏi
        var q = question.ToLowerInvariant();
        if (q.Contains("xu hướng") || q.Contains("trend"))
            return "Thương mại điện tử Việt Nam đang tăng trưởng mạnh, đặc biệt TikTok Shop và Shopee. Livestream và video ngắn là xu hướng chủ đạo." + note;
        if (q.Contains("phản hồi") || q.Contains("review") || q.Contains("đánh giá"))
            return "Để tăng đánh giá tốt: phản hồi khách trong 2 giờ, giao hàng đúng hẹn, đóng gói cẩn thận." + note;
        return "AI đang tạm thời quá tải. Vui lòng thử lại sau vài phút hoặc xem Dashboard để tra cứu số liệu." + note;
    }

    private static string ExtractSection(string context, string keyword)
    {
        var lines  = context.Split('\n');
        var startI = Array.FindIndex(lines, l => l.Contains(keyword, StringComparison.OrdinalIgnoreCase));
        if (startI < 0) return context.Split('\n').Take(5).Aggregate((a, b) => a + "\n" + b);
        return lines.Skip(startI).Take(6).Aggregate((a, b) => a + "\n" + b).Trim();
    }
}
