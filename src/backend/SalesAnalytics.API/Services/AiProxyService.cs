using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace SalesAnalytics.API.Services;

/// <summary>Proxy gọi AI FastAPI service và trả kết quả về Frontend</summary>
public class AiProxyService
{
    private readonly HttpClient _http;

    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public AiProxyService(HttpClient http) => _http = http;

    public async Task<object?> GetForecastAsync(int horizon = 30, string? channel = null)
    {
        var url = $"/forecast?horizon={horizon}";
        if (!string.IsNullOrEmpty(channel)) url += $"&channel={Uri.EscapeDataString(channel)}";
        return await GetJsonAsync(url);
    }

    public async Task<object?> GetAnomalyAsync(int days = 90, string? channel = null)
    {
        var url = $"/anomaly?days={days}";
        if (!string.IsNullOrEmpty(channel)) url += $"&channel={Uri.EscapeDataString(channel)}";
        return await GetJsonAsync(url);
    }

    public async Task<object?> GetTrendAsync(int days = 30, string? channel = null)
    {
        var url = $"/trend?days={days}";
        if (!string.IsNullOrEmpty(channel)) url += $"&channel={Uri.EscapeDataString(channel)}";
        return await GetJsonAsync(url);
    }

    public async Task<object?> GetRecommendationsAsync()
        => await GetJsonAsync("/recommendation");

    /// <summary>Lấy metrics đánh giá độ chính xác model Prophet (MAE, RMSE, MAPE).</summary>
    public async Task<object?> GetForecastMetricsAsync()
        => await GetJsonAsync("/forecast/metrics");

    /// <summary>
    /// Forward POST /recommendation lên FastAPI AI Service.
    /// Payload: { question, language } → trả về { recommendation, data_sources, confidence, note }.
    /// Nếu FastAPI không khả dụng → trả về null (controller sẽ trả 503).
    /// </summary>
    public async Task<object?> PostRecommendationAsync(string question, string language = "vi")
    {
        try
        {
            var payload = new { question, language };
            var json    = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _http.PostAsync("/recommendation", content);
            if (!response.IsSuccessStatusCode)
                return null;

            var body = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<object>(body, _jsonOpts);
        }
        catch (HttpRequestException)
        {
            // FastAPI service không chạy hoặc lỗi mạng → trả null để controller xử lý 503
            return null;
        }
        catch (TaskCanceledException)
        {
            // Timeout
            return null;
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private async Task<object?> GetJsonAsync(string url)
    {
        try
        {
            var response = await _http.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                return null;

            var content = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<object>(content, _jsonOpts);
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (TaskCanceledException)
        {
            return null;
        }
    }
}
