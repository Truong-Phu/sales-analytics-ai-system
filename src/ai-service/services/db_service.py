# -*- coding: utf-8 -*-
"""Kết nối và truy vấn PostgreSQL.

Chiến lược:
1. Thử đọc từ DW (dw.fact_sales / dw.fact_orders) trước — hiệu quả hơn.
2. Nếu DW trống hoặc lỗi → fallback sang OLTP (public.orders + public.order_items).
   Đây là nguồn luôn có dữ liệu thật ngay cả khi ETL chưa chạy.
"""
import logging
import os

import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
logger = logging.getLogger("ai.db")


# ── Kết nối ──────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DATABASE_URL)


def query_df(sql: str, params=None) -> pd.DataFrame:
    """Chạy SQL và trả về DataFrame. Không ném exception — log và trả DataFrame rỗng."""
    try:
        with get_conn() as conn:
            return pd.read_sql(sql, conn, params=params)
    except Exception as e:
        logger.error("DB query error: %s", e)
        return pd.DataFrame()


# ── OLTP queries (public schema) ─────────────────────────────────────────────

SQL_OLTP_DAILY_REVENUE = """
    SELECT
        DATE(o.order_date)   AS ds,
        SUM(oi.subtotal)     AS y
    FROM public.orders o
    JOIN public.order_items oi ON o.order_id = oi.order_id
    WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
      {channel_filter}
      {company_filter}
    GROUP BY DATE(o.order_date)
    ORDER BY ds
"""

SQL_OLTP_ORDER_COUNTS = """
    SELECT
        DATE(o.order_date)   AS date,
        c.channel_name       AS channel,
        SUM(oi.subtotal)     AS daily_revenue,
        COUNT(o.order_id)    AS order_count
    FROM public.orders o
    JOIN public.order_items oi ON o.order_id = oi.order_id
    JOIN public.sales_channels c ON o.channel_id = c.channel_id
    WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
      {company_filter}
    GROUP BY DATE(o.order_date), c.channel_name
    ORDER BY date, channel
"""


def _oltp_params(channel: str = None, company_id: str = None) -> tuple[str, str, dict]:
    """Tạo filter clauses và params cho OLTP query."""
    params = {}
    ch_filter  = ""
    cmp_filter = ""
    if channel:
        ch_filter = "AND c.channel_name = %(channel)s"
        params["channel"] = channel
    if company_id:
        cmp_filter = "AND o.company_id = %(company_id)s"
        params["company_id"] = company_id
    return ch_filter, cmp_filter, params


def load_revenue_from_oltp(channel: str = None, company_id: str = None) -> pd.DataFrame:
    """Đọc chuỗi doanh thu ngày từ OLTP (public schema)."""
    ch_filter, cmp_filter, params = _oltp_params(channel, company_id)
    # OLTP không có cột channel nếu không join — chỉ join khi lọc theo channel
    if channel:
        sql = SQL_OLTP_DAILY_REVENUE.format(
            channel_filter="JOIN public.sales_channels c ON o.channel_id = c.channel_id\n" + ch_filter,
            company_filter=cmp_filter,
        )
    else:
        sql = SQL_OLTP_DAILY_REVENUE.format(
            channel_filter="",
            company_filter=cmp_filter,
        )
    df = query_df(sql, params or None)
    if df.empty:
        return df
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"]  = df["y"].astype(float)
    return df.dropna().sort_values("ds").reset_index(drop=True)


def load_revenue_by_channel_from_oltp(company_id: str = None) -> pd.DataFrame:
    """Đọc doanh thu theo ngày + kênh từ OLTP."""
    _, cmp_filter, params = _oltp_params(company_id=company_id)
    sql = SQL_OLTP_ORDER_COUNTS.format(company_filter=cmp_filter)
    df = query_df(sql, params or None)
    if df.empty:
        return df
    df["date"]          = pd.to_datetime(df["date"])
    df["daily_revenue"] = df["daily_revenue"].astype(float)
    return df.sort_values(["date", "channel"]).reset_index(drop=True)


# ── DW queries (dw schema) ────────────────────────────────────────────────────

SQL_DW_DAILY_REVENUE = """
    SELECT
        dd.full_date          AS ds,
        SUM(fs.net_revenue)   AS y
    FROM dw.fact_sales fs
    JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
    JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
    WHERE 1=1
      {channel_filter}
    GROUP BY dd.full_date
    ORDER BY dd.full_date
"""


def _dw_available() -> bool:
    """Kiểm tra xem DW có dữ liệu không."""
    try:
        df = query_df("SELECT COUNT(*) AS cnt FROM dw.fact_sales")
        return not df.empty and int(df["cnt"].iloc[0]) > 0
    except Exception:
        return False


def load_revenue_series(channel: str = None, company_id: str = None) -> pd.DataFrame:
    """
    Load chuỗi doanh thu (ds, y):
    - Ưu tiên DW nếu có dữ liệu
    - Fallback sang OLTP khi DW trống hoặc lỗi
    """
    # Thử DW trước
    if _dw_available():
        try:
            ch_filter = f"AND dc.channel_name = %(channel)s" if channel else ""
            sql    = SQL_DW_DAILY_REVENUE.format(channel_filter=ch_filter)
            params = {"channel": channel} if channel else None
            df = query_df(sql, params)
            if not df.empty:
                df["ds"] = pd.to_datetime(df["ds"])
                df["y"]  = df["y"].astype(float)
                logger.info("Loaded %d ngày từ DW", len(df))
                return df.dropna().sort_values("ds").reset_index(drop=True)
        except Exception as e:
            logger.warning("DW query failed: %s — fallback sang OLTP", e)

    # Fallback: OLTP
    logger.info("DW trống hoặc lỗi — đọc từ OLTP")
    df = load_revenue_from_oltp(channel=channel, company_id=company_id)
    if not df.empty:
        logger.info("Loaded %d ngày từ OLTP", len(df))
    return df
