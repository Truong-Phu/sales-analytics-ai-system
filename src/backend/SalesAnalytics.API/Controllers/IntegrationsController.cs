using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý kết nối kênh bán hàng theo mô hình SaaS multi-tenant.
/// Mỗi tenant lưu credentials riêng (đã mã hóa AES-256-GCM) trong bảng integrations.
/// </summary>
[ApiController]
[Route("api/integrations")]
[Authorize(Roles = "Owner,Manager")]
public class IntegrationsController(
    AppDbContext db,
    CryptoService crypto,
    IHttpClientFactory httpClientFactory,
    ILogger<IntegrationsController> logger,
    IAuditLogService audit,
    ITenantContext tenant) : ControllerBase
{
    private const string GraphApiBase = "https://graph.facebook.com/v18.0";

    // ── Facebook ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Kết nối Facebook Page.
    /// Validate token qua Graph API, mã hóa rồi lưu vào bảng integrations.
    /// </summary>
    [HttpPost("facebook")]
    public async Task<IActionResult> ConnectFacebook([FromBody] FacebookConnectRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.PageId) || string.IsNullOrWhiteSpace(req.PageAccessToken))
            return BadRequest(new { message = "pageId và pageAccessToken không được để trống." });

        var companyId = tenant.CompanyId;

        // 1. Validate token qua Graph API: GET /{pageId}?fields=name,id&access_token={token}
        var (valid, pageName, errMsg) = await ValidateFacebookToken(req.PageId, req.PageAccessToken);
        if (!valid)
            return BadRequest(new { message = $"Token không hợp lệ hoặc Page ID sai: {errMsg}" });

        // 2. Mã hóa token
        var encryptedToken = crypto.Encrypt(req.PageAccessToken);

        // 3. Upsert vào bảng integrations (ON CONFLICT DO UPDATE)
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                INSERT INTO public.integrations
                    (company_id, platform, platform_type, account_id, account_name,
                     access_token, status, is_active, connected_at, created_at, updated_at)
                VALUES
                    (@cid, 'facebook', 'scraper', @pageId, @pageName,
                     @token, 'connected', TRUE, NOW(), NOW(), NOW())
                ON CONFLICT (company_id, platform, account_id) DO UPDATE
                SET access_token  = EXCLUDED.access_token,
                    account_name  = EXCLUDED.account_name,
                    status        = 'connected',
                    is_active     = TRUE,
                    connected_at  = NOW(),
                    updated_at    = NOW()
                """;

            void AddParam(string name, object? value)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = name;
                p.Value = value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }

            AddParam("cid",      companyId.ToString());
            AddParam("pageId",   req.PageId.Trim());
            AddParam("pageName", pageName ?? req.PageId);
            AddParam("token",    encryptedToken);

            await cmd.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi lưu Facebook integration: company={CompanyId}", companyId);
            return StatusCode(503, new { message = "Không thể lưu kết nối. Vui lòng thử lại sau." });
        }

        await audit.LogAsync(
            userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null,
            username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
            action:     "CONNECT_FACEBOOK",
            entityType: "Integration", entityId: req.PageId,
            newValue:   JsonSerializer.Serialize(new { pageId = req.PageId, pageName }),
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        logger.LogInformation("Facebook kết nối thành công: company={CompanyId} page={PageId} ({PageName})",
            companyId, req.PageId, pageName);

        return Ok(new { success = true, message = "Kết nối thành công!", pageName });
    }

    /// <summary>
    /// Lấy trạng thái kết nối Facebook Page của tenant hiện tại.
    /// KHÔNG trả về token — chỉ trả về metadata.
    /// </summary>
    [HttpGet("facebook/status")]
    public async Task<IActionResult> GetFacebookStatus()
    {
        var companyId = tenant.CompanyId;

        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT account_id, account_name, status, is_active, connected_at, last_sync_at, last_error
                FROM   public.integrations
                WHERE  company_id = @cid
                  AND  platform   = 'facebook'
                  AND  is_active  = TRUE
                ORDER BY connected_at DESC NULLS LAST
                LIMIT 1
                """;
            var p = cmd.CreateParameter(); p.ParameterName = "cid"; p.Value = companyId.ToString(); cmd.Parameters.Add(p);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return Ok(new { connected = false });

            return Ok(new
            {
                connected    = reader.GetString(2) == "connected",  // status
                pageId       = reader.GetString(0),
                pageName     = reader.IsDBNull(1) ? null : reader.GetString(1),
                status       = reader.GetString(2),
                isActive     = reader.GetBoolean(3),
                connectedAt  = reader.IsDBNull(4) ? null : reader.GetDateTime(4).ToString("O"),
                lastSyncAt   = reader.IsDBNull(5) ? null : reader.GetDateTime(5).ToString("O"),
                lastError    = reader.IsDBNull(6) ? null : reader.GetString(6),
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi đọc Facebook status: company={CompanyId}", companyId);
            return StatusCode(503, new { message = "Không thể lấy trạng thái kết nối." });
        }
    }

    /// <summary>
    /// Ngắt kết nối Facebook Page (xóa record trong integrations).
    /// </summary>
    [HttpDelete("facebook")]
    public async Task<IActionResult> DisconnectFacebook()
    {
        var companyId = tenant.CompanyId;

        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                DELETE FROM public.integrations
                WHERE  company_id = @cid
                  AND  platform   = 'facebook'
                """;
            var p = cmd.CreateParameter(); p.ParameterName = "cid"; p.Value = companyId.ToString(); cmd.Parameters.Add(p);
            var rows = await cmd.ExecuteNonQueryAsync();

            if (rows == 0)
                return NotFound(new { message = "Chưa kết nối Facebook hoặc đã ngắt kết nối rồi." });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi ngắt kết nối Facebook: company={CompanyId}", companyId);
            return StatusCode(503, new { message = "Không thể ngắt kết nối. Vui lòng thử lại sau." });
        }

        await audit.LogAsync(
            userId:     int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? (int?)uid : null,
            username:   User.FindFirstValue(ClaimTypes.Name) ?? "",
            action:     "DISCONNECT_FACEBOOK",
            entityType: "Integration", entityId: "facebook",
            ipAddress:  HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent:  HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Đã ngắt kết nối Facebook." });
    }

    // ── Scrape Facebook thủ công ─────────────────────────────────────────────

    /// <summary>
    /// Kích hoạt scrape Facebook Page thủ công (gọi Python AI Service).
    /// </summary>
    [HttpPost("/api/sync/scrape-facebook")]
    [Authorize(Roles = "Owner,Manager,DataIT,SuperAdmin")]
    public async Task<IActionResult> ScrapeFacebook()
    {
        var companyId = tenant.CompanyId;

        var client = httpClientFactory.CreateClient("AiService");
        try
        {
            var response = await client.PostAsJsonAsync(
                $"/scrape/facebook?company_id={companyId}",
                new { });

            if (response.IsSuccessStatusCode)
            {
                var result = await response.Content.ReadFromJsonAsync<JsonElement>();
                return Ok(result);
            }

            var errBody = await response.Content.ReadAsStringAsync();
            logger.LogWarning("AI Service scrape-facebook thất bại: {Status} {Body}", response.StatusCode, errBody);
            return StatusCode((int)response.StatusCode, new
            {
                message = "AI Service không thể scrape Facebook. Vui lòng kiểm tra kết nối."
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi gọi AI Service scrape-facebook");
            return StatusCode(503, new { message = "AI Service không khả dụng." });
        }
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    /// <summary>
    /// Validate token bằng cách gọi Graph API GET /{pageId}?fields=name,id.
    /// Trả về (isValid, pageName, errorMessage).
    /// </summary>
    private async Task<(bool Valid, string? PageName, string? Error)> ValidateFacebookToken(
        string pageId, string accessToken)
    {
        try
        {
            var client = httpClientFactory.CreateClient();
            var url    = $"{GraphApiBase}/{pageId}?fields=name,id&access_token={Uri.EscapeDataString(accessToken)}";
            var resp   = await client.GetAsync(url);
            var body   = await resp.Content.ReadAsStringAsync();
            var json   = JsonSerializer.Deserialize<JsonElement>(body);

            if (json.TryGetProperty("error", out var err))
            {
                var errMsg = err.TryGetProperty("message", out var m) ? m.GetString() : body;
                return (false, null, errMsg);
            }

            var name = json.TryGetProperty("name", out var n) ? n.GetString() : pageId;
            return (true, name, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning("ValidateFacebookToken lỗi: {Msg}", ex.Message);
            return (false, null, ex.Message);
        }
    }
}

public class FacebookConnectRequest
{
    public string PageId          { get; set; } = "";
    public string PageAccessToken { get; set; } = "";
}
