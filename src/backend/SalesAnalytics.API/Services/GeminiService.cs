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

        // Lấy context dữ liệu thực tế (chỉ với tab business và có companyId)
        var context = (tab == "business" && companyId.HasValue)
            ? await BuildBusinessContext(companyId.Value)
            : string.Empty;

        // System prompt theo từng tab
        var systemPrompt = tab switch
        {
            "business" => $"Bạn là AI phân tích kinh doanh chuyên nghiệp cho doanh nghiệp Việt Nam. {context}",
            "market"   => "Bạn là AI chuyên phân tích xu hướng thị trường thương mại điện tử Việt Nam. Trả lời bằng tiếng Việt, súc tích và thực tế.",
            "feedback" => "Bạn là AI phân tích phản hồi và cảm xúc khách hàng (sentiment analysis). Trả lời bằng tiếng Việt, có ví dụ cụ thể.",
            _          => $"Bạn là AI hỗ trợ kinh doanh. {context}",
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
