# -*- coding: utf-8 -*-
"""
Load – Nạp dữ liệu đã transform vào Data Warehouse (Star Schema).

Quy trình:
  1. Lookup / upsert dim_channel, dim_region, dim_payment_method (SCD Type 1)
  2. Upsert dim_customer, dim_product theo SCD Type 2
     (tạo phiên bản mới nếu thuộc tính thay đổi, đánh dấu cũ is_current=FALSE)
  3. Lookup dim_date theo date_key (YYYYMMDD integer – vừa là PK vừa là FK)
  4. INSERT fact_sales với ON CONFLICT (external_order_id) DO NOTHING (dedup)
  5. Đánh dấu staging records là is_processed=TRUE

SCHEMA THỰC TẾ (đã sửa theo PostgreSQL):
  dim_channel       : channel_key (PK), channel_id, channel_name, channel_type, is_online, is_active
  dim_region        : region_key (PK), province, region, country
  dim_payment_method: payment_key (PK), payment_method, payment_type
  dim_date          : date_key (PK integer YYYYMMDD), full_date, day_of_week, day_name,
                      week_number, month_number, month_name, quarter, year, is_weekend, is_holiday
  dim_customer      : customer_key (PK), customer_id, full_name, province, region,
                      is_current, effective_from, effective_to
  dim_product       : product_key (PK), product_id, sku, product_name,
                      is_current, effective_from, effective_to
  fact_sales        : date_key, channel_key, product_key, customer_key,
                      region_key, payment_key, external_order_id, order_count,
                      item_quantity, gross_revenue, discount_amount, net_revenue,
                      cost_amount, gross_profit, profit_margin, shipping_fee,
                      return_count, return_amount
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
    """Trả về channel_key; tạo mới nếu chưa tồn tại.

    dim_channel schema: channel_key (PK serial), channel_id (natural key qua MAX),
    channel_name, channel_type, is_online, is_active
    Không có cột created_at.
    """
    key = channel_name.lower()
    if key in _channel_cache:
        return _channel_cache[key]

    # Xác định channel_type từ tên kênh
    channel_type_map = {
        "shopee":   "SHOPEE",
        "lazada":   "LAZADA",
        "tiktok":   "TIKTOK_SHOP",
        "facebook": "FACEBOOK",
        "website":  "WEBSITE",
    }
    channel_type = channel_type_map.get(key, "OTHER")

    with conn.cursor() as cur:
        # Lookup trước
        cur.execute(
            "SELECT channel_key FROM dw.dim_channel WHERE lower(channel_name) = %s",
            (key,)
        )
        row = cur.fetchone()
        if row:
            channel_key = row[0]
        else:
            # Insert với channel_id = MAX + 1 (không có UNIQUE constraint trên channel_name)
            cur.execute(
                """
                INSERT INTO dw.dim_channel (channel_id, channel_name, channel_type, is_online, is_active)
                VALUES (
                    (SELECT COALESCE(MAX(channel_id), 0) + 1 FROM dw.dim_channel),
                    %s, %s, TRUE, TRUE
                )
                ON CONFLICT DO NOTHING
                RETURNING channel_key
                """,
                (channel_name, channel_type)
            )
            inserted = cur.fetchone()
            if inserted:
                channel_key = inserted[0]
            else:
                # Race condition – đọc lại
                cur.execute(
                    "SELECT channel_key FROM dw.dim_channel WHERE lower(channel_name) = %s",
                    (key,)
                )
                channel_key = cur.fetchone()[0]

    _channel_cache[key] = channel_key
    return channel_key


# ── dim_region (SCD Type 1) ───────────────────────────────────────────────────

_region_cache: Dict[str, int] = {}

# Mapping tỉnh/thành → vùng miền
_PROVINCE_REGION_MAP: Dict[str, str] = {
    "Hà Nội":      "Miền Bắc",
    "Hải Phòng":   "Miền Bắc",
    "Quảng Ninh":  "Miền Bắc",
    "Đà Nẵng":     "Miền Trung",
    "Huế":         "Miền Trung",
    "Hội An":      "Miền Trung",
    "Hồ Chí Minh": "Miền Nam",
    "Cần Thơ":     "Miền Nam",
    "Bình Dương":  "Miền Nam",
    "Đồng Nai":    "Miền Nam",
}


def get_or_create_region(conn, province: str, region: str = "") -> int:
    """Trả về region_key cho province.

    dim_region schema: region_key (PK), province, region, country
    ON CONFLICT (province) DO NOTHING – province là UNIQUE key.
    """
    province = province or "Khác"
    cache_key = province
    if cache_key in _region_cache:
        return _region_cache[cache_key]

    # Xác định vùng nếu không truyền vào
    if not region:
        region = _PROVINCE_REGION_MAP.get(province, "Khác")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT region_key FROM dw.dim_region WHERE province = %s",
            (province,)
        )
        row = cur.fetchone()
        if row:
            region_key = row[0]
        else:
            cur.execute(
                """
                INSERT INTO dw.dim_region (province, region, country)
                VALUES (%s, %s, 'Việt Nam')
                ON CONFLICT (province) DO NOTHING
                RETURNING region_key
                """,
                (province, region)
            )
            inserted = cur.fetchone()
            if inserted:
                region_key = inserted[0]
            else:
                # Race condition – đọc lại
                cur.execute(
                    "SELECT region_key FROM dw.dim_region WHERE province = %s",
                    (province,)
                )
                region_key = cur.fetchone()[0]

    _region_cache[cache_key] = region_key
    return region_key


# ── dim_payment_method (SCD Type 1) ───────────────────────────────────────────

_payment_cache: Dict[str, int] = {}


def get_or_create_payment_method(conn, method_name: str) -> int:
    """Trả về payment_key.

    dim_payment_method schema: payment_key (PK), payment_method, payment_type
    ON CONFLICT (payment_method) DO NOTHING.
    """
    key = method_name.upper() if method_name else "COD"
    if key in _payment_cache:
        return _payment_cache[key]

    # Map loại thanh toán
    type_map = {
        "COD":      "COD",
        "CASH":     "CASH",
        "EWALLET":  "E-WALLET",
        "TRANSFER": "BANK_TRANSFER",
    }
    payment_type = type_map.get(key, "OTHER")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT payment_key FROM dw.dim_payment_method WHERE payment_method = %s",
            (key,)
        )
        row = cur.fetchone()
        if row:
            payment_key = row[0]
        else:
            cur.execute(
                """
                INSERT INTO dw.dim_payment_method (payment_method, payment_type)
                VALUES (%s, %s)
                ON CONFLICT (payment_method) DO NOTHING
                RETURNING payment_key
                """,
                (key, payment_type)
            )
            inserted = cur.fetchone()
            if inserted:
                payment_key = inserted[0]
            else:
                cur.execute(
                    "SELECT payment_key FROM dw.dim_payment_method WHERE payment_method = %s",
                    (key,)
                )
                payment_key = cur.fetchone()[0]

    _payment_cache[key] = payment_key
    return payment_key


# ── dim_date (pre-populated, chỉ lookup – tự insert nếu thiếu) ───────────────

_date_cache: Dict[int, int] = {}


def get_date_key(conn, dt: Optional[datetime]) -> Optional[int]:
    """
    Trả về date_key (integer YYYYMMDD) từ dw.dim_date.

    dim_date schema: date_key (PK integer), full_date, day_of_week, day_name,
    week_number, month_number, month_name, quarter, year, is_weekend, is_holiday.

    Lưu ý: date_key vừa là PK vừa là FK trong fact_sales – không có cột date_id riêng.
    """
    if dt is None:
        return None

    d = dt.date() if isinstance(dt, datetime) else dt
    date_key = int(d.strftime("%Y%m%d"))

    if date_key in _date_cache:
        return _date_cache[date_key]

    date_str = d.isoformat()

    with conn.cursor() as cur:
        # Kiểm tra đã có trong dim_date chưa
        cur.execute(
            "SELECT date_key FROM dw.dim_date WHERE date_key = %s",
            (date_key,)
        )
        row = cur.fetchone()
        if row:
            _date_cache[date_key] = row[0]
            return row[0]

        # Chưa có → insert (edge-case: dim_date thường được pre-populate)
        cur.execute(
            """
            INSERT INTO dw.dim_date (
                date_key, full_date, day_of_week, day_name,
                week_number, month_number, month_name, quarter, year,
                is_weekend, is_holiday
            ) VALUES (
                %s, %s,
                EXTRACT(DOW FROM %s::date)::int,
                TO_CHAR(%s::date, 'Day'),
                EXTRACT(WEEK FROM %s::date)::int,
                EXTRACT(MONTH FROM %s::date)::int,
                TO_CHAR(%s::date, 'Month'),
                EXTRACT(QUARTER FROM %s::date)::int,
                EXTRACT(YEAR FROM %s::date)::int,
                EXTRACT(DOW FROM %s::date) IN (0, 6),
                FALSE
            )
            ON CONFLICT (date_key) DO NOTHING
            RETURNING date_key
            """,
            (date_key, date_str) + (date_str,) * 9
        )
        inserted = cur.fetchone()
        if inserted:
            result = inserted[0]
        else:
            # Race condition – đọc lại
            cur.execute("SELECT date_key FROM dw.dim_date WHERE date_key = %s", (date_key,))
            result = cur.fetchone()[0]

    _date_cache[date_key] = result
    return result


# ── dim_customer (SCD Type 2) ─────────────────────────────────────────────────

def upsert_customer_scd2(conn, phone: Optional[str], name: str,
                         province: str = "Khác",
                         address: Optional[str] = None,
                         district: Optional[str] = None) -> int:
    """
    Upsert dim_customer theo SCD Type 2.

    Business key: full_name + province.
    Nếu tên thay đổi → đóng bản ghi cũ, tạo bản ghi mới (SCD2).
    phone_number, address, district được UPDATE khi đã có bản ghi hiện tại.

    Args:
        phone:    Số điện thoại khách hàng (có thể None).
        name:     Tên khách hàng (full_name).
        province: Tỉnh/thành của khách hàng.
        address:  Địa chỉ chi tiết (số nhà, đường...).
        district: Quận/huyện.
    """
    if not name:
        return _get_or_create_unknown_customer(conn)

    today = _today_utc()
    region = _PROVINCE_REGION_MAP.get(province, "Khác")

    sql_current = """
        SELECT customer_key, full_name
        FROM dw.dim_customer
        WHERE full_name = %s AND province = %s AND is_current = TRUE
        LIMIT 1
    """
    sql_insert = """
        INSERT INTO dw.dim_customer
            (customer_id, full_name, province, region, phone_number, address, district,
             is_current, effective_from, effective_to)
        VALUES (
            (SELECT COALESCE(MAX(customer_id), 0) + 1 FROM dw.dim_customer),
            %s, %s, %s, %s, %s, %s, TRUE, %s, '9999-12-31'
        )
        RETURNING customer_key
    """
    sql_expire = """
        UPDATE dw.dim_customer
        SET effective_to = %s, is_current = FALSE
        WHERE customer_key = %s
    """
    sql_update_contact = """
        UPDATE dw.dim_customer
        SET phone_number = COALESCE(%s, phone_number),
            address      = COALESCE(%s, address),
            district     = COALESCE(%s, district)
        WHERE customer_key = %s
    """

    with conn.cursor() as cur:
        cur.execute(sql_current, (name, province))
        row = cur.fetchone()

        if row is None:
            # Chưa có → insert phiên bản đầu tiên
            cur.execute(sql_insert, (name, province, region, phone, address, district, today))
            return cur.fetchone()[0]

        customer_key, current_name = row
        if current_name != name:
            # Tên thay đổi → SCD Type 2: đóng bản ghi cũ, tạo mới
            cur.execute(sql_expire, (today, customer_key))
            cur.execute(sql_insert, (name, province, region, phone, address, district, today))
            return cur.fetchone()[0]

        # Bản ghi đã tồn tại → cập nhật thông tin liên hệ nếu có thêm dữ liệu
        if any([phone, address, district]):
            cur.execute(sql_update_contact, (phone, address, district, customer_key))

        return customer_key


def _get_or_create_unknown_customer(conn) -> int:
    """Trả về customer_key cho bản ghi 'Khách vãng lai' (tên không xác định)."""
    sql_select = """
        SELECT customer_key FROM dw.dim_customer
        WHERE full_name = 'Khách vãng lai' AND is_current = TRUE
        LIMIT 1
    """
    sql_insert = """
        INSERT INTO dw.dim_customer
            (customer_id, full_name, province, region,
             is_current, effective_from, effective_to)
        VALUES (
            (SELECT COALESCE(MAX(customer_id), 0) + 1 FROM dw.dim_customer),
            'Khách vãng lai', 'Khác', 'Khác', TRUE, '2000-01-01', '9999-12-31'
        )
        RETURNING customer_key
    """
    with conn.cursor() as cur:
        cur.execute(sql_select)
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(sql_insert)
        result = cur.fetchone()
        if result:
            return result[0]
        # Race condition – đọc lại
        cur.execute(sql_select)
        return cur.fetchone()[0]


# ── dim_product (SCD Type 2) ──────────────────────────────────────────────────

def upsert_product_scd2(
    conn,
    sku: str,
    product_name: str,
    channel_id: int = 0,   # Giữ tham số để tương thích – không dùng (dim_product không có channel_id)
) -> int:
    """
    Upsert dim_product theo SCD Type 2.

    dim_product schema: product_key (PK), product_id (natural MAX+1),
    sku, product_name, is_current, effective_from, effective_to.

    Lưu ý: KHÔNG có cột channel_id trong dim_product – business key là sku.
    """
    if not sku:
        return _get_or_create_unknown_product(conn)

    today = _today_utc()

    sql_current = """
        SELECT product_key, product_name
        FROM dw.dim_product
        WHERE sku = %s AND is_current = TRUE
        LIMIT 1
    """
    sql_insert = """
        INSERT INTO dw.dim_product
            (product_id, sku, product_name, is_current, effective_from, effective_to)
        VALUES (
            (SELECT COALESCE(MAX(product_id), 0) + 1 FROM dw.dim_product),
            %s, %s, TRUE, %s, '9999-12-31'
        )
        RETURNING product_key
    """
    sql_expire = """
        UPDATE dw.dim_product
        SET effective_to = %s, is_current = FALSE
        WHERE product_key = %s
    """

    with conn.cursor() as cur:
        cur.execute(sql_current, (sku,))
        row = cur.fetchone()

        if row is None:
            cur.execute(sql_insert, (sku, product_name, today))
            return cur.fetchone()[0]

        product_key, current_name = row
        if current_name != product_name:
            # Tên sản phẩm thay đổi → SCD Type 2
            cur.execute(sql_expire, (today, product_key))
            cur.execute(sql_insert, (sku, product_name, today))
            return cur.fetchone()[0]

        return product_key


def _get_or_create_unknown_product(conn) -> int:
    """Trả về product_key cho sản phẩm không xác định."""
    sql_select = """
        SELECT product_key FROM dw.dim_product
        WHERE sku = 'UNKNOWN' AND is_current = TRUE
        LIMIT 1
    """
    sql_insert = """
        INSERT INTO dw.dim_product
            (product_id, sku, product_name, is_current, effective_from, effective_to)
        VALUES (
            (SELECT COALESCE(MAX(product_id), 0) + 1 FROM dw.dim_product),
            'UNKNOWN', 'Sản phẩm không xác định', TRUE, '2000-01-01', '9999-12-31'
        )
        RETURNING product_key
    """
    with conn.cursor() as cur:
        cur.execute(sql_select)
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(sql_insert)
        result = cur.fetchone()
        if result:
            return result[0]
        cur.execute(sql_select)
        return cur.fetchone()[0]


# ── fact_sales INSERT ─────────────────────────────────────────────────────────

FACT_INSERT_SQL = """
    INSERT INTO dw.fact_sales (
        date_key, channel_key, product_key, customer_key,
        region_key, payment_key,
        external_order_id, order_count, item_quantity,
        gross_revenue, discount_amount, net_revenue,
        cost_amount, gross_profit, profit_margin,
        shipping_fee, return_count, return_amount,
        company_id
    ) VALUES (
        %(date_key)s, %(channel_key)s, %(product_key)s, %(customer_key)s,
        %(region_key)s, %(payment_key)s,
        %(external_order_id)s, %(order_count)s, %(item_quantity)s,
        %(gross_revenue)s, %(discount_amount)s, %(net_revenue)s,
        %(cost_amount)s, %(gross_profit)s, %(profit_margin)s,
        %(shipping_fee)s, %(return_count)s, %(return_amount)s,
        %(company_id)s
    )
    ON CONFLICT (external_order_id) DO NOTHING
