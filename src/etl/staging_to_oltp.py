# -*- coding: utf-8 -*-
"""
staging_to_oltp.py
ETL Pipeline: staging.raw_* → public.orders/order_items/customers/products → dw.fact_sales

Luồng xử lý:
  1. Đọc staging.raw_shopee_orders / raw_tiktok_orders / raw_lazada_orders (processed=false)
  2. Parse JSONB → normalize thành dict chuẩn MSAS
  3. Upsert public.customers (dedup theo phone_number + company_id)
  4. Upsert public.products  (dedup theo sku + company_id)
  5. Insert public.orders    (dedup theo external_order_id)
  6. Insert public.order_items
  7. Đánh dấu staging processed=true
  8. Gọi run_oltp_to_dw() để push OLTP → dw.fact_sales

Chạy: python src/etl/staging_to_oltp.py
      (cần .env với DATABASE_URL và có staging data từ generate_standard_sample_data.py)
"""

import json
import logging
import os
import subprocess
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("etl.staging_to_oltp")

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/msas_db")

# Channel ID cố định theo sales_channels hiện có
CHANNEL_IDS = {"SHOPEE": 16, "TIKTOK": 17, "LAZADA": 18}

# ── Status mapping ────────────────────────────────────────────────────────────

SHOPEE_STATUS_MAP = {
    "COMPLETED":         "DELIVERED",
    "DELIVERED":         "DELIVERED",
    "CANCELLED":         "CANCELLED",
    "CANCEL":            "CANCELLED",
    "UNPAID":            "PENDING",
    "TO_SHIP":           "CONFIRMED",
    "READY_TO_SHIP":     "CONFIRMED",
    "PROCESSING":        "CONFIRMED",
    "SHIPPED":           "SHIPPING",
    "SHIPPING":          "SHIPPING",
    "IN_CANCEL":         "SHIPPING",
    "RETURN_REJECT":     "RETURNED",
    "RETURNED":          "RETURNED",
}

TIKTOK_STATUS_MAP = {
    "COMPLETED":          "DELIVERED",
    "CANCELLED":          "CANCELLED",
    "CANCEL":             "CANCELLED",
    "UNPAID":             "PENDING",
    "AWAITING_SHIPMENT":  "CONFIRMED",
    "AWAITING_COLLECTION":"CONFIRMED",
    "ON_HOLD":            "PENDING",
    "IN_TRANSIT":         "SHIPPING",
    "DELIVERED":          "DELIVERED",
    "PARTIALLY_RETURNED": "RETURNED",
    "RETURN_REQUESTED":   "RETURNED",
    "RETURN_COMPLETED":   "RETURNED",
}

LAZADA_STATUS_MAP = {
    "delivered":   "DELIVERED",
    "shipped":     "SHIPPING",
    "canceled":    "CANCELLED",
    "cancelled":   "CANCELLED",
    "pending":     "PENDING",
    "processing":  "CONFIRMED",
    "returned":    "RETURNED",
    "failed":      "CANCELLED",
}

