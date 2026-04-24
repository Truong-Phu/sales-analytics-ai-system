# -*- coding: utf-8 -*-
"""
GoogleScraper – Scrape kết quả tìm kiếm để thu thập xu hướng thị trường.

DISCLAIMER:
    Chỉ dùng cho mục đích nghiên cứu khóa luận tốt nghiệp.
    Dữ liệu thu thập ở mức thông tin công khai (kết quả tìm kiếm).

Engine sử dụng:
    DuckDuckGo Lite (lite.duckduckgo.com) – trả về HTML thuần túy,
    không cần JavaScript rendering, phù hợp với requests + BeautifulSoup.
    Google Search hiện render kết quả hoàn toàn qua JavaScript (cần Selenium/
    Playwright), không dùng được với requests thuần.

Kỹ thuật tránh bị chặn:
    - Random User-Agent mỗi request
    - Random delay giữa các request
    - Dùng DuckDuckGo Lite endpoint
"""

import csv
import hashlib
import logging
import os
import random
import time
import unicodedata
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── OFFLINE MODE ──────────────────────────────────────────────────────────────
# SCRAPER_MODE=offline → bỏ qua scrape, dùng CSV mẫu (phù hợp khi mạng bị block)
# SCRAPER_MODE=online  → scrape thật (mặc định)
_SCRAPER_MODE = os.getenv("SCRAPER_MODE", "online").lower()

# Đường dẫn CSV mẫu (tương đối so với repo root)
_SAMPLE_CSV = Path(__file__).resolve().parents[3] / "notebooks" / "sample_data" / "sample_google_data.csv"

# ── Danh sách User-Agent để xoay vòng ──────────────────────────────────────
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
]

# Từ khóa mặc định – từ khóa ngắn (DuckDuckGo ít chặn hơn với query ngắn)
DEFAULT_KEYWORDS = [
    "bán hàng online 2024",
    "sản phẩm bán chạy shopee",
    "thương mại điện tử việt nam",
    "xu hướng mua sắm online",
    "top sản phẩm tiktok shop",
    "doanh thu bán lẻ",
    "khuyến mãi lazada shopee",
]

# Số lần retry tối đa khi nhận HTTP 202 (bot detection)
_MAX_RETRIES = 2
# Delay khi bị 202: ngẫu nhiên trong khoảng này (giây)
_RETRY_DELAY = (3, 5)
# Timeout cho mỗi HTTP request (giây) — giảm để không block quá lâu
_REQUEST_TIMEOUT = 8


