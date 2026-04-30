# -*- coding: utf-8 -*-
"""
health_check.py – Kiểm tra trạng thái kết nối tất cả connectors.

Kết quả trả về dict tổng hợp, được dùng bởi:
  - GET /api/datasync/status (ASP.NET Backend → gọi Python health check)
  - DataSyncPage frontend để hiển thị trạng thái thật (không hardcode)
  - Trực tiếp: python health_check.py

Mỗi connector trả về: {"connected": bool, "message": str, ...extra}
KHÔNG raise exception – luôn trả về connected=False nếu lỗi.
"""

import logging
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv

# Load env từ repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_REPO_ROOT / ".env")

logger = logging.getLogger(__name__)

_TZ_VN = timezone(timedelta(hours=7))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_check(fn, name: str) -> dict:
    """Wrapper bắt mọi exception trong quá trình check, trả về dict an toàn."""
    try:
        result = fn()
        if not isinstance(result, dict):
            result = {"connected": bool(result), "message": str(result)}
        return result
    except Exception as e:
        logger.warning("health_check '%s' gặp lỗi: %s", name, e)
        return {"connected": False, "message": str(e)}


def _missing_env(*keys: str) -> str | None:
    """Trả về tên key đầu tiên còn thiếu, hoặc None nếu đủ hết."""
    for k in keys:
        if not os.getenv(k, "").strip():
            return k
    return None


# ── Kiểm tra từng connector ────────────────────────────────────────────────────

def check_shopee() -> dict:
    """
    Shopee Open API v2
    URL: https://partner.shopeemobile.com/api/v2/
    Cần: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_ACCESS_TOKEN, SHOPEE_SHOP_ID
    """
    missing = _missing_env("SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY",
                           "SHOPEE_ACCESS_TOKEN", "SHOPEE_SHOP_ID")
    if missing:
        return {"connected": False, "message": f"Thiếu {missing} trong .env",
                "api_url": "https://partner.shopeemobile.com/api/v2/"}

    try:
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from connectors.shopee import ShopeeConnector
        conn = ShopeeConnector()
        conn.authenticate()
        return {"connected": True, "message": "Shopee API kết nối thành công",
                "api_url": "https://partner.shopeemobile.com/api/v2/"}
    except Exception as e:
        return {"connected": False, "message": str(e),
                "api_url": "https://partner.shopeemobile.com/api/v2/"}


def check_lazada() -> dict:
    """
    Lazada Open Platform
    URL: https://api.lazada.vn/rest
    Cần: LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_ACCESS_TOKEN
    """
    missing = _missing_env("LAZADA_APP_KEY", "LAZADA_APP_SECRET", "LAZADA_ACCESS_TOKEN")
    if missing:
        return {"connected": False, "message": f"Thiếu {missing} trong .env",
                "api_url": "https://api.lazada.vn/rest"}

    try:
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from connectors.lazada import LazadaConnector
        conn = LazadaConnector()
        conn.authenticate()
        return {"connected": True, "message": "Lazada API kết nối thành công",
                "api_url": "https://api.lazada.vn/rest"}
    except Exception as e:
        return {"connected": False, "message": str(e),
                "api_url": "https://api.lazada.vn/rest"}


def check_tiktok_shop() -> dict:
    """
    TikTok Shop Partner API
    URL: https://open-api.tiktokglobalshop.com/
    Cần: TIKTOK_APP_KEY, TIKTOK_APP_SECRET, TIKTOK_ACCESS_TOKEN
    """
    missing = _missing_env("TIKTOK_APP_KEY", "TIKTOK_APP_SECRET", "TIKTOK_ACCESS_TOKEN")
    if missing:
        return {"connected": False, "message": f"Thiếu {missing} trong .env",
                "api_url": "https://open-api.tiktokglobalshop.com/"}

    try:
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from connectors.tiktok_shop import TikTokShopConnector
        conn = TikTokShopConnector()
        conn.authenticate()
        return {"connected": True, "message": "TikTok Shop API kết nối thành công",
                "api_url": "https://open-api.tiktokglobalshop.com/"}
    except Exception as e:
        return {"connected": False, "message": str(e),
                "api_url": "https://open-api.tiktokglobalshop.com/"}


def check_ghn() -> dict:
    """
    GHN (Giao Hàng Nhanh) API v2
    URL: https://online-gateway.ghn.vn/shiip/public-api/
    Cần: GHN_TOKEN, GHN_SHOP_ID
    """
    missing = _missing_env("GHN_TOKEN", "GHN_SHOP_ID")
    if missing:
        return {"connected": False, "message": f"Thiếu {missing} trong .env",
                "api_url": "https://online-gateway.ghn.vn/shiip/public-api/"}

    try:
        import requests
        token   = os.getenv("GHN_TOKEN")
        shop_id = os.getenv("GHN_SHOP_ID")
        resp = requests.get(
            "https://online-gateway.ghn.vn/shiip/public-api/master-data/province",
            headers={"Token": token, "ShopId": shop_id},
            timeout=8,
        )
        if resp.status_code == 200:
            return {"connected": True, "message": "GHN API kết nối thành công",
                    "api_url": "https://online-gateway.ghn.vn/shiip/public-api/"}
        return {"connected": False, "message": f"GHN HTTP {resp.status_code}",
                "api_url": "https://online-gateway.ghn.vn/shiip/public-api/"}
    except Exception as e:
        return {"connected": False, "message": str(e),
                "api_url": "https://online-gateway.ghn.vn/shiip/public-api/"}


