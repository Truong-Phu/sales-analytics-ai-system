using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.API.Attributes;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý cài đặt hệ thống (Super Admin only).
/// /api/system/payment-accounts – CRUD tài khoản thanh toán.
/// </summary>
[ApiController]
[Route("api/system")]
[RequireSuperAdmin]
public class SystemSettingsController(AppDbContext db) : ControllerBase
{
    // ── Payment Accounts ─────────────────────────────────────────────────────

    /// <summary>Danh sách tài khoản thanh toán hệ thống</summary>
    [HttpGet("payment-accounts")]
    public async Task<IActionResult> GetPaymentAccounts()
    {
        var items = await db.SystemPaymentAccounts
            .OrderBy(a => a.SortOrder)
            .ThenBy(a => a.Method)
            .Select(a => new {
                a.Id, a.Method, a.DisplayName, a.IsActive, a.IsDefault,
                a.Note, a.SortOrder, a.CreatedAt, a.UpdatedAt,
                // Trả về config_masked (che bớt thông tin nhạy cảm), không trả về config thật
                Config = a.ConfigMasked,
            })
            .ToListAsync();

        return Ok(new { success = true, data = items });
    }

    /// <summary>Tạo tài khoản thanh toán mới</summary>
    [HttpPost("payment-accounts")]
    public async Task<IActionResult> CreatePaymentAccount([FromBody] UpsertPaymentAccountRequest req)
    {
        if (!IsValidMethod(req.Method))
            return BadRequest(new { success = false, message = "Phương thức thanh toán không hợp lệ." });

        var createdBy = int.TryParse(
            User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : (int?)null;

        try
        {
            // Nếu set làm default, bỏ default cũ cùng method
            if (req.IsDefault)
                await db.SystemPaymentAccounts
                    .Where(a => a.Method == req.Method && a.IsDefault)
                    .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsDefault, false));

            var account = new SystemPaymentAccount
            {
                Method       = req.Method,
                DisplayName  = req.DisplayName,
                IsActive     = req.IsActive,
                IsDefault    = req.IsDefault,
                Config       = ParseJson(req.Config),
                ConfigMasked = ParseJson(MaskConfig(req.Config)),
                Note         = req.Note,
                SortOrder    = req.SortOrder,
                CreatedBy    = createdBy,
            };

            db.SystemPaymentAccounts.Add(account);
            await db.SaveChangesAsync();

            return Ok(new { success = true, message = "Đã tạo tài khoản thanh toán.", data = new { account.Id } });
        }
        catch (Exception ex)
        {
            var detail = ex.InnerException?.Message ?? ex.Message;
            return StatusCode(500, new { success = false, message = detail });
        }
    }

    /// <summary>Cập nhật tài khoản thanh toán</summary>
    [HttpPut("payment-accounts/{id:guid}")]
    public async Task<IActionResult> UpdatePaymentAccount(Guid id,
        [FromBody] UpsertPaymentAccountRequest req)
    {
        var account = await db.SystemPaymentAccounts.FindAsync(id);
        if (account is null) return NotFound(new { success = false, message = "Không tìm thấy tài khoản." });

        if (!IsValidMethod(req.Method))
            return BadRequest(new { success = false, message = "Phương thức thanh toán không hợp lệ." });

        try
        {
            if (req.IsDefault && !account.IsDefault)
                await db.SystemPaymentAccounts
                    .Where(a => a.Method == req.Method && a.IsDefault && a.Id != id)
                    .ExecuteUpdateAsync(s => s.SetProperty(a => a.IsDefault, false));

            account.Method       = req.Method;
            account.DisplayName  = req.DisplayName;
            account.IsActive     = req.IsActive;
            account.IsDefault    = req.IsDefault;
            account.Note         = req.Note;
            account.SortOrder    = req.SortOrder;
            account.UpdatedAt    = DateTime.UtcNow;

            // Chỉ cập nhật config nếu có gửi lên
            if (!string.IsNullOrWhiteSpace(req.Config))
            {
                account.Config       = ParseJson(req.Config);
                account.ConfigMasked = ParseJson(MaskConfig(req.Config));
            }

            await db.SaveChangesAsync();
            return Ok(new { success = true, message = "Đã cập nhật tài khoản thanh toán." });
        }
        catch (Exception ex)
        {
            var detail = ex.InnerException?.Message ?? ex.Message;
            return StatusCode(500, new { success = false, message = detail });
        }
    }

    /// <summary>Xóa tài khoản thanh toán</summary>
    [HttpDelete("payment-accounts/{id:guid}")]
    public async Task<IActionResult> DeletePaymentAccount(Guid id)
    {
        var account = await db.SystemPaymentAccounts.FindAsync(id);
        if (account is null) return NotFound(new { success = false, message = "Không tìm thấy tài khoản." });

        db.SystemPaymentAccounts.Remove(account);
        await db.SaveChangesAsync();

        return Ok(new { success = true, message = "Đã xóa tài khoản thanh toán." });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static bool IsValidMethod(string method)
        => method is "vnpay" or "momo" or "bank_transfer" or "zalopay";

    private static JsonDocument ParseJson(string? raw)
    {
        try { return JsonDocument.Parse(raw ?? "{}"); }
        catch { return JsonDocument.Parse("{}"); }
    }

    // Che bớt các field nhạy cảm (secret_key, api_key, private_key...) → dùng "*****"
    private static string MaskConfig(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "{}";
        try
        {
            using var doc  = JsonDocument.Parse(raw);
            var masked = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                var key = prop.Name.ToLower();
                if (key.Contains("secret") || key.Contains("key") || key.Contains("password") || key.Contains("token"))
                    masked[prop.Name] = "*****";
                else
                    masked[prop.Name] = prop.Value.ToString();
            }
            return System.Text.Json.JsonSerializer.Serialize(masked);
        }
        catch { return "{}"; }
    }
}

public record UpsertPaymentAccountRequest(
    string  Method,
    string  DisplayName,
    bool    IsActive    = true,
    bool    IsDefault   = false,
    string? Config      = null,
    string? Note        = null,
    int     SortOrder   = 0
);
