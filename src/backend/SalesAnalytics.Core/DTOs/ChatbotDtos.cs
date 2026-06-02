namespace SalesAnalytics.Core.DTOs;

/// <summary>Request body cho endpoint POST /api/chatbot/chat</summary>
public class ChatRequest
{
    public string Message { get; set; } = "";
    public string Tab { get; set; } = "business";
    public List<ChatMessage> History { get; set; } = [];
}

/// <summary>Một lượt hội thoại trong lịch sử chat</summary>
public class ChatMessage
{
    public string Role    { get; set; } = "user";
    public string Content { get; set; } = "";
}

/// <summary>Response chuẩn từ chatbot, bao gồm intent và metadata</summary>
public class ChatResponse
{
    public bool     Success        { get; set; } = true;
    public string   Question       { get; set; } = "";
    /// <summary>Taxonomy tab: internal_business | scraped_market | facebook_feedback | cross_analysis | unknown</summary>
    public string   Tab            { get; set; } = "internal_business";
    /// <summary>Intent nội bộ (backward compat)</summary>
    public string   Intent         { get; set; } = "unknown";
    /// <summary>Sub-intent chi tiết: top_product | revenue_summary | top_channel | ...</summary>
    public string   SubIntent      { get; set; } = "unknown";
    public string   Answer         { get; set; } = "";
    /// <summary>Nguồn dữ liệu: database | google_data | facebook_data | mixed | none</summary>
    public string   DataSource     { get; set; } = "database";
    /// <summary>Model đã dùng: gemini-2.0-flash | llama-3.3-70b-versatile | template_fallback</summary>
    public string   ModelUsed      { get; set; } = "";
    public bool     IsAiGenerated  { get; set; } = true;
    public bool     FallbackUsed   { get; set; } = false;
    public string?  FallbackReason { get; set; }
    public DateTime Timestamp      { get; set; } = DateTime.UtcNow;
}
