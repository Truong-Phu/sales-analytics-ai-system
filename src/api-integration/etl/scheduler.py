# -*- coding: utf-8 -*-
"""
Scheduler – Lên lịch đồng bộ dữ liệu cho tất cả tenant.

Luồng:
  1. Lấy danh sách tất cả integrations đang active (status='connected')
  2. Với mỗi company + platform → tạo connector, chạy sync_orders
  3. Lỗi per-company được catch riêng (không ảnh hưởng company khác)
  4. Ghi log_sync vào bảng integrations

Cách chạy:
    python -m src.api-integration.etl.scheduler

Yêu cầu: pip install APScheduler
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("scheduler")


def run_sync_for_company(company_id: str, platform: str, integration_id: str) -> None:
    """
    Chạy sync cho một company + platform.
    Bắt mọi exception để không ảnh hưởng các job khác.
    """
    from ..connectors.connector_factory import ConnectorFactory
    from ..connectors.exceptions import IntegrationNotFoundError, SyncError
    from ..connectors.integration_repository import IntegrationRepository

    repo = IntegrationRepository()
    try:
        logger.info(f"[Scheduler] Bắt đầu sync: company={company_id}, platform={platform}")
        connector = ConnectorFactory.get_connector(platform, company_id)
        records   = connector.sync_orders(lookback_days=1)
        repo.log_sync(
            integration_id=integration_id,
            company_id=company_id,
            status="connected",
            records_synced=records,
        )
        logger.info(
            f"[Scheduler] Sync thành công: company={company_id}, platform={platform}, records={records}"
        )

    except IntegrationNotFoundError as exc:
        repo.update_status(integration_id, "disconnected", str(exc))
        logger.warning(f"[Scheduler] Integration not found: {exc}")

    except SyncError as exc:
        repo.log_sync(
            integration_id=integration_id,
            company_id=company_id,
            status="error",
            records_synced=0,
            error=str(exc),
        )
        logger.error(f"[Scheduler] Sync error: {exc}")

    except Exception as exc:
        repo.log_sync(
            integration_id=integration_id,
            company_id=company_id,
            status="error",
            records_synced=0,
            error=str(exc),
        )
        logger.error(
            f"[Scheduler] Unexpected error: company={company_id}, platform={platform}, error={exc}"
        )


def run_all_syncs() -> None:
    """
    Chạy sync cho tất cả integrations đang active.
    Được gọi bởi APScheduler mỗi N phút (theo sync_frequency_minutes từ DB).
    """
    from ..connectors.integration_repository import IntegrationRepository

    repo         = IntegrationRepository()
    integrations = repo.get_all_active()

    if not integrations:
        logger.info("[Scheduler] Không có integration nào đang active")
        return

    logger.info(f"[Scheduler] Bắt đầu sync {len(integrations)} integrations")

    for integ in integrations:
        run_sync_for_company(
            company_id=integ["company_id"],
            platform=integ["platform"],
            integration_id=integ["id"],
        )

    logger.info("[Scheduler] Hoàn thành tất cả sync jobs")


def start_scheduler(default_interval_minutes: int = 60) -> None:
    """
    Khởi động APScheduler với interval mặc định.
    Mỗi integration có thể có sync_frequency_minutes riêng (chưa implement).
    """
    try:
        from apscheduler.schedulers.blocking import BlockingScheduler
    except ImportError:
        logger.error(
            "APScheduler chưa được cài. Chạy: pip install APScheduler"
        )
        return

    scheduler = BlockingScheduler(timezone="Asia/Ho_Chi_Minh")
    scheduler.add_job(
        run_all_syncs,
        trigger="interval",
        minutes=default_interval_minutes,
        id="sync_all_integrations",
        name="Sync tất cả kênh bán hàng",
        misfire_grace_time=300,   # Cho phép trễ tối đa 5 phút
        coalesce=True,            # Chỉ chạy 1 lần nếu bị dồn
    )

    logger.info(
        f"[Scheduler] Khởi động – sync mỗi {default_interval_minutes} phút"
    )

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("[Scheduler] Dừng lại")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s – %(message)s",
    )
    # Có thể chạy thủ công 1 lần: python -m src.api-integration.etl.scheduler --once
    import sys
    if "--once" in sys.argv:
        run_all_syncs()
    else:
        start_scheduler()