def check_vnpay() -> dict:
    """
    VNPay Payment Gateway
    URL: https://sandbox.vnpayment.vn/
    Cần: VNPAY_TMN_CODE, VNPAY_SECRET_KEY
    """
    missing = _missing_env("VNPAY_TMN_CODE", "VNPAY_SECRET_KEY")
    if missing:
        return {"connected": False, "message": f"Thiếu {missing} trong .env",
                "api_url": "https://sandbox.vnpayment.vn/paymentv2/"}

    # VNPay không có ping endpoint – chỉ kiểm tra credentials có đủ không
    return {
        "connected":  True,
        "message":    "VNPay credentials đầy đủ (chưa test giao dịch thật)",
        "api_url":    "https://sandbox.vnpayment.vn/paymentv2/",
    }


def check_facebook() -> dict:
    """
    Facebook Graph API v18.0
    URL: https://graph.facebook.com/v18.0/
    Cần: FACEBOOK_PAGE_TOKEN, FACEBOOK_PAGE_ID
    """
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from connectors.facebook_scraper import FacebookScraper
    scraper = FacebookScraper()
    result  = scraper.test_connection()
    result["api_url"] = "https://graph.facebook.com/v18.0/"
    return result


def check_google_scraper() -> dict:
    """
    Google Search Scraper (trực tiếp)
    Kiểm tra bằng cách đếm số bản ghi đã có trong raw_google_data.
    """
    import psycopg2
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        return {"connected": False, "message": "DATABASE_URL chưa cấu hình",
                "records": 0}
    try:
        conn = psycopg2.connect(db_url)
        cur  = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM public.raw_google_data")
        count = cur.fetchone()[0]
        cur.close()
        conn.close()
        return {
            "connected": True,
            "message":   f"raw_google_data có {count} bản ghi",
            "records":   count,
        }
    except Exception as e:
        return {"connected": False, "message": str(e), "records": 0}


def check_google_analytics() -> dict:
    """
    Google Analytics 4 API
    URL: https://analyticsdata.googleapis.com/
    Cần: GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_JSON
    """
    missing = _missing_env("GA4_PROPERTY_ID", "GA4_SERVICE_ACCOUNT_JSON")
    if missing:
        return {"connected": False, "message": f"Thiếu {missing} trong .env",
                "api_url": "https://analyticsdata.googleapis.com/"}

    # Thử import thư viện GA4
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient  # noqa
        return {"connected": True, "message": "GA4 credentials đầy đủ",
                "api_url": "https://analyticsdata.googleapis.com/"}
    except ImportError:
        return {"connected": False,
                "message": "Thiếu thư viện google-analytics-data (pip install google-analytics-data)",
                "api_url": "https://analyticsdata.googleapis.com/"}
    except Exception as e:
        return {"connected": False, "message": str(e),
                "api_url": "https://analyticsdata.googleapis.com/"}


# ── Hàm tổng hợp ─────────────────────────────────────────────────────────────

def check_all_connectors() -> dict:
    """
    Kiểm tra tất cả connectors, trả về dict tổng hợp trạng thái.

    Returns:
        {
            "shopee":           {"connected": bool, "message": str, "api_url": str},
            "lazada":           {...},
            "tiktok_shop":      {...},
            "ghn":              {...},
            "vnpay":            {...},
            "facebook":         {...},
            "google_scraper":   {"connected": bool, "message": str, "records": int},
            "google_analytics": {...},
            "checked_at":       "2026-04-26T17:05:00+07:00"
        }
    """
    checks = {
        "shopee":           check_shopee,
        "lazada":           check_lazada,
        "tiktok_shop":      check_tiktok_shop,
        "ghn":              check_ghn,
        "vnpay":            check_vnpay,
        "facebook":         check_facebook,
        "google_scraper":   check_google_scraper,
        "google_analytics": check_google_analytics,
    }

    results = {}
    for name, fn in checks.items():
        results[name] = _safe_check(fn, name)
        status = "✓" if results[name]["connected"] else "✗"
        logger.info("[%s] %s: %s", status, name, results[name]["message"])

    results["checked_at"] = datetime.now(_TZ_VN).isoformat()
    return results


# ── Chạy trực tiếp để test ────────────────────────────────────────────────────
if __name__ == "__main__":
    import json as _json
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )
    print("\n=== CONNECTOR HEALTH CHECK ===\n")
    status = check_all_connectors()
    for name, info in status.items():
        if name == "checked_at":
            continue
        icon    = "✅" if info.get("connected") else "❌"
        message = info.get("message", "")
        extra   = f" | {info['records']} records" if "records" in info else ""
        print(f"{icon} {name:<20} {message}{extra}")
    print(f"\nKiểm tra lúc: {status['checked_at']}")
