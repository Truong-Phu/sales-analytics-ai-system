using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace SalesAnalytics.API.Attributes;

/// <summary>
/// Authorization filter: chỉ cho phép tài khoản có is_super_admin=TRUE truy cập.
/// Dùng cho /api/admin/* endpoints.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireSuperAdminAttribute : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;

        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new ObjectResult(new
            {
                success = false,
                message = "Vui lòng đăng nhập."
            })
            { StatusCode = StatusCodes.Status401Unauthorized };
            return;
        }

        var isSuperAdmin = string.Equals(
            user.FindFirst("is_super_admin")?.Value, "True",
            StringComparison.OrdinalIgnoreCase);

        if (!isSuperAdmin)
        {
            context.Result = new ObjectResult(new
            {
                success = false,
                message = "Chỉ Super Admin mới có quyền truy cập trang này."
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
    }
}
