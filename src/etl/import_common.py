#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
import_common.py - Ham dung chung cho cac import script.
"""
import os
import sys
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras

DB_DSN = "postgresql://postgres:021204@localhost:5432/sales_analytics_ai_db"
COMPANY_EMAIL = "contact@phuthinh.vn"


def get_conn():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = False
    return conn


def get_company_id(cur) -> str:
    cur.execute("SELECT id FROM public.companies WHERE email = %s", (COMPANY_EMAIL,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError("Khong tim thay cong ty. Chay 05_seed_phuthinh.sql truoc!")
    return str(row[0])


def get_channel_id(cur, channel_type: str) -> int:
    cur.execute(
        "SELECT channel_id FROM public.sales_channels "
        "WHERE channel_type = %s AND company_id = (SELECT id FROM public.companies WHERE email = %s)",
        (channel_type, COMPANY_EMAIL),
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"Khong tim thay channel {channel_type}")
    return row[0]


def get_category_map(cur) -> dict:
    cur.execute("SELECT category_name, category_id FROM public.categories")
    return {r[0]: r[1] for r in cur.fetchall()}


# -- Map trang thai -------------------------------------------------------

def map_shopee_status(s):
    m = {
        "COMPLETED":     ("DELIVERED", "PAID",     "DELIVERED"),
        "SHIPPED":       ("SHIPPING",  "UNPAID",   "IN_TRANSIT"),
        "PROCESSED":     ("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
        "IN_CANCEL":     ("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
        "CANCELLED":     ("CANCELLED", "UNPAID",   "NOT_SHIPPED"),
        "RETURN_REFUND": ("RETURNED",  "REFUNDED", "DELIVERED"),
        "UNPAID":        ("PENDING",   "UNPAID",   "NOT_SHIPPED"),
    }
    return m.get(s, ("PENDING", "UNPAID", "NOT_SHIPPED"))


def map_tiktok_status(code):
    m = {
        105: ("DELIVERED", "PAID",     "DELIVERED"),
        121: ("SHIPPING",  "UNPAID",   "IN_TRANSIT"),
        112: ("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
        111: ("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
        106: ("CANCELLED", "UNPAID",   "NOT_SHIPPED"),
        122: ("RETURNED",  "REFUNDED", "DELIVERED"),
        100: ("PENDING",   "UNPAID",   "NOT_SHIPPED"),
        103: ("CANCELLED", "UNPAID",   "FAILED"),
    }
    return m.get(code, ("PENDING", "UNPAID", "NOT_SHIPPED"))


def map_lazada_status(s):
    m = {
        "delivered":       ("DELIVERED", "PAID",     "DELIVERED"),
        "shipped":         ("SHIPPING",  "UNPAID",   "IN_TRANSIT"),
        "ready_to_ship":   ("CONFIRMED", "UNPAID",   "NOT_SHIPPED"),
        "pending":         ("PENDING",   "UNPAID",   "NOT_SHIPPED"),
        "cancelled":       ("CANCELLED", "UNPAID",   "NOT_SHIPPED"),
        "returned":        ("RETURNED",  "REFUNDED", "DELIVERED"),
        "failed_delivery": ("CANCELLED", "UNPAID",   "FAILED"),
    }
    return m.get(s, ("PENDING", "UNPAID", "NOT_SHIPPED"))


def norm_payment(raw: str) -> str:
    r = (raw or "").upper()
    if "COD" in r or "CASH" in r: return "COD"
    if "VNPAY" in r or "VIRTUAL" in r: return "VNPAY"
    if "MOMO" in r or "MOBILE" in r: return "MOMO"
    if "ZALO" in r: return "ZALOPAY"
    return "COD"


def parse_ts(unix_ts) -> datetime:
    return datetime.fromtimestamp(int(unix_ts), tz=timezone.utc)


def parse_lzd_dt(s: str) -> datetime:
    for fmt in ["%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z"]:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return datetime.now(tz=timezone.utc)


# -- Upsert san pham -------------------------------------------------------

def upsert_products(cur, products_list: list, company_id: str, cat_map: dict) -> dict:
    """Tra ve {sku: product_id}."""
    sku_map = {}
    for p in products_list:
        cat_name = p.get("category", "Thoi trang nam")
        cat_id = cat_map.get(cat_name)
        if not cat_id:
            cat_id = next(iter(cat_map.values()))

        cur.execute("""
            INSERT INTO public.products
                (sku, product_name, description, base_price, cost_price,
                 stock_quantity, category_id, image_url, is_active, company_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, %s)
            ON CONFLICT (sku, company_id) DO UPDATE SET
                product_name   = EXCLUDED.product_name,
                base_price     = EXCLUDED.base_price,
                cost_price     = EXCLUDED.cost_price,
                stock_quantity = EXCLUDED.stock_quantity,
                updated_at     = NOW()
            RETURNING product_id
        """, (
            p["sku"], p["name"], p.get("desc", ""),
            p["base_price"], p["cost"],
            p["stock"], cat_id,
            f"https://example.com/{p['sku'].lower()}.jpg",
            company_id,
        ))
        row = cur.fetchone()
        if row:
            sku_map[p["sku"]] = row[0]
    return sku_map


# -- Upsert khach hang -------------------------------------------------------

def upsert_customer(cur, full_name: str, phone: str, province: str,
                    district: str, address: str, company_id: str,
                    email: Optional[str] = None) -> int:
    phone = (phone or "").strip() or f"09{abs(hash(full_name)) % 100000000:08d}"
    # 1. Tim customer cu theo phone
    cur.execute(
        "SELECT customer_id FROM public.customers WHERE phone = %s",
        (phone,)
    )
    row = cur.fetchone()
    if row:
        return row[0]
    # 2. Chua co → INSERT moi
    code = "KH-PT-" + phone[-8:]
    cur.execute("""
        INSERT INTO public.customers
            (customer_code, full_name, email, phone,
             address, province, district, segment_label, company_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 'NEW', %s)
        ON CONFLICT (customer_code) DO UPDATE SET
            full_name = EXCLUDED.full_name, updated_at = NOW()
        RETURNING customer_id
    """, (code, full_name, email, phone, address, province, district, company_id))
    row = cur.fetchone()
    if row:
        return row[0]
    # Fallback
    cur.execute("SELECT customer_id FROM public.customers WHERE customer_code = %s", (code,))
    return cur.fetchone()[0]


# -- Insert don hang ---------------------------------------------------------

def insert_order(cur, order_code: str, ext_id: str,
                 customer_id: int, channel_id: int, company_id: str,
                 status: str, pay_status: str, ship_status: str,
                 total: float, discount: float, shipping: float,
                 payment_method: str, order_date: datetime,
                 delivered_at: Optional[datetime] = None) -> Optional[int]:
    try:
        cur.execute("""
            INSERT INTO public.orders
                (order_code, external_order_id, customer_id, channel_id, company_id,
                 status, payment_status, shipping_status,
                 total_amount, discount_amount, shipping_fee,
                 payment_method, order_date, delivered_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s)
            ON CONFLICT (external_order_id) DO NOTHING
            RETURNING order_id
        """, (
            order_code, ext_id, customer_id, channel_id, company_id,
            status, pay_status, ship_status,
            round(max(0, total), 2), round(max(0, discount), 2),
            round(max(0, shipping), 2),
            payment_method, order_date,
            order_date if status == "DELIVERED" else None,
        ))
        row = cur.fetchone()
        return row[0] if row else None
    except Exception as e:
        print(f"  LOI insert order {order_code}: {e}")
        return None


# -- Insert order items -------------------------------------------------------

def trigger_etl_after_import(company_id: str, channel: str) -> dict:
    """Tu dong chay ETL sau khi import xong: OLTP → DW."""
    sys.path.insert(0, os.path.dirname(__file__))
    print(f">>> Import xong → Bat dau ETL (OLTP→DW) kenh {channel}...")
    try:
        from offline_etl import run_oltp_to_dw  # type: ignore
        result = run_oltp_to_dw(company_id=company_id, channel=channel)
        print(f"    ETL xong: inserted={result['inserted']}, skipped={result['skipped']}")
        return result
    except Exception as e:
        print(f"    [!] ETL loi: {e}")
        return {"error": str(e), "inserted": 0, "skipped": 0}


def insert_order_items(cur, order_id: int, items: list, prod_map: dict):
    for it in items:
        sku = it.get("sku", "")
        pid = prod_map.get(sku)
        if not pid:
            # Thu tim theo parent SKU (cat dau 3 phan)
            parts = sku.split("-")
            for n in [3, 2]:
                parent = "-".join(parts[:n])
                pid = prod_map.get(parent)
                if pid:
                    break
        if not pid:
            continue
        qty = max(1, int(it.get("quantity", 1)))
        unit = max(0, float(it.get("unit_price", 0)))
        disc = max(0, float(it.get("discount", 0)))
        sub = max(0, unit * qty - disc)
        try:
            cur.execute("""
                INSERT INTO public.order_items
                    (order_id, product_id, quantity, unit_price, discount, subtotal)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (order_id, pid, qty, round(unit, 2), round(disc, 2), round(sub, 2)))
        except Exception as e:
            print(f"    LOI item sku={sku}: {e}")
