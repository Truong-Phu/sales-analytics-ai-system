using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;
using System.Security.Claims;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Bảng lương nhân viên theo tháng.
/// Workflow: Draft → Active → Completed → Approved → Paid
/// Khi Paid → tự chèn expense loại Salary vào public.expenses.
/// Email phiếu lương dùng Resend (fire-and-forget).
/// </summary>
[ApiController]
[Route("api/payroll")]
[Authorize(Roles = "Owner,Manager")]
public class PayrollController(
    IConfiguration cfg,
    ITenantContext tenant,
    IEmailService email,
    ILogger<PayrollController> logger) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    private string Cid => tenant.CompanyId!.Value.ToString();
    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

    private static bool IsKpiAchieved(decimal? revTarget, int? ordTarget, int? custTarget,
        decimal actualRevenue, long actualOrders, long actualCustomers)
    {
        var pcts = new List<double>();
        if (revTarget is > 0) pcts.Add((double)(actualRevenue / revTarget.Value * 100));
        if (ordTarget is > 0) pcts.Add(actualOrders / (double)ordTarget.Value * 100);
        if (custTarget is > 0) pcts.Add(actualCustomers / (double)custTarget.Value * 100);
        return pcts.Count > 0 && pcts.All(p => p >= 100.0);
    }

    // ── GET /api/payroll?year=2026&month=5 ────────────────────────────────────
    // Trả về danh sách payroll kèm KPI actuals tính query-time
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int? year,
        [FromQuery] int? month)
    {
        var now   = DateTime.UtcNow;
        var y     = year  ?? now.Year;
        var m     = month ?? now.Month;
        var start = new DateTime(y, m, 1, 0, 0, 0, DateTimeKind.Utc);
        var end   = start.AddMonths(1).AddSeconds(-1);

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Subquery cho new_customers tránh cartesian product (company-wide per period)
            const string sql = """
                WITH warehouse_actuals AS (
                    SELECT user_id,
                           COUNT(*)::bigint AS task_count,
                           COALESCE(SUM(amount), 0) AS activity_value
                    FROM (
                        SELECT created_by AS user_id, created_at, ABS(quantity_change)::numeric AS amount
                        FROM public.inventory_transactions
                        WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                        UNION ALL
                        SELECT created_by AS user_id, created_at, total_quantity::numeric AS amount
                        FROM public.goods_receipts
                        WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                        UNION ALL
                        SELECT created_by AS user_id, created_at, total_amount AS amount
                        FROM public.purchase_orders
                        WHERE company_id = @cid::uuid AND created_by IS NOT NULL
                    ) x
                    WHERE created_at BETWEEN @start AND @end
                    GROUP BY user_id
                ),
                marketing_actuals AS (
                    SELECT created_by AS user_id,
                           COUNT(*)::bigint AS activity_count,
                           COALESCE(SUM(amount), 0) AS spend_amount
                    FROM public.ad_spend_monthly
                    WHERE company_id = @cid::uuid
                      AND created_by IS NOT NULL
                      AND year = @year
                      AND month = @month
                    GROUP BY created_by
                )
                SELECT
                    u.user_id, u.full_name, u.email, u.role,
                    CASE WHEN u.role = 'Manager'
                         THEN (
                             SELECT COUNT(DISTINCT mo.order_id)
                             FROM public.orders mo
                             WHERE mo.company_id = @cid::uuid
                               AND mo.order_date BETWEEN @start AND @end
                         )
                         WHEN u.role = 'Staff_Warehouse'
                         THEN COALESCE(MAX(wa.task_count), 0)
                         ELSE COUNT(DISTINCT o.order_id)
                    END AS actual_orders,
                    CASE WHEN u.role = 'Manager'
                         THEN (
                             SELECT COALESCE(SUM(mo.total_amount), 0)
                             FROM public.orders mo
                             WHERE mo.company_id = @cid::uuid
                               AND mo.order_date BETWEEN @start AND @end
                         )
                         WHEN u.role = 'Staff_Marketing'
                         THEN COALESCE(MAX(ma.spend_amount), 0)
                         WHEN u.role = 'Staff_Warehouse'
                         THEN COALESCE(MAX(wa.activity_value), 0)
                         ELSE COALESCE(SUM(o.total_amount), 0)
                    END AS actual_revenue,
                    CASE WHEN u.role = 'Manager'
                         THEN (
                             SELECT COUNT(DISTINCT mc.customer_id)
                             FROM public.customers mc
                             WHERE mc.company_id = @cid::uuid
                               AND COALESCE(mc.first_order_at, mc.created_at) BETWEEN @start AND @end
                         )
                         WHEN u.role = 'Staff_Marketing'
                         THEN COALESCE(MAX(ma.activity_count), 0)
                         WHEN u.role = 'Staff_Warehouse'
                         THEN COALESCE(MAX(wa.task_count), 0)
                         ELSE COUNT(DISTINCT CASE
                             WHEN COALESCE(c.first_order_at, c.created_at) BETWEEN @start AND @end THEN c.customer_id
                         END)
                    END AS actual_new_customers,
                    t.revenue_target, t.order_count_target, t.new_customer_target,
                    p.payroll_id,
                    COALESCE(p.base_salary, last_payroll.base_salary, 0) AS base_salary,
                    p.bonus_amount, p.penalty_amount,
                    p.note, p.status, p.approved_by, p.approved_at,
                    p.paid_at, p.email_sent_at,
                    ab.full_name AS approver_name
                FROM public.users u
                LEFT JOIN public.orders o
                    ON  o.created_by_user_id = u.user_id
                    AND o.order_date BETWEEN @start AND @end
                    AND o.company_id = @cid::uuid
                LEFT JOIN public.customers c
                    ON c.customer_id = o.customer_id
                   AND c.company_id = @cid::uuid
                LEFT JOIN warehouse_actuals wa ON wa.user_id = u.user_id
                LEFT JOIN marketing_actuals ma ON ma.user_id = u.user_id
                LEFT JOIN public.staff_kpi_targets t
                    ON  t.user_id      = u.user_id
                    AND t.period_type  = 'MONTHLY'
                    AND t.period_start = DATE_TRUNC('month', @start)
                LEFT JOIN public.employee_payroll p
                    ON  p.user_id    = u.user_id
                    AND p.company_id = @cid::uuid
                    AND p.year = @year AND p.month = @month
                LEFT JOIN LATERAL (
                    SELECT lp.base_salary
                    FROM public.employee_payroll lp
                    WHERE lp.company_id = @cid::uuid
                      AND lp.user_id = u.user_id
                      AND (lp.year < @year OR (lp.year = @year AND lp.month < @month))
                    ORDER BY lp.year DESC, lp.month DESC
                    LIMIT 1
                ) last_payroll ON TRUE
                LEFT JOIN public.users ab ON ab.user_id = p.approved_by
                WHERE u.company_id = @cid::uuid
                  AND u.is_active   = TRUE
                  AND u.role IN ('Manager','Staff','Staff_Sales','Staff_Warehouse','Staff_Marketing')
                GROUP BY
                    u.user_id, u.full_name, u.email, u.role,
                    t.revenue_target, t.order_count_target, t.new_customer_target,
                    p.payroll_id, p.base_salary, last_payroll.base_salary, p.bonus_amount, p.penalty_amount,
                    p.note, p.status, p.approved_by, p.approved_at,
                    p.paid_at, p.email_sent_at, ab.full_name
                ORDER BY u.full_name
                """;

            await using var cmd = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("cid",   Cid);
            cmd.Parameters.AddWithValue("start", start);
            cmd.Parameters.AddWithValue("end",   end);
            cmd.Parameters.AddWithValue("year",  y);
            cmd.Parameters.AddWithValue("month", m);

            var rows = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var actualOrders       = r.GetInt64(4);
                var actualRevenue      = r.GetDecimal(5);
                var actualNewCust      = r.GetInt64(6);
                var revTarget          = r.IsDBNull(7)  ? (decimal?)null : r.GetDecimal(7);
                var ordTarget          = r.IsDBNull(8)  ? (int?)null     : r.GetInt32(8);
                var custTarget         = r.IsDBNull(9)  ? (int?)null     : r.GetInt32(9);
                var payrollId          = r.IsDBNull(10) ? (long?)null    : r.GetInt64(10);
                var baseSalary         = r.IsDBNull(11) ? 0m             : r.GetDecimal(11);
                var bonusAmount        = r.IsDBNull(12) ? 0m             : r.GetDecimal(12);
                var penaltyAmount      = r.IsDBNull(13) ? 0m             : r.GetDecimal(13);
                var note               = r.IsDBNull(14) ? null           : r.GetString(14);
                var status             = r.IsDBNull(15) ? "Draft"        : r.GetString(15);
                var approvedBy         = r.IsDBNull(16) ? (int?)null     : r.GetInt32(16);
                var approvedAt         = r.IsDBNull(17) ? (DateTime?)null : r.GetDateTime(17);
                var paidAt             = r.IsDBNull(18) ? (DateTime?)null : r.GetDateTime(18);
                var emailSentAt        = r.IsDBNull(19) ? (DateTime?)null : r.GetDateTime(19);
                var approverName       = r.IsDBNull(20) ? null           : r.GetString(20);

                // Tính progress % (query-time)
                double? revPct  = revTarget  is > 0 ? Math.Round((double)(actualRevenue  / revTarget.Value  * 100), 1) : null;
                double? ordPct  = ordTarget  is > 0 ? Math.Round((double)(actualOrders   / (double)ordTarget.Value  * 100), 1) : null;
                double? custPct = custTarget is > 0 ? Math.Round((double)(actualNewCust  / (double)custTarget.Value * 100), 1) : null;

                var validPcts    = new[] { revPct, ordPct, custPct }.Where(x => x.HasValue).Select(x => x!.Value).ToList();
                double? overall  = validPcts.Count > 0 ? Math.Round(validPcts.Average(), 1) : null;

                // KPI đạt khi tất cả target đặt đều >= 100%
                bool hasAnyTarget   = revTarget.HasValue || ordTarget.HasValue || custTarget.HasValue;
                bool isKpiAchieved  = hasAnyTarget && validPcts.Count > 0 && validPcts.All(p => p >= 100.0);

                // Tính total_salary
                decimal totalSalary = isKpiAchieved
                    ? Math.Max(0, baseSalary + bonusAmount - penaltyAmount)
                    : Math.Max(0, baseSalary - penaltyAmount);

                rows.Add(new
                {
                    userId            = r.GetInt32(0),
                    fullName          = r.GetString(1),
                    email             = r.GetString(2),
                    role              = r.GetString(3),
                    actualOrders,
                    actualRevenue,
                    actualNewCustomers = actualNewCust,
                    revTarget,
                    ordTarget,
                    custTarget,
                    revenuePct         = revPct,
                    orderPct           = ordPct,
                    customerPct        = custPct,
                    overallPct         = overall,
                    isKpiAchieved,
                    hasAnyTarget,
                    payrollId,
                    baseSalary,
                    baseSalaryInherited = !payrollId.HasValue && baseSalary > 0,
                    bonusAmount,
                    penaltyAmount,
                    totalSalary,
                    note,
                    status             = payrollId.HasValue ? status : (string?)null,
                    approvedBy,
                    approvedAt,
                    paidAt,
                    emailSentAt,
                    approverName,
                });
            }

            return Ok(new { year = y, month = m, staff = rows });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── POST /api/payroll — Upsert payroll record ─────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] PayrollUpsertDto dto)
    {
        if (dto.BaseSalary < 0 || dto.BonusAmount < 0 || dto.PenaltyAmount < 0)
            return BadRequest(new { error = "Giá trị lương không được âm" });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Kiểm tra nếu đã Approved/Paid thì không cho sửa
            await using var chkCmd = new NpgsqlCommand("""
                SELECT status FROM public.employee_payroll
                WHERE company_id = @cid::uuid AND user_id = @uid AND year = @y AND month = @m
                """, conn);
            chkCmd.Parameters.AddWithValue("cid", Cid);
            chkCmd.Parameters.AddWithValue("uid", dto.UserId);
            chkCmd.Parameters.AddWithValue("y",   dto.Year);
            chkCmd.Parameters.AddWithValue("m",   dto.Month);
            var existing = await chkCmd.ExecuteScalarAsync() as string;
            if (existing is "Approved" or "Paid")
                return BadRequest(new { error = $"Bản ghi đã ở trạng thái '{existing}', không thể sửa trực tiếp." });

            await using var cmd = new NpgsqlCommand("""
                INSERT INTO public.employee_payroll
                    (company_id, user_id, year, month, base_salary, bonus_amount, penalty_amount, note, status, updated_at)
                VALUES
                    (@cid::uuid, @uid, @y, @m, @base, @bonus, @penalty, @note, 'Active', NOW())
                ON CONFLICT (company_id, user_id, year, month) DO UPDATE SET
                    base_salary    = EXCLUDED.base_salary,
                    bonus_amount   = EXCLUDED.bonus_amount,
                    penalty_amount = EXCLUDED.penalty_amount,
                    note           = EXCLUDED.note,
                    status         = CASE WHEN employee_payroll.status = 'Draft' THEN 'Active'
                                          ELSE employee_payroll.status END,
                    updated_at     = NOW()
                RETURNING payroll_id, status
                """, conn);
            cmd.Parameters.AddWithValue("cid",     Cid);
            cmd.Parameters.AddWithValue("uid",     dto.UserId);
            cmd.Parameters.AddWithValue("y",       dto.Year);
            cmd.Parameters.AddWithValue("m",       dto.Month);
            cmd.Parameters.AddWithValue("base",    dto.BaseSalary);
            cmd.Parameters.AddWithValue("bonus",   dto.BonusAmount);
            cmd.Parameters.AddWithValue("penalty", dto.PenaltyAmount);
            cmd.Parameters.AddWithValue("note",    (object?)dto.Note ?? DBNull.Value);

            await using var r = await cmd.ExecuteReaderAsync();
            await r.ReadAsync();
            return Ok(new { payrollId = r.GetInt64(0), status = r.GetString(1) });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── POST /api/payroll/{id}/approve — Owner/Manager duyệt ─────────────────
    [HttpPost("{id:long}/approve")]
    public async Task<IActionResult> Approve(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                UPDATE public.employee_payroll
                SET status      = 'Approved',
                    approved_by = @approver,
                    approved_at = NOW(),
                    updated_at  = NOW()
                WHERE payroll_id = @id AND company_id = @cid::uuid
                  AND status IN ('Active','Completed')
                RETURNING payroll_id
                """, conn);
            cmd.Parameters.AddWithValue("id",       id);
            cmd.Parameters.AddWithValue("cid",      Cid);
            cmd.Parameters.AddWithValue("approver", CurrentUserId);
            var result = await cmd.ExecuteScalarAsync();
            if (result is null or DBNull)
                return BadRequest(new { error = "Không tìm thấy hoặc trạng thái không hợp lệ để duyệt." });
            return Ok(new { approved = true });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── POST /api/payroll/{id}/unlock — Mở khóa để điều chỉnh ───────────────
    [HttpPost("{id:long}/unlock")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> Unlock(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                UPDATE public.employee_payroll
                SET status     = 'Active',
                    approved_by = NULL, approved_at = NULL,
                    updated_at  = NOW()
                WHERE payroll_id = @id AND company_id = @cid::uuid AND status = 'Approved'
                RETURNING payroll_id
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", Cid);
            var result = await cmd.ExecuteScalarAsync();
            if (result is null or DBNull)
                return BadRequest(new { error = "Chỉ có thể mở khóa bản ghi ở trạng thái Approved." });
            return Ok(new { unlocked = true });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── POST /api/payroll/{id}/pay — Owner trả lương + tự ghi expense ────────
    [HttpPost("{id:long}/pay")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> Pay(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // Lấy thông tin payroll
            await using var fetchCmd = new NpgsqlCommand("""
                SELECT p.user_id, p.year, p.month, p.base_salary, p.bonus_amount, p.penalty_amount,
                       u.full_name, u.role,
                       t.revenue_target, t.order_count_target, t.new_customer_target,
                       CASE WHEN u.role = 'Manager' THEN (
                                SELECT COALESCE(SUM(mo.total_amount), 0)
                                FROM public.orders mo
                                WHERE mo.company_id = @cid::uuid
                                  AND EXTRACT(YEAR FROM mo.order_date) = p.year
                                  AND EXTRACT(MONTH FROM mo.order_date) = p.month
                            )
                            WHEN u.role = 'Staff_Marketing' THEN (
                                SELECT COALESCE(SUM(a.amount), 0)
                                FROM public.ad_spend_monthly a
                                WHERE a.company_id = @cid::uuid AND a.created_by = p.user_id
                                  AND a.year = p.year AND a.month = p.month
                            )
                            WHEN u.role = 'Staff_Warehouse' THEN (
                                SELECT COALESCE(SUM(x.amount), 0)
                                FROM (
                                    SELECT ABS(quantity_change)::numeric AS amount, created_by, created_at
                                    FROM public.inventory_transactions WHERE company_id = @cid::uuid
                                    UNION ALL
                                    SELECT total_quantity::numeric AS amount, created_by, created_at
                                    FROM public.goods_receipts WHERE company_id = @cid::uuid
                                    UNION ALL
                                    SELECT total_amount AS amount, created_by, created_at
                                    FROM public.purchase_orders WHERE company_id = @cid::uuid
                                ) x
                                WHERE x.created_by = p.user_id
                                  AND x.created_at >= MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC')
                                  AND x.created_at <  MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month'
                            )
                            ELSE COALESCE(SUM(o.total_amount), 0)
                       END AS actual_revenue,
                       CASE WHEN u.role = 'Manager' THEN (
                                SELECT COUNT(DISTINCT mo.order_id)
                                FROM public.orders mo
                                WHERE mo.company_id = @cid::uuid
                                  AND EXTRACT(YEAR FROM mo.order_date) = p.year
                                  AND EXTRACT(MONTH FROM mo.order_date) = p.month
                            )
                            WHEN u.role = 'Staff_Warehouse' THEN (
                                SELECT COUNT(*)::bigint
                                FROM (
                                    SELECT created_by, created_at FROM public.inventory_transactions WHERE company_id = @cid::uuid
                                    UNION ALL
                                    SELECT created_by, created_at FROM public.goods_receipts WHERE company_id = @cid::uuid
                                    UNION ALL
                                    SELECT created_by, created_at FROM public.purchase_orders WHERE company_id = @cid::uuid
                                ) x
                                WHERE x.created_by = p.user_id
                                  AND x.created_at >= MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC')
                                  AND x.created_at <  MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month'
                            )
                            ELSE COUNT(DISTINCT o.order_id)
                       END AS actual_orders,
                       CASE WHEN u.role = 'Manager' THEN (
                                SELECT COUNT(DISTINCT mc.customer_id)
                                FROM public.customers mc
                                WHERE mc.company_id = @cid::uuid
                                  AND COALESCE(mc.first_order_at, mc.created_at) >= MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC')
                                  AND COALESCE(mc.first_order_at, mc.created_at) <  MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month'
                            )
                            WHEN u.role = 'Staff_Marketing' THEN (
                                SELECT COUNT(*)::bigint
                                FROM public.ad_spend_monthly a
                                WHERE a.company_id = @cid::uuid AND a.created_by = p.user_id
                                  AND a.year = p.year AND a.month = p.month
                            )
                            WHEN u.role = 'Staff_Warehouse' THEN (
                                SELECT COUNT(*)::bigint
                                FROM (
                                    SELECT created_by, created_at FROM public.inventory_transactions WHERE company_id = @cid::uuid
                                    UNION ALL
                                    SELECT created_by, created_at FROM public.goods_receipts WHERE company_id = @cid::uuid
                                    UNION ALL
                                    SELECT created_by, created_at FROM public.purchase_orders WHERE company_id = @cid::uuid
                                ) x
                                WHERE x.created_by = p.user_id
                                  AND x.created_at >= MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC')
                                  AND x.created_at <  MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month'
                            )
                            ELSE COUNT(DISTINCT CASE
                                WHEN COALESCE(c.first_order_at, c.created_at) >= MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC')
                                 AND COALESCE(c.first_order_at, c.created_at) <  MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month'
                                THEN c.customer_id
                            END)
                       END AS actual_new_customers
                FROM public.employee_payroll p
                JOIN public.users u ON u.user_id = p.user_id
                LEFT JOIN public.staff_kpi_targets t
                    ON t.user_id = p.user_id AND t.period_type = 'MONTHLY'
                    AND EXTRACT(YEAR FROM t.period_start) = p.year
                    AND EXTRACT(MONTH FROM t.period_start) = p.month
                LEFT JOIN public.orders o
                    ON o.created_by_user_id = p.user_id
                    AND o.company_id = @cid::uuid
                    AND EXTRACT(YEAR FROM o.order_date) = p.year
                    AND EXTRACT(MONTH FROM o.order_date) = p.month
                LEFT JOIN public.customers c
                    ON c.customer_id = o.customer_id
                   AND c.company_id = @cid::uuid
                WHERE p.payroll_id = @id AND p.company_id = @cid::uuid AND p.status = 'Approved'
                GROUP BY p.user_id, p.year, p.month, p.base_salary, p.bonus_amount, p.penalty_amount,
                         u.full_name, u.role, t.revenue_target, t.order_count_target, t.new_customer_target
                """, conn);
            fetchCmd.Parameters.AddWithValue("id",  id);
            fetchCmd.Parameters.AddWithValue("cid", Cid);

            await using var fr = await fetchCmd.ExecuteReaderAsync();
            if (!await fr.ReadAsync())
                return BadRequest(new { error = "Không tìm thấy hoặc bản ghi chưa được Approved." });

            var userId        = fr.GetInt32(0);
            var pYear         = fr.GetInt32(1);
            var pMonth        = fr.GetInt32(2);
            var baseSalary    = fr.GetDecimal(3);
            var bonusAmount   = fr.GetDecimal(4);
            var penaltyAmount = fr.GetDecimal(5);
            var fullName      = fr.GetString(6);
            var revTarget     = fr.IsDBNull(8)  ? (decimal?)null : fr.GetDecimal(8);
            var ordTarget     = fr.IsDBNull(9)  ? (int?)null     : fr.GetInt32(9);
            var custTarget    = fr.IsDBNull(10) ? (int?)null     : fr.GetInt32(10);
            var actualRevenue = fr.GetDecimal(11);
            var actualOrders  = fr.GetInt64(12);
            var actualCust    = fr.GetInt64(13);

            bool isKpiAchieved = IsKpiAchieved(revTarget, ordTarget, custTarget,
                actualRevenue, actualOrders, actualCust);
            decimal totalSalary = Math.Max(0,
                isKpiAchieved ? baseSalary + bonusAmount - penaltyAmount
                               : baseSalary - penaltyAmount);
            await fr.CloseAsync();

            // Mark as Paid
            await using var payCmd = new NpgsqlCommand("""
                UPDATE public.employee_payroll
                SET status = 'Paid', paid_at = NOW(), updated_at = NOW()
                WHERE payroll_id = @id AND company_id = @cid::uuid
                """, conn);
            payCmd.Parameters.AddWithValue("id",  id);
            payCmd.Parameters.AddWithValue("cid", Cid);
            await payCmd.ExecuteNonQueryAsync();

            // Tự ghi vào expenses (Salary) nếu totalSalary > 0
            if (totalSalary > 0)
            {
                var now = DateTime.UtcNow;
                var expDate = (pYear == now.Year && pMonth == now.Month)
                    ? DateOnly.FromDateTime(now)
                    : new DateOnly(pYear, pMonth, DateTime.DaysInMonth(pYear, pMonth));
                var desc = $"[Payroll] Lương {fullName} tháng {pMonth}/{pYear}";

                await using var expCmd = new NpgsqlCommand("""
                    INSERT INTO public.expenses
                        (company_id, expense_type, amount, expense_date, description, created_by)
                    VALUES (@cid::uuid, 'Salary', @amount, @date, @desc, @by)
                    ON CONFLICT DO NOTHING
                    """, conn);
                expCmd.Parameters.AddWithValue("cid",    Cid);
                expCmd.Parameters.AddWithValue("amount", totalSalary);
                expCmd.Parameters.AddWithValue("date",   expDate);
                expCmd.Parameters.AddWithValue("desc",   desc);
                expCmd.Parameters.AddWithValue("by",     CurrentUserId);
                await expCmd.ExecuteNonQueryAsync();
            }

            return Ok(new { paid = true, totalSalary, isKpiAchieved });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── POST /api/payroll/{id}/send-email — Gửi phiếu lương ─────────────────
    [HttpPost("{id:long}/send-email")]
    public async Task<IActionResult> SendPayslip(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT p.year, p.month, p.base_salary, p.bonus_amount, p.penalty_amount,
                       p.status,
                       u.full_name, u.email,
                       t.revenue_target, t.order_count_target, t.new_customer_target,
                       COALESCE(SUM(o.total_amount), 0) AS actual_revenue,
                       COUNT(DISTINCT o.order_id)       AS actual_orders,
                       COUNT(DISTINCT CASE
                           WHEN COALESCE(c.first_order_at, c.created_at) >= MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC')
                            AND COALESCE(c.first_order_at, c.created_at) <  MAKE_TIMESTAMPTZ(p.year, p.month, 1, 0, 0, 0, 'UTC') + INTERVAL '1 month'
                           THEN c.customer_id
                       END) AS actual_new_customers
                FROM public.employee_payroll p
                JOIN public.users u ON u.user_id = p.user_id
                LEFT JOIN public.staff_kpi_targets t
                    ON t.user_id = p.user_id AND t.period_type = 'MONTHLY'
                    AND EXTRACT(YEAR FROM t.period_start) = p.year
                    AND EXTRACT(MONTH FROM t.period_start) = p.month
                LEFT JOIN public.orders o
                    ON o.created_by_user_id = p.user_id
                    AND o.company_id = @cid::uuid
                    AND EXTRACT(YEAR FROM o.order_date) = p.year
                    AND EXTRACT(MONTH FROM o.order_date) = p.month
                LEFT JOIN public.customers c
                    ON c.customer_id = o.customer_id
                   AND c.company_id = @cid::uuid
                WHERE p.payroll_id = @id AND p.company_id = @cid::uuid
                GROUP BY p.year, p.month, p.base_salary, p.bonus_amount, p.penalty_amount,
                         p.status, u.full_name, u.email,
                         t.revenue_target, t.order_count_target, t.new_customer_target
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", Cid);

            await using var r = await cmd.ExecuteReaderAsync();
            if (!await r.ReadAsync())
                return NotFound(new { error = "Không tìm thấy bản ghi lương." });

            var pYear         = r.GetInt32(0);
            var pMonth        = r.GetInt32(1);
            var baseSalary    = r.GetDecimal(2);
            var bonusAmount   = r.GetDecimal(3);
            var penaltyAmount = r.GetDecimal(4);
            var status        = r.GetString(5);
            var fullName      = r.GetString(6);
            var toEmail       = r.GetString(7);
            var revTarget     = r.IsDBNull(8) ? (decimal?)null : r.GetDecimal(8);
            var ordTarget     = r.IsDBNull(9) ? (int?)null     : r.GetInt32(9);
            var custTarget    = r.IsDBNull(10) ? (int?)null    : r.GetInt32(10);
            var actualRevenue = r.GetDecimal(11);
            var actualOrders  = r.GetInt64(12);
            var actualCust    = r.GetInt64(13);

            bool isKpiAchieved = IsKpiAchieved(revTarget, ordTarget, custTarget,
                actualRevenue, actualOrders, actualCust);
            decimal total = Math.Max(0,
                isKpiAchieved ? baseSalary + bonusAmount - penaltyAmount
                               : baseSalary - penaltyAmount);
            await r.CloseAsync();

            // Gửi email (fire-and-forget, không crash nếu Resend chưa cấu hình)
            var sent = false;
            try
            {
                sent = await email.SendPayslipAsync(
                    toEmail, fullName, pYear, pMonth,
                    baseSalary, bonusAmount, penaltyAmount, total,
                    actualRevenue, revTarget,
                    actualOrders,  ordTarget,
                    isKpiAchieved, status);
            }
            catch (Exception ex)
            {
                logger.LogWarning("Gửi phiếu lương thất bại: {Msg}", ex.Message);
            }

            if (sent)
            {
                // Cập nhật email_sent_at
                await using var upCmd = new NpgsqlCommand("""
                    UPDATE public.employee_payroll
                    SET email_sent_at = NOW(), updated_at = NOW()
                    WHERE payroll_id = @id AND company_id = @cid::uuid
                    """, conn);
                upCmd.Parameters.AddWithValue("id",  id);
                upCmd.Parameters.AddWithValue("cid", Cid);
                await upCmd.ExecuteNonQueryAsync();
            }

            return Ok(new { sent, message = sent ? "Đã gửi phiếu lương." : "Gửi thất bại — kiểm tra cấu hình Resend API key." });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── GET /api/payroll/salary-summary?year=&month= ─────────────────────────
    // Tổng lương (Approved + Paid) trong tháng — dùng cho Finance P&L
    [HttpGet("salary-summary")]
    public async Task<IActionResult> SalarySummary(
        [FromQuery] int? year,
        [FromQuery] int? month)
    {
        var now = DateTime.UtcNow;
        var y   = year  ?? now.Year;
        var m   = month ?? now.Month;
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                SELECT
                    COUNT(*)                    AS employee_count,
                    SUM(base_salary)            AS total_base,
                    SUM(bonus_amount)           AS total_bonus,
                    SUM(penalty_amount)         AS total_penalty,
                    SUM(GREATEST(0,
                        CASE WHEN status IN ('Approved','Paid')
                            THEN base_salary + bonus_amount - penalty_amount
                        END))                  AS total_salary
                FROM public.employee_payroll
                JOIN public.users u ON u.user_id = employee_payroll.user_id
                WHERE employee_payroll.company_id = @cid::uuid AND year = @y AND month = @m
                  AND employee_payroll.status IN ('Approved','Paid')
                  AND u.role IN ('Manager','Staff','Staff_Sales','Staff_Warehouse','Staff_Marketing')
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);
            cmd.Parameters.AddWithValue("y",   y);
            cmd.Parameters.AddWithValue("m",   m);

            await using var r = await cmd.ExecuteReaderAsync();
            await r.ReadAsync();
            return Ok(new
            {
                year    = y,
                month   = m,
                employeeCount = r.IsDBNull(0) ? 0 : (long)r.GetInt64(0),
                totalBase     = r.IsDBNull(1) ? 0m : r.GetDecimal(1),
                totalBonus    = r.IsDBNull(2) ? 0m : r.GetDecimal(2),
                totalPenalty  = r.IsDBNull(3) ? 0m : r.GetDecimal(3),
                totalSalary   = r.IsDBNull(4) ? 0m : r.GetDecimal(4),
            });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
public class PayrollUpsertDto
{
    public int     UserId        { get; set; }
    public int     Year          { get; set; }
    public int     Month         { get; set; }
    public decimal BaseSalary    { get; set; }
    public decimal BonusAmount   { get; set; }
    public decimal PenaltyAmount { get; set; }
    public string? Note          { get; set; }
}
