import json
import os
import psycopg2
import pandas as pd
from datetime import datetime

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:021204@localhost:5432/sales_analytics_ai_db",
)
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
OUTPUT_PATH = os.path.join(MODELS_DIR, "rfm_segments.json")

def main():
    conn = psycopg2.connect(DATABASE_URL)
    
    # Query data up to 2026-06-03
    # Use o.order_date <= '2026-06-03' to align with the forecasting cut-off
    query = """
        SELECT
            o.customer_id,
            c.full_name,
            c.phone,
            c.email,
            MAX(o.order_date)          AS last_order_date,
            COUNT(DISTINCT o.order_id) AS frequency,
            SUM(oi.subtotal)           AS monetary
        FROM public.orders o
        JOIN public.order_items oi ON o.order_id = oi.order_id
        JOIN public.customers c   ON o.customer_id = c.customer_id
        WHERE o.status = 'DELIVERED' AND o.order_date <= '2026-06-03'
        GROUP BY o.customer_id, c.full_name, c.phone, c.email
        HAVING COUNT(DISTINCT o.order_id) >= 1
        ORDER BY monetary DESC
    """
    df_rfm_raw = pd.read_sql(query, conn)
    df_rfm_raw['last_order_date'] = pd.to_datetime(df_rfm_raw['last_order_date'])
    df_rfm_raw['monetary'] = df_rfm_raw['monetary'].astype(float)
    
    # Set reference date to 2026-06-03
    reference_date = pd.Timestamp("2026-06-03")
    df_rfm = df_rfm_raw.copy()
    if df_rfm['last_order_date'].dt.tz is not None:
        df_rfm['last_order_date'] = df_rfm['last_order_date'].dt.tz_localize(None)
    
    df_rfm['recency_days'] = (reference_date - df_rfm['last_order_date']).dt.days
    
    # R-Score (Recency): lower recency = higher score (5 is best, 1 is worst)
    # F-Score (Frequency): higher frequency = higher score
    # M-Score (Monetary): higher monetary = higher score
    def safe_qcut(series, q, labels):
        try:
            return pd.qcut(series, q=q, labels=labels, duplicates='drop')
        except ValueError:
            return pd.cut(series, bins=q, labels=labels[:min(q, len(labels))], duplicates='drop')
            
    df_rfm['r_score'] = safe_qcut(df_rfm['recency_days'], q=5, labels=[5, 4, 3, 2, 1]).astype(int)
    df_rfm['f_score'] = safe_qcut(df_rfm['frequency'], q=5, labels=[1, 2, 3, 4, 5]).astype(int)
    df_rfm['m_score'] = safe_qcut(df_rfm['monetary'], q=5, labels=[1, 2, 3, 4, 5]).astype(int)
    df_rfm['rfm_score'] = df_rfm['r_score'].astype(str) + df_rfm['f_score'].astype(str) + df_rfm['m_score'].astype(str)
    
    # VIP Threshold: top 20% monetary
    m_vip_threshold = df_rfm['monetary'].quantile(0.80)
    
    def classify_segment(row):
        r, f, m = row['r_score'], row['f_score'], row['m_score']
        if r >= 4 and f >= 3 and row['monetary'] >= m_vip_threshold:
            return 'VIP'
        if r >= 3 and f >= 3:
            return 'Loyal'
        if r >= 4 and f == 1:
            return 'New'
        if r >= 3 and f >= 2:
            return 'Returning'
        if r <= 2 and f >= 2:
            return 'At Risk'
        if r == 1:
            return 'Lost'
        return 'Other'
        
    df_rfm['segment'] = df_rfm.apply(classify_segment, axis=1)
    
    # Create output json
    customers_list = []
    for _, row in df_rfm.iterrows():
        customers_list.append({
            'customer_id':   int(row['customer_id']),
            'full_name':     str(row['full_name']) if pd.notna(row['full_name']) else '',
            'phone':         str(row['phone']) if pd.notna(row.get('phone', None)) else '',
            'recency_days':  int(row['recency_days']),
            'frequency':     int(row['frequency']),
            'monetary':      round(float(row['monetary']), 0),
            'r_score':       int(row['r_score']),
            'f_score':       int(row['f_score']),
            'm_score':       int(row['m_score']),
            'rfm_score':     str(row['rfm_score']),
            'segment':       str(row['segment']),
            'last_order':    row['last_order_date'].strftime('%Y-%m-%d'),
        })
        
    seg_stats = {}
    for seg, grp in df_rfm.groupby('segment'):
        seg_stats[seg] = {
            'count':         int(len(grp)),
            'pct_customers': round(len(grp)/len(df_rfm)*100, 1),
            'total_revenue': round(float(grp['monetary'].sum()), 0),
            'avg_monetary':  round(float(grp['monetary'].mean()), 0),
            'avg_frequency': round(float(grp['frequency'].mean()), 1),
            'avg_recency':   round(float(grp['recency_days'].mean()), 0),
        }
        
    output = {
        'computed_at':     datetime.utcnow().isoformat(),
        'data_source':     'OLTP (public.orders + public.customers)',
        'reference_date':  reference_date.strftime('%Y-%m-%d'),
        'vip_threshold':   round(float(m_vip_threshold), 0),
        'total_customers': len(df_rfm),
        'segment_summary': seg_stats,
        'customers':       customers_list,
    }
    
    os.makedirs(MODELS_DIR, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        
    print(f"SUCCESS: Calculated RFM for {len(df_rfm)} customers as of {reference_date.date()}")
    print("Segments summary:")
    for seg, stats in sorted(seg_stats.items(), key=lambda x: -x[1]['total_revenue']):
        print(f"  {seg:<12}: {stats['count']:>3} KH ({stats['pct_customers']:4.1f}%) | Revenue: {stats['total_revenue']:>12,.0f} VNĐ | Avg Recency: {stats['avg_recency']:>3.0f} days")
        
    conn.close()

if __name__ == '__main__':
    main()
