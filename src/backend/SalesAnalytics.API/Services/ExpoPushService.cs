using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

public interface IExpoPushService
{
    Task SendToUserAsync(int userId, string title, string body, string? data = null);
    Task SendBatchAsync(IEnumerable<string> expoTokens, string title, string body, string? data = null);
}

public class ExpoPushService(
    HttpClient httpClient,
    AppDbContext db,
    ILogger<ExpoPushService> logger) : IExpoPushService
{
    private const string ExpoEndpoint = "https://exp.host/--/api/v2/push/send";

    public async Task SendToUserAsync(int userId, string title, string body, string? data = null)
    {
        var tokens = await db.PushTokens
            .Where(t => t.UserId == userId && t.IsActive)
            .Select(t => t.ExpoToken)
            .ToListAsync();

        if (tokens.Count == 0) return;
        await SendBatchAsync(tokens, title, body, data);
    }

    public async Task SendBatchAsync(IEnumerable<string> expoTokens, string title, string body, string? data = null)
    {
        var tokenList = expoTokens.ToList();
        if (tokenList.Count == 0) return;

        // Expo cho phép tối đa 100 token per request
        foreach (var batch in tokenList.Chunk(100))
        {
            var messages = batch.Select(token => new
            {
                to     = token,
                title,
                body,
                data   = data != null ? (object)JsonSerializer.Deserialize<object>(data)! : new { },
                sound  = "default",
                badge  = 1,
            }).ToArray();

            try
            {
                var json    = JsonSerializer.Serialize(messages);
                var content = new StringContent(json, Encoding.UTF8, "application/json");
                var resp    = await httpClient.PostAsync(ExpoEndpoint, content);

                if (!resp.IsSuccessStatusCode)
                {
                    var err = await resp.Content.ReadAsStringAsync();
                    logger.LogWarning("Expo Push lỗi {Status}: {Err}", resp.StatusCode, err);
                }
                else
                    logger.LogInformation("Expo Push đã gửi {Count} message(s)", batch.Length);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Lỗi gọi Expo Push API");
            }
        }
    }
}
