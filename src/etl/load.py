# -*- coding: utf-8 -*-
"""
Load – Nạp dữ liệu đã transform vào Data Warehouse (Star Schema).

Quy trình:
  1. Lookup / upsert dim_channel, dim_region, dim_payment_method (SCD Type 1)
  2. Upsert dim_customer, dim_product theo SCD Type 2
     (tạo phiên bản mới nếu thuộc tính thay đổi, đánh dấu cũ is_current=FALSE)
  3. Lookup dim_date theo date_key (YYYYMMDD)
  4. INSERT fact_sales với ON CONFLICT (external_order_id) DO NOTHING (dedup)
  5. Đánh dấu staging records là is_processed=TRUE
"""
import logging
from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras

logger = logging.getLogger("etl.load")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


# ── dim_channel (SCD Type 1 – lookup or insert) ───────────────────────────────

_channel_cache: Dict[str, int] = {}


def get_or_create_channel(conn, channel_name: str) -> int:
    """Trả về channel_id; tạo mới nếu chưa tồn tại."""
    if channel_name in _channel_cache:
        return _channel_cache[channel_name]

    sql_select = "SELECT channel_id FROM dw.dim_channel WHERE channel_name = %s"
    sql_insert = """
        INSERT INTO dw.dim_channel (channel_name, channel_type, is_active, created_at)
        VALUES (%s, %s, TRUE, NOW())
        ON CONFLICT (channel_name) DO UPDATE SET channel_name = EXCLUDED.channel_name
        RETURNING channel_id
    """
    # Xác định channel_type từ tên
    channel_type_map = {
        "shopee":   "ECOMMERCE",
        "lazada":   "ECOMMERCE",
        "tiktok":   "SOCIAL",
        "facebook": "SOCIAL",
        "website":  "WEBSITE",
    }
    channel_type = channel_type_map.get(channel_name.lower(), "OTHER")

    with conn.cursor() as cur:
        cur.execute(sql_select, (channel_name,))
        row = cur.fetchone()
        if row:
            channel_id = row[0]
        else:
            cur.execute(sql_insert, (channel_name, channel_type))
            channel_id = cur.fetchone()[0]

    _channel_cache[channel_name] = channel_id
    return channel_id


# ── dim_region (SCD Type 1) ───────────────────────────────────────────────────

_region_cache: Dict[str, int] = {}


def get_or_create_region(conn, province: str, region: str) -> int:
    """Trả về region_id cho cặp (province, region)."""
    cache_key = f"{province}|{region}"
    if cache_key in _region_cache:
        return _region_cache[cache_key]

    sql = """
        INSERT INTO dw.dim_region (province_name, region_name, country)
        VALUES (%s, %s, 'Việt Nam')
        ON CONFLICT (province_name) DO UPDATE SET region_name = EXCLUDED.region_name
        RETURNING region_id
    """
    with conn.cursor() as cur:
        cur.execute(sql, (province or "Khác", region or "Khác"))
        region_id = cur.fetchone()[0]

    _region_cache[cache_key] = region_id
    return region_id


# ── dim_payment_method (SCD Type 1) ───────────────────────────────────────────

_payment_cache: Dict[str, int] = {}


def get_or_create_payment_method(conn, method_name: str) -> int:
    """Trả về payment_method_id."""
    if method_name in _payment_cache:
        return _payment_cache[method_name]

    sql = """
        INSERT INTO dw.dim_payment_method (method_name, method_type)
        VALUES (%s, %s)
        ON CONFLICT (method_name) DO UPDATE SET method_name = EXCLUDED.method_name
        RETURNING payment_method_id
    """
    type_map = {
        "COD":      "COD",
        "CASH":     "CASH",
        "EWALLET":  "E-WALLET",
        "TRANSFER": "BANK_TRANSFER",
    }
    method_type = type_map.get(method_name, "OTHER")

    with conn.cursor() as cur:
        cur.execute(sql, (method_name, method_type))
        payment_method_id = cur.fetchone()[0]

    _payment_cache[method_name] = payment_method_id
    return payment_method_id


# ── dim_date (pre-populated, chỉ lookup) ──────────────────────────────────────

