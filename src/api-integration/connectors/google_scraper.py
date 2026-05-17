# -*- coding: utf-8 -*-
"""
GoogleScraper – Thu thập xu hướng thị trường bằng Google Search trực tiếp.

DISCLAIMER:
    Chỉ dùng cho mục đích nghiên cứu khóa luận tốt nghiệp.
    Dữ liệu thu thập ở mức thông tin công khai (kết quả tìm kiếm).

CHIẾN LƯỢC 2 BƯỚC:
    Bước 1: Gửi search query đến https://www.google.com/search?q=KEYWORD&num=20
            với User-Agent hợp lệ, lấy danh sách URL kết quả.
    Bước 2: Truy cập từng URL, crawl nội dung thực tế (title, giá, mô tả...).

XỬ LÝ BỊ CHẶN:
    Nếu Google trả về 429 hoặc CAPTCHA:
    - Log rõ lý do vào ETL log
    - KHÔNG tạo mock data
    - Trả về empty DataFrame / raise exception để caller biết

OFFLINE MODE (SCRAPER_MODE=offline):
    Bỏ qua scrape, đọc CSV mẫu từ notebooks/sample_data/sample_google_data.csv
"""

import csv
import hashlib
import logging
import os
import random
import re
import time
import unicodedata
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── MODE ──────────────────────────────────────────────────────────────────────
_SCRAPER_MODE = os.getenv("SCRAPER_MODE", "online").lower()

# Đường dẫn sample CSV (fallback offline)
_REPO_ROOT   = Path(__file__).resolve().parents[3]
_SAMPLE_CSV  = _REPO_ROOT / "notebooks" / "sample_data" / "sample_google_data.csv"
_OUTPUT_DIR  = _REPO_ROOT / "notebooks" / "sample_data"

# UTC+7 (Vietnam)
_TZ_VN = timezone(timedelta(hours=7))

# ── User-Agents xoay vòng ──────────────────────────────────────────────────
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) "
    "Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# ── Keywords xoay theo ngày (5 keywords, mỗi keyword 10-20 URL) ──────────
DEFAULT_KEYWORDS = [
    "xu hướng sản phẩm bán chạy online Việt Nam 2025",
    "trending products Vietnam ecommerce 2025",
    "sản phẩm hot Shopee Lazada TikTok 2025",
    "thị trường bán lẻ online Việt Nam xu hướng",
    "top sản phẩm bán chạy thương mại điện tử Việt Nam",
]

_REQUEST_TIMEOUT    = 10
_CRAWL_TIMEOUT      = 8
_MAX_URLS_PER_KW    = 20  # số URL lấy mỗi keyword (theo yêu cầu num=20)
_MAX_CRAWL_PER_RUN  = 80  # giới hạn crawl để tránh chạy quá lâu


class GoogleBlockedError(Exception):
    """Raised khi Google trả về 429 / CAPTCHA — caller cần biết để log ETL."""
    pass


