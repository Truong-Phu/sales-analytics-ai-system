using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Payment API – thanh toán đơn hàng, subscription, mock callbacks.
/// Route: /api/payment
/// </summary>
[ApiController]
[Route("api/payment")]
[Authorize]
public class PaymentController : ControllerBase
{
    private readonly PaymentService             _payment;
    private readonly SubscriptionPaymentService _subPayment;
    private readonly VietQRService              _vietqr;
    private readonly ITenantContext             _tenant;
    private readonly AppDbContext               _db;
    private readonly ILogger<PaymentController> _logger;
    private readonly IConfiguration             _config;

    public PaymentController(
        PaymentService payment,
        SubscriptionPaymentService subPayment,
        VietQRService vietqr,
        ITenantContext tenant,
        AppDbContext db,
        ILogger<PaymentController> logger,
        IConfiguration config)
    {
        _payment    = payment;
        _subPayment = subPayment;
        _vietqr     = vietqr;
        _tenant     = tenant;
        _db         = db;
        _logger     = logger;
        _config     = config;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/payment/methods
    // Trả về danh sách method đang enabled (SA cấu hình) — tenant gọi khi mở modal
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("methods")]
    public async Task<IActionResult> GetEnabledMethods()
    {
        var enabled = await _db.PaymentMethodConfigs
            .Where(c => c.Enabled &&
                        !c.PaymentMethod.StartsWith("MOCK_")) // ẩn mock với tenant
            .OrderBy(c => c.PaymentMethod)
            .Select(c => c.PaymentMethod)
            .ToListAsync();

        // Nếu SA chưa cấu hình gì → mặc định trả về CASH + BANK_TRANSFER + VIETQR
        if (enabled.Count == 0)
            enabled = ["CASH", "BANK_TRANSFER", "VIETQR"];

        return Ok(new { success = true, data = enabled });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/payment/order/{orderId}/initiate
    // Khởi tạo thanh toán cho đơn hàng
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("order/{orderId:int}/initiate")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
    public async Task<IActionResult> InitiateOrderPayment(
        int orderId, [FromBody] InitiateOrderPaymentRequest req)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        var userId = _tenant.UserId;

        try
        {
            var result = await _payment.InitiateOrderPaymentAsync(
                orderId, req.Method, companyId.Value, userId);
            return Ok(new { success = true, data = result });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/payment/transaction/{txId}/confirm
    // Xác nhận thanh toán thủ công (Cash / Bank Transfer)
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("transaction/{txId:guid}/confirm")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales")]
    public async Task<IActionResult> ManualConfirm(
        Guid txId, [FromBody] ManualConfirmPaymentRequest req)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        try
        {
            var result = await _payment.ManualConfirmAsync(
                txId, companyId.Value, req.TransactionCode, req.Notes);
            return Ok(new { success = true, data = result, message = "Đã xác nhận thanh toán" });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { success = false, message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/payment/order/{orderId}
    // Lấy giao dịch thanh toán hiện tại của đơn hàng
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("order/{orderId:int}")]
    public async Task<IActionResult> GetByOrderId(int orderId)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null)
            return Ok(new { success = true, data = (object?)null });

        var tx = await _payment.GetByOrderIdAsync(orderId, companyId.Value);
        return Ok(new { success = true, data = tx });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/payment/history?page=1&pageSize=20
    // Lịch sử giao dịch thanh toán của tenant
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (_tenant.IsSuperAdmin)
            return Ok(new { success = true, data = Array.Empty<object>(), total = 0 });

        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        var (items, total) = await _payment.GetHistoryAsync(companyId.Value, page, pageSize);
        return Ok(new { success = true, data = items, total, page, pageSize });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/payment/vietqr/{txId}
    // Lấy thông tin VietQR cho giao dịch
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("vietqr/{txId:guid}")]
    public async Task<IActionResult> GetVietQR(Guid txId)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        var tx = await _db.PaymentTransactions
            .FirstOrDefaultAsync(t => t.Id == txId && t.TenantId == companyId.Value);

        if (tx is null)
            return NotFound(new { success = false, message = "Giao dịch không tồn tại" });

        var qr = await _vietqr.GetVietQRAsync(tx.PaymentCode);
        return Ok(new { success = true, data = qr, transaction = new {
            tx.Id, tx.PaymentCode, tx.Amount, tx.Status, tx.ExpiredAt
        }});
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/payment/subscription/initiate
    // Khởi tạo thanh toán gói dịch vụ
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("subscription/initiate")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> InitiateSubscriptionPayment(
        [FromBody] InitiateSubscriptionPaymentRequest req)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        if (req.Plan != "pro" && req.Plan != "enterprise")
            return BadRequest(new { success = false, message = "Gói không hợp lệ" });
        if (req.BillingCycle != "monthly" && req.BillingCycle != "yearly")
            return BadRequest(new { success = false, message = "Chu kỳ thanh toán không hợp lệ" });

        var result = await _subPayment.InitiateAsync(
            companyId.Value, req.Plan, req.BillingCycle, req.Method, _tenant.UserId);

        return Ok(new { success = true, data = result });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/payment/subscription/{txId}/activate
    // Kích hoạt gói sau thanh toán thủ công
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("subscription/{txId:guid}/activate")]
    [Authorize(Roles = "Owner,SuperAdmin")]
    public async Task<IActionResult> ActivateSubscription(Guid txId)
    {
        await _subPayment.ActivateAsync(txId);
        return Ok(new { success = true, message = "Đã kích hoạt gói dịch vụ" });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/payment/webhook/sepay
    // Webhook thật từ SePay – AllowAnonymous, xác thực bằng API key header
    // SePay gửi: Authorization: Apikey {SePay:ApiKey}
    // ─────────────────────────────────────────────────────────────────────────
    [HttpPost("webhook/sepay")]
    [AllowAnonymous]
    public async Task<IActionResult> SePayWebhook([FromBody] SepayWebhookPayload payload)
    {
        // Xác thực API key từ header Authorization
        var authHeader  = Request.Headers["Authorization"].FirstOrDefault() ?? "";
        var expectedKey = _config["SePay:ApiKey"];

        if (string.IsNullOrEmpty(expectedKey) || authHeader != $"Apikey {expectedKey}")
        {
            _logger.LogWarning("SePay webhook – API key không hợp lệ: {Header}", authHeader);
            return Unauthorized(new { success = false });
        }

        // Chỉ xử lý giao dịch tiền vào (in)
        if (!string.Equals(payload.TransferType, "in", StringComparison.OrdinalIgnoreCase))
            return Ok(new { success = true });

        // Code = PaymentCode hệ thống (vd: "DH123")
        if (string.IsNullOrEmpty(payload.Code))
        {
            _logger.LogWarning("SePay webhook – thiếu code trong payload, sePayId={Id}", payload.Id);
            return Ok(new { success = true });
        }

        await _payment.ProcessRealSePayAsync(
            payload.Code, payload.TransferAmount,
            payload.ReferenceCode, payload.Id.ToString());

        return Ok(new { success = true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ── MOCK ENDPOINTS (chỉ dùng trong development/demo) ─────────────────────
    // ─────────────────────────────────────────────────────────────────────────

    // POST /api/payment/mock/sepay-success
    /// <summary>Giả lập SePay webhook – demo mode, production thay bằng SePay tự động</summary>
    [HttpPost("mock/sepay-success")]
    [Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,SuperAdmin")]
    public async Task<IActionResult> MockSePaySuccess([FromBody] MockSePayRequest req)
    {
        // SaaS isolation: non-SuperAdmin chỉ được mock giao dịch của chính tenant mình
        if (!_tenant.IsSuperAdmin)
        {
            var companyId = _tenant.CompanyId;
            if (companyId is null) return Forbid();
            var exists = await _db.PaymentTransactions
                .AnyAsync(t => t.PaymentCode == req.PaymentCode && t.TenantId == companyId.Value);
            if (!exists) return Forbid();
        }

        var ok = await _payment.ProcessMockSePayAsync(
            req.PaymentCode, req.Amount, req.TransactionCode,
            _tenant.IsSuperAdmin ? null : _tenant.CompanyId);

        return ok
            ? Ok(new { success = true, message = "Giả lập SePay thanh toán thành công" })
            : BadRequest(new { success = false, message = "Không thể xử lý webhook giả lập" });
    }

    // POST /api/payment/mock/momo
    /// <summary>Giả lập MoMo callback (success/failed/cancelled)</summary>
    [HttpPost("mock/momo")]
    [Authorize(Roles = "Owner,Manager,SuperAdmin")]
    public async Task<IActionResult> MockMoMo([FromBody] MockMoMoRequest req)
    {
        if (!_tenant.IsSuperAdmin)
        {
            var companyId = _tenant.CompanyId;
            if (companyId is null) return Forbid();
            var exists = await _db.PaymentTransactions
                .AnyAsync(t => t.PaymentCode == req.PaymentCode && t.TenantId == companyId.Value);
            if (!exists) return Forbid();
        }
        var ok = await _payment.ProcessMockMoMoAsync(req.PaymentCode, req.Result,
            _tenant.IsSuperAdmin ? null : _tenant.CompanyId);
        return ok
            ? Ok(new { success = true, message = $"Mock MoMo: {req.Result}" })
            : BadRequest(new { success = false, message = "Không thể xử lý mock MoMo" });
    }

    // POST /api/payment/mock/vnpay
    /// <summary>Giả lập VNPAY callback (success/failed/cancelled)</summary>
    [HttpPost("mock/vnpay")]
    [Authorize(Roles = "Owner,Manager,SuperAdmin")]
    public async Task<IActionResult> MockVNPay([FromBody] MockVNPayRequest req)
    {
        if (!_tenant.IsSuperAdmin)
        {
            var companyId = _tenant.CompanyId;
            if (companyId is null) return Forbid();
            var exists = await _db.PaymentTransactions
                .AnyAsync(t => t.PaymentCode == req.PaymentCode && t.TenantId == companyId.Value);
            if (!exists) return Forbid();
        }
        var ok = await _payment.ProcessMockVNPayAsync(req.PaymentCode, req.Result,
            _tenant.IsSuperAdmin ? null : _tenant.CompanyId);
        return ok
            ? Ok(new { success = true, message = $"Mock VNPAY: {req.Result}" })
            : BadRequest(new { success = false, message = "Không thể xử lý mock VNPAY" });
    }
}
