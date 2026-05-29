#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fix_test_products.py
Re-assign order_items đang tham chiếu sản phẩm TEST-PHASE1-xxxxx sang sản phẩm thật.
Sau đó xóa các sản phẩm test còn sót.

Chạy: python src/etl/fix_test_products.py
"""
import json
import pathlib
import random
import psycopg2
from psycopg2.extras import RealDictCursor


def load_conn_str() -> dict:
    p = pathlib.Path(__file__).parent.parent / "backend" / "SalesAnalytics.API" / "appsettings.Development.json"
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8-sig"))
            cs = data.get("ConnectionStrings", {}).get("DefaultConnection", "")
            if cs:
                mapping = {"Host": "host", "Port": "port", "Database": "dbname",
                           "Username": "user", "Password": "password"}
                params = {}
                for part in cs.split(";"):
                    part = part.strip()
                    if "=" not in part:
                        continue
                    k, v = part.split("=", 1)
                    if k.strip() in mapping:
                        params[mapping[k.strip()]] = v.strip()
                if params:
                    return params
        except Exception:
            pass
    return {"host": "localhost", "port": "5432", "dbname": "sales_analytics_ai_db",
            "user": "postgres", "password": "021204"}


def main():
    conn = psycopg2.connect(**load_conn_str())
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── 1. Tìm tất cả sản phẩm TEST-PHASE1 còn trong DB ───────────
            cur.execute("""
                SELECT product_id, sku, product_name, company_id
                FROM public.products
                WHERE sku LIKE 'TEST-PHASE1-%'
                ORDER BY sku
            """)
            test_products = cur.fetchall()

            if not test_products:
                print("Không tìm thấy sản phẩm TEST-PHASE1 nào trong database. Hoàn tất.")
                return

            test_ids = [p["product_id"] for p in test_products]
            print(f"Tìm thấy {len(test_products)} sản phẩm TEST-PHASE1:")
            for p in test_products:
                print(f"  {p['sku']} — {p['product_name']} (id={p['product_id']})")
            print()

            # ── 2. Lấy sản phẩm thật theo từng company ────────────────────
            company_ids = list({str(p["company_id"]) for p in test_products})
            real_products_by_company: dict[str, list] = {}

            for cid in company_ids:
                cur.execute("""
                    SELECT product_id, product_name, sku, base_price
                    FROM public.products
                    WHERE company_id = %s::uuid
                      AND sku NOT LIKE 'TEST-%%'
                      AND is_active = TRUE
                    ORDER BY product_id
                """, (cid,))
                reals = cur.fetchall()
                real_products_by_company[cid] = reals
                print(f"Company {cid}: {len(reals)} sản phẩm thật có thể dùng")

            # ── 3. Tìm order_items tham chiếu sản phẩm test ───────────────
            cur.execute("""
                SELECT oi.item_id, oi.order_id, oi.product_id, oi.quantity,
                       oi.unit_price, oi.subtotal,
                       p.company_id
                FROM public.order_items oi
                JOIN public.products p ON p.product_id = oi.product_id
                WHERE oi.product_id = ANY(%s)
            """, (test_ids,))
            affected_items = cur.fetchall()

            print(f"\nTìm thấy {len(affected_items)} order_items tham chiếu sản phẩm test")

            if not affected_items:
                print("Không có order_items nào cần re-assign.")
            else:
                # ── 4. Re-assign từng order_item sang sản phẩm thật ───────
                reassigned = 0
                skipped = 0

                for item in affected_items:
                    cid = str(item["company_id"])
                    candidates = real_products_by_company.get(cid, [])

                    if not candidates:
                        print(f"  SKIP order_item {item['order_item_id']}: không có sản phẩm thật nào cho company {cid}")
                        skipped += 1
                        continue

                    # Chọn sản phẩm thật ngẫu nhiên
                    new_prod = random.choice(candidates)
                    new_price = new_prod["base_price"]
                    new_subtotal = new_price * item["quantity"]

                    cur.execute("""
                        UPDATE public.order_items
                        SET product_id   = %s,
                            product_name = %s,
                            sku          = %s,
                            unit_price   = %s,
                            sale_price   = %s,
                            subtotal     = %s
                        WHERE item_id = %s
                    """, (new_prod["product_id"], new_prod["product_name"], new_prod["sku"],
                          new_price, new_price, new_subtotal, item["item_id"]))

                    reassigned += 1

                print(f"Re-assigned: {reassigned}, Skipped: {skipped}")

                # ── 5. Cập nhật total_amount của các orders bị ảnh hưởng ──
                order_ids = list({item["order_id"] for item in affected_items})
                cur.execute("""
                    UPDATE public.orders o
                    SET total_amount = (
                        SELECT COALESCE(SUM(oi.subtotal), 0)
                        FROM public.order_items oi
                        WHERE oi.order_id = o.order_id
                    ),
                    updated_at = NOW()
                    WHERE o.order_id = ANY(%s)
                """, (order_ids,))
                print(f"Cập nhật total_amount cho {cur.rowcount} orders")

            # ── 6. Xóa các bảng FK trước khi xóa products ────────────────
            for tbl in ["inventory_transactions", "stock_adjustments", "procurement_items"]:
                cur.execute(f"""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema='public' AND table_name='{tbl}'
                    )
                """)
                if cur.fetchone()["exists"]:
                    cur.execute(f"DELETE FROM public.{tbl} WHERE product_id = ANY(%s)", (test_ids,))
                    if cur.rowcount > 0:
                        print(f"\nXóa {cur.rowcount} rows từ {tbl}")
            print()

            # ── 7. Xóa sản phẩm TEST-PHASE1 ───────────────────────────────
            # Kiểm tra còn FK nào không
            cur.execute("""
                SELECT COUNT(*) AS cnt FROM public.order_items
                WHERE product_id = ANY(%s)
            """, (test_ids,))
            remaining_refs = cur.fetchone()["cnt"]

            if remaining_refs > 0:
                print(f"CẢNH BÁO: Vẫn còn {remaining_refs} order_items tham chiếu — không xóa sản phẩm test.")
            else:
                cur.execute("""
                    DELETE FROM public.products
                    WHERE product_id = ANY(%s)
                """, (test_ids,))
                print(f"Xóa {cur.rowcount} sản phẩm TEST-PHASE1")

            # ── 8. Kiểm tra kết quả cuối ───────────────────────────────────
            cur.execute("""
                SELECT COUNT(*) AS cnt FROM public.products
                WHERE sku LIKE 'TEST-PHASE1-%'
            """)
            remaining = cur.fetchone()["cnt"]
            print(f"\nSản phẩm TEST-PHASE1 còn lại: {remaining}")

        conn.commit()
        print("\nHoàn tất — đã commit.")

    except Exception as e:
        conn.rollback()
        print(f"LỖI: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