_date_cache: Dict[int, int] = {}


def get_date_key(conn, dt: Optional[datetime]) -> Optional[int]:
    """
    Trả về date_id từ dim_date theo date_key (YYYYMMDD).
    Nếu ngày chưa có trong DW thì tự insert (guard cho edge-case).
    """
    if dt is None:
        return None

    if isinstance(dt, datetime):
        d = dt.date()
    else:
        d = dt

    date_key = int(d.strftime("%Y%m%d"))
    if date_key in _date_cache:
        return _date_cache[date_key]

    sql_select = "SELECT date_id FROM dw.dim_date WHERE date_key = %s"
    sql_insert = """
        INSERT INTO dw.dim_date (
            date_key, full_date, day_of_week, day_name,
            month, month_name, quarter, year,
            is_weekend, is_holiday
        ) VALUES (
            %s, %s,
            EXTRACT(DOW FROM %s::date)::int,
            TO_CHAR(%s::date, 'Day'),
            EXTRACT(MONTH FROM %s::date)::int,
            TO_CHAR(%s::date, 'Month'),
            EXTRACT(QUARTER FROM %s::date)::int,
            EXTRACT(YEAR FROM %s::date)::int,
            EXTRACT(DOW FROM %s::date) IN (0, 6),
            FALSE
        )
        ON CONFLICT (date_key) DO NOTHING
        RETURNING date_id
    """
    date_str = d.isoformat()

    with conn.cursor() as cur:
        cur.execute(sql_select, (date_key,))
        row = cur.fetchone()
        if row:
            date_id = row[0]
        else:
            cur.execute(sql_insert, (date_key, date_str) + (date_str,) * 8)
            inserted = cur.fetchone()
            if inserted:
                date_id = inserted[0]
            else:
                # Race condition – đọc lại
                cur.execute(sql_select, (date_key,))
                date_id = cur.fetchone()[0]

    _date_cache[date_key] = date_id
    return date_id


# ── dim_customer (SCD Type 2) ─────────────────────────────────────────────────

def upsert_customer_scd2(conn, phone: Optional[str], name: str) -> int:
    """
    Upsert dim_customer theo SCD Type 2.

    - Nếu chưa có customer_phone → INSERT phiên bản đầu tiên.
    - Nếu đã có và tên KHÁC → đóng bản ghi cũ (valid_to=TODAY, is_current=FALSE),
      INSERT bản ghi mới.
    - Nếu đã có và tên GIỐNG → trả về customer_id hiện tại.
    """
    if not phone:
        # Không có phone: dùng dim "Unknown customer"
        return _get_or_create_unknown_customer(conn)

    today = _today_utc()

    sql_current = """
        SELECT customer_id, customer_name
        FROM dw.dim_customer
        WHERE customer_phone = %s AND is_current = TRUE
        LIMIT 1
    """
    sql_insert = """
        INSERT INTO dw.dim_customer
            (customer_phone, customer_name, valid_from, valid_to, is_current)
        VALUES (%s, %s, %s, '9999-12-31', TRUE)
        RETURNING customer_id
    """
    sql_expire = """
        UPDATE dw.dim_customer
        SET valid_to = %s, is_current = FALSE
        WHERE customer_id = %s
    """

    with conn.cursor() as cur:
        cur.execute(sql_current, (phone,))
        row = cur.fetchone()

        if row is None:
            # Chưa có → insert mới
            cur.execute(sql_insert, (phone, name, today))
            return cur.fetchone()[0]

        customer_id, current_name = row
        if current_name != name:
            # Thuộc tính thay đổi → SCD Type 2: đóng cũ, tạo mới
            cur.execute(sql_expire, (today, customer_id))
            cur.execute(sql_insert, (phone, name, today))
            return cur.fetchone()[0]

        return customer_id


