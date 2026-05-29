#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed_today_orders.py
Tạo đơn hàng demo cho ngày hôm nay bằng sản phẩm thật từ DB.
Mục đích: đảm bảo dashboard luôn có dữ liệu ngày hiện tại.

Chạy: python src/etl/seed_today_orders.py
"""
import json
import pathlib
import random
import string
from datetime import datetime, timezone, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor


TODAY = datetime.now(timezone(timedelta(hours=7)))  # Asia/Ho_Chi_Minh

VN_NAMES = [
    "Nguyễn Văn An", "Trần Thị Bình", "Lê Minh Đức", "Phạm Thu Hà",
    "Hoàng Quốc Khải", "Ngô Thị Lan", "Vũ Đức Mạnh", "Đinh Thị Nga",
    "Bùi Văn Phong", "Đặng Thị Quỳnh",
]
VN_PHONES = [
    "0901234567", "0912345678", "0923456789", "0934567890",
    "0945678901", "0956789012", "0967890123",
]
CHANNELS = {
    "SHOPEE":  ("SHP", "PAID",   "DELIVERED"),
    "TIKTOK":  ("TTK", "PAID",   "IN_TRANSIT"),
    "LAZADA":  ("LZD", "UNPAID", "NOT_SHIPPED"),
    "OFFLINE": ("POS", "PAID",   "NOT_SHIPPED"),
}
PAY_METHODS = ["COD", "BANK_TRANSFER", "MOMO", "VNPAY"]
STATUSES = ["DELIVERED", "CONFIRMED", "SHIPPING", "PENDING"]


def rand_str(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def load_conn_params() -> dict:
    p = pathlib.Path(__file__).parent.parent / "backend" / "SalesAnalytics.API" / "appsettings.Development.json"
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8-sig"))
            cs = data.get("ConnectionStrings", {}).get("DefaultConnection", "")
            m = {"Host": "host", "Port": "port", "Database": "dbname", "Username": "user", "Password": "password"}
            params = {}
            for part in cs.split(";"):
                if "=" not in part:
                    continue
                k, v = part.split("=", 1)
                if k.strip() in m:
                    params[m[k.strip()]] = v.strip()
            if params:
                return params
        except Exception:
            pass
    return {"host": "localhost", "port": "5432", "dbname": "sales_analytics_ai_db",
            "user": "postgres", "password": "021204"}


def main():
    conn = psycopg2.connect(**load_conn_params())
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── Lấy thông tin company ──────────────────────────────────────
            cur.execute("SELECT id FROM public.companies WHERE email = 'contact@phuthinh.vn' LIMIT 1")
            row = cur.fetchone()
            if not row:
                print("Khong tim thay company Phu Thinh. Chay seed truoc.")
                return
            company_id = str(row["id"])

            # ── Lấy channels ──────────────────────────────────────────────
            cur.execute("""
                SELECT channel_id, channel_type FROM public.sales_channels
                WHERE company_id = %s::uuid AND is_active = TRUE
            """, (company_id,))
            channels = {r["channel_type"]: r["channel_id"] for r in cur.fetchall()}

            if not channels:
                print("Khong co channel nao. Chay seed channel truoc.")
                return

            # ── Lấy sản phẩm thật ─────────────────────────────────────────
            cur.execute("""
                SELECT product_id, product_name, sku, base_price
                FROM public.products
                WHERE company_id = %s::uuid
                  AND is_active = TRUE
                  AND sku NOT LIKE 'TEST-%%'
                ORDER BY RANDOM()
                LIMIT 30
            """, (company_id,))
            products = cur.fetchall()

            if not products:
                print("Khong co san pham that nao trong DB.")
                return

            # ── Lấy customers ─────────────────────────────────────────────
            cur.execute("""
                SELECT customer_id FROM public.customers
                WHERE company_id = %s::uuid
                LIMIT 50
            """, (company_id,))
            customers = [r["customer_id"] for r in cur.fetchall()]

            # ── Kiểm tra đã có đơn hôm nay chưa ──────────────────────────
            cur.execute("""
                SELECT COUNT(*) AS cnt FROM public.orders
                WHERE company_id = %s::uuid
                  AND DATE(order_date AT TIME ZONE 'Asia/Ho_Chi_Minh') = %s
                  AND order_code NOT LIKE 'ORD-TC%%'
                  AND order_code NOT LIKE 'POS-TC%%'
            """, (company_id, TODAY.date()))
            existing = cur.fetchone()["cnt"]

            if existing >= 5:
                print(f"Da co {existing} don hang hom nay ({TODAY.date()}). Khong them nua.")
                return

            n_to_create = max(0, 8 - existing)
            print(f"Hom nay {TODAY.date()} co {existing} don, them {n_to_create} don moi...")

            # ── Tạo đơn hàng ──────────────────────────────────────────────
            created = 0
            channel_list = list(channels.items())

            for i in range(n_to_create):
                channel_type, channel_id = random.choice(channel_list)
                prod = random.choice(products)
                qty = random.choices([1, 2, 3], weights=[70, 25, 5])[0]
                unit_price = prod["base_price"]
                discount = 0
                ship_fee = random.choice([0, 25000, 30000]) if channel_type != "OFFLINE" else 0
                subtotal = unit_price * qty
                total = subtotal - discount + ship_fee

                hour = random.randint(8, 22)
                minute = random.randint(0, 59)
                order_time = TODAY.replace(hour=hour, minute=minute, second=random.randint(0, 59))

                prefix = CHANNELS.get(channel_type, ("ORD",))[0]
                order_code = f"{prefix}-{TODAY.strftime('%Y%m%d')}-{rand_str(5)}"
                ext_id = f"{channel_type}-{TODAY.strftime('%Y%m%d')}-{rand_str(8)}"

                status_map = {
                    "SHOPEE":  random.choice(["DELIVERED", "CONFIRMED", "SHIPPING"]),
                    "TIKTOK":  random.choice(["DELIVERED", "SHIPPING", "CONFIRMED"]),
                    "LAZADA":  random.choice(["CONFIRMED", "PENDING", "SHIPPING"]),
                    "OFFLINE": "DELIVERED",
                }
                status = status_map.get(channel_type, "CONFIRMED")
                pay_method = random.choice(PAY_METHODS)
                shipping_status = "DELIVERED" if status == "DELIVERED" else (
                    "IN_TRANSIT" if status == "SHIPPING" else "NOT_SHIPPED"
                )
                # Đơn mới tạo hôm nay → UNPAID (advance sẽ tự chuyển PAID sau 1 ngày)
                payment_status = "UNPAID"
                customer_id = random.choice(customers) if customers else None

                # Tạo mã vận đơn giả cho đơn đang vận chuyển / đã giao
                tracking = None
                if status in ("SHIPPING", "DELIVERED"):
                    tracking = f"GHN-{TODAY.strftime('%Y%m')}-{rand_str(8)}"

                # Thời gian giao thực tế (chỉ khi đã giao)
                delivered_at = order_time if status == "DELIVERED" else None

                cur.execute("""
                    INSERT INTO public.orders (
                        order_code, customer_id, channel_id, order_date,
                        status, total_amount, discount_amount, shipping_fee,
                        payment_status, shipping_status, payment_method,
                        tracking_number, delivered_at,
                        external_order_id, is_stock_deducted, company_id,
                        created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s, %s::uuid,
                        NOW(), NOW()
                    ) ON CONFLICT (external_order_id) DO NOTHING
                    RETURNING order_id
                """, (
                    order_code, customer_id, channel_id, order_time,
                    status, total, discount, ship_fee,
                    payment_status, shipping_status, pay_method,
                    tracking, delivered_at,
                    ext_id, True, company_id,
                ))
                row = cur.fetchone()
                if not row:
                    continue
                order_id = row["order_id"]

                cur.execute("""
                    INSERT INTO public.order_items (
                        order_id, product_id, product_name, sku,
                        quantity, unit_price, sale_price, subtotal, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, (
                    order_id, prod["product_id"], prod["product_name"], prod["sku"],
                    qty, unit_price, unit_price, subtotal,
                ))

                created += 1
                print(f"  [{i+1}] {order_code} | {channel_type} | {prod['product_name'][:35]} x{qty} | {status}")

        conn.commit()
        print(f"\nHoan tat — da tao {created} don hang moi cho ngay {TODAY.date()}.")

    except Exception as e:
        conn.rollback()
        print(f"LOI: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