class GoogleScraper:
    """
    Thu thập xu hướng thị trường từ Google Search.

    Luồng:
        1. search_google(keyword) → danh sách URL từ trang SERP
        2. crawl_url(url)         → extract nội dung thực tế từng trang
        3. save_to_db(records)    → INSERT vào raw_google_data (dedup by hash)
        4. export_csv(records)    → lưu CSV notebooks/sample_data/
    """

    def __init__(
        self,
        company_id: str = "",
        keywords: Optional[list] = None,
        delay_range: tuple = (2, 5),
        crawl_delay_range: tuple = (1, 3),
    ):
        self.company_id        = company_id
        self.delay_range       = delay_range
        self.crawl_delay_range = crawl_delay_range
        self.db_url            = os.getenv("DATABASE_URL", "")
        self._session          = requests.Session()
        # Tải extra_headers / cookies từ integrations nếu có
        self._extra_headers: dict = {}
        if company_id:
            self._load_scraper_config(company_id)

        # Ưu tiên keywords truyền vào; nếu không thì đọc từ DB → fallback DEFAULT
        if keywords is not None:
            self.keywords = keywords
        else:
            self.keywords = self.load_keywords_from_db()

        logger.info(
            "GoogleScraper khởi tạo: %d từ khóa, delay=%s, company=%s",
            len(self.keywords), delay_range, company_id or "system",
        )

    def _load_scraper_config(self, company_id: str) -> None:
        """Tải cookies/headers từ integrations additional_config."""
        try:
            # Relative import fail khi load qua importlib.util → dùng absolute import
            try:
                from .integration_repository import IntegrationRepository
            except ImportError:
                import importlib.util as _ilu
                _spec = _ilu.spec_from_file_location(
                    "integration_repository",
                    str(Path(__file__).parent / "integration_repository.py"),
                )
                _mod = _ilu.module_from_spec(_spec)
                _spec.loader.exec_module(_mod)
                IntegrationRepository = _mod.IntegrationRepository

            repo  = IntegrationRepository()
            integ = repo.get_integration(company_id, "google")
            if integ:
                cfg = integ.get("additional_config") or {}
                self._extra_headers = cfg.get("headers", {})
                cookies = cfg.get("cookies", {})
                if cookies:
                    self._session.cookies.update(cookies)
        except Exception as exc:
            logger.warning("Không thể load Google scraper config từ DB: %s", exc)

    # ── DB Keyword Management ─────────────────────────────────────────────────

    def load_keywords_from_db(self, limit: int = 5) -> list[str]:
        """
        Đọc keywords từ bảng scraper_keywords.
        Ưu tiên keyword ít dùng nhất (ORDER BY last_used_at ASC NULLS FIRST).
        Fallback về DEFAULT_KEYWORDS nếu DB chưa sẵn sàng hoặc bảng trống.
        """
        if not self.db_url:
            logger.warning("DATABASE_URL chưa cấu hình — dùng DEFAULT_KEYWORDS")
            return DEFAULT_KEYWORDS
        try:
            conn = psycopg2.connect(self.db_url)
            cur  = conn.cursor()
            cur.execute(
                """
                SELECT keyword FROM scraper_keywords
                WHERE is_active = TRUE AND source_type = 'google'
                ORDER BY last_used_at ASC NULLS FIRST
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
            cur.close()
            conn.close()
            if rows:
                kws = [r[0] for r in rows]
                logger.info("Đọc %d keywords từ DB scraper_keywords", len(kws))
                return kws
            logger.warning("scraper_keywords trống hoặc không có keyword active — dùng DEFAULT_KEYWORDS")
            return DEFAULT_KEYWORDS
        except Exception as e:
            logger.error("Lỗi đọc keywords từ DB: %s — dùng DEFAULT_KEYWORDS", e)
            return DEFAULT_KEYWORDS

    def update_keyword_usage(self, keyword: str) -> None:
        """Cập nhật last_used_at + use_count sau mỗi lần dùng keyword."""
        if not self.db_url:
            return
        try:
            conn = psycopg2.connect(self.db_url)
            cur  = conn.cursor()
            cur.execute(
                """
                UPDATE scraper_keywords
                SET last_used_at = NOW(),
                    use_count    = use_count + 1
                WHERE keyword = %s AND source_type = 'google'
                """,
                (keyword,),
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            logger.debug("Không cập nhật được keyword usage: %s", e)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _random_ua(self) -> str:
        return random.choice(_USER_AGENTS)

    def _sleep(self, range_: tuple = None) -> None:
        r = range_ or self.delay_range
        secs = random.uniform(*r)
        logger.debug("Chờ %.1f giây...", secs)
        time.sleep(secs)

    @staticmethod
    def _now_vn() -> str:
        """Timestamp hiện tại theo UTC+7, format ISO."""
        return datetime.now(_TZ_VN).isoformat()

    @staticmethod
    def _content_hash(title: str, snippet: str) -> str:
        raw = (title or "") + (snippet or "")
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _extract_domain(url: str) -> str:
        try:
            return urllib.parse.urlparse(url).netloc
        except Exception:
            return ""

    @staticmethod
    def _normalize_price(text: str) -> Optional[int]:
        """
        Chuẩn hóa chuỗi giá về số nguyên VND.
        Ví dụ: "150.000đ" → 150000, "1,200,000 VND" → 1200000
        """
        if not text:
            return None
        # Loại bỏ mọi thứ trừ chữ số và dấu phân cách
        digits = re.sub(r"[^\d]", "", text)
        if digits:
            try:
                return int(digits)
            except ValueError:
                return None
        return None

    @staticmethod
    def _is_blocked_response(resp: requests.Response) -> bool:
        """Kiểm tra Google có trả về trang CAPTCHA / bot detection không."""
        if resp.status_code in (429, 503):
            return True
        # Google redirect sang /sorry/ khi phát hiện bot
        if "/sorry/" in resp.url:
            return True
        body_lower = resp.text.lower()
        if "unusual traffic" in body_lower or "captcha" in body_lower:
            return True
        return False

    # ── BƯỚC 1: Lấy URL từ Google SERP ───────────────────────────────────────

    def search_google(self, keyword: str, num: int = _MAX_URLS_PER_KW) -> list[str]:
        """
        Gửi query đến Google Search, parse HTML lấy danh sách URL kết quả.

        Args:
            keyword: Từ khóa tìm kiếm.
            num:     Số kết quả yêu cầu (max 20 mỗi request).

        Returns:
            List[str]: Danh sách URL kết quả (bỏ URL nội bộ Google).

        Raises:
            GoogleBlockedError: Khi Google trả về 429 hoặc CAPTCHA.
        """
        params = {
            "q":    keyword,
            "num":  num,
            "hl":   "vi",
            "gl":   "vn",
            "safe": "off",
        }
        headers = {
            "User-Agent":      self._random_ua(),
            "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
            "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer":         "https://www.google.com/",
            "DNT":             "1",
        }

        try:
            resp = self._session.get(
                "https://www.google.com/search",
                params=params,
                headers=headers,
                timeout=_REQUEST_TIMEOUT,
                allow_redirects=True,
            )
        except requests.Timeout:
            logger.error("Timeout khi search Google keyword: %s", keyword)
            return []
        except requests.ConnectionError as e:
            logger.error("Lỗi kết nối Google: %s", e)
            return []

        if self._is_blocked_response(resp):
            msg = (
                f"Google Search bị chặn (HTTP {resp.status_code}) "
                f"cho keyword '{keyword}' — cần thử lại sau"
            )
            logger.warning(msg)
            raise GoogleBlockedError(msg)

        if resp.status_code != 200:
            logger.warning("Google HTTP %d cho '%s'", resp.status_code, keyword)
            return []

        urls = self._parse_google_serp(resp.text)
        logger.info("Google SERP '%s': %d URL", keyword, len(urls))
        return urls

    def _parse_google_serp(self, html: str) -> list[str]:
        """
        Parse HTML trang Google SERP, trích xuất URL kết quả.

        Google thay đổi class name thường xuyên → dùng nhiều chiến lược
        để tăng độ bền với mọi version HTML:
          1. Tìm /url?q=... trong toàn bộ href (cách đáng tin nhất)
          2. jsname="UWckNb" — organic result link (khá ổn định 2024–2025)
          3. div[data-ved] > a — fallback data attribute
          4. h3 > a — title link trong result block
          5. div.g a — selector cũ (dự phòng)
        """
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        seen: set[str]  = set()

        _GOOGLE_HOSTS = ("google.com", "google.co.", "googleusercontent",
                         "googleapis", "gstatic", "youtube.com")

        def _is_google(href: str) -> bool:
            return any(h in href for h in _GOOGLE_HOSTS)

        def _try_add(href: str) -> bool:
            """Chuẩn hóa href, thêm vào danh sách nếu hợp lệ. Trả True nếu thêm được."""
            if not href:
                return False
            # Giải mã /url?q=... format
            if href.startswith("/url?"):
                qs = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
                href = qs.get("q", [""])[0]
            if not href.startswith("http"):
                return False
            if _is_google(href):
                return False
            if href in seen:
                return False
            seen.add(href)
            urls.append(href)
            return True

        # Chiến lược 1: mọi <a href="/url?q=..."> trong trang (đáng tin nhất)
        for a in soup.find_all("a", href=lambda h: h and h.startswith("/url?q=")):
            _try_add(a["href"])
            if len(urls) >= _MAX_URLS_PER_KW:
                break

        # Chiến lược 2: jsname="UWckNb" – organic result link (ổn định 2024-2025)
        if len(urls) < _MAX_URLS_PER_KW:
            for a in soup.find_all("a", attrs={"jsname": "UWckNb"}):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 3: div[data-ved] > a (thẻ thường bao organic results)
        if len(urls) < _MAX_URLS_PER_KW:
            for a in soup.select("div[data-ved] > a[href]"):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 4: h3 > a và div.g a (selector cũ, fallback)
        if len(urls) < _MAX_URLS_PER_KW:
            for a in soup.select("h3 a[href], div.g a[href]"):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 5: quét toàn bộ <a href="https://..."> ngoài Google
        if len(urls) < 3:
            for a in soup.find_all("a", href=lambda h: h and h.startswith("https://")):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        if not urls:
            # Ghi log một đoạn HTML để debug (100 char đầu body)
            body_preview = html[:300].replace("\n", " ")
            logger.debug("SERP parse 0 URL. HTML preview: %s", body_preview)

        return urls

    # ── BƯỚC 2: Crawl từng URL ────────────────────────────────────────────────

    def crawl_url(self, url: str) -> Optional[dict]:
        """
        Truy cập URL và extract thông tin: title, product_name, category,
        price, sales_count, trend_description, source_domain, crawled_at.

        Returns:
            dict hoặc None nếu crawl thất bại.
        """
        headers = {
            "User-Agent":      self._random_ua(),
            "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
            "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
        }
        try:
            resp = requests.get(
                url,
                headers=headers,
                timeout=_CRAWL_TIMEOUT,
                allow_redirects=True,
            )
        except (requests.Timeout, requests.ConnectionError, requests.TooManyRedirects) as e:
            logger.debug("Crawl thất bại '%s': %s", url[:80], e)
            return None
        except Exception as e:
            logger.debug("Lỗi crawl '%s': %s", url[:80], e)
            return None

        if resp.status_code != 200:
            return None

        # Chỉ xử lý HTML
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" not in content_type:
            return None

        return self._extract_page_content(url, resp.text)

    def _extract_page_content(self, url: str, html: str) -> dict:
        """
        Extract các trường cần thiết từ HTML của trang.
        Dùng heuristic để tìm tên sản phẩm, giá, mô tả xu hướng.
        """
        soup = BeautifulSoup(html, "html.parser")

        # --- title ---
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else ""

        # --- meta description (dùng làm trend_description / snippet) ---
        meta_desc = ""
        og_desc = soup.find("meta", property="og:description")
        meta_desc_tag = soup.find("meta", attrs={"name": "description"})
        if og_desc and og_desc.get("content"):
            meta_desc = og_desc["content"].strip()
        elif meta_desc_tag and meta_desc_tag.get("content"):
            meta_desc = meta_desc_tag["content"].strip()

        # --- product_name: OG title, h1, hoặc lấy từ title ---
        product_name = ""
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            product_name = og_title["content"].strip()
        if not product_name:
            h1 = soup.find("h1")
            if h1:
                product_name = h1.get_text(strip=True)
        if not product_name:
            product_name = title.split("|")[0].split("-")[0].strip()

        # --- category: breadcrumb, og:type, hoặc schema.org ---
        category = ""
        breadcrumb = soup.select("nav ol li, .breadcrumb li, [class*=breadcrumb] li")
        if breadcrumb:
            crumbs = [el.get_text(strip=True) for el in breadcrumb]
            # Bỏ phần tử đầu (Home/Trang chủ) và cuối (tên sản phẩm)
            if len(crumbs) > 2:
                category = " > ".join(crumbs[1:-1])
            elif len(crumbs) == 2:
                category = crumbs[0]

        # --- price: tìm phần tử chứa "đ", "VNĐ", "VND" gần thẻ giá ---
        price = None
        price_patterns = [
            r"\d[\d.,]*\s*(?:đ|vnđ|vnd|₫)",
            r"(?:giá|price)[:\s]*[\d.,]+",
        ]
        price_text = ""
        for pattern in price_patterns:
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                price_text = m.group(0)
                price = self._normalize_price(price_text)
                if price and price > 100:  # lọc số quá nhỏ
                    break
                else:
                    price = None

        # --- sales_count: tìm "đã bán", "sold", số lượng đánh giá ---
        sales_count = None
        sold_m = re.search(
            r"(?:đã bán|sold)[:\s]*([\d.,]+)",
            html,
            re.IGNORECASE,
        )
        if sold_m:
            sales_count = self._normalize_price(sold_m.group(1))

        # --- trend_description: meta description hoặc đoạn text đầu tiên ---
        trend_description = meta_desc
        if not trend_description:
            first_p = soup.find("p")
            if first_p:
                trend_description = first_p.get_text(strip=True)[:300]

        return {
            "title":             title[:500],
            "snippet":           meta_desc[:500],
            "product_name":      product_name[:300],
            "category":          category[:200],
            "price":             price,
            "sales_count":       sales_count,
            "trend_description": trend_description[:500],
            "source_domain":     self._extract_domain(url),
            "url":               url,
            "crawled_at":        self._now_vn(),
        }

    # ── Luồng chính ───────────────────────────────────────────────────────────

    def scrape_all(self) -> list[dict]:
        """
        Bước 1: Lấy URL từ Google (mỗi keyword → 10-20 URL).
        Bước 2: Crawl từng URL thu được.

        Tổng mục tiêu: 50-100 URL từ 5 keywords.
        Giới hạn _MAX_CRAWL_PER_RUN để tránh chạy quá lâu.

        Returns:
            List[dict]: Danh sách bản ghi đã crawl.

        Raises:
            GoogleBlockedError: Nếu TẤT CẢ keywords đều bị chặn.
        """
        all_urls   = []  # (url, keyword)
        blocked_kw = 0

        for i, keyword in enumerate(self.keywords):
            logger.info("[%d/%d] Tìm kiếm Google: '%s'", i + 1, len(self.keywords), keyword)
            try:
                urls = self.search_google(keyword)
                for u in urls:
                    all_urls.append((u, keyword))
                logger.info("  → %d URL", len(urls))
                self.update_keyword_usage(keyword)
            except GoogleBlockedError as e:
                blocked_kw += 1
                logger.warning("Keyword '%s' bị chặn: %s", keyword, e)
                self._log_etl_blocked(keyword, str(e))

            if i < len(self.keywords) - 1:
                self._sleep()

        if blocked_kw == len(self.keywords):
            raise GoogleBlockedError(
                "Tất cả keywords đều bị Google chặn — cần thử lại sau"
            )

        # Bỏ URL trùng, giữ mapping keyword
        seen_urls = {}
        for url, kw in all_urls:
            if url not in seen_urls:
                seen_urls[url] = kw

        logger.info("Tổng %d URL duy nhất từ %d keywords", len(seen_urls), len(self.keywords))

        # Giới hạn số URL crawl
        urls_to_crawl = list(seen_urls.items())[:_MAX_CRAWL_PER_RUN]
        records = []

        for j, (url, keyword) in enumerate(urls_to_crawl):
            logger.debug("[%d/%d] Crawl: %s", j + 1, len(urls_to_crawl), url[:80])
            data = self.crawl_url(url)
            if data:
                data["keyword"]      = keyword
                data["position"]     = j + 1
                data["content_hash"] = self._content_hash(
                    data.get("title", ""), data.get("snippet", "")
                )
                records.append(data)

            # Delay nhỏ giữa các crawl
            if j < len(urls_to_crawl) - 1:
                self._sleep(self.crawl_delay_range)

        logger.info(
            "scrape_all hoàn thành: %d URL crawl → %d bản ghi",
            len(urls_to_crawl), len(records),
        )
        return records

    # ── Export CSV ────────────────────────────────────────────────────────────

    def export_csv(self, records: list[dict]) -> Optional[Path]:
        """
        Xuất DataFrame ra CSV: notebooks/sample_data/google_trends_YYYYMMDD.csv

        Returns:
            Path của file CSV vừa lưu, hoặc None nếu không có dữ liệu.
        """
        if not records:
            return None

        _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        date_str   = datetime.now(_TZ_VN).strftime("%Y%m%d")
        output_csv = _OUTPUT_DIR / f"google_trends_{date_str}.csv"

        df = pd.DataFrame(records)
        df.to_csv(output_csv, index=False, encoding="utf-8-sig")
        logger.info("Đã xuất CSV: %s (%d dòng)", output_csv, len(df))
        return output_csv

    # ── Database ──────────────────────────────────────────────────────────────

    def _fetch_keyword_id_map(self, cur, keywords: list[str]) -> dict[str, int]:
        """Tra cứu keyword_id từ scraper_keywords theo danh sách keyword string.

        Returns:
            dict mapping keyword_string → id (chỉ những keyword tồn tại trong DB).
        """
        if not keywords:
            return {}
        try:
            cur.execute(
                """
                SELECT id, keyword FROM public.scraper_keywords
                WHERE keyword = ANY(%s) AND source_type = 'google'
                """,
                (keywords,),
            )
            return {row[1]: row[0] for row in cur.fetchall()}
        except Exception as e:
            logger.debug("Không tra được keyword_id: %s", e)
            return {}

    def save_to_db(self, records: list[dict]) -> tuple[int, int]:
        """
        INSERT các bản ghi vào raw_google_data, bỏ qua bản ghi trùng hash.
        Lưu đầy đủ: keyword_id (FK), company_id, product_name, category,
        price, sales_count, trend_description, source_domain.
        expires_at tự tính bởi trigger DB (scraped_at + 30 ngày).

        Returns:
            (inserted, skipped)
        """
        if not records:
            logger.info("Không có bản ghi để lưu DB.")
            return 0, 0

        if not self.db_url:
            logger.error("DATABASE_URL chưa cấu hình trong .env — không thể lưu DB.")
            return 0, len(records)

        inserted = 0
        skipped  = 0

        try:
            conn = psycopg2.connect(self.db_url)
            cur  = conn.cursor()

            # Dedup theo content_hash
            hashes = [r.get("content_hash") for r in records if r.get("content_hash")]
            if hashes:
                cur.execute(
                    "SELECT content_hash FROM public.raw_google_data "
                    "WHERE content_hash = ANY(%s)",
                    (hashes,),
                )
                existing = {row[0] for row in cur.fetchall()}
            else:
                existing = set()

            # Tra cứu keyword_id một lần cho tất cả keywords trong batch
            unique_keywords = list({r.get("keyword", "") for r in records if r.get("keyword")})
            kw_id_map = self._fetch_keyword_id_map(cur, unique_keywords)

            cid = self.company_id or None  # UUID string hoặc None

            for r in records:
                ch = r.get("content_hash")
                if ch and ch in existing:
                    skipped += 1
                    continue

                kw  = r.get("keyword", "")
                kid = kw_id_map.get(kw)  # None nếu keyword chưa có trong DB

                cur.execute(
                    """
                    INSERT INTO public.raw_google_data
                        (keyword, keyword_id, company_id,
                         title, snippet, url, position, content_hash,
                         product_name, category, price, sales_count,
                         trend_description, source_domain)
                    VALUES (%s, %s, %s::uuid,
                            %s, %s, %s, %s, %s,
                            %s, %s, %s, %s,
                            %s, %s)
                    """,
                    (
                        kw,
                        kid,
                        cid,
                        r.get("title"),
                        r.get("snippet"),
                        r.get("url"),
                        r.get("position"),
                        ch,
                        r.get("product_name"),
                        r.get("category"),
                        r.get("price"),
                        r.get("sales_count"),
                        r.get("trend_description"),
                        r.get("source_domain"),
                    ),
                )
                inserted += 1

            conn.commit()
            cur.close()
            conn.close()
            logger.info("DB: inserted=%d, skipped=%d", inserted, skipped)

        except psycopg2.OperationalError as e:
            logger.error("Lỗi kết nối PostgreSQL: %s", e)
            return 0, len(records)
        except Exception as e:
            logger.error("Lỗi lưu DB: %s", e, exc_info=True)
            return inserted, skipped

        return inserted, skipped

    # ── ETL Log ───────────────────────────────────────────────────────────────

    def _log_etl_blocked(self, keyword: str, reason: str) -> None:
        """Ghi log vào file ETL khi Google chặn — để trace lại sau."""
        log_dir = _REPO_ROOT / "logs"
        log_dir.mkdir(exist_ok=True)
        log_file = log_dir / "etl_google_blocked.log"
        ts = self._now_vn()
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] keyword='{keyword}' | {reason}\n")

    # ── Offline mode ──────────────────────────────────────────────────────────

    def _load_offline_csv(self) -> list[dict]:
        """Đọc CSV mẫu khi SCRAPER_MODE=offline."""
        if not _SAMPLE_CSV.exists():
            logger.error("OFFLINE MODE: Không tìm thấy CSV mẫu: %s", _SAMPLE_CSV)
            return []
        records = []
        try:
            with open(_SAMPLE_CSV, encoding="utf-8", newline="") as f:
                for row in csv.DictReader(f):
                    row.setdefault("content_hash", self._content_hash(
                        row.get("title", ""), row.get("snippet", "")
                    ))
                    records.append(row)
            logger.info("OFFLINE MODE — %d dòng từ %s", len(records), _SAMPLE_CSV.name)
        except Exception as e:
            logger.error("Lỗi đọc CSV mẫu: %s", e)
        return records

    # ── Entry points ──────────────────────────────────────────────────────────

    def run(self) -> dict:
        """
        Luồng đầy đủ: scrape_all() → export_csv() → save_to_db().

        Returns:
            dict: {total_scraped, inserted, skipped, csv_path}
        """
        logger.info("=== GoogleScraper bắt đầu (mode=%s) ===", _SCRAPER_MODE)

        if _SCRAPER_MODE == "offline":
            records = self._load_offline_csv()
        else:
            records = self.scrape_all()

        csv_path = self.export_csv(records)
        inserted, skipped = self.save_to_db(records)

        summary = {
            "total_scraped": len(records),
            "inserted":      inserted,
            "skipped":       skipped,
            "csv_path":      str(csv_path) if csv_path else None,
        }
        logger.info(
            "=== GoogleScraper xong: scraped=%d | inserted=%d | skipped=%d ===",
            len(records), inserted, skipped,
        )
        return summary

    def run_with_fallback(self) -> pd.DataFrame:
        """
        Wrapper an toàn: thử scrape Google thật.
        - Nếu bị chặn → log warning + trả về empty DataFrame.
        - KHÔNG tạo mock data trong bất kỳ trường hợp.

        Returns:
            pd.DataFrame: Dữ liệu scrape được (có thể rỗng nếu bị chặn).
        """
        try:
            records  = self.scrape_all()
            csv_path = self.export_csv(records)
            self.save_to_db(records)
            logger.info("run_with_fallback: %d bản ghi thu thập được", len(records))
            return pd.DataFrame(records) if records else pd.DataFrame()
        except GoogleBlockedError as e:
            logger.warning(
                "Google Search bị chặn — trả về empty DataFrame. Lý do: %s", e
            )
            return pd.DataFrame()
        except Exception as e:
            logger.error("Lỗi không xác định trong run_with_fallback: %s", e, exc_info=True)
            return pd.DataFrame()


# ── Chạy trực tiếp để test ────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )
    scraper = GoogleScraper()
    df      = scraper.run_with_fallback()
    print(f"\nKết quả: {len(df)} bản ghi")
    if not df.empty:
        print(df[["keyword", "title", "source_domain"]].head(10).to_string(index=False))