def _get_or_create_unknown_customer(conn) -> int:
    """Trả về customer_id cho bản ghi "Khách vãng lai" (phone=NULL)."""
    sql = """
        INSERT INTO dw.dim_customer
            (customer_phone, customer_name, valid_from, valid_to, is_current)
        VALUES (NULL, 'Khách vãng lai', '2000-01-01', '9999-12-31', TRUE)
        ON CONFLICT DO NOTHING
        RETURNING customer_id
    """
    sql_select = """
        SELECT customer_id FROM dw.dim_customer
        WHERE customer_name = 'Khách vãng lai' AND customer_phone IS NULL
        LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(sql_select)
        return cur.fetchone()[0]


# ── dim_product (SCD Type 2) ──────────────────────────────────────────────────

def upsert_product_scd2(
    conn,
    sku: str,
    product_name: str,
    channel_id: int,
) -> int:
    """
    Upsert dim_product theo SCD Type 2.
    Key business: sku + channel_id
    """
    if not sku:
        return _get_or_create_unknown_product(conn, channel_id)

    today = _today_utc()

    sql_current = """
        SELECT product_id, product_name
        FROM dw.dim_product
        WHERE sku = %s AND channel_id = %s AND is_current = TRUE
        LIMIT 1
    """
    sql_insert = """
        INSERT INTO dw.dim_product
            (sku, product_name, channel_id, valid_from, valid_to, is_current)
        VALUES (%s, %s, %s, %s, '9999-12-31', TRUE)
        RETURNING product_id
    """
    sql_expire = """
        UPDATE dw.dim_product
        SET valid_to = %s, is_current = FALSE
        WHERE product_id = %s
    """

    with conn.cursor() as cur:
        cur.execute(sql_current, (sku, channel_id))
        row = cur.fetchone()

        if row is None:
            cur.execute(sql_insert, (sku, product_name, channel_id, today))
            return cur.fetchone()[0]

        product_id, current_name = row
        if current_name != product_name:
            cur.execute(sql_expire, (today, product_id))
            cur.execute(sql_insert, (sku, product_name, channel_id, today))
            return cur.fetchone()[0]

        return product_id


def _get_or_create_unknown_product(conn, channel_id: int) -> int:
    sql = """
        INSERT INTO dw.dim_product
            (sku, product_name, channel_id, valid_from, valid_to, is_current)
        VALUES ('UNKNOWN', 'Sản phẩm không xác định', %s, '2000-01-01', '9999-12-31', TRUE)
        ON CONFLICT DO NOTHING
        RETURNING product_id
    """
    sql_select = """
        SELECT product_id FROM dw.dim_product
        WHERE sku = 'UNKNOWN' AND channel_id = %s AND is_current = TRUE
        LIMIT 1
    """
    with conn.cursor() as cur:
        cur.execute(sql, (channel_id,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(sql_select, (channel_id,))
        return cur.fetchone()[0]


# ── fact_sales INSERT ─────────────────────────────────────────────────────────

FACT_INSERT_SQL = """
    INSERT INTO dw.fact_sales (
        date_id, channel_id, product_id, customer_id,
        region_id, payment_method_id,
        external_order_id, order_count,
        item_quantity, gross_revenue, discount_amount,
        net_revenue, cost_amount, gross_profit,
        profit_margin, shipping_fee,
        return_count, return_amount,
        order_status, source_system, created_at
    ) VALUES (
        %(date_id)s, %(channel_id)s, %(product_id)s, %(customer_id)s,
        %(region_id)s, %(payment_method_id)s,
        %(external_order_id)s, %(order_count)s,
        %(item_quantity)s, %(gross_revenue)s, %(discount_amount)s,
        %(net_revenue)s, %(cost_amount)s, %(gross_profit)s,
        %(profit_margin)s, %(shipping_fee)s,
        %(return_count)s, %(return_amount)s,
        %(order_status)s, %(source_system)s, NOW()
    )
    ON CONFLICT (external_order_id) DO NOTHING
