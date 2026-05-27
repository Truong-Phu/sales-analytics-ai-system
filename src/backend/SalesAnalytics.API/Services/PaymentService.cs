using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Core.Enums;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Service điều phối toàn bộ payment flow – tạo/cập nhật PaymentTransaction,
/// cập nhật trạng thái Order.PaymentStatus, idempotency check.
/// </summary>
public class PaymentService
{
    private readonly AppDbContext   _db;
    private readonly VietQRService  _vietqr;
    private readonly ILogger<PaymentService> _logger;

    // Thời hạn hết hạn giao dịch QR/chuyển khoản: 30 phút
    private const int QR_EXPIRY_MINUTES = 30;

    public PaymentService(AppDbContext db, VietQRService vietqr,
        ILogger<PaymentService> logger)
    {
        _db     = db;
        _vietqr = vietqr;
        _logger = logger;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Khởi tạo thanh toán cho đơn hàng
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<InitiatePaymentResponse> InitiateOrderPaymentAsync(
        int orderId, PaymentMethod method, Guid tenantId, int createdBy)
    {
        var order = await _db.Orders
            .FirstOrDefaultAsync(o => o.OrderId == orderId && o.CompanyId == tenantId)
            ?? throw new KeyNotFoundException("Đơn hàng không tồn tại");

        // Kiểm tra đã thanh toán chưa
        if (order.PaymentStatus == "PAID")
            throw new InvalidOperationException("Đơn hàng đã được thanh toán");

        // Huỷ giao dịch Pending cũ nếu có (tránh orphan)
        var existing = await _db.PaymentTransactions
            .Where(t => t.OrderId == orderId && t.Status == PaymentStatus.Pending)
            .ToListAsync();
        foreach (var old in existing)
            old.Status = PaymentStatus.Cancelled;

        var paymentCode = $"DH{orderId}";
        var expiredAt   = (method == PaymentMethod.VIETQR || method == PaymentMethod.BANK_TRANSFER)
            ? DateTime.UtcNow.AddMinutes(QR_EXPIRY_MINUTES)
            : (DateTime?)null;

        var tx = new PaymentTransaction
        {
            OrderId       = orderId,
            TenantId      = tenantId,
            PaymentCode   = paymentCode,
            PaymentMethod = method,
            Amount        = order.TotalAmount,
            Status        = PaymentStatus.Pending,
            ExpiredAt     = expiredAt,
            CreatedBy     = createdBy,
        };

        _db.PaymentTransactions.Add(tx);

        // Ghi nhận phương thức vào Order
        order.PaymentMethod = method.ToString();
        order.UpdatedAt     = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        _logger.LogInformation("Tạo PaymentTransaction {Code} – method={Method} – amount={Amount}",
            paymentCode, method, order.TotalAmount);

        // Lấy thông tin ngân hàng/QR
        BankTransferInfoDto? bankInfo  = null;
        VietQRInfoDto?       vietQrInfo = null;
        string? mockUrl = null;

        switch (method)
        {
            case PaymentMethod.BANK_TRANSFER:
                bankInfo = await _vietqr.GetBankTransferInfoAsync(paymentCode);
                if (bankInfo is not null)
                    bankInfo = bankInfo with { Amount = order.TotalAmount };
                break;

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
            PaymentCode    : paymentCode,
            PaymentMethod  : method.ToString(),
            Status         : tx.Status.ToString(),
            Amount         : order.TotalAmount,
            MockPaymentUrl : mockUrl,
            BankInfo       : bankInfo,
            VietQRInfo     : vietQrInfo
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Xác nhận thanh toán thủ công (Cash / Bank Transfer)
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<PaymentTransactionDto> ManualConfirmAsync(
        Guid txId, Guid tenantId, string? transactionCode, string? notes)
    {
        var tx = await _db.PaymentTransactions
            .Include(t => t.Order)
            .FirstOrDefaultAsync(t => t.Id == txId && t.TenantId == tenantId)
            ?? throw new KeyNotFoundException("Giao dịch không tồn tại");

        if (tx.Status == PaymentStatus.Paid)
            throw new InvalidOperationException("Giao dịch đã được xác nhận thanh toán");

        tx.Status          = PaymentStatus.Paid;
        tx.PaidAt          = DateTime.UtcNow;
        tx.TransactionCode = transactionCode;
        tx.GatewayResponse = notes is not null ? JsonSerializer.Serialize(new { notes }) : null;

        // Cập nhật đơn hàng
        if (tx.Order is not null)
        {
            tx.Order.PaymentStatus = "PAID";
            tx.Order.PaidAt        = DateTime.UtcNow;
            tx.Order.UpdatedAt     = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        _logger.LogInformation("Xác nhận thủ công PaymentTransaction {Id} – code={TxCode}",
            txId, transactionCode);

        return MapToDto(tx);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Xử lý mock SePay webhook (giả lập chuyển khoản thành công)
    // tenantId=null khi SuperAdmin (skip TenantId check)
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<bool> ProcessMockSePayAsync(
        string paymentCode, decimal amount, string? transactionCode, Guid? tenantId = null)
    {
        var log = new PaymentWebhookLog
        {
            Provider  = "SEPAY",
            Payload   = JsonSerializer.Serialize(new { paymentCode, amount, transactionCode }),
            ProcessedStatus = "PROCESSING",
        };
        _db.PaymentWebhookLogs.Add(log);

        var query = _db.PaymentTransactions
            .Include(t => t.Order)
            .Include(t => t.Invoice)
            .Where(t => t.PaymentCode == paymentCode);
        if (tenantId.HasValue)
            query = query.Where(t => t.TenantId == tenantId.Value);
        var tx = await query.FirstOrDefaultAsync();

        if (tx is null)
        {
            log.ProcessedStatus = "FAILED";
            log.Notes           = "PaymentCode không tồn tại";
            await _db.SaveChangesAsync();
            return false;
        }

        if (tx.Status == PaymentStatus.Paid)
        {
            log.ProcessedStatus = "IGNORED";
            log.Notes           = "Đã thanh toán trước đó";
            await _db.SaveChangesAsync();
            return true;
        }

        if (tx.Amount != amount)
        {
            log.ProcessedStatus = "FAILED";
            log.Notes           = $"Số tiền không khớp: expected={tx.Amount}, got={amount}";
            await _db.SaveChangesAsync();
            return false;
        }

        tx.Status          = PaymentStatus.Paid;
        tx.PaidAt          = DateTime.UtcNow;
        tx.TransactionCode = transactionCode;
        tx.GatewayResponse = JsonSerializer.Serialize(new { provider = "SEPAY", amount, transactionCode });

        if (tx.Order is not null)
        {
            tx.Order.PaymentStatus = "PAID";
            tx.Order.PaidAt        = DateTime.UtcNow;
            tx.Order.UpdatedAt     = DateTime.UtcNow;
        }

        log.ProcessedStatus = "SUCCESS";
        await _db.SaveChangesAsync();

        _logger.LogInformation("Mock SePay OK – paymentCode={Code}", paymentCode);
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Xử lý mock MoMo callback
    // tenantId=null khi SuperAdmin (skip TenantId check)
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<bool> ProcessMockMoMoAsync(string paymentCode, string result, Guid? tenantId = null)
    {
        var log = new PaymentWebhookLog
        {
            Provider  = "MOMO",
            Payload   = JsonSerializer.Serialize(new { paymentCode, result }),
            ProcessedStatus = "PROCESSING",
        };
        _db.PaymentWebhookLogs.Add(log);

        var query = _db.PaymentTransactions.Include(t => t.Order)
            .Where(t => t.PaymentCode == paymentCode);
        if (tenantId.HasValue)
            query = query.Where(t => t.TenantId == tenantId.Value);
        var tx = await query.FirstOrDefaultAsync();

        if (tx is null)
        {
            log.ProcessedStatus = "FAILED";
            log.Notes           = "PaymentCode không tồn tại";
            await _db.SaveChangesAsync();
            return false;
        }

        if (tx.Status == PaymentStatus.Paid)
        {
            log.ProcessedStatus = "IGNORED";
            await _db.SaveChangesAsync();
            return true;
        }

        switch (result.ToLower())
        {
            case "success":
                tx.Status          = PaymentStatus.Paid;
                tx.PaidAt          = DateTime.UtcNow;
                tx.TransactionCode = $"MOMO_{DateTime.UtcNow:yyyyMMddHHmmss}";
                tx.GatewayResponse = JsonSerializer.Serialize(new { provider = "MOMO", result });
                if (tx.Order is not null)
                {
                    tx.Order.PaymentStatus = "PAID";
                    tx.Order.PaidAt        = DateTime.UtcNow;
                    tx.Order.UpdatedAt     = DateTime.UtcNow;
                }
                log.ProcessedStatus = "SUCCESS";
                break;

            case "failed":
                tx.Status = PaymentStatus.Failed;
                log.ProcessedStatus = "SUCCESS";
                break;

            case "cancelled":
                tx.Status = PaymentStatus.Cancelled;
                log.ProcessedStatus = "SUCCESS";
                break;

            default:
                log.ProcessedStatus = "FAILED";
                log.Notes = $"Result không hợp lệ: {result}";
                await _db.SaveChangesAsync();
                return false;
        }

        await _db.SaveChangesAsync();
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Xử lý mock VNPAY callback
    // tenantId=null khi SuperAdmin (skip TenantId check)
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<bool> ProcessMockVNPayAsync(string paymentCode, string result, Guid? tenantId = null)
    {
        var log = new PaymentWebhookLog
        {
            Provider  = "VNPAY",
            Payload   = JsonSerializer.Serialize(new { paymentCode, result }),
            ProcessedStatus = "PROCESSING",
        };
        _db.PaymentWebhookLogs.Add(log);

        var query = _db.PaymentTransactions.Include(t => t.Order)
            .Where(t => t.PaymentCode == paymentCode);
        if (tenantId.HasValue)
            query = query.Where(t => t.TenantId == tenantId.Value);
        var tx = await query.FirstOrDefaultAsync();

        if (tx is null)
        {
            log.ProcessedStatus = "FAILED";
            log.Notes           = "PaymentCode không tồn tại";
            await _db.SaveChangesAsync();
            return false;
        }

        if (tx.Status == PaymentStatus.Paid)
        {
            log.ProcessedStatus = "IGNORED";
            await _db.SaveChangesAsync();
            return true;
        }

        switch (result.ToLower())
        {
            case "success":
                tx.Status          = PaymentStatus.Paid;
                tx.PaidAt          = DateTime.UtcNow;
                tx.TransactionCode = $"VNPAY_{DateTime.UtcNow:yyyyMMddHHmmss}";
                tx.GatewayResponse = JsonSerializer.Serialize(new { provider = "VNPAY", result });
                if (tx.Order is not null)
                {
                    tx.Order.PaymentStatus = "PAID";
                    tx.Order.PaidAt        = DateTime.UtcNow;
                    tx.Order.UpdatedAt     = DateTime.UtcNow;
                }
                log.ProcessedStatus = "SUCCESS";
                break;

            case "failed":
                tx.Status = PaymentStatus.Failed;
                log.ProcessedStatus = "SUCCESS";
                break;

            case "cancelled":
                tx.Status = PaymentStatus.Cancelled;
                log.ProcessedStatus = "SUCCESS";
                break;

            default:
                log.ProcessedStatus = "FAILED";
                await _db.SaveChangesAsync();
                return false;
        }

        await _db.SaveChangesAsync();
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lấy giao dịch thanh toán hiện tại của đơn hàng
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<PaymentTransactionDto?> GetByOrderIdAsync(int orderId, Guid tenantId)
    {
        var tx = await _db.PaymentTransactions
            .Where(t => t.OrderId == orderId && t.TenantId == tenantId)
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (tx is null) return null;

        BankTransferInfoDto? bankInfo   = null;
        VietQRInfoDto?       vietQrInfo = null;

        if (tx.Status == PaymentStatus.Pending)
        {
            if (tx.PaymentMethod == PaymentMethod.BANK_TRANSFER)
                bankInfo = await _vietqr.GetBankTransferInfoAsync(tx.PaymentCode);
            else if (tx.PaymentMethod == PaymentMethod.VIETQR)
                vietQrInfo = await _vietqr.GetVietQRAsync(tx.PaymentCode);
        }

        return MapToDto(tx, bankInfo, vietQrInfo);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lịch sử thanh toán (paginated)
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<(List<PaymentTransactionDto> Items, int Total)> GetHistoryAsync(
        Guid tenantId, int page, int pageSize)
    {
        var query = _db.PaymentTransactions
            .Where(t => t.TenantId == tenantId)
            .OrderByDescending(t => t.CreatedAt);

        var total = await query.CountAsync();
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items.Select(t => MapToDto(t)).ToList(), total);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────────────
    private static PaymentTransactionDto MapToDto(
        PaymentTransaction tx,
        BankTransferInfoDto? bankInfo = null,
        VietQRInfoDto? vietQrInfo = null) => new(
            Id             : tx.Id,
            OrderId        : tx.OrderId,
            InvoiceId      : tx.InvoiceId,
            PaymentCode    : tx.PaymentCode,
            PaymentMethod  : tx.PaymentMethod.ToString(),
            Amount         : tx.Amount,
            Currency       : tx.Currency,
            Status         : tx.Status.ToString(),
            TransactionCode: tx.TransactionCode,
            CreatedAt      : tx.CreatedAt,
            PaidAt         : tx.PaidAt,
            ExpiredAt      : tx.ExpiredAt,
            BankInfo       : bankInfo,
            VietQRInfo     : vietQrInfo
        );
}
