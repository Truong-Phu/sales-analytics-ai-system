"""
fix_cogs.py — Recalculate COGS từ nguồn thật theo ưu tiên:
1. goods_receipt_items.unit_cost (giá nhập thực tế từ phiếu nhập kho)
2. products.cost_price (giá vốn catalog, đã fix = 65% base_price)
3. Nếu thiếu → missing_cost = TRUE
"""
import psycopg2, sys

conn = psycopg2.connect(host='localhost', port=5432, dbname='sales_analytics_ai_db', user='postgres', password='021204')
cur = conn.cursor()

# --- 1. Tính cost_price từ goods_receipts (ưu tiên cao nhất) ---
# Mỗi sản phẩm lấy giá nhập trung bình từ các phiếu nhập kho
cur.execute("""
    SELECT
        p.product_id,
        p.sku,
        ROUND(AVG(gri.import_price)::numeric, 0) as avg_gr_cost
    FROM public.goods_receipt_items gri
    JOIN public.products p ON p.product_id = gri.product_id
    WHERE gri.import_price IS NOT NULL AND gri.import_price > 0
    GROUP BY p.product_id, p.sku
""")
gr_costs = {r[1]: float(r[2]) for r in cur.fetchall()}
print(f"Goods receipts: {len(gr_costs)} sản phẩm có giá nhập thực tế")

# --- 2. Cập nhật dim_product.cost_price với giá từ goods_receipts ---
updated_gr = 0
for sku, cost in gr_costs.items():
    cur.execute("""
        UPDATE dw.dim_product SET cost_price = %s
        WHERE sku = %s AND is_current = TRUE AND (cost_price IS NULL OR cost_price != %s)
    """, (cost, sku, cost))
    updated_gr += cur.rowcount
print(f"Updated dim_product từ goods_receipts: {updated_gr} rows")

# --- 3. Sync remaining dim_product.cost_price từ OLTP products.cost_price ---
cur.execute("""
    UPDATE dw.dim_product dp
    SET cost_price = p.cost_price
    FROM public.products p
    WHERE dp.sku = p.sku
      AND dp.is_current = TRUE
      AND p.cost_price > 0
      AND (dp.cost_price IS NULL OR dp.cost_price = 0)
""")
print(f"Sync dim_product từ products: {cur.rowcount} rows")

# --- 4. Recalculate fact_sales COGS từ dim_product.cost_price thật ---
cur.execute("""
    UPDATE dw.fact_sales AS fs
    SET
        cogs_amount  = COALESCE(dp.cost_price, 0) * fs.item_quantity,
        gross_profit = fs.net_revenue - COALESCE(dp.cost_price, 0) * fs.item_quantity,
        missing_cost = (dp.cost_price IS NULL OR dp.cost_price = 0)
    FROM dw.dim_product dp
    WHERE fs.product_key = dp.product_key
      AND dp.is_current = TRUE
""")
print(f"Updated fact_sales: {cur.rowcount} rows với COGS thực")

conn.commit()

# --- 5. Báo cáo kết quả ---
cur.execute("""
    SELECT
        ROUND(SUM(net_revenue)/1e6, 1),
        ROUND(SUM(cogs_amount)/1e6, 1),
        ROUND(SUM(gross_profit)/1e6, 1),
        ROUND(SUM(gross_profit)/NULLIF(SUM(net_revenue),0)*100, 1),
        COUNT(*) FILTER (WHERE missing_cost = TRUE) as missing
    FROM dw.fact_sales
""")
r = cur.fetchone()
print(f"\nKết quả fact_sales:")
print(f"  Revenue: {r[0]}M VND")
print(f"  COGS:    {r[1]}M VND")
print(f"  Profit:  {r[2]}M VND")
print(f"  Margin:  {r[3]}%")
print(f"  Missing cost: {r[4]} rows")

# Nguồn COGS
print(f"\nNguồn COGS: {len(gr_costs)} SP từ goods_receipts, còn lại từ products.cost_price")

conn.close()
