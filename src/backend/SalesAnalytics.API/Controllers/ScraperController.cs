using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý từ khóa tìm kiếm cho Google/Facebook scraper.
/// Cho phép thêm, xóa, bật/tắt keyword qua giao diện — không cần sửa code.
/// </summary>
[ApiController]
[Route("api/scraper")]
[Authorize(Roles = "Admin,DataIT")]
public class ScraperController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<ScraperController> _logger;

    public ScraperController(AppDbContext db, ILogger<ScraperController> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ── GET /api/scraper/keywords ────────────────────────────────────────────

    /// <summary>Lấy danh sách từ khóa tìm kiếm.</summary>
    [HttpGet("keywords")]
    public async Task<IActionResult> GetKeywords(
        [FromQuery] string? sourceType = null,
        [FromQuery] bool?   activeOnly = null)
    {
        var query = _db.ScraperKeywords.AsQueryable();

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

    // ── POST /api/scraper/keywords ───────────────────────────────────────────

    /// <summary>Thêm từ khóa mới.</summary>
    [HttpPost("keywords")]
    public async Task<IActionResult> AddKeyword([FromBody] AddKeywordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Keyword))
            return BadRequest(new { message = "Từ khóa không được để trống." });

        var sourceType = req.SourceType?.ToLower() switch
        {
            "facebook" => "facebook",
            _          => "google",
        };

        var keyword = req.Keyword.Trim();

        var exists = await _db.ScraperKeywords
            .AnyAsync(k => k.Keyword == keyword && k.SourceType == sourceType);

        if (exists)
            return Conflict(new { message = "Từ khóa này đã tồn tại." });

        var entity = new ScraperKeyword
        {
            Keyword    = keyword,
            SourceType = sourceType,
            IsActive   = true,
            CreatedAt  = DateTime.UtcNow,
        };

        _db.ScraperKeywords.Add(entity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Thêm keyword scraper: '{Keyword}' ({SourceType})", keyword, sourceType);

        return CreatedAtAction(nameof(GetKeywords), new { id = entity.Id }, new
        {
            entity.Id,
            entity.Keyword,
            entity.SourceType,
            entity.IsActive,
        });
    }

    // ── PUT /api/scraper/keywords/{id}/toggle ────────────────────────────────

    /// <summary>Bật/tắt từ khóa (toggle IsActive).</summary>
    [HttpPut("keywords/{id:int}/toggle")]
    public async Task<IActionResult> ToggleKeyword(int id)
    {
        var entity = await _db.ScraperKeywords.FindAsync(id);
        if (entity is null)
            return NotFound(new { message = $"Không tìm thấy keyword id={id}." });

        entity.IsActive = !entity.IsActive;
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Toggle keyword id={Id}: IsActive={IsActive}", id, entity.IsActive);

        return Ok(new
        {
            entity.Id,
            entity.Keyword,
            entity.IsActive,
            message = entity.IsActive ? "Đã bật từ khóa." : "Đã tắt từ khóa.",
        });
    }

    // ── DELETE /api/scraper/keywords/{id} ────────────────────────────────────

    /// <summary>Xóa từ khóa.</summary>
    [HttpDelete("keywords/{id:int}")]
    public async Task<IActionResult> DeleteKeyword(int id)
    {
        var entity = await _db.ScraperKeywords.FindAsync(id);
        if (entity is null)
            return NotFound(new { message = $"Không tìm thấy keyword id={id}." });

        _db.ScraperKeywords.Remove(entity);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Xóa keyword scraper id={Id}: '{Keyword}'", id, entity.Keyword);

        return Ok(new { message = $"Đã xóa từ khóa '{entity.Keyword}'." });
    }
}

public class AddKeywordRequest
{
    public string? Keyword    { get; set; }
    public string? SourceType { get; set; }
}
