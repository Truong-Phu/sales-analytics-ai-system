#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_sample_shopee.py
Import du lieu mau Shopee vao public schema.
Chay: python import_sample_shopee.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from import_common import (
    get_conn, get_company_id, get_channel_id, get_category_map,
    map_shopee_status, norm_payment, parse_ts,
    upsert_products, upsert_customer, insert_order, insert_order_items,
)
from generate_sample_data import PRODUCTS, SHOPEE_SKUS

BASE = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sample-data", "shopee")

ORDER_FILES = [
    os.path.join(BASE, "shopee_orders_2024_q3.json"),
    os.path.join(BASE, "shopee_orders_2024_q4.json"),
    os.path.join(BASE, "shopee_orders_2025_q1.json"),
]


def main():
    conn = get_conn()
    cur = conn.cursor()

    company_id = get_company_id(cur)
    channel_id = get_channel_id(cur, "SHOPEE")
    cat_map = get_category_map(cur)

    # -- Insert san pham Shopee (30 SP)
    prods = [
        {"sku": p["sku"], "name": p["name"], "desc": p["desc"],
         "base_price": p["base_price"], "cost": p["cost"],
         "stock": p["stock"], "category": p["category"]}
        for p in PRODUCTS if p["sku"] in SHOPEE_SKUS
    ]
    prod_map = upsert_products(cur, prods, company_id, cat_map)
    conn.commit()
    print(f"[Shopee] San pham: {len(prod_map)} SP da upsert")

    total_orders = 0
    total_items = 0

    for fpath in ORDER_FILES:
        if not os.path.exists(fpath):
            print(f"  Khong tim thay {fpath}, bo qua")
            continue
        with open(fpath, encoding="utf-8") as f:
            data = json.load(f)

        fname = os.path.basename(fpath)
        ok = skip = err = 0

        for i, o in enumerate(data["orders"]):
            try:
                # Khach hang
                addr = o.get("recipient_address", {})
                full_name = addr.get("name", "Khach hang")
                phone     = addr.get("phone", "")
                province  = addr.get("city", "")
                district  = addr.get("district", "")
                address   = addr.get("full_address", "")

                cid = upsert_customer(cur, full_name, phone, province,
                                      district, address, company_id)

                # Trang thai
                status, pay_st, ship_st = map_shopee_status(o.get("order_status", ""))
                payment = norm_payment(o.get("payment_method", "COD"))
                order_date = parse_ts(o.get("create_time", 0))

                total = float(o.get("total_amount", 0))
                shipping = float(o.get("actual_shipping_fee", 0))
                discount = 0.0
                # Tinh discount tu items
                for it in o.get("item_list", []):
                    orig = float(it.get("model_original_price", 0))
                    disc = float(it.get("model_discounted_price", orig))
                    qty  = int(it.get("model_quantity_purchased", 1))
                    discount += (orig - disc) * qty

                ext_id = f"SHOPEE_{o['order_sn']}"
                order_code = o["order_sn"]

                oid = insert_order(
                    cur, order_code, ext_id, cid, channel_id, company_id,
                    status, pay_st, ship_st,
                    total, discount, shipping, payment, order_date,
                )

                if oid:
                    # Order items
                    items = []
                    for it in o.get("item_list", []):
                        sku = it.get("item_sku", "")
                        # Dung parent SKU (khong co variant suffix)
                        items.append({
                            "sku": sku,
                            "quantity": it.get("model_quantity_purchased", 1),
                            "unit_price": float(it.get("model_discounted_price", 0)),
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
                # Lay lai cursor sau rollback
                cur = conn.cursor()
                company_id = get_company_id(cur)
                channel_id = get_channel_id(cur, "SHOPEE")
                prod_map_refresh = {}
                cur.execute("SELECT sku, product_id FROM public.products WHERE company_id = %s", (company_id,))
                for r in cur.fetchall(): prod_map_refresh[r[0]] = r[1]
                prod_map = {**prod_map, **prod_map_refresh}

        conn.commit()
        total_orders += ok
        print(f"  {fname}: {ok} them moi, {skip} trung lap, {err} loi")

    print(f"[Shopee] XONG: {total_orders} don hang, {total_items} san pham trong don")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
