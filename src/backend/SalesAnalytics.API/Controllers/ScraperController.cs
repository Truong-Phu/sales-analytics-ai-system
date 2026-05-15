using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý từ khóa tìm kiếm cho Google/Facebook scraper.
/// Cho phép thêm, xóa, bật/tắt keyword qua giao diện — không cần sửa code.
/// Multi-tenant: mỗi công ty chỉ thấy keyword của mình.
/// </summary>
[ApiController]
[Route("api/scraper")]
[Authorize(Roles = "Owner,Manager,DataIT")]
public class ScraperController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly ILogger<ScraperController> _logger;

    public ScraperController(AppDbContext db, ITenantContext tenant, ILogger<ScraperController> logger)
    {
        _db     = db;
        _tenant = tenant;
        _logger = logger;
    }

    private int CurrentUserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    // ── GET /api/scraper/keywords ────────────────────────────────────────────

    /// <summary>Lấy danh sách từ khóa của công ty hiện tại.</summary>
    [HttpGet("keywords")]
    public async Task<IActionResult> GetKeywords(
        [FromQuery] string? sourceType = null,
        [FromQuery] bool?   activeOnly = null)
    {
        try
        {
            var companyId = _tenant.CompanyId;
            var query = _db.ScraperKeywords
                .Where(k => k.CompanyId == companyId)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(sourceType))
                query = query.Where(k => k.SourceType == sourceType);

            if (activeOnly == true)
                query = query.Where(k => k.IsActive);

            var keywords = await query
                .OrderByDescending(k => k.IsActive)
                .ThenBy(k => k.SourceType)
                .ThenBy(k => k.Keyword)
                .Select(k => new
                {
                    k.Id,
                    k.Keyword,
                    k.SourceType,
                    k.IsActive,
                    k.UseCount,
                    lastUsedAt = k.LastUsedAt.HasValue ? k.LastUsedAt.Value.ToString("O") : null,
                    createdAt  = k.CreatedAt.ToString("O"),
                })
                .ToListAsync();

            return Ok(new { keywords, total = keywords.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi lấy danh sách keyword scraper");
            return StatusCode(503, new { message = "Không thể tải danh sách từ khóa. Vui lòng thử lại." });
        }
    }

    // ── POST /api/scraper/keywords ───────────────────────────────────────────

    /// <summary>Thêm từ khóa mới cho công ty hiện tại.</summary>
    [HttpPost("keywords")]
    public async Task<IActionResult> AddKeyword([FromBody] AddKeywordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Keyword))
            return BadRequest(new { message = "Từ khóa không được để trống." });

        try
        {
            var companyId = _tenant.CompanyId;
            var sourceType = req.SourceType?.ToLower() switch
            {
                "facebook" => "facebook",
                _          => "google",
            };
            var keyword = req.Keyword.Trim();

            // Kiểm tra duplicate trong cùng công ty
            var exists = await _db.ScraperKeywords
                .AnyAsync(k => k.Keyword == keyword && k.SourceType == sourceType && k.CompanyId == companyId);

            if (exists)
                return Conflict(new { message = "Từ khóa này đã tồn tại." });

            var entity = new ScraperKeyword
            {
                Keyword    = keyword,
                SourceType = sourceType,
                IsActive   = true,
                CompanyId  = companyId,
                CreatedBy  = CurrentUserId,
                CreatedAt  = DateTime.UtcNow,
            };

            _db.ScraperKeywords.Add(entity);
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "Thêm keyword scraper: '{Keyword}' ({SourceType}), company={CompanyId}",
                keyword, sourceType, companyId);

            return CreatedAtAction(nameof(GetKeywords), new { id = entity.Id }, new
            {
                entity.Id,
                entity.Keyword,
                entity.SourceType,
                entity.IsActive,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi thêm keyword scraper");
            return StatusCode(503, new { message = "Không thể thêm từ khóa. Vui lòng thử lại." });
        }
    }

    // ── PUT /api/scraper/keywords/{id}/toggle ────────────────────────────────

    /// <summary>Bật/tắt từ khóa — chỉ keyword của công ty mình.</summary>
    [HttpPut("keywords/{id:int}/toggle")]
    public async Task<IActionResult> ToggleKeyword(int id)
    {
        try
        {
            var companyId = _tenant.CompanyId;
            var entity = await _db.ScraperKeywords
                .FirstOrDefaultAsync(k => k.Id == id && k.CompanyId == companyId);

            if (entity is null)
                return NotFound(new { message = $"Không tìm thấy keyword id={id}." });

            entity.IsActive = !entity.IsActive;
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "Toggle keyword id={Id}: IsActive={IsActive}, company={CompanyId}",
                id, entity.IsActive, companyId);

            return Ok(new
            {
                entity.Id,
                entity.Keyword,
                entity.IsActive,
                message = entity.IsActive ? "Đã bật từ khóa." : "Đã tắt từ khóa.",
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi toggle keyword id={Id}", id);
            return StatusCode(503, new { message = "Không thể cập nhật từ khóa. Vui lòng thử lại." });
        }
    }

    // ── DELETE /api/scraper/keywords/{id} ────────────────────────────────────

    /// <summary>Xóa từ khóa — chỉ keyword của công ty mình.</summary>
    [HttpDelete("keywords/{id:int}")]
    public async Task<IActionResult> DeleteKeyword(int id)
    {
        try
        {
            var companyId = _tenant.CompanyId;
            var entity = await _db.ScraperKeywords
                .FirstOrDefaultAsync(k => k.Id == id && k.CompanyId == companyId);

            if (entity is null)
                return NotFound(new { message = $"Không tìm thấy keyword id={id}." });

            _db.ScraperKeywords.Remove(entity);
            await _db.SaveChangesAsync();

            _logger.LogInformation(
                "Xóa keyword scraper id={Id}: '{Keyword}', company={CompanyId}",
                id, entity.Keyword, companyId);

            return Ok(new { message = $"Đã xóa từ khóa '{entity.Keyword}'." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi xóa keyword id={Id}", id);
            return StatusCode(503, new { message = "Không thể xóa từ khóa. Vui lòng thử lại." });
        }
    }
}

public class AddKeywordRequest
{
    public string? Keyword    { get; set; }
    public string? SourceType { get; set; }
}
