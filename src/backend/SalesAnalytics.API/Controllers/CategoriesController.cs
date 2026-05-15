using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CategoriesController(
    AppDbContext db,
    ITenantContext tenant) : ControllerBase
{
    // ── GET /api/categories ───────────────────────────────────────────────────
    /// <summary>Lấy danh sách danh mục theo company (bao gồm cả danh mục chung)</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var companyId = tenant.CompanyId;

        var cats = await db.Categories
            .Where(c => c.CompanyId == companyId || c.CompanyId == null)
            .OrderBy(c => c.SortOrder)
            .ThenBy(c => c.CategoryName)
            .Select(c => new
            {
                categoryId   = c.CategoryId,
                categoryName = c.CategoryName,
                slug         = c.Slug,
                description  = c.Description,
                parentId     = c.ParentId,
                level        = c.Level,
                sortOrder    = c.SortOrder,
                isActive     = c.IsActive,
                companyId    = c.CompanyId,
                createdAt    = c.CreatedAt,
                productCount = c.Products.Count(p => p.IsActive),
            })
            .ToListAsync();

        return Ok(new { success = true, data = cats, total = cats.Count });
    }

    // ── POST /api/categories ──────────────────────────────────────────────────
    /// <summary>Tạo danh mục mới cho company</summary>
    [HttpPost]
    [Authorize(Roles = "Owner,Manager,DataIT")]
    public async Task<IActionResult> Create([FromBody] CategoryRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CategoryName))
            return BadRequest(new { success = false, message = "Tên danh mục là bắt buộc." });

        var companyId = tenant.CompanyId;
        var slug      = GenerateSlug(req.CategoryName);

        // Đảm bảo slug unique trong company
        var slugExists = await db.Categories
            .AnyAsync(c => c.Slug == slug && (c.CompanyId == companyId || c.CompanyId == null));
        if (slugExists) slug = $"{slug}-{Guid.NewGuid().ToString()[..6]}";

        short level = 1;
        if (req.ParentId.HasValue)
        {
            var parent = await db.Categories.FindAsync(req.ParentId.Value);
            if (parent == null) return BadRequest(new { success = false, message = "Danh mục cha không tồn tại." });
            level = (short)Math.Min(parent.Level + 1, 5);
        }

        var cat = new Category
        {
            CategoryName = req.CategoryName.Trim(),
            Slug         = slug,
            Description  = req.Description,
            ParentId     = req.ParentId,
            Level        = level,
            SortOrder    = req.SortOrder ?? 0,
            IsActive     = true,
            CompanyId    = companyId,
        };

        db.Categories.Add(cat);
        await db.SaveChangesAsync();

        return Ok(new { success = true, message = "Tạo danh mục thành công.", data = new { cat.CategoryId, cat.CategoryName, cat.Slug } });
    }

    // ── PUT /api/categories/{id} ──────────────────────────────────────────────
    /// <summary>Cập nhật danh mục</summary>
    [HttpPut("{id:int}")]
    [Authorize(Roles = "Owner,Manager,DataIT")]
    public async Task<IActionResult> Update(int id, [FromBody] CategoryRequest req)
    {
        var companyId = tenant.CompanyId;
        var cat = await db.Categories
            .FirstOrDefaultAsync(c => c.CategoryId == id && (c.CompanyId == companyId || c.CompanyId == null));

        if (cat == null) return NotFound(new { success = false, message = "Không tìm thấy danh mục." });

        cat.CategoryName = req.CategoryName?.Trim() ?? cat.CategoryName;
        cat.Description  = req.Description;
        cat.SortOrder    = req.SortOrder ?? cat.SortOrder;

        if (req.ParentId != cat.ParentId)
        {
            if (req.ParentId == id) return BadRequest(new { success = false, message = "Không thể chọn chính mình làm danh mục cha." });
            if (req.ParentId.HasValue)
            {
                var parent = await db.Categories.FindAsync(req.ParentId.Value);
                if (parent == null) return BadRequest(new { success = false, message = "Danh mục cha không tồn tại." });
                cat.Level = (short)Math.Min(parent.Level + 1, 5);
            }
            else cat.Level = 1;
            cat.ParentId = req.ParentId;
        }

        // Cập nhật slug nếu tên thay đổi — kiểm tra duplicate trong cùng company
        if (!string.IsNullOrWhiteSpace(req.CategoryName) && req.CategoryName.Trim() != cat.CategoryName)
        {
            var newSlug = GenerateSlug(req.CategoryName);
            var slugUsed = await db.Categories
                .AnyAsync(c => c.Slug == newSlug && c.CategoryId != id
                            && (c.CompanyId == cat.CompanyId || c.CompanyId == null));
            cat.Slug = slugUsed ? $"{newSlug}-{Guid.NewGuid().ToString()[..6]}" : newSlug;
        }

        await db.SaveChangesAsync();
        return Ok(new { success = true, message = "Cập nhật danh mục thành công." });
    }

    // ── DELETE /api/categories/{id} ───────────────────────────────────────────
    /// <summary>Xóa mềm danh mục (is_active = false). Không xóa nếu còn sản phẩm đang dùng.</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = "Owner,Manager,DataIT")]
    public async Task<IActionResult> Delete(int id)
    {
        var companyId = tenant.CompanyId;
        var cat = await db.Categories
            .Include(c => c.Products)
            .FirstOrDefaultAsync(c => c.CategoryId == id && c.CompanyId == companyId);

        if (cat == null) return NotFound(new { success = false, message = "Không tìm thấy danh mục." });

        var activeProducts = cat.Products.Count(p => p.IsActive);
        if (activeProducts > 0)
            return BadRequest(new { success = false, message = $"Danh mục đang được sử dụng bởi {activeProducts} sản phẩm." });

        // Soft delete
        cat.IsActive = false;
        await db.SaveChangesAsync();

        return Ok(new { success = true, message = "Đã xóa danh mục." });
    }

    // ── PATCH /api/categories/{id}/toggle ────────────────────────────────────
    /// <summary>Bật/tắt trạng thái danh mục inline</summary>
    [HttpPatch("{id:int}/toggle")]
    [Authorize(Roles = "Owner,Manager,DataIT")]
    public async Task<IActionResult> Toggle(int id)
    {
        var companyId = tenant.CompanyId;
        var cat = await db.Categories
            .FirstOrDefaultAsync(c => c.CategoryId == id && c.CompanyId == companyId);

        if (cat == null) return NotFound(new { success = false, message = "Không tìm thấy danh mục." });

        cat.IsActive = !cat.IsActive;
        await db.SaveChangesAsync();

        return Ok(new { success = true, isActive = cat.IsActive });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static string GenerateSlug(string input)
    {
        // Chuyển tiếng Việt có dấu → không dấu đơn giản
        var normalized = input.Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder();
        foreach (var c in normalized)
        {
            var category = System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c);
            if (category != System.Globalization.UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }
        var slug = sb.ToString().Normalize(System.Text.NormalizationForm.FormC)
                     .ToLowerInvariant();
        slug = Regex.Replace(slug, @"[^a-z0-9\s-]", "");
        slug = Regex.Replace(slug, @"\s+", "-");
        slug = slug.Trim('-');
        return slug.Length > 0 ? slug : "category";
    }
}

public class CategoryRequest
{
    public string? CategoryName { get; set; }
    public string? Description  { get; set; }
    public int?    ParentId     { get; set; }
    public int?    SortOrder    { get; set; }
}
