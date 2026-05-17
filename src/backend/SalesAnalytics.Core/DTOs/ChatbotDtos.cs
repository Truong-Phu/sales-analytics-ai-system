namespace SalesAnalytics.Core.DTOs;

/// <summary>Request body cho endpoint POST /api/chatbot/chat</summary>
public class ChatRequest
{
    /// <summary>Câu hỏi của người dùng</summary>
    public string Message { get; set; } = "";

    /// <summary>Tab nguồn dữ liệu: "business" | "market" | "feedback"</summary>
    public string Tab { get; set; } = "business";

    /// <summary>Lịch sử hội thoại (tối đa 10 lượt gần nhất được xử lý)</summary>
    public List<ChatMessage> History { get; set; } = [];
}

/// <summary>Một lượt hội thoại trong lịch sử chat</summary>
public class ChatMessage
{
    /// <summary>Vai trò: "user" hoặc "model"</summary>
    public string Role { get; set; } = "user";

    /// <summary>Nội dung tin nhắn</summary>
    public string Content { get; set; } = "";
}
