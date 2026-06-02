# -*- coding: utf-8 -*-
"""
seed_orders.py — Tạo thêm đơn hàng lịch sử để cải thiện đánh giá Prophet.

Mục tiêu:
- TikTok (17): giảm từ 312 ngày trống → ~50 (hiện 388/700 active)
- Lazada (18): giảm từ 387 ngày trống → ~50 (hiện 313/700 active)
- Shopee (16): giảm từ 174 ngày trống → ~30 (hiện 526/700 active)
- POS   (19): giữ nguyên (cửa hàng đóng cửa ngày lễ là bình thường)

Quy trình:
  1. Nhập thêm hàng (inventory_transactions type=PURCHASE) để có đủ kho
  2. Tạo đơn hàng DELIVERED cho các ngày thiếu + ngày thưa đơn
  3. Trừ kho + ghi inventory_transactions type=SALE
"""

import os
import random
from datetime import date, datetime, timedelta

import psycopg2
from psycopg2.extras import execute_values

# ── Cấu hình ─────────────────────────────────────────────────────────────────

DB_URL = os.getenv("DATABASE_URL",
    "host=localhost port=5432 dbname=sales_analytics_ai_db user=postgres password=021204")

COMPANY_ID  = "89ab1a10-64d2-49f3-9b28-811274d4ca37"
START_DATE  = date(2024, 7, 1)
END_DATE    = date(2026, 5, 31)

CHANNELS = {
    16: {"name": "Shopee",  "code": "SPE", "type": "shopee",  "payment": ["COD", "ShopeePay"]},
    17: {"name": "TikTok",  "code": "TTK", "type": "tiktok",  "payment": ["COD", "TikTokPay"]},
    18: {"name": "Lazada",  "code": "LZD", "type": "lazada",  "payment": ["COD", "Online"]},
    19: {"name": "POS",     "code": "POS", "type": "pos",     "payment": ["Cash", "VietQR"]},
}

# Ngày chiến dịch cao điểm (spike)
CAMPAIGN_DAYS: set[date] = set()
for y in [2024, 2025]:
    CAMPAIGN_DAYS.update([
        date(y, 11, 9), date(y, 11, 10), date(y, 11, 11), date(y, 11, 12),  # 11.11
        date(y, 12, 11), date(y, 12, 12), date(y, 12, 13),                   # 12.12
        date(y, 11, 28), date(y, 11, 29), date(y, 11, 30),                   # Black Friday
    ])
CAMPAIGN_DAYS.update([
    date(2025, 1, 27), date(2025, 1, 28), date(2025, 1, 29), date(2025, 1, 30),  # Tết 2025
    date(2026, 1, 15), date(2026, 1, 16), date(2026, 1, 17), date(2026, 1, 18),  # Tết 2026
    date(2025, 3, 8), date(2025, 4, 30), date(2025, 5, 1),
    date(2025, 6, 1), date(2025, 12, 25), date(2024, 12, 25),
])

# Ngày mục tiêu: sau khi thêm, muốn ngày nào cũng có đơn (trừ lễ lớn)
SKIP_DAYS: set[date] = {                # Ngày nghỉ TMĐT ít hoạt động
    date(2025, 1, 28), date(2025, 1, 29),   # Tết nghỉ giao vận
}

TARGET_ZERO_PCT = {16: 0.04, 17: 0.07, 18: 0.07, 19: None}  # None = không thêm


# ── Helpers ───────────────────────────────────────────────────────────────────

def rand_hour_for_channel(ch_id: int) -> int:
    if ch_id == 19:   # POS: giờ hành chính
        return random.choices(range(8, 21), weights=[2,3,4,5,5,5,4,5,5,4,3,2,1], k=1)[0]
    return random.choices(range(0, 24), weights=[
        1,1,1,1,1,1, 2,3,4,5,6,6, 6,5,5,5,6,7, 8,7,6,5,3,2
    ], k=1)[0]


def orders_per_day(d: date, ch_id: int, existing: int) -> int:
    """Số đơn cần thêm cho ngày d, kênh ch_id (existing = đơn đã có)."""
    is_weekend  = d.weekday() >= 5
    is_campaign = d in CAMPAIGN_DAYS

    base_map = {
        16: (3, 5) if is_weekend else (2, 4),
        17: (2, 4) if is_weekend else (1, 3),
        18: (2, 3) if is_weekend else (1, 3),
        19: (4, 8) if is_weekend else (3, 6),
    }
    lo, hi = base_map[ch_id]
    target = random.randint(lo, hi)
    if is_campaign:
        target = target * random.randint(2, 3)
    return max(0, target - existing)


