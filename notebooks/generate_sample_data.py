#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_sample_data.py
Đọc dữ liệu thực tế từ PostgreSQL DW và xuất ra file CSV để train Prophet.
Yêu cầu: .env với DATABASE_URL hoặc DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
"""
import os
import sys
import logging
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
import psycopg2

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent.parent / ".env")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

def get_connection():
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return psycopg2.connect(db_url)
    return psycopg2.connect(
        host    = os.getenv("DB_HOST", "localhost"),
        port    = int(os.getenv("DB_PORT", 5432)),
        dbname  = os.getenv("DB_NAME", "salesanalytics"),
        user    = os.getenv("DB_USER", "postgres"),
        password= os.getenv("DB_PASSWORD", ""),
    )

def export_sales_timeseries(conn) -> pd.DataFrame:
    """Xuất chuỗi thời gian doanh thu ngày — định dạng Prophet (ds, y)."""
    sql = """
        SELECT
            dd.full_date           AS ds,
            SUM(fs.revenue_amount) AS y,
            dc.channel_name        AS channel
        FROM dw.fact_sales fs
        JOIN dw.dim_date    dd ON dd.date_key    = fs.date_key
        LEFT JOIN dw.dim_channel dc ON dc.channel_key = fs.channel_key
        GROUP BY dd.full_date, dc.channel_name
        ORDER BY dd.full_date
    """
    df = pd.read_sql(sql, conn, parse_dates=["ds"])
    df["ds"] = df["ds"].dt.strftime("%Y-%m-%d")
    df["y"]  = df["y"].astype(float)
    return df

def export_all_channels(conn, df_full: pd.DataFrame) -> pd.DataFrame:
    """Tổng hợp tất cả kênh — chuỗi thời gian tổng doanh thu."""
    agg = df_full.groupby("ds")["y"].sum().reset_index()
    agg = agg.dropna(subset=["ds", "y"]).drop_duplicates("ds").sort_values("ds")
    return agg

def export_by_channel(conn, df_full: pd.DataFrame) -> pd.DataFrame:
    """Doanh thu theo từng kênh — pivot."""
    pivot = df_full.pivot_table(index="ds", columns="channel", values="y", aggfunc="sum").reset_index()
    pivot.columns.name = None
    return pivot

def export_by_product(conn) -> pd.DataFrame:
    """Top sản phẩm — doanh thu theo ngày."""
    sql = """
        SELECT
            dd.full_date               AS date,
            dp.product_name,
            SUM(fs.revenue_amount)     AS revenue,
            SUM(fs.item_quantity)      AS qty_sold
        FROM dw.fact_sales fs
        JOIN dw.dim_date    dd ON dd.date_key    = fs.date_key
        JOIN dw.dim_product dp ON dp.product_key = fs.product_key
        GROUP BY dd.full_date, dp.product_name
        ORDER BY dd.full_date, revenue DESC
    """
    return pd.read_sql(sql, conn, parse_dates=["date"])

def main():
    log.info("Kết nối PostgreSQL DW...")
    try:
        conn = get_connection()
    except Exception as e:
        log.error("Không thể kết nối DB: %s", e)
        sys.exit(1)

    try:
        # Bước 1: Xuất chuỗi thời gian theo kênh
        log.info("Đang đọc fact_sales từ DW...")
        df_full = export_sales_timeseries(conn)
        log.info("  → %d bản ghi theo ngày-kênh", len(df_full))

        # Bước 2: Tổng hợp tất cả kênh
        df_ts = export_all_channels(conn, df_full)
        out_ts = OUTPUT_DIR / "sales_timeseries.csv"
        df_ts.to_csv(out_ts, index=False, encoding="utf-8")
        log.info("Xuất sales_timeseries.csv: %d dòng → %s", len(df_ts), out_ts)

        if len(df_ts) < 30:
            log.warning("Chỉ có %d ngày dữ liệu — Prophet cần tối thiểu 30 ngày để train tốt!", len(df_ts))

        # Bước 3: Theo kênh
        df_ch = export_by_channel(conn, df_full)
        out_ch = OUTPUT_DIR / "sales_by_channel.csv"
        df_ch.to_csv(out_ch, index=False, encoding="utf-8")
        log.info("Xuất sales_by_channel.csv: %d dòng → %s", len(df_ch), out_ch)

        # Bước 4: Theo sản phẩm
        df_pr = export_by_product(conn)
        out_pr = OUTPUT_DIR / "sales_by_product.csv"
        df_pr.to_csv(out_pr, index=False, encoding="utf-8")
        log.info("Xuất sales_by_product.csv: %d dòng → %s", len(df_pr), out_pr)

    except Exception as e:
        log.error("Lỗi khi xuất dữ liệu: %s", e)
        sys.exit(1)
    finally:
        conn.close()

    log.info("Hoàn tất generate_sample_data.py")

if __name__ == "__main__":
    main()
