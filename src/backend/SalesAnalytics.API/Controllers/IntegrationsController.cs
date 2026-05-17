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

        // 1. Validate token + lấy đúng page ID từ Graph API /me
        var (valid, pageName, actualPageId, errMsg) = await ValidateFacebookToken(req.PageId, req.PageAccessToken);
        if (!valid)
            return BadRequest(new { message = $"Token không hợp lệ hoặc Page ID sai: {errMsg}" });

        // Dùng page ID thực từ /me — tránh lỗi khi user nhập sai page ID trong form
        var resolvedPageId = actualPageId ?? req.PageId;
        if (actualPageId != null && actualPageId != req.PageId)
        {
            logger.LogInformation(
                "Page ID tự động sửa: form={FormId} → actual={ActualId} (từ /me)",
                req.PageId, actualPageId);
        }

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
                    (@cid::uuid, 'facebook', 'scraper', @pageId, @pageName,
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
            AddParam("pageId",   resolvedPageId);
            AddParam("pageName", pageName ?? resolvedPageId);
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
            companyId, resolvedPageId, pageName);

        return Ok(new { success = true, message = "Kết nối thành công!", pageName, pageId = resolvedPageId });
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
                WHERE  company_id = @cid::uuid
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
    /// Kiểm tra token Facebook Page của tenant còn hợp lệ không.
    /// Gọi Graph API GET /{pageId}?fields=name,id để xác nhận.
    /// Trả về: { valid, pageId, pageName, message, hint? }
    /// </summary>
    [HttpGet("facebook/validate")]
    public async Task<IActionResult> ValidateFacebookPageToken()
    {
        var companyId = tenant.CompanyId;

        // 1. Lấy token đã mã hóa từ DB
        string? encryptedToken = null;
        string? pageId         = null;
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT account_id, access_token
                FROM   public.integrations
                WHERE  company_id = @cid::uuid
                  AND  platform   = 'facebook'
                  AND  is_active  = TRUE
                ORDER BY connected_at DESC NULLS LAST
                LIMIT 1
                """;
            var p = cmd.CreateParameter(); p.ParameterName = "cid"; p.Value = companyId.ToString(); cmd.Parameters.Add(p);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return Ok(new { valid = false, message = "Chưa kết nối Facebook Page." });

            pageId         = reader.GetString(0);
            encryptedToken = reader.IsDBNull(1) ? null : reader.GetString(1);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi đọc token Facebook: company={CompanyId}", companyId);
            return StatusCode(503, new { valid = false, message = "Không thể đọc thông tin kết nối." });
        }

        if (string.IsNullOrWhiteSpace(encryptedToken))
            return Ok(new { valid = false, message = "Token chưa được cấu hình." });

        // 2. Giải mã token
        var plainToken = crypto.Decrypt(encryptedToken);

        // 3. Validate qua Graph API
        var (isValid, pageName, actualPageId, errMsg) = await ValidateFacebookToken(pageId ?? "", plainToken);
        if (!isValid)
        {
            return Ok(new
            {
                valid   = false,
                pageId,
                message = $"Token không hợp lệ hoặc đã hết hạn: {errMsg}",
                hint    = "Vui lòng ngắt kết nối và kết nối lại với Long-lived token (60 ngày).",
            });
        }

        return Ok(new
        {
            valid       = true,
            pageId      = actualPageId ?? pageId,
            pageName,
            message     = $"Token hợp lệ — Page: {pageName}",
        });
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
                WHERE  company_id = @cid::uuid
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

    // ── Facebook Posts (xem bài đăng đã scrape) ──────────────────────────────

    /// <summary>
    /// Lấy danh sách bài đăng Facebook đã scrape kèm comments và sentiment.
    /// </summary>
    [HttpGet("facebook/posts")]
    public async Task<IActionResult> GetFacebookPosts(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        var companyId = tenant.CompanyId;
        pageSize = Math.Clamp(pageSize, 1, 50);
        page     = Math.Max(1, page);
        int offset = (page - 1) * pageSize;

        // Dùng NpgsqlConnection riêng biệt — KHÔNG dùng db.Database.GetDbConnection()
        // vì connection đó bị EF Core quản lý lifetime và dễ bị disposed.
        var connStr = db.Database.GetConnectionString()!;

        string? pageId = null;
        await using (var conn0 = new Npgsql.NpgsqlConnection(connStr))
        {
            await conn0.OpenAsync();
            await using var cmd0 = conn0.CreateCommand();
            cmd0.CommandText = @"
                SELECT account_id FROM public.integrations
                WHERE company_id = @cid::uuid AND platform = 'facebook'
                  AND is_active = TRUE AND status = 'connected'
                ORDER BY connected_at DESC NULLS LAST LIMIT 1";
            cmd0.Parameters.AddWithValue("@cid", companyId.ToString());
            var val = await cmd0.ExecuteScalarAsync();
            pageId = val as string;
        }

        if (string.IsNullOrEmpty(pageId))
            return Ok(new { posts = Array.Empty<object>(), total = 0, page, pageSize });

        var countSql = @"
            SELECT COUNT(*)
            FROM public.raw_facebook_data
            WHERE page_name = @pageId";

        var dataSql = @"
            SELECT p.id, p.post_id, p.post_content, p.reactions_count,
                   p.post_date, p.scraped_at, p.comments,
                   SUM(CASE WHEN f.sentiment='positive' THEN 1 ELSE 0 END) AS pos,
                   SUM(CASE WHEN f.sentiment='negative' THEN 1 ELSE 0 END) AS neg,
                   SUM(CASE WHEN f.sentiment='neutral'  THEN 1 ELSE 0 END) AS neu
            FROM   public.raw_facebook_data p
            LEFT JOIN public.facebook_feedback f ON f.post_id = p.post_id
            WHERE  p.page_name = @pageId
            GROUP  BY p.id, p.post_id, p.post_content, p.reactions_count,
                      p.post_date, p.scraped_at, p.comments
            ORDER  BY p.post_date DESC NULLS LAST
            LIMIT  @limit OFFSET @offset";

        await using var conn = new Npgsql.NpgsqlConnection(connStr);
        await conn.OpenAsync();

        // idx: 0=id,1=post_id,2=content,3=reactions,4=post_date,5=scraped_at,6=comments,7=pos,8=neg,9=neu
        long total = 0;
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = countSql;
            cmd.Parameters.AddWithValue("@pageId", pageId);
            total = (long)(await cmd.ExecuteScalarAsync() ?? 0L);
        }

        var posts = new List<object>();
        await using (var cmd = conn.CreateCommand())
        {
            cmd.CommandText = dataSql;
            cmd.Parameters.AddWithValue("@pageId", pageId);
            cmd.Parameters.AddWithValue("@limit",  pageSize);
            cmd.Parameters.AddWithValue("@offset", offset);

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var commentsJson = reader.IsDBNull(6) ? "[]" : reader.GetString(6);
                List<object> comments = new();
                try
                {
                    var arr = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement[]>(commentsJson);
                    if (arr != null)
                        comments = arr.Select(c => (object)new
                        {
                            text      = c.TryGetProperty("comment_text", out var t) ? t.GetString() : "",
                            sentiment = c.TryGetProperty("sentiment",    out var s) ? s.GetString() : "neutral",
                        }).ToList();
                }
                catch { /* ignore */ }

                posts.Add(new
                {
                    id             = reader.GetInt32(0),
                    postId         = reader.GetString(1),
                    content        = reader.IsDBNull(2) ? "" : reader.GetString(2),
                    reactionsCount = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                    postedAt       = reader.IsDBNull(4) ? (DateTime?)null : reader.GetDateTime(4),
                    comments,
                    sentiment = new
                    {
                        positive = reader.IsDBNull(7) ? 0 : Convert.ToInt32(reader.GetValue(7)),
                        negative = reader.IsDBNull(8) ? 0 : Convert.ToInt32(reader.GetValue(8)),
                        neutral  = reader.IsDBNull(9) ? 0 : Convert.ToInt32(reader.GetValue(9)),
                    },
                });
            }
        }

        return Ok(new { posts, total, page, pageSize });
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
    /// Validate Page Access Token qua Graph API.
    ///
    /// Chiến lược 2 bước:
    ///   1. GET /me?fields=id,name  — hoạt động với Page Access Token (token đại diện cho page)
    ///   2. GET /{pageId}?fields=name,id — fallback nếu bước 1 trả về user info
    ///
    /// Lý do dùng /me thay vì /{pageId}:
    ///   Với Page Access Token, /me trả về thông tin Page chứ không phải User.
    ///   GET /{pageId} có thể fail với lỗi "missing permissions" trên Graph API v18+
    ///   dù token hoàn toàn hợp lệ.
    ///
    /// Trả về (isValid, pageName, errorMessage).
    /// </summary>
    private async Task<(bool Valid, string? PageName, string? ActualPageId, string? Error)> ValidateFacebookToken(
        string pageId, string accessToken)
    {
        try
        {
            var client = httpClientFactory.CreateClient();

            // Bước 1: GET /me — với Page Access Token, /me trả về thông tin Page (id, name)
            var meUrl = $"{GraphApiBase}/me?fields=id,name&access_token={Uri.EscapeDataString(accessToken)}";
            var resp  = await client.GetAsync(meUrl);
            var body  = await resp.Content.ReadAsStringAsync();
            var json  = JsonSerializer.Deserialize<JsonElement>(body);

            if (!json.TryGetProperty("error", out _))
            {
                var name       = json.TryGetProperty("name", out var n) ? n.GetString() : pageId;
                var returnedId = json.TryGetProperty("id",   out var i) ? i.GetString() : null;

                if (returnedId != null && returnedId != pageId)
                    logger.LogInformation(
                        "Facebook /me trả về pageId={Actual} (user nhập={Entered}) — dùng ID thực",
                        returnedId, pageId);

                return (true, name, returnedId, null);
            }

            // Bước 2: fallback → GET /{pageId}?fields=name,id
            logger.LogDebug("ValidateFacebookToken: /me lỗi, fallback GET /{PageId}", pageId);
            var pageUrl = $"{GraphApiBase}/{pageId}?fields=name,id&access_token={Uri.EscapeDataString(accessToken)}";
            var resp2   = await client.GetAsync(pageUrl);
            var body2   = await resp2.Content.ReadAsStringAsync();
            var json2   = JsonSerializer.Deserialize<JsonElement>(body2);

            if (json2.TryGetProperty("error", out var err2))
            {
                var errMsg = err2.TryGetProperty("message", out var m) ? m.GetString() : body2;
                return (false, null, null, errMsg);
            }

            var name2 = json2.TryGetProperty("name", out var n2) ? n2.GetString() : pageId;
            return (true, name2, pageId, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning("ValidateFacebookToken lỗi: {Msg}", ex.Message);
            return (false, null, null, ex.Message);
        }
    }

    // ── Shopee ────────────────────────────────────────────────────────────────

    [HttpPost("shopee")]
    public async Task<IActionResult> ConnectShopee([FromBody] ShopeeConnectRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.PartnerId) || string.IsNullOrWhiteSpace(req.PartnerKey)
            || string.IsNullOrWhiteSpace(req.ShopId) || string.IsNullOrWhiteSpace(req.AccessToken))
            return BadRequest(new { message = "Vui lòng nhập đầy đủ PartnerId, PartnerKey, ShopId và AccessToken." });

        var companyId = tenant.CompanyId;

        // Validate bằng cách gọi Shopee API GET /api/v2/shop/get_shop_info
        var (valid, shopName, errMsg) = await ValidateShopeeToken(req.PartnerId, req.PartnerKey, req.ShopId, req.AccessToken);
        if (!valid)
            return BadRequest(new { message = $"Credentials không hợp lệ: {errMsg}" });

        var payload = crypto.Encrypt(System.Text.Json.JsonSerializer.Serialize(new
        {
            partnerId   = req.PartnerId,
            partnerKey  = req.PartnerKey,
            shopId      = req.ShopId,
            accessToken = req.AccessToken,
        }));

        await UpsertIntegration(companyId.ToString(), "shopee", req.ShopId, shopName ?? req.ShopId, payload);
        await audit.LogAsync(null, User.FindFirstValue(ClaimTypes.Name) ?? "", "CONNECT_SHOPEE",
            "Integration", req.ShopId, JsonSerializer.Serialize(new { shopId = req.ShopId, shopName }),
            HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Kết nối Shopee thành công!", shopName });
    }

    [HttpGet("shopee/status")]
    public async Task<IActionResult> GetShopeeStatus()
        => await GetIntegrationStatus(tenant.CompanyId.ToString(), "shopee");

    [HttpDelete("shopee")]
    public async Task<IActionResult> DisconnectShopee()
        => await DeleteIntegration(tenant.CompanyId.ToString(), "shopee", "DISCONNECT_SHOPEE");

    private async Task<(bool Valid, string? ShopName, string? Error)> ValidateShopeeToken(
        string partnerId, string partnerKey, string shopId, string accessToken)
    {
        try
        {
            long ts      = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            string basePath = "/api/v2/shop/get_shop_info";
            string baseStr  = $"{partnerId}{basePath}{ts}";
            using var hmac = new System.Security.Cryptography.HMACSHA256(
                System.Text.Encoding.UTF8.GetBytes(partnerKey));
            var sig = Convert.ToHexString(
                hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(baseStr))).ToLower();

            var url = $"https://partner.shopeemobile.com{basePath}?partner_id={partnerId}&timestamp={ts}&access_token={accessToken}&shop_id={shopId}&sign={sig}";
            var client = httpClientFactory.CreateClient();
            var resp   = await client.GetAsync(url);
            var body   = await resp.Content.ReadAsStringAsync();
            var json   = JsonSerializer.Deserialize<JsonElement>(body);

            if (json.TryGetProperty("error", out var err) && err.GetString() != "")
                return (false, null, err.GetString());

            var name = json.TryGetProperty("response", out var r)
                       && r.TryGetProperty("shop_name", out var n) ? n.GetString() : shopId;
            return (true, name, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning("ValidateShopeeToken lỗi: {Msg}", ex.Message);
            return (false, null, ex.Message);
        }
    }

    // ── Lazada ────────────────────────────────────────────────────────────────

    [HttpPost("lazada")]
    public async Task<IActionResult> ConnectLazada([FromBody] LazadaConnectRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.AppKey) || string.IsNullOrWhiteSpace(req.AppSecret)
            || string.IsNullOrWhiteSpace(req.AccessToken))
            return BadRequest(new { message = "Vui lòng nhập đầy đủ AppKey, AppSecret và AccessToken." });

        var companyId = tenant.CompanyId;

        var (valid, sellerName, errMsg) = await ValidateLazadaToken(req.AppKey, req.AppSecret, req.AccessToken);
        if (!valid)
            return BadRequest(new { message = $"Credentials không hợp lệ: {errMsg}" });

        var payload = crypto.Encrypt(JsonSerializer.Serialize(new
        {
            appKey      = req.AppKey,
            appSecret   = req.AppSecret,
            accessToken = req.AccessToken,
        }));

        await UpsertIntegration(companyId.ToString(), "lazada", req.AppKey, sellerName ?? req.AppKey, payload);
        await audit.LogAsync(null, User.FindFirstValue(ClaimTypes.Name) ?? "", "CONNECT_LAZADA",
            "Integration", req.AppKey, null,
            HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Kết nối Lazada thành công!", sellerName });
    }

    [HttpGet("lazada/status")]
    public async Task<IActionResult> GetLazadaStatus()
        => await GetIntegrationStatus(tenant.CompanyId.ToString(), "lazada");

    [HttpDelete("lazada")]
    public async Task<IActionResult> DisconnectLazada()
        => await DeleteIntegration(tenant.CompanyId.ToString(), "lazada", "DISCONNECT_LAZADA");

    private async Task<(bool Valid, string? SellerName, string? Error)> ValidateLazadaToken(
        string appKey, string appSecret, string accessToken)
    {
        try
        {
            // Lazada API /seller/get
            long   ts    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            string path  = "/seller/get";
            string paramStr = $"access_token{accessToken}app_key{appKey}timestamp{ts}";
            string signBase = path + paramStr;
            using var hmac = new System.Security.Cryptography.HMACSHA256(
                System.Text.Encoding.UTF8.GetBytes(appSecret));
            var sign = Convert.ToHexString(
                hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(signBase))).ToUpper();

            var url = $"https://api.lazada.vn/rest{path}?access_token={Uri.EscapeDataString(accessToken)}&app_key={Uri.EscapeDataString(appKey)}&timestamp={ts}&sign={Uri.EscapeDataString(sign)}&sign_method=sha256";
            var client = httpClientFactory.CreateClient();
            var resp   = await client.GetAsync(url);
            var body   = await resp.Content.ReadAsStringAsync();
            var json   = JsonSerializer.Deserialize<JsonElement>(body);

            if (json.TryGetProperty("code", out var code) && code.GetString() != "0")
            {
                var msg = json.TryGetProperty("message", out var m) ? m.GetString() : body;
                return (false, null, msg);
            }

            string? sellerName = null;
            if (json.TryGetProperty("result", out var res) && res.TryGetProperty("name", out var n))
                sellerName = n.GetString();
            return (true, sellerName, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning("ValidateLazadaToken lỗi: {Msg}", ex.Message);
            return (false, null, ex.Message);
        }
    }

    // ── TikTok Shop ───────────────────────────────────────────────────────────

    [HttpPost("tiktok")]
    public async Task<IActionResult> ConnectTikTok([FromBody] TikTokConnectRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.AppKey) || string.IsNullOrWhiteSpace(req.AppSecret)
            || string.IsNullOrWhiteSpace(req.AccessToken) || string.IsNullOrWhiteSpace(req.ShopId))
            return BadRequest(new { message = "Vui lòng nhập đầy đủ AppKey, AppSecret, ShopId và AccessToken." });

        var companyId = tenant.CompanyId;

        var (valid, shopName, errMsg) = await ValidateTikTokToken(req.AppKey, req.AppSecret, req.AccessToken, req.ShopId);
        if (!valid)
            return BadRequest(new { message = $"Credentials không hợp lệ: {errMsg}" });

        var payload = crypto.Encrypt(JsonSerializer.Serialize(new
        {
            appKey      = req.AppKey,
            appSecret   = req.AppSecret,
            accessToken = req.AccessToken,
            shopId      = req.ShopId,
        }));

        await UpsertIntegration(companyId.ToString(), "tiktok", req.ShopId, shopName ?? req.ShopId, payload);
        await audit.LogAsync(null, User.FindFirstValue(ClaimTypes.Name) ?? "", "CONNECT_TIKTOK",
            "Integration", req.ShopId, null,
            HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Kết nối TikTok Shop thành công!", shopName });
    }

    [HttpGet("tiktok/status")]
    public async Task<IActionResult> GetTikTokStatus()
        => await GetIntegrationStatus(tenant.CompanyId.ToString(), "tiktok");

    [HttpDelete("tiktok")]
    public async Task<IActionResult> DisconnectTikTok()
        => await DeleteIntegration(tenant.CompanyId.ToString(), "tiktok", "DISCONNECT_TIKTOK");

    private async Task<(bool Valid, string? ShopName, string? Error)> ValidateTikTokToken(
        string appKey, string appSecret, string accessToken, string shopId)
    {
        try
        {
            // TikTok Shop API: GET /authorization/202309/shops
            long   ts      = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            string path    = "/authorization/202309/shops";
            string signStr = $"{appSecret}{path}app_key{appKey}timestamp{ts}{appSecret}";
            using var sha  = System.Security.Cryptography.SHA256.Create();
            var sign = Convert.ToHexString(
                sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(signStr))).ToLower();

            var url = $"https://open-api.tiktokglobalshop.com{path}?app_key={appKey}&timestamp={ts}&sign={sign}";
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("x-tts-access-token", accessToken);
            var resp = await client.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();
            var json = JsonSerializer.Deserialize<JsonElement>(body);

            if (json.TryGetProperty("code", out var code) && code.GetInt32() != 0)
            {
                var msg = json.TryGetProperty("message", out var m) ? m.GetString() : body;
                return (false, null, msg);
            }

            // Lấy tên shop theo shopId
            string? shopName = null;
            if (json.TryGetProperty("data", out var data)
                && data.TryGetProperty("shops", out var shops)
                && shops.ValueKind == JsonValueKind.Array)
            {
                foreach (var s in shops.EnumerateArray())
                {
                    if (s.TryGetProperty("shop_id", out var sid) && sid.GetString() == shopId)
                    {
                        if (s.TryGetProperty("shop_name", out var n)) shopName = n.GetString();
                        break;
                    }
                }
            }
            return (true, shopName, null);
        }
        catch (Exception ex)
        {
            logger.LogWarning("ValidateTikTokToken lỗi: {Msg}", ex.Message);
            return (false, null, ex.Message);
        }
    }

    // ── GHN ───────────────────────────────────────────────────────────────────

    [HttpPost("ghn")]
    public async Task<IActionResult> ConnectGhn([FromBody] GhnConnectRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Token) || string.IsNullOrWhiteSpace(req.ShopId))
            return BadRequest(new { message = "Vui lòng nhập đầy đủ Token và Shop ID." });

        var companyId = tenant.CompanyId;

        var (valid, shopName, errMsg) = await ValidateGhnToken(req.Token, req.ShopId);
        if (!valid)
            return BadRequest(new { message = $"Token GHN không hợp lệ: {errMsg}" });

        var payload = crypto.Encrypt(JsonSerializer.Serialize(new
        {
            token  = req.Token,
            shopId = req.ShopId,
        }));

        await UpsertIntegration(companyId.ToString(), "ghn", req.ShopId, shopName ?? $"GHN Shop {req.ShopId}", payload);
        await audit.LogAsync(null, User.FindFirstValue(ClaimTypes.Name) ?? "", "CONNECT_GHN",
            "Integration", req.ShopId, null,
            HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = "Kết nối GHN thành công!", shopName });
    }

    [HttpGet("ghn/status")]
    public async Task<IActionResult> GetGhnStatus()
        => await GetIntegrationStatus(tenant.CompanyId.ToString(), "ghn");

    [HttpDelete("ghn")]
    public async Task<IActionResult> DisconnectGhn()
        => await DeleteIntegration(tenant.CompanyId.ToString(), "ghn", "DISCONNECT_GHN");

    private async Task<(bool Valid, string? ShopName, string? Error)> ValidateGhnToken(string token, string shopId)
    {
        try
        {
            var client = httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Add("Token", token);
            if (int.TryParse(shopId, out var sid))
                client.DefaultRequestHeaders.Add("ShopId", sid.ToString());

            var resp = await client.GetAsync("https://online-gateway.ghn.vn/shiip/public-api/v2/shop/all");
            var body = await resp.Content.ReadAsStringAsync();
            var json = JsonSerializer.Deserialize<JsonElement>(body);

            if (json.TryGetProperty("code", out var code) && code.GetInt32() != 200)
            {
                var msg = json.TryGetProperty("message", out var m) ? m.GetString() : body;
                return (false, null, msg);
            }

            // Tìm shop khớp shopId
            string? shopName = null;
            if (json.TryGetProperty("data", out var data) && data.TryGetProperty("shops", out var shops)
                && shops.ValueKind == JsonValueKind.Array)
            {
                foreach (var s in shops.EnumerateArray())
                {
                    if (s.TryGetProperty("_id", out var id) && id.GetInt32().ToString() == shopId)
                    {
                        if (s.TryGetProperty("name", out var n)) shopName = n.GetString();
                        break;
                    }
                }
            }
            return (true, shopName ?? $"GHN Shop {shopId}", null);
        }
        catch (Exception ex)
        {
            logger.LogWarning("ValidateGhnToken lỗi: {Msg}", ex.Message);
            return (false, null, ex.Message);
        }
    }

    // ── VNPay ─────────────────────────────────────────────────────────────────

    [HttpPost("vnpay")]
    public async Task<IActionResult> ConnectVnPay([FromBody] VnPayConnectRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.MerchantId) || string.IsNullOrWhiteSpace(req.HashSecret))
            return BadRequest(new { message = "Vui lòng nhập đầy đủ Merchant ID và Hash Secret." });

        // VNPay không có endpoint validate riêng — kiểm tra format
        if (req.MerchantId.Length < 4 || req.HashSecret.Length < 8)
            return BadRequest(new { message = "Merchant ID hoặc Hash Secret không đúng định dạng." });

        var companyId = tenant.CompanyId;
        var env       = req.Environment == "production" ? "production" : "sandbox";
        var payload = crypto.Encrypt(JsonSerializer.Serialize(new
        {
            merchantId  = req.MerchantId,
            hashSecret  = req.HashSecret,
            environment = env,
        }));

        await UpsertIntegration(companyId.ToString(), "vnpay", req.MerchantId, $"VNPay ({env}) – {req.MerchantId}", payload);
        await audit.LogAsync(null, User.FindFirstValue(ClaimTypes.Name) ?? "", "CONNECT_VNPAY",
            "Integration", req.MerchantId, JsonSerializer.Serialize(new { merchantId = req.MerchantId, env }),
            HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = $"Đã lưu cấu hình VNPay ({env}).", merchantId = req.MerchantId });
    }

    [HttpGet("vnpay/status")]
    public async Task<IActionResult> GetVnPayStatus()
        => await GetIntegrationStatus(tenant.CompanyId.ToString(), "vnpay");

    [HttpDelete("vnpay")]
    public async Task<IActionResult> DisconnectVnPay()
        => await DeleteIntegration(tenant.CompanyId.ToString(), "vnpay", "DISCONNECT_VNPAY");

    // ── Helper dùng chung ─────────────────────────────────────────────────────

    private async Task UpsertIntegration(string companyId, string platform, string accountId, string accountName, string encryptedPayload)
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
                (@cid::uuid, @platform, 'api', @accountId, @accountName,
                 @token, 'connected', TRUE, NOW(), NOW(), NOW())
            ON CONFLICT (company_id, platform, account_id) DO UPDATE
            SET access_token  = EXCLUDED.access_token,
                account_name  = EXCLUDED.account_name,
                status        = 'connected',
                is_active     = TRUE,
                connected_at  = NOW(),
                updated_at    = NOW()
            """;

        void P(string n, object? v) { var p = cmd.CreateParameter(); p.ParameterName = n; p.Value = v ?? DBNull.Value; cmd.Parameters.Add(p); }
        P("cid",         companyId);
        P("platform",    platform);
        P("accountId",   accountId);
        P("accountName", accountName);
        P("token",       encryptedPayload);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<IActionResult> GetIntegrationStatus(string companyId, string platform)
    {
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = """
                SELECT account_id, account_name, status, is_active, connected_at, last_sync_at
                FROM   public.integrations
                WHERE  company_id = @cid::uuid AND platform = @platform AND is_active = TRUE
                ORDER BY connected_at DESC NULLS LAST LIMIT 1
                """;
            void P(string n, object? v) { var p = cmd.CreateParameter(); p.ParameterName = n; p.Value = v ?? DBNull.Value; cmd.Parameters.Add(p); }
            P("cid", companyId); P("platform", platform);

            await using var reader = await cmd.ExecuteReaderAsync();
            if (!await reader.ReadAsync()) return Ok(new { connected = false });

            return Ok(new
            {
                connected   = reader.GetString(2) == "connected",
                accountId   = reader.GetString(0),
                accountName = reader.IsDBNull(1) ? null : reader.GetString(1),
                status      = reader.GetString(2),
                connectedAt = reader.IsDBNull(4) ? null : reader.GetDateTime(4).ToString("O"),
                lastSyncAt  = reader.IsDBNull(5) ? null : reader.GetDateTime(5).ToString("O"),
            });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi đọc {Platform} status: company={CompanyId}", platform, companyId);
            return StatusCode(503, new { message = "Không thể lấy trạng thái kết nối." });
        }
    }

    private async Task<IActionResult> DeleteIntegration(string companyId, string platform, string auditAction)
    {
        try
        {
            var conn = db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync();

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM public.integrations WHERE company_id = @cid::uuid AND platform = @platform";
            void P(string n, object? v) { var p = cmd.CreateParameter(); p.ParameterName = n; p.Value = v ?? DBNull.Value; cmd.Parameters.Add(p); }
            P("cid", companyId); P("platform", platform);
            var rows = await cmd.ExecuteNonQueryAsync();

            if (rows == 0)
                return NotFound(new { message = $"Chưa kết nối {platform} hoặc đã ngắt kết nối rồi." });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi ngắt kết nối {Platform}", platform);
            return StatusCode(503, new { message = "Không thể ngắt kết nối. Vui lòng thử lại sau." });
        }

        await audit.LogAsync(null, User.FindFirstValue(ClaimTypes.Name) ?? "", auditAction,
            "Integration", platform, null,
            HttpContext.Connection.RemoteIpAddress?.ToString(), HttpContext.Request.Headers["User-Agent"].ToString());

        return Ok(new { success = true, message = $"Đã ngắt kết nối {platform}." });
    }
}

// ── Request DTOs ──────────────────────────────────────────────────────────────

public class FacebookConnectRequest
{
    public string PageId          { get; set; } = "";
    public string PageAccessToken { get; set; } = "";
}

public class ShopeeConnectRequest
{
    public string PartnerId   { get; set; } = "";
    public string PartnerKey  { get; set; } = "";
    public string ShopId      { get; set; } = "";
    public string AccessToken { get; set; } = "";
}

public class LazadaConnectRequest
{
    public string AppKey      { get; set; } = "";
    public string AppSecret   { get; set; } = "";
    public string AccessToken { get; set; } = "";
}

public class TikTokConnectRequest
{
    public string AppKey      { get; set; } = "";
    public string AppSecret   { get; set; } = "";
    public string AccessToken { get; set; } = "";
    public string ShopId      { get; set; } = "";
}

public class GhnConnectRequest
{
    public string Token  { get; set; } = "";
    public string ShopId { get; set; } = "";
}

public class VnPayConnectRequest
{
    public string MerchantId  { get; set; } = "";
    public string HashSecret  { get; set; } = "";
    public string Environment { get; set; } = "sandbox";
}