"""


def load_fact_records(conn, fact_records: List[Dict]) -> Tuple[int, int]:
    """
    Resolve dim keys và INSERT vào fact_sales.

    Returns:
        (inserted_count, skipped_count) – số bản ghi inserted và bị skip (duplicate)
    """
    inserted = 0
    skipped  = 0

    for rec in fact_records:
        try:
            # 1. Resolve dim_channel
            channel_id = get_or_create_channel(conn, rec["_channel_name"])

            # 2. Resolve dim_region
            region_id = get_or_create_region(
                conn, rec["_province"], rec.get("_region", "Khác")
            )

            # 3. Resolve dim_payment_method
            payment_method_id = get_or_create_payment_method(
                conn, rec["_payment_method"]
            )

            # 4. Resolve dim_date
            date_id = get_date_key(conn, rec.get("_order_date"))

            # 5. Upsert dim_customer (SCD2)
            customer_id = upsert_customer_scd2(
                conn,
                phone=rec.get("_customer_phone"),
                name=rec.get("_customer_name", ""),
            )

            # 6. Upsert dim_product (SCD2)
            product_id = upsert_product_scd2(
                conn,
                sku=rec.get("_product_sku", ""),
                product_name=rec.get("_product_name", ""),
                channel_id=channel_id,
            )

            # 7. INSERT fact_sales
            params = {
                "date_id":           date_id,
                "channel_id":        channel_id,
                "product_id":        product_id,
                "customer_id":       customer_id,
                "region_id":         region_id,
                "payment_method_id": payment_method_id,
                "external_order_id": rec["_external_order_id"],
                "order_count":       rec["order_count"],
                "item_quantity":     rec["item_quantity"],
                "gross_revenue":     rec["gross_revenue"],
                "discount_amount":   rec["discount_amount"],
                "net_revenue":       rec["net_revenue"],
                "cost_amount":       rec["cost_amount"],
                "gross_profit":      rec["gross_profit"],
                "profit_margin":     rec.get("profit_margin"),
                "shipping_fee":      rec["shipping_fee"],
                "return_count":      rec["return_count"],
                "return_amount":     rec["return_amount"],
                "order_status":      rec.get("_status", "DELIVERED"),
                "source_system":     rec.get("_source", "unknown"),
            }

            with conn.cursor() as cur:
                cur.execute(FACT_INSERT_SQL, params)
                if cur.rowcount > 0:
                    inserted += 1
                else:
                    skipped += 1

        except Exception as exc:
            logger.error(
                f"Load failed cho external_order_id={rec.get('_external_order_id')}: {exc}",
                exc_info=True,
            )
            # Không raise – tiếp tục với bản ghi tiếp theo
            skipped += 1

    logger.info(f"Load fact_sales: {inserted} inserted, {skipped} skipped/duplicate")
    return inserted, skipped


# ── Mark staging processed ────────────────────────────────────────────────────

def mark_staging_processed(conn, source: str, staging_ids: List[int]) -> int:
    """Đánh dấu is_processed=TRUE cho staging records đã load thành công."""
    if not staging_ids:
        return 0

    table_map = {
        "shopee": "staging.shopee_orders_raw",
        "lazada": "staging.lazada_orders_raw",
    }
    table = table_map.get(source)
    if not table:
        logger.warning(f"Không có staging table cho source='{source}'")
        return 0

    sql = f"UPDATE {table} SET is_processed = TRUE WHERE id = ANY(%s)"
    with conn.cursor() as cur:
        cur.execute(sql, (staging_ids,))
        count = cur.rowcount

    logger.debug(f"Đánh dấu processed {count} bản ghi trong {table}")
    return count


# ── Public interface ──────────────────────────────────────────────────────────

def load_dispatch(
    conn,
    source: str,
    fact_records: List[Dict],
) -> Dict:
    """
    Entry point cho load step trong pipeline.

    Args:
        conn:         psycopg2 connection (đang trong transaction)
        source:       tên nguồn ("shopee", "lazada", ...)
        fact_records: list records từ calculate step

    Returns:
        dict với các số liệu kết quả:
        {
            "inserted":  int,
            "skipped":   int,
            "processed_ids": list[int],   # staging IDs đã đánh dấu
        }
    """
    inserted, skipped = load_fact_records(conn, fact_records)

    # Thu thập staging IDs (dùng _staging_id từ calculate output)
    staging_ids = list({
        rec["_staging_id"]
        for rec in fact_records
        if rec.get("_staging_id") is not None
    })
    processed_count = mark_staging_processed(conn, source, staging_ids)

    return {
        "inserted":      inserted,
        "skipped":       skipped,
        "processed_ids": staging_ids,
        "processed_count": processed_count,
    }
