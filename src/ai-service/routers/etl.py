# -*- coding: utf-8 -*-
"""
ETL Router – Đồng bộ dữ liệu OLTP → Data Warehouse.

Endpoints:
  POST /etl/oltp-to-dw  – Chạy ETL từ public.orders → dw.fact_sales
  GET  /etl/status      – Trạng thái lần sync cuối cùng
"""
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("ai.etl")

router = APIRouter(tags=["ETL"])

# Trạng thái lần sync cuối (lưu in-memory, reset khi restart service)
_last_sync: dict = {}


def _get_etl_path() -> Path:
    """Trả về đường dẫn thư mục src/etl."""
    # routers/etl.py → parents[1] = ai-service/ → parents[2] = src/
    return Path(__file__).resolve().parents[2] / "etl"


def _import_run_oltp_to_dw():
    """
    Import hàm run_oltp_to_dw từ src/etl/offline_etl.py theo đường dẫn tuyệt đối.
    Dùng importlib để tránh xung đột với package names.
    """
    etl_dir = str(_get_etl_path())
    if etl_dir not in sys.path:
        sys.path.insert(0, etl_dir)
    # Import offline_etl trực tiếp
    import importlib.util
    spec   = importlib.util.spec_from_file_location(
        "offline_etl", str(_get_etl_path() / "offline_etl.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.run_oltp_to_dw


class EtlRequest(BaseModel):
    """Body cho POST /etl/oltp-to-dw."""
    channel:    Optional[str] = None  # "SHOPEE" | "TIKTOK_SHOP" | "LAZADA" | None = tất cả
    company_id: Optional[str] = None  # UUID công ty; None → tự resolve từ DB


@router.post("/etl/oltp-to-dw")
def trigger_oltp_to_dw(req: EtlRequest = EtlRequest()):
    """
    Chạy ETL đồng bộ hóa OLTP → Data Warehouse.

    - Đọc public.orders (OLTP) theo company_id + channel.
    - Tính toán metrics tài chính, resolve dim keys.
    - INSERT vào dw.fact_sales (ON CONFLICT DO NOTHING – idempotent).

    Trả về ngay kết quả (synchronous). Với dữ liệu demo (~1150 đơn) hoàn thành < 5s.

    Body (tất cả optional):
    - `channel`: lọc theo kênh ("SHOPEE", "TIKTOK_SHOP", "LAZADA"). None = tất cả kênh.
    - `company_id`: UUID công ty. None = tự resolve từ COMPANY_EMAIL trong env.
    """
    global _last_sync

    triggered_at = datetime.now(timezone.utc).isoformat()
    t_start = time.perf_counter()

    logger.info(
        "ETL trigger: company_id=%s channel=%s",
        req.company_id or "auto", req.channel or "all"
    )

    try:
        run_oltp_to_dw = _import_run_oltp_to_dw()
        result = run_oltp_to_dw(
            company_id=req.company_id,
            channel=req.channel,
        )
    except Exception as exc:
        duration = round(time.perf_counter() - t_start, 2)
        logger.error("ETL oltp-to-dw thất bại: %s", exc, exc_info=True)
        error_resp = {
            "status":       "error",
            "triggered_at": triggered_at,
            "duration_s":   duration,
            "error":        str(exc)[:300],
            "total_orders": 0,
            "inserted":     0,
            "skipped":      0,
        }
        _last_sync = error_resp
        return error_resp

    duration = round(time.perf_counter() - t_start, 2)

    resp = {
        "status":       "success",
        "triggered_at": triggered_at,
        "duration_s":   duration,
        "total_orders": result.get("total_orders", 0),
        "inserted":     result.get("inserted", 0),
        "skipped":      result.get("skipped", 0),
        "channel":      req.channel or "all",
    }

    _last_sync = resp

    logger.info(
        "ETL xong: total=%d inserted=%d skipped=%d (%.2fs)",
        resp["total_orders"], resp["inserted"], resp["skipped"], duration
    )
    return resp


@router.get("/etl/status")
def etl_status():
    """
    Trả về trạng thái lần ETL sync cuối cùng trong session hiện tại.

    Chú ý: được lưu in-memory — reset khi khởi động lại AI Service.
    Dùng để polling sau khi trigger, hoặc để EtlSchedulerJob log kết quả.
    """
    if not _last_sync:
        return {
            "status":       "never_run",
            "message":      "Chưa chạy ETL kể từ khi khởi động service",
            "triggered_at": None,
        }
    return _last_sync
