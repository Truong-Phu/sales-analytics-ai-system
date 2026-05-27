using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// SuperAdmin: Quản lý cấu hình phương thức thanh toán.
/// Route: /api/payment/settings
/// </summary>
[ApiController]
[Route("api/payment/settings")]
[Authorize(Roles = "SuperAdmin")]
public class PaymentSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<PaymentSettingsController> _logger;

    // Các key hợp lệ
    private static readonly HashSet<string> ValidMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        "CASH", "BANK_TRANSFER", "VIETQR", "MOMO", "VNPAY",
        "MOCK_SEPAY", "MOCK_MOMO", "MOCK_VNPAY"
    };

    public PaymentSettingsController(AppDbContext db,
        ILogger<PaymentSettingsController> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/payment/settings
    // Lấy tất cả cấu hình phương thức thanh toán
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var configs = await _db.PaymentMethodConfigs
            .OrderBy(c => c.PaymentMethod)
            .ToListAsync();

        var result = configs.Select(MapToDto).ToList();
        return Ok(new { success = true, data = result });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/payment/settings/{method}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("{method}")]
    public async Task<IActionResult> GetOne(string method)
    {
        var key = method.ToUpper();
        var config = await _db.PaymentMethodConfigs
            .FirstOrDefaultAsync(c => c.PaymentMethod == key);

        if (config is null)
            return Ok(new { success = true, data = (object?)null });

        return Ok(new { success = true, data = MapToDto(config) });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUT /api/payment/settings/{method}
    // Tạo hoặc cập nhật cấu hình cho một phương thức
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPut("{method}")]
    public async Task<IActionResult> Upsert(
        string method, [FromBody] UpdatePaymentMethodConfigRequest req)
    {
        var key = method.ToUpper();
        if (!ValidMethods.Contains(key))
            return BadRequest(new { success = false, message = "Phương thức không hợp lệ" });

        // Validate JSON nếu có
        if (!string.IsNullOrEmpty(req.ConfigJson))
        {
            try { JsonDocument.Parse(req.ConfigJson); }
            catch { return BadRequest(new { success = false, message = "ConfigJson không hợp lệ" }); }
        }

        var config = await _db.PaymentMethodConfigs
            .FirstOrDefaultAsync(c => c.PaymentMethod == key);

        if (config is null)
        {
            config = new PaymentMethodConfig
            {
                PaymentMethod = key,
                Enabled       = req.Enabled,
                ConfigJson    = req.ConfigJson,
            };
            _db.PaymentMethodConfigs.Add(config);
            _logger.LogInformation("Tạo PaymentMethodConfig cho method={Method}", key);
        }
        else
        {
            config.Enabled    = req.Enabled;
            config.UpdatedAt  = DateTime.UtcNow;
            if (req.ConfigJson is not null)
                config.ConfigJson = req.ConfigJson;
            _logger.LogInformation("Cập nhật PaymentMethodConfig cho method={Method}", key);
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, data = MapToDto(config), message = "Đã lưu cấu hình" });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE /api/payment/settings/{method}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpDelete("{method}")]
    public async Task<IActionResult> Delete(string method)
    {
        var key    = method.ToUpper();
        var config = await _db.PaymentMethodConfigs
            .FirstOrDefaultAsync(c => c.PaymentMethod == key);

        if (config is null)
            return NotFound(new { success = false, message = "Không tìm thấy cấu hình" });

        _db.PaymentMethodConfigs.Remove(config);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Đã xóa cấu hình" });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────────────
    private static PaymentMethodConfigDto MapToDto(PaymentMethodConfig c)
    {
        object? parsed = null;
        if (!string.IsNullOrEmpty(c.ConfigJson))
        {
            try { parsed = JsonSerializer.Deserialize<object>(c.ConfigJson); }
            catch { /* giữ null */ }
        }
        return new PaymentMethodConfigDto(c.Id, c.PaymentMethod, c.Enabled, parsed, c.UpdatedAt);
    }
}
