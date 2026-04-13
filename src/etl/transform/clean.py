# -*- coding: utf-8 -*-
"""
Clean – Làm sạch và validate dữ liệu từ staging.

Các bước:
  1. Loại bỏ bản ghi thiếu trường bắt buộc
  2. Chuẩn hóa kiểu dữ liệu (string → float, timestamp → datetime)
  3. Ghi log bản ghi bị loại bỏ (để audit)
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Tuple

logger = logging.getLogger("etl.transform.clean")

# ── Shopee ────────────────────────────────────────────────────────────────────

SHOPEE_REQUIRED = {"order_sn", "total_amount", "order_status"}


def clean_shopee(rows: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Làm sạch danh sách đơn hàng Shopee.

    Returns:
        (valid_rows, rejected_rows) – bản ghi hợp lệ và bị loại bỏ
    """
    valid, rejected = [], []

    for row in rows:
        reasons = []

        # Kiểm tra trường bắt buộc
        for field in SHOPEE_REQUIRED:
            if not row.get(field):
                reasons.append(f"thiếu {field}")

        # Kiểm tra total_amount >= 0
        try:
            amount = float(row.get("total_amount", 0) or 0)
            if amount < 0:
                reasons.append(f"total_amount âm ({amount})")
            row["total_amount"] = amount
        except (ValueError, TypeError):
            reasons.append(f"total_amount không hợp lệ: {row.get('total_amount')}")

        # Kiểm tra item_list không rỗng
        items = row.get("item_list", [])
        if not items:
            reasons.append("item_list trống")

        # Chuyển Unix timestamp → datetime UTC
        for ts_field in ("create_time", "update_time", "pay_time"):
            val = row.get(ts_field)
            if val and isinstance(val, (int, float)):
                row[ts_field] = datetime.fromtimestamp(val, tz=timezone.utc)
            elif val and isinstance(val, str):
                try:
                    row[ts_field] = datetime.fromtimestamp(float(val), tz=timezone.utc)
                except (ValueError, TypeError):
                    row[ts_field] = None

        if reasons:
            row["_reject_reasons"] = reasons
            rejected.append(row)
            logger.warning(
                f"Shopee order {row.get('order_sn')} bị loại: {'; '.join(reasons)}"
            )
        else:
            valid.append(row)

    logger.info(f"Clean Shopee: {len(valid)} hợp lệ, {len(rejected)} bị loại")
    return valid, rejected


# ── Lazada ────────────────────────────────────────────────────────────────────

LAZADA_REQUIRED = {"order_id", "price"}


def clean_lazada(rows: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """Làm sạch danh sách đơn hàng Lazada."""
    valid, rejected = [], []

    for row in rows:
        reasons = []

        for field in LAZADA_REQUIRED:
            if not row.get(field):
                reasons.append(f"thiếu {field}")

        try:
            row["price"] = float(str(row.get("price", 0)).replace(",", "") or 0)
            if row["price"] < 0:
                reasons.append("price âm")
        except (ValueError, TypeError):
            reasons.append(f"price không hợp lệ: {row.get('price')}")

        if reasons:
            row["_reject_reasons"] = reasons
            rejected.append(row)
            logger.warning(
                f"Lazada order {row.get('order_id')} bị loại: {'; '.join(reasons)}"
            )
        else:
            valid.append(row)

    logger.info(f"Clean Lazada: {len(valid)} hợp lệ, {len(rejected)} bị loại")
    return valid, rejected


def clean_dispatch(source: str, rows: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """Dispatch clean theo nguồn dữ liệu."""
    dispatch = {
        "shopee": clean_shopee,
        "lazada": clean_lazada,
    }
    fn = dispatch.get(source)
    if not fn:
        logger.warning(f"Không có clean function cho source='{source}'")
        return rows, []
    return fn(rows)
