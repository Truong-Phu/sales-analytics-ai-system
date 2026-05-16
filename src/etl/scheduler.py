# -*- coding: utf-8 -*-
"""
Scheduler – Tự động chạy ETL pipeline và scraper theo lịch cron.

Cấu hình qua biến môi trường:
  DATABASE_URL          – PostgreSQL DSN
  ETL_SCHEDULE_CRON     – Cron expression (mặc định: "0 */6 * * *" = mỗi 6 tiếng)
  ETL_BATCH_SIZE        – Số bản ghi mỗi batch (mặc định: 500)
  ETL_TIMEZONE          – Timezone (mặc định: "Asia/Ho_Chi_Minh")
  FACEBOOK_PAGE_URLS    – Danh sách URL page Facebook ngăn cách bằng dấu phẩy

Jobs đang chạy:
  1. etl_main          – ETL pipeline chính (mỗi 6 tiếng, configurable)
  2. google_scraper    – Google Search scraping (mỗi 2 tiếng)
  3. facebook_daily_scrape – Facebook page scraping (6:00 sáng mỗi ngày)

  ETL Mức 2 (sau mỗi lần scrape – clean → normalize → calculate → load DW):
  4. raw_clean         – Lọc raw data theo rules chất lượng (30 phút sau scrape)
  5. raw_normalize     – Chuẩn hóa data đã clean (45 phút sau scrape)
  6. raw_load_dw       – Tính relevance + load vào DW (60 phút sau scrape)

  Pipeline Mức 2 cũng chạy độc lập mỗi 3 tiếng để xử lý backlog.

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
    """Job function được APScheduler gọi theo lịch – ETL pipeline chính."""
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


def google_scraper_job() -> None:
    """
    Job scrape kết quả Google Search mỗi 2 tiếng.
    Thu thập xu hướng thị trường, từ khóa liên quan đến bán hàng.
    Lỗi job này không ảnh hưởng đến các job khác.
    """
    logger.info("=== GoogleScraper Job bắt đầu ===")
    try:
        # Import lazy để tránh lỗi nếu thư viện chưa cài
        import sys
        import importlib.util

        # Tìm đường dẫn đến api-integration
        api_integration_path = os.path.join(
            os.path.dirname(__file__), "..", "api-integration"
        )
        if api_integration_path not in sys.path:
            sys.path.insert(0, os.path.abspath(api_integration_path))

        from connectors.google_scraper import GoogleScraper

        scraper = GoogleScraper()
        result  = scraper.run()
        logger.info(
            "=== GoogleScraper Job hoàn thành: scrape=%d | lưu=%d | bỏ qua=%d ===",
            result.get("total_scraped", 0),
            result.get("inserted", 0),
            result.get("skipped", 0),
        )
    except ImportError as e:
        logger.error(
            "GoogleScraper Job: thiếu thư viện – %s. "
            "Chạy: pip install requests beautifulsoup4 lxml fake-useragent psycopg2-binary",
            e,
        )
    except Exception as exc:
        logger.error("GoogleScraper Job thất bại: %s", exc, exc_info=True)


def facebook_scraper_job() -> None:
    """
    Job scrape bài đăng Facebook Page qua Graph API.
    Chạy lúc 6:00 sáng mỗi ngày (xem lịch trong main()).
    Token và Page ID đọc từ .env: FACEBOOK_PAGE_TOKEN, FACEBOOK_PAGE_ID.
    Khi thiếu token → log hướng dẫn chi tiết, không crash job.
    """
    logger.info("=== FacebookScraper Job bắt đầu ===")
    try:
        import sys

        api_integration_path = os.path.join(
            os.path.dirname(__file__), "..", "api-integration"
        )
        if api_integration_path not in sys.path:
            sys.path.insert(0, os.path.abspath(api_integration_path))

        from connectors.facebook_scraper import FacebookScraper

        # FacebookScraper đọc FACEBOOK_PAGE_TOKEN + FACEBOOK_PAGE_ID từ .env
        # run() xử lý gracefully khi thiếu token (log hướng dẫn, trả về empty)
        scraper = FacebookScraper()
        result  = scraper.run()
        logger.info(
            "=== FacebookScraper Job hoàn thành: scrape=%d | lưu=%d | bỏ qua=%d ===",
            result.get("total_scraped", 0),
            result.get("inserted", 0),
            result.get("skipped", 0),
        )
    except ImportError as e:
        logger.error(
            "FacebookScraper Job: thiếu thư viện – %s. "
            "Chạy: pip install requests psycopg2-binary python-dotenv",
            e,
        )
    except Exception as exc:
        logger.error("FacebookScraper Job thất bại: %s", exc, exc_info=True)


def raw_clean_job() -> None:
    """
    Job 4: Lọc raw_google_data và raw_facebook_data theo rules chất lượng.
    Chạy 30 phút sau Google scraper job.
    Cũng chạy độc lập mỗi 3 tiếng để xử lý backlog.
    """
    logger.info("=== RawDataCleaner Job bắt đầu ===")
    try:
        from etl.transform.clean import RawDataCleaner

        cleaner = RawDataCleaner()
        cleaner.add_missing_columns()

        n_google   = cleaner.clean_google_batch()
        n_facebook = cleaner.clean_facebook_batch()

        logger.info(
            "=== RawDataCleaner Job hoàn thành: Google=%d | Facebook=%d ===",
            n_google, n_facebook,
        )
    except ImportError as e:
        logger.error("RawDataCleaner Job: thiếu thư viện – %s", e)
    except Exception as exc:
        logger.error("RawDataCleaner Job thất bại: %s", exc, exc_info=True)


def raw_normalize_job() -> None:
    """
    Job 5: Chuẩn hóa raw data đã clean (is_valid=true).
    Chạy 45 phút sau Google scraper job (15 phút sau clean job).
    """
    logger.info("=== RawDataNormalizer Job bắt đầu ===")
    try:
        from etl.transform.normalize import RawDataNormalizer

        norm = RawDataNormalizer()
        norm.add_missing_columns()

        n_google   = norm.normalize_google()
        n_facebook = norm.normalize_facebook()

        logger.info(
            "=== RawDataNormalizer Job hoàn thành: Google=%d | Facebook=%d ===",
            n_google, n_facebook,
        )
    except ImportError as e:
        logger.error("RawDataNormalizer Job: thiếu thư viện – %s", e)
    except Exception as exc:
        logger.error("RawDataNormalizer Job thất bại: %s", exc, exc_info=True)


def raw_load_dw_job() -> None:
    """
    Job 6: Tính relevance score + load dữ liệu sạch vào dim_external_source (DW).
    Chạy 60 phút sau Google scraper job (15 phút sau normalize job).
    """
    logger.info("=== RawLoadDW Job bắt đầu ===")
    try:
        from etl.transform.calculate import RelevanceCalculator
        from etl.load import DataLoader

        # Bước 1: Tính relevance score
        calc = RelevanceCalculator()
        calc.add_missing_columns()
        # Dùng từ khóa mặc định phổ biến cho việc scoring
        default_keywords = [
            "bán chạy", "sản phẩm", "doanh thu", "thương mại điện tử",
            "shopee", "lazada", "tiktok", "xu hướng",
        ]
        n_scored = calc.calculate_google_relevance(default_keywords)

        # Bước 2: Load vào DW
        loader   = DataLoader()
        n_google = loader.load_google_to_dw()
        n_fb     = loader.load_facebook_to_dw()

        logger.info(
            "=== RawLoadDW Job hoàn thành: scored=%d | google_dw=%d | fb_dw=%d ===",
            n_scored, n_google, n_fb,
        )
    except ImportError as e:
        logger.error("RawLoadDW Job: thiếu thư viện – %s", e)
    except Exception as exc:
        logger.error("RawLoadDW Job thất bại: %s", exc, exc_info=True)


def oltp_etl_failsafe_job() -> None:
    """
    Job 7: Failsafe ETL – đảm bảo DW luôn sync với OLTP.
    Chạy mỗi 6 tiếng tại phút thứ 5 (5 phút sau etl_main).
    Dùng run_oltp_to_dw() để đọc trực tiếp OLTP → DW, không qua staging.
    """
    logger.info("=== OLTP→DW Failsafe ETL bắt đầu ===")
    try:
        etl_path = os.path.dirname(__file__)
        if etl_path not in sys.path:
            sys.path.insert(0, etl_path)
        from offline_etl import run_oltp_to_dw  # type: ignore
        result = run_oltp_to_dw()
        logger.info(
            "=== OLTP→DW Failsafe hoàn thành: orders=%d | inserted=%d | skipped=%d ===",
            result.get("total_orders", 0),
            result.get("inserted", 0),
            result.get("skipped", 0),
        )
    except Exception as exc:
        logger.error("OLTP→DW Failsafe thất bại: %s", exc, exc_info=True)


def staging_cleanup_job() -> None:
    """
    Job 8: Dọn dẹp staging data cũ hơn 7 ngày.
    Chạy lúc 2:00 AM hàng ngày để tiết kiệm storage.
    """
    logger.info("=== Staging Cleanup bắt đầu ===")
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        logger.error("Staging Cleanup: DATABASE_URL chưa cấu hình")
        return
    try:
        import psycopg2  # type: ignore
        conn = psycopg2.connect(dsn)
        tables = [
            "staging.shopee_orders_raw",
            "staging.lazada_orders_raw",
            "staging.tiktok_orders_raw",
        ]
        total_deleted = 0
        with conn.cursor() as cur:
            for tbl in tables:
                try:
                    cur.execute(
                        f"DELETE FROM {tbl} WHERE created_at < NOW() - INTERVAL '7 days'"
                    )
                    n = cur.rowcount
                    total_deleted += n
                    if n > 0:
                        logger.info("  Xóa %d bản ghi cũ từ %s", n, tbl)
                except Exception as tbl_exc:
                    logger.warning("  Bỏ qua %s: %s", tbl, tbl_exc)
        conn.commit()
        conn.close()
        logger.info("=== Staging Cleanup hoàn thành: xóa %d bản ghi ===", total_deleted)
    except Exception as exc:
        logger.error("Staging Cleanup thất bại: %s", exc, exc_info=True)


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
        name="ETL Pipeline chính",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )

    # Job 2: Google Search scraper – chạy mỗi 2 tiếng
    scheduler.add_job(
        google_scraper_job,
        trigger=CronTrigger(hour="*/2", timezone=cfg["timezone"]),
        id="google_scraper",
        name="Google Search Scraper",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job 3: Facebook Page scraper – chạy lúc 6:00 sáng mỗi ngày
    scheduler.add_job(
        facebook_scraper_job,
        trigger=CronTrigger(hour=6, minute=0, timezone=cfg["timezone"]),
        id="facebook_daily_scrape",
        name="Facebook Page Scraper (6:00 sáng hàng ngày)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # ── ETL Mức 2 ─────────────────────────────────────────────────────────
    # Job 4: Clean – 30 phút sau Google scraper (vd: giờ lẻ + 30 phút)
    # Cũng chạy mỗi 3 tiếng để xử lý backlog
    scheduler.add_job(
        raw_clean_job,
        trigger=CronTrigger(hour="*/3", minute=30, timezone=cfg["timezone"]),
        id="raw_clean",
        name="Raw Data Cleaner (Mức 2)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job 5: Normalize – 15 phút sau clean
    scheduler.add_job(
        raw_normalize_job,
        trigger=CronTrigger(hour="*/3", minute=45, timezone=cfg["timezone"]),
        id="raw_normalize",
        name="Raw Data Normalizer (Mức 2)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job 6: Load DW – 15 phút sau normalize (đúng 1 tiếng sau clean)
    # Chạy mỗi 3 tiếng tại phút 0 của giờ tiếp theo
    scheduler.add_job(
        raw_load_dw_job,
        trigger=CronTrigger(hour="1,4,7,10,13,16,19,22", minute=0, timezone=cfg["timezone"]),
        id="raw_load_dw",
        name="Raw → DW Loader (Mức 2)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Job 7: OLTP→DW failsafe – mỗi 6 tiếng tại phút 5 (sau etl_main)
    scheduler.add_job(
        oltp_etl_failsafe_job,
        trigger=CronTrigger(minute=5, hour="*/6", timezone=cfg["timezone"]),
        id="oltp_etl_failsafe",
        name="OLTP→DW Failsafe ETL (*/6h phút 5)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )

    # Job 8: Staging cleanup – 2:00 AM hàng ngày
    scheduler.add_job(
        staging_cleanup_job,
        trigger=CronTrigger(hour=2, minute=0, timezone=cfg["timezone"]),
        id="staging_cleanup",
        name="Staging Data Cleanup (2:00 AM hàng ngày)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    # Xử lý Ctrl+C và SIGTERM sạch sẽ
    def _shutdown(signum, frame):
        logger.info("Nhận tín hiệu dừng – scheduler đang tắt...")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    logger.info(
        "Scheduler khởi động | cron='%s' | timezone=%s | batch_size=%d\n"
        "Jobs: etl_main | google_scraper (*/2h) | facebook_daily_scrape (6:00) | "
        "raw_clean | raw_normalize | raw_load_dw | "
        "oltp_etl_failsafe (*/6h phút 5) | staging_cleanup (2:00 AM)",
        cfg["cron"], cfg["timezone"], cfg["batch_size"],
    )
    scheduler.start()


if __name__ == "__main__":
    main()
