# -*- coding: utf-8 -*-
"""
OfflineETL & ExcelImporter – ETL Mức 3: Import thủ công từ CSV/Excel.

Mục đích:
  - Khi chưa có API credentials thực (Shopee, Lazada, TikTok...) hoặc
    muốn nạp dữ liệu lịch sử từ file xuất Excel/CSV.
  - Idempotent: chạy nhiều lần không duplicate (ON CONFLICT DO NOTHING).

Pipeline:
  CSV/Excel → parse rows → transform → resolve dim keys → INSERT dw.fact_sales

NOTE: Module này bypass load.py và dùng schema thực tế của DB
      (dim_channel.channel_key, dim_region.region_key, v.v.)
"""

import csv
import logging
import os
from datetime import datetime, date, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("etl.offline_etl")

# ── Đường dẫn mặc định ──────────────────────────────────────────────────────────
_SAMPLE_CSV = (
    Path(__file__).resolve().parents[2]
    / "notebooks" / "sample_data" / "sample_orders.csv"
)

# Mapping tỉnh/thành → vùng miền
_PROVINCE_REGION_MAP: Dict[str, str] = {
    "Hà Nội":       "Miền Bắc",
    "Hải Phòng":    "Miền Bắc",
    "Quảng Ninh":   "Miền Bắc",
    "Đà Nẵng":      "Miền Trung",
    "Huế":          "Miền Trung",
    "Hội An":       "Miền Trung",
    "Hồ Chí Minh":  "Miền Nam",
    "Cần Thơ":      "Miền Nam",
    "Bình Dương":   "Miền Nam",
    "Đồng Nai":     "Miền Nam",
}

# In-memory caches để tránh query lặp trong cùng 1 lần chạy
_channel_cache:  Dict[str, int] = {}
_region_cache:   Dict[str, int] = {}
_payment_cache:  Dict[str, int] = {}
_product_cache:  Dict[str, int] = {}
_customer_cache: Dict[str, int] = {}


# ── Helpers parse ────────────────────────────────────────────────────────────────

def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse chuỗi ngày từ CSV sang datetime (UTC)."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


# ── Dim table resolvers (schema thực tế) ─────────────────────────────────────────

def _get_or_create_channel(conn, channel_name: str) -> int:
    """Trả về channel_key từ dw.dim_channel."""
    key = channel_name.lower()
    if key in _channel_cache:
        return _channel_cache[key]

    channel_type_map = {
        "shopee":   "SHOPEE",
        "lazada":   "LAZADA",
        "tiktok":   "TIKTOK_SHOP",
        "facebook": "FACEBOOK",
        "website":  "WEBSITE",
    }
    channel_type = channel_type_map.get(key, "OTHER")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT channel_key FROM dw.dim_channel WHERE lower(channel_name) = %s",
            (key,)
        )
        row = cur.fetchone()
        if row:
            ck = row[0]
        else:
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
                ck = inserted[0]
            else:
                cur.execute(
                    "SELECT channel_key FROM dw.dim_channel WHERE lower(channel_name) = %s",
                    (key,)
                )
                ck = cur.fetchone()[0]

    _channel_cache[key] = ck
    return ck


def _get_or_create_region(conn, province: str) -> int:
    """Trả về region_key từ dw.dim_region."""
    key = province or "Khác"
    if key in _region_cache:
        return _region_cache[key]

    region = _PROVINCE_REGION_MAP.get(key, "Khác")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT region_key FROM dw.dim_region WHERE province = %s",
            (key,)
        )
        row = cur.fetchone()
        if row:
            rk = row[0]
        else:
            cur.execute(
                """
                INSERT INTO dw.dim_region (province, region, country)
                VALUES (%s, %s, 'Việt Nam')
                ON CONFLICT (province) DO NOTHING
                RETURNING region_key
                """,
                (key, region)
            )
            inserted = cur.fetchone()
            if inserted:
                rk = inserted[0]
            else:
                cur.execute(
                    "SELECT region_key FROM dw.dim_region WHERE province = %s",
                    (key,)
                )
                rk = cur.fetchone()[0]

    _region_cache[key] = rk
    return rk


