using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SalesAnalytics.API.Services;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Controllers;

/// <summary>Quản lý gói dịch vụ và lịch sử thanh toán của tenant</summary>
[ApiController]
[Route("api/subscription")]
[Authorize]
public class SubscriptionController : ControllerBase
{
    private readonly AppDbContext   _db;
    private readonly ITenantContext _tenant;
    private readonly ILogger<SubscriptionController> _logger;

    // Giá gói Pro (VND, chưa thuế)
    private const decimal ProMonthlyPrice = 490_000m;
    private const decimal ProYearlyPrice  = 4_704_000m;
    private const decimal TaxRate         = 0.10m;

    public SubscriptionController(AppDbContext db, ITenantContext tenant,
        ILogger<SubscriptionController> logger)
    {
        _db     = db;
        _tenant = tenant;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/subscription
    // Trả về gói dịch vụ hiện tại của company
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>Lấy thông tin gói dịch vụ hiện tại</summary>
    [HttpGet]
    public async Task<IActionResult> GetCurrent()
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        var sub = await _db.Subscriptions
            .Where(s => s.CompanyId == companyId.Value)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        if (sub is null)
            return Ok(new { success = true, data = (object?)null, message = "Chưa có gói dịch vụ" });

        var dto = MapSubscription(sub);
        return Ok(new { success = true, data = dto });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/subscription/upgrade
    // Tạo invoice + trả về URL thanh toán hoặc thông tin chuyển khoản
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>Nâng cấp gói dịch vụ – tạo hóa đơn và redirect payment</summary>
    [HttpPost("upgrade")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> Upgrade([FromBody] UpgradeRequest req)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        if (req.Plan != "pro" && req.Plan != "enterprise")
            return BadRequest(new { success = false, message = "Gói không hợp lệ" });
        if (req.BillingCycle != "monthly" && req.BillingCycle != "yearly")
            return BadRequest(new { success = false, message = "Chu kỳ thanh toán không hợp lệ" });

        var amount = req.BillingCycle == "yearly" ? ProYearlyPrice : ProMonthlyPrice;
        var tax    = Math.Round(amount * TaxRate, 0);
        var total  = amount + tax;

        // Tạo mã hóa đơn dạng INV-YYYYMMDD-XXXX
        var invoiceCode = $"INV-{DateTime.UtcNow:yyyyMMdd}-{new Random().Next(1000, 9999)}";

        // Tính kỳ thanh toán
        var periodStart = DateTime.UtcNow;
        var periodEnd   = req.BillingCycle == "yearly"
            ? periodStart.AddYears(1)
            : periodStart.AddMonths(1);

        // Lấy subscription hiện tại
        var sub = await _db.Subscriptions
            .Where(s => s.CompanyId == companyId.Value)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        // Tạo invoice với trạng thái pending
        var invoice = new Invoice
        {
            CompanyId          = companyId.Value,
            SubscriptionId     = sub?.Id,
            InvoiceCode        = invoiceCode,
            Plan               = req.Plan,
            Amount             = total,
            Currency           = "VND",
            PaymentMethod      = req.PaymentMethod,
            PaymentStatus      = "pending",
            BillingPeriodStart = periodStart,
            BillingPeriodEnd   = periodEnd,
        };
        _db.Invoices.Add(invoice);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Tạo hóa đơn {Code} cho company {CompanyId}", invoiceCode, companyId);

        UpgradeResponse response;

        if (req.PaymentMethod == "bank_transfer")
        {
            response = new UpgradeResponse(
                InvoiceCode   : invoiceCode,
                Amount        : amount,
                Tax           : tax,
                Total         : total,
                PaymentMethod : req.PaymentMethod,
                PaymentUrl    : null,
                BankInfo      : new BankTransferInfo(
                    BankName      : "Vietcombank",
                    AccountNumber : "1234567890",
                    AccountName   : "CONG TY TNHH MSAS",
                    Content       : $"MSAS {invoiceCode}",
                    Amount        : total
                )
            );
        }
        else
        {
            // Mock URL thanh toán (chưa tích hợp VNPay/Momo thật)
            var mockPaymentUrl = req.PaymentMethod == "vnpay"
                ? $"https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount={(long)(total * 100)}&vnp_TxnRef={invoiceCode}"
                : $"https://test-payment.momo.vn/v2/gateway/pay?amount={(long)total}&orderId={invoiceCode}";

            response = new UpgradeResponse(
                InvoiceCode   : invoiceCode,
                Amount        : amount,
                Tax           : tax,
                Total         : total,
                PaymentMethod : req.PaymentMethod,
                PaymentUrl    : mockPaymentUrl,
                BankInfo      : null
            );
        }

        return Ok(new { success = true, data = response, message = "Hóa đơn đã được tạo" });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/subscription/webhook/vnpay
    // Nhận callback từ VNPay sau thanh toán
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>Webhook VNPay – xác nhận thanh toán</summary>
    [HttpPost("webhook/vnpay")]
    [AllowAnonymous]
    public async Task<IActionResult> VNPayWebhook([FromQuery] Dictionary<string, string> queryParams)
    {
        var txnRef    = queryParams.GetValueOrDefault("vnp_TxnRef", "");
        var responseCode = queryParams.GetValueOrDefault("vnp_ResponseCode", "99");

        var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceCode == txnRef);
        if (invoice is null)
            return Ok(new { RspCode = "01", Message = "Invoice not found" });

        if (responseCode == "00")
        {
            invoice.PaymentStatus      = "paid";
            invoice.PaymentGatewayRef  = queryParams.GetValueOrDefault("vnp_TransactionNo", "");
            invoice.PaidAt             = DateTime.UtcNow;
            await ActivateProPlan(invoice);
        }
        else
        {
            invoice.PaymentStatus = "failed";
        }

        await _db.SaveChangesAsync();
        return Ok(new { RspCode = "00", Message = "Confirm Success" });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POST /api/subscription/webhook/momo
    // Nhận callback từ Momo sau thanh toán
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>Webhook Momo – xác nhận thanh toán</summary>
    [HttpPost("webhook/momo")]
    [AllowAnonymous]
    public async Task<IActionResult> MomoWebhook([FromBody] MomoWebhookDto dto)
    {
        var invoice = await _db.Invoices.FirstOrDefaultAsync(i => i.InvoiceCode == dto.OrderId);
        if (invoice is null) return NotFound();

        if (dto.ResultCode == 0)
        {
            invoice.PaymentStatus     = "paid";
            invoice.PaymentGatewayRef = dto.TransId.ToString();
            invoice.PaidAt            = DateTime.UtcNow;
            await ActivateProPlan(invoice);
        }
        else
        {
            invoice.PaymentStatus = "failed";
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/subscription/invoices
    // Lịch sử hóa đơn của company
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>Danh sách hóa đơn của company</summary>
    [HttpGet("invoices")]
    public async Task<IActionResult> GetInvoices([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        var query = _db.Invoices
            .Where(i => i.CompanyId == companyId.Value)
            .OrderByDescending(i => i.CreatedAt);

        var total = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new InvoiceDto(
                i.Id, i.InvoiceCode, i.Plan, i.Amount, i.Currency,
                i.PaymentMethod, i.PaymentStatus,
                i.BillingPeriodStart, i.BillingPeriodEnd,
                i.PaidAt, i.PdfUrl, i.CreatedAt))
            .ToListAsync();

        return Ok(new { success = true, data = items, total, page, pageSize });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GET /api/subscription/invoices/{id}/pdf
    // Tạo và trả về PDF hóa đơn dùng QuestPDF
    // ─────────────────────────────────────────────────────────────────────────
    /// <summary>Tải PDF hóa đơn bằng QuestPDF</summary>
    [HttpGet("invoices/{id}/pdf")]
    public async Task<IActionResult> DownloadPdf(Guid id)
    {
        var companyId = _tenant.CompanyId;
        if (companyId is null) return Forbid();

        var invoice = await _db.Invoices
            .Include(i => i.Company)
            .FirstOrDefaultAsync(i => i.Id == id && i.CompanyId == companyId.Value);

        if (invoice is null)
            return NotFound(new { success = false, message = "Hóa đơn không tồn tại" });

        QuestPDF.Settings.License = LicenseType.Community;
        var pdfBytes = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(x => x.FontSize(11).FontFamily("Arial"));

                page.Header().Row(row =>
                {
                    row.RelativeItem().Column(col =>
                    {
                        col.Item().Text("MSAS – Sales Analytics Platform")
                           .FontSize(16).Bold().FontColor(Colors.Blue.Darken2);
                        col.Item().Text("Hóa đơn dịch vụ")
                           .FontSize(12).FontColor(Colors.Grey.Medium);
                    });
                    row.ConstantItem(120).AlignRight().Column(col =>
                    {
                        col.Item().Text($"#{invoice.InvoiceCode}").Bold();
                        col.Item().Text(invoice.CreatedAt.ToString("dd/MM/yyyy"))
                           .FontColor(Colors.Grey.Medium);
                    });
                });

                page.Content().PaddingTop(20).Column(col =>
                {
                    // Thông tin công ty
                    col.Item().BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingBottom(12).Row(r =>
                    {
                        r.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Khách hàng").Bold().FontColor(Colors.Grey.Medium);
                            c.Item().Text(invoice.Company?.Name ?? "").Bold();
                            c.Item().Text(invoice.Company?.Email ?? "");
                        });
                        r.ConstantItem(200).AlignRight().Column(c =>
                        {
                            c.Item().Text("Trạng thái").Bold().FontColor(Colors.Grey.Medium);
                            var statusColor = invoice.PaymentStatus == "paid"
                                ? Colors.Green.Medium : Colors.Orange.Medium;
                            var statusText = invoice.PaymentStatus switch
                            {
                                "paid"     => "Đã thanh toán",
                                "pending"  => "Chờ thanh toán",
                                "failed"   => "Thất bại",
                                "refunded" => "Hoàn tiền",
                                _          => invoice.PaymentStatus
                            };
                            c.Item().Text(statusText).Bold().FontColor(statusColor);
                        });
                    });

                    // Bảng chi tiết
                    col.Item().PaddingTop(20).Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            cols.RelativeColumn(3);
                            cols.RelativeColumn(1);
                            cols.RelativeColumn(2);
                        });

                        // Header
                        table.Header(h =>
                        {
                            foreach (var header in new[] { "Dịch vụ", "Số lượng", "Thành tiền" })
                            {
                                h.Cell().Background(Colors.Blue.Lighten4).Padding(6)
                                 .Text(header).Bold();
                            }
                        });

                        var planLabel = invoice.Plan switch
                        {
                            "pro"        => "Gói Chuyên nghiệp (Pro)",
                            "enterprise" => "Gói Doanh nghiệp",
                            _            => "Gói Miễn phí"
                        };
                        var baseAmount = Math.Round(invoice.Amount / (1 + TaxRate), 0);
                        var taxAmount  = invoice.Amount - baseAmount;

                        table.Cell().Padding(6).Text(planLabel);
                        table.Cell().Padding(6).AlignCenter().Text("1");
                        table.Cell().Padding(6).AlignRight()
                             .Text($"{baseAmount:N0} ₫");

                        table.Cell().Padding(6).Text("Thuế VAT (10%)").FontColor(Colors.Grey.Medium);
                        table.Cell().Padding(6).AlignCenter().Text("—").FontColor(Colors.Grey.Medium);
                        table.Cell().Padding(6).AlignRight()
                             .Text($"{taxAmount:N0} ₫").FontColor(Colors.Grey.Medium);
                    });

                    // Tổng cộng
                    col.Item().AlignRight().PaddingTop(12).Column(c =>
                    {
                        c.Item().BorderTop(1).BorderColor(Colors.Grey.Lighten2).PaddingTop(8)
                         .Row(r =>
                         {
                             r.RelativeItem().Text("Tổng cộng:").Bold().FontSize(13);
                             r.ConstantItem(150).AlignRight()
                              .Text($"{invoice.Amount:N0} ₫").Bold().FontSize(13)
                              .FontColor(Colors.Blue.Darken2);
                         });
                    });

                    // Kỳ thanh toán
                    if (invoice.BillingPeriodStart.HasValue)
                    {
                        col.Item().PaddingTop(20).Text(
                            $"Kỳ dịch vụ: {invoice.BillingPeriodStart:dd/MM/yyyy} – {invoice.BillingPeriodEnd:dd/MM/yyyy}")
                           .FontColor(Colors.Grey.Medium);
                    }
                });

