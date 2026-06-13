using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SalesAnalytics.API.Services;

namespace SalesAnalytics.API.Controllers;

/// <summary>
/// Dashboard tồn kho — dữ liệu thật từ products, inventory_transactions,
/// purchase_orders, goods_receipts, suppliers.
/// Routes: GET /api/inventory/dashboard/*
///         GET /api/inventory/recommendations
/// </summary>
[ApiController]
[Route("api/inventory")]
[Authorize]
public class InventoryDashboardController(
    IConfiguration cfg,
    ITenantContext tenant) : ControllerBase
{
    private readonly string _connStr = cfg.GetConnectionString("Default")!;
    private string Cid => tenant.CompanyId!.Value.ToString();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GET /api/inventory/dashboard/overview
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("dashboard/overview")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> Overview([FromQuery] int threshold = 10)
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            // KPIs sản phẩm
            await using var prodCmd = new NpgsqlCommand("""
                WITH product_stock AS (
                    SELECT
                        p.product_id,
                        CASE
                            WHEN COALESCE(vs.variation_count, 0) > 0 THEN COALESCE(vs.variation_stock, 0)
                            ELSE p.stock_quantity
                        END AS stock_quantity,
                        COALESCE(NULLIF(p.cost_price,0), NULLIF(p.base_price,0), 0) AS unit_cost
                    FROM public.products p
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*)::int AS variation_count,
                               COALESCE(SUM(pv.stock_quantity), 0)::int AS variation_stock
                        FROM public.product_variations pv
                        WHERE pv.product_id = p.product_id
                          AND pv.company_id = @cid::uuid
                          AND pv.is_active = TRUE
                    ) vs ON TRUE
                    WHERE p.company_id = @cid::uuid
                      AND p.is_active = TRUE
                      AND p.product_name !~* '^ITEM[0-9]+$'
                )
                SELECT
                    COUNT(*) AS total_products,
                    COALESCE(SUM(stock_quantity), 0) AS total_stock,
                    COUNT(*) FILTER (WHERE stock_quantity > 0 AND stock_quantity <= @thr) AS low_stock_count,
                    COUNT(*) FILTER (WHERE stock_quantity = 0) AS out_of_stock_count,
                    COALESCE(SUM(stock_quantity * unit_cost), 0) AS inventory_value
                FROM product_stock
                """, conn);
            prodCmd.Parameters.AddWithValue("cid", Cid);
            prodCmd.Parameters.AddWithValue("thr", threshold);

            long totalProducts = 0, totalStock = 0, lowCount = 0, outCount = 0;
            decimal inventoryValue = 0;
            await using (var r = await prodCmd.ExecuteReaderAsync())
            {
                if (await r.ReadAsync())
                {
                    totalProducts  = r.GetInt64(0);
                    totalStock     = r.GetInt64(1);
                    lowCount       = r.GetInt64(2);
                    outCount       = r.GetInt64(3);
                    inventoryValue = r.GetDecimal(4);
                }
            }

            // Stock in / out hôm nay
            await using var txCmd = new NpgsqlCommand("""
                SELECT
                    COALESCE(SUM(quantity_change) FILTER (WHERE quantity_change > 0), 0) AS stock_in,
                    COALESCE(ABS(SUM(quantity_change) FILTER (WHERE quantity_change < 0)), 0) AS stock_out
                FROM public.inventory_transactions
                WHERE company_id = @cid::uuid
                  AND created_at >= CURRENT_DATE
                  AND created_at <  CURRENT_DATE + INTERVAL '1 day'
                """, conn);
            txCmd.Parameters.AddWithValue("cid", Cid);
            long stockInToday = 0, stockOutToday = 0;
            await using (var r = await txCmd.ExecuteReaderAsync())
            {
                if (await r.ReadAsync())
                {
                    stockInToday  = r.GetInt64(0);
                    stockOutToday = r.GetInt64(1);
                }
            }

            // Purchase order counts
            await using var poCmd = new NpgsqlCommand("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'PENDING')             AS pending,
                    COUNT(*) FILTER (WHERE status = 'APPROVED')            AS approved,
                    COUNT(*) FILTER (WHERE status = 'PARTIALLY_RECEIVED')  AS partial
                FROM public.purchase_orders
                WHERE company_id = @cid::uuid
                """, conn);
            poCmd.Parameters.AddWithValue("cid", Cid);
            long poPending = 0, poApproved = 0, poPartial = 0;
            await using (var r = await poCmd.ExecuteReaderAsync())
            {
                if (await r.ReadAsync())
                {
                    poPending  = r.GetInt64(0);
                    poApproved = r.GetInt64(1);
                    poPartial  = r.GetInt64(2);
                }
            }

            return Ok(new
            {
                totalProducts,
                totalStockQuantity             = totalStock,
                lowStockCount                  = lowCount,
                outOfStockCount                = outCount,
                stockInToday,
                stockOutToday,
                inventoryValue,
                pendingPurchaseOrders          = poPending,
                approvedPurchaseOrders         = poApproved,
                partiallyReceivedPurchaseOrders= poPartial,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. GET /api/inventory/dashboard/stock-movement
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("dashboard/stock-movement")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> StockMovement(
        [FromQuery] int? days       = null,
        [FromQuery] DateOnly? from = null,
        [FromQuery] DateOnly? to   = null)
    {
        var safeDays = days is >= 1 and <= 365 ? days.Value : 30;
        var today    = DateOnly.FromDateTime(DateTime.Now);
        var toDate   = to   ?? today;
        var fromDate = from ?? toDate.AddDays(-(safeDays - 1));

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                WITH days AS (
                    SELECT generate_series(@from::date, @to::date, INTERVAL '1 day')::date AS day
                ),
                raw_tx AS (
                    SELECT
                        (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date                        AS day,
                        transaction_type,
                        quantity_change
                    FROM public.inventory_transactions
                    WHERE company_id = @cid::uuid
                      AND created_at >= @from
                      AND created_at <  @to + INTERVAL '1 day'
                      AND ABS(quantity_change) <= 10000
                ),
                clean_tx AS (
                    SELECT day, transaction_type, quantity_change
                    FROM (
                        SELECT
                            day,
                            transaction_type,
                            quantity_change,
                            COUNT(*) OVER (PARTITION BY day, transaction_type) AS tx_type_count
                        FROM raw_tx
                    ) t
                    WHERE NOT (
                        transaction_type = 'MARKETPLACE_IMPORT_SALE'
                        AND tx_type_count > 1000
                    )
                ),
                tx AS (
                    SELECT
                        day,
                        COALESCE(SUM(quantity_change) FILTER (WHERE quantity_change > 0), 0)       AS stock_in,
                        COALESCE(ABS(SUM(quantity_change) FILTER (WHERE quantity_change < 0)), 0)  AS stock_out,
                        COALESCE(SUM(quantity_change), 0)                                           AS net_change
                    FROM clean_tx
                    GROUP BY day
                )
                SELECT
                    d.day,
                    COALESCE(tx.stock_in, 0)   AS stock_in,
                    COALESCE(tx.stock_out, 0)  AS stock_out,
                    COALESCE(tx.net_change, 0) AS net_change
                FROM days d
                LEFT JOIN tx ON tx.day = d.day
                ORDER BY d.day
                """, conn);
            cmd.Parameters.AddWithValue("cid",  Cid);
            cmd.Parameters.AddWithValue("from", fromDate.ToDateTime(TimeOnly.MinValue));
            cmd.Parameters.AddWithValue("to",   toDate.ToDateTime(TimeOnly.MinValue));

            var rows = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                rows.Add(new
                {
                    date      = ((DateOnly)r.GetFieldValue<DateOnly>(0)).ToString("yyyy-MM-dd"),
                    stockIn   = r.GetInt64(1),
                    stockOut  = r.GetInt64(2),
                    netChange = r.GetInt64(3),
                });

            return Ok(rows);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. GET /api/inventory/dashboard/low-stock
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("dashboard/low-stock")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> LowStock(
        [FromQuery] int threshold = 10,
        [FromQuery] int page      = 1,
        [FromQuery] int pageSize  = 20)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                WITH product_stock AS (
                    SELECT
                        p.product_id,
                        p.product_name,
                        p.sku,
                        CASE
                            WHEN COALESCE(vs.variation_count, 0) > 0 THEN COALESCE(vs.variation_stock, 0)
                            ELSE p.stock_quantity
                        END AS stock_quantity
                    FROM public.products p
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*)::int AS variation_count,
                               COALESCE(SUM(pv.stock_quantity), 0)::int AS variation_stock
                        FROM public.product_variations pv
                        WHERE pv.product_id = p.product_id
                          AND pv.company_id = @cid::uuid
                          AND pv.is_active = TRUE
                    ) vs ON TRUE
                    WHERE p.company_id = @cid::uuid
                      AND p.is_active = TRUE
                      AND p.product_name !~* '^ITEM[0-9]+$'
                )
                SELECT
                    p.product_id, p.product_name, p.sku, p.stock_quantity,
                    COALESCE(
                        (SELECT SUM(oi.quantity)::numeric /
                            GREATEST(
                                EXTRACT(EPOCH FROM (NOW() - MIN(o.order_date))) / 86400,
                                1
                            )
                         FROM public.order_items oi
                         JOIN public.orders o ON o.order_id = oi.order_id
                         WHERE oi.product_id = p.product_id
                           AND o.company_id = @cid::uuid
                           AND o.status NOT IN ('CANCELLED', 'RETURNED')),
                        0
                    ) AS avg_daily_sales
                FROM product_stock p
                WHERE p.stock_quantity <= @thr
                ORDER BY p.stock_quantity ASC, p.product_name
                LIMIT @lim OFFSET @off
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);
            cmd.Parameters.AddWithValue("thr", threshold);
            cmd.Parameters.AddWithValue("lim", pageSize);
            cmd.Parameters.AddWithValue("off", (page - 1) * pageSize);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var stock   = r.GetInt32(3);
                var avgSales = r.GetDecimal(4);
                var daysLeft = avgSales > 0 ? Math.Round((double)stock / (double)avgSales, 1) : (double?)null;
                var reorder  = avgSales > 0
                    ? (int)Math.Max(0, Math.Ceiling((double)avgSales * 30 - stock))
                    : 0;

                items.Add(new
                {
                    productId                 = r.GetInt32(0),
                    productName               = r.GetString(1),
                    sku                       = r.IsDBNull(2) ? null : r.GetString(2),
                    stockQuantity             = stock,
                    avgDailySales             = Math.Round((double)avgSales, 2),
                    estimatedDaysLeft         = daysLeft,
                    recommendedReorderQuantity= reorder,
                });
            }

            return Ok(items);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. GET /api/inventory/dashboard/product-velocity
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("dashboard/product-velocity")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> ProductVelocity([FromQuery] int days = 30)
    {
        if (days < 1 || days > 365) days = 30;
        var safeDays = days;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand($"""
                WITH sales AS (
                    SELECT
                        oi.product_id,
                        SUM(oi.quantity)::bigint AS total_sold
                    FROM public.order_items oi
                    JOIN public.orders o ON o.order_id = oi.order_id
                    WHERE o.company_id = @cid::uuid
                      AND o.status NOT IN ('CANCELLED', 'RETURNED')
                      AND o.order_date >= NOW() - (@days * INTERVAL '1 day')
                    GROUP BY oi.product_id
                ),
                product_stock AS (
                    SELECT
                        p.product_id,
                        p.product_name,
                        p.sku,
                        CASE
                            WHEN COALESCE(vs.variation_count, 0) > 0 THEN COALESCE(vs.variation_stock, 0)
                            ELSE p.stock_quantity
                        END AS stock_quantity
                    FROM public.products p
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*)::int AS variation_count,
                               COALESCE(SUM(pv.stock_quantity), 0)::int AS variation_stock
                        FROM public.product_variations pv
                        WHERE pv.product_id = p.product_id
                          AND pv.company_id = @cid::uuid
                          AND pv.is_active = TRUE
                    ) vs ON TRUE
                    WHERE p.company_id = @cid::uuid
                      AND p.is_active = TRUE
                      AND COALESCE(NULLIF(BTRIM(p.product_name), ''), NULLIF(BTRIM(p.sku), '')) IS NOT NULL
                      AND p.product_name !~* '^ITEM[0-9]+$'
                )
                SELECT
                    p.product_id, p.product_name, p.sku, p.stock_quantity,
                    COALESCE(s.total_sold, 0) AS total_sold
                FROM product_stock p
                LEFT JOIN sales s ON s.product_id = p.product_id
                ORDER BY total_sold DESC
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);
            cmd.Parameters.AddWithValue("days", safeDays);

            var all = new List<(int id, string name, string? sku, int stock, long sold)>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                all.Add((r.GetInt32(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2),
                         r.GetInt32(3), r.GetInt64(4)));

            var fast = all.Where(x => x.sold > 0).Take(10).Select(x => new
            {
                productId    = x.id,
                productName  = x.name,
                sku          = x.sku,
                stockQuantity= x.stock,
                totalSold    = x.sold,
                avgDailySales= Math.Round((double)x.sold / days, 2),
            }).ToList<object>();

            var slow = all.Where(x => x.sold > 0 && x.sold <= (all.Select(a => (double)a.sold).Average()) * 0.3)
                          .OrderBy(x => x.sold).Take(10).Select(x => new
            {
                productId    = x.id,
                productName  = x.name,
                sku          = x.sku,
                stockQuantity= x.stock,
                totalSold    = x.sold,
                avgDailySales= Math.Round((double)x.sold / days, 2),
            }).ToList<object>();

            var dead = all.Where(x => x.sold == 0 && x.stock > 0).Take(20).Select(x => new
            {
                productId    = x.id,
                productName  = x.name,
                sku          = x.sku,
                stockQuantity= x.stock,
                totalSold    = 0L,
                avgDailySales= 0.0,
            }).ToList<object>();

            return Ok(new { analysisDays = days, topFastMovingProducts = fast, slowMovingProducts = slow, deadStockProducts = dead });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. GET /api/inventory/reorder-plan
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("reorder-plan")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> ReorderPlan(
        [FromQuery] int? productId = null,
        [FromQuery] int days = 30,
        [FromQuery] int targetDays = 30)
    {
        if (days < 1 || days > 365) days = 30;
        if (targetDays < 7 || targetDays > 120) targetDays = 30;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                WITH scoped_products AS (
                    SELECT p.product_id, p.product_name, p.sku, p.stock_quantity, p.cost_price, p.base_price
                    FROM public.products p
                    WHERE p.company_id = @cid::uuid
                      AND p.is_active = TRUE
                      AND p.product_name !~* '^ITEM[0-9]+$'
                      AND (@pid = 0 OR p.product_id = @pid)
                ),
                variation_rows AS (
                    SELECT
                        p.product_id,
                        p.product_name,
                        p.sku AS product_sku,
                        pv.id AS variation_id,
                        pv.variation_name,
                        pv.attribute_color,
                        pv.attribute_size,
                        pv.sku AS variation_sku,
                        pv.stock_quantity,
                        COALESCE(NULLIF(pv.cost_price, 0), NULLIF(p.cost_price, 0), NULLIF(p.base_price, 0), 0) AS import_price,
                        COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.quantity ELSE 0 END), 0)::numeric / @days AS avg_daily_sales
                    FROM scoped_products p
                    JOIN public.product_variations pv
                      ON pv.product_id = p.product_id
                     AND pv.company_id = @cid::uuid
                     AND pv.is_active = TRUE
                    LEFT JOIN public.order_items oi
                      ON oi.product_id = p.product_id
                     AND oi.variation_id = pv.id
                    LEFT JOIN public.orders o
                      ON o.order_id = oi.order_id
                     AND o.company_id = @cid::uuid
                     AND o.status NOT IN ('CANCELLED', 'RETURNED')
                     AND o.order_date >= NOW() - (@days * INTERVAL '1 day')
                    GROUP BY p.product_id, p.product_name, p.sku, pv.id, pv.variation_name,
                             pv.attribute_color, pv.attribute_size, pv.sku, pv.stock_quantity,
                             pv.cost_price, p.cost_price, p.base_price
                ),
                product_rows AS (
                    SELECT
                        p.product_id,
                        p.product_name,
                        p.sku AS product_sku,
                        NULL::int AS variation_id,
                        NULL::text AS variation_name,
                        NULL::text AS attribute_color,
                        NULL::text AS attribute_size,
                        NULL::text AS variation_sku,
                        p.stock_quantity,
                        COALESCE(NULLIF(p.cost_price, 0), NULLIF(p.base_price, 0), 0) AS import_price,
                        COALESCE(SUM(CASE WHEN o.order_id IS NOT NULL THEN oi.quantity ELSE 0 END), 0)::numeric / @days AS avg_daily_sales
                    FROM scoped_products p
                    LEFT JOIN public.product_variations pv
                      ON pv.product_id = p.product_id
                     AND pv.company_id = @cid::uuid
                     AND pv.is_active = TRUE
                    LEFT JOIN public.order_items oi
                      ON oi.product_id = p.product_id
                     AND oi.variation_id IS NULL
                    LEFT JOIN public.orders o
                      ON o.order_id = oi.order_id
                     AND o.company_id = @cid::uuid
                     AND o.status NOT IN ('CANCELLED', 'RETURNED')
                     AND o.order_date >= NOW() - (@days * INTERVAL '1 day')
                    WHERE pv.id IS NULL
                    GROUP BY p.product_id, p.product_name, p.sku, p.stock_quantity, p.cost_price, p.base_price
                ),
                base AS (
                    SELECT * FROM variation_rows
                    UNION ALL
                    SELECT * FROM product_rows
                ),
                enriched AS (
                    SELECT
                        b.*,
                        COALESCE(hist.avg_daily_sales_180, 0) AS historical_avg_daily_sales,
                        po.last_order_qty,
                        gr.last_receipt_qty
                    FROM base b
                    LEFT JOIN LATERAL (
                        SELECT COALESCE(SUM(oi2.quantity), 0)::numeric / 180 AS avg_daily_sales_180
                        FROM public.order_items oi2
                        JOIN public.orders o2
                          ON o2.order_id = oi2.order_id
                         AND o2.company_id = @cid::uuid
                         AND o2.status NOT IN ('CANCELLED', 'RETURNED')
                         AND o2.order_date >= NOW() - INTERVAL '180 days'
                        WHERE oi2.product_id = b.product_id
                          AND (
                                (b.variation_id IS NULL AND oi2.variation_id IS NULL)
                                OR oi2.variation_id = b.variation_id
                              )
                    ) hist ON TRUE
                    LEFT JOIN LATERAL (
                        SELECT poi.quantity AS last_order_qty
                        FROM public.purchase_order_items poi
                        JOIN public.purchase_orders po
                          ON po.purchase_order_id = poi.purchase_order_id
                         AND po.company_id = @cid::uuid
                         AND po.status <> 'CANCELLED'
                        WHERE poi.product_id = b.product_id
                          AND (
                                (b.variation_id IS NULL AND poi.variation_id IS NULL)
                                OR poi.variation_id = b.variation_id
                              )
                        ORDER BY po.created_at DESC
                        LIMIT 1
                    ) po ON TRUE
                    LEFT JOIN LATERAL (
                        SELECT gri.received_quantity AS last_receipt_qty
                        FROM public.goods_receipt_items gri
                        JOIN public.goods_receipts gr
                          ON gr.goods_receipt_id = gri.goods_receipt_id
                         AND gr.company_id = @cid::uuid
                        WHERE gri.product_id = b.product_id
                          AND (
                                (b.variation_id IS NULL AND gri.variation_id IS NULL)
                                OR gri.variation_id = b.variation_id
                              )
                        ORDER BY gr.created_at DESC
                        LIMIT 1
                    ) gr ON TRUE
                ),
                calculated AS (
                    SELECT
                        *,
                        COALESCE(NULLIF(avg_daily_sales, 0), NULLIF(historical_avg_daily_sales, 0), 0) AS effective_avg_daily_sales,
                        COALESCE(last_order_qty, last_receipt_qty) AS reference_qty
                    FROM enriched
                )
                SELECT
                    product_id,
                    product_name,
                    product_sku,
                    variation_id,
                    variation_name,
                    attribute_color,
                    attribute_size,
                    variation_sku,
                    stock_quantity,
                    import_price,
                    effective_avg_daily_sales AS avg_daily_sales,
                    CASE
                        WHEN effective_avg_daily_sales > 0 THEN stock_quantity / effective_avg_daily_sales
                        WHEN stock_quantity = 0 THEN 0
                        ELSE 9999
                    END AS days_left,
                    CASE
                        WHEN effective_avg_daily_sales > 0 THEN GREATEST(0, CEIL(effective_avg_daily_sales * @targetDays - stock_quantity))::int
                        WHEN stock_quantity = 0 AND reference_qty IS NOT NULL THEN reference_qty
                        ELSE 0
                    END AS reorder_qty,
                    CASE
                        WHEN avg_daily_sales > 0 THEN 'sales_recent'
                        WHEN historical_avg_daily_sales > 0 THEN 'sales_history'
                        WHEN last_order_qty IS NOT NULL THEN 'last_purchase_order'
                        WHEN last_receipt_qty IS NOT NULL THEN 'last_goods_receipt'
                        ELSE 'none'
                    END AS reorder_source,
                    reference_qty
                FROM calculated
                WHERE
                    (effective_avg_daily_sales > 0 AND stock_quantity / effective_avg_daily_sales <= 14)
                    OR (stock_quantity = 0 AND reference_qty IS NOT NULL)
                ORDER BY product_name, variation_id NULLS FIRST
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);
            cmd.Parameters.AddWithValue("pid", productId ?? 0);
            cmd.Parameters.AddWithValue("days", days);
            cmd.Parameters.AddWithValue("targetDays", targetDays);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var reorderQty = r.GetInt32(12);
                if (reorderQty <= 0) continue;

                items.Add(new
                {
                    productId    = r.GetInt32(0),
                    productName  = r.GetString(1),
                    productSku   = r.IsDBNull(2) ? null : r.GetString(2),
                    variationId  = r.IsDBNull(3) ? (int?)null : r.GetInt32(3),
                    variationName= r.IsDBNull(4) ? null : r.GetString(4),
                    color        = r.IsDBNull(5) ? null : r.GetString(5),
                    size         = r.IsDBNull(6) ? null : r.GetString(6),
                    variationSku = r.IsDBNull(7) ? null : r.GetString(7),
                    stockQuantity= r.GetInt32(8),
                    importPrice  = r.GetDecimal(9),
                    avgDailySales= Math.Round((double)r.GetDecimal(10), 2),
                    daysLeft     = Math.Round((double)r.GetDecimal(11), 1),
                    reorderQty,
                    reorderSource= r.IsDBNull(13) ? null : r.GetString(13),
                    referenceQty = r.IsDBNull(14) ? (int?)null : r.GetInt32(14),
                });
            }

            return Ok(new { days, targetDays, items, count = items.Count });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. GET /api/inventory/dashboard/supplier-performance
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("dashboard/supplier-performance")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> SupplierPerformance()
    {
        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                SELECT
                    s.supplier_id,
                    s.supplier_name,
                    -- PO breakdown
                    COUNT(DISTINCT po.purchase_order_id)                                                               AS total_pos,
                    COUNT(DISTINCT po.purchase_order_id) FILTER (WHERE po.status = 'RECEIVED')                         AS po_received,
                    COUNT(DISTINCT po.purchase_order_id) FILTER (WHERE po.status IN ('APPROVED','PARTIALLY_RECEIVED')) AS po_pending,
                    COUNT(DISTINCT po.purchase_order_id) FILTER (WHERE po.status = 'CANCELLED')                        AS po_cancelled,
                    -- Số lượng và giá trị
                    COALESCE(SUM(poi.received_quantity), 0)                          AS total_received_qty,
                    COALESCE(SUM(poi.received_quantity * poi.import_price), 0)       AS total_received_amount,
                    MAX(gr.created_at)                                               AS last_receipt_date,
                    -- Fill Rate (chuẩn): SL thực nhận / SL đặt hàng
                    CASE WHEN SUM(poi.quantity) > 0
                         THEN ROUND(SUM(poi.received_quantity)::numeric / SUM(poi.quantity), 4)
                         ELSE NULL END                                               AS fill_rate,
                    -- Lead Time thực tế (ngày từ tạo PO đến nhận hàng)
                    ROUND(AVG(EXTRACT(EPOCH FROM (gr.created_at - po.created_at)) / 86400)::numeric, 1)
                                                                                     AS avg_lead_days,
                    -- SLA (ngày hẹn - ngày tạo PO)
                    ROUND(AVG(po.expected_delivery_date - po.created_at::date)::numeric, 0)
                                                                                     AS sla_days,
                    -- On-Time Rate: phiếu nhập kho trước hoặc đúng ngày hẹn
                    CASE WHEN COUNT(gr.goods_receipt_id) > 0
                         THEN ROUND(
                             COUNT(gr.goods_receipt_id) FILTER (WHERE gr.created_at::date <= po.expected_delivery_date)::numeric
                             / COUNT(gr.goods_receipt_id), 4)
                         ELSE NULL END                                               AS on_time_rate
                FROM public.suppliers s
                LEFT JOIN public.purchase_orders po
                       ON po.supplier_id = s.supplier_id AND po.company_id = @cid::uuid
                LEFT JOIN public.purchase_order_items poi
                       ON poi.purchase_order_id = po.purchase_order_id
                LEFT JOIN public.goods_receipts gr
                       ON gr.purchase_order_id = po.purchase_order_id
                WHERE s.company_id = @cid::uuid AND s.is_active = TRUE
                GROUP BY s.supplier_id, s.supplier_name
                ORDER BY on_time_rate DESC NULLS LAST, fill_rate DESC NULLS LAST
                """, conn);
            cmd.Parameters.AddWithValue("cid", Cid);

            var items = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                items.Add(new
                {
                    supplierId            = r.GetInt32(0),
                    supplierName          = r.GetString(1),
                    totalPurchaseOrders   = r.GetInt64(2),
                    poReceived            = r.GetInt64(3),
                    poPending             = r.GetInt64(4),
                    poCancelled           = r.GetInt64(5),
                    totalReceivedQuantity = r.GetInt64(6),
                    totalReceivedAmount   = r.GetDecimal(7),
                    lastReceiptDate       = r.IsDBNull(8) ? (DateTime?)null : r.GetDateTime(8),
                    fillRate              = r.IsDBNull(9)  ? (decimal?)null : r.GetDecimal(9),
                    avgLeadDays           = r.IsDBNull(10) ? (decimal?)null : r.GetDecimal(10),
                    slaDays               = r.IsDBNull(11) ? (decimal?)null : r.GetDecimal(11),
                    onTimeRate            = r.IsDBNull(12) ? (decimal?)null : r.GetDecimal(12),
                });

            return Ok(items);
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. GET /api/inventory/recommendations
    // ─────────────────────────────────────────────────────────────────────────
    [HttpGet("recommendations")]
    [Authorize(Roles = "Owner,Manager,Staff_Warehouse,DataIT,SuperAdmin")]
    public async Task<IActionResult> Recommendations(
        [FromQuery] int targetDays = 30,
        [FromQuery] int topN       = 20)
    {
        if (targetDays < 7  || targetDays > 90) targetDays = 30;
        if (topN       < 1  || topN       > 100) topN      = 20;

        try
        {
            await using var conn = new NpgsqlConnection(_connStr);
            await conn.OpenAsync();

            await using var cmd = new NpgsqlCommand("""
                WITH product_stock AS (
                    SELECT
                        p.product_id,
                        p.product_name,
                        p.sku,
                        CASE
                            WHEN COALESCE(vs.variation_count, 0) > 0 THEN COALESCE(vs.variation_stock, 0)
                            ELSE p.stock_quantity
                        END AS stock_quantity
                    FROM public.products p
                    LEFT JOIN LATERAL (
                        SELECT COUNT(*)::int AS variation_count,
                               COALESCE(SUM(pv.stock_quantity), 0)::int AS variation_stock
                        FROM public.product_variations pv
                        WHERE pv.product_id = p.product_id
                          AND pv.company_id = @cid::uuid
                          AND pv.is_active = TRUE
                    ) vs ON TRUE
                    WHERE p.company_id = @cid::uuid
                      AND p.is_active = TRUE
                      AND p.product_name !~* '^ITEM[0-9]+$'
                )
                SELECT
                    p.product_id,
                    p.product_name,
                    p.sku,
                    p.stock_quantity,
                    COALESCE(
                        (SELECT SUM(oi.quantity)::numeric /
                            GREATEST(
                                EXTRACT(EPOCH FROM (NOW() - MIN(o.order_date))) / 86400,
                                1
                            )
                         FROM public.order_items oi
                         JOIN public.orders o ON o.order_id = oi.order_id
                         WHERE oi.product_id = p.product_id
                           AND o.company_id = @cid::uuid
                           AND o.status NOT IN ('CANCELLED', 'RETURNED')),
                        0
                    ) AS avg_daily_sales,
                    (SELECT sup.supplier_name
                     FROM public.purchase_order_items poi
                     JOIN public.purchase_orders po ON po.purchase_order_id = poi.purchase_order_id
                     JOIN public.suppliers sup ON sup.supplier_id = po.supplier_id
                     WHERE poi.product_id = p.product_id
                     ORDER BY po.created_at DESC LIMIT 1
                    ) AS last_supplier_name
                FROM product_stock p
                ORDER BY p.stock_quantity ASC
                LIMIT @topN
                """, conn);
            cmd.Parameters.AddWithValue("cid",  Cid);
            cmd.Parameters.AddWithValue("topN", topN);

            var recs = new List<object>();
            await using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
            {
                var stock     = r.GetInt32(3);
                var avgSales  = r.GetDecimal(4);
                var supplier  = r.IsDBNull(5) ? null : r.GetString(5);

                double daysLeft = avgSales > 0 ? Math.Round((double)stock / (double)avgSales, 1) : 9999.0;
                int    reorder  = (int)Math.Max(0, Math.Ceiling((double)avgSales * targetDays - stock));

                string risk = stock == 0 || daysLeft <= 3  ? "CRITICAL"
                            : daysLeft <= 7                 ? "HIGH"
                            : daysLeft <= 14                ? "MEDIUM"
                            :                                 "LOW";

                // Chỉ trả về sản phẩm cần quan tâm (risk != LOW hoặc reorder > 0)
                if (risk == "LOW" && reorder == 0) continue;

                string action = risk == "CRITICAL" ? "Đặt hàng ngay lập tức"
                              : risk == "HIGH"     ? "Lên kế hoạch nhập hàng sớm"
                              : risk == "MEDIUM"   ? "Cân nhắc nhập thêm hàng"
                              :                      "Theo dõi tình trạng tồn kho";

                string reason = stock == 0
                    ? "Hết hàng, cần nhập ngay để tiếp tục kinh doanh."
                    : avgSales == 0
                        ? $"Tồn kho {stock} đơn vị, chưa có dữ liệu bán trong 30 ngày."
                        : $"Tồn kho chỉ đủ khoảng {daysLeft} ngày dựa trên tốc độ bán {Math.Round((double)avgSales, 1)} đơn/ngày (30 ngày gần nhất).";

                recs.Add(new
                {
                    productId                  = r.GetInt32(0),
                    productName                = r.GetString(1),
                    sku                        = r.IsDBNull(2) ? null : r.GetString(2),
                    currentStock               = stock,
                    avgDailySales              = Math.Round((double)avgSales, 2),
                    estimatedDaysLeft          = daysLeft >= 9999 ? (double?)null : daysLeft,
                    riskLevel                  = risk,
                    recommendedAction          = action,
                    recommendedReorderQuantity = reorder,
                    lastSupplier               = supplier,
                    reason,
                });
            }

            return Ok(new { targetDays, items = recs, count = recs.Count });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { message = "Lỗi kết nối database.", detail = ex.Message });
        }
    }
}
