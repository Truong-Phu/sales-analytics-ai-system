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

    public async Task<object?> GetForecastAsync(int horizon = 30, string? channel = null, Guid? companyId = null)
    {
        var url = $"/forecast?horizon={horizon}";
        if (!string.IsNullOrEmpty(channel)) url += $"&channel={Uri.EscapeDataString(channel)}";
        if (companyId.HasValue)              url += $"&company_id={companyId.Value}";
        return await GetJsonAsync(url);
    }

    public async Task<object?> GetAnomalyAsync(int days = 90, string? channel = null, Guid? companyId = null)
    {
        var url = $"/anomaly?days={days}";
        if (!string.IsNullOrEmpty(channel)) url += $"&channel={Uri.EscapeDataString(channel)}";
        if (companyId.HasValue)              url += $"&company_id={companyId.Value}";
        return await GetJsonAsync(url);
    }

    public async Task<object?> GetTrendAsync(int days = 30, string? channel = null, Guid? companyId = null)
    {
        var url = $"/trend?days={days}";
        if (!string.IsNullOrEmpty(channel)) url += $"&channel={Uri.EscapeDataString(channel)}";
        if (companyId.HasValue)              url += $"&company_id={companyId.Value}";
        return await GetJsonAsync(url);
    }

    public async Task<object?> GetRecommendationsAsync(Guid? companyId = null)
    {
        var url = "/recommendation";
        if (companyId.HasValue) url += $"?company_id={companyId.Value}";
        return await GetJsonAsync(url);
    }

    /// <summary>Lấy metrics đánh giá độ chính xác model Prophet (MAE, RMSE, MAPE).</summary>
    public async Task<object?> GetForecastMetricsAsync()
        => await GetJsonAsync("/forecast/metrics");

    /// <summary>
    /// Forward POST /recommendation lên FastAPI AI Service.
    /// Payload: { question, language, context?, sources? }
    /// → trả về { recommendation, data_sources, confidence, note, sources_used, context_type }.
    /// Nếu FastAPI không khả dụng → trả về null (controller sẽ trả 503).
    /// </summary>
    public async Task<object?> PostRecommendationAsync(
        string question,
        string language = "vi",
        string? context = null,
        IEnumerable<string>? sources = null)
    {
        try
        {
            var payload = new
            {
                question,
                language,
                context  = context ?? (object?)null,
                sources  = sources?.ToArray() ?? (object?)null,
            };
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
            return null;
        }
        catch (TaskCanceledException)
        {
            return null;
        }
    }

    /// <summary>Gọi FastAPI /health/connectors → trạng thái tất cả connector.</summary>
    public async Task<object?> GetConnectorHealthAsync()
        => await GetJsonAsync("/health/connectors");

    /// <summary>
    /// Kích hoạt ETL OLTP→DW trên Python FastAPI.
    /// POST /etl/oltp-to-dw với body { "channel": "shopee" } hoặc {}.
    /// Trả về null nếu AI Service không khả dụng (controller tự fallback).
    /// </summary>
    public async Task<Dictionary<string, object?>?> TriggerOltpToDwAsync(string? channel = null)
    {
        try
        {
            var body    = new { channel };
            var json    = JsonSerializer.Serialize(body);
            var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
            var resp    = await _http.PostAsync("/etl/oltp-to-dw", content);
            if (!resp.IsSuccessStatusCode) return null;
            var raw  = await resp.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(raw, _jsonOpts);
        }
        catch (HttpRequestException)  { return null; }
        catch (TaskCanceledException) { return null; }
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
