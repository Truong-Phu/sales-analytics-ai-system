import psycopg2
conn = psycopg2.connect(host='localhost', port=5432, dbname='sales_analytics_ai_db', user='postgres', password='021204')
cur = conn.cursor()
CID = '89ab1a10-64d2-49f3-9b28-811274d4ca37'

cur.execute("""
    SELECT cnt, COUNT(*) as num_orders FROM (
        SELECT oi.order_id, COUNT(*) as cnt
        FROM public.order_items oi
        JOIN public.orders o ON o.order_id = oi.order_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o.company_id = %s::uuid
          AND o.order_date >= NOW() - INTERVAL '180 days'
        GROUP BY oi.order_id
    ) x GROUP BY cnt ORDER BY cnt
""", (CID,))
print("Item count distribution (180d):")
for r in cur.fetchall():
    print(f"  {r[1]} orders with {r[0]} items")

# Top product pairs
cur.execute("""
    SELECT p1.product_name, p2.product_name, COUNT(*) as times
    FROM public.order_items oi1
    JOIN public.order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.item_id < oi2.item_id
    JOIN public.products p1 ON p1.product_id = oi1.product_id
    JOIN public.products p2 ON p2.product_id = oi2.product_id
    JOIN public.orders o ON o.order_id = oi1.order_id
    WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
      AND o.company_id = %s::uuid
      AND o.order_date >= NOW() - INTERVAL '180 days'
    GROUP BY p1.product_name, p2.product_name
    ORDER BY times DESC
    LIMIT 5
""", (CID,))
print("\nTop product pairs:")
for r in cur.fetchall():
    print(f"  {r[0][:30]} + {r[1][:30]} → {r[2]} times")

conn.close()