class GoogleScraper:
    """
    Scrape kết quả Google Search và lưu vào bảng raw_google_data.

    Luồng:
        1. Với mỗi keyword → gọi scrape_keyword()
        2. Tính content_hash = md5(title + snippet)
        3. Lưu vào DB, bỏ qua nếu trùng hash (dedup)
    """

    def __init__(
        self,
        keywords: Optional[list] = None,
        delay_range: tuple = (2, 5),
    ):
        """
        Khởi tạo scraper.

        Args:
            keywords:    Danh sách từ khóa cần scrape. Mặc định dùng DEFAULT_KEYWORDS.
            delay_range: (min, max) giây delay ngẫu nhiên giữa các request.
        """
        self.keywords    = keywords if keywords is not None else DEFAULT_KEYWORDS
        self.delay_range = delay_range
        self.db_url      = os.getenv("DATABASE_URL", "")
        self._session    = requests.Session()
        self._ddg_ready  = False  # Cờ đánh dấu đã khởi tạo session DuckDuckGo chưa
        logger.info(
            "GoogleScraper khởi tạo: %d từ khóa, delay=%s giây",
            len(self.keywords),
            delay_range,
        )

    def _init_ddg_session(self) -> None:
        """
        Khởi tạo session với DuckDuckGo Lite bằng cách GET trang chủ.
        Cần thiết để lấy cookies trước khi POST query.
        Chỉ chạy 1 lần (lazy init).
        """
        if self._ddg_ready:
            return
        try:
            headers = {
                "User-Agent":      self._random_ua(),
                "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
            }
            self._session.get(
                "https://lite.duckduckgo.com/",
                headers=headers,
                timeout=_REQUEST_TIMEOUT,
            )
            self._ddg_ready = True
            logger.debug("DuckDuckGo Lite session khởi tạo thành công")
        except Exception as e:
            logger.warning("Không thể khởi tạo DuckDuckGo session: %s", e)

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _random_ua(self) -> str:
        """Chọn User-Agent ngẫu nhiên để tránh fingerprinting."""
        return random.choice(_USER_AGENTS)

    def _sleep(self) -> None:
        """Dừng ngẫu nhiên trong delay_range giây để không bị rate-limit."""
        secs = random.uniform(*self.delay_range)
        logger.debug("Đang chờ %.1f giây...", secs)
        time.sleep(secs)

    @staticmethod
    def _to_ascii(text: str) -> str:
        """
        Chuyển tiếng Việt có dấu sang ASCII không dấu.
        Ví dụ: 'bán hàng online' → 'ban hang online'
        Dùng để fallback khi search engine chặn query có dấu.
        """
        # unicodedata.normalize NFKD tách base char + combining marks
        nfkd = unicodedata.normalize("NFKD", text)
        # Loại combining characters (dấu phụ)
        return "".join(c for c in nfkd if not unicodedata.combining(c))

    @staticmethod
    def _content_hash(title: str, snippet: str) -> str:
        """Tính MD5 từ title + snippet để phát hiện bản ghi trùng lặp."""
        raw = (title or "") + (snippet or "")
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    # ── Core scraping ────────────────────────────────────────────────────────

    def _parse_ddg_html(self, html: str) -> list[dict]:
        """
        Parse HTML từ DuckDuckGo Lite thành list kết quả.

        Returns:
            List[dict]: [{title, snippet, url, position}]
        """
        soup     = BeautifulSoup(html, "html.parser")
        links    = soup.select("a.result-link")
        snippets = soup.select("td.result-snippet")
        results  = []
        position = 0

        for i, link_el in enumerate(links[:10]):
            title   = link_el.get_text(strip=True)
            url     = link_el.get("href", "")
            snippet = snippets[i].get_text(strip=True) if i < len(snippets) else ""

            if not title:
                continue

            position += 1
            results.append({
                "title":    title,
                "snippet":  snippet,
                "url":      url,
                "position": position,
            })

        return results

    def scrape_keyword(self, keyword: str) -> list[dict]:
        """
        Scrape kết quả tìm kiếm cho 1 từ khóa qua DuckDuckGo Lite.

        Retry tối đa _MAX_RETRIES lần nếu nhận HTTP 202 (bot detection).
        Nếu DuckDuckGo thất bại sau retry → fallback sang Bing.

        Returns:
            List[dict]: Mỗi phần tử gồm {title, snippet, url, position}
        """
        # Khởi tạo session DuckDuckGo nếu chưa làm
        self._init_ddg_session()

        headers = {
            "User-Agent":      self._random_ua(),
            "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
            "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer":         "https://lite.duckduckgo.com/",
            "Origin":          "https://lite.duckduckgo.com",
            "Content-Type":    "application/x-www-form-urlencoded",
        }
        data = {"q": keyword, "kl": "vn-vi"}

        # Retry loop cho HTTP 202
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                resp = self._session.post(
                    "https://lite.duckduckgo.com/lite/",
                    headers=headers,
                    data=data,
                    timeout=_REQUEST_TIMEOUT,
                )

                if resp.status_code == 202:
                    # Bot detection – reinit session và thử lại
                    wait = random.uniform(*_RETRY_DELAY)
                    logger.warning(
                        "DuckDuckGo HTTP 202 (attempt %d/%d) cho '%s' → chờ %.1f giây",
                        attempt, _MAX_RETRIES, keyword, wait,
                    )
                    self._ddg_ready = False
                    time.sleep(wait)
                    self._init_ddg_session()
                    # Xoay User-Agent cho lần sau
                    headers["User-Agent"] = self._random_ua()
                    continue

                if resp.status_code == 429:
                    logger.warning("DuckDuckGo rate-limit (429) cho keyword: %s", keyword)
                    break

                if resp.status_code != 200:
                    logger.warning("HTTP %d khi scrape '%s'", resp.status_code, keyword)
                    break

                results = self._parse_ddg_html(resp.text)
                logger.info("DuckDuckGo '%s': %d kết quả (attempt %d)", keyword, len(results), attempt)

                if not results:
                    # Không parse được → thử lại
                    if attempt < _MAX_RETRIES:
                        time.sleep(random.uniform(2, 4))
                        continue
                    break

                return results

            except requests.Timeout:
                logger.error("Timeout khi scrape keyword: %s (attempt %d)", keyword, attempt)
                if attempt < _MAX_RETRIES:
                    time.sleep(random.uniform(2, 3))
            except requests.ConnectionError as e:
                logger.error("Lỗi kết nối '%s': %s", keyword, e)
                break
            except Exception as e:
                logger.error("Lỗi không xác định '%s': %s", keyword, e, exc_info=True)
                break

        # DuckDuckGo thất bại với từ khóa gốc
        # Thử lại với ASCII không dấu (DuckDuckGo đôi khi chặn query tiếng Việt)
        ascii_kw = self._to_ascii(keyword)
        if ascii_kw != keyword:
            logger.info("Thử DuckDuckGo với ASCII: '%s'", ascii_kw)
            # Reset session
            self._ddg_ready = False
            time.sleep(random.uniform(2, 3))
            self._init_ddg_session()

            data_ascii = {"q": ascii_kw, "kl": "vn-vi"}
            headers["User-Agent"] = self._random_ua()
            try:
                resp = self._session.post(
                    "https://lite.duckduckgo.com/lite/",
                    headers=headers,
                    data=data_ascii,
                    timeout=_REQUEST_TIMEOUT,
                )
                if resp.status_code == 200:
                    results = self._parse_ddg_html(resp.text)
                    if results:
                        logger.info("DuckDuckGo ASCII '%s': %d kết quả", ascii_kw, len(results))
                        return results
            except Exception as e:
                logger.debug("DDG ASCII fallback lỗi: %s", e)

        # Cuối cùng → fallback Bing
        logger.warning("DuckDuckGo thất bại cho '%s' → thử Bing fallback", keyword)
        return self.scrape_bing(keyword)

    def scrape_bing(self, keyword: str) -> list[dict]:
        """
        Fallback scrape kết quả Bing khi DuckDuckGo không trả về dữ liệu.

        URL: https://www.bing.com/search?q={keyword}&setlang=vi&cc=VN

        Returns:
            List[dict]: [{title, snippet, url, position}]
            Trả về [] nếu lỗi.
        """
        results = []
        try:
            import urllib.parse
            # Thử với từ khóa ASCII nếu gốc là tiếng Việt có dấu
            ascii_kw = self._to_ascii(keyword)
            query    = ascii_kw if ascii_kw != keyword else keyword

            url = "https://www.bing.com/search?" + urllib.parse.urlencode({
                "q":      query,
                "mkt":    "vi-VN",
                "setlang":"vi",
                "cc":     "VN",
                "count":  "10",
                "first":  "1",
            })
            headers = {
                "User-Agent":      self._random_ua(),
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
            }
            resp = requests.get(url, headers=headers, timeout=_REQUEST_TIMEOUT)

            if resp.status_code != 200:
                logger.warning("Bing HTTP %d cho keyword: %s", resp.status_code, keyword)
                return []

            soup      = BeautifulSoup(resp.text, "html.parser")
            # Bing: mỗi kết quả là <li class="b_algo">
            #   <h2><a href="...">title</a></h2>
            #   <div class="b_caption"><p>snippet</p></div>
            algo_items = soup.select("li.b_algo")
            position   = 0

            for item in algo_items[:10]:
                a_tag   = item.select_one("h2 a")
                snippet_el = item.select_one(".b_caption p")

                if not a_tag:
                    continue

                title   = a_tag.get_text(strip=True)
                href    = a_tag.get("href", "")
                snippet = snippet_el.get_text(strip=True) if snippet_el else ""

                if not title:
                    continue

                position += 1
                results.append({
                    "title":    title,
                    "snippet":  snippet,
                    "url":      href,
                    "position": position,
                })

            logger.info("Bing '%s': %d kết quả", keyword, len(results))

        except requests.Timeout:
            logger.error("Timeout khi scrape Bing: %s", keyword)
        except Exception as e:
            logger.error("Lỗi Bing scrape '%s': %s", keyword, e)

        return results

    def scrape_all(self) -> list[dict]:
        """
        Lặp qua tất cả keywords, gọi scrape_keyword cho từng keyword.

        Sau mỗi keyword có random delay để tránh bị Google chặn.
        Tính content_hash cho mỗi kết quả trước khi trả về.

        Returns:
            List[dict]: Tổng hợp kết quả từ tất cả keywords,
                        mỗi phần tử có thêm trường 'keyword' và 'content_hash'.
        """
        all_results = []

        for i, keyword in enumerate(self.keywords):
            logger.info(
                "[%d/%d] Đang scrape keyword: %s",
                i + 1, len(self.keywords), keyword,
            )
            results = self.scrape_keyword(keyword)

            # Gắn keyword và tính content_hash cho từng kết quả
            for r in results:
                r["keyword"]      = keyword
                r["content_hash"] = self._content_hash(r["title"], r["snippet"])
                all_results.append(r)

            # Delay giữa các keyword (trừ lần cuối)
            if i < len(self.keywords) - 1:
                self._sleep()

        logger.info(
            "scrape_all hoàn thành: %d kết quả từ %d keywords",
            len(all_results), len(self.keywords),
        )
        return all_results

    # ── Database ─────────────────────────────────────────────────────────────

    def save_to_db(self, results: list[dict]) -> tuple[int, int]:
        """
        Lưu kết quả vào bảng raw_google_data.

        Bỏ qua bản ghi nếu content_hash đã tồn tại (dedup đơn giản).
        Dùng psycopg2, đọc DATABASE_URL từ .env.

        Returns:
            (inserted, skipped): Số bản ghi đã lưu và số bản ghi bỏ qua do trùng.
        """
        if not results:
            logger.info("Không có kết quả để lưu.")
            return 0, 0

        if not self.db_url:
            logger.error("DATABASE_URL chưa được cấu hình trong .env – không thể lưu DB.")
            return 0, len(results)

        inserted = 0
        skipped  = 0

        try:
            conn = psycopg2.connect(self.db_url)
            cur  = conn.cursor()

            # Lấy danh sách hash đã tồn tại để tránh N+1 query
            hashes_to_check = [r["content_hash"] for r in results if r.get("content_hash")]
            if hashes_to_check:
                cur.execute(
                    "SELECT content_hash FROM public.raw_google_data "
                    "WHERE content_hash = ANY(%s)",
                    (hashes_to_check,),
                )
                existing_hashes = {row[0] for row in cur.fetchall()}
            else:
                existing_hashes = set()

            # Insert từng bản ghi
            for r in results:
                ch = r.get("content_hash")
                if ch and ch in existing_hashes:
                    skipped += 1
                    continue

                cur.execute(
                    """
                    INSERT INTO public.raw_google_data
                        (keyword, title, snippet, url, position, content_hash)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        r.get("keyword"),
                        r.get("title"),
                        r.get("snippet"),
                        r.get("url"),
                        r.get("position"),
                        ch,
                    ),
                )
                inserted += 1

            conn.commit()
            cur.close()
            conn.close()

        except psycopg2.OperationalError as e:
            logger.error("Lỗi kết nối PostgreSQL: %s", e)
            return 0, len(results)
        except Exception as e:
            logger.error("Lỗi khi lưu DB: %s", e, exc_info=True)
            return inserted, skipped

        return inserted, skipped

    # ── Offline mode ─────────────────────────────────────────────────────────

    def _load_offline_csv(self) -> list[dict]:
        """
        Đọc CSV mẫu từ notebooks/sample_data/sample_google_data.csv.
        Dùng khi SCRAPER_MODE=offline — bỏ qua scrape mạng.

        Returns:
            List[dict]: [{keyword, title, snippet, url, position, content_hash}]
        """
        if not _SAMPLE_CSV.exists():
            logger.error("OFFLINE MODE: Không tìm thấy file CSV mẫu: %s", _SAMPLE_CSV)
            return []

        results = []
        try:
            with open(_SAMPLE_CSV, encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    row["content_hash"] = self._content_hash(
                        row.get("title", ""), row.get("snippet", "")
                    )
                    results.append(row)
            logger.info("OFFLINE MODE — đọc %d dòng từ CSV mẫu: %s", len(results), _SAMPLE_CSV.name)
        except Exception as e:
            logger.error("Lỗi đọc CSV mẫu: %s", e)

        return results

    # ── Entry point ──────────────────────────────────────────────────────────

    def run(self) -> dict:
        """
        Chạy toàn bộ luồng: scrape_all() → save_to_db().

        Nếu SCRAPER_MODE=offline: bỏ qua scrape, dùng CSV mẫu luôn.

        Returns:
            dict: {total_scraped, inserted, skipped}
        """
        logger.info("=== GoogleScraper bắt đầu chạy (mode=%s) ===", _SCRAPER_MODE)

        if _SCRAPER_MODE == "offline":
            logger.info("OFFLINE MODE — dùng dữ liệu mẫu CSV, bỏ qua scrape mạng")
            results = self._load_offline_csv()
        else:
            results = self.scrape_all()

        inserted, skipped = self.save_to_db(results)

        summary = {
            "total_scraped": len(results),
            "inserted":      inserted,
            "skipped":       skipped,
        }
        logger.info(
            "=== GoogleScraper hoàn thành: scrape=%d | lưu=%d | bỏ qua=%d ===",
            len(results), inserted, skipped,
        )
        return summary


# ── Chạy trực tiếp để test ──────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )
    scraper = GoogleScraper()
    result  = scraper.run()
    print(f"\nKết quả: {result}")