                page.Footer().AlignCenter()
                    .Text($"MSAS Platform · Xuất ngày {DateTime.Now:dd/MM/yyyy HH:mm} · {invoice.InvoiceCode}")
                    .FontSize(9).FontColor(Colors.Grey.Medium);
            });
        }).GeneratePdf();

        return File(pdfBytes, "application/pdf", $"HoaDon_{invoice.InvoiceCode}.pdf");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: kích hoạt gói Pro sau khi thanh toán thành công
    // ─────────────────────────────────────────────────────────────────────────
    private async Task ActivateProPlan(Invoice invoice)
    {
        var sub = await _db.Subscriptions
            .Where(s => s.CompanyId == invoice.CompanyId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        if (sub is null) return;

        sub.Plan            = invoice.Plan;
        sub.Status          = "active";
        sub.StartedAt       = DateTime.UtcNow;
        sub.ExpiresAt       = invoice.BillingPeriodEnd;
        sub.GraceEndsAt     = invoice.BillingPeriodEnd?.AddDays(3);
        sub.AiEnabled       = true;
        sub.AdvancedReports = true;
        sub.MaxChannels     = -1;
        sub.MaxUsers        = -1;
        sub.UpdatedAt       = DateTime.UtcNow;

        _logger.LogInformation("Kích hoạt gói Pro cho company {CompanyId}, hết hạn {ExpiresAt}",
            invoice.CompanyId, sub.ExpiresAt);
    }

    private static SubscriptionDto MapSubscription(Subscription s) => new(
        s.Id, s.Plan, s.Status, s.AutoRenew,
        s.MaxChannels, s.MaxUsers, s.AiEnabled, s.AdvancedReports,
        s.StartedAt, s.ExpiresAt, s.TrialEndsAt, s.GraceEndsAt
    );
}
