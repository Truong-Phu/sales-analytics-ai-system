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
  3. facebook_scraper  – Facebook page scraping (mỗi 4 tiếng)

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
    Job scrape bài đăng từ Facebook page mỗi 4 tiếng.
    Chỉ scrape page do người dùng tự tạo và kiểm soát.
    Lỗi job này không ảnh hưởng đến các job khác.
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

        # Đọc danh sách URL từ biến môi trường (ngăn cách bằng dấu phẩy)
        raw_urls  = os.getenv("FACEBOOK_PAGE_URLS", "")
        page_urls = [u.strip() for u in raw_urls.split(",") if u.strip()]

        if not page_urls:
            logger.warning(
                "FacebookScraper Job: FACEBOOK_PAGE_URLS chưa được cấu hình – bỏ qua"
            )
            return

        scraper = FacebookScraper(page_urls=page_urls)
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
            "Chạy: pip install requests beautifulsoup4 lxml psycopg2-binary",
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

    # Job 3: Facebook page scraper – chạy mỗi 4 tiếng
    scheduler.add_job(
        facebook_scraper_job,
        trigger=CronTrigger(hour="*/4", timezone=cfg["timezone"]),
        id="facebook_scraper",
        name="Facebook Page Scraper",
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

    # Xử lý Ctrl+C và SIGTERM sạch sẽ
    def _shutdown(signum, frame):
        logger.info("Nhận tín hiệu dừng – scheduler đang tắt...")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    logger.info(
        "Scheduler khởi động | cron='%s' | timezone=%s | batch_size=%d\n"
        "Jobs: etl_main | google_scraper | facebook_scraper | "
        "raw_clean | raw_normalize | raw_load_dw",
        cfg["cron"], cfg["timezone"], cfg["batch_size"],
    )
    scheduler.start()


if __name__ == "__main__":
    main()