def _get_or_create_payment(conn, method: str) -> int:
    """Trả về payment_key từ dw.dim_payment_method."""
    key = method.upper() if method else "COD"
    if key in _payment_cache:
        return _payment_cache[key]

    type_map = {
        "COD":      "COD",
        "CASH":     "CASH",
        "EWALLET":  "E-WALLET",
        "TRANSFER": "BANK_TRANSFER",
    }
    ptype = type_map.get(key, "OTHER")

    with conn.cursor() as cur:
        cur.execute(
            "SELECT payment_key FROM dw.dim_payment_method WHERE payment_method = %s",
            (key,)
        )
        row = cur.fetchone()
        if row:
            pk = row[0]
        else:
            cur.execute(
                """
                INSERT INTO dw.dim_payment_method (payment_method, payment_type)
                VALUES (%s, %s)
                ON CONFLICT (payment_method) DO NOTHING
                RETURNING payment_key
                """,
                (key, ptype)
            )
            inserted = cur.fetchone()
            if inserted:
                pk = inserted[0]
            else:
                cur.execute(
                    "SELECT payment_key FROM dw.dim_payment_method WHERE payment_method = %s",
                    (key,)
                )
                pk = cur.fetchone()[0]

    _payment_cache[key] = pk
    return pk


def _get_date_key(conn, dt: Optional[datetime]) -> Optional[int]:
    """
    Trả về date_key (YYYYMMDD integer) từ dw.dim_date.
    dim_date.date_key là PK và cũng là FK trong fact_sales.
    """
    if dt is None:
        return None

    d        = dt.date() if isinstance(dt, datetime) else dt
    date_key = int(d.strftime("%Y%m%d"))

    if date_key in _payment_cache:  # reuse cache approach
        return date_key

    with conn.cursor() as cur:
        cur.execute(
            "SELECT date_key FROM dw.dim_date WHERE date_key = %s",
            (date_key,)
        )
        row = cur.fetchone()
        if row:
            return row[0]
        # Ngày chưa có → insert
        date_str = d.isoformat()
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
        return inserted[0] if inserted else date_key


def _get_or_create_customer(conn, customer_name: str, province: str, region: str,
                            phone: str = None, address: str = None, district: str = None) -> int:
    """Trả về customer_key từ dw.dim_customer (SCD1 đơn giản cho offline import)."""
    cache_key = f"{customer_name}|{province}"
    if cache_key in _customer_cache:
        return _customer_cache[cache_key]

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT customer_key FROM dw.dim_customer
            WHERE full_name = %s AND province = %s AND is_current = TRUE
            LIMIT 1
            """,
            (customer_name, province)
        )
        row = cur.fetchone()
        if row:
            ck = row[0]
            # Cập nhật thông tin liên hệ nếu có
            if any([phone, address, district]):
                cur.execute(
                    """
                    UPDATE dw.dim_customer
                    SET phone = COALESCE(%s, phone),
                        address      = COALESCE(%s, address),
                        district     = COALESCE(%s, district)
                    WHERE customer_key = %s
                    """,
                    (phone, address, district, ck)
                )
        else:
            today = date.today().isoformat()
            cur.execute(
                """
                INSERT INTO dw.dim_customer (
                    customer_id, full_name, province, region, phone, address, district,
                    is_current, effective_from, effective_to
                )
                VALUES (
                    (SELECT COALESCE(MAX(customer_id), 0) + 1 FROM dw.dim_customer),
                    %s, %s, %s, %s, %s, %s, TRUE, %s, '9999-12-31'
                )
                RETURNING customer_key
                """,
                (customer_name, province, region, phone, address, district, today)
            )
            ck = cur.fetchone()[0]

    _customer_cache[cache_key] = ck
    return ck


def _get_or_create_product(conn, sku: str, product_name: str) -> int:
    """Trả về product_key từ dw.dim_product."""
    if sku in _product_cache:
        return _product_cache[sku]

    with conn.cursor() as cur:
        cur.execute(
            "SELECT product_key FROM dw.dim_product WHERE sku = %s AND is_current = TRUE LIMIT 1",
            (sku,)
        )
        row = cur.fetchone()
        if row:
            pk = row[0]
        else:
            today = date.today().isoformat()
            cur.execute(
                """
                INSERT INTO dw.dim_product (
                    product_id, sku, product_name, is_current, effective_from, effective_to
                )
                VALUES (
                    (SELECT COALESCE(MAX(product_id), 0) + 1 FROM dw.dim_product),
                    %s, %s, TRUE, %s, '9999-12-31'
                )
                RETURNING product_key
                """,
                (sku, product_name, today)
            )
            pk = cur.fetchone()[0]

    _product_cache[sku] = pk
    return pk


# ── Fact INSERT (schema thực tế) ─────────────────────────────────────────────────

_FACT_SQL = """
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


