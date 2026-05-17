using System.Security.Cryptography;

namespace SalesAnalytics.API.Services;

/// <summary>
/// AES-256-GCM encrypt / decrypt cho Integration tokens.
/// Format: base64( nonce[12] + ciphertext + tag[16] ) — tương thích với Python CryptoService.
/// Key đọc từ config "Encryption:Key" (64 hex chars = 32 bytes).
/// Nếu key chưa cấu hình → passthrough (dev mode).
/// </summary>
public class CryptoService(IConfiguration config, ILogger<CryptoService> logger)
{
    private const int NonceSize = 12;
    private const int TagSize   = 16;

    private byte[]? _key;

    private byte[]? GetKey()
    {
        if (_key is not null) return _key;

        var hex = config["Encryption:Key"] ?? "";
        if (hex.Length == 64)
        {
            try
            {
                _key = Convert.FromHexString(hex);
                return _key;
            }
            catch (FormatException)
            {
                logger.LogWarning("Encryption:Key không hợp lệ (không phải hex). Chạy passthrough.");
            }
        }
        return null;
    }

    /// <summary>
    /// Mã hóa chuỗi bằng AES-256-GCM.
    /// Nếu key chưa cấu hình → trả về plaintext nguyên (dev mode).
    /// </summary>
    public string Encrypt(string plaintext)
    {
        var key = GetKey();
        if (key is null) return plaintext;

        var nonce      = RandomNumberGenerator.GetBytes(NonceSize);
        var plainBytes = System.Text.Encoding.UTF8.GetBytes(plaintext);
        var cipher     = new byte[plainBytes.Length];
        var tag        = new byte[TagSize];

        using var aes = new AesGcm(key, TagSize);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        // Format: nonce[12] + ciphertext + tag[16]
        var combined = new byte[NonceSize + cipher.Length + TagSize];
        nonce.CopyTo(combined, 0);
        cipher.CopyTo(combined, NonceSize);
        tag.CopyTo(combined, NonceSize + cipher.Length);

        return Convert.ToBase64String(combined);
    }

    /// <summary>
    /// Giải mã chuỗi AES-256-GCM.
    /// Nếu key chưa cấu hình hoặc decrypt lỗi → trả về ciphertext nguyên.
    /// </summary>
    public string Decrypt(string ciphertext)
    {
        if (string.IsNullOrEmpty(ciphertext)) return ciphertext;

        var key = GetKey();
        if (key is null) return ciphertext;

        try
        {
            var combined = Convert.FromBase64String(ciphertext);
            if (combined.Length < NonceSize + TagSize)
                return ciphertext; // dữ liệu chưa mã hóa (plaintext)

            var nonce  = combined[..NonceSize];
            var tag    = combined[^TagSize..];
            var cipher = combined[NonceSize..^TagSize];
            var plain  = new byte[cipher.Length];

            using var aes = new AesGcm(key, TagSize);
            aes.Decrypt(nonce, cipher, tag, plain);

            return System.Text.Encoding.UTF8.GetString(plain);
        }
        catch (Exception ex)
        {
            logger.LogWarning("CryptoService.Decrypt thất bại: {Msg}. Trả về ciphertext nguyên.", ex.Message);
            return ciphertext;
        }
    }
}
