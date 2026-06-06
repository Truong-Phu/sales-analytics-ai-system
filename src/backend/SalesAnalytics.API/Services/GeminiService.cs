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
    private readonly string _model        = cfg["Gemini:Model"]    ?? "gemini-2.5-flash-preview-05-20";
    private readonly int    _maxTok       = int.TryParse(cfg["Gemini:MaxTokens"], out var t) ? t : 1024;
    private readonly double _temp         = double.TryParse(cfg["Gemini:Temperature"],
                                               System.Globalization.NumberStyles.Any,
                                               System.Globalization.CultureInfo.InvariantCulture,
                                               out var d) ? Math.Clamp(d, 0.0, 2.0) : 0.7;
    private readonly string _aiServiceUrl = cfg["AiService:BaseUrl"] ?? "http://localhost:8001";
    // Groq free-tier fallback (https://console.groq.com — 14,400 req/ngày miễn phí)
    private readonly string _groqApiKey   = cfg["Groq:ApiKey"]     ?? "";
    private readonly string _groqModel    = cfg["Groq:Model"]      ?? "llama-3.3-70b-versatile";
    // Danh sách Gemini model fallback theo thứ tự ưu tiên (429 → thử model tiếp theo)
    private static readonly string[] GeminiFallbackModels =
    [
        "gemini-2.5-flash-preview-05-20",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
    ];

    // Cooldown: sau khi nhận 429, skip toàn bộ Gemini trong _geminiCooldownSecs giây
    // Tránh tốn quota khi biết chắc đang bị rate-limit
    private static DateTime _geminiQuotaExhaustedUntil = DateTime.MinValue;
    private const int _geminiCooldownSecs = 90;

    // ── Danh sách intent hợp lệ cho business tab ─────────────────────────────
    private static readonly string[] BusinessIntents =
    [
        "top_product", "declining_product", "trending_product",
        "revenue_summary", "order_summary",
        "top_channel", "channel_comparison",
        "customer_overview", "inventory_alert",
        "business_recommendation", "performance_overview",
        "employee_performance",
        "return_analysis", "payment_analysis",
        "discount_analysis", "shipping_status",
        "unknown",
    ];

    // ── Phát hiện câu hỏi phân tích chéo nhiều nguồn dữ liệu ────────────────
    // Trả true khi câu hỏi đề cập dữ liệu nội bộ VÀ ít nhất một nguồn ngoài (Facebook/thị trường).
    private static bool IsCrossAnalysis(string question)
    {
        var q  = question.ToLowerInvariant();
        var qn = NormalizeVi(q);
        bool Has(params string[] words) => words.Any(w => q.Contains(w) || qn.Contains(NormalizeVi(w)));

        var hasInternal = Has("doanh thu", "bán chậm", "bán kém", "sản phẩm", "đơn hàng", "giảm", "tăng");
        var hasFacebook = Has("facebook", "phàn nàn", "khách chê", "bình luận", "phản hồi", "sentiment", "khách hàng chê");
        var hasMarket   = Has("đối thủ", "thị trường", "giá đối thủ", "google", "sàn", "xu hướng thị trường");

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

    // ── Chuẩn hóa tiếng Việt → ASCII (hỗ trợ gõ không dấu, sai chính tả) ──────
    // Cho phép người dùng gõ "san pham ban chay" thay vì "sản phẩm bán chạy"
    private static readonly (string Vi, string Ascii)[] ViAsciiMap =
    [
        ("ắặằẳẵấầẩẫậăâàáãảạ","a"), ("đ","d"),
        ("ếệềểễêèéẻẽẹ","e"),
        ("ịỉĩîìí","i"),
        ("ốộồổỗôòóõỏọơớợờởỡ","o"),
        ("ứựừửữưùúũủụ","u"),
        ("ỳỷỹỵý","y"),
    ];
    public static string NormalizeVi(string text)
    {
        var sb = new System.Text.StringBuilder(text.Length);
        foreach (char c in text)
        {
            var found = false;
            foreach (var (vi, ascii) in ViAsciiMap)
                if (vi.Contains(c)) { sb.Append(ascii); found = true; break; }
            if (!found) sb.Append(c);
        }
        return sb.ToString();
    }

    // ── Phân loại ý định câu hỏi (rule-based fast path) ─────────────────────
    // Xử lý ~95% câu hỏi nghiệp vụ thường gặp không cần gọi API phân loại.
    // Nếu trả về "unknown" → gọi ClassifyIntentWithGeminiAsync() để phân loại chính xác.
    public static string DetectIntent(string question)
    {
        var q  = question.ToLowerInvariant();
        var qn = NormalizeVi(q); // bản không dấu để match câu gõ không dấu

        // Match keyword CÓ DẤU (q) HOẶC KHÔNG DẤU (qn) — hỗ trợ cả hai cách gõ
        bool Has(params string[] words) =>
            words.Any(w => q.Contains(w) || qn.Contains(NormalizeVi(w)));

        // ── INVENTORY / NHẬP HÀNG — kiểm tra ĐẦU TIÊN vì overlap nhiều intent khác ──
        // Bao phủ: tồn kho, nhập hàng, đặt hàng, bổ sung kho, kế hoạch nhập
        if (Has("tồn kho", "hết hàng", "sắp hết", "hàng còn", "còn bao nhiêu hàng",
                   "kho còn", "stock còn", "hàng tồn"))
            return "inventory_alert";
        if (Has("nhập hàng", "nhập thêm", "nhập gấp", "nhập gì", "nên nhập",
                   "cần nhập", "thiếu hàng", "nhập bao nhiêu"))
            return "inventory_alert";
        if (Has("đặt hàng", "đặt thêm", "đặt gì", "order thêm", "order gì", "order gấp",
                   "đặt hàng nhà cung cấp", "đặt hàng ncc", "đặt hàng supplier"))
            return "inventory_alert";
        if (Has("mua thêm hàng", "mua thêm gì", "bổ sung kho", "bổ sung hàng", "bổ sung gì",
                   "cần bổ sung", "nên bổ sung", "dự trữ hàng", "kế hoạch nhập", "lên kế hoạch nhập"))
            return "inventory_alert";
        if (Has("tháng tới nhập", "tháng sau nhập", "tuần tới nhập", "tuần sau nhập",
                   "tháng tới nên nhập", "tháng tới cần nhập", "tháng tới đặt",
                   // Seasonal — mùa lễ / sự kiện
                   "tết nhập", "chuẩn bị tết", "mùa tết", "trước tết nhập",
                   "black friday nhập", "11/11", "12/12", "mùa hè nhập", "mùa đông nhập",
                   "cuối năm nhập", "đầu năm nhập", "mùa lễ"))
            return "inventory_alert";
        if (Has("hàng nào bán nhanh", "sản phẩm nào bán nhanh", "hàng nào rotation",
                   "mặt hàng nào cần nhập", "sản phẩm nào cần nhập", "hàng nào thiếu",
                   "sản phẩm nào thiếu", "mặt hàng nào thiếu"))
            return "inventory_alert";
        // "stock", "kho" đứng sau check cụ thể hơn để tránh nhầm
        if (Has("stock", "kho hàng") && Has("còn", "hết", "thiếu", "bao nhiêu", "thấp"))
            return "inventory_alert";

        // ── NHÂN VIÊN — kiểm tra TRƯỚC order_summary vì "bán nhiều nhất" dễ nhầm ──
        if (Has("nhân viên", "nhân viên nào", "staff", "kpi nhân viên", "hiệu suất nhân viên",
                   "nhân viên bán", "top nhân viên", "nhân viên đạt", "sales team",
                   "ai bán được", "ai xử lý", "người bán",
                   "bán được nhiều nhất tháng", "bán nhiều nhất trong",
                   "nhân viên nào giỏi", "nhân viên xuất sắc", "nhân viên kém"))
            return "employee_performance";

        // ── KHÁCH HÀNG ──────────────────────────────────────────────────────────
        if (Has("khách hàng", "khách vip", "khách mới", "khách trung thành",
                   "rfm", "loyalty", "khách quay lại", "tỷ lệ quay lại",
                   "khách cũ", "phân khúc khách", "khách hàng tiềm năng",
                   "khách hàng thân thiết", "khách mua lại", "customer",
                   "khách chưa mua", "khách lâu không mua", "khách bỏ", "khách mất",
                   "tỷ lệ chuyển đổi", "conversion rate", "khách chốt đơn"))
            return "customer_overview";

        // ── SẢN PHẨM GIẢM / BÁN CHẬM — declining TRƯỚC trending ──────────────
        if (Has("sụt giảm", "xu hướng giảm", "bán ít hơn", "bán kém", "sụt",
                   "ít đơn hơn", "giảm doanh số", "giảm bán", "bán kém hơn",
                   "bán ế", "bán chậm lại", "doanh số đi xuống", "hàng chậm",
                   "bán chậm nhất", "bán ít nhất", "worst seller", "bán dở nhất",
                   "hàng ế", "hàng tồn lâu", "hàng không bán được")
            || (Has("giảm") && Has("sản phẩm", "mặt hàng", "hàng hóa", "sp nào")))
            return "declining_product";

        // ── SẢN PHẨM TĂNG / TRENDING ────────────────────────────────────────────
        if (Has("xu hướng tăng", "đang hot", "trending", "bán tốt gần đây",
                   "tăng doanh số", "đang nổi", "đang bán chạy lên", "bán tốt hơn",
                   "hàng nào đang nổi", "sản phẩm nào đang lên")
            || (Has("xu hướng", "tăng") && Has("sản phẩm", "mặt hàng")))
            return "trending_product";

        // ── TOP SẢN PHẨM BÁN CHẠY ───────────────────────────────────────────────
        if (Has("bán chạy", "bán nhiều nhất", "bán tốt nhất", "top sản phẩm",
                   "sản phẩm hot", "sản phẩm tốt nhất", "hàng bán chạy",
                   "bestseller", "best seller", "sản phẩm nổi bật", "hàng hot",
                   "sản phẩm được mua nhiều")
            || (Has("sản phẩm nào", "mặt hàng nào")
                && !Has("xu hướng", "giảm", "nên bán", "nên nhập", "cần nhập", "tháng tới")))
            return "top_product";

        // ── GỢI Ý CHIẾN LƯỢC KINH DOANH ─────────────────────────────────────────
        if (Has("nên bán", "nên tập trung bán", "tập trung bán", "nên kinh doanh",
                   "gợi ý kinh doanh", "tư vấn kinh doanh", "đề xuất kinh doanh",
                   "nên đầu tư", "cơ hội kinh doanh", "tìm cơ hội",
                   "kế hoạch kinh doanh", "kế hoạch tháng tới", "kế hoạch tháng sau",
                   "mở rộng thế nào", "phát triển kinh doanh thế nào",
                   "nên đẩy mạnh gì", "nên tập trung mặt hàng", "tháng tới nên bán gì",
                   "tháng sau nên bán gì", "nên giảm giá sản phẩm nào",
                   "nên chạy campaign", "nên marketing gì", "chiến lược tháng"))
            return "business_recommendation";
        if (Has("chiến lược") && Has("bán hàng", "kinh doanh", "sản phẩm", "kênh"))
            return "business_recommendation";
        if (Has("nên tập trung") && Has("sản phẩm", "mặt hàng", "kênh", "hàng hóa"))
            return "business_recommendation";
        if (Has("làm thế nào để tăng", "cách tăng doanh thu", "cách tăng lợi nhuận",
                   "cải thiện doanh thu", "cải thiện kinh doanh", "nên làm gì để tăng"))
            return "business_recommendation";
        // Seasonal business planning
        if (Has("chuẩn bị tết nên bán", "tết nên kinh doanh", "mùa tết nên",
                   "black friday nên", "cuối năm nên bán", "đầu năm nên bán",
                   "dịp lễ nên", "mùa hè nên bán", "chương trình tết"))
            return "business_recommendation";
        // Quảng cáo / livestream / KOL (câu hỏi về hiệu quả marketing → cần cross-data → dùng business_recommendation)
        if (Has("quảng cáo có hiệu quả", "ads hiệu quả", "chạy ads", "chạy quảng cáo",
                   "livestream bán", "live stream", "kol", "influencer",
                   "roas", "acos", "chi phí marketing"))
            return "business_recommendation";

        // ── SO SÁNH KÊNH / KÊNH ĐƠN LẺ ─────────────────────────────────────────
        if ((Has("so sánh") && Has("kênh"))
            || (Has("shopee", "lazada", "tiktok", "facebook shop", "tiktok shop") && Has("so sánh")))
            return "channel_comparison";

        if (Has("kênh nào tốt", "kênh nào doanh thu", "kênh bán hàng nào",
                   "kênh hiệu quả nhất", "kênh dẫn đầu", "kênh bán tốt nhất")
            || (Has("doanh thu") && Has("kênh") && Has("cao nhất", "tốt nhất", "hiệu quả nhất")))
            return "top_channel";

        if (Has("shopee", "lazada", "tiktok", "tiktok shop", "facebook shop")
            && Has("doanh thu", "bán", "đơn", "hiệu quả", "ra sao", "thế nào"))
            return "channel_comparison";

        // ── TỔNG QUAN HIỆU QUẢ KINH DOANH — kiểm tra TRƯỚC revenue để tránh nhầm ──
        // "lợi nhuận" / "tại sao" / từ khoá tổng quan đứng TRƯỚC để tránh nhầm thành revenue_summary
        if (Has("lợi nhuận", "biên lợi nhuận", "margin", "gross margin",
                   "lãi", "lãi ròng", "lãi gộp", "net profit", "profit"))
            return "performance_overview"; // chatbot không có P&L riêng → dùng overview + giải thích

        if (Has("tại sao doanh thu", "vì sao doanh thu", "nguyên nhân doanh thu",
                   "lý do doanh thu", "tại sao bán", "vì sao bán"))
            return "performance_overview"; // câu hỏi nhân quả → cần full context

        // ── SO SÁNH THỜI GIAN (follow-up) → revenue_summary ─────────────────────
        // "so sánh với tháng 5 2025", "so với năm ngoái", "so với quý 1"
        if ((q.StartsWith("so sánh với")     || qn.StartsWith("so sanh voi")
             || q.StartsWith("so với tháng") || qn.StartsWith("so voi thang")
             || q.StartsWith("so với năm")   || qn.StartsWith("so voi nam")
             || q.StartsWith("so với quý")   || qn.StartsWith("so voi quy"))
            && !Has("kênh", "sản phẩm", "mặt hàng", "nhân viên"))
            return "revenue_summary";

        // ── DOANH THU ────────────────────────────────────────────────────────────
        if (Has("doanh thu", "doanh số", "tiền về", "bán được bao nhiêu tiền",
                   "thu về bao nhiêu", "thu được bao nhiêu", "bán thu về",
                   "doanh thu hôm nay", "doanh thu hôm qua", "doanh thu tuần",
                   "doanh thu tháng", "doanh thu năm", "doanh thu quý", "tổng doanh thu",
                   // English keywords
                   "sales", "revenue", "bán hàng được bao nhiêu")
            && !Has("kênh", "so sánh kênh"))
            return "revenue_summary";

        // ── SỐ ĐƠN HÀNG ─────────────────────────────────────────────────────────
        if (Has("đơn hàng", "số đơn", "bao nhiêu đơn", "đơn bán",
                   "tổng đơn", "đơn hàng hôm nay", "đơn hàng hôm qua",
                   "đơn hàng tuần", "đơn hàng tháng", "đơn hàng năm", "đơn hàng quý",
                   "đặt bao nhiêu đơn",
                   // English
                   "orders", "order count", "số order", "order tháng này")
            || (Has("bán được") && !Has("tiền", "doanh thu") && !Has("nhân viên", "người")))
            return "order_summary";

        // ── PHẢN HỒI / SENTIMENT ─────────────────────────────────────────────────
        if (Has("phản hồi", "đánh giá khách", "review", "bình luận", "nhận xét",
                   "cảm xúc khách", "sentiment", "khách khen", "khách chê",
                   "khách phàn nàn", "ý kiến khách hàng", "phản ánh"))
            return "customer_feedback";

        // ── HOÀN HÀNG / HỦY ĐƠN ─────────────────────────────────────────────────
        if (Has("hoàn hàng", "đơn bị hủy", "tỷ lệ hủy", "hủy đơn", "đơn trả",
                   "hoàn tiền", "return", "cancelled", "tỷ lệ hoàn",
                   "bao nhiêu đơn hủy", "bao nhiêu đơn hoàn", "đơn nào bị hủy",
                   "lý do hủy", "lý do hoàn", "đơn hoàn hàng"))
            return "return_analysis";

        // ── THANH TOÁN ───────────────────────────────────────────────────────────
        if (Has("thanh toán", "phương thức thanh toán", "cod", "chuyển khoản",
                   "ví điện tử", "momo", "vnpay", "zalopay", "payment",
                   "trả tiền", "thanh toán online", "thanh toán tiền mặt",
                   "thanh toán qr", "vietqr", "tỷ lệ thanh toán"))
            return "payment_analysis";

        // ── GIẢM GIÁ / VOUCHER ───────────────────────────────────────────────────
        if (Has("giảm giá", "voucher", "mã giảm", "khuyến mãi", "discount",
                   "coupon", "chiết khấu", "tiết kiệm", "giá ưu đãi",
                   "chương trình giảm", "flashsale", "flash sale", "sale off",
                   "ưu đãi", "mã coupon", "giảm bao nhiêu"))
            return "discount_analysis";

        // ── VẬN CHUYỂN / GIAO HÀNG ──────────────────────────────────────────────
        if (Has("vận chuyển", "giao hàng", "shipping", "giao thành công",
                   "giao thất bại", "đang giao", "chờ giao", "tình trạng vận chuyển",
                   "shipper", "ghn", "ghtk", "bao lâu giao", "tracking",
                   "giao chậm", "giao nhanh", "tốc độ giao", "tình trạng đơn giao"))
            return "shipping_status";

        // ── TỔNG QUAN HIỆU QUẢ KINH DOANH ──────────────────────────────────────
        if (Has("tình hình", "tổng quan", "kinh doanh thế nào", "kinh doanh ra sao",
                   "kết quả kinh doanh", "tình hình kinh doanh", "hoạt động kinh doanh",
                   "báo cáo", "tóm tắt", "overview", "summary", "dashboard",
                   "hôm nay thế nào", "hôm qua thế nào", "tuần này thế nào",
                   "tháng này thế nào", "tháng này ra sao", "hôm nay ra sao",
                   "kpi tháng này", "kpi tuần này", "kpi hôm nay",
                   // "doanh thu và đơn" → mixed intent → performance_overview có cả hai
                   "doanh thu và đơn", "đơn và doanh thu", "doanh thu cùng số đơn"))
            return "performance_overview";
        if (Has("tháng này", "tuần này", "hôm nay", "hôm qua")
            && !Has("doanh thu", "đơn", "sản phẩm", "kênh", "nhân viên"))
            return "performance_overview";

        return "unknown"; // → sẽ được Gemini phân loại tiếp
    }

    // ── Phân loại intent bằng Gemini khi rule-based không nhận ra ────────────
    // Dùng prompt ngắn, maxTokens=15, temperature=0 → fast (<500ms), giá rẻ.
    private async Task<string> ClassifyIntentWithGeminiAsync(string question)
    {
        if (string.IsNullOrWhiteSpace(_apiKey)) return "performance_overview";
        // Respect cooldown — không gọi khi quota đang bị exhausted
        if (DateTime.UtcNow < _geminiQuotaExhaustedUntil) return "performance_overview";
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
                - return_analysis: hoàn hàng, đơn hủy, tỷ lệ hủy, hoàn tiền
                - payment_analysis: phương thức thanh toán, COD, chuyển khoản, ví điện tử, tỷ lệ thanh toán
                - discount_analysis: giảm giá, voucher, mã giảm giá, khuyến mãi
                - shipping_status: vận chuyển, giao hàng, tình trạng giao, giao thành công/thất bại
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
            "customer_feedback"       => "Phân tích tổng quan cảm xúc: tỷ lệ tích cực/tiêu cực, vấn đề nổi bật nhất, điểm được khen nhiều nhất. Trích dẫn 2-3 bình luận tiêu biểu từ dữ liệu.",
            "feedback_overview"       => "Nêu tỷ lệ tích cực/tiêu cực/trung tính, vấn đề nổi bật nhất từ tiêu cực, điểm được khen nhiều nhất từ tích cực. Trích dẫn 2-3 bình luận tiêu biểu.",
            "feedback_negative"       => "Tập trung HOÀN TOÀN vào bình luận tiêu cực. Nhóm vấn đề theo chủ đề (giao hàng, chất lượng, giá...). Trích dẫn bình luận cụ thể. Kết thúc bằng: vấn đề nào nghiêm trọng nhất cần xử lý ngay.",
            "feedback_positive"       => "Tập trung HOÀN TOÀN vào bình luận tích cực. Nêu điểm mạnh được khen nhiều nhất, trích dẫn 2-3 bình luận tiêu biểu. Gợi ý: điểm mạnh nào có thể đẩy mạnh marketing.",
            "feedback_improvement"    => "Từ bình luận tiêu cực và đề xuất trong data, tổng hợp top 3-5 điều cần cải thiện cụ thể, actionable. Xếp theo mức độ được nhắc nhiều nhất.",
            "feedback_shipping"       => "Chỉ phân tích bình luận liên quan đến giao hàng/vận chuyển. Nêu tỷ lệ hài lòng/không hài lòng về giao hàng, vấn đề chính (trễ/sai/hỏng), trích dẫn cụ thể.",
            "feedback_product_quality"=> "Chỉ phân tích bình luận về chất lượng sản phẩm. Nêu điểm được khen (chất liệu, mẫu mã, đúng mô tả) và điểm bị chê. Gợi ý cải thiện sản phẩm.",
            "feedback_price"          => "Chỉ phân tích bình luận về giá/chi phí/khuyến mãi. Nêu cảm nhận về giá (hợp lý/đắt/rẻ), hiệu quả voucher/discount theo nhận xét khách.",
            "feedback_service"        => "Chỉ phân tích bình luận về dịch vụ/tư vấn/hỗ trợ. Nêu điểm được khen và chê về thái độ nhân viên, tốc độ phản hồi, chăm sóc khách hàng.",
            "business_recommendation" => "Đưa GỢI Ý kinh doanh cụ thể, hành động được (actionable) dựa trên top sản phẩm và kênh hiệu quả nhất trong dữ liệu. Không chỉ tóm tắt số liệu.",
            "customer_overview"       => "Nêu số KH mới, top KH chi tiêu cao, phân khúc RFM nếu có. Không đề cập doanh thu hay sản phẩm cụ thể.",
            "inventory_alert"         => "Đọc kỹ CONTEXT rồi trả lời. Nếu có sản phẩm 🔴/🟡: liệt kê theo thứ tự ưu tiên, nêu tốc độ bán, ngày còn hàng, gợi ý số lượng nhập. Nếu CONTEXT ghi 'Không có sản phẩm cần nhập gấp' hoặc tất cả đều 🟢: trả lời 'Tồn kho đang ổn định, không cần nhập gấp.' rồi liệt kê top sản phẩm bán chạy nhất kèm số ngày tồn kho còn lại từ CONTEXT. Sản phẩm tăng trưởng → gợi ý nhập thêm 20-25%. Không được nói 'không có dữ liệu' nếu CONTEXT có danh sách top sản phẩm.",
            "performance_overview"    => "Tóm tắt theo thứ tự: doanh thu → đơn hàng → sản phẩm nổi bật → kênh dẫn đầu. Mỗi mục 1 câu. "
                                       + "Nếu doanh thu = 0 hoặc đơn hàng = 0: hãy nêu thực tế đó và giải thích có thể do đầu tháng chưa có đơn, hoặc dữ liệu chưa đồng bộ — KHÔNG nói 'không có dữ liệu'. "
                                       + "Nếu người dùng hỏi về 'lợi nhuận/margin': giải thích chatbot chỉ có dữ liệu doanh thu thuần, "
                                       + "lợi nhuận xem tại trang Tài chính → Báo cáo lợi nhuận. "
                                       + "Nếu hỏi 'tại sao doanh thu tăng/giảm': phân tích nguyên nhân có thể dựa trên kênh, sản phẩm, "
                                       + "xu hướng trong dữ liệu có sẵn — gợi ý xem thêm tab Phân bổ và Bất thường để điều tra sâu.",
            "market"                  => "Tổng quan xu hướng thị trường: liệt kê top từ khóa theo tần suất, nội dung nổi bật nhất. Nếu không đủ dữ liệu: nhắc chạy Google Scraper trong Data Sync.",
            "market_overview"         => "Tổng quan xu hướng: top 5 từ khóa theo tần suất, 2-3 xu hướng nổi bật từ nội dung thu thập. Ngắn gọn, mỗi trend 1 câu.",
            "market_keyword"          => "Liệt kê top từ khóa được tìm kiếm nhiều nhất theo tần suất giảm dần, nêu lý do có thể vì sao từ khóa đó hot.",
            "market_competitor"       => "Từ data thu thập, nêu domain/cửa hàng/thương hiệu nào đang được nhắc nhiều. Phân tích sản phẩm/giá/chiến lược họ đang tập trung. Gợi ý hướng cạnh tranh.",
            "market_opportunity"      => "Kết hợp từ khóa hot + nội dung thu thập → gợi ý 2-3 cơ hội kinh doanh cụ thể: sản phẩm/thị trường/phân khúc tiềm năng. Ưu tiên cơ hội liên quan đến ngành của doanh nghiệp.",
            "market_product"          => "Tìm trong context tất cả mention về sản phẩm/ngành được hỏi. Nêu tần suất, cảm nhận chung (positive/neutral/negative từ snippet), và xu hướng.",
            "market_consumer_trend"   => "Phân tích xu hướng hành vi người tiêu dùng từ dữ liệu Google: người dùng đang tìm kiếm gì, mua gì, quan tâm điều gì. Gợi ý điều chỉnh chiến lược bán hàng.",
            "cross_analysis"          => "Phân tích mối liên hệ giữa dữ liệu nội bộ và dữ liệu ngoài. Nêu rõ nếu thiếu dữ liệu từ bất kỳ nguồn nào.",
            "employee_performance"    => "Xếp hạng nhân viên theo doanh thu POS. Nêu rõ top 3-5 nhân viên và % đóng góp. Nhắc rõ chỉ tính đơn POS, không tính đơn online sàn.",
            "return_analysis"         => "Nêu số đơn hủy/hoàn, tỷ lệ %, và kênh có tỷ lệ hủy cao nhất. Tuyệt đối không liệt kê doanh thu hay sản phẩm vào đây.",
            "payment_analysis"        => "Liệt kê phân bố phương thức thanh toán (COD, chuyển khoản, ví...) theo số đơn và %. Không đề cập sản phẩm hay kênh.",
            "discount_analysis"       => "Nêu tổng giá trị giảm giá/voucher đã áp dụng, % so doanh thu, số đơn có voucher. Không liệt kê thông tin khác.",
            "shipping_status"         => "Tóm tắt tình trạng giao hàng: đang giao/giao thành công/thất bại theo số lượng và %. Không liệt kê doanh thu hay sản phẩm.",
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
            3. Nếu CONTEXT chỉ ghi "Chưa có dữ liệu từ hệ thống." hoặc hoàn toàn trống → trả lời: "Hệ thống chưa có dữ liệu. Vui lòng kiểm tra kết nối nguồn dữ liệu trong Data Sync." Nếu CONTEXT có bất kỳ số liệu nào (dù 0, dù ít) → hãy phân tích và trả lời từ dữ liệu đó, không được từ chối.
            4. Trả lời ngắn gọn, đúng trọng tâm, tối đa 5 câu, bằng tiếng Việt.
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
            - Câu hỏi đơn giản (số liệu, 1 chỉ tiêu): trả lời 1-2 câu trực tiếp.
            - Câu hỏi phân tích (so sánh, xu hướng, gợi ý chiến lược): trình bày theo:
              • Kết luận: (1 câu trực tiếp — trả lời thẳng câu hỏi)
              • Phân tích chi tiết: (số liệu cụ thể, xu hướng, so sánh kỳ trước)
              • Gợi ý hành động: (ưu tiên theo mức độ cấp bách)
            - Câu hỏi nhập hàng / tồn kho: bắt buộc nêu tốc độ bán, ngày còn hàng, xu hướng, số lượng cụ thể.
            - Không vượt quá 8 bullet points. Dùng số liệu thực tế từ CONTEXT, không suy đoán.
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

            var earlyMonthNote = (revenue == 0 && orderCount == 0 && now.Day <= 5)
                ? $"  ⚠️ Hôm nay là ngày {now.Day}/{now:MM/yyyy} — đầu tháng, chưa có đơn mới."
                : "";

            return $"""
                === DỮ LIỆU KINH DOANH THỰC TẾ ===
                Tháng hiện tại: {now:MM/yyyy} (ngày {now.Day})  |  Tháng trước: {prevMonthStart:MM/yyyy}
                {earlyMonthNote}

                [Doanh thu]
                - Tháng này  : {revenue:N0} VND  ({revenueChange})
                - Tháng trước: {prevRevenue:N0} VND

                [Đơn hàng]
                - Tháng này  : {orderCount} đơn  ({orderChange})
                - Tháng trước: {prevOrderCount} đơn

                [Top sản phẩm bán chạy tháng này]
                {(topProducts.Any() ? string.Join("\n", topProducts.Select((p, i) => $"  {i + 1}. {p}")) : $"  (Chưa có đơn tháng {now:MM/yyyy} — xem tháng trước: {prevRevenue:N0} VND, {prevOrderCount} đơn)")}

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

    // Detect khoảng thời gian feedback từ câu hỏi (dùng cho time-based comparison)
    private static (DateTime? Start, DateTime? End, string Label) ParseFeedbackTimeFromQuestion(string question)
    {
        var q = question.ToLowerInvariant();
        var now = DateTime.UtcNow;
        var thisMonthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var prevMonthStart = thisMonthStart.AddMonths(-1);

        if (q.Contains("tháng trước") || q.Contains("tháng vừa rồi"))
            return (prevMonthStart, thisMonthStart, $"tháng {prevMonthStart:MM/yyyy}");
        if (q.Contains("tháng này") || q.Contains("tháng hiện tại"))
            return (thisMonthStart, now, $"tháng {now:MM/yyyy}");
        if (q.Contains("tuần này"))
        {
            var dayOffset = (int)now.DayOfWeek == 0 ? -6 : 1 - (int)now.DayOfWeek;
            var weekStart = now.AddDays(dayOffset).Date;
            return (weekStart, now, "tuần này");
        }
        if (q.Contains("tuần trước"))
        {
            var dayOffset = (int)now.DayOfWeek == 0 ? -6 : 1 - (int)now.DayOfWeek;
            var weekStart = now.AddDays(dayOffset - 7).Date;
            return (weekStart, weekStart.AddDays(7), "tuần trước");
        }
        if (q.Contains("30 ngày") || q.Contains("tháng qua"))
            return (now.AddDays(-30), now, "30 ngày qua");
        if (q.Contains("7 ngày") || q.Contains("tuần qua"))
            return (now.AddDays(-7), now, "7 ngày qua");
        // Không nhận diện → không filter (all-time)
        return (null, null, "toàn bộ");
    }

    private async Task<string> BuildFeedbackContext(Guid companyId, List<string> keywords, string question = "")
    {
        try
        {
            var (timeStart, timeEnd, timeLabel) = ParseFeedbackTimeFromQuestion(question);
            var isTimeFiltered = timeStart.HasValue;

            // Time filter SQL snippet
            var timeSql = isTimeFiltered
                ? $"AND scraped_at >= '{timeStart:yyyy-MM-dd}' AND scraped_at < '{timeEnd:yyyy-MM-dd}'"
                : "";

            // Thống kê cảm xúc (có time filter nếu được hỏi)
            var sentimentSqlFull = $$"""
                SELECT sentiment,
                       CAST(COUNT(*) AS INTEGER) AS cnt
                FROM   public.facebook_feedback
                WHERE  (company_id = {{companyId}} OR company_id IS NULL)
                  {{timeSql}}
                GROUP  BY sentiment
                """;
            var sentiments = await db.Database
                .SqlQueryRaw<SentimentRow>(sentimentSqlFull)
                .ToListAsync();

            // Nếu hỏi so sánh tháng này vs tháng trước
            var q = question.ToLowerInvariant();
            var wantsComparison = (q.Contains("so sánh") || q.Contains("so với") || q.Contains("tốt hơn") || q.Contains("tệ hơn"))
                               && (q.Contains("tháng trước") || q.Contains("tháng này") || q.Contains("tuần trước"));
            var prevSentiments = new List<SentimentRow>();
            var prevLabel = "";
            if (wantsComparison && isTimeFiltered)
            {
                // Tính kỳ trước tương đương
                var periodLen  = (timeEnd!.Value - timeStart!.Value).TotalDays;
                var prevStart  = timeStart!.Value.AddDays(-periodLen);
                var prevTimeSql = $"AND scraped_at >= '{prevStart:yyyy-MM-dd}' AND scraped_at < '{timeStart:yyyy-MM-dd}'";
                prevLabel = timeLabel.Contains("tháng") ? $"tháng {timeStart.Value.AddMonths(-1):MM/yyyy}"
                          : timeLabel.Contains("tuần")  ? "tuần trước đó" : "kỳ trước";

                // companyId là Guid; prevTimeSql được xây từ DateTime — không có user input
#pragma warning disable EF1002
                prevSentiments = await db.Database
                    .SqlQueryRaw<SentimentRow>($$"""
                        SELECT sentiment, CAST(COUNT(*) AS INTEGER) AS cnt
                        FROM public.facebook_feedback
                        WHERE (company_id = {{companyId}} OR company_id IS NULL)
                          {{prevTimeSql}}
                        GROUP BY sentiment
                        """)
                    .ToListAsync();
#pragma warning restore EF1002
            }

            // Phát hiện loại sentiment cần lọc từ sub-intent hoặc keyword
            var allKw = string.Join(" ", keywords).ToLower() + " " + q;
            var negWords = new[]{"tiêu cực","negative","phàn nàn","xấu","tệ","không hài lòng","chê","kém","dở","thất vọng"};
            var posWords = new[]{"tích cực","positive","khen","tốt","hài lòng","thích","hay","tuyệt","xuất sắc"};
            var sentimentFilter = negWords.Any(w => allKw.Contains(w)) ? "AND sentiment = 'negative'"
                                : posWords.Any(w => allKw.Contains(w)) ? "AND sentiment = 'positive'"
                                : "";
            var sectionLabel = string.IsNullOrEmpty(sentimentFilter) ? "Toàn bộ bình luận"
                             : sentimentFilter.Contains("negative")  ? "Bình luận tiêu cực"
                             : "Bình luận tích cực";

            // Keyword filter từ nội dung câu hỏi
            var kwFilter = keywords.Count > 0
                ? "AND (" + string.Join(" OR ", keywords.Select(kw =>
                    $"message ILIKE '%{kw.Replace("'", "''")}%'")) + ")"
                : "";

            var commentSql = $$"""
                SELECT message,
                       COALESCE(author_name, 'Ẩn danh') AS author_name,
                       COALESCE(sentiment, 'neutral')   AS sentiment,
                       COALESCE(like_count, 0)          AS like_count
                FROM   public.facebook_feedback
                WHERE  (company_id = {{companyId}} OR company_id IS NULL)
                  AND  message IS NOT NULL
                  {{sentimentFilter}}
                  {{kwFilter}}
                  {{timeSql}}
                ORDER  BY scraped_at DESC NULLS LAST
                LIMIT  20
                """;
            var comments = await db.Database
                .SqlQueryRaw<CommentRow>(commentSql)
                .ToListAsync();

            // Fallback: không khớp keyword → lấy tất cả
            if (comments.Count == 0 && keywords.Count > 0)
            {
                // companyId là Guid; sentimentFilter là literal; timeSql từ DateTime — không có user input
#pragma warning disable EF1002
                comments = await db.Database
                    .SqlQueryRaw<CommentRow>($$"""
                        SELECT message, COALESCE(author_name,'Ẩn danh') AS author_name,
                               COALESCE(sentiment,'neutral') AS sentiment, COALESCE(like_count,0) AS like_count
                        FROM public.facebook_feedback
                        WHERE (company_id = {{companyId}} OR company_id IS NULL)
                          AND message IS NOT NULL
                          {{sentimentFilter}} {{timeSql}}
                        ORDER BY scraped_at DESC NULLS LAST LIMIT 20
                        """)
                    .ToListAsync();
#pragma warning restore EF1002
            }

            if (!sentiments.Any())
                return "Chưa có dữ liệu phản hồi khách hàng từ Facebook. Hãy kết nối Facebook Page trong Data Sync.";

            // Tính tỷ lệ
            static int GetCount(List<SentimentRow> rows, string s) => rows.FirstOrDefault(r => r.Sentiment == s)?.Cnt ?? 0;
            var total = sentiments.Sum(s => s.Cnt);
            var pos   = GetCount(sentiments, "positive");
            var neg   = GetCount(sentiments, "negative");
            var neu   = GetCount(sentiments, "neutral");

            var commentLines = comments.Any()
                ? string.Join("\n", comments.Select(c =>
                    $"  [{c.Sentiment.ToUpper()}] {c.AuthorName}"
                    + (c.LikeCount > 0 ? $" ({c.LikeCount} like)" : "")
                    + $": {c.Message}"))
                : "  (Chưa có bình luận phù hợp)";

            // So sánh kỳ trước nếu có
            var compareBlock = "";
            if (prevSentiments.Any())
            {
                var prevTotal = prevSentiments.Sum(s => s.Cnt);
                var prevPos   = GetCount(prevSentiments, "positive");
                var prevNeg   = GetCount(prevSentiments, "negative");
                compareBlock = $"""

                [So sánh — {prevLabel}]
                - Tổng: {prevTotal} bình luận | Tích cực: {prevPos} ({(prevTotal > 0 ? prevPos * 100 / prevTotal : 0)}%) | Tiêu cực: {prevNeg} ({(prevTotal > 0 ? prevNeg * 100 / prevTotal : 0)}%)
                """;
            }

            return $"""
                INTENT: customer_feedback | {sectionLabel} | Kỳ: {timeLabel}
                === DỮ LIỆU PHẢN HỒI KHÁCH HÀNG TỪ FACEBOOK PAGE ===

                [Thống kê cảm xúc — {timeLabel}]
                - Tổng    : {total} bình luận
                - Tích cực: {pos} ({(total > 0 ? Math.Round(pos * 100.0 / total, 1) : 0)}%)
                - Tiêu cực: {neg} ({(total > 0 ? Math.Round(neg * 100.0 / total, 1) : 0)}%)
                - Trung tính: {neu} ({(total > 0 ? Math.Round(neu * 100.0 / total, 1) : 0)}%)
                {compareBlock}
                [{sectionLabel} — {comments.Count} bình luận{(isTimeFiltered ? $" trong {timeLabel}" : "")}]
                {commentLines}

                BẮT BUỘC: Phân tích chỉ dựa trên dữ liệu thực tế ở trên. Trích dẫn cụ thể từ bình luận.
                """;
        }
        catch (Exception ex)
        {
            logger.LogWarning("BuildFeedbackContext lỗi: {Msg}", ex.Message);
            return "Dữ liệu phản hồi Facebook chưa có. Hãy kết nối Facebook Page trong Data Sync.";
        }
    }

    // ── Context builders tập trung theo intent ───────────────────────────────

    // Trích xuất kênh cụ thể được nhắc đến trong câu hỏi
    private static string? ExtractChannelFromQuestion(string question)
    {
        var q = question.ToLowerInvariant();
        if (q.Contains("shopee"))     return "shopee";
        if (q.Contains("tiktok"))     return "tiktok";
        if (q.Contains("lazada"))     return "lazada";
        if (q.Contains("pos") || q.Contains("tại quầy") || q.Contains("trực tiếp") || q.Contains("offline"))
                                      return "pos";
        if (q.Contains("facebook shop") || q.Contains("fb shop")) return "facebook";
        return null;
    }

    private async Task<string> BuildContext_TopProduct(Guid companyId, string question = "")
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var channelFilter = ExtractChannelFromQuestion(question);
        try
        {
            var query = db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Join(db.Channels, x  => x.o.ChannelId,  ch => ch.ChannelId, (x, ch) => new { x.od, x.o, x.p, ch })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= monthStart
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED");

            // Filter theo kênh nếu câu hỏi đề cập kênh cụ thể
            if (!string.IsNullOrEmpty(channelFilter))
                query = query.Where(x => x.ch.ChannelName.ToLower().Contains(channelFilter));

            var products = await query
                .GroupBy(x => x.p.ProductName)
                .OrderByDescending(g => g.Sum(x => x.od.Quantity))
                .Take(5)
                .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity), Rev = g.Sum(x => x.od.Subtotal) })
                .ToListAsync();

            var channelLabel = channelFilter != null ? $" — kênh {channelFilter.ToUpper()}" : " — tất cả kênh";

            // Nếu tháng hiện tại chưa có đơn → fallback sang tháng trước
            var displayMonth = monthStart;
            if (!products.Any())
            {
                var prevStart = monthStart.AddMonths(-1);
                var prevQuery = db.OrderDetails
                    .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                    .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                    .Join(db.Channels, x  => x.o.ChannelId,  ch => ch.ChannelId, (x, ch) => new { x.od, x.o, x.p, ch })
                    .Where(x => x.o.CompanyId == companyId
                             && x.o.OrderDate >= prevStart && x.o.OrderDate < monthStart
                             && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED");
                if (!string.IsNullOrEmpty(channelFilter))
                    prevQuery = prevQuery.Where(x => x.ch.ChannelName.ToLower().Contains(channelFilter));

                products = await prevQuery
                    .GroupBy(x => x.p.ProductName)
                    .OrderByDescending(g => g.Sum(x => x.od.Quantity))
                    .Take(5)
                    .Select(g => new { Name = g.Key, Qty = g.Sum(x => x.od.Quantity), Rev = g.Sum(x => x.od.Subtotal) })
                    .ToListAsync();

                displayMonth = prevStart;
            }

            if (!products.Any())
                return $"Chưa có dữ liệu sản phẩm bán trong 2 tháng gần nhất{channelLabel}. Hãy kiểm tra dữ liệu trong Data Sync.";

            var note = displayMonth.Month != now.Month
                ? $" (dữ liệu tháng {displayMonth:MM/yyyy} — tháng {now:MM/yyyy} chưa có đơn)"
                : "";

            return $"""
                INTENT: top_product | Tháng: {displayMonth:MM/yyyy}{channelLabel}{note}
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

    // ── Parse 2 tháng bất kỳ từ câu hỏi để so sánh: "tháng 4/2025 vs tháng 4/2026" ──
    private static (int M1, int Y1, int M2, int Y2)? ParseTwoMonthsFromQuestion(string question)
    {
        var q = question.ToLowerInvariant();
        var matches = System.Text.RegularExpressions.Regex.Matches(
            q, @"tháng\s*(\d{1,2})(?:[/\-\s]+(?:năm\s*)?(\d{4}))?");

        if (matches.Count < 2) return null;
        if (!int.TryParse(matches[0].Groups[1].Value, out var m1) || m1 < 1 || m1 > 12) return null;
        if (!int.TryParse(matches[1].Groups[1].Value, out var m2) || m2 < 1 || m2 > 12) return null;

        var now = DateTime.UtcNow;
        var y1 = matches[0].Groups[2].Success && int.TryParse(matches[0].Groups[2].Value, out var yr1) ? yr1 : now.Year;
        var y2 = matches[1].Groups[2].Success && int.TryParse(matches[1].Groups[2].Value, out var yr2) ? yr2 : now.Year;

        if (y1 < 2020 || y1 > 2030 || y2 < 2020 || y2 > 2030) return null;
        if (m1 == m2 && y1 == y2) return null; // cùng tháng, không cần so sánh
        return (m1, y1, m2, y2);
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

    // ── Parse "tuần này", "tuần trước", "hôm qua", "2 ngày qua" → (startDate, endDate) ──
    private static (DateTime Start, DateTime End, string Label)? ParseWeekFromQuestion(string question)
    {
        var q   = question.ToLowerInvariant();
        var now = DateTime.UtcNow;
        // Đầu tuần = thứ Hai
        var dayOffset = (int)now.DayOfWeek == 0 ? -6 : 1 - (int)now.DayOfWeek;

        // "hôm qua"
        if (q.Contains("hôm qua") || q.Contains("ngày hôm qua"))
        {
            var yesterday = now.AddDays(-1).Date;
            return (yesterday, yesterday.AddDays(1), "hôm qua");
        }
        // "hôm nay" — xử lý rõ hơn thay vì để performance_overview xử lý
        if (q.Contains("hôm nay") && (q.Contains("doanh thu") || q.Contains("đơn") || q.Contains("bán")))
        {
            var today = now.Date;
            return (today, today.AddDays(1), "hôm nay");
        }
        if (q.Contains("tuần này"))
        {
            var start = now.AddDays(dayOffset).Date;
            return (start, start.AddDays(7), "tuần này");
        }
        if (q.Contains("tuần trước") || q.Contains("tuần vừa rồi") || q.Contains("tuần qua"))
        {
            var start = now.AddDays(dayOffset - 7).Date;
            return (start, start.AddDays(7), "tuần trước");
        }
        if (q.Contains("7 ngày") || q.Contains("7 ngày qua") || q.Contains("7 ngày gần"))
        {
            var start = now.AddDays(-7).Date;
            return (start, now, "7 ngày qua");
        }
        if (q.Contains("30 ngày") || q.Contains("30 ngày qua") || q.Contains("30 ngày gần"))
        {
            var start = now.AddDays(-30).Date;
            return (start, now, "30 ngày qua");
        }
        return null;
    }

    // ── Phân loại sub-intent cho tab Market (scraped_market) ─────────────────
    private static string DetectMarketIntent(string question)
    {
        var q = question.ToLowerInvariant();
        static bool Has(string text, params string[] words) => words.Any(text.Contains);

        // Đối thủ cạnh tranh / giá thị trường
        if (Has("đối thủ", "competitor", "cạnh tranh", "shop khác", "cửa hàng khác",
                   "giá đối thủ", "họ bán", "đối thủ bán", "market share"))
            return "market_competitor";

        // Cơ hội kinh doanh / ngách thị trường
        if (Has("cơ hội", "tiềm năng", "nên kinh doanh gì", "thị trường nào", "ngách",
                   "nên tập trung", "thị trường mới", "phân khúc thị trường", "blue ocean"))
            return "market_opportunity";

        // Từ khóa / tìm kiếm hot
        if (Has("từ khóa", "keyword", "tìm kiếm", "hot nhất", "được tìm nhiều",
                   "search volume", "google trend", "trend search"))
            return "market_keyword";

        // Sản phẩm cụ thể trên thị trường
        if (Has("sản phẩm", "mặt hàng", "hàng hóa")
            && Has("thị trường", "đang nổi", "đang hot", "được tìm", "xu hướng", "trending"))
            return "market_product";

        // Xu hướng ngành / người tiêu dùng / kênh mới
        if (Has("xu hướng tiêu dùng", "hành vi mua", "người mua", "khách hàng tiêu dùng",
                   "mua sắm online", "thương mại điện tử", "ecommerce", "xu hướng ngành",
                   "livestream", "live stream", "bán hàng trực tiếp", "tiktok trend",
                   "kol", "influencer", "review sản phẩm", "ugc", "viral"))
            return "market_consumer_trend";

        // Giá thị trường / định giá
        if (Has("giá thị trường", "giá bán thị trường", "thị trường đang bán giá",
                   "giá trung bình thị trường", "giá cạnh tranh", "định giá"))
            return "market_competitor";

        return "market_overview"; // tổng quan xu hướng thị trường
    }

    // ── Phân loại sub-intent cho tab Feedback (facebook_feedback) ─────────────
    private static string DetectFeedbackIntent(string question)
    {
        var q = question.ToLowerInvariant();
        static bool Has(string text, params string[] words) => words.Any(text.Contains);

        // Phàn nàn / tiêu cực
        if (Has("phàn nàn", "tiêu cực", "chê", "không hài lòng", "vấn đề",
                   "tệ", "tồi", "xấu", "dở", "bực", "tức", "thất vọng", "negative",
                   "kém", "không ổn", "lỗi", "hỏng"))
            return "feedback_negative";

        // Khen ngợi / tích cực
        if (Has("khen", "tích cực", "hài lòng", "thích", "tốt", "hay", "tuyệt",
                   "xuất sắc", "positive", "yêu thích", "ổn", "hài lòng", "recommend",
                   "gợi ý", "giới thiệu"))
            return "feedback_positive";

        // Đề xuất cải thiện / cần sửa
        if (Has("cải thiện", "cần sửa", "nên sửa", "đề xuất", "kiến nghị",
                   "mong muốn", "góp ý", "cần cải thiện", "nên làm gì", "cần thêm"))
            return "feedback_improvement";

        // Chủ đề giao hàng / vận chuyển
        if (Has("giao hàng", "vận chuyển", "shipping", "giao trễ", "giao nhanh",
                   "đóng gói", "bao bì", "shipper", "giao không đúng"))
            return "feedback_shipping";

        // Chủ đề chất lượng sản phẩm
        if (Has("chất lượng", "sản phẩm", "hàng", "hàng hóa", "mẫu mã",
                   "size", "màu sắc", "đúng mô tả", "như ảnh"))
            return "feedback_product_quality";

        // Chủ đề giá / chi phí
        if (Has("giá", "chi phí", "đắt", "rẻ", "hợp lý", "giá cả", "discount",
                   "khuyến mãi", "voucher", "giá trị"))
            return "feedback_price";

        // Chủ đề dịch vụ / tư vấn
        if (Has("dịch vụ", "tư vấn", "hỗ trợ", "nhân viên", "thái độ",
                   "phản hồi nhanh", "chăm sóc khách hàng", "customer service"))
            return "feedback_service";

        return "feedback_overview"; // tổng quan cảm xúc
    }

    // ── Detect câu hỏi follow-up (có đại từ thay thế hoặc rất ngắn) ─────────
    private static bool IsFollowUpQuestion(string question)
    {
        var q  = question.ToLowerInvariant().Trim();
        var qn = NormalizeVi(q);
        var wordCount = q.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        bool Has(params string[] words) => words.Any(w => q.Contains(w) || qn.Contains(NormalizeVi(w)));
        return wordCount <= 5
            || Has(" nó ", "nó ") || Has(" đó ", "đó ")
            || Has("so sánh nó", "so với")
            || Has("cùng kỳ đó", "tháng đó", "giai đoạn đó")
            || (q.StartsWith("so sánh với") || qn.StartsWith("so sanh voi"))
            || (q.StartsWith("so với tháng") || qn.StartsWith("so voi thang"))
            || (q.StartsWith("so với năm")   || qn.StartsWith("so voi nam"))
            || (q.StartsWith("so với quý")   || qn.StartsWith("so voi quy"))
            || (Has("so sánh") && !Has("kênh", "sản phẩm", "mặt hàng"));
    }

    // ── Mở rộng câu hỏi follow-up bằng cách ghép câu hỏi trước từ history ──
    // Ví dụ: "nó" → "đơn hàng tháng 4 2025" + "so sánh nó với tháng 4/2026"
    private static string ResolveFollowUp(string userMessage, List<ChatMessage> history)
    {
        if (!IsFollowUpQuestion(userMessage) || history.Count == 0)
            return userMessage;
        var lastUserMsg = history.LastOrDefault(m =>
            string.Equals(m.Role, "user", StringComparison.OrdinalIgnoreCase))?.Content ?? "";
        if (string.IsNullOrWhiteSpace(lastUserMsg) || lastUserMsg == userMessage)
            return userMessage;
        // Ghép: câu hỏi trước + câu hỏi hiện tại để intent detection + context builder hiểu ngữ cảnh
        return $"{lastUserMsg} {userMessage}".Trim();
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

            // So sánh 2 tháng bất kỳ (ví dụ: tháng 4/2025 vs tháng 4/2026)
            var twoMonthsRev = ParseTwoMonthsFromQuestion(question);
            if (twoMonthsRev.HasValue)
            {
                var (rm1, ry1, rm2, ry2) = twoMonthsRev.Value;
                var rs1 = new DateTime(ry1, rm1, 1, 0, 0, 0, DateTimeKind.Utc);
                var rs2 = new DateTime(ry2, rm2, 1, 0, 0, 0, DateTimeKind.Utc);
                var (rev1, cnt1) = await GetRevenueInRange(companyId, rs1, rs1.AddMonths(1));
                var (rev2, cnt2) = await GetRevenueInRange(companyId, rs2, rs2.AddMonths(1));
                var revChg = rev2 > 0
                    ? $"{(rev1 >= rev2 ? "+" : "")}{(rev1 - rev2) / rev2 * 100:F1}% so tháng {rm2:D2}/{ry2}"
                    : "(chưa có dữ liệu để so sánh)";
                return $"""
                    INTENT: revenue_summary | So sánh tháng {rm1:D2}/{ry1} vs tháng {rm2:D2}/{ry2}
                    [Doanh thu]
                    - Tháng {rm1:D2}/{ry1}: {rev1:N0} VND, {cnt1} đơn ({revChg})
                    - Tháng {rm2:D2}/{ry2}: {rev2:N0} VND, {cnt2} đơn
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

            // So sánh 2 tháng bất kỳ (ví dụ: tháng 4/2025 vs tháng 4/2026 từ effectiveQuestion)
            var twoMonths = ParseTwoMonthsFromQuestion(question);
            if (twoMonths.HasValue)
            {
                var (qm1, qy1, qm2, qy2) = twoMonths.Value;
                var s1 = new DateTime(qy1, qm1, 1, 0, 0, 0, DateTimeKind.Utc);
                var s2 = new DateTime(qy2, qm2, 1, 0, 0, 0, DateTimeKind.Utc);
                var (_, c1) = await GetRevenueInRange(companyId, s1, s1.AddMonths(1));
                var (_, c2) = await GetRevenueInRange(companyId, s2, s2.AddMonths(1));
                var chg = c2 > 0
                    ? $"{(c1 >= c2 ? "+" : "")}{c1 - c2} đơn so với tháng {qm2:D2}/{qy2}"
                    : "(chưa có dữ liệu để so sánh)";
                return $"""
                    INTENT: order_summary | So sánh tháng {qm1:D2}/{qy1} vs tháng {qm2:D2}/{qy2}
                    [Số đơn hàng]
                    - Tháng {qm1:D2}/{qy1}: {c1} đơn ({chg})
                    - Tháng {qm2:D2}/{qy2}: {c2} đơn
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
        var now        = DateTime.UtcNow;
        var day30Ago   = now.AddDays(-30);
        var day60Ago   = now.AddDays(-60);
        try
        {
            // Tốc độ bán 30 ngày qua
            var sales30d = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= day30Ago
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => new { x.p.ProductId, x.p.ProductName, x.p.Sku, x.p.StockQuantity })
                .Select(g => new
                {
                    g.Key.ProductId,
                    g.Key.ProductName,
                    g.Key.Sku,
                    Stock      = g.Key.StockQuantity,
                    QtySold30  = g.Sum(x => x.od.Quantity),
                    Revenue30  = g.Sum(x => x.od.Subtotal),
                })
                .ToListAsync();

            // Tốc độ bán 30-60 ngày trước (để tính xu hướng)
            var sales30to60 = await db.OrderDetails
                .Join(db.Orders,   od => od.OrderId,   o => o.OrderId,   (od, o) => new { od, o })
                .Join(db.Products, x  => x.od.ProductId, p => p.ProductId, (x, p)  => new { x.od, x.o, p })
                .Where(x => x.o.CompanyId == companyId
                         && x.o.OrderDate >= day60Ago && x.o.OrderDate < day30Ago
                         && x.o.Status != "CANCELLED" && x.o.Status != "RETURNED")
                .GroupBy(x => x.p.ProductId)
                .Select(g => new { ProductId = g.Key, QtySoldPrev = g.Sum(x => x.od.Quantity) })
                .ToListAsync();

            var prevDict = sales30to60.ToDictionary(x => x.ProductId, x => x.QtySoldPrev);

            // Phân tích từng sản phẩm: ngày còn hàng + xu hướng
            var analyzed = sales30d
                .Select(p =>
                {
                    var avgDaily = p.QtySold30 / 30.0;
                    var daysLeft = avgDaily > 0 ? (int)Math.Floor(p.Stock / avgDaily) : 9999;
                    var prevQty  = prevDict.TryGetValue(p.ProductId, out var pq) ? pq : 0;
                    var trend    = prevQty > 0 ? (p.QtySold30 - prevQty) * 100.0 / prevQty : 0.0;
                    return new { p.ProductName, p.Sku, p.Stock, p.QtySold30, p.Revenue30, avgDaily, daysLeft, prevQty, trend };
                })
                .Where(p => p.daysLeft < 90 || p.Stock <= 50) // Giữ sản phẩm cần theo dõi trong 90 ngày
                .OrderBy(p => p.daysLeft)
                .Take(15)
                .ToList();

            // Sản phẩm bán chạy nhất 30 ngày (top 5) — cần tồn kho đủ để tiếp tục bán
            var topSellers = sales30d
                .OrderByDescending(p => p.QtySold30)
                .Take(5)
                .ToList();

            // Tổng quan kho
            var totalActive = await db.Products.CountAsync(p => p.CompanyId == companyId && p.IsActive);
            var outOfStock  = await db.Products.CountAsync(p => p.CompanyId == companyId && p.IsActive && p.StockQuantity == 0);
            var lowStockCnt = await db.Products.CountAsync(p => p.CompanyId == companyId && p.IsActive && p.StockQuantity > 0 && p.StockQuantity <= 10);

            // Format từng sản phẩm cần nhập
            var urgentLines = analyzed.Select(p =>
            {
                var urgency  = p.Stock == 0  ? "🔴 HẾT HÀNG"
                             : p.daysLeft <= 7  ? "🔴 CẤP BÁCH"
                             : p.daysLeft <= 14 ? "🟡 ƯU TIÊN"
                             : p.daysLeft <= 30 ? "🟡 CHÚ Ý"
                             : "🟢 THEO DÕI";
                var dayStr   = p.Stock == 0         ? "đã hết hàng"
                             : p.daysLeft == 9999   ? "chưa bán 30 ngày qua"
                             : $"còn ~{p.daysLeft} ngày";
                var trendStr = p.trend >  10  ? $"📈 tăng {p.trend:F0}% so 30 ngày trước"
                             : p.trend < -10  ? $"📉 giảm {Math.Abs(p.trend):F0}% so 30 ngày trước"
                             : "➡️ ổn định";
                // Gợi ý số lượng nhập: đủ 45 ngày, nhân 1.2 nếu tăng trưởng
                var reorderBase = (int)Math.Ceiling(p.avgDaily * 45);
                var reorderQty  = p.trend > 10 ? (int)(reorderBase * 1.25) : reorderBase;
                return $"  {urgency} {p.ProductName}: tồn {p.Stock} sp | {dayStr} | "
                     + $"tốc độ {p.avgDaily:F1} sp/ngày | {trendStr} | → gợi ý nhập {reorderQty} sp";
            }).ToList();

            var topSellerLines = topSellers.Select((p, i) =>
            {
                var avgD     = p.QtySold30 / 30.0;
                var daysLeft = avgD > 0 ? (int)Math.Floor(p.Stock / avgD) : 9999;
                var dayStr   = daysLeft == 9999 ? "chưa tính được"
                             : daysLeft <= 14   ? $"🔴 ~{daysLeft} ngày"
                             : daysLeft <= 30   ? $"🟡 ~{daysLeft} ngày"
                             : $"🟢 ~{daysLeft} ngày";
                var suggest  = avgD > 0 ? (int)Math.Ceiling(avgD * 45) : 0;
                return $"  {i + 1}. {p.ProductName}: {p.QtySold30} sp/30 ngày | "
                     + $"tốc độ {avgD:F1} sp/ngày | tồn {p.Stock} sp ({dayStr} còn hàng)"
                     + (suggest > 0 ? $" | → đủ 45 ngày cần {suggest} sp" : "");
            }).ToList();

            return $"""
                INTENT: inventory_alert | Phân tích tồn kho & gợi ý nhập hàng
                Thời điểm: {now:dd/MM/yyyy} | Kỳ so sánh: 30 ngày gần nhất vs 30 ngày trước đó

                [Tổng quan kho]
                - Tổng sản phẩm đang bán: {totalActive}
                - Hết hàng (0 sp)        : {outOfStock} sản phẩm
                - Sắp hết (≤10 sp)       : {lowStockCnt} sản phẩm

                [Sản phẩm cần nhập — theo mức độ ưu tiên]
                {(urgentLines.Any()
                    ? string.Join("\n", urgentLines)
                    : "  Không có sản phẩm cần nhập gấp — tồn kho ổn định")}

                [Top sản phẩm bán chạy nhất 30 ngày qua — cần đảm bảo tồn kho đủ]
                {(topSellerLines.Any()
                    ? string.Join("\n", topSellerLines)
                    : "  (Chưa có dữ liệu bán hàng 30 ngày)")}

                [Hướng dẫn phân tích cho AI]
                - Ưu tiên phân tích 🔴 CẤP BÁCH trước, nêu lý do cụ thể (tốc độ bán vs tồn kho)
                - Sản phẩm 📈 tăng trưởng → gợi ý nhập nhiều hơn 20-25% so bình thường
                - Sản phẩm 📉 giảm → gợi ý nhập ít lại hoặc theo dõi thêm
                - Đối chiếu với top seller để đảm bảo hàng bán chạy không bị đứt hàng
                - Trình bày theo thứ tự: ưu tiên 🔴 → 🟡 → 🟢, số lượng cụ thể, lý do rõ ràng
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

    // ── Phân tích hoàn hàng / đơn hủy ────────────────────────────────────────
    private async Task<string> BuildContext_ReturnAnalysis(Guid companyId, string question)
    {
        var now   = DateTime.UtcNow;
        DateTime start, end;
        string   label;
        if (IsYearLevelQuery(question) && ParseYearsFromQuestion(question) is { } yrs)
        { start = new DateTime(yrs.Year1, 1, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddYears(1); label = $"Năm {yrs.Year1}"; }
        else if (ParseQuarterFromQuestion(question) is { } qtr2)
        { var sm2 = (qtr2.Quarter - 1) * 3 + 1; start = new DateTime(qtr2.Year, sm2, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(3); label = $"Q{qtr2.Quarter}/{qtr2.Year}"; }
        else { var ms = ParseDateFromQuestion(question); start = ms.HasValue ? new DateTime(ms.Value.Year, ms.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc) : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(1); label = $"Tháng {start:MM/yyyy}"; }
        try
        {
            var total     = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end);
            var cancelled = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status == "CANCELLED");
            var returned  = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status == "RETURNED");
            var cancelPct = total > 0 ? $"{cancelled * 100.0 / total:F1}%" : "N/A";
            var returnPct = total > 0 ? $"{returned  * 100.0 / total:F1}%" : "N/A";

            // Kênh có tỷ lệ hủy cao nhất
            var channelCancel = await db.Orders
                .Join(db.Channels, o => o.ChannelId, ch => ch.ChannelId, (o, ch) => new { o, ch })
                .Where(x => x.o.CompanyId == companyId && x.o.OrderDate >= start && x.o.OrderDate < end && x.o.Status == "CANCELLED")
                .GroupBy(x => x.ch.ChannelName)
                .Select(g => new { Name = g.Key, Count = g.Count() })
                .OrderByDescending(g => g.Count).FirstOrDefaultAsync();

            return $"""
                INTENT: return_analysis | {label}
                [Tình trạng hủy/hoàn đơn — {label}]
                - Tổng đơn       : {total}
                - Đơn bị hủy     : {cancelled} ({cancelPct})
                - Đơn hoàn trả   : {returned}  ({returnPct})
                - Kênh hủy nhiều nhất: {channelCancel?.Name ?? "Chưa có"} ({channelCancel?.Count ?? 0} đơn)
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_ReturnAnalysis lỗi: {M}", ex.Message); return "Chưa có dữ liệu hoàn hàng."; }
    }

    // ── Phân tích phương thức thanh toán ─────────────────────────────────────
    private async Task<string> BuildContext_PaymentAnalysis(Guid companyId, string question)
    {
        var now = DateTime.UtcNow;
        DateTime start, end;
        string   label;
        if (IsYearLevelQuery(question) && ParseYearsFromQuestion(question) is { } yrs)
        { start = new DateTime(yrs.Year1, 1, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddYears(1); label = $"Năm {yrs.Year1}"; }
        else { var ms = ParseDateFromQuestion(question); start = ms.HasValue ? new DateTime(ms.Value.Year, ms.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc) : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(1); label = $"Tháng {start:MM/yyyy}"; }
        try
        {
            var methods = await db.Orders
                .Where(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED")
                .GroupBy(o => o.PaymentMethod ?? "Không xác định")
                .Select(g => new { Method = g.Key, Count = g.Count(), Revenue = g.Sum(o => o.TotalAmount) })
                .OrderByDescending(g => g.Count).ToListAsync();

            if (!methods.Any()) return $"INTENT: payment_analysis | {label}\nChưa có dữ liệu thanh toán trong {label}.";

            var total = methods.Sum(m => m.Count);
            return $"""
                INTENT: payment_analysis | {label}
                [Phân bố phương thức thanh toán — {label}]
                {string.Join("\n", methods.Select(m =>
                    $"  • {m.Method}: {m.Count} đơn ({(total > 0 ? m.Count * 100.0 / total : 0):F1}%) — {m.Revenue:N0} VND"))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_PaymentAnalysis lỗi: {M}", ex.Message); return "Chưa có dữ liệu thanh toán."; }
    }

    // ── Phân tích giảm giá / voucher ─────────────────────────────────────────
    private async Task<string> BuildContext_DiscountAnalysis(Guid companyId, string question)
    {
        var now = DateTime.UtcNow;
        DateTime start, end;
        string   label;
        if (IsYearLevelQuery(question) && ParseYearsFromQuestion(question) is { } yrs)
        { start = new DateTime(yrs.Year1, 1, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddYears(1); label = $"Năm {yrs.Year1}"; }
        else { var ms = ParseDateFromQuestion(question); start = ms.HasValue ? new DateTime(ms.Value.Year, ms.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc) : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(1); label = $"Tháng {start:MM/yyyy}"; }
        try
        {
            var total      = await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED");
            var withVoucher= await db.Orders.CountAsync(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED" && o.VoucherCode != null);
            var totalDisc  = await db.Orders.Where(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED").SumAsync(o => (decimal?)o.DiscountAmount) ?? 0;
            var totalRev   = await db.Orders.Where(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED").SumAsync(o => (decimal?)o.TotalAmount) ?? 0;
            var discPct    = totalRev > 0 ? $"{totalDisc / totalRev * 100:F1}%" : "N/A";

            return $"""
                INTENT: discount_analysis | {label}
                [Phân tích giảm giá/voucher — {label}]
                - Đơn có voucher   : {withVoucher}/{total} đơn ({(total > 0 ? withVoucher * 100.0 / total : 0):F1}%)
                - Tổng giá trị giảm: {totalDisc:N0} VND ({discPct} so doanh thu)
                - Doanh thu thuần  : {totalRev:N0} VND
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_DiscountAnalysis lỗi: {M}", ex.Message); return "Chưa có dữ liệu giảm giá."; }
    }

    // ── Phân tích tình trạng vận chuyển ──────────────────────────────────────
    private async Task<string> BuildContext_ShippingStatus(Guid companyId, string question)
    {
        var now = DateTime.UtcNow;
        DateTime start, end;
        string   label;
        if (IsYearLevelQuery(question) && ParseYearsFromQuestion(question) is { } yrs)
        { start = new DateTime(yrs.Year1, 1, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddYears(1); label = $"Năm {yrs.Year1}"; }
        else { var ms = ParseDateFromQuestion(question); start = ms.HasValue ? new DateTime(ms.Value.Year, ms.Value.Month, 1, 0, 0, 0, DateTimeKind.Utc) : new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc); end = start.AddMonths(1); label = $"Tháng {start:MM/yyyy}"; }
        try
        {
            var statuses = await db.Orders
                .Where(o => o.CompanyId == companyId && o.OrderDate >= start && o.OrderDate < end && o.Status != "CANCELLED")
                .GroupBy(o => o.ShippingStatus ?? "NOT_SHIPPED")
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .OrderByDescending(g => g.Count).ToListAsync();

            if (!statuses.Any()) return $"INTENT: shipping_status | {label}\nChưa có dữ liệu vận chuyển trong {label}.";

            var total = statuses.Sum(s => s.Count);
            var labelMap = new Dictionary<string, string>
            {
                ["DELIVERED"]   = "Giao thành công",
                ["DELIVERING"]  = "Đang giao",
                ["NOT_SHIPPED"] = "Chưa giao",
                ["FAILED"]      = "Giao thất bại",
                ["RETURNED"]    = "Đã hoàn",
                ["PICKED_UP"]   = "Đã lấy hàng",
                ["READY"]       = "Chờ lấy hàng",
            };

            return $"""
                INTENT: shipping_status | {label}
                [Tình trạng vận chuyển — {label}]
                {string.Join("\n", statuses.Select(s =>
                    $"  • {(labelMap.TryGetValue(s.Status, out var lbl) ? lbl : s.Status)}: {s.Count} đơn ({(total > 0 ? s.Count * 100.0 / total : 0):F1}%)"))}
                """;
        }
        catch (Exception ex) { logger.LogWarning("BuildContext_ShippingStatus lỗi: {M}", ex.Message); return "Chưa có dữ liệu vận chuyển."; }
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
        if (Has("facebook", "phàn nàn", "khách chê", "bình luận", "phản hồi", "khách hàng chê"))
        {
            var fbCtx = await BuildFeedbackContext(companyId, keywords);
            parts.Add("\n--- DỮ LIỆU PHẢN HỒI FACEBOOK ---\n" + fbCtx);
        }

        // Thêm dữ liệu thị trường nếu câu hỏi đề cập đối thủ/xu hướng
        if (Has("đối thủ", "thị trường", "giá đối thủ", "google", "xu hướng thị trường"))
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

        // Resolve follow-up references: ghép câu hỏi trước từ history nếu câu hỏi hiện tại có đại từ thay thế
        // Ví dụ: "nó" → "đơn hàng tháng 4 2025" + "so sánh nó với tháng 4/2026"
        var effectiveQuestion = ResolveFollowUp(userMessage, history);
        if (effectiveQuestion != userMessage)
            logger.LogInformation("[CHATBOT] follow-up resolved: '{Q}' → '{EQ}'",
                userMessage[..Math.Min(60, userMessage.Length)], effectiveQuestion[..Math.Min(120, effectiveQuestion.Length)]);

        // 2. Detect sub-intent — rule-based fast path (dùng effectiveQuestion để nhận diện đúng context)
        var intent = taxonomyTab switch
        {
            "facebook_feedback" => DetectFeedbackIntent(effectiveQuestion),  // 8 sub-intents
            "scraped_market"    => DetectMarketIntent(effectiveQuestion),     // 6 sub-intents
            "cross_analysis"    => "cross_analysis",
            _                   => DetectIntent(effectiveQuestion),           // 16 sub-intents
        };

        if (intent == "unknown")
        {
            intent = await ClassifyIntentWithGeminiAsync(effectiveQuestion);
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

        // 4. Extract keywords để lọc DB (dùng effectiveQuestion để bắt được keyword từ câu hỏi trước)
        var keywords = ExtractKeywords(effectiveQuestion);

        // 5. Build focused context theo taxonomy tab + intent (dùng effectiveQuestion để parse ngày/tháng đúng)
        var context = string.Empty;
        if (companyId.HasValue)
        {
            context = (taxonomyTab, intent) switch
            {
                ("scraped_market",    _)                        => await BuildMarketContext              (companyId.Value, keywords),
                ("facebook_feedback", _)                        => await BuildFeedbackContext            (companyId.Value, keywords, effectiveQuestion),
                ("cross_analysis",    _)                        => await BuildContext_CrossAnalysis      (companyId.Value, effectiveQuestion, keywords),
                (_,                   "top_product")            => await BuildContext_TopProduct         (companyId.Value, effectiveQuestion),
                (_,                   "declining_product")      => await BuildContext_DecliningProduct   (companyId.Value),
                (_,                   "trending_product")       => await BuildContext_TrendingProduct    (companyId.Value),
                (_,                   "revenue_summary")        => await BuildContext_Revenue            (companyId.Value, effectiveQuestion),
                (_,                   "order_summary")          => await BuildContext_OrderSummary       (companyId.Value, effectiveQuestion),
                (_,                   "top_channel")            => await BuildContext_Channels              (companyId.Value, topOnly: true),
                (_,                   "channel_comparison")     => await BuildContext_Channels              (companyId.Value, topOnly: false),
                (_,                   "business_recommendation")=> await BuildContext_BusinessRecommendation(companyId.Value),
                (_,                   "customer_overview")      => await BuildContext_CustomerOverview      (companyId.Value),
                (_,                   "inventory_alert")        => await BuildContext_Inventory             (companyId.Value),
                (_,                   "employee_performance")   => await BuildContext_EmployeePerformance   (companyId.Value, effectiveQuestion),
                (_,                   "return_analysis")        => await BuildContext_ReturnAnalysis        (companyId.Value, effectiveQuestion),
                (_,                   "payment_analysis")       => await BuildContext_PaymentAnalysis       (companyId.Value, effectiveQuestion),
                (_,                   "discount_analysis")      => await BuildContext_DiscountAnalysis      (companyId.Value, effectiveQuestion),
                (_,                   "shipping_status")        => await BuildContext_ShippingStatus        (companyId.Value, effectiveQuestion),
                _                                               => await BuildContext_PerformanceOverview   (companyId.Value),
            };
        }

        // 6. Debug log
        logger.LogInformation(
            "[CHATBOT] user_question={Q} | effective_question={EQ} | taxonomy_tab={TT} | sub_intent={I} | context_len={L}",
            userMessage[..Math.Min(80, userMessage.Length)],
            effectiveQuestion[..Math.Min(120, effectiveQuestion.Length)],
            taxonomyTab, intent, context.Length);

        // 7. Build focused system prompt (dùng effectiveQuestion để AI hiểu đúng "nó" là gì)
        var systemPrompt = BuildFocusedSystemPrompt(effectiveQuestion, intent, context, taxonomyTab);

        try
        {
            // 8. Tier 1: Gemini với multi-model fallback (429 → thử model khác)
            var (geminiText, geminiModel) = await CallGeminiWithFallbackAsync(systemPrompt, userMessage, history);
            if (geminiText is not null)
            {
                result.Answer    = geminiText;
                result.ModelUsed = geminiModel!;
                logger.LogInformation("[CHATBOT] Gemini ({M}) trả lời intent={I}", geminiModel, intent);
                return result;
            }

            // Tất cả Gemini 429 → Groq
            logger.LogWarning("Tất cả Gemini model thất bại — thử Groq");
            var groqText = await CallGroqAsync(systemPrompt, userMessage, history);
            if (groqText is not null)
            {
                result.Answer         = groqText;
                result.ModelUsed      = _groqModel;
                result.FallbackUsed   = true;
                result.FallbackReason = "Tất cả Gemini 429/503, dùng Groq";
                return result;
            }

            // Groq cũng fail → FastAPI (non-business tab)
            if (taxonomyTab != "internal_business")
            {
                var fastApi = await CallRecommendationFallbackAsync(userMessage, tab, companyId);
                if (fastApi is not null)
                {
                    result.Answer         = fastApi;
                    result.ModelUsed      = "fastapi_fallback";
                    result.FallbackUsed   = true;
                    result.FallbackReason = "Gemini + Groq thất bại, FastAPI";
                    return result;
                }
            }

            // Tier 4: template rule-based (tất cả AI đều fail)
            var rb0 = BuildRuleBasedResponse(userMessage, intent, context);
            result.Answer         = rb0;
            result.ModelUsed      = "template_fallback";
            result.IsAiGenerated  = false;
            result.FallbackUsed   = true;
            result.FallbackReason = "Tất cả AI thất bại, rule-based";
            return result;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "ChatAsync unexpected exception");
            var rb = BuildRuleBasedResponse(userMessage, intent, context);
            result.Answer         = rb;
            result.ModelUsed      = "template_fallback";
            result.IsAiGenerated  = false;
            result.FallbackUsed   = true;
            result.FallbackReason = $"Exception: {ex.Message[..Math.Min(80, ex.Message.Length)]}";
            return result;
        }
    }

    // ── Tier 1: Gemini với multi-model fallback (429 → thử model tiếp theo) ──
    // Trả về (responseText, modelUsed) hoặc (null, null) nếu tất cả fail.
    private async Task<(string? Text, string? ModelUsed)> CallGeminiWithFallbackAsync(
        string systemPrompt, string userMessage, List<ChatMessage> history)
    {
        if (string.IsNullOrWhiteSpace(_apiKey)) return (null, null);

        // Kiểm tra cooldown — nếu đang trong thời gian bị 429, skip Gemini hoàn toàn
        if (DateTime.UtcNow < _geminiQuotaExhaustedUntil)
        {
            var remaining = (int)(_geminiQuotaExhaustedUntil - DateTime.UtcNow).TotalSeconds;
            logger.LogInformation("[CHATBOT] Gemini cooldown còn {S}s — skip thẳng sang Groq", remaining);
            return (null, null);
        }

        // Bắt đầu từ model được cấu hình, nếu không phải model đầu trong list thì thêm vào đầu
        var modelsToTry = GeminiFallbackModels
            .Prepend(_model)
            .Distinct()
            .ToList();

        var contents = new List<object>();
        foreach (var msg in history.TakeLast(10))
            contents.Add(new { role = msg.Role, parts = new[] { new { text = msg.Content } } });
        contents.Add(new { role = "user", parts = new[] { new { text = userMessage } } });

        var requestBody = new
        {
            system_instruction = new { parts = new[] { new { text = systemPrompt } } },
            contents,
            generationConfig = new { temperature = _temp, maxOutputTokens = _maxTok, candidateCount = 1 },
        };
        var json = System.Text.Json.JsonSerializer.Serialize(requestBody);

        bool hit429 = false;
        foreach (var model in modelsToTry)
        {
            try
            {
                var http = httpFactory.CreateClient();
                http.Timeout = TimeSpan.FromSeconds(20);
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={_apiKey}";
                var response = await http.PostAsync(url, new StringContent(json, System.Text.Encoding.UTF8, "application/json"));
                var status = (int)response.StatusCode;

                if (status == 429)
                {
                    // Đặt cooldown — tránh gọi thêm model khác khi đang bị rate-limit
                    hit429 = true;
                    _geminiQuotaExhaustedUntil = DateTime.UtcNow.AddSeconds(_geminiCooldownSecs);
                    logger.LogWarning("[CHATBOT] Gemini 429 quota exhausted — cooldown {S}s, skip tất cả model", _geminiCooldownSecs);
                    break; // không thử model tiếp → tiết kiệm quota
                }

                if (status == 503)
                {
                    logger.LogWarning("[CHATBOT] Gemini model {M} 503 → thử model tiếp", model);
                    continue;
                }

                if (!response.IsSuccessStatusCode)
                {
                    logger.LogError("[CHATBOT] Gemini model {M} lỗi HTTP {S}", model, status);
                    return (null, null); // lỗi thực sự → không thử tiếp
                }

                var body = await response.Content.ReadAsStringAsync();
                using var doc = System.Text.Json.JsonDocument.Parse(body);
                var text = doc.RootElement
                    .GetProperty("candidates")[0].GetProperty("content")
                    .GetProperty("parts")[0].GetProperty("text").GetString();

                if (!string.IsNullOrWhiteSpace(text))
                {
                    logger.LogInformation("[CHATBOT] Gemini ({M}) trả lời thành công", model);
                    return (text, model);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning("[CHATBOT] Gemini model {M} exception: {E} → thử tiếp", model, ex.Message);
            }
        }

        if (hit429)
            logger.LogWarning("[CHATBOT] Gemini quota exhausted — fallback Groq ngay (cooldown {S}s)", _geminiCooldownSecs);
        else
            logger.LogWarning("[CHATBOT] Tất cả Gemini model đều thất bại → Groq");
        return (null, null);
    }

    // ── Tier 2A: Groq free-tier fallback (OpenAI-compatible API) ────────────
    // Dùng khi Gemini hết quota (429) hoặc quá tải — Groq miễn phí, latency thấp.
    private async Task<string?> CallGroqAsync(string systemPrompt, string userMessage, List<ChatMessage> history)
    {
        if (string.IsNullOrWhiteSpace(_groqApiKey)) return null;
        try
        {
            var http = httpFactory.CreateClient();
            http.Timeout = TimeSpan.FromSeconds(20);
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