def _load_offline_records(conn, fact_records: List[Dict]) -> Tuple[int, int]:
    """
    Resolve dim keys và INSERT vào dw.fact_sales theo schema thực tế.

    Returns:
        (inserted, skipped) – số bản ghi insert thành công và bị bỏ qua (duplicate)
    """
    inserted = skipped = 0

    for rec in fact_records:
        try:
            channel_key  = _get_or_create_channel(conn, rec["_channel_name"])
            region_key   = _get_or_create_region(conn, rec["_province"])
            payment_key  = _get_or_create_payment(conn, rec["_payment_method"])
            date_key     = _get_date_key(conn, rec.get("_order_date"))
            customer_key = _get_or_create_customer(
                conn, rec["_customer_name"], rec["_province"],
                _PROVINCE_REGION_MAP.get(rec["_province"], "Khác")
            )
            product_key  = _get_or_create_product(
                conn, rec["_product_sku"], rec["_product_name"]
            )

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
                "company_id":        rec.get("_company_id"),
                "profit_margin":     rec.get("profit_margin"),
                "shipping_fee":      rec["shipping_fee"],
                "return_count":      rec["return_count"],
                "return_amount":     rec["return_amount"],
            }

            with conn.cursor() as cur:
                cur.execute(_FACT_SQL, params)
                if cur.rowcount > 0:
                    inserted += 1
                else:
                    skipped += 1

        except Exception as exc:
            logger.error(
                "Load failed cho %s: %s",
                rec.get("_external_order_id"), exc, exc_info=True
            )
            skipped += 1
            try:
                conn.rollback()
            except Exception:
                pass

    logger.info("_load_offline_records: %d inserted, %d skipped", inserted, skipped)
    return inserted, skipped


# ── CSV row → fact record ─────────────────────────────────────────────────────────

def _row_to_fact_record(row: Dict, company_id: Optional[str] = None) -> Optional[Dict]:
    """
    Chuyển một dòng CSV thành fact_record dict.
    Trả về None nếu dòng thiếu dữ liệu bắt buộc.
    """
    order_id = row.get("order_id", "").strip()
    if not order_id:
        return None

    try:
        unit_price   = float(row.get("unit_price",     0) or 0)
        quantity     = int(row.get("quantity",          1) or 1)
        discount     = float(row.get("discount_amount", 0) or 0)
        shipping_fee = float(row.get("shipping_fee",    0) or 0)
    except (ValueError, TypeError):
        logger.warning("Dòng %s: giá trị số không hợp lệ, bỏ qua", order_id)
        return None

    gross_revenue = unit_price * quantity
    net_revenue   = gross_revenue - discount
    cost_amount   = gross_revenue * 0.60      # ước tính 60% giá vốn
    gross_profit  = net_revenue - cost_amount
    profit_margin = round((gross_profit / net_revenue * 100) if net_revenue > 0 else 0, 2)

    province = (row.get("province") or "Khác").strip()

    return {
        "_external_order_id": order_id,
        "_channel_name":      (row.get("channel") or "website").strip().lower(),
        "_customer_name":     (row.get("customer_name") or "").strip(),
        "_customer_phone":    (row.get("customer_phone") or "").strip(),
        "_product_sku":       (row.get("product_sku") or "").strip(),
        "_product_name":      (row.get("product_name") or "").strip(),
        "_order_date":        _parse_date(row.get("order_date", "")),
        "_province":          province,
        "_payment_method":    (row.get("payment_method") or "COD").strip().upper(),
        "_status":            (row.get("status") or "DELIVERED").strip().upper(),
        "_company_id":        company_id,
        # Metrics
        "order_count":   1,
        "item_quantity": quantity,
        "gross_revenue": gross_revenue,
        "discount_amount": discount,
        "net_revenue":   net_revenue,
        "cost_amount":   cost_amount,
        "gross_profit":  gross_profit,
        "profit_margin": profit_margin,
        "shipping_fee":  shipping_fee,
        "return_count":  0,
        "return_amount": 0.0,
    }


