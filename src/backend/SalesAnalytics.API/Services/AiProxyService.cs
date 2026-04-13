namespace SalesAnalytics.API.Services;

/// <summary>Proxy gọi AI FastAPI service và trả kết quả về Frontend</summary>
public class AiProxyService
{
    private readonly HttpClient _http;

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

    // ── Private ─────────────────────────────────────────────────────────────

    private async Task<object?> GetJsonAsync(string url)
    {
        var response = await _http.GetAsync(url);
        if (!response.IsSuccessStatusCode)
            return null;

        var content = await response.Content.ReadAsStringAsync();
        return System.Text.Json.JsonSerializer.Deserialize<object>(content);
    }
}
