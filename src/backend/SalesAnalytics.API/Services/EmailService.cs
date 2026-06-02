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
    Task<bool> SendTrialExpiredAsync(string toEmail, string companyName);
    Task<bool> SendInviteUserAsync(string toEmail, string fullName, string companyName, string role, string tempPassword);
    Task<bool> SendPurchaseOrderAsync(string toEmail, string supplierName, string poCode,
        decimal totalAmount, List<(string ProductName, int Qty, decimal Price)> items,
        string senderCompany, string? approvalUrl = null);

    Task<bool> SendPayslipAsync(
        string toEmail, string fullName, int year, int month,
        decimal baseSalary, decimal bonusAmount, decimal penaltyAmount, decimal totalSalary,
        decimal actualRevenue, decimal? revenueTarget,
        long actualOrders, int? orderTarget,
        bool isKpiAchieved, string status);

    Task<bool> SendKpiNotificationAsync(
        string toEmail, string fullName, string companyName,
        int year, int month,
        decimal? revenueTarget, int? orderTarget, int? custTarget,
        string? note = null);

    Task<bool> SendRoleChangeNotificationAsync(
        string toEmail, string fullName, string oldRole, string newRole,
        bool isActive, string companyName);
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

    public async Task<bool> SendTrialExpiredAsync(string toEmail, string companyName)
    {
        var subject = $"[MSAS] Thời gian dùng thử của {companyName} đã kết thúc";
        var html    = BuildTrialExpiredHtml(companyName);
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

    public async Task<bool> SendInviteUserAsync(string toEmail, string fullName, string companyName, string role, string tempPassword)
    {
        var roleLabel = role switch {
            "Staff_Sales"     => "Nhân viên Bán hàng",
            "Staff_Warehouse" => "Nhân viên Kho",
            "Staff_Marketing" => "Nhân viên Marketing",
            "Manager"         => "Quản lý",
            "DataIT"          => "Data/IT",
            "Viewer"          => "Người xem",
            _                 => role,
        };
        var subject = $"[MSAS] Bạn được mời tham gia {companyName}";
        var html = $"""
            <!DOCTYPE html>
            <html lang="vi">
            <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0"
                         style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                    <tr>
                      <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px;text-align:center">
                        <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">📊 SalesAnalytics</h1>
                        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Hệ thống phân tích bán hàng đa kênh</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:40px">
                        <h2 style="margin:0 0 12px;color:#1e293b;font-size:20px">Xin chào {fullName}!</h2>
                        <p style="margin:0 0 20px;color:#64748b;font-size:15px;line-height:1.7">
                          Bạn đã được mời tham gia <strong>{companyName}</strong> trên hệ thống SalesAnalytics với vai trò
                          <strong style="color:#6366f1">{roleLabel}</strong>.
                        </p>
                        <div style="background:#f1f5f9;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #e2e8f0">
                          <p style="margin:0 0 12px;color:#475569;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px">
                            Thông tin đăng nhập
                          </p>
                          <table width="100%" cellpadding="6">
                            <tr>
                              <td style="color:#64748b;font-size:14px;width:120px">Email</td>
                              <td style="color:#1e293b;font-size:14px;font-weight:600">{toEmail}</td>
                            </tr>
                            <tr>
                              <td style="color:#64748b;font-size:14px">Mật khẩu</td>
                              <td style="color:#6366f1;font-size:16px;font-weight:700;font-family:monospace">{tempPassword}</td>
                            </tr>
                            <tr>
                              <td style="color:#64748b;font-size:14px">Vai trò</td>
                              <td style="color:#1e293b;font-size:14px;font-weight:600">{roleLabel}</td>
                            </tr>
                          </table>
                        </div>
                        <div style="background:#fef3c7;border-radius:8px;padding:14px 18px;margin-bottom:20px">
                          <p style="margin:0;color:#92400e;font-size:13px">
                            ⚠️ <strong>Hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên</strong> tại trang Tài khoản → Đổi mật khẩu.
                          </p>
                        </div>
                        <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6">
                          Chúc bạn làm việc hiệu quả!<br>
                          <strong>Đội ngũ SalesAnalytics</strong>
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
        return await SendAsync(toEmail, subject, html);
    }

    public async Task<bool> SendPurchaseOrderAsync(string toEmail, string supplierName, string poCode,
        decimal totalAmount, List<(string ProductName, int Qty, decimal Price)> items,
        string senderCompany, string? approvalUrl = null)
    {
        var subject = $"[{senderCompany}] Phiếu đặt hàng mới #{poCode}";
        var html    = BuildPurchaseOrderHtml(supplierName, poCode, totalAmount, items, senderCompany, approvalUrl);
        return await SendAsync(toEmail, subject, html);
    }

    private static string BuildPurchaseOrderHtml(string supplierName, string poCode, decimal totalAmount,
        List<(string ProductName, int Qty, decimal Price)> items, string senderCompany, string? approvalUrl = null)
    {
        var approvalSection = approvalUrl != null
            ? $"""
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 24px;margin-bottom:20px">
                <p style="margin:0 0 10px;color:#166534;font-size:14px;font-weight:600">
                  📋 Để xác nhận đơn hàng, quý vị cần:
                </p>
                <ol style="margin:0 0 16px;padding-left:20px;color:#15803d;font-size:13px;line-height:1.9">
                  <li>Nhấn nút <strong>"Xác nhận & Hẹn ngày giao"</strong> bên dưới</li>
                  <li>Chọn <strong>ngày giao hàng dự kiến</strong> mà quý vị có thể thực hiện</li>
                  <li>Thêm ghi chú nếu cần (điều kiện giao hàng, lịch trình...)</li>
                  <li>Nhấn <strong>"Xác nhận"</strong> để hoàn tất</li>
                </ol>
                <div style="text-align:center">
                  <a href="{approvalUrl}" style="display:inline-block;background:#6366f1;color:#fff;font-size:15px;
                            font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none">
                    📅 Xác nhận & Hẹn ngày giao hàng
                  </a>
                </div>
                <p style="margin:12px 0 0;color:#94a3b8;font-size:11px;text-align:center">
                  Ngày giao hàng quý vị cam kết sẽ được dùng để đánh giá hiệu suất giao hàng. Link hiệu lực 72 giờ.
                </p>
              </div>
              """
            : """
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:20px">
                <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.7">
                  📩 Vui lòng <strong>trả lời email này</strong> hoặc liên hệ trực tiếp để xác nhận đơn hàng và hẹn ngày giao hàng.
                </p>
              </div>
              """;

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
                          Chúng tôi xin gửi phiếu đặt hàng <strong style="color:#6366f1">#{poCode}</strong> để quý vị xem xét.
                        </p>
                        <!-- Bảng sản phẩm -->
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
                              <td colspan="3" style="padding:14px 16px;color:#475569;font-size:14px;font-weight:600">Tổng cộng</td>
                              <td style="padding:14px 16px;color:#6366f1;font-size:16px;font-weight:700;text-align:right">
                                {totalAmount:N0}đ
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                        <!-- Nút duyệt phiếu hoặc hướng dẫn trả lời email -->
                        {approvalSection}
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

    // ── Phiếu lương nhân viên ─────────────────────────────────────────────────
    public async Task<bool> SendPayslipAsync(
        string toEmail, string fullName, int year, int month,
        decimal baseSalary, decimal bonusAmount, decimal penaltyAmount, decimal totalSalary,
        decimal actualRevenue, decimal? revenueTarget,
        long actualOrders, int? orderTarget,
        bool isKpiAchieved, string status)
    {
        var subject = $"[MSAS] Phiếu lương tháng {month}/{year} — {fullName}";
        var html    = BuildPayslipHtml(fullName, year, month, baseSalary, bonusAmount, penaltyAmount,
                                       totalSalary, actualRevenue, revenueTarget,
                                       actualOrders, orderTarget, isKpiAchieved, status);
        return await SendAsync(toEmail, subject, html);
    }

    private static string BuildPayslipHtml(
        string fullName, int year, int month,
        decimal baseSalary, decimal bonusAmount, decimal penaltyAmount, decimal totalSalary,
        decimal actualRevenue, decimal? revenueTarget,
        long actualOrders, int? orderTarget,
        bool isKpiAchieved, string status)
    {
        string Fmt(decimal v) => v.ToString("N0") + " ₫";
        string FmtO(long v) => v.ToString("N0");
        var kpiLabel  = isKpiAchieved ? "✅ Đạt KPI" : "⚠ Chưa đạt KPI";
        var kpiColor  = isKpiAchieved ? "#10B981" : "#F59E0B";
        var revRow    = revenueTarget.HasValue
            ? $"<tr><td>Doanh thu thực tế / Mục tiêu</td><td>{Fmt(actualRevenue)} / {Fmt(revenueTarget.Value)}</td></tr>"
            : $"<tr><td>Doanh thu thực tế</td><td>{Fmt(actualRevenue)}</td></tr>";
        var ordRow    = orderTarget.HasValue
            ? $"<tr><td>Số đơn thực tế / Mục tiêu</td><td>{FmtO(actualOrders)} / {orderTarget}</td></tr>"
            : "";

        return $"""
        <!DOCTYPE html><html><body style="font-family:sans-serif;color:#1e293b;background:#f8fafc;padding:20px">
          <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
            <div style="background:linear-gradient(135deg,#6366f1,#3b82f6);padding:24px 32px;color:#fff">
              <h2 style="margin:0;font-size:20px">Phiếu lương tháng {month}/{year}</h2>
              <p style="margin:4px 0 0;opacity:0.85">{fullName}</p>
            </div>
            <div style="padding:24px 32px">
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr style="background:#f1f5f9">
                  <th colspan="2" style="text-align:left;padding:8px 12px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">
                    Kết quả KPI
                  </th>
                </tr>
                {revRow}
                {ordRow}
                <tr><td style="padding:6px 12px;color:#64748b">Trạng thái KPI</td>
                    <td style="padding:6px 12px;font-weight:700;color:{kpiColor}">{kpiLabel}</td></tr>
                <tr style="background:#f1f5f9">
                  <th colspan="2" style="text-align:left;padding:8px 12px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">
                    Chi tiết lương
                  </th>
                </tr>
                <tr><td style="padding:6px 12px;color:#64748b">Lương cơ bản</td>
                    <td style="padding:6px 12px">{Fmt(baseSalary)}</td></tr>
                <tr><td style="padding:6px 12px;color:#10B981">Thưởng KPI</td>
                    <td style="padding:6px 12px;color:{(isKpiAchieved ? "#10B981" : "#94a3b8")}">{(isKpiAchieved ? "+" : "")}{Fmt(bonusAmount)}</td></tr>
                <tr><td style="padding:6px 12px;color:#EF4444">Khấu trừ</td>
                    <td style="padding:6px 12px;color:#EF4444">-{Fmt(penaltyAmount)}</td></tr>
                <tr style="border-top:2px solid #6366f1">
                  <td style="padding:10px 12px;font-weight:700">TỔNG LƯƠNG</td>
                  <td style="padding:10px 12px;font-weight:700;font-size:18px;color:#6366f1">{Fmt(totalSalary)}</td>
                </tr>
                <tr><td style="padding:6px 12px;color:#64748b">Trạng thái</td>
                    <td style="padding:6px 12px"><strong>{status}</strong></td></tr>
              </table>
              <p style="margin-top:20px;font-size:12px;color:#94a3b8">
                Email được gửi từ hệ thống MSAS — SalesAnalytics. Vui lòng không trả lời email này.
              </p>
            </div>
          </div>
        </body></html>
        """;
    }

    // ── Thông báo KPI target cho nhân viên ──────────────────────────────────
    public async Task<bool> SendKpiNotificationAsync(
        string toEmail, string fullName, string companyName,
        int year, int month,
        decimal? revenueTarget, int? orderTarget, int? custTarget,
        string? note = null)
    {
        var subject = $"[{companyName}] KPI tháng {month}/{year} của bạn đã được cập nhật";
        static string Row(string label, string val) =>
            $"<tr><td style='padding:8px 12px;color:#64748b;font-size:13px'>{label}</td><td style='padding:8px 12px;font-weight:600;font-size:13px;color:#0f172a'>{val}</td></tr>";
        var fmtMoney = (decimal? v) => v.HasValue ? v.Value.ToString("N0") + " ₫" : "—";
        var fmtNum   = (int? v)     => v.HasValue ? v.Value.ToString("N0")         : "—";
        var noteRow  = string.IsNullOrEmpty(note) ? "" : $"<tr><td colspan='2' style='padding:8px 12px;font-size:12px;color:#64748b'>💬 {note}</td></tr>";

        var html = $"""
            <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
                <tr><td align="center">
                  <table width="560" cellpadding="0" cellspacing="0"
                         style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                    <tr>
                      <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center">
                        <h1 style="margin:0;color:#fff;font-size:20px">🎯 KPI tháng {month}/{year}</h1>
                        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px">{companyName}</p>
                      </td>
                    </tr>
                    <tr><td style="padding:28px 32px">
                      <p style="color:#1e293b;font-size:15px;margin:0 0 20px">
                        Kính gửi <strong>{fullName}</strong>,
                      </p>
                      <p style="color:#64748b;font-size:13px;line-height:1.7;margin:0 0 20px">
                        Quản lý đã thiết lập mục tiêu KPI cho kỳ <strong>tháng {month}/{year}</strong>.
                        Hãy cố gắng đạt mục tiêu để nhận thưởng KPI!
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0"
                             style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
                        <thead>
                          <tr style="background:#f8fafc">
                            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#94a3b8;font-weight:500">Chỉ tiêu</th>
                            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#94a3b8;font-weight:500">Mục tiêu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Row("🎯 Doanh thu",       fmtMoney(revenueTarget))}
                          {Row("📦 Số đơn hàng",     fmtNum(orderTarget))}
                          {Row("👥 Khách hàng mới",  fmtNum(custTarget))}
                          {noteRow}
                        </tbody>
                      </table>
                      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center">
                        MSAS — Hệ thống phân tích bán hàng đa kênh
                      </p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
            """;

        return await SendAsync(toEmail, subject, html);
    }

    // ── Thông báo thay đổi role/trạng thái tài khoản ───────────────────────
    public async Task<bool> SendRoleChangeNotificationAsync(
        string toEmail, string fullName, string oldRole, string newRole,
        bool isActive, string companyName)
    {
        var subject = $"[{companyName}] Thông tin tài khoản của bạn đã thay đổi";
        var statusText = isActive ? "✅ Đang hoạt động" : "🔒 Bị vô hiệu hóa";
        var roleChanged = oldRole != newRole;
        var changeDesc  = roleChanged
            ? $"Vai trò thay đổi từ <strong>{oldRole}</strong> → <strong>{newRole}</strong>."
            : $"Trạng thái tài khoản: <strong>{statusText}</strong>.";

        var html = $"""
            <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif">
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
                <tr><td align="center">
                  <table width="520" cellpadding="0" cellspacing="0"
                         style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden">
                    <tr>
                      <td style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:24px 32px;text-align:center">
                        <h1 style="margin:0;color:#fff;font-size:18px">🔔 Thông báo tài khoản</h1>
                        <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px">{companyName}</p>
                      </td>
                    </tr>
                    <tr><td style="padding:24px 32px">
                      <p style="color:#1e293b;font-size:14px;margin:0 0 16px">Kính gửi <strong>{fullName}</strong>,</p>
                      <p style="color:#475569;font-size:13px;line-height:1.7;margin:0 0 16px">
                        Thông tin tài khoản của bạn tại <strong>{companyName}</strong> đã được cập nhật:
                      </p>
                      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:16px">
                        <p style="margin:0;font-size:14px;color:#1e293b">{changeDesc}</p>
                        <p style="margin:8px 0 0;font-size:12px;color:#64748b">Trạng thái: {statusText}</p>
                      </div>
                      <p style="color:#94a3b8;font-size:11px;text-align:center;margin:0">
                        Nếu bạn không yêu cầu thay đổi này, hãy liên hệ quản trị viên ngay.
                      </p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
            """;

        return await SendAsync(toEmail, subject, html);
    }

    private static string BuildTrialExpiredHtml(string companyName) => $"""
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
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">⏰ Thời gian dùng thử đã kết thúc</h1>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px">SalesAnalytics MSAS</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px">
                    <p style="margin:0 0 16px;color:#1e293b;font-size:16px">Kính gửi <strong>{companyName}</strong>,</p>
                    <p style="margin:0 0 20px;color:#64748b;font-size:15px;line-height:1.7">
                      7 ngày dùng thử miễn phí gói <strong>Pro</strong> của bạn đã kết thúc. Tài khoản hiện đã chuyển về gói
                      <strong>Free</strong> với tính năng cơ bản.
                    </p>
                    <div style="background:#fef3c7;border-radius:10px;padding:18px 20px;margin-bottom:24px">
                      <p style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:600">Tính năng bị giới hạn khi về Free:</p>
                      <ul style="margin:0;padding-left:20px;color:#92400e;font-size:14px;line-height:1.8">
                        <li>Dự báo doanh thu AI (Prophet)</li>
                        <li>Phân tích churn khách hàng</li>
                        <li>Báo cáo nâng cao &amp; xuất PDF</li>
                        <li>Phân tích lợi nhuận đa kênh</li>
                      </ul>
                    </div>
                    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6">
                      Nâng cấp lên <strong>Pro</strong> để tiếp tục sử dụng đầy đủ tính năng và đưa ra quyết định kinh doanh
                      dựa trên dữ liệu thực tế.
                    </p>
                    <div style="text-align:center">
                      <a href="#" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                                         color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;
                                         font-size:15px;font-weight:600">
                        Nâng cấp lên Pro ngay →
                      </a>
                    </div>
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
