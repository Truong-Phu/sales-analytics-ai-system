import psycopg2
conn = psycopg2.connect(host='localhost', port=5432, dbname='sales_analytics_ai_db', user='postgres', password='021204')
cur = conn.cursor()

cur.execute("""
    SELECT
        COUNT(DISTINCT o.order_id) as total_orders,
        COUNT(DISTINCT CASE WHEN c.cnt > 1 THEN o.order_id END) as multi_item_orders
    FROM public.orders o
    JOIN (SELECT order_id, COUNT(*) as cnt FROM public.order_items GROUP BY order_id) c ON c.order_id = o.order_id
    WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
""")
r = cur.fetchone()
print(f'Total orders (non-cancelled): {r[0]}, Multi-item orders: {r[1]}')

cur.execute("SELECT COUNT(*) FROM public.goods_receipts")
print(f'Goods receipts: {cur.fetchone()[0]}')

cur.execute("SELECT COUNT(*) FROM public.goods_receipt_items")
print(f'Goods receipt items: {cur.fetchone()[0]}')

cur.execute("""
    SELECT
        COUNT(*) FILTER (WHERE cogs_amount > 0) as has_cogs,
        COUNT(*) FILTER (WHERE cogs_amount = 0 OR cogs_amount IS NULL) as no_cogs,
        ROUND(SUM(gross_profit)/NULLIF(SUM(net_revenue),0)*100, 1) as margin_pct
    FROM dw.fact_sales
""")
r = cur.fetchone()
print(f'fact_sales: {r[0]} with COGS, {r[1]} without, margin={r[2]}%')

cur.execute("""
    SELECT COUNT(*) FILTER (WHERE cost_price > 0), COUNT(*), ROUND(AVG(cost_price)::numeric, 0)
    FROM public.products WHERE is_active = TRUE
""")
r = cur.fetchone()
print(f'Products: {r[0]} with cost_price, {r[1]} total, avg_cost={r[2]}')

conn.close()
