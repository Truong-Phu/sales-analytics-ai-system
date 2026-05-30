using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Quản lý chi phí quảng cáo theo kênh × tháng.
/// GET  /api/ad-spend?year=&month=        — lấy chi phí tháng cụ thể
/// GET  /api/ad-spend/history?months=6    — lịch sử nhiều tháng
/// PUT  /api/ad-spend                     — upsert chi phí (tạo hoặc cập nhật)
/// GET  /api/ad-spend/channels            — danh sách kênh của công ty
/// </summary>
[ApiController]
[Route("api/ad-spend")]
[Authorize(Roles = "Owner,Manager,Staff_Marketing")]
public class AdSpendController(IConfiguration cfg, ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    private int UserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var v) ? v : 0;

    // ── GET /api/ad-spend?year=2026&month=5 ─────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetByMonth(
        [FromQuery] int? year  = null,
        [FromQuery] int? month = null)
    {
        var cid = tenant.CompanyId?.ToString();
        if (cid is null) return Forbid();

        var y = year  ?? DateTime.Now.Year;
        var m = month ?? DateTime.Now.Month;

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("""
            SELECT asm.id, sc.channel_id, sc.channel_name, asm.amount, asm.note,
                   asm.year, asm.month, asm.updated_at
            FROM public.ad_spend_monthly asm
            JOIN public.sales_channels   sc ON sc.channel_id = asm.channel_id
            WHERE asm.company_id = @cid::uuid
              AND asm.year = @year AND asm.month = @month
            ORDER BY sc.channel_name
            """, conn);
        cmd.Parameters.AddWithValue("cid",   cid);
        cmd.Parameters.AddWithValue("year",  y);
        cmd.Parameters.AddWithValue("month", m);

        var items = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            items.Add(new {
                id          = r.GetInt32(0),
                channelId   = r.GetInt32(1),
                channelName = r.GetString(2),
                amount      = r.GetDecimal(3),
                note        = r.IsDBNull(4) ? null : r.GetString(4),
                year        = r.GetInt32(5),
                month       = r.GetInt32(6),
                updatedAt   = r.IsDBNull(7) ? (DateTime?)null : r.GetDateTime(7),
            });

        return Ok(new { success = true, year = y, month = m, data = items });
    }

    // ── GET /api/ad-spend/channels ───────────────────────────────────────────
    [HttpGet("channels")]
    public async Task<IActionResult> GetChannels()
    {
        var cid = tenant.CompanyId?.ToString();
        if (cid is null) return Forbid();

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("""
            SELECT channel_id, channel_name
            FROM public.sales_channels
            WHERE company_id = @cid::uuid AND is_active = TRUE
            ORDER BY channel_name
            """, conn);
        cmd.Parameters.AddWithValue("cid", cid);

        var list = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new { channelId = r.GetInt32(0), channelName = r.GetString(1) });

        return Ok(new { success = true, data = list });
    }

    // ── GET /api/ad-spend/history?months=6 ───────────────────────────────────
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] int months = 6)
    {
        var cid = tenant.CompanyId?.ToString();
        if (cid is null) return Forbid();
        if (months < 1 || months > 24) months = 6;

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("""
            SELECT asm.year, asm.month, sc.channel_name, SUM(asm.amount) AS amount
            FROM public.ad_spend_monthly asm
            JOIN public.sales_channels   sc ON sc.channel_id = asm.channel_id
            WHERE asm.company_id = @cid::uuid
              AND (asm.year * 12 + asm.month) >= (@curYM - @months + 1)
            GROUP BY asm.year, asm.month, sc.channel_name
            ORDER BY asm.year, asm.month, sc.channel_name
            """, conn);
        cmd.Parameters.AddWithValue("cid",    cid);
        cmd.Parameters.AddWithValue("curYM",  DateTime.Now.Year * 12 + DateTime.Now.Month);
        cmd.Parameters.AddWithValue("months", months);

        var rows = new List<object>();
        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            rows.Add(new {
                year        = r.GetInt32(0),
                month       = r.GetInt32(1),
                channelName = r.GetString(2),
                amount      = r.GetDecimal(3),
            });

        return Ok(new { success = true, data = rows });
    }

    // ── PUT /api/ad-spend  (upsert: tạo mới hoặc cập nhật) ──────────────────
    [HttpPut]
    public async Task<IActionResult> Upsert([FromBody] UpsertAdSpendRequest req)
    {
        if (req.Amount < 0)
            return BadRequest(new { message = "Chi phí không được âm." });

        var cid = tenant.CompanyId?.ToString();
        if (cid is null) return Forbid();

        await using var conn = new NpgsqlConnection(_connStr);
        await conn.OpenAsync();

        // Kiểm tra channel thuộc company
        await using var chkCmd = new NpgsqlCommand("""
            SELECT 1 FROM public.sales_channels
            WHERE channel_id = @chId AND company_id = @cid::uuid
            """, conn);
        chkCmd.Parameters.AddWithValue("chId", req.ChannelId);
        chkCmd.Parameters.AddWithValue("cid",  cid);
        if (await chkCmd.ExecuteScalarAsync() is null)
            return NotFound(new { message = "Kênh không tồn tại." });

        await using var cmd = new NpgsqlCommand("""
            INSERT INTO public.ad_spend_monthly
                (company_id, channel_id, year, month, amount, note, created_by, updated_at)
            VALUES
                (@cid::uuid, @chId, @year, @month, @amount, @note, @uid, NOW())
            ON CONFLICT (company_id, channel_id, year, month) DO UPDATE
            SET amount     = EXCLUDED.amount,
                note       = EXCLUDED.note,
                updated_at = NOW()
            RETURNING id
            """, conn);
        cmd.Parameters.AddWithValue("cid",    cid);
        cmd.Parameters.AddWithValue("chId",   req.ChannelId);
        cmd.Parameters.AddWithValue("year",   req.Year);
        cmd.Parameters.AddWithValue("month",  req.Month);
        cmd.Parameters.AddWithValue("amount", req.Amount);
        cmd.Parameters.AddWithValue("note",   (object?)req.Note ?? DBNull.Value);
        cmd.Parameters.AddWithValue("uid",    UserId > 0 ? (object)UserId : DBNull.Value);

        var id = (int)(await cmd.ExecuteScalarAsync())!;
        return Ok(new { success = true, id, message = "Đã lưu chi phí quảng cáo." });
    }
}

public record UpsertAdSpendRequest(
    int      ChannelId,
    int      Year,
    int      Month,
    decimal  Amount,
    string?  Note = null
);
