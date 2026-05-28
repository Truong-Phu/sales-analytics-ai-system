using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Sinh QR VietQR thật theo chuẩn Napas.
/// Đọc thông tin ngân hàng từ system_payment_accounts (nguồn duy nhất).
/// URL: https://img.vietqr.io/image/{bankBin}-{accountNumber}-compact2.png?amount=...
/// </summary>
public class VietQRService
{
    private readonly AppDbContext _db;

    public VietQRService(AppDbContext db) => _db = db;

    public async Task<VietQRInfoDto?> GetVietQRAsync(string paymentCode)
    {
        // Ưu tiên tài khoản is_default, sau đó sort_order
        var account = await _db.SystemPaymentAccounts
            .Where(a => a.Method == "vietqr" && a.IsActive)
            .OrderBy(a => a.IsDefault ? 0 : 1)
            .ThenBy(a => a.SortOrder)
            .FirstOrDefaultAsync();

        if (account is null) return null;

        var cfg = account.Config.RootElement;

        var bankBin       = GetStr(cfg, "bank_bin");
        var accountNumber = GetStr(cfg, "account_number");
        var accountName   = GetStr(cfg, "account_name");
        var bankName      = GetStr(cfg, "bank_name") ?? "Ngân hàng";

        if (string.IsNullOrEmpty(bankBin) || string.IsNullOrEmpty(accountNumber)) return null;

        var tx = await _db.PaymentTransactions
            .FirstOrDefaultAsync(t => t.PaymentCode == paymentCode);
        if (tx is null) return null;

        var qrUrl = $"https://img.vietqr.io/image/{bankBin}-{accountNumber}-compact2.png" +
                    $"?amount={(long)tx.Amount}" +
                    $"&addInfo={Uri.EscapeDataString(paymentCode)}" +
                    $"&accountName={Uri.EscapeDataString(accountName ?? "")}";

        return new VietQRInfoDto(
            QrDataUrl      : qrUrl,
            BankName       : bankName,
            BankBin        : bankBin,
            AccountNumber  : accountNumber,
            AccountHolder  : accountName ?? "",
            TransferContent: paymentCode,
            Amount         : tx.Amount
        );
    }

    private static string? GetStr(System.Text.Json.JsonElement el, string key)
        => el.TryGetProperty(key, out var v) ? v.GetString() : null;
}