# ── ExcelImporter ────────────────────────────────────────────────────────────────

class ExcelImporter:
    """
    Import đơn hàng từ CSV hoặc Excel vào dw.fact_sales.

    Idempotent: ON CONFLICT (external_order_id) DO NOTHING.

    Ví dụ:
        stats = ExcelImporter().import_orders("exports/orders_q4_2025.csv")
        # {'extracted': 25, 'imported': 24, 'skipped': 1, 'errors': 0}
    """

    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL", "")

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    def import_orders(self, filepath: str, company_id: Optional[str] = None) -> Dict:
        """
        Đọc file CSV/Excel và load vào dw.fact_sales.

        Args:
            filepath: Đường dẫn file CSV hoặc Excel (.csv, .xlsx).
            company_id: UUID công ty. Nếu None → tự resolve từ COMPANY_EMAIL.

        Returns:
            dict: {'extracted', 'imported', 'skipped', 'errors'}
        """
        path  = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File không tồn tại: {path.resolve()}")

        # Resolve company_id nếu chưa có
        if not company_id and self.db_url:
            try:
                _conn = psycopg2.connect(self.db_url)
                _cur  = _conn.cursor()
                _cur.execute(
                    "SELECT id FROM public.companies WHERE email = %s LIMIT 1",
                    (os.getenv("COMPANY_EMAIL", "contact@phuthinh.vn"),)
                )
                row0 = _cur.fetchone()
                if row0:
                    company_id = str(row0[0])
                _cur.close()
                _conn.close()
            except Exception as e:
                logger.warning("Không lấy được company_id: %s", e)

        rows  = self._read_file(path)
        stats = {"extracted": len(rows), "imported": 0, "skipped": 0, "errors": 0}

        if not rows:
            logger.warning("File rỗng: %s", path.name)
            return stats

        # Transform
        fact_records = []
        for row in rows:
            rec = _row_to_fact_record(row, company_id)
            if rec is None:
                stats["errors"] += 1
            else:
                fact_records.append(rec)

        if not fact_records or not self.db_url:
            if not self.db_url:
                logger.error("DATABASE_URL chưa cấu hình")
                stats["errors"] += len(fact_records)
            return stats

        # Load
        try:
            # Reset caches mỗi lần import để tránh stale data
            _channel_cache.clear()
            _region_cache.clear()
            _payment_cache.clear()
            _product_cache.clear()
            _customer_cache.clear()

            conn = self._get_conn()
            inserted, skipped = _load_offline_records(conn, fact_records)
            conn.commit()
            conn.close()
            stats["imported"] = inserted
            stats["skipped"] += skipped
            logger.info(
                "[%s] extracted=%d, imported=%d, skipped=%d, errors=%d",
                path.name, stats["extracted"], inserted, skipped, stats["errors"]
            )
        except Exception as exc:
            logger.error("import_orders lỗi: %s", exc, exc_info=True)
            stats["errors"] += len(fact_records)

        return stats

    def _read_file(self, path: Path) -> List[Dict]:
        """Đọc CSV hoặc Excel thành list[dict]."""
        suffix = path.suffix.lower()

        if suffix in (".csv", ".txt"):
            rows = []
            with open(path, encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    rows.append({k.strip(): v.strip() for k, v in row.items() if k})
            return rows

        elif suffix in (".xlsx", ".xls"):
            try:
                import openpyxl
            except ImportError:
                raise ImportError("Cần openpyxl: pip install openpyxl")
            wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            header = [str(h).strip() if h else "" for h in next(rows_iter)]
            rows = []
            for row in rows_iter:
                d = {header[i]: str(v).strip() if v is not None else ""
                     for i, v in enumerate(row) if i < len(header)}
                rows.append(d)
            wb.close()
            return rows
        else:
            raise ValueError(f"Định dạng file không hỗ trợ: {suffix}")


# ── OfflineETL ────────────────────────────────────────────────────────────────────

class OfflineETL:
    """
    ETL Mức 3: Chạy ETL hoàn chỉnh từ sample_orders.csv → dw.fact_sales.

    Dùng khi chưa có API credentials hoặc demo/test hệ thống.
    """

    def __init__(self, csv_path: Optional[str] = None):
        self.csv_path = Path(csv_path) if csv_path else _SAMPLE_CSV
        self.importer = ExcelImporter()

    def run(self) -> Dict:
        """
        Chạy full ETL: CSV → fact_sales.

        Returns:
            dict: {'source', 'extracted', 'imported', 'skipped', 'errors', 'status'}
        """
        logger.info("=== OfflineETL bắt đầu: %s ===", self.csv_path.name)

        if not self.csv_path.exists():
            logger.error("File không tồn tại: %s", self.csv_path)
            return {
                "source": str(self.csv_path), "extracted": 0,
                "imported": 0, "skipped": 0, "errors": 1, "status": "error",
            }

        try:
            stats = self.importer.import_orders(str(self.csv_path))
            stats["source"] = self.csv_path.name
            stats["status"] = "success"
            logger.info(
                "=== OfflineETL xong: imported=%d, skipped=%d ===",
                stats["imported"], stats["skipped"]
            )
        except Exception as exc:
            logger.error("OfflineETL lỗi: %s", exc, exc_info=True)
            stats = {
                "source": self.csv_path.name, "extracted": 0,
                "imported": 0, "skipped": 0, "errors": 1, "status": "error",
            }

        return stats


# ── OLTP → DW (direct path, bypass staging) ─────────────────────────────────────

def run_oltp_to_dw(company_id: Optional[str] = None, channel: Optional[str] = None) -> dict:
    """
    Đọc public.orders (OLTP) và push vào dw.fact_sales.

    Dùng sau khi import JSON/API trực tiếp vào OLTP mà không qua staging.
    Idempotent: ON CONFLICT (external_order_id) DO NOTHING.

    Args:
        company_id: UUID công ty (bỏ trống → dùng COMPANY_EMAIL mặc định).
        channel: Lọc theo channel_type ('SHOPEE', 'TIKTOK_SHOP', 'LAZADA').
                 None = tất cả kênh.
    Returns:
        dict: {'total_orders', 'inserted', 'skipped'}
    """
    import sys as _sys
    _sys.path.insert(0, os.path.dirname(__file__))
    from import_common import DB_DSN, COMPANY_EMAIL  # type: ignore

    _CHANNEL_MAP = {
        "SHOPEE":      "shopee",
        "TIKTOK_SHOP": "tiktok",
        "LAZADA":      "lazada",
        "FACEBOOK":    "facebook",
        "WEBSITE":     "website",
    }

    conn = psycopg2.connect(DB_DSN)

    # -- Resolve actual company UUID ------------------------------------------
    with conn.cursor() as _c:
        if company_id:
            actual_company_id = company_id
        else:
            _c.execute(
                "SELECT id FROM public.companies WHERE email = %s LIMIT 1",
                (COMPANY_EMAIL,)
            )
            row0 = _c.fetchone()
            actual_company_id = str(row0[0]) if row0 else None

    # -- Lấy danh sách order từ OLTP ------------------------------------------
    where_parts = ["o.company_id = (SELECT id FROM public.companies WHERE email = %s)"]
    params: list = [COMPANY_EMAIL]

    if channel:
        where_parts.append("sc.channel_type = %s")
        params.append(channel.upper())

    where_clause = " AND ".join(where_parts)

    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT
                o.order_id,
                o.external_order_id,
                sc.channel_type,
                c.full_name,
                c.province,
                o.payment_method,
                o.order_date,
                o.status,
                o.total_amount,
                o.discount_amount,
                o.shipping_fee
            FROM public.orders o
            JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
            JOIN public.customers      c  ON o.customer_id = c.customer_id
            WHERE {where_clause}
            ORDER BY o.order_date
        """, params)
        orders = cur.fetchall()

    print(f"  [run_oltp_to_dw] Tim thay {len(orders)} don hang → chuyen len DW...")

    fact_records: List[Dict] = []

    for row in orders:
        (order_id, ext_id, channel_type, cust_name, province, payment_method,
         order_date, status, total_amount, discount_amount, shipping_fee) = row

        # -- Lấy product + tổng số lượng từ order_items -----------------------
        with conn.cursor() as cur2:
            cur2.execute("""
                SELECT
                    p.sku,
                    p.product_name,
                    SUM(oi.quantity)                       AS total_qty,
                    SUM(oi.unit_price * oi.quantity)       AS gross_rev,
                    COALESCE(SUM(p.cost_price * oi.quantity), 0) AS total_cost
                FROM public.order_items oi
                JOIN public.products p ON oi.product_id = p.product_id
                WHERE oi.order_id = %s
                GROUP BY p.sku, p.product_name
                ORDER BY gross_rev DESC
                LIMIT 1
            """, (order_id,))
            item_row = cur2.fetchone()

        if item_row:
            sku, prod_name, total_qty, gross_rev, total_cost = item_row
        else:
            sku, prod_name = "UNKNOWN", "Unknown Product"
            total_qty = 1
            gross_rev = float(total_amount or 0)
            total_cost = gross_rev * 0.6

        gross_revenue = float(gross_rev  or total_amount or 0)
        net_revenue   = float(total_amount or 0)
        cost_amount   = float(total_cost) if total_cost else gross_revenue * 0.6
        gross_profit  = net_revenue - cost_amount
        profit_margin = round((gross_profit / net_revenue * 100) if net_revenue > 0 else 0, 2)
        is_returned   = (status == "RETURNED")

        fact_records.append({
            "_external_order_id": ext_id or f"ORDER_{order_id}",
            "_channel_name":      _CHANNEL_MAP.get(channel_type, channel_type.lower()),
            "_customer_name":     cust_name or "Khach hang",
            "_product_sku":       sku,
            "_product_name":      prod_name,
            "_order_date":        order_date,
            "_province":          province or "Khac",
            "_payment_method":    payment_method or "COD",
            "_company_id":        actual_company_id,
            "order_count":    1,
            "item_quantity":  int(total_qty or 1),
            "gross_revenue":  round(gross_revenue, 2),
            "discount_amount": round(float(discount_amount or 0), 2),
            "net_revenue":    round(net_revenue, 2),
            "cost_amount":    round(cost_amount, 2),
            "gross_profit":   round(gross_profit, 2),
            "profit_margin":  profit_margin,
            "shipping_fee":   round(float(shipping_fee or 0), 2),
            "return_count":   1 if is_returned else 0,
            "return_amount":  round(net_revenue, 2) if is_returned else 0.0,
        })

    # Reset cache trước khi load để tránh stale data
    _channel_cache.clear()
    _region_cache.clear()
    _payment_cache.clear()
    _product_cache.clear()
    _customer_cache.clear()

    inserted, skipped = _load_offline_records(conn, fact_records)
    conn.commit()
    conn.close()

    logger.info(
        "run_oltp_to_dw: total_orders=%d, inserted=%d, skipped=%d",
        len(orders), inserted, skipped,
    )
    return {"total_orders": len(orders), "inserted": inserted, "skipped": skipped}


# ── Chạy trực tiếp ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
    etl = OfflineETL()
    result = etl.run()
    print("\nKết quả OfflineETL:")
    for k, v in result.items():
        print(f"  {k}: {v}")
