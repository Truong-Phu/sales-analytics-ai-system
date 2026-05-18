#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_sample_ghn.py
Import GHN tracking data → cập nhật tracking_number và shipping_status
cho các đơn hàng tương ứng trong public.orders.
Chạy: python import_sample_ghn.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from import_common import get_conn, get_company_id

BASE = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sample-data", "ghn")
GHN_FILE = os.path.join(BASE, "ghn_orders.json")

# Map GHN status → MSAS shipping_status
GHN_TO_SHIP = {
    "picking":      "NOT_SHIPPED",
    "picked":       "NOT_SHIPPED",
    "storing":      "NOT_SHIPPED",
    "transporting": "IN_TRANSIT",
    "delivering":   "IN_TRANSIT",
    "delivered":    "DELIVERED",
    "return":       "FAILED",
    "cancel":       "NOT_SHIPPED",
}


def main():
    if not os.path.exists(GHN_FILE):
        print(f"Khong tim thay {GHN_FILE}. Chay generate_sample_data.py truoc!")
        return

    with open(GHN_FILE, encoding="utf-8") as f:
        data = json.load(f)

    records = data.get("data", [])
    print(f"[GHN] Doc {len(records)} tracking records...")

    conn = get_conn()
    cur  = conn.cursor()
    company_id = get_company_id(cur)

    updated = skipped = 0
    for rec in records:
        ghn_code         = rec.get("order_code", "")
        client_code      = str(rec.get("client_order_code", ""))
        ghn_status       = rec.get("status", "delivered")
        ship_status      = GHN_TO_SHIP.get(ghn_status, "IN_TRANSIT")

        # Tìm order theo external_order_id hoặc order_code
        cur.execute("""
            SELECT order_id FROM public.orders
            WHERE company_id = %s
              AND (
                external_order_id LIKE %s
                OR order_code = %s
              )
            LIMIT 1
        """, (company_id, f"%{client_code}%", client_code))
        row = cur.fetchone()
        if not row:
            skipped += 1
            continue

        order_id = row[0]
        cur.execute("""
            UPDATE public.orders
            SET shipping_status = %s,
                updated_at      = NOW()
            WHERE order_id = %s
        """, (ship_status, order_id))
        updated += 1

        if (updated + skipped) % 100 == 0:
            conn.commit()

    conn.commit()
    print(f"[GHN] XONG: {updated} don cap nhat tracking, {skipped} bo qua")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
