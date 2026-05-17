#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Trends Scraper dùng pytrends (không cần API key).
Lưu kết quả vào DB hoặc JSON file.

Cài đặt: pip install pytrends
Chạy: python google_trends_scraper.py
"""
import json
import os
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False
    logger.warning("pytrends chưa cài. Chạy: pip install pytrends")

# Keywords mặc định cho ngành thời trang VN
DEFAULT_KEYWORDS = ['áo thun', 'quần jean', 'váy đầm', 'giày sneaker', 'túi xách']

OUTPUT_DIR = Path(__file__).parent.parent.parent / "docs" / "sample-data" / "trends"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch_interest_over_time(keywords=None, timeframe='today 3-m', geo='VN'):
    """
    Lấy dữ liệu interest over time từ Google Trends.
    Trả về dict hoặc None nếu lỗi.
    """
    if not PYTRENDS_AVAILABLE:
        return _mock_trends(keywords or DEFAULT_KEYWORDS)

    kw = (keywords or DEFAULT_KEYWORDS)[:5]  # Tối đa 5 keywords
    try:
        pytrends = TrendReq(hl='vi-VN', tz=420)  # UTC+7 Vietnam
        pytrends.build_payload(kw, geo=geo, timeframe=timeframe)
        df = pytrends.interest_over_time()

        if df.empty:
            logger.warning("Không có data từ Google Trends")
            return None

        # Chuyển sang format JSON
        result = {
            "fetched_at": datetime.now().isoformat(),
            "keywords": kw,
            "geo": geo,
            "timeframe": timeframe,
            "data": [],
        }
        for idx, row in df.iterrows():
            entry = {"date": str(idx.date())}
            for k in kw:
                if k in row.index:
                    entry[k] = int(row[k])
            result["data"].append(entry)

        logger.info("Lấy được %d ngày dữ liệu Google Trends", len(result["data"]))
        return result
    except Exception as e:
        logger.error("Google Trends lỗi: %s", e)
        return _mock_trends(kw)


def fetch_related_queries(keywords=None, geo='VN'):
    """Lấy related queries cho mỗi keyword."""
    if not PYTRENDS_AVAILABLE:
        return {}
    kw = (keywords or DEFAULT_KEYWORDS)[:5]
    try:
        pytrends = TrendReq(hl='vi-VN', tz=420)
        pytrends.build_payload(kw, geo=geo, timeframe='today 3-m')
        related = pytrends.related_queries()
        result = {}
        for k, v in related.items():
            if v and "top" in v and v["top"] is not None:
                result[k] = v["top"].head(5)["query"].tolist()
        return result
    except Exception as e:
        logger.error("Related queries lỗi: %s", e)
        return {}


def _mock_trends(keywords):
    """Dữ liệu mẫu khi pytrends không khả dụng."""
    import random
    from datetime import date, timedelta

    today = date.today()
    data = []
    for i in range(90, -1, -1):
        d = today - timedelta(days=i)
        entry = {"date": str(d)}
        for k in keywords:
            entry[k] = random.randint(20, 100)
        data.append(entry)

    return {
        "fetched_at": datetime.now().isoformat(),
        "keywords": keywords,
        "geo": "VN",
        "timeframe": "today 3-m",
        "is_mock": True,
        "data": data,
    }


def save_trends_to_json(data, filename=None):
    """Lưu kết quả ra file JSON."""
    if not filename:
        filename = f"trends_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    out = OUTPUT_DIR / filename
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info("Đã lưu %s", out)
    return str(out)


def save_trends_to_db(data):
    """Lưu kết quả vào DB (bảng market_trends nếu có)."""
    try:
        import psycopg2
        from dotenv import load_dotenv
        load_dotenv()

        db_url = os.getenv("DATABASE_URL", "")
        if not db_url:
            logger.warning("DATABASE_URL chưa cấu hình — bỏ qua lưu DB")
            return

        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        # Kiểm tra bảng tồn tại
        cur.execute("""
            SELECT EXISTS(
                SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='market_trends'
            )
        """)
        if not cur.fetchone()[0]:
            logger.warning("Bảng market_trends chưa tồn tại. Lưu vào JSON thay thế.")
            conn.close()
            save_trends_to_json(data, "trends_latest.json")
            return

        for entry in data.get("data", []):
            for kw in data.get("keywords", []):
                if kw not in entry:
                    continue
                cur.execute("""
                    INSERT INTO public.market_trends
                        (keyword, trend_date, interest_value, geo, fetched_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (keyword, trend_date, geo) DO UPDATE
                    SET interest_value = EXCLUDED.interest_value,
                        fetched_at     = EXCLUDED.fetched_at
                """, (kw, entry["date"], entry[kw], data.get("geo", "VN"), data["fetched_at"]))

        conn.commit()
        conn.close()
        logger.info("Đã lưu %d entries vào market_trends", len(data["data"]) * len(data["keywords"]))
    except Exception as e:
        logger.error("Lưu DB lỗi: %s — fallback sang JSON", e)
        save_trends_to_json(data, "trends_latest.json")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    print("Đang lấy Google Trends cho thị trường Việt Nam...")
    data = fetch_interest_over_time()

    if data:
        # Lưu JSON
        save_trends_to_json(data, "trends_latest.json")
        print(f"OK: {len(data['data'])} ngày dữ liệu cho {len(data['keywords'])} keywords")
        if data.get("is_mock"):
            print("Canh bao: Đang dùng dữ liệu mẫu (pytrends chưa cài hoặc rate limited)")

        # Thử lưu DB
        save_trends_to_db(data)

        # Related queries
        print("\nRelated queries:")
        related = fetch_related_queries()
        for kw, queries in related.items():
            print(f"  {kw}: {', '.join(queries[:3])}")
    else:
        print("Không lấy được dữ liệu")