def pick_products(products: list[dict], n_items: int) -> list[dict]:
    """Chọn ngẫu nhiên n_items sản phẩm (có thể trùng nếu ít sp)."""
    chosen = random.choices(products, k=n_items)
    # Gom trùng
    grouped: dict[int, dict] = {}
    for p in chosen:
        pid = p["product_id"]
        if pid not in grouped:
            grouped[pid] = {**p, "qty": 0}
        grouped[pid]["qty"] += random.randint(1, 2)
    return list(grouped.values())


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur  = conn.cursor()

    print("=" * 60)
    print("Seed Orders — MSAS")
    print("=" * 60)

    # 1. Load reference data
    cur.execute("SELECT customer_id FROM public.customers LIMIT 500")
    customer_ids = [r[0] for r in cur.fetchall()]

    cur.execute("""
        SELECT product_id, product_name, base_price, cost_price, stock_quantity
        FROM public.products WHERE is_active = true
    """)
    products = [
        {"product_id": r[0], "product_name": r[1],
         "base_price": float(r[2]), "cost_price": float(r[3]), "stock": r[4]}
        for r in cur.fetchall()
    ]
    print(f"  Products: {len(products)} | Customers: {len(customer_ids)}")

    # 2. Lấy current max order_id và order_code suffix counter
    cur.execute("SELECT MAX(order_id) FROM public.orders")
    max_order_id = cur.fetchone()[0] or 0

    cur.execute("SELECT MAX(item_id) FROM public.order_items")
    max_item_id = cur.fetchone()[0] or 0

    cur.execute("SELECT MAX(transaction_id) FROM public.inventory_transactions")
    max_txn_id = cur.fetchone()[0] or 0

    order_id_counter = max_order_id + 1
    item_id_counter  = max_item_id  + 1
    txn_id_counter   = max_txn_id   + 1

    # 3. Bổ sung tồn kho trước (nhập 5000 đơn vị cho mỗi sản phẩm)
    print("\n[1] Bổ sung tồn kho...")
    txn_rows   = []
    stock_map  = {p["product_id"]: p["stock"] for p in products}

    for p in products:
        restock_qty = 5000
        before = stock_map[p["product_id"]]
        after  = before + restock_qty
        stock_map[p["product_id"]] = after
        txn_rows.append((
            txn_id_counter, COMPANY_ID, p["product_id"],
            "PURCHASE", restock_qty, before, after,
            "PURCHASE_ORDER", None,
            "Nhập thêm hàng để đủ dữ liệu đánh giá hệ thống",
            datetime(2024, 6, 30, 8, 0, 0),
        ))
        txn_id_counter += 1

    execute_values(cur, """
        INSERT INTO public.inventory_transactions
            (transaction_id, company_id, product_id, transaction_type, quantity_change,
             before_stock, after_stock, reference_type, reference_id, note, created_at)
        VALUES %s
    """, txn_rows)

    # Cập nhật stock_quantity trong products
    for p in products:
        cur.execute(
            "UPDATE public.products SET stock_quantity = %s WHERE product_id = %s",
            (stock_map[p["product_id"]], p["product_id"])
        )
    conn.commit()
    print(f"  Đã nhập thêm 5,000 đơn vị/sản phẩm cho {len(products)} sản phẩm")

    # 4. Load existing orders per day per channel
    cur.execute("""
        SELECT channel_id, DATE(order_date) AS d, COUNT(*) AS cnt
        FROM public.orders
        WHERE status NOT IN ('CANCELLED','RETURNED')
        GROUP BY channel_id, DATE(order_date)
    """)
    existing: dict[tuple, int] = {}
    for ch_id, d, cnt in cur.fetchall():
        existing[(ch_id, d)] = cnt

    # 5. Sinh đơn hàng
    print("\n[2] Sinh đơn hàng...")
    all_dates = [START_DATE + timedelta(days=i)
                 for i in range((END_DATE - START_DATE).days + 1)]

    order_rows = []
    item_rows  = []
    sale_txn_rows = []
    total_by_channel: dict[int, int] = {}

    for ch_id, ch_info in CHANNELS.items():
        if TARGET_ZERO_PCT[ch_id] is None:
            continue
        ch_orders = 0

        for d in all_dates:
            if d in SKIP_DAYS:
                continue
            cur_count = existing.get((ch_id, d), 0)
            to_add = orders_per_day(d, ch_id, cur_count)
            if to_add <= 0:
                continue

            for _ in range(to_add):
                # Chọn sản phẩm
                n_items = random.choices([1, 2, 3], weights=[60, 30, 10])[0]
                line_items = pick_products(
                    [p for p in products if stock_map[p["product_id"]] > 5],
                    n_items
                )
                if not line_items:
                    continue

                # Tính tiền
                subtotal = sum(p["base_price"] * p["qty"] for p in line_items)
                ship_fee = random.choice([0, 15000, 25000, 30000]) if ch_id != 19 else 0
                total    = subtotal + ship_fee

                # Thời gian đơn (random trong ngày)
                hour     = rand_hour_for_channel(ch_id)
                minute   = random.randint(0, 59)
                order_dt = datetime(d.year, d.month, d.day, hour, minute)

                cust_id  = random.choice(customer_ids)
                pay_method = random.choice(ch_info["payment"])
                order_code = f"ORD-{ch_info['code']}-{d.strftime('%Y%m%d')}-{order_id_counter:07d}"

                order_rows.append((
                    order_id_counter, order_code, cust_id, ch_id,
                    "DELIVERED", total, 0, ship_fee, subtotal,
                    pay_method, "PAID", "DELIVERED",
                    order_dt, order_dt + timedelta(days=random.randint(1, 5)),
                    COMPANY_ID, True,
                    ch_info["type"], "VND",
                ))

                # Order items
                for p in line_items:
                    disc = 0.0
                    item_rows.append((
                        item_id_counter, order_id_counter, p["product_id"], p["qty"],
                        p["base_price"], disc, p["base_price"] * p["qty"],
                        p["product_name"], "VND", order_dt,
                    ))
                    item_id_counter += 1

                    # Trừ kho
                    before = stock_map[p["product_id"]]
                    after  = max(0, before - p["qty"])
                    stock_map[p["product_id"]] = after
                    sale_txn_rows.append((
                        txn_id_counter, COMPANY_ID, p["product_id"],
                        "SALE", -p["qty"], before, after,
                        "ORDER", order_id_counter, None, order_dt,
                    ))
                    txn_id_counter += 1

                order_id_counter += 1
                ch_orders += 1

        total_by_channel[ch_id] = ch_orders
        print(f"  {ch_info['name']:8s}: +{ch_orders} đơn")

    # 6. Insert orders
    print(f"\n[3] Insert {len(order_rows):,} đơn hàng...")
    execute_values(cur, """
        INSERT INTO public.orders
            (order_id, order_code, customer_id, channel_id,
             status, total_amount, discount_amount, shipping_fee, subtotal,
             payment_method, payment_status, shipping_status,
             order_date, delivered_at,
             company_id, is_stock_deducted,
             channel_type, currency)
        VALUES %s
    """, order_rows, page_size=500)

    print(f"[4] Insert {len(item_rows):,} order items...")
    execute_values(cur, """
        INSERT INTO public.order_items
            (item_id, order_id, product_id, quantity,
             unit_price, discount, subtotal,
             product_name, currency, created_at)
        VALUES %s
    """, item_rows, page_size=500)

    print(f"[5] Insert {len(sale_txn_rows):,} inventory transactions...")
    execute_values(cur, """
        INSERT INTO public.inventory_transactions
            (transaction_id, company_id, product_id, transaction_type, quantity_change,
             before_stock, after_stock, reference_type, reference_id, note, created_at)
        VALUES %s
    """, sale_txn_rows, page_size=500)

    # 7. Cập nhật stock cuối cùng
    print("[6] Cập nhật stock_quantity...")
    for pid, qty in stock_map.items():
        cur.execute(
            "UPDATE public.products SET stock_quantity = %s WHERE product_id = %s",
            (qty, pid)
        )

    conn.commit()
    cur.close()
    conn.close()

    # Tóm tắt
    print("\n" + "=" * 60)
    print("KẾT QUẢ")
    print("=" * 60)
    total = sum(total_by_channel.values())
    for ch_id, cnt in total_by_channel.items():
        print(f"  {CHANNELS[ch_id]['name']:8s}: +{cnt:,} đơn")
    print(f"  TỔNG    : +{total:,} đơn")
    print(f"\n  Order items : +{len(item_rows):,}")
    print(f"  Inv txn     : +{len(sale_txn_rows):,} (sale) + {len(txn_rows)} (restock)")
    print("\nChạy lại train_prophet.py để cập nhật model.")


if __name__ == "__main__":
    main()
