#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""import_sample_lazada.py — Import du lieu mau Lazada."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from import_common import (
    get_conn, get_company_id, get_channel_id, get_category_map,
    map_lazada_status, norm_payment, parse_lzd_dt,
    upsert_products, upsert_customer, insert_order, insert_order_items,
)
from generate_sample_data import PRODUCTS, LAZADA_SKUS

BASE = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sample-data", "lazada")
ORDER_FILES = [
    os.path.join(BASE, "lazada_orders_2024_q4.json"),
    os.path.join(BASE, "lazada_orders_2025_q1.json"),
]


def main():
    conn = get_conn()
    cur = conn.cursor()

    company_id = get_company_id(cur)
    channel_id = get_channel_id(cur, "LAZADA")
    cat_map = get_category_map(cur)

    prods = [
        {"sku": p["sku"], "name": p["name"], "desc": p["desc"],
         "base_price": p["base_price"], "cost": p["cost"],
         "stock": p["stock"], "category": p["category"]}
        for p in PRODUCTS if p["sku"] in LAZADA_SKUS
    ]
    prod_map = upsert_products(cur, prods, company_id, cat_map)
    conn.commit()
    print(f"[Lazada] San pham: {len(prod_map)} SP da upsert")

    total_orders = 0
    total_items = 0

    for fpath in ORDER_FILES:
        if not os.path.exists(fpath):
            print(f"  Khong tim thay {fpath}")
            continue
        with open(fpath, encoding="utf-8") as f:
            data = json.load(f)

        ok = skip = err = 0
        for i, o in enumerate(data["orders"]):
            try:
                addr = o.get("address", {})
                first = addr.get("first_name", "")
                last  = addr.get("last_name", "")
                full_name = f"{first} {last}".strip() or "Khach hang"
                phone     = addr.get("phone", "")
                province  = addr.get("city", "")
                district  = addr.get("ward", addr.get("region", ""))
                address   = addr.get("address1", "")
                email     = addr.get("customer_email", None)

                cid = upsert_customer(cur, full_name, phone, province,
                                      district, address, company_id, email)

                order_status = o.get("status", "pending")
                status, pay_st, ship_st = map_lazada_status(order_status)
                payment = norm_payment(o.get("payment_method", "CashOnDelivery"))
                order_date = parse_lzd_dt(o.get("created_at", "2024-10-01 00:00:00 +0700"))

                total    = float(o.get("price", 0))
                shipping = float(o.get("shipping_fee", 0))
                # Lazada: tinh discount tu items
                discount = 0.0
                for it in o.get("items", []):
                    u = float(it.get("unit_price", 0))
                    p = float(it.get("paid_price", u))
                    discount += max(0, u - p)

                ext_id     = f"LAZADA_{o['order_id']}"
                order_code = o.get("order_number", f"LZD-{o['order_id']}")

                oid = insert_order(
                    cur, order_code, ext_id, cid, channel_id, company_id,
                    status, pay_st, ship_st,
                    total, discount, shipping, payment, order_date,
                )
                if oid:
                    items = []
                    for it in o.get("items", []):
                        raw_sku = it.get("sku", "")
                        # Lay parent SKU (3 phan)
                        parent = "-".join(raw_sku.split("-")[:3])
                        items.append({
                            "sku": parent,
                            "quantity": 1,
                            "unit_price": float(it.get("paid_price", 0)),
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
                channel_id = get_channel_id(cur, "LAZADA")
                cur.execute("SELECT sku, product_id FROM public.products WHERE company_id = %s", (company_id,))
                for r in cur.fetchall(): prod_map[r[0]] = r[1]

        conn.commit()
        total_orders += ok
        print(f"  {os.path.basename(fpath)}: {ok} them, {skip} trung lap, {err} loi")

    print(f"[Lazada] XONG: {total_orders} don hang, {total_items} items")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
