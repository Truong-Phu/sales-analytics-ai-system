# -*- coding: utf-8 -*-
"""Kết nối và truy vấn PostgreSQL Data Warehouse."""
import os
import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")


def get_conn():
    return psycopg2.connect(DATABASE_URL)


def query_df(sql: str, params=None) -> pd.DataFrame:
    """Chạy SQL và trả về DataFrame."""
    with get_conn() as conn:
        return pd.read_sql(sql, conn, params=params)


# SQL lấy doanh thu theo ngày (dùng chung cho forecast + trend + anomaly)
SQL_DAILY_REVENUE = """
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


def load_revenue_series(channel: str = None) -> pd.DataFrame:
    """
    Trả về chuỗi doanh thu ngày (ds, y) từ Data Warehouse.
    Nếu channel truyền vào thì lọc theo kênh.
    """
    if channel:
        channel_filter = "AND dc.channel_name = %(channel)s"
        params = {"channel": channel}
    else:
        channel_filter = ""
        params = None

    sql = SQL_DAILY_REVENUE.format(channel_filter=channel_filter)
    df = query_df(sql, params)
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"]  = df["y"].astype(float)
    return df.dropna().reset_index(drop=True)
