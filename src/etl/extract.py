# -*- coding: utf-8 -*-
"""
Extract – Đọc dữ liệu chưa xử lý từ staging tables.

Quy trình:
  1. Đọc các bản ghi có is_processed = FALSE từ staging
  2. Parse JSON fields (item_list, raw_payload, recipient_address)
  3. Trả về list[dict] để bước Transform xử lý tiếp

Staging tables:
  - staging.shopee_orders_raw
  - staging.lazada_orders_raw
"""
import json
import logging
from typing import Dict, List, Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger("etl.extract")

# Số bản ghi đọc tối đa mỗi lần chạy (tránh quá tải RAM)
BATCH_SIZE = 500


def _parse_json_fields(row: Dict, json_cols: List[str]) -> Dict:
    """Parse các cột JSON string thành dict/list."""
    for col in json_cols:
        val = row.get(col)
        if isinstance(val, str) and val.strip():
            try:
                row[col] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                row[col] = {}
        elif val is None:
            row[col] = {}
    return row


def extract_shopee(conn, batch_size: int = BATCH_SIZE) -> List[Dict]:
    """
    Đọc đơn hàng Shopee chưa xử lý từ staging.shopee_orders_raw.

    Args:
        conn: psycopg2 connection
        batch_size: Số bản ghi tối đa mỗi lần đọc

    Returns:
        list[dict] – Danh sách đơn hàng thô (chưa transform)
    """
    sql = """
        SELECT id, order_sn, shop_id, order_status,
               buyer_user_id, buyer_username,
               total_amount, currency, payment_method,
               shipping_carrier, actual_shipping_fee,
               pay_time, create_time, update_time,
               recipient_address, item_list, raw_payload,
               fetched_at, company_id
        FROM staging.shopee_orders_raw
        WHERE is_processed = FALSE
        ORDER BY fetched_at ASC
        LIMIT %(limit)s
        FOR UPDATE SKIP LOCKED
    """
    # FOR UPDATE SKIP LOCKED: an toàn khi nhiều worker chạy song song
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"limit": batch_size})
        rows = [dict(r) for r in cur.fetchall()]

    json_cols = ["recipient_address", "item_list", "raw_payload"]
    rows = [_parse_json_fields(r, json_cols) for r in rows]

    logger.info(f"Extract Shopee: {len(rows)} bản ghi chưa xử lý")
    return rows


def extract_lazada(conn, batch_size: int = BATCH_SIZE) -> List[Dict]:
    """
    Đọc đơn hàng Lazada chưa xử lý từ staging.lazada_orders_raw.
    """
    sql = """
        SELECT id, order_id, order_number, order_status,
               price, payment_method,
               customer_first_name, customer_last_name,
               shipping_address, items,
               created_at, updated_at, raw_payload, fetched_at, company_id
        FROM staging.lazada_orders_raw
        WHERE is_processed = FALSE
        ORDER BY fetched_at ASC
        LIMIT %(limit)s
        FOR UPDATE SKIP LOCKED
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"limit": batch_size})
        rows = [dict(r) for r in cur.fetchall()]

    json_cols = ["shipping_address", "items", "raw_payload"]
    rows = [_parse_json_fields(r, json_cols) for r in rows]

    logger.info(f"Extract Lazada: {len(rows)} bản ghi chưa xử lý")
    return rows


def extract_all(conn, batch_size: int = BATCH_SIZE) -> Dict[str, List[Dict]]:
    """
    Đọc tất cả staging tables, trả về dict phân theo kênh.

    Returns:
        {
            "shopee": [...],
            "lazada": [...],
        }
    """
    return {
        "shopee": extract_shopee(conn, batch_size),
        "lazada": extract_lazada(conn, batch_size),
    }


def mark_processed(conn, table: str, ids: List[int]) -> int:
    """
    Đánh dấu is_processed = TRUE cho các bản ghi đã xử lý thành công.

    Args:
        conn: psycopg2 connection
        table: tên bảng staging (VD: 'staging.shopee_orders_raw')
        ids: danh sách id cần đánh dấu

    Returns:
        Số bản ghi đã cập nhật
    """
    if not ids:
        return 0
    sql = f"UPDATE {table} SET is_processed = TRUE WHERE id = ANY(%s)"
    with conn.cursor() as cur:
        cur.execute(sql, (ids,))
        count = cur.rowcount
    logger.debug(f"Đã đánh dấu is_processed=TRUE: {count} bản ghi trong {table}")
    return count


def count_pending(conn) -> Dict[str, int]:
    """Đếm số bản ghi chưa xử lý trong từng staging table (để monitoring)."""
    result = {}
    tables = [
        ("shopee", "staging.shopee_orders_raw"),
        ("lazada", "staging.lazada_orders_raw"),
    ]
    with conn.cursor() as cur:
        for name, table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table} WHERE is_processed = FALSE")
            result[name] = cur.fetchone()[0]
    return result
