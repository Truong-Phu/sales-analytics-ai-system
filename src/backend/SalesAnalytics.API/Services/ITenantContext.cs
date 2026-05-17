using System.Security.Claims;

namespace SalesAnalytics.API.Services;

/// <summary>Cung cấp thông tin tenant của request hiện tại từ JWT claims</summary>
public interface ITenantContext
{
    Guid? CompanyId    { get; }
    bool  IsSuperAdmin { get; }
    string Role        { get; }
    int   UserId       { get; }
}

/// <summary>Implementation đọc từ HttpContext.User claims</summary>
public class TenantContext : ITenantContext
{
    private readonly IHttpContextAccessor _accessor;

    public TenantContext(IHttpContextAccessor accessor) => _accessor = accessor;

    private ClaimsPrincipal? User => _accessor.HttpContext?.User;

    public Guid? CompanyId
    {
        get
        {
            var val = User?.FindFirstValue("company_id");
            return val != null && Guid.TryParse(val, out var g) ? g : null;
        }
    }

    public bool IsSuperAdmin =>
        string.Equals(User?.FindFirstValue("is_super_admin"), "True",
            StringComparison.OrdinalIgnoreCase);

    public string Role => User?.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

    public int UserId
    {
        get
        {
            var val = User?.FindFirstValue(ClaimTypes.NameIdentifier);
            return val != null && int.TryParse(val, out var id) ? id : 0;
        }
    }
}
