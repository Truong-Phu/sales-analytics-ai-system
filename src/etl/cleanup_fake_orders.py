"""
Dọn dẹp dữ liệu đơn hàng giả/thiếu dữ liệu:
1. Xóa 32 đơn không có external_order_id (import test)
2. Chuẩn hóa payment_method
3. Xóa orphan customers
4. Xóa fact_sales tương ứng
"""
import os, sys
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.getenv(
    "DATABASE_URL",
    "Host=localhost;Port=5432;Database=sales_analytics_ai_db;Username=postgres;Password=021204"
)

def parse_conn_str(s: str) -> dict:
    """Parse ASP.NET connection string hoặc libpq URL."""
    if s.startswith("postgresql://") or s.startswith("postgres://"):
        return {"dsn": s}
    mapping = {"Host": "host", "Port": "port", "Database": "dbname",
                "Username": "user", "Password": "password"}
    params = {}
    for part in s.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        if k.strip() in mapping:
            params[mapping[k.strip()]] = v.strip()
    return params

def get_conn():
    cfg = parse_conn_str(DB_URL)
    if "dsn" in cfg:
        return psycopg2.connect(cfg["dsn"])
    return psycopg2.connect(**cfg)

# ── đọc connection string từ appsettings.Development.json ──────────────────
import json, pathlib

def load_conn_from_appsettings() -> str | None:
    p = pathlib.Path(__file__).parent.parent / "backend" / "SalesAnalytics.API" / "appsettings.Development.json"
    if not p.exists():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8-sig"))
        return data.get("ConnectionStrings", {}).get("DefaultConnection")
    except Exception:
        return None

cs = load_conn_from_appsettings()
if cs:
    DB_URL = cs

# ───────────────────────────────────────────────────────────────────────────

def main():
    conn = get_conn()
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── 1. Tìm 32 đơn cần xóa ─────────────────────────────────────
            cur.execute("""
                SELECT order_id, external_order_id, status, customer_id
                FROM public.orders
                WHERE external_order_id IS NULL
                   OR external_order_id = ''
                ORDER BY order_id
            """)
            bad_orders = cur.fetchall()
            bad_ids = [r["order_id"] for r in bad_orders]

            print(f"Tim thay {len(bad_ids)} don can xoa: {bad_ids[:10]}{'...' if len(bad_ids)>10 else ''}")

            if not bad_ids:
                print("Khong co don can xoa.")
            else:
                # ── 2. Lưu customer_id của các đơn xóa để check orphan ──
                affected_customer_ids = list({r["customer_id"] for r in bad_orders if r["customer_id"]})
                print(f"Customer lien quan: {len(affected_customer_ids)} khach")

                # ── 3. Xóa các bảng có FK -> orders ─────────────────────
                fk_tables = ["order_items", "loyalty_points", "payment_transactions", "sales_data"]
                for tbl in fk_tables:
                    cur.execute(f"DELETE FROM public.{tbl} WHERE order_id = ANY(%s)", (bad_ids,))
                    if cur.rowcount > 0:
                        print(f"Da xoa {cur.rowcount} rows tu {tbl}")

                # ── 4. Xóa reviews nếu có ─────────────────────────────────
                cur.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema='public' AND table_name='reviews'
                    )
                """)
                if cur.fetchone()["exists"]:
                    cur.execute("DELETE FROM public.reviews WHERE order_id = ANY(%s)", (bad_ids,))
                    if cur.rowcount > 0:
                        print(f"Da xoa {cur.rowcount} reviews")

                # ── 5. Xóa orders ─────────────────────────────────────────
                cur.execute("DELETE FROM public.orders WHERE order_id = ANY(%s)", (bad_ids,))
                print(f"Da xoa {cur.rowcount} orders")

                # ── 6. Xóa orphan customers (không còn đơn nào) ──────────
                if affected_customer_ids:
                    cur.execute("""
                        DELETE FROM public.customers
                        WHERE customer_id = ANY(%s)
                          AND NOT EXISTS (
                              SELECT 1 FROM public.orders o
                              WHERE o.customer_id = customers.customer_id
                          )
                    """, (affected_customer_ids,))
                    print(f"Da xoa {cur.rowcount} orphan customers")

                # ── 7. Xóa fact_sales tương ứng ──────────────────────────
                fake_external_ids = [f"ORDER_{oid}" for oid in bad_ids]
                cur.execute(
                    "DELETE FROM dw.fact_sales WHERE external_order_id = ANY(%s)",
                    (fake_external_ids,)
                )
                print(f"Da xoa {cur.rowcount} fact_sales rows")

            # ── 8. Chuẩn hóa payment_method ───────────────────────────────
            normalizations = [
                ("COD",           ["Cash on Delivery", "CashOnDelivery", "cod"]),
                ("MOMO",          ["Momo", "Ví MoMo", "momo"]),
                ("VNPAY",         ["VNPay", "vnpay"]),
                ("BANK_TRANSFER", ["BankTransfer", "Bank Transfer", "bank_transfer"]),
            ]
            total_normalized = 0
            for target, sources in normalizations:
                cur.execute(
                    "UPDATE public.orders SET payment_method = %s WHERE payment_method = ANY(%s)",
                    (target, sources)
                )
                n = cur.rowcount
                total_normalized += n
                if n > 0:
                    print(f"  payment_method: {sources} -> '{target}' ({n} rows)")
            print(f"Tong chuan hoa payment_method: {total_normalized} rows")

            # ── 9. Kiểm tra kết quả ───────────────────────────────────────
            cur.execute("SELECT COUNT(*) AS cnt FROM public.orders")
            total_orders = cur.fetchone()["cnt"]

            cur.execute("""
                SELECT payment_method, COUNT(*) AS cnt
                FROM public.orders
                GROUP BY payment_method
                ORDER BY cnt DESC
            """)
            pm_rows = cur.fetchall()

            cur.execute("""
                SELECT COUNT(*) AS cnt FROM public.orders
                WHERE external_order_id IS NULL OR external_order_id = ''
            """)
            remaining_fake = cur.fetchone()["cnt"]

            print(f"\n=== KET QUA ===")
            print(f"Tong don hang con lai: {total_orders}")
            print(f"Don khong co external_order_id: {remaining_fake}")
            print("Payment method breakdown:")
            for r in pm_rows:
                print(f"  {r['payment_method'] or 'NULL':20s}  {r['cnt']}")

        conn.commit()
        print("\nHoan tat -- da commit.")

    except Exception as e:
        conn.rollback()
        print(f"LOI: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