# shipping_status phải theo constraint: NOT_SHIPPED | IN_TRANSIT | DELIVERED | FAILED
SHOPEE_LOGISTICS_MAP = {
    "LOGISTICS_DELIVERY_DONE":     "DELIVERED",
    "LOGISTICS_OUT_FOR_DELIVERY":  "IN_TRANSIT",
    "LOGISTICS_PICKD_UP":          "IN_TRANSIT",
    "LOGISTICS_FIRST_MILE_PICKD":  "IN_TRANSIT",
    "LOGISTICS_LOST":              "FAILED",
    "LOGISTICS_REQUEST_CREATED":   "NOT_SHIPPED",
    "LOGISTICS_PENDING":           "NOT_SHIPPED",
    "LOGISTICS_REJECTED_BY_3PL":   "FAILED",
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _ts_to_dt(ts) -> Optional[datetime]:
    """Unix timestamp (int/float) → datetime UTC."""
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _iso_to_dt(s: str) -> Optional[datetime]:
    """ISO 8601 string → datetime UTC."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _parse_decimal(v) -> float:
    """Parse giá trị tiền từ string/int/float."""
    try:
        return float(str(v).replace(",", "").replace(".", "").strip() or 0)
    except (ValueError, TypeError):
        return 0.0


def _parse_decimal_vn(v) -> float:
    """Parse số VN format: 1.075.000 → 1075000, 357000 → 357000."""
    if v is None:
        return 0.0
    s = str(v).strip()
    # Nếu có dấu . ở vị trí ngàn → remove hết dấu chấm
    parts = s.split(".")
    if len(parts) > 1 and all(len(p) <= 3 for p in parts[1:]):
        s = s.replace(".", "")
    s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── Upsert helpers ─────────────────────────────────────────────────────────────

def _upsert_customer(conn, company_id: str, name: str, phone: str,
                     province: str, district: str, address: str) -> Optional[int]:
    """Upsert public.customers, trả về customer_id."""
    if not name:
        return None
    with conn.cursor() as cur:
        # Lookup theo phone (nếu có) hoặc name+province
        if phone:
            cur.execute(
                "SELECT customer_id FROM public.customers "
                "WHERE company_id=%s AND phone_number=%s LIMIT 1",
                (company_id, phone)
            )
        else:
            cur.execute(
                "SELECT customer_id FROM public.customers "
                "WHERE company_id=%s AND full_name=%s AND province=%s LIMIT 1",
                (company_id, name, province)
            )
        row = cur.fetchone()
        if row:
            cid = row[0]
            cur.execute(
                "UPDATE public.customers SET full_name=%s, province=%s, "
                "district=%s, address=%s, updated_at=NOW() WHERE customer_id=%s",
                (name, province, district, address, cid)
            )
            return cid
        # Insert mới
        cur.execute(
            """INSERT INTO public.customers
               (full_name, phone_number, province, district, address,
                total_orders, total_spent, segment_label, is_active,
                created_at, updated_at, company_id)
               VALUES (%s,%s,%s,%s,%s,0,0,'NEW',true,NOW(),NOW(),%s)
               RETURNING customer_id""",
            (name, phone, province, district, address, company_id)
        )
        return cur.fetchone()[0]


_default_category_cache: Dict[str, int] = {}


def _get_default_category(conn, company_id: str) -> int:
    """Trả về category_id đầu tiên của công ty để dùng làm default."""
    if company_id in _default_category_cache:
        return _default_category_cache[company_id]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT category_id FROM public.categories "
            "WHERE company_id=%s AND is_active=true ORDER BY category_id LIMIT 1",
            (company_id,)
        )
        row = cur.fetchone()
        cat_id = row[0] if row else 1
    _default_category_cache[company_id] = cat_id
    return cat_id


def _upsert_product(conn, company_id: str, sku: str, name: str,
                    price: float, image_url: str = "") -> Optional[int]:
    """Upsert public.products, trả về product_id."""
    if not sku:
        sku = "UNKNOWN"
    with conn.cursor() as cur:
        cur.execute(
            "SELECT product_id FROM public.products "
            "WHERE company_id=%s AND sku=%s LIMIT 1",
            (company_id, sku)
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cat_id = _get_default_category(conn, company_id)
        cur.execute(
            """INSERT INTO public.products
               (sku, product_name, base_price, cost_price, stock_quantity,
                category_id, image_url, is_active, created_at, updated_at, company_id)
               VALUES (%s,%s,%s,%s,0,%s,%s,true,NOW(),NOW(),%s)
               RETURNING product_id""",
            (sku, name or sku, price, round(price * 0.6, 2), cat_id, image_url, company_id)
        )
        return cur.fetchone()[0]


# ── Transform functions ────────────────────────────────────────────────────────

def _transform_shopee(row: Dict) -> Dict:
    """Chuyển 1 record staging.raw_shopee_orders thành dict OLTP."""
    d = row["raw_data"]
    if isinstance(d, str):
        d = json.loads(d)

    addr = d.get("recipient_address") or {}
    pkg  = (d.get("package_list") or [{}])[0]
    items = d.get("item_list") or []

    order_sn  = d.get("order_sn", "")
    status_raw = d.get("order_status", "")
    status = SHOPEE_STATUS_MAP.get(status_raw.upper(), "PENDING")

    # Map logistics_status → constraint-valid shipping_status
    raw_logistics = pkg.get("logistics_status", "")
    ship_stat = SHOPEE_LOGISTICS_MAP.get(raw_logistics.upper(), "")
    if not ship_stat:
        if status == "DELIVERED":
            ship_stat = "DELIVERED"
        elif status in ("SHIPPING", "PROCESSING"):
            ship_stat = "IN_TRANSIT"
        else:
            ship_stat = "NOT_SHIPPED"

    create_ts  = d.get("create_time")
    paid_ts    = d.get("pay_time")
    ship_ts    = d.get("pickup_done_time")

    total_amount   = _parse_decimal_vn(d.get("total_amount", 0))
    shipping_fee   = _parse_decimal_vn(d.get("actual_shipping_fee", 0))
    est_ship_fee   = _parse_decimal_vn(d.get("estimated_shipping_fee", 0))
    discount       = max(0.0, est_ship_fee - shipping_fee)

    pay_method = d.get("payment_method", "COD")
    pay_status = "PAID" if paid_ts else "UNPAID"

    name     = addr.get("name", "")
    phone    = addr.get("phone", "")
    province = addr.get("state") or addr.get("city") or ""
    district = addr.get("district", "")
    address  = addr.get("full_address", "")

    order_items = []
    for it in items:
        sku       = it.get("model_sku") or it.get("item_sku") or "UNKNOWN"
        item_name = it.get("item_name", "")
        orig_p    = _parse_decimal_vn(it.get("model_original_price", 0))
        sale_p    = _parse_decimal_vn(it.get("model_discounted_price") or orig_p)
        qty       = int(it.get("model_quantity_purchased", 1) or 1)
        img_url   = (it.get("image_info") or {}).get("image_url", "")
        order_items.append({
            "sku": sku, "product_name": item_name,
            "unit_price": sale_p, "original_price": orig_p,
            "quantity": qty, "discount": max(0.0, (orig_p - sale_p) * qty),
            "subtotal": sale_p * qty, "image_url": img_url,
        })

    return {
        "platform": "SHOPEE",
        "order_code":         order_sn,
        "external_order_id":  f"SHOPEE_{order_sn}",
        "channel_id":         CHANNEL_IDS["SHOPEE"],
        "status":             status,
        "payment_status":     pay_status,
        "shipping_status":    ship_stat,
        "total_amount":       total_amount,
        "discount_amount":    discount,
        "shipping_fee":       shipping_fee,
        "net_amount":         max(0.0, total_amount - discount),
        "payment_method":     pay_method,
        "order_date":         _ts_to_dt(create_ts),
        "delivered_at":       _ts_to_dt(ship_ts),
        "customer_name":      name,
        "customer_phone":     phone,
        "province":           province,
        "district":           district,
        "address":            address,
        "items":              order_items,
        "staging_id":         row["id"],
    }


def _transform_tiktok(row: Dict) -> Dict:
    """Chuyển 1 record staging.raw_tiktok_orders thành dict OLTP."""
    d = row["raw_data"]
    if isinstance(d, str):
        d = json.loads(d)

    addr  = d.get("recipient_address") or {}
    pay   = d.get("payment") or {}
    items = d.get("line_items") or []

    order_id   = d.get("id", "")
    status_raw = d.get("status", "")
    status = TIKTOK_STATUS_MAP.get(status_raw.upper(), "PENDING")

    create_ts = d.get("create_time")
    paid_ts   = d.get("paid_time")

    total_amount = _parse_decimal_vn(pay.get("total_amount", 0))
    shipping_fee = _parse_decimal_vn(pay.get("shipping_fee", 0))
    discount     = (_parse_decimal_vn(pay.get("seller_discount", 0))
                    + _parse_decimal_vn(pay.get("platform_discount", 0)))

    pay_method = d.get("payment_method_name", "COD")
    pay_status = "PAID" if paid_ts else "UNPAID"

    # Province từ district_info (L1=Province, L2=District, L3=Ward)
    district_info = addr.get("district_info") or []
    province = ""
    district = ""
    for di in district_info:
        lvl = di.get("address_level", "")
        nm  = di.get("address_name", "")
        if lvl == "L1":
            province = nm
        elif lvl == "L2":
            district = nm

    name    = addr.get("name", "")
    phone   = addr.get("phone_number", "")
    address = addr.get("full_address", "")

    order_items = []
    for it in items:
        sku       = it.get("seller_sku") or "UNKNOWN"
        item_name = it.get("product_name", "")
        orig_p    = _parse_decimal_vn(it.get("original_price", 0))
        sale_p    = _parse_decimal_vn(it.get("sale_price") or orig_p)
        qty       = int(it.get("quantity", 1) or 1)
        img_url   = it.get("sku_image", "")
        order_items.append({
            "sku": sku, "product_name": item_name,
            "unit_price": sale_p, "original_price": orig_p,
            "quantity": qty, "discount": max(0.0, (orig_p - sale_p) * qty),
            "subtotal": sale_p * qty, "image_url": img_url,
        })

    return {
        "platform": "TIKTOK",
        "order_code":         order_id,
        "external_order_id":  f"TIKTOK_{order_id}",
        "channel_id":         CHANNEL_IDS["TIKTOK"],
        "status":             status,
        "payment_status":     pay_status,
        "shipping_status":    ("DELIVERED" if status == "DELIVERED"
                               else "IN_TRANSIT" if status == "SHIPPING"
                               else "NOT_SHIPPED"),
        "total_amount":       total_amount,
        "discount_amount":    discount,
        "shipping_fee":       shipping_fee,
        "net_amount":         max(0.0, total_amount - discount),
        "payment_method":     pay_method,
        "order_date":         _ts_to_dt(create_ts),
        "delivered_at":       None,
        "customer_name":      name,
        "customer_phone":     phone,
        "province":           province,
        "district":           district,
        "address":            address,
        "items":              order_items,
        "staging_id":         row["id"],
    }


def _transform_lazada(row: Dict) -> Dict:
    """Chuyển 1 record staging.raw_lazada_orders thành dict OLTP."""
    d = row["raw_order"]
    if isinstance(d, str):
        d = json.loads(d)
    ri = row.get("raw_items")
    if isinstance(ri, str):
        ri = json.loads(ri) if ri else []
    elif isinstance(ri, dict):
        ri = [ri]   # JSONB lưu single item dict, wrap thành list
    raw_items = ri or []

    addr = d.get("address_shipping") or {}

    order_id_val = d.get("order_id", "")
    status_raw   = d.get("status", "")
    status = LAZADA_STATUS_MAP.get(status_raw.lower(), "PENDING")

    created_at = d.get("created_at", "")

    total_amount = _parse_decimal_vn(d.get("price", 0))
    shipping_fee = _parse_decimal_vn(d.get("shipping_fee", 0))
    voucher      = (_parse_decimal_vn(d.get("voucher", 0))
                    + _parse_decimal_vn(d.get("voucher_platform", 0)))

    pay_method = d.get("payment_method", "CashOnDelivery")
    pay_status = "PAID"  # Lazada thường đã thanh toán khi có order

    # Lazada: city=district, address3=province
    province = addr.get("address3", "")
    district = addr.get("city", "")
    first_name = addr.get("first_name") or d.get("customer_first_name", "")
    last_name  = addr.get("last_name") or d.get("customer_last_name", "")
    name   = f"{last_name} {first_name}".strip()
    phone  = addr.get("phone", "")
    address_parts = [addr.get("address1",""), addr.get("address4",""), district, province]
    address = ", ".join(p for p in address_parts if p)

    order_items = []
    for it in raw_items:
        if isinstance(it, str):
            try:
                it = json.loads(it)
            except Exception:
                continue  # bỏ qua item không parse được
        if not isinstance(it, dict):
            continue
        sku      = it.get("seller_sku") or it.get("SellerSku") or "UNKNOWN"
        name_p   = it.get("name") or it.get("Name") or ""
        price_p  = _parse_decimal_vn(it.get("paid_price") or it.get("item_price") or 0)
        orig_p   = _parse_decimal_vn(it.get("item_price", 0) or price_p)
        qty      = int(it.get("quantity", 1) or 1)
        img_url  = it.get("product_main_image", "")
        order_items.append({
            "sku": sku, "product_name": name_p,
            "unit_price": price_p, "original_price": orig_p,
            "quantity": qty, "discount": max(0.0, (orig_p - price_p) * qty),
            "subtotal": price_p * qty, "image_url": img_url,
        })

    # Nếu không có raw_items, tạo 1 item placeholder từ order total
    if not order_items:
        order_items.append({
            "sku": f"LZD_{order_id_val}", "product_name": "Sản phẩm Lazada",
            "unit_price": total_amount, "original_price": total_amount,
            "quantity": 1, "discount": voucher,
            "subtotal": total_amount, "image_url": "",
        })

    return {
        "platform": "LAZADA",
        "order_code":         str(order_id_val),
        "external_order_id":  f"LAZADA_{order_id_val}",
        "channel_id":         CHANNEL_IDS["LAZADA"],
        "status":             status,
        "payment_status":     pay_status,
        "shipping_status":    ("DELIVERED" if status == "DELIVERED"
                               else "IN_TRANSIT" if status == "SHIPPING"
                               else "FAILED" if status == "CANCELLED"
                               else "NOT_SHIPPED"),
        "total_amount":       total_amount,
        "discount_amount":    voucher,
        "shipping_fee":       shipping_fee,
        "net_amount":         max(0.0, total_amount - voucher),
        "payment_method":     pay_method,
        "order_date":         _iso_to_dt(created_at),
        "delivered_at":       None,
        "customer_name":      name,
        "customer_phone":     phone,
        "province":           province,
        "district":           district,
        "address":            address,
        "items":              order_items,
        "staging_id":         row["id"],
    }


# ── Load to OLTP ───────────────────────────────────────────────────────────────

def _load_order_to_oltp(conn, rec: Dict, company_id: str) -> Optional[int]:
    """
    Upsert 1 order vào OLTP.
    Trả về order_id nếu insert thành công, None nếu duplicate.
    """
    # 1. Upsert customer
    customer_id = _upsert_customer(
        conn, company_id,
        name=rec["customer_name"],
        phone=rec["customer_phone"],
        province=rec["province"],
        district=rec["district"],
        address=rec["address"],
    )

    # 2. Upsert products + build order_items list
    items_with_pid = []
    for it in rec["items"]:
        pid = _upsert_product(
            conn, company_id,
            sku=it["sku"],
            name=it["product_name"],
            price=it["original_price"],
            image_url=it.get("image_url", ""),
        )
        items_with_pid.append({**it, "product_id": pid})

    # 3. Insert order (dedup bằng external_order_id)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT order_id FROM public.orders WHERE external_order_id=%s AND company_id=%s LIMIT 1",
            (rec["external_order_id"], company_id)
        )
        existing = cur.fetchone()
        if existing:
            return None  # duplicate

        cur.execute(
            """INSERT INTO public.orders
               (order_code, customer_id, channel_id, status, total_amount,
                discount_amount, shipping_fee, payment_method,
                payment_status, shipping_status, order_date, delivered_at,
                external_order_id, created_at, updated_at, company_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),NOW(),%s)
               RETURNING order_id""",
            (
                rec["order_code"], customer_id, rec["channel_id"], rec["status"],
                rec["total_amount"], rec["discount_amount"], rec["shipping_fee"],
                rec["payment_method"], rec["payment_status"],
                rec["shipping_status"], rec["order_date"], rec["delivered_at"],
                rec["external_order_id"], company_id,
            )
        )
        order_id = cur.fetchone()[0]

    # 4. Insert order_items
    with conn.cursor() as cur:
        for it in items_with_pid:
            if not it.get("product_id"):
                continue
            cur.execute(
                """INSERT INTO public.order_items
                   (order_id, product_id, quantity, unit_price, discount, subtotal)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (order_id, it["product_id"], it["quantity"],
                 it["unit_price"], it["discount"], it["subtotal"])
            )

    return order_id


