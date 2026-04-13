# -*- coding: utf-8 -*-
"""
Tiện ích kết nối PostgreSQL dùng psycopg2.
Đọc chuỗi kết nối từ biến môi trường DATABASE_URL hoặc từng biến riêng.
"""
import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from dotenv import load_dotenv
from .logger import get_logger

load_dotenv()
logger = get_logger("db")

# Ưu tiên DATABASE_URL, fallback sang từng biến riêng
DATABASE_URL = os.getenv("DATABASE_URL") or (
    f"postgresql://{os.getenv('DB_USER', 'postgres')}:"
    f"{os.getenv('DB_PASSWORD', '')}@"
    f"{os.getenv('DB_HOST', 'localhost')}:"
    f"{os.getenv('DB_PORT', '5432')}/"
    f"{os.getenv('DB_NAME', 'sales_analytics_ai_db')}"
)


@contextmanager
def get_conn():
    """
    Context manager trả về connection PostgreSQL.
    Tự động commit khi không có lỗi, rollback khi có exception.

    Cách dùng:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
    """
    conn = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        if conn:
            conn.close()


def upsert_watermark(job_name: str, entity_type: str, last_sync_at) -> None:
    """
    Cập nhật watermark (mốc thời gian sync cuối) cho một ETL job.
    Dùng INSERT ... ON CONFLICT DO UPDATE để upsert.
    """
    sql = """
        INSERT INTO public.etl_watermarks (job_id, entity_type, last_sync_at)
        SELECT ej.job_id, %(entity)s, %(ts)s
        FROM   public.etl_jobs ej
        WHERE  ej.job_name = %(job)s
        ON CONFLICT (job_id, entity_type)
        DO UPDATE SET last_sync_at = EXCLUDED.last_sync_at,
                      updated_at   = NOW()
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"job": job_name, "entity": entity_type, "ts": last_sync_at})
    logger.debug(f"Watermark updated: job={job_name}, entity={entity_type}, ts={last_sync_at}")


def get_watermark(job_name: str, entity_type: str):
    """
    Đọc watermark hiện tại của một ETL job.
    Trả về datetime hoặc None nếu chưa có.
    """
    sql = """
        SELECT w.last_sync_at
        FROM   public.etl_watermarks w
        JOIN   public.etl_jobs ej ON ej.job_id = w.job_id
        WHERE  ej.job_name = %(job)s AND w.entity_type = %(entity)s
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"job": job_name, "entity": entity_type})
            row = cur.fetchone()
    return row[0] if row else None
