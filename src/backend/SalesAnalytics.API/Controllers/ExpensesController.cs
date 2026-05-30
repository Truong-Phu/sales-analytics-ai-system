using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Chi phí vận hành doanh nghiệp: Lương, Kho, Điện nước, Internet, Văn phòng, Khác.
/// KHÔNG bao gồm chi phí quảng cáo (xem ad_spend_monthly).
/// Routes: GET/POST/PUT/DELETE /api/expenses
/// </summary>
[ApiController]
[Route("api/expenses")]
[Authorize(Roles = "Owner,Manager,DataIT")]
public class ExpensesController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    private string Cid => tenant.CompanyId!.Value.ToString();

    private static readonly string[] ValidTypes =
        ["Salary", "Warehouse", "Utilities", "Internet", "Office", "Other"];

    // ── GET /api/expenses?from=&to=&type=&page=&pageSize= ───────────────────
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? from,
        [FromQuery] string? to,
        [FromQuery] string? type,
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 50)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var conds = new List<string> { "company_id = @cid::uuid" };
            if (!string.IsNullOrWhiteSpace(from))   conds.Add("expense_date >= @from::date");
            if (!string.IsNullOrWhiteSpace(to))     conds.Add("expense_date <= @to::date");
            if (!string.IsNullOrWhiteSpace(type))   conds.Add("expense_type = @type");
            var where = "WHERE " + string.Join(" AND ", conds);

            // Total count
            await using var cntCmd = new NpgsqlCommand(
                $"SELECT COUNT(*) FROM public.expenses {where}", conn);
            AddParams(cntCmd, Cid, from, to, type);
            var total = Convert.ToInt64(await cntCmd.ExecuteScalarAsync() ?? 0L);

            // Paged rows
            var offset = (page - 1) * pageSize;
            await using var cmd = new NpgsqlCommand($"""
                SELECT expense_id, expense_type, amount, expense_date,
                       description, created_at, updated_at
                FROM public.expenses
                {where}
                ORDER BY expense_date DESC, expense_id DESC
                LIMIT @limit OFFSET @offset
                """, conn);
            AddParams(cmd, Cid, from, to, type);
            cmd.Parameters.AddWithValue("limit",  pageSize);
            cmd.Parameters.AddWithValue("offset", offset);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                items.Add(new
                {
                    expenseId   = r.GetInt64(0),
                    expenseType = r.GetString(1),
                    amount      = r.GetDecimal(2),
                    expenseDate = r.GetDateTime(3).ToString("yyyy-MM-dd"),
                    description = r.IsDBNull(4) ? null : r.GetString(4),
                    createdAt   = r.GetDateTime(5),
                    updatedAt   = r.IsDBNull(6) ? (DateTime?)null : r.GetDateTime(6),
                });
            }

            return Ok(new
            {
                data       = items,
                total,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)total / pageSize),
            });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── GET /api/expenses/summary?from=&to= ────────────────────────────────
    [HttpGet("summary")]
    public async Task<IActionResult> Summary(
        [FromQuery] string? from,
        [FromQuery] string? to)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            var conds = new List<string> { "company_id = @cid::uuid" };
            if (!string.IsNullOrWhiteSpace(from)) conds.Add("expense_date >= @from::date");
            if (!string.IsNullOrWhiteSpace(to))   conds.Add("expense_date <= @to::date");
            var where = "WHERE " + string.Join(" AND ", conds);

            await using var cmd = new NpgsqlCommand($"""
                SELECT expense_type, COALESCE(SUM(amount), 0)
                FROM public.expenses
                {where}
                GROUP BY expense_type
                ORDER BY SUM(amount) DESC
                """, conn);
            AddParams(cmd, Cid, from, to, null);

            var byType = new Dictionary<string, decimal>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                byType[r.GetString(0)] = r.GetDecimal(1);

            var total = byType.Values.Sum();
            return Ok(new
            {
                total,
                byType,
                salary    = byType.GetValueOrDefault("Salary"),
                warehouse = byType.GetValueOrDefault("Warehouse"),
                utilities = byType.GetValueOrDefault("Utilities"),
                internet  = byType.GetValueOrDefault("Internet"),
                office    = byType.GetValueOrDefault("Office"),
                other     = byType.GetValueOrDefault("Other"),
            });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── POST /api/expenses ─────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] ExpenseDto dto)
    {
        if (!ValidTypes.Contains(dto.ExpenseType))
            return BadRequest(new { error = "Loại chi phí không hợp lệ" });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO public.expenses
                    (company_id, expense_type, amount, expense_date, description, created_by)
                VALUES (@cid::uuid, @type, @amount, @date::date, @desc, @userId)
                RETURNING expense_id
                """, conn);
            cmd.Parameters.AddWithValue("cid",    Cid);
            cmd.Parameters.AddWithValue("type",   dto.ExpenseType);
            cmd.Parameters.AddWithValue("amount", dto.Amount);
            cmd.Parameters.AddWithValue("date",   dto.ExpenseDate);
            cmd.Parameters.AddWithValue("desc",   (object?)dto.Description ?? DBNull.Value);
            cmd.Parameters.AddWithValue("userId", DBNull.Value);
            var id = Convert.ToInt64(await cmd.ExecuteScalarAsync());
            return Ok(new { expenseId = id, created = true });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── PUT /api/expenses/{id} ─────────────────────────────────────────────
    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] ExpenseDto dto)
    {
        if (!ValidTypes.Contains(dto.ExpenseType))
            return BadRequest(new { error = "Loại chi phí không hợp lệ" });

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                UPDATE public.expenses
                SET expense_type = @type,
                    amount       = @amount,
                    expense_date = @date::date,
                    description  = @desc,
                    updated_at   = NOW()
                WHERE expense_id = @id AND company_id = @cid::uuid
                RETURNING expense_id
                """, conn);
            cmd.Parameters.AddWithValue("type",   dto.ExpenseType);
            cmd.Parameters.AddWithValue("amount", dto.Amount);
            cmd.Parameters.AddWithValue("date",   dto.ExpenseDate);
            cmd.Parameters.AddWithValue("desc",   (object?)dto.Description ?? DBNull.Value);
            cmd.Parameters.AddWithValue("id",     id);
            cmd.Parameters.AddWithValue("cid",    Cid);

            var result = await cmd.ExecuteScalarAsync();
            if (result is null or DBNull)
                return NotFound(new { error = "Không tìm thấy chi phí hoặc không có quyền" });
            return Ok(new { expenseId = id, updated = true });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── DELETE /api/expenses/{id} — chỉ Owner ─────────────────────────────
    [HttpDelete("{id:long}")]
    [Authorize(Roles = "Owner")]
    public async Task<IActionResult> Delete(long id)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();
            await using var cmd = new NpgsqlCommand("""
                DELETE FROM public.expenses
                WHERE expense_id = @id AND company_id = @cid::uuid
                RETURNING expense_id
                """, conn);
            cmd.Parameters.AddWithValue("id",  id);
            cmd.Parameters.AddWithValue("cid", Cid);

            var result = await cmd.ExecuteScalarAsync();
            if (result is null or DBNull)
                return NotFound(new { error = "Không tìm thấy chi phí" });
            return Ok(new { deleted = true });
        }
        catch (Exception ex) { return StatusCode(503, new { error = ex.Message }); }
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    private static void AddParams(NpgsqlCommand cmd, string cid,
        string? from, string? to, string? type)
    {
        cmd.Parameters.AddWithValue("cid", cid);
        if (!string.IsNullOrWhiteSpace(from)) cmd.Parameters.AddWithValue("from", from);
        if (!string.IsNullOrWhiteSpace(to))   cmd.Parameters.AddWithValue("to",   to);
        if (!string.IsNullOrWhiteSpace(type)) cmd.Parameters.AddWithValue("type", type);
    }
}

public class ExpenseDto
{
    public string  ExpenseType  { get; set; } = "";
    public decimal Amount       { get; set; }
    public string  ExpenseDate  { get; set; } = "";
    public string? Description  { get; set; }
}
