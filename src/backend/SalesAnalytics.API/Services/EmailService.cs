using System.Text;
using System.Text.Json;

namespace SalesAnalytics.API.Services;

public interface IEmailService
{
    Task<bool> SendOtpAsync(string toEmail, string otp, string purpose);
    Task<bool> SendWelcomeAsync(string toEmail, string companyName, string ownerName);
    Task<bool> SendPasswordResetAsync(string toEmail, string otp);
    Task<bool> SendAlertAsync(string toEmail, string title, string body);
    Task<bool> SendSubscriptionConfirmedAsync(string toEmail, string companyName, string plan, DateTime expiresAt);
    Task<bool> SendSubscriptionExpiryWarningAsync(string toEmail, string companyName, DateTime expiresAt, int daysLeft);
    Task<bool> SendPurchaseOrderAsync(string toEmail, string supplierName, string poCode,
        decimal totalAmount, List<(string ProductName, int Qty, decimal Price)> items, string senderCompany);
}

public class ResendEmailService(
    HttpClient httpClient,
    IConfiguration config,
    IWebHostEnvironment env,
    ILogger<ResendEmailService> logger) : IEmailService
{
    private readonly string  _apiKey        = config["Resend:ApiKey"]        ?? "";
    private readonly string  _fromEmail     = config["Resend:FromEmail"]     ?? "onboarding@resend.dev";
    private readonly string  _fromName      = config["Resend:FromName"]      ?? "MSAS - SalesAnalytics";
    private readonly string? _devOverrideTo = config["Email:DevOverrideTo"];

    public async Task<bool> SendOtpAsync(string toEmail, string otp, string purpose)
    {
        var subject = purpose == "forgot_password"
            ? "[MSAS] Mã xác nhận đặt lại mật khẩu"
            : "[MSAS] Mã xác thực OTP của bạn";

        var actionLabel = purpose == "forgot_password"
            ? "Đặt lại mật khẩu của bạn"
            : "Xác thực tài khoản của bạn";

        var html = BuildOtpHtml(otp, actionLabel);
        return await SendAsync(toEmail, subject, html);
    }

    public async Task<bool> SendWelcomeAsync(string toEmail, string companyName, string ownerName)
    {
        var subject = "[MSAS] Chào mừng bạn đến với SalesAnalytics!";
        var html    = BuildWelcomeHtml(companyName, ownerName);
        return await SendAsync(toEmail, subject, html);
    }

    public async Task<bool> SendPasswordResetAsync(string toEmail, string otp)
        => await SendOtpAsync(toEmail, otp, "forgot_password");

    public async Task<bool> SendAlertAsync(string toEmail, string title, string body)
    {
        var html = BuildAlertHtml(title, body);
        return await SendAsync(toEmail, title, html);
    }

    public async Task<bool> SendSubscriptionConfirmedAsync(string toEmail, string companyName, string plan, DateTime expiresAt)
    {
        var planLabel = plan == "pro" ? "Chuyên nghiệp (Pro)" : "Doanh nghiệp";
        var subject   = $"[MSAS] Đăng ký gói {planLabel} thành công";
        var html      = BuildSubscriptionConfirmedHtml(companyName, planLabel, expiresAt);
        return await SendAsync(toEmail, subject, html);
    }

    public async Task<bool> SendSubscriptionExpiryWarningAsync(string toEmail, string companyName, DateTime expiresAt, int daysLeft)
    {
        var subject = daysLeft <= 1
            ? $"[MSAS] Gói Pro của {companyName} hết hạn hôm nay!"
            : $"[MSAS] Gói Pro của {companyName} sắp hết hạn trong {daysLeft} ngày";
        var html = BuildExpiryWarningHtml(companyName, expiresAt, daysLeft);
        return await SendAsync(toEmail, subject, html);
    }

    // ── Internal: gọi Resend API ─────────────────────────────────────────────
    private async Task<bool> SendAsync(string toEmail, string subject, string html)
    {
        if (string.IsNullOrEmpty(_apiKey))
        {
            logger.LogWarning("Resend API key chưa được cấu hình. Bỏ qua gửi email đến {Email}", toEmail);
            return false;
        }

        // Resend free plan chỉ gửi được đến email đã đăng ký — override trong Development
        var actualTo = env.IsDevelopment() && !string.IsNullOrEmpty(_devOverrideTo)
            ? _devOverrideTo
            : toEmail;

        if (actualTo != toEmail)
            logger.LogWarning("[DEV] Override email recipient: {Original} → {Override}", toEmail, actualTo);

        try
        {
            var payload = new
            {
                from    = $"{_fromName} <{_fromEmail}>",
                to      = new[] { actualTo },
                subject,
                html,
            };

            var json    = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            httpClient.DefaultRequestHeaders.Clear();
            httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");

            var resp = await httpClient.PostAsync("https://api.resend.com/emails", content);

            if (!resp.IsSuccessStatusCode)
            {
                var err = await resp.Content.ReadAsStringAsync();
                logger.LogError("Resend API lỗi {Status}: {Error}", resp.StatusCode, err);
                return false;
            }

            logger.LogInformation("Đã gửi email đến {Email} | Subject: {Subject}", actualTo, subject);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi gửi email đến {Email}", actualTo);
            return false;
        }
    }

    // ── HTML Templates ────────────────────────────────────────────────────────
    private static string BuildOtpHtml(string otp, string actionLabel) => $"""
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px">
                      📊 SalesAnalytics
                    </h1>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px">
                      Hệ thống phân tích bán hàng đa kênh
                    </p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:40px">
                    <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px">{actionLabel}</h2>
                    <p style="margin:0 0 28px;color:#64748b;font-size:15px;line-height:1.6">
                      Sử dụng mã OTP dưới đây để xác thực. Mã có hiệu lực trong <strong>10 phút</strong>.
                    </p>
                    <!-- OTP Box -->
                    <div style="background:#f1f5f9;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;
                                border:2px dashed #6366f1">
                      <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px">
                        Mã xác thực của bạn
                      </p>
                      <span style="font-size:48px;font-weight:900;letter-spacing:12px;color:#6366f1;
                                   font-family:'Courier New',monospace">{otp}</span>
                    </div>
                    <div style="background:#fef3c7;border-radius:8px;padding:14px 18px;margin-bottom:20px">
                      <p style="margin:0;color:#92400e;font-size:13px">
                        ⚠️ <strong>Không chia sẻ mã này với bất kỳ ai</strong>, kể cả nhân viên hỗ trợ của chúng tôi.
                      </p>
                    </div>
                    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6">
                      Nếu bạn không yêu cầu mã này, hãy bỏ qua email này. Tài khoản của bạn vẫn an toàn.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
                    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">
                      © 2026 SalesAnalytics · Hệ thống phân tích bán hàng MSAS
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body></html>
        """;

    private static string BuildWelcomeHtml(string companyName, string ownerName) => $"""
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"></head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
                <tr>
                  <td style="background:linear-gradient(135deg,#10b981,#6366f1);padding:32px 40px;text-align:center;border-radius:16px 16px 0 0">
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">Chào mừng đến MSAS! 🎉</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px">
                    <p style="color:#1e293b;font-size:16px">Xin chào <strong>{ownerName}</strong>,</p>
                    <p style="color:#64748b;font-size:15px;line-height:1.7">
                      Tài khoản <strong>{companyName}</strong> đã được tạo thành công trên SalesAnalytics.<br>
                      Bạn có thể bắt đầu kết nối các kênh bán hàng và phân tích dữ liệu ngay bây giờ.
                    </p>
                    <p style="color:#94a3b8;font-size:13px;margin-top:24px">
                      Chúc bạn kinh doanh thành công!<br>
                      <strong>Đội ngũ SalesAnalytics</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body></html>
        """;

    private static string BuildSubscriptionConfirmedHtml(string companyName, string planLabel, DateTime expiresAt) => $"""
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                <tr>
                  <td style="background:linear-gradient(135deg,#10b981,#6366f1);padding:32px 40px;text-align:center">
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">🎉 Đăng ký thành công!</h1>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px">MSAS – SalesAnalytics Platform</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px">
                    <p style="color:#1e293b;font-size:16px;margin:0 0 16px">Xin chào <strong>{companyName}</strong>,</p>
                    <p style="color:#64748b;font-size:15px;line-height:1.7;margin:0 0 24px">
                      Gói dịch vụ <strong style="color:#6366f1">{planLabel}</strong> của bạn đã được kích hoạt thành công.
                      Bạn có thể sử dụng đầy đủ các tính năng AI phân tích và báo cáo nâng cao ngay bây giờ.
                    </p>
                    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:20px;margin-bottom:24px">
                      <table width="100%" cellpadding="4">
                        <tr>
                          <td style="color:#166534;font-size:13px;width:50%">📦 Gói dịch vụ</td>
                          <td style="color:#15803d;font-size:14px;font-weight:700">{planLabel}</td>
                        </tr>
                        <tr>
                          <td style="color:#166534;font-size:13px">🤖 AI & Dự báo</td>
                          <td style="color:#15803d;font-size:14px;font-weight:700">Đã bật</td>
                        </tr>
                        <tr>
                          <td style="color:#166534;font-size:13px">📅 Hết hạn</td>
                          <td style="color:#15803d;font-size:14px;font-weight:700">{expiresAt:dd/MM/yyyy}</td>
                        </tr>
                      </table>
                    </div>
                    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6">
                      Chúc bạn kinh doanh thành công!<br><strong>Đội ngũ SalesAnalytics</strong>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
                    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">
                      © 2026 SalesAnalytics · Hệ thống phân tích bán hàng MSAS
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body></html>
        """;

    private static string BuildExpiryWarningHtml(string companyName, DateTime expiresAt, int daysLeft) => $"""
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px 40px;text-align:center">
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">
                      ⚠️ {(daysLeft <= 1 ? "Gói Pro hết hạn hôm nay!" : $"Gói Pro sắp hết hạn ({daysLeft} ngày)")}
                    </h1>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px">MSAS – SalesAnalytics Platform</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px">
                    <p style="color:#1e293b;font-size:16px;margin:0 0 16px">Xin chào <strong>{companyName}</strong>,</p>
                    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:20px;margin-bottom:24px">
                      <p style="margin:0;color:#92400e;font-size:15px;line-height:1.7">
                        {(daysLeft <= 1
                            ? "Gói Pro của bạn <strong>hết hạn hôm nay</strong>. Sau khi hết hạn, các tính năng AI và báo cáo nâng cao sẽ bị tạm khóa."
                            : $"Gói Pro của bạn sẽ hết hạn vào ngày <strong>{expiresAt:dd/MM/yyyy}</strong> ({daysLeft} ngày nữa).")}
                      </p>
                    </div>
                    <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 24px">
                      Để tiếp tục sử dụng đầy đủ tính năng AI phân tích, vui lòng đăng nhập và gia hạn gói dịch vụ tại trang <strong>Cài đặt → Gói dịch vụ</strong>.
                    </p>
                    <p style="margin:0;color:#94a3b8;font-size:13px">
                      Trân trọng,<br><strong>Đội ngũ SalesAnalytics</strong>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
                    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">
                      © 2026 SalesAnalytics · Hệ thống phân tích bán hàng MSAS
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body></html>
        """;

    public async Task<bool> SendPurchaseOrderAsync(string toEmail, string supplierName, string poCode,
        decimal totalAmount, List<(string ProductName, int Qty, decimal Price)> items, string senderCompany)
    {
        var subject = $"[{senderCompany}] Phiếu đặt hàng mới #{poCode}";
        var html    = BuildPurchaseOrderHtml(supplierName, poCode, totalAmount, items, senderCompany);
        return await SendAsync(toEmail, subject, html);
    }

    private static string BuildPurchaseOrderHtml(string supplierName, string poCode, decimal totalAmount,
        List<(string ProductName, int Qty, decimal Price)> items, string senderCompany)
    {
        var rows = string.Join("", items.Select((it, i) => $"""
            <tr style="background:{(i % 2 == 0 ? "#f8fafc" : "#fff")}">
              <td style="padding:10px 16px;color:#1e293b;font-size:14px">{it.ProductName}</td>
              <td style="padding:10px 16px;color:#475569;font-size:14px;text-align:center">{it.Qty}</td>
              <td style="padding:10px 16px;color:#475569;font-size:14px;text-align:right">{it.Price:N0}đ</td>
              <td style="padding:10px 16px;color:#1e293b;font-size:14px;text-align:right;font-weight:600">{(it.Qty * it.Price):N0}đ</td>
            </tr>
            """));

        return $"""
            <!DOCTYPE html>
            <html lang="vi">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
                <tr><td align="center">
                  <table width="620" cellpadding="0" cellspacing="0"
                         style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                    <tr>
                      <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
                        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">📦 Phiếu đặt hàng mới</h1>
                        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px">{senderCompany}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 40px">
                        <p style="color:#1e293b;font-size:16px;margin:0 0 8px">Kính gửi <strong>{supplierName}</strong>,</p>
                        <p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 24px">
                          Chúng tôi xin gửi phiếu đặt hàng <strong style="color:#6366f1">#{poCode}</strong> để quý vị xem xét và xác nhận.
                        </p>
                        <!-- Table -->
                        <table width="100%" cellpadding="0" cellspacing="0"
                               style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px">
                          <thead>
                            <tr style="background:#6366f1">
                              <th style="padding:12px 16px;color:#fff;font-size:13px;text-align:left">Sản phẩm</th>
                              <th style="padding:12px 16px;color:#fff;font-size:13px;text-align:center">Số lượng</th>
                              <th style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">Đơn giá</th>
                              <th style="padding:12px 16px;color:#fff;font-size:13px;text-align:right">Thành tiền</th>
                            </tr>
                          </thead>
                          <tbody>{rows}</tbody>
                          <tfoot>
                            <tr style="background:#f1f5f9;border-top:2px solid #e2e8f0">
                              <td colspan="3" style="padding:14px 16px;color:#475569;font-size:14px;font-weight:600">
                                Tổng cộng
                              </td>
                              <td style="padding:14px 16px;color:#6366f1;font-size:16px;font-weight:700;text-align:right">
                                {totalAmount:N0}đ
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:20px">
                          <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.7">
                            📩 Vui lòng <strong>trả lời email này</strong> hoặc liên hệ trực tiếp để xác nhận đơn hàng.<br>
                            Sau khi xác nhận, chúng tôi sẽ cập nhật trạng thái phiếu nhập trong hệ thống.
                          </p>
                        </div>
                        <p style="margin:0;color:#94a3b8;font-size:13px">
                          Trân trọng,<br><strong>{senderCompany}</strong>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
                        <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">
                          © 2026 SalesAnalytics · Hệ thống quản lý bán hàng MSAS
                        </p>
                      </td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
            """;
    }

    private static string BuildAlertHtml(string title, string body) => $"""
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                <tr>
                  <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:32px 40px;text-align:center">
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px">
                      🔔 SalesAnalytics
                    </h1>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px">
                      Cảnh báo tự động từ hệ thống
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px">
                    <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px">{title}</h2>
                    <div style="background:#f8fafc;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;
                                padding:16px 20px;margin-bottom:24px">
                      <p style="margin:0;color:#475569;font-size:14px;line-height:1.8;white-space:pre-line">{body}</p>
                    </div>
                    <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6">
                      Đây là cảnh báo tự động. Đăng nhập vào hệ thống để xem chi tiết và xử lý.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
                    <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">
                      © 2026 SalesAnalytics · Hệ thống phân tích bán hàng MSAS
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body></html>
        """;
}
