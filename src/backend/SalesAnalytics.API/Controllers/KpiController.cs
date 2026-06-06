using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;
using System.Security.Claims;

namespace SalesAnalytics.API.Controllers;

[ApiController]
[Route("api/kpi")]
[Authorize(Roles = "Owner,Manager,Staff,Staff_Sales,Staff_Marketing,Staff_Warehouse,DataIT,Viewer")]
public class KpiController(IConfiguration cfg, ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;

    private static readonly HashSet<string> _managerRoles =
        new(StringComparer.OrdinalIgnoreCase) { "Owner", "Manager", "DataIT", "Viewer" };

    /// <summary>
    /// GET /api/kpi/my-stats?from=2026-05-01&amp;to=2026-05-31
    /// Owner/Manager/DataIT → KPI toàn công ty.
    /// Staff_* → KPI cá nhân (đơn do bản thân tạo).
    /// </summary>
    [HttpGet("my-stats")]
    public async Task<IActionResult> GetMyStats(
        [FromQuery] string? from = null,
        [FromQuery] string? to   = null)
    {
        var userId    = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
        var role      = User.FindFirstValue(ClaimTypes.Role) ?? "";
        var companyId = tenant.CompanyId?.ToString();

        // Owner/Manager/DataIT xem KPI toàn công ty; Staff xem cá nhân
        var isCompanyScope = _managerRoles.Contains(role);

        var dateTo   = string.IsNullOrEmpty(to)
            ? DateTime.UtcNow.Date
            : DateTime.TryParse(to,   out var t) ? t.Date : DateTime.UtcNow.Date;
        var dateFrom = string.IsNullOrEmpty(from)
            ? dateTo.AddDays(-29)
            : DateTime.TryParse(from, out var f) ? f.Date : dateTo.AddDays(-29);

        var start = dateFrom;
        var end   = dateTo.AddDays(1).AddSeconds(-1);

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        // ── 1. Actuals ──
        var actualsSql = isCompanyScope
            ? """
              SELECT
                  COALESCE(SUM(o.total_amount), 0)    AS revenue,
                  COUNT(DISTINCT o.order_id)           AS order_count,
                  COUNT(DISTINCT CASE
                      WHEN c.created_at BETWEEN @start AND @end THEN c.customer_id
                  END)                                 AS new_customers
              FROM public.orders o
              LEFT JOIN public.customers c ON c.company_id = @cid::uuid
              WHERE o.order_date BETWEEN @start AND @end
                AND o.status NOT IN ('CANCELLED','RETURNED')
                AND (@cid IS NULL OR o.company_id = @cid::uuid)
              """
            : """
              SELECT
                  COALESCE(SUM(o.total_amount), 0)    AS revenue,
                  COUNT(DISTINCT o.order_id)           AS order_count,
                  COUNT(DISTINCT CASE
                      WHEN c.created_at BETWEEN @start AND @end THEN c.customer_id
                  END)                                 AS new_customers
              FROM public.orders o
              LEFT JOIN public.customers c ON c.company_id = @cid::uuid
              WHERE o.created_by_user_id = @uid
                AND o.order_date BETWEEN @start AND @end
                AND o.status NOT IN ('CANCELLED','RETURNED')
                AND (@cid IS NULL OR o.company_id = @cid::uuid)
              """;

        await using var actCmd = new NpgsqlCommand(actualsSql, conn);
        actCmd.Parameters.AddWithValue("uid",   userId);
        actCmd.Parameters.AddWithValue("cid",   companyId ?? (object)DBNull.Value);
        actCmd.Parameters.AddWithValue("start", start);
        actCmd.Parameters.AddWithValue("end",   end);

        decimal revenue = 0; long orderCount = 0, newCustomers = 0;
        await using (var r = await actCmd.ExecuteReaderAsync())
        {
            if (await r.ReadAsync())
            {
                revenue      = r.GetDecimal(0);
                orderCount   = r.GetInt64(1);
                newCustomers = r.GetInt64(2);
            }
        }

        // ── 2. KPI targets (chỉ có ý nghĩa với Staff) ──
        decimal? revTarget = null; int? ordTarget = null, custTarget = null;
        if (!isCompanyScope)
        {
            var periodStart = new DateTime(dateFrom.Year, dateFrom.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            await using var tgtCmd = new NpgsqlCommand("""
                SELECT revenue_target, order_count_target, new_customer_target
                FROM public.staff_kpi_targets
                WHERE user_id = @uid AND period_type = 'MONTHLY' AND period_start = @ps
                LIMIT 1
                """, conn);
            tgtCmd.Parameters.AddWithValue("uid", userId);
            tgtCmd.Parameters.AddWithValue("ps",  periodStart);
            await using (var r = await tgtCmd.ExecuteReaderAsync())
            {
                if (await r.ReadAsync())
                {
                    revTarget  = r.IsDBNull(0) ? null : r.GetDecimal(0);
                    ordTarget  = r.IsDBNull(1) ? null : r.GetInt32(1);
                    custTarget = r.IsDBNull(2) ? null : r.GetInt32(2);
                }
            }
        }

        // ── 3. Top sản phẩm ──
        var topProdSql = isCompanyScope
            ? """
              SELECT p.product_name, COUNT(DISTINCT oi.order_id) AS orders, COALESCE(SUM(oi.subtotal), 0) AS revenue
              FROM public.order_items oi
              JOIN public.products p ON p.product_id = oi.product_id
              JOIN public.orders   o ON o.order_id   = oi.order_id
              WHERE o.order_date BETWEEN @start AND @end
                AND o.status NOT IN ('CANCELLED','RETURNED')
                AND (@cid IS NULL OR o.company_id = @cid::uuid)
              GROUP BY p.product_name ORDER BY orders DESC, revenue DESC LIMIT 5
              """
            : """
              SELECT p.product_name, COUNT(DISTINCT oi.order_id) AS orders, COALESCE(SUM(oi.subtotal), 0) AS revenue
              FROM public.order_items oi
              JOIN public.products p ON p.product_id = oi.product_id
              JOIN public.orders   o ON o.order_id   = oi.order_id
              WHERE o.created_by_user_id = @uid
                AND o.order_date BETWEEN @start AND @end
                AND o.status NOT IN ('CANCELLED','RETURNED')
                AND (@cid IS NULL OR o.company_id = @cid::uuid)
              GROUP BY p.product_name ORDER BY orders DESC, revenue DESC LIMIT 5
              """;

        await using var prodCmd = new NpgsqlCommand(topProdSql, conn);
        prodCmd.Parameters.AddWithValue("uid",   userId);
        prodCmd.Parameters.AddWithValue("cid",   companyId ?? (object)DBNull.Value);
        prodCmd.Parameters.AddWithValue("start", start);
        prodCmd.Parameters.AddWithValue("end",   end);

        var topProducts = new List<object>();
        await using (var r = await prodCmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
                topProducts.Add(new
                {
                    name    = r.GetString(0),
                    orders  = (int)r.GetInt64(1),
                    revenue = r.GetDecimal(2),
                });
        }

        // ── 4. Rank (chỉ với Staff trong công ty) ──
        int? rank = null, totalStaff = null;
        if (!isCompanyScope && companyId is not null)
        {
            await using var rankCmd = new NpgsqlCommand("""
                WITH staff_rev AS (
                    SELECT o.created_by_user_id AS uid,
                           COALESCE(SUM(o.total_amount), 0) AS rev
                    FROM   public.orders o
                    JOIN   public.users  u ON u.user_id = o.created_by_user_id
                    WHERE  o.order_date BETWEEN @start AND @end
                      AND  o.company_id = @cid::uuid
                      AND  u.is_active = TRUE
                      AND  u.role NOT IN ('SuperAdmin', 'Owner', 'Manager', 'Viewer')
                    GROUP  BY o.created_by_user_id
                )
                SELECT uid, RANK() OVER (ORDER BY rev DESC), COUNT(*) OVER ()
                FROM   staff_rev WHERE uid = @uid LIMIT 1
                """, conn);
            rankCmd.Parameters.AddWithValue("uid",   userId);
            rankCmd.Parameters.AddWithValue("cid",   companyId);
            rankCmd.Parameters.AddWithValue("start", start);
            rankCmd.Parameters.AddWithValue("end",   end);
            await using var r = await rankCmd.ExecuteReaderAsync();
            if (await r.ReadAsync()) { rank = (int)r.GetInt64(1); totalStaff = (int)r.GetInt64(2); }
        }

        return Ok(new
        {
            userId,
            role,
            scope          = isCompanyScope ? "company" : "personal",
            from           = dateFrom.ToString("yyyy-MM-dd"),
            to             = dateTo.ToString("yyyy-MM-dd"),
            revenue,
            revenueTarget  = revTarget,
            orders         = orderCount,
            ordersTarget   = ordTarget,
            customers      = newCustomers,
            customersTarget = custTarget,
            rank,
            totalStaff,
            topProducts,
        });
    }
}
