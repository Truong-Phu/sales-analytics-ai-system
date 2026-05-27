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
    public string   Intent         { get; set; } = "unknown";
    public string   Answer         { get; set; } = "";
    public string   DataSource     { get; set; } = "database";
    public bool     IsAiGenerated  { get; set; } = true;
    public bool     FallbackUsed   { get; set; } = false;
    public string?  FallbackReason { get; set; }
    public DateTime Timestamp      { get; set; } = DateTime.UtcNow;
}