# ── Staging → OLTP main ────────────────────────────────────────────────────────

def run_staging_to_oltp(company_id: Optional[str] = None) -> Dict:
    """
    Chạy full ETL staging → OLTP.
    Trả về dict thống kê: {shopee, tiktok, lazada, total_inserted, total_skipped}
    """
    conn = psycopg2.connect(DB_URL)

    # Resolve company_id
    if not company_id:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM public.companies WHERE name ILIKE %s LIMIT 1",
                ("%Phú Thịnh%",)
            )
            row = cur.fetchone()
            if not row:
                cur.execute(
                    "SELECT id FROM public.companies ORDER BY created_at LIMIT 1"
                )
                row = cur.fetchone()
            company_id = str(row[0]) if row else None

    if not company_id:
        raise RuntimeError("Không tìm được company_id trong DB")

    logger.info("Company ID: %s", company_id)

    stats: Dict[str, int] = {
        "shopee_inserted": 0, "shopee_skipped": 0,
        "tiktok_inserted": 0, "tiktok_skipped": 0,
        "lazada_inserted": 0, "lazada_skipped": 0,
    }

    # ── Shopee ────────────────────────────────────────────────────────────────
    logger.info("Shopee: đọc staging...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, order_sn, raw_data FROM staging.raw_shopee_orders "
            "WHERE company_id=%s AND processed=false ORDER BY id",
            (company_id,)
        )
        shopee_rows = cur.fetchall()

    processed_ids = []
    for row in shopee_rows:
        try:
            rec = _transform_shopee(dict(row))
            oid = _load_order_to_oltp(conn, rec, company_id)
            if oid:
                stats["shopee_inserted"] += 1
                processed_ids.append(row["id"])
            else:
                stats["shopee_skipped"] += 1
                processed_ids.append(row["id"])
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("Shopee order %s lỗi: %s", row.get("order_sn"), e)
            stats["shopee_skipped"] += 1

    if processed_ids:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE staging.raw_shopee_orders SET processed=true, processed_at=NOW() "
                "WHERE id = ANY(%s)",
                (processed_ids,)
            )
        conn.commit()
    logger.info("Shopee: inserted=%d skipped=%d", stats["shopee_inserted"], stats["shopee_skipped"])

    # ── TikTok ────────────────────────────────────────────────────────────────
    logger.info("TikTok: đọc staging...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, order_id, raw_data FROM staging.raw_tiktok_orders "
            "WHERE company_id=%s AND processed=false ORDER BY id",
            (company_id,)
        )
        tiktok_rows = cur.fetchall()

    processed_ids = []
    for row in tiktok_rows:
        try:
            rec = _transform_tiktok(dict(row))
            oid = _load_order_to_oltp(conn, rec, company_id)
            if oid:
                stats["tiktok_inserted"] += 1
                processed_ids.append(row["id"])
            else:
                stats["tiktok_skipped"] += 1
                processed_ids.append(row["id"])
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("TikTok order %s lỗi: %s", row.get("order_id"), e)
            stats["tiktok_skipped"] += 1

    if processed_ids:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE staging.raw_tiktok_orders SET processed=true, processed_at=NOW() "
                "WHERE id = ANY(%s)",
                (processed_ids,)
            )
        conn.commit()
    logger.info("TikTok: inserted=%d skipped=%d", stats["tiktok_inserted"], stats["tiktok_skipped"])

    # ── Lazada ────────────────────────────────────────────────────────────────
    logger.info("Lazada: đọc staging...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, order_id, raw_order, raw_items FROM staging.raw_lazada_orders "
            "WHERE company_id=%s AND processed=false ORDER BY id",
            (company_id,)
        )
        lazada_rows = cur.fetchall()

    processed_ids = []
    for row in lazada_rows:
        try:
            rec = _transform_lazada(dict(row))
            oid = _load_order_to_oltp(conn, rec, company_id)
            if oid:
                stats["lazada_inserted"] += 1
                processed_ids.append(row["id"])
            else:
                stats["lazada_skipped"] += 1
                processed_ids.append(row["id"])
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("Lazada order %s lỗi: %s", row.get("order_id"), e)
            stats["lazada_skipped"] += 1

    if processed_ids:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE staging.raw_lazada_orders SET processed=true, processed_at=NOW() "
                "WHERE id = ANY(%s)",
                (processed_ids,)
            )
        conn.commit()
    logger.info("Lazada: inserted=%d skipped=%d", stats["lazada_inserted"], stats["lazada_skipped"])

    conn.close()

    stats["total_inserted"] = (stats["shopee_inserted"]
                               + stats["tiktok_inserted"]
                               + stats["lazada_inserted"])
    stats["total_skipped"]  = (stats["shopee_skipped"]
                               + stats["tiktok_skipped"]
                               + stats["lazada_skipped"])
    return stats