"""
# Lưu ý: fact_sales KHÔNG có các cột order_status, source_system, created_at


def load_fact_records(conn, fact_records: List[Dict]) -> Tuple[int, int]:
    """
    Resolve dim keys và INSERT vào fact_sales.

    Args:
        conn:         psycopg2 connection (đang trong transaction)
        fact_records: list records từ transform/calculate step

    Returns:
        (inserted_count, skipped_count) – số bản ghi inserted và bị skip (duplicate)
    """
    inserted = 0
    skipped  = 0

    for rec in fact_records:
        try:
            # 1. Resolve dim_channel → channel_key
            channel_key = get_or_create_channel(conn, rec["_channel_name"])

            # 2. Resolve dim_region → region_key (dùng province)
            region_key = get_or_create_region(
                conn, rec["_province"], rec.get("_region", "")
            )

            # 3. Resolve dim_payment_method → payment_key
            payment_key = get_or_create_payment_method(
                conn, rec["_payment_method"]
            )

            # 4. Resolve dim_date → date_key (integer YYYYMMDD)
            date_key = get_date_key(conn, rec.get("_order_date"))

            # 5. Upsert dim_customer (SCD2) → customer_key
            customer_key = upsert_customer_scd2(
                conn,
                phone=rec.get("_customer_phone"),    # không dùng, giữ tương thích
                name=rec.get("_customer_name", ""),
                province=rec.get("_province", "Khác"),
            )

            # 6. Upsert dim_product (SCD2) → product_key
            product_key = upsert_product_scd2(
                conn,
                sku=rec.get("_product_sku", ""),
                product_name=rec.get("_product_name", ""),
            )

            # 7. INSERT fact_sales – dùng đúng tên cột _key
            params = {
                "date_key":          date_key,
                "channel_key":       channel_key,
                "product_key":       product_key,
                "customer_key":      customer_key,
                "region_key":        region_key,
                "payment_key":       payment_key,
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
                "company_id":        rec.get("_company_id"),
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
        "inserted":        inserted,
        "skipped":         skipped,
        "processed_ids":   staging_ids,
        "processed_count": processed_count,
    }


# ══════════════════════════════════════════════════════════════════════════════
# DataLoader – Load raw web scraping data vào dim_external_source (Mức 2)
# ══════════════════════════════════════════════════════════════════════════════

class DataLoader:
    """
    Load dữ liệu từ raw_google_data và raw_facebook_data
    (đã qua clean + normalize) vào bảng dim_external_source trong DW.

    Dùng INSERT ... ON CONFLICT (content_hash) DO NOTHING để dedup.
    """

    def __init__(self, db_url: str = ""):
        import os
        from dotenv import load_dotenv
        load_dotenv()
        self.db_url = db_url or os.getenv("DATABASE_URL", "")
        if not self.db_url:
            logger.warning("DataLoader: DATABASE_URL chưa cấu hình")

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    def load_google_to_dw(self) -> int:
        """
        Load raw_google_data (is_valid=true, normalized_at IS NOT NULL)
        vào dim_external_source với source_type='google'.

        Dùng content_hash để dedup (ON CONFLICT DO NOTHING).

        Returns:
            int: Số bản ghi đã insert thành công.
        """
        if not self.db_url:
            return 0

        inserted = 0
        try:
            conn = self._get_conn()
            cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute("""
                SELECT id, keyword, title, snippet, url,
                       relevance_score, content_hash,
                       DATE(scraped_at) AS collected_date
                FROM   public.raw_google_data
                WHERE  is_valid     = true
                  AND  normalized_at IS NOT NULL
                ORDER BY scraped_at ASC
            """)
            rows = cur.fetchall()
            logger.info("load_google_to_dw: %d bản ghi cần load", len(rows))

            insert_cur = conn.cursor()
            for row in rows:
                insert_cur.execute(
                    """INSERT INTO public.dim_external_source
                         (source_type, keyword, title, content, url,
                          relevance_score, collected_date, content_hash)
                       VALUES ('google', %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (content_hash) DO NOTHING""",
                    (
                        row["keyword"],
                        row["title"],
                        row["snippet"],
                        row["url"],
                        row["relevance_score"] or 0,
                        row["collected_date"],
                        row["content_hash"],
                    ),
                )
                if insert_cur.rowcount > 0:
                    inserted += 1

            conn.commit()
            cur.close()
            insert_cur.close()
            conn.close()
            logger.info("load_google_to_dw hoàn thành: %d bản ghi đã load", inserted)

        except Exception as e:
            logger.error("load_google_to_dw lỗi: %s", e, exc_info=True)

        return inserted

    def load_facebook_to_dw(self) -> int:
        """
        Load raw_facebook_data (is_valid=true, normalized_at IS NOT NULL)
        vào dim_external_source với source_type='facebook'.

        Returns:
            int: Số bản ghi đã insert thành công.
        """
        if not self.db_url:
            return 0

        inserted = 0
        try:
            conn = self._get_conn()
            cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute("""
                SELECT id, page_name, post_content, post_id,
                       content_hash, DATE(scraped_at) AS collected_date
                FROM   public.raw_facebook_data
                WHERE  is_valid     = true
                  AND  normalized_at IS NOT NULL
                ORDER BY scraped_at ASC
            """)
            rows = cur.fetchall()
            logger.info("load_facebook_to_dw: %d bản ghi cần load", len(rows))

            insert_cur = conn.cursor()
            for row in rows:
                insert_cur.execute(
                    """INSERT INTO public.dim_external_source
                         (source_type, keyword, title, content, url,
                          relevance_score, collected_date, content_hash)
                       VALUES ('facebook', %s, %s, %s, %s, 0, %s, %s)
                       ON CONFLICT (content_hash) DO NOTHING""",
                    (
                        row["page_name"],           # keyword = tên page
                        row["page_name"],           # title = tên page
                        row["post_content"],
                        row.get("post_id") or "",   # url = post_id (không có post_url)
                        row["collected_date"],
                        row["content_hash"],
                    ),
                )
                if insert_cur.rowcount > 0:
                    inserted += 1

            conn.commit()
            cur.close()
            insert_cur.close()
            conn.close()
            logger.info("load_facebook_to_dw hoàn thành: %d bản ghi đã load", inserted)

        except Exception as e:
            logger.error("load_facebook_to_dw lỗi: %s", e, exc_info=True)

        return inserted
