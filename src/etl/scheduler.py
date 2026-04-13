# -*- coding: utf-8 -*-
"""
Scheduler – Tự động chạy ETL pipeline theo lịch cron.

Cấu hình qua biến môi trường:
  DATABASE_URL          – PostgreSQL DSN
  ETL_SCHEDULE_CRON     – Cron expression (mặc định: "0 */6 * * *" = mỗi 6 tiếng)
  ETL_BATCH_SIZE        – Số bản ghi mỗi batch (mặc định: 500)
  ETL_TIMEZONE          – Timezone (mặc định: "Asia/Ho_Chi_Minh")

Chạy:
  python -m etl.scheduler
"""
import logging
import os
import signal
import sys

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

from etl.pipeline import run_once

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("etl.scheduler")


def _get_config() -> dict:
    """Đọc cấu hình từ biến môi trường."""
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise EnvironmentError("DATABASE_URL chưa được cấu hình.")

    return {
        "dsn":        dsn,
        "cron":       os.getenv("ETL_SCHEDULE_CRON", "0 */6 * * *"),
        "batch_size": int(os.getenv("ETL_BATCH_SIZE", "500")),
        "timezone":   os.getenv("ETL_TIMEZONE", "Asia/Ho_Chi_Minh"),
    }


def etl_job(dsn: str, batch_size: int) -> None:
    """Job function được APScheduler gọi theo lịch."""
    logger.info("=== ETL Job bắt đầu ===")
    try:
        result = run_once(dsn=dsn, batch_size=batch_size)
        total_inserted = sum(
            v.get("inserted", 0) for v in result.get("sources", {}).values()
        )
        logger.info(
            f"=== ETL Job hoàn thành | {result.get('duration_s', 0)}s "
            f"| Tổng inserted: {total_inserted} ==="
        )
    except Exception as exc:
        logger.error(f"ETL Job thất bại: {exc}", exc_info=True)


def main() -> None:
    """Khởi động scheduler."""
    cfg = _get_config()
    scheduler = BlockingScheduler(timezone=cfg["timezone"])

    trigger = CronTrigger.from_crontab(cfg["cron"], timezone=cfg["timezone"])
    scheduler.add_job(
        etl_job,
        trigger=trigger,
        kwargs={"dsn": cfg["dsn"], "batch_size": cfg["batch_size"]},
        id="etl_main",
        name="ETL Pipeline",
        max_instances=1,            # Không chạy song song nhiều instance
        coalesce=True,              # Nếu bị miss → chỉ chạy 1 lần
        misfire_grace_time=600,     # Chấp nhận trễ tối đa 10 phút
    )

    # Xử lý Ctrl+C và SIGTERM sạch sẽ
    def _shutdown(signum, frame):
        logger.info("Nhận tín hiệu dừng – scheduler đang tắt...")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    logger.info(
        f"Scheduler khởi động | cron='{cfg['cron']}' | "
        f"timezone={cfg['timezone']} | batch_size={cfg['batch_size']}"
    )
    scheduler.start()


if __name__ == "__main__":
    main()
