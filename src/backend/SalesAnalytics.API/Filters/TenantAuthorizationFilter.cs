using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace SalesAnalytics.API.Filters;

/// <summary>
/// Filter toàn cục: yêu cầu company_id hợp lệ trong JWT cho mọi API
/// (trừ /api/auth/* và /api/admin/*).
/// SuperAdmin bỏ qua filter này.
/// </summary>
public class TenantAuthorizationFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        var user = context.HttpContext.User;

        // Bỏ qua nếu chưa authenticated (JWT middleware đã xử lý)
        if (user.Identity?.IsAuthenticated != true) return;

        // SuperAdmin không cần company_id
        var isSuperAdmin = string.Equals(
            user.FindFirstValue("is_super_admin"), "True",
            StringComparison.OrdinalIgnoreCase);
        if (isSuperAdmin) return;

        // Bỏ qua /api/auth/* và /api/admin/*
        var path = context.HttpContext.Request.Path.Value ?? string.Empty;
        if (path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/api/admin/", StringComparison.OrdinalIgnoreCase))
            return;

        // Kiểm tra company_id có trong claims
        var companyId = user.FindFirstValue("company_id");
        if (string.IsNullOrEmpty(companyId))
        {
            context.Result = new ObjectResult(new
            {
                success = false,
                message = "Tài khoản chưa được gắn với công ty. Vui lòng liên hệ quản trị viên."
            })
            { StatusCode = StatusCodes.Status403Forbidden };
        }
    }

    public void OnActionExecuted(ActionExecutedContext context) { }
}
