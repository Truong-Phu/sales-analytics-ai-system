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
    os.path.join(BASE, "tiktok_orders_2024_q4.json"),
    os.path.join(BASE, "tiktok_orders_2025_q1.json"),
    os.path.join(BASE, "tiktok_orders_2025_2026.json"),
]


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

        ok = skip = err = 0
        for i, o in enumerate(data["orders"]):
            try:
                addr = o.get("recipient_address", {})
                full_name = addr.get("name", "Khach hang")
                phone     = addr.get("phone_number", "")
                di = addr.get("district_info", {})
                province  = di.get("address_level1", "")
                district  = di.get("address_level2", "")
                address   = addr.get("address_detail", "")

                cid = upsert_customer(cur, full_name, phone, province,
                                      district, address, company_id)

                status_code = o.get("order_status", 100)
                status, pay_st, ship_st = map_tiktok_status(status_code)
                pi = o.get("payment_info", {})
                payment = norm_payment(pi.get("payment_method_name", "COD"))
                order_date = parse_ts(o.get("create_time", 0))

                total    = float(pi.get("total_amount", 0))
                shipping = float(pi.get("actual_shipping_fee", 0))
                discount = float(pi.get("seller_discount", 0)) + float(pi.get("platform_discount", 0))

                ext_id     = f"TIKTOK_{o['order_id']}"
                order_code = f"TK-{o['order_id'][-10:]}"

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
    main()
