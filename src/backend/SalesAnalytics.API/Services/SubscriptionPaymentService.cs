using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Thanh toán gói dịch vụ (Subscription) qua Payment module.
/// Tạo Invoice + PaymentTransaction, kích hoạt gói sau khi thanh toán.
/// </summary>
public class SubscriptionPaymentService
{
    private readonly AppDbContext  _db;
    private readonly VietQRService _vietqr;
    private readonly IEmailService _email;
    private readonly ILogger<SubscriptionPaymentService> _logger;

    private const decimal ProMonthlyPrice = 490_000m;
    private const decimal ProYearlyPrice  = 4_704_000m;
    private const decimal TaxRate         = 0.10m;

    public SubscriptionPaymentService(AppDbContext db, VietQRService vietqr,
        IEmailService email, ILogger<SubscriptionPaymentService> logger)
    {
        _db     = db;
        _vietqr = vietqr;
        _email  = email;
        _logger = logger;
    }

    public async Task<InitiatePaymentResponse> InitiateAsync(
        Guid companyId, string plan, string billingCycle, PaymentMethod method, int createdBy)
    {
        var amount = billingCycle == "yearly" ? ProYearlyPrice : ProMonthlyPrice;
        var tax    = Math.Round(amount * TaxRate, 0);
        var total  = amount + tax;

        var invoiceCode = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}";
        var periodStart = DateTime.UtcNow;
        var periodEnd   = billingCycle == "yearly"
            ? periodStart.AddYears(1) : periodStart.AddMonths(1);

        var sub = await _db.Subscriptions
            .Where(s => s.CompanyId == companyId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        // Tạo Invoice (cấu trúc hiện có)
        var invoice = new Invoice
        {
            CompanyId          = companyId,
            SubscriptionId     = sub?.Id,
            InvoiceCode        = invoiceCode,
            Plan               = plan,
            Amount             = total,
            Currency           = "VND",
            PaymentMethod      = method.ToString(),
            PaymentStatus      = "pending",
            BillingPeriodStart = periodStart,
            BillingPeriodEnd   = periodEnd,
        };
        _db.Invoices.Add(invoice);

        // Tạo PaymentTransaction liên kết
        var paymentCode = $"SUB{invoiceCode}";
        var tx = new PaymentTransaction
        {
            InvoiceId     = invoice.Id,
            TenantId      = companyId,
            PaymentCode   = paymentCode,
            PaymentMethod = method,
            Amount        = total,
            Status        = PaymentStatus.Pending,
            ExpiredAt     = DateTime.UtcNow.AddHours(24),
            CreatedBy     = createdBy,
        };
        _db.PaymentTransactions.Add(tx);
        await _db.SaveChangesAsync();

        VietQRInfoDto? vietQrInfo = null;
        string? mockUrl = null;

        switch (method)
        {
            case PaymentMethod.VIETQR:
                vietQrInfo = await _vietqr.GetVietQRAsync(paymentCode);
                break;
            case PaymentMethod.MOMO:
                mockUrl = $"/payment/mock-momo/{tx.Id}";
                break;
            case PaymentMethod.VNPAY:
                mockUrl = $"/payment/mock-vnpay/{tx.Id}";
                break;
        }

        return new InitiatePaymentResponse(
            TransactionId  : tx.Id,
            OrderId        : null,
            PaymentCode    : paymentCode,
            PaymentMethod  : method.ToString(),
            Status         : tx.Status.ToString(),
            Amount         : total,
            MockPaymentUrl : mockUrl,
            VietQRInfo     : vietQrInfo
        );
    }

    public async Task ActivateAsync(Guid transactionId)
    {
        var tx = await _db.PaymentTransactions
            .Include(t => t.Invoice)
            .FirstOrDefaultAsync(t => t.Id == transactionId);

        if (tx?.Invoice is null) return;
        if (tx.Status == PaymentStatus.Paid) return;

        tx.Status  = PaymentStatus.Paid;
        tx.PaidAt  = DateTime.UtcNow;

        tx.Invoice.PaymentStatus = "paid";
        tx.Invoice.PaidAt        = DateTime.UtcNow;

        // Kích hoạt gói dịch vụ
        var sub = await _db.Subscriptions
            .Include(s => s.Company)
            .Where(s => s.CompanyId == tx.TenantId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        if (sub is not null)
        {
            sub.Plan            = tx.Invoice.Plan;
            sub.Status          = "active";
            sub.StartedAt       = DateTime.UtcNow;
            sub.ExpiresAt       = tx.Invoice.BillingPeriodEnd;
            sub.GraceEndsAt     = tx.Invoice.BillingPeriodEnd?.AddDays(3);
            sub.AiEnabled       = true;
            sub.AdvancedReports = true;
            sub.MaxChannels     = -1;
            sub.MaxUsers        = -1;
            sub.UpdatedAt       = DateTime.UtcNow;

            _logger.LogInformation("Kích hoạt gói Pro – company={Id} – hết hạn={Exp}",
                tx.TenantId, sub.ExpiresAt);

            if (sub.Company is not null && sub.ExpiresAt.HasValue)
            {
                var ownerEmail = await _db.Users
                    .Where(u => u.CompanyId == tx.TenantId && u.Role == UserRole.Owner && u.IsActive)
                    .Select(u => u.Email)
                    .FirstOrDefaultAsync();
                var target = ownerEmail ?? sub.Company.Email;
                if (!string.IsNullOrEmpty(target))
                    _ = _email.SendSubscriptionConfirmedAsync(target, sub.Company.Name,
                        tx.Invoice.Plan, sub.ExpiresAt.Value);
            }
        }

        await _db.SaveChangesAsync();
    }
}
