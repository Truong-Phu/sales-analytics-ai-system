using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SalesAnalytics.Core.Entities;

namespace SalesAnalytics.API.Services;

/// <summary>Tạo và validate JWT + Refresh Token</summary>
public class JwtService
{
    private readonly IConfiguration _config;

    public JwtService(IConfiguration config) => _config = config;

    /// <summary>Tạo Access Token (JWT HS256, thời hạn 60 phút) – bao gồm claims multi-tenant</summary>
    /// <param name="user">Người dùng cần tạo token</param>
    /// <param name="companySlug">Slug của công ty (dùng cho routing), nullable nếu SuperAdmin</param>
    public string GenerateAccessToken(User user, string? companySlug = null)
    {
        var key     = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var creds   = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(
            double.Parse(_config["Jwt:AccessTokenMinutes"] ?? "60")
        );

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name,           user.Username),
            new(ClaimTypes.Role,           user.Role.ToString()),
            new("fullName",                user.FullName),
            new("lang",                    user.PreferredLanguage),
            new("is_super_admin",          user.IsSuperAdmin.ToString()),
        };

        // Thêm company claims (chỉ khi không phải SuperAdmin)
        if (user.CompanyId.HasValue)
            claims.Add(new("company_id", user.CompanyId.Value.ToString()));

        if (!string.IsNullOrEmpty(companySlug))
            claims.Add(new("company_slug", companySlug));

        var token = new JwtSecurityToken(
            issuer:             _config["Jwt:Issuer"],
            audience:           _config["Jwt:Audience"],
            claims:             claims,
            expires:            expires,
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Tạo Refresh Token (128-bit random, Base64)</summary>
    public string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(64);
        return Convert.ToBase64String(bytes);
    }

    /// <summary>Lấy ClaimsPrincipal từ expired token (dùng khi refresh)</summary>
    public ClaimsPrincipal? GetPrincipalFromExpiredToken(string token)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var validationParams = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidIssuer              = _config["Jwt:Issuer"],
            ValidateAudience         = true,
            ValidAudience            = _config["Jwt:Audience"],
            ValidateLifetime         = false,   // Cho phép token hết hạn
            IssuerSigningKey         = key,
            ValidateIssuerSigningKey = true,
        };

        try
        {
            var principal = new JwtSecurityTokenHandler()
                .ValidateToken(token, validationParams, out var securityToken);

            // Đảm bảo algorithm đúng
            if (securityToken is not JwtSecurityToken jwt ||
                !jwt.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.OrdinalIgnoreCase))
                return null;

            return principal;
        }
        catch
        {
            return null;
        }
    }
}
