# -*- coding: utf-8 -*-
"""
Pipeline – Orchestrate toàn bộ quy trình ETL.

Thứ tự: Extract → Clean → Normalize → Calculate → Load

Mỗi lần chạy pipeline xử lý một batch (mặc định 500 bản ghi / nguồn).
Sau khi load thành công → đánh dấu staging là is_processed=TRUE và commit.
Nếu có lỗi → rollback, log error, không mất dữ liệu staging.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

import psycopg2

from etl.extract import extract_all
from etl.transform.clean import clean_dispatch
from etl.transform.normalize import normalize_dispatch
from etl.transform.calculate import calculate_dispatch
from etl.load import load_dispatch

logger = logging.getLogger("etl.pipeline")

# Mặc định không có giá vốn sản phẩm; có thể inject từ bảng products
DEFAULT_PRODUCT_COSTS: Dict[str, float] = {}


def _get_db_conn(dsn: str):
    """Tạo psycopg2 connection với autocommit=False (manual transaction)."""
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    return conn


def run_pipeline(
    dsn: str,
    batch_size: int = 500,
    product_costs: Optional[Dict[str, float]] = None,
    dry_run: bool = False,
) -> Dict:
    """
    Chạy một lần ETL pipeline cho tất cả các nguồn.

    Args:
        dsn:           PostgreSQL DSN (connection string)
        batch_size:    Số bản ghi tối đa mỗi nguồn mỗi lần chạy
        product_costs: dict {sku: cost_price} để tính giá vốn
        dry_run:       Nếu True → không commit (dùng để test)

    Returns:
        dict tổng hợp kết quả:
        {
            "started_at":  str,
            "finished_at": str,
            "duration_s":  float,
            "sources": {
                "shopee": {"extracted": int, "clean_valid": int, "inserted": int, ...},
                "lazada": {...},
            }
        }
    """
    product_costs = product_costs or DEFAULT_PRODUCT_COSTS
    started_at = datetime.now(timezone.utc)
    report: Dict = {
        "started_at": started_at.isoformat(),
        "sources": {},
    }

    conn = _get_db_conn(dsn)
    try:
        # ── Step 1: Extract ───────────────────────────────────────────────────
        logger.info("=== ETL Pipeline START ===")
        all_data = extract_all(conn, batch_size)

        for source, raw_rows in all_data.items():
            src_report: Dict = {"extracted": len(raw_rows)}

            if not raw_rows:
                logger.info(f"[{source}] Không có dữ liệu mới. Bỏ qua.")
                src_report.update({"clean_valid": 0, "inserted": 0, "skipped": 0})
                report["sources"][source] = src_report
                continue

            logger.info(f"[{source}] Extracted {len(raw_rows)} bản ghi.")

            # ── Step 2: Clean ─────────────────────────────────────────────────
            valid_rows, rejected_rows = clean_dispatch(source, raw_rows)
            src_report["clean_valid"]    = len(valid_rows)
            src_report["clean_rejected"] = len(rejected_rows)
            logger.info(
                f"[{source}] Clean: {len(valid_rows)} hợp lệ, "
                f"{len(rejected_rows)} bị loại."
            )

            if not valid_rows:
                report["sources"][source] = src_report
                continue

            # ── Step 3: Normalize ─────────────────────────────────────────────
            normalized_rows = normalize_dispatch(source, valid_rows)
            logger.info(f"[{source}] Normalize xong {len(normalized_rows)} bản ghi.")

            # ── Step 4: Calculate ─────────────────────────────────────────────
            fact_records = calculate_dispatch(source, normalized_rows, product_costs)
            src_report["fact_records"] = len(fact_records)
            logger.info(f"[{source}] Calculate: {len(fact_records)} fact records.")

            # ── Step 5: Load ──────────────────────────────────────────────────
            if dry_run:
                logger.info(f"[{source}] DRY RUN – bỏ qua load.")
                src_report.update({"inserted": 0, "skipped": 0, "dry_run": True})
            else:
                load_result = load_dispatch(conn, source, fact_records)
                src_report.update({
                    "inserted":        load_result["inserted"],
                    "skipped":         load_result["skipped"],
                    "processed_count": load_result["processed_count"],
                })
                logger.info(
                    f"[{source}] Load: {load_result['inserted']} inserted, "
                    f"{load_result['skipped']} skipped."
                )

            report["sources"][source] = src_report

        # ── Commit toàn bộ transaction nếu không có lỗi ───────────────────────
        if not dry_run:
            conn.commit()
            logger.info("ETL Pipeline COMMIT thành công.")
        else:
            conn.rollback()
            logger.info("DRY RUN – ROLLBACK.")

    except Exception as exc:
        conn.rollback()
        logger.error(f"ETL Pipeline FAILED – ROLLBACK: {exc}", exc_info=True)
        report["error"] = str(exc)
        raise
    finally:
        conn.close()

    finished_at = datetime.now(timezone.utc)
    report["finished_at"] = finished_at.isoformat()
    report["duration_s"]  = round((finished_at - started_at).total_seconds(), 2)

    logger.info(
        f"=== ETL Pipeline DONE | {report['duration_s']}s | "
        + " | ".join(
            f"{src}: {v.get('inserted', 0)} rows"
            for src, v in report["sources"].items()
        )
        + " ==="
    )
    return report


def run_once(dsn: str, **kwargs) -> Dict:
    """Alias cho run_pipeline – dùng trong APScheduler job."""
    return run_pipeline(dsn, **kwargs)
