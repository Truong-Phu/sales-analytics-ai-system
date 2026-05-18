#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""import_sample_tiktok.py — Import du lieu mau TikTok Shop."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from import_common import (
    get_conn, get_company_id, get_channel_id, get_category_map,
    map_tiktok_status, norm_payment, parse_ts,
    upsert_products, upsert_customer, insert_order, insert_order_items,
    trigger_etl_after_import,
)
from generate_sample_data import PRODUCTS, TIKTOK_SKUS

BASE = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sample-data", "tiktok")
ORDER_FILES = [
    os.path.join(BASE, "tiktok_orders_2024_q3.json"),
    os.path.join(BASE, "tiktok_orders_2024_q4.json"),
    os.path.join(BASE, "tiktok_orders_2025_h1.json"),
    os.path.join(BASE, "tiktok_orders_2025_h2_to_now.json"),
]

# Map string status mới (TikTok Open Platform chuẩn)
_TT_STATUS_MAP = {
    "COMPLETED":          ("DELIVERED", "PAID",     "DELIVERED"),
    "DELIVERED":          ("DELIVERED", "PAID",     "DELIVERED"),
    "IN_TRANSIT":         ("SHIPPING",  "UNPAID",   "IN_TRANSIT"),
    "AWAITING_COLLECTION":("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
    "AWAITING_SHIPMENT":  ("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
    "ON_HOLD":            ("PENDING",   "UNPAID",   "NOT_SHIPPED"),
    "UNPAID":             ("PENDING",   "UNPAID",   "NOT_SHIPPED"),
    "CANCELLED":          ("CANCELLED", "UNPAID",   "NOT_SHIPPED"),
    "RETURNED":           ("RETURNED",  "REFUNDED", "DELIVERED"),
}


def main():
    conn = get_conn()
    cur = conn.cursor()

    company_id = get_company_id(cur)
    channel_id = get_channel_id(cur, "TIKTOK_SHOP")
    cat_map = get_category_map(cur)

    prods = [
        {"sku": p["sku"], "name": p["name"], "desc": p["desc"],
         "base_price": p["base_price"], "cost": p["cost"],
         "stock": p["stock"], "category": p["category"]}
        for p in PRODUCTS if p["sku"] in TIKTOK_SKUS
    ]
    prod_map = upsert_products(cur, prods, company_id, cat_map)
    conn.commit()
    print(f"[TikTok] San pham: {len(prod_map)} SP da upsert")

    total_orders = 0
    total_items = 0

    for fpath in ORDER_FILES:
        if not os.path.exists(fpath):
            print(f"  Khong tim thay {fpath}")
            continue
        with open(fpath, encoding="utf-8") as f:
            data = json.load(f)

        # Hỗ trợ cả format cũ (orders[]) và mới (data.orders[])
        raw = data.get("data", data)
        orders_list = raw.get("orders", []) if isinstance(raw, dict) else []

        ok = skip = err = 0
        for i, o in enumerate(orders_list):
            try:
                addr = o.get("recipient_address", {})
                full_name = addr.get("name", "Khach hang")
                phone     = addr.get("phone_number", "")

                # district_info: hỗ trợ cả array (mới) và dict (cũ)
                di = addr.get("district_info", {})
                if isinstance(di, list):
                    province = next((x["address_name"] for x in di if x.get("address_level") == "L1"), "")
                    district = next((x["address_name"] for x in di if x.get("address_level") == "L2"), "")
                else:
                    province = di.get("address_level1", "")
                    district = di.get("address_level2", "")
                address = addr.get("full_address", addr.get("address_detail", ""))

                cid = upsert_customer(cur, full_name, phone, province,
                                      district, address, company_id)

                # Status: hỗ trợ cả string mới và int cũ
                raw_status = o.get("status", o.get("order_status", 100))
                if isinstance(raw_status, int):
                    status, pay_st, ship_st = map_tiktok_status(raw_status)
                else:
                    status, pay_st, ship_st = _TT_STATUS_MAP.get(
                        str(raw_status).upper(), ("PENDING", "UNPAID", "NOT_SHIPPED")
                    )

                # payment: hỗ trợ cả payment (mới) và payment_info (cũ)
                pi = o.get("payment", o.get("payment_info", {}))
                payment = norm_payment(pi.get("payment_method_name", o.get("payment_method_name", "COD")))
                order_date = parse_ts(o.get("create_time", 0))

                total    = float(pi.get("total_amount", 0))
                shipping = float(pi.get("shipping_fee", pi.get("actual_shipping_fee", 0)))
                discount = float(pi.get("seller_discount", 0)) + float(pi.get("platform_discount", 0))

                # order ID: mới dùng "id", cũ dùng "order_id"
                order_id_raw = o.get("id", o.get("order_id", ""))
                ext_id     = f"TIKTOK_{order_id_raw}"
                order_code = f"TK-{str(order_id_raw)[-10:]}"

                oid = insert_order(
                    cur, order_code, ext_id, cid, channel_id, company_id,
                    status, pay_st, ship_st,
                    total, discount, shipping, payment, order_date,
                )
                if oid:
                    items = []
                    for li in o.get("line_items", []):
                        sku = li.get("seller_sku", "")
                        # Lay parent SKU (3 phan dau)
                        parent = "-".join(sku.split("-")[:3])
                        items.append({
                            "sku": parent,
                            "quantity": li.get("quantity", 1),
                            "unit_price": float(li.get("sale_price", 0)),
                            "discount": 0,
                        })
                    insert_order_items(cur, oid, items, prod_map)
                    total_items += len(items)
                    ok += 1
                else:
                    skip += 1

                if (i + 1) % 50 == 0:
                    conn.commit()

            except Exception as e:
                err += 1
                print(f"  [!] Don {i}: {e}")
                conn.rollback()
                cur = conn.cursor()
                company_id = get_company_id(cur)
                channel_id = get_channel_id(cur, "TIKTOK_SHOP")
                cur.execute("SELECT sku, product_id FROM public.products WHERE company_id = %s", (company_id,))
                for r in cur.fetchall(): prod_map[r[0]] = r[1]

        conn.commit()
        total_orders += ok
        print(f"  {os.path.basename(fpath)}: {ok} them, {skip} trung lap, {err} loi")

    print(f"[TikTok] XONG: {total_orders} don hang, {total_items} items")
    cur.close()
    conn.close()

    trigger_etl_after_import(company_id, "TIKTOK_SHOP")


if __name__ == "__main__":
    if "--file" in sys.argv:
        idx = sys.argv.index("--file")
        if idx + 1 < len(sys.argv):
            extra = sys.argv[idx + 1]
            if extra not in ORDER_FILES:
                ORDER_FILES.append(extra)
    main()
