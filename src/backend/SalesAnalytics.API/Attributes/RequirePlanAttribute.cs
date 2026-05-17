using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Caching.Memory;
using SalesAnalytics.Core.Entities;
using SalesAnalytics.Infrastructure.Data;

namespace SalesAnalytics.API.Attributes;

/// <summary>Đánh dấu endpoint yêu cầu gói dịch vụ tối thiểu (free hoặc pro)</summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public class RequirePlanAttribute : Attribute
{
    public string MinPlan { get; }

    public RequirePlanAttribute(string minPlan) => MinPlan = minPlan.ToLower();
}

/// <summary>
/// Filter kiểm tra subscription của tenant có đáp ứng yêu cầu [RequirePlan] không.
/// Cache subscription 5 phút để tránh query DB mỗi request.
/// </summary>
public class SubscriptionAuthorizationFilter : IActionFilter
{
    private static readonly string[] PlanOrder = ["free", "pro", "enterprise"];

    private readonly AppDbContext  _db;
    private readonly IMemoryCache  _cache;

    public SubscriptionAuthorizationFilter(AppDbContext db, IMemoryCache cache)
    {
        _db    = db;
        _cache = cache;
    }

    public void OnActionExecuting(ActionExecutingContext context)
    {
        // Lấy RequirePlan attribute từ endpoint metadata
        var requirePlan = context.ActionDescriptor.EndpointMetadata
            .OfType<RequirePlanAttribute>()
            .FirstOrDefault();

        if (requirePlan is null) return; // Endpoint không yêu cầu gói cụ thể

        // Lấy company_id từ claims
        var companyIdStr = context.HttpContext.User.FindFirst("company_id")?.Value;
        if (!Guid.TryParse(companyIdStr, out var companyId)) return;

        // Lấy subscription (với cache 5 phút)
        var cacheKey = $"sub_{companyId}";
        if (!_cache.TryGetValue(cacheKey, out Subscription? sub))
        {
            sub = _db.Subscriptions
                .Where(s => s.CompanyId == companyId &&
                            (s.Status == "active" || s.Status == "trial"))
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefault();

            _cache.Set(cacheKey, sub, TimeSpan.FromMinutes(5));
        }

        var currentPlan = sub?.Plan ?? "none";
        if (!IsPlanSufficient(currentPlan, requirePlan.MinPlan))
        {
            context.Result = new ObjectResult(new
            {
                success      = false,
                message      = $"Tính năng này yêu cầu gói {requirePlan.MinPlan.ToUpper()} trở lên.",
                requiredPlan = requirePlan.MinPlan,
                currentPlan
            })
            { StatusCode = StatusCodes.Status402PaymentRequired };
        }
    }

    public void OnActionExecuted(ActionExecutedContext context) { }

    private static bool IsPlanSufficient(string currentPlan, string requiredPlan)
    {
        var currentIdx  = Array.IndexOf(PlanOrder, currentPlan);
        var requiredIdx = Array.IndexOf(PlanOrder, requiredPlan);
        return currentIdx >= requiredIdx && currentIdx >= 0;
    }
}
