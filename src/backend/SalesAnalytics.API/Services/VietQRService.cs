using System.Text.Json;
using SalesAnalytics.Core.DTOs;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace SalesAnalytics.API.Services;

/// <summary>
/// Sinh QR VietQR thật theo chuẩn Napas.
/// URL ảnh QR: https://img.vietqr.io/image/{bankBin}-{accountNumber}-compact2.png?amount={amount}&addInfo={content}&accountName={accountName}
/// </summary>
public class VietQRService
{
    private readonly AppDbContext _db;

    public VietQRService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<VietQRInfoDto?> GetVietQRAsync(string paymentCode)
    {
        var config = await _db.PaymentMethodConfigs
            .FirstOrDefaultAsync(c => c.PaymentMethod == "VIETQR" && c.Enabled);

        if (config?.ConfigJson is null) return null;

        var cfg = ParseConfig(config.ConfigJson);
        if (cfg is null) return null;

        var bankBin       = cfg.TryGetValue("bankBin", out var b) ? b?.ToString() : null;
        var accountNumber = cfg.TryGetValue("accountNumber", out var an) ? an?.ToString() : null;
        var accountHolder = cfg.TryGetValue("accountHolder", out var ah) ? ah?.ToString() : null;
        var bankName      = cfg.TryGetValue("bankName", out var bn) ? bn?.ToString() ?? "Ngân hàng" : "Ngân hàng";

        if (string.IsNullOrEmpty(bankBin) || string.IsNullOrEmpty(accountNumber)) return null;

        // Lấy thông tin giao dịch để biết amount
        var tx = await _db.PaymentTransactions
            .FirstOrDefaultAsync(t => t.PaymentCode == paymentCode);
        if (tx is null) return null;

        var encodedContent = Uri.EscapeDataString(paymentCode);
        var encodedName    = Uri.EscapeDataString(accountHolder ?? "");
        var qrUrl = $"https://img.vietqr.io/image/{bankBin}-{accountNumber}-compact2.png" +
                    $"?amount={(long)tx.Amount}&addInfo={encodedContent}&accountName={encodedName}";

        return new VietQRInfoDto(
            QrDataUrl      : qrUrl,
            BankName       : bankName,
            BankBin        : bankBin,
            AccountNumber  : accountNumber,
            AccountHolder  : accountHolder ?? "",
            TransferContent: paymentCode,
            Amount         : tx.Amount
        );
    }

    public async Task<BankTransferInfoDto?> GetBankTransferInfoAsync(string paymentCode)
    {
        var config = await _db.PaymentMethodConfigs
            .FirstOrDefaultAsync(c => c.PaymentMethod == "BANK_TRANSFER" && c.Enabled);

        if (config?.ConfigJson is null)
        {
            // Fallback config nếu chưa cấu hình
            return new BankTransferInfoDto(
                BankName       : "Vietcombank",
                BankBin        : null,
                AccountNumber  : "1234567890",
                AccountHolder  : "CONG TY TNHH MSAS",
                TransferContent: paymentCode,
                Amount         : 0
            );
        }

        var cfg = ParseConfig(config.ConfigJson);

        var tx = await _db.PaymentTransactions
            .FirstOrDefaultAsync(t => t.PaymentCode == paymentCode);

        return new BankTransferInfoDto(
            BankName       : cfg?.TryGetValue("bankName", out var bn) == true ? bn?.ToString() ?? "Ngân hàng" : "Ngân hàng",
            BankBin        : cfg?.TryGetValue("bankBin", out var bb) == true ? bb?.ToString() : null,
            AccountNumber  : cfg?.TryGetValue("accountNumber", out var an) == true ? an?.ToString() ?? "" : "",
            AccountHolder  : cfg?.TryGetValue("accountHolder", out var ah) == true ? ah?.ToString() ?? "" : "",
            TransferContent: paymentCode,
            Amount         : tx?.Amount ?? 0
        );
    }

    private static Dictionary<string, object?>? ParseConfig(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return null;
        }
    }
}