# ── OLTP → DW ─────────────────────────────────────────────────────────────────

def run_oltp_to_dw_full(company_id: Optional[str] = None) -> Dict:
    """
    Đẩy tất cả orders từ OLTP sang dw.fact_sales.
    Wrapper quanh offline_etl.run_oltp_to_dw với resolve company_id.
    """
    sys.path.insert(0, os.path.dirname(__file__))
    from offline_etl import run_oltp_to_dw  # noqa

    conn = psycopg2.connect(DB_URL)
    if not company_id:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM public.companies WHERE name ILIKE %s LIMIT 1",
                ("%Phú Thịnh%",)
            )
            row = cur.fetchone()
            company_id = str(row[0]) if row else None
    conn.close()

    return run_oltp_to_dw(company_id=company_id)


# ── Trigger retrain ────────────────────────────────────────────────────────────

def _trigger_retrain() -> str:
    """
    Kích hoạt retrain Prophet sau khi ETL có data mới.

    Ưu tiên theo thứ tự:
      1. POST đến AI Service (nếu đang chạy) → fire-and-forget (background)
      2. Gọi trực tiếp train_prophet.py qua subprocess (nếu AI service offline)

    Trả về chuỗi mô tả kết quả.
    """
    ai_url = os.getenv("AI_SERVICE_URL", "http://localhost:8001")

    # Thử gọi AI service endpoint /retrain
    try:
        req = urllib.request.Request(
            f"{ai_url}/retrain",
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode())
            status = body.get("status", "triggered")
            return f"AI Service: retrain {status} (background)"
    except urllib.error.URLError:
        pass  # AI service offline → fallback
    except Exception as e:
        logger.warning("Không gọi được /retrain: %s", e)

    # Fallback: chạy train_prophet.py trực tiếp (blocking ~3–5 phút)
    train_script = Path(__file__).resolve().parents[1] / "ai-service" / "train_prophet.py"
    if not train_script.exists():
        return "Không tìm thấy train_prophet.py — bỏ qua retrain"

    logger.info("AI Service offline — chạy train_prophet.py trực tiếp...")
    try:
        result = subprocess.run(
            [sys.executable, str(train_script)],
            capture_output=True,
            text=True,
            timeout=600,  # 10 phút tối đa
        )
        if result.returncode == 0:
            return "train_prophet.py: retrain trực tiếp hoàn thành"
        else:
            logger.warning("train_prophet.py exit %d: %s", result.returncode, result.stderr[-300:])
            return f"train_prophet.py: exit code {result.returncode}"
    except subprocess.TimeoutExpired:
        return "train_prophet.py: timeout (>10 phút)"
    except Exception as e:
        return f"train_prophet.py: lỗi — {e}"


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("ETL: staging.raw_* → OLTP → dw.fact_sales")
    print("=" * 60)

    # Bước 1: Staging → OLTP
    print("\n[1/2] Staging → OLTP (public.orders + customers + products)...")
    oltp_stats = run_staging_to_oltp()
    print(f"      Shopee  : +{oltp_stats['shopee_inserted']} inserted, {oltp_stats['shopee_skipped']} skipped")
    print(f"      TikTok  : +{oltp_stats['tiktok_inserted']} inserted, {oltp_stats['tiktok_skipped']} skipped")
    print(f"      Lazada  : +{oltp_stats['lazada_inserted']} inserted, {oltp_stats['lazada_skipped']} skipped")
    print(f"      TOTAL   : +{oltp_stats['total_inserted']} inserted")

    # Bước 2: OLTP → DW
    print("\n[2/2] OLTP → dw.fact_sales...")
    try:
        dw_stats = run_oltp_to_dw_full()
        print(f"      Total orders scanned : {dw_stats.get('total_orders', 0)}")
        print(f"      fact_sales inserted  : +{dw_stats.get('inserted', 0)}")
        print(f"      fact_sales skipped   : {dw_stats.get('skipped', 0)} (duplicate)")
    except Exception as e:
        logger.error("OLTP→DW lỗi: %s", e, exc_info=True)
        print(f"      LOI: {e}")

    # Bước 3: Trigger retrain AI nếu có data mới
    if oltp_stats["total_inserted"] > 0:
        print(f"\n[3/3] Trigger retrain AI model (+{oltp_stats['total_inserted']} records mới)...")
        retrain_msg = _trigger_retrain()
        print(f"      {retrain_msg}")
    else:
        print("\n[3/3] Không có data mới — bỏ qua retrain AI.")

    print("\n✅ ETL hoàn thành!")


if __name__ == "__main__":
    main()
