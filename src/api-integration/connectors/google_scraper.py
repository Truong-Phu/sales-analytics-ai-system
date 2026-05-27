# -*- coding: utf-8 -*-
"""
GoogleScraper – Thu thập xu hướng thị trường bằng 3 chiến lược tìm kiếm.

DISCLAIMER:
    Chỉ dùng cho mục đích nghiên cứu khóa luận tốt nghiệp.
    Dữ liệu thu thập ở mức thông tin công khai (kết quả tìm kiếm).

CHIẾN LƯỢC TÌM KIẾM (3 lớp, theo thứ tự ưu tiên):
    1. Google HTML   → requests + BeautifulSoup (nhanh, không cần browser)
    2. Playwright    → headless Chromium thật (vượt JS-challenge / bot detection)
                       Cài đặt: pip install playwright && playwright install chromium
    3. DuckDuckGo    → https://html.duckduckgo.com/html/ (không cần API, ít bị chặn)

XỬ LÝ BỊ CHẶN (cascade tự động):
    Google HTML bị block  → thử Playwright
    Playwright cũng fail  → thử DuckDuckGo
    DuckDuckGo cũng fail  → log rõ, bỏ keyword đó, tiếp tục
    Ghi blocked keywords vào response để caller biết

RATE LIMIT CONFIG:
    MIN_DELAY_BETWEEN_KEYWORDS : 3 giây (tối thiểu)
    MAX_KEYWORDS_PER_RUN       : 5
    RETRY_ON_429               : True (chờ 60s rồi retry 1 lần)

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

# ── RATE LIMIT CONFIG ──────────────────────────────────────────────────────────
MIN_DELAY_BETWEEN_KEYWORDS = 3     # giây tối thiểu giữa 2 keyword
MAX_DELAY_BETWEEN_KEYWORDS = 7     # giây tối đa
MAX_KEYWORDS_PER_RUN       = 5     # giới hạn số keyword mỗi lần chạy
RETRY_ON_429               = True  # thử lại 1 lần nếu bị 429
RETRY_429_WAIT_SECS        = 60    # chờ 60 giây trước khi retry

# ── User-Agents xoay vòng (8 UA thật của Chrome/Firefox/Edge 2024-2025) ───────
_USER_AGENTS = [
    # Chrome 124 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Chrome 124 macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Firefox 126 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) "
    "Gecko/20100101 Firefox/126.0",
    # Firefox 125 Linux
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Safari 17 macOS Sonoma
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    # Edge 124 Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    # Chrome 123 Android (mobile UA — thường ít bị block hơn)
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.6312.86 Mobile Safari/537.36",
    # Firefox 124 macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:124.0) "
    "Gecko/20100101 Firefox/124.0",
]

# ── Keywords mặc định ─────────────────────────────────────────────────────────
DEFAULT_KEYWORDS = [
    "xu hướng sản phẩm bán chạy online Việt Nam 2025",
    "trending products Vietnam ecommerce 2025",
    "sản phẩm hot Shopee Lazada TikTok 2025",
    "thị trường bán lẻ online Việt Nam xu hướng",
    "top sản phẩm bán chạy thương mại điện tử Việt Nam",
]

_REQUEST_TIMEOUT    = 12   # timeout request đến Google/DDG (giây)
_CRAWL_TIMEOUT      = 8    # timeout crawl từng URL kết quả (giây)
_MAX_URLS_PER_KW    = 20   # số URL lấy mỗi keyword
_MAX_CRAWL_PER_RUN  = 80   # giới hạn crawl để tránh chạy quá lâu


class GoogleBlockedError(Exception):
    """Raised khi Google trả về 429 / CAPTCHA — caller cần biết để log ETL."""
    pass


class GoogleScraper:
    """
    Thu thập xu hướng thị trường từ Google Search (fallback: DuckDuckGo HTML).

    Luồng:
        1. search_google(keyword) → danh sách URL từ trang SERP
           Nếu Google block → search_duckduckgo(keyword)
        2. crawl_url(url)         → extract nội dung thực tế từng trang
        3. save_to_db(records)    → INSERT vào raw_google_data (dedup by hash)
        4. export_csv(records)    → lưu CSV notebooks/sample_data/
    """

    def __init__(
        self,
        company_id: str = "",
        keywords: Optional[list] = None,
        delay_range: tuple = (MIN_DELAY_BETWEEN_KEYWORDS, MAX_DELAY_BETWEEN_KEYWORDS),
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

        # Giới hạn số keyword mỗi run
        if len(self.keywords) > MAX_KEYWORDS_PER_RUN:
            logger.info(
                "Giới hạn MAX_KEYWORDS_PER_RUN=%d (tổng có %d keywords)",
                MAX_KEYWORDS_PER_RUN, len(self.keywords),
            )
            self.keywords = self.keywords[:MAX_KEYWORDS_PER_RUN]

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

    def load_keywords_from_db(self, limit: int = MAX_KEYWORDS_PER_RUN) -> list[str]:
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

    def _build_google_headers(self) -> dict:
        """Tạo HTTP headers giả lập browser thật cho Google Search."""
        return {
            "User-Agent":                self._random_ua(),
            "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language":           "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding":           "gzip, deflate",
            "Referer":                   "https://www.google.com/",
            "DNT":                       "1",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest":            "document",
            "Sec-Fetch-Mode":            "navigate",
            "Sec-Fetch-Site":            "same-origin",
            "Sec-Fetch-User":            "?1",
            "Cache-Control":             "max-age=0",
        }

    def _build_ddg_headers(self) -> dict:
        """Tạo HTTP headers cho DuckDuckGo HTML search."""
        return {
            "User-Agent":      self._random_ua(),
            "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
            "Referer":         "https://duckduckgo.com/",
            "DNT":             "1",
            "Cache-Control":   "no-cache",
        }

    # ── BƯỚC 1a: Lấy URL từ Google SERP (requests) ───────────────────────────

    def search_google(self, keyword: str, num: int = _MAX_URLS_PER_KW,
                      _retry: bool = False) -> list[str]:
        """
        Gửi query đến Google Search, parse HTML lấy danh sách URL kết quả.

        Args:
            keyword: Từ khóa tìm kiếm.
            num:     Số kết quả yêu cầu (max 20 mỗi request).
            _retry:  True nếu đây là lần retry sau khi chờ 429.

        Returns:
            List[str]: Danh sách URL kết quả.

        Raises:
            GoogleBlockedError: Khi Google trả về 429 / CAPTCHA và không retry.
        """
        encoded_kw = urllib.parse.quote(keyword)
        params = {
            "q":    keyword,
            "num":  num,
            "hl":   "vi",
            "gl":   "vn",
            "safe": "off",
        }
        headers = self._build_google_headers()

        # Log URL request để debug
        search_url = (
            "https://www.google.com/search?"
            + urllib.parse.urlencode(params)
        )
        logger.info("[GOOGLE] Request URL: %s", search_url)

        try:
            resp = self._session.get(
                "https://www.google.com/search",
                params=params,
                headers=headers,
                timeout=_REQUEST_TIMEOUT,
                allow_redirects=True,
            )
        except requests.Timeout:
            logger.error("[GOOGLE] Timeout khi search keyword: %s", keyword)
            return []
        except requests.ConnectionError as e:
            logger.error("[GOOGLE] Lỗi kết nối: %s", e)
            return []

        # Log HTTP status + preview response body
        logger.info(
            "[GOOGLE] keyword='%s' | HTTP %d | final_url=%s",
            keyword, resp.status_code, resp.url,
        )
        body_preview = resp.text[:500].replace("\n", " ").replace("\r", "")
        logger.info("[GOOGLE] Response body (500 chars): %s", body_preview)

        # Xử lý 429 với retry
        if resp.status_code == 429:
            if RETRY_ON_429 and not _retry:
                logger.warning(
                    "[GOOGLE] HTTP 429 cho keyword '%s'. Chờ %ds rồi retry...",
                    keyword, RETRY_429_WAIT_SECS,
                )
                time.sleep(RETRY_429_WAIT_SECS)
                return self.search_google(keyword, num, _retry=True)
            raise GoogleBlockedError(
                f"Google 429 Rate Limited cho keyword '{keyword}'"
            )

        if self._is_blocked_response(resp):
            msg = (
                f"Google Search bị chặn (HTTP {resp.status_code}, "
                f"url={resp.url}) cho keyword '{keyword}'"
            )
            logger.warning("[GOOGLE] %s", msg)
            raise GoogleBlockedError(msg)

        if resp.status_code != 200:
            logger.warning(
                "[GOOGLE] HTTP %d cho keyword '%s' — bỏ qua",
                resp.status_code, keyword,
            )
            return []

        urls = self._parse_google_serp(resp.text)
        logger.info("[GOOGLE] Parse SERP '%s': %d URL tìm thấy", keyword, len(urls))

        if not urls:
            # Log thêm chi tiết để debug selector
            logger.warning(
                "[GOOGLE] 0 URL parsed cho '%s'. Kiểm tra HTML bên dưới:",
                keyword,
            )
            # Log thêm 1000 chars để có thể kiểm tra cấu trúc
            logger.debug("[GOOGLE] Full HTML (1000 chars): %s", resp.text[:1000].replace("\n", " "))

        return urls

    def _parse_google_serp(self, html: str) -> list[str]:
        """
        Parse HTML trang Google SERP, trích xuất URL kết quả.

        Google thay đổi class name thường xuyên → dùng nhiều chiến lược:
          1. /url?q=... trong toàn bộ href (đáng tin nhất cho Google SERP cổ điển)
          2. jsname="UWckNb" — organic result link (khá ổn định 2024-2025)
          3. data-ved + href bắt đầu bằng https://
          4. h3 parent link (title wrapper)
          5. Quét toàn bộ href https:// ngoài Google (last resort)
        """
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        seen: set[str]  = set()

        _GOOGLE_HOSTS = (
            "google.com", "google.co.", "google.com.vn",
            "googleusercontent", "googleapis", "gstatic",
            "youtube.com", "accounts.google", "support.google",
        )

        def _is_google(href: str) -> bool:
            return any(h in href for h in _GOOGLE_HOSTS)

        def _try_add(href: str) -> bool:
            """Chuẩn hóa href, thêm vào danh sách nếu hợp lệ."""
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

        # Chiến lược 1: /url?q=... (đáng tin nhất)
        for a in soup.find_all("a", href=lambda h: h and h.startswith("/url?q=")):
            _try_add(a["href"])
            if len(urls) >= _MAX_URLS_PER_KW:
                break

        # Chiến lược 2: jsname="UWckNb" (organic result, ổn định 2024-2025)
        if len(urls) < _MAX_URLS_PER_KW:
            for a in soup.find_all("a", attrs={"jsname": "UWckNb"}):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 3: data-ved + href https:// (result block links)
        if len(urls) < _MAX_URLS_PER_KW:
            for a in soup.find_all("a", attrs={"data-ved": True}):
                href = a.get("href", "")
                if href.startswith("https://"):
                    _try_add(href)
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 4: thẻ cha của h3 (title block) → a[href]
        if len(urls) < _MAX_URLS_PER_KW:
            for h3 in soup.find_all("h3"):
                parent = h3.find_parent("a")
                if parent:
                    _try_add(parent.get("href", ""))
                else:
                    # h3 > a hoặc a > h3
                    a_child = h3.find("a")
                    if a_child:
                        _try_add(a_child.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 5: div.g a (selector cũ) + div[data-ved] > a
        if len(urls) < _MAX_URLS_PER_KW:
            for a in soup.select("div.g a[href], div[data-ved] > a[href]"):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Chiến lược 6 (last resort): quét toàn bộ a[href=https://...]
        if len(urls) < 3:
            for a in soup.find_all("a", href=lambda h: h and h.startswith("https://")):
                _try_add(a.get("href", ""))
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        if not urls:
            body_preview = html[:300].replace("\n", " ")
            logger.warning(
                "[GOOGLE] SERP parse 0 URL sau 6 chiến lược. "
                "HTML preview: %s", body_preview,
            )
        else:
            logger.debug("[GOOGLE] URLs parsed: %s", urls[:5])

        return urls

    # ── BƯỚC 1b: Playwright (Chiến lược 2) ───────────────────────────────────

    def _search_google_playwright(self, keyword: str, num: int = _MAX_URLS_PER_KW) -> list[str]:
        """
        Chiến lược 2: Mở Google Search bằng headless Chromium thật (Playwright).
        Vượt qua JavaScript challenge / bot-detection nhẹ mà requests không làm được.

        Cài đặt (1 lần):
            pip install playwright
            playwright install chromium

        Returns:
            list[str]: Danh sách URL kết quả, [] nếu playwright chưa cài hoặc bị chặn.
        """
        try:
            from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout
        except ImportError:
            logger.warning(
                "[PW] playwright chưa cài — bỏ qua S2. "
                "Cài: pip install playwright && playwright install chromium"
            )
            return []

        search_url = (
            "https://www.google.com/search?"
            + urllib.parse.urlencode({"q": keyword, "num": num, "hl": "vi", "gl": "vn"})
        )
        logger.info("[PW] Playwright → %s", search_url)

        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-blink-features=AutomationControlled",
                        "--disable-infobars",
                    ],
                )
                ctx = browser.new_context(
                    viewport={
                        "width":  random.randint(1280, 1920),
                        "height": random.randint(800, 1080),
                    },
                    locale="vi-VN",
                    user_agent=self._random_ua(),
                    extra_http_headers={"Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8"},
                )
                page = ctx.new_page()

                # Ẩn dấu hiệu automation (navigator.webdriver = undefined)
                page.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
                )

                try:
                    page.goto(search_url, wait_until="domcontentloaded", timeout=25_000)
                except PwTimeout:
                    logger.warning("[PW] Timeout goto cho '%s'", keyword)
                    browser.close()
                    return []

                # Giả lập dừng đọc trang (hành vi người dùng)
                page.wait_for_timeout(random.randint(1200, 2500))

                current_url = page.url
                content     = page.content()

                # Kiểm tra CAPTCHA / /sorry/
                if "/sorry/" in current_url or "captcha" in content.lower()[:3000]:
                    logger.warning(
                        "[PW] Google CAPTCHA/sorry cho '%s' (url=%s)", keyword, current_url
                    )
                    browser.close()
                    return []

                # Dùng lại _parse_google_serp trên HTML đã render đầy đủ
                urls = self._parse_google_serp(content)

                # Nếu BeautifulSoup vẫn 0 kết quả → thử JS query trực tiếp trong DOM
                if not urls:
                    logger.debug("[PW] BS4 0 URL — thử JS evaluate trực tiếp")
                    try:
                        js_urls: list[str] = page.evaluate(
                            """
                            () => {
                                const skip = ['google.com','googleapis.com','gstatic.com',
                                              'youtube.com','accounts.google','support.google'];
                                const seen = new Set();
                                const out  = [];
                                const sel  = 'a[jsname="UWckNb"], h3 a, .g a, [data-ved] a';
                                for (const a of document.querySelectorAll(sel)) {
                                    const h = a.href;
                                    if (!h || !h.startsWith('http')) continue;
                                    if (skip.some(d => h.includes(d)))  continue;
                                    if (seen.has(h)) continue;
                                    seen.add(h);
                                    out.push(h);
                                    if (out.length >= 20) break;
                                }
                                return out;
                            }
                            """
                        )
                        if js_urls:
                            urls = list(js_urls)
                            logger.info("[PW] JS evaluate: %d URL cho '%s'", len(urls), keyword)
                    except Exception as js_err:
                        logger.debug("[PW] JS evaluate lỗi: %s", js_err)

                browser.close()
                logger.info("[PW] Playwright kết quả '%s': %d URL", keyword, len(urls))
                return urls

        except Exception as e:
            logger.error("[PW] Playwright lỗi chung cho '%s': %s", keyword, e, exc_info=True)
            return []

    # ── BƯỚC 1c: DuckDuckGo (Chiến lược 3) ───────────────────────────────────

    def search_duckduckgo(self, keyword: str) -> list[str]:
        """
        Fallback tìm kiếm qua DuckDuckGo HTML (không cần API key).
        Dùng khi Google bị blocked.

        Returns:
            List[str]: Danh sách URL kết quả từ DDG.
        """
        params  = {"q": keyword, "kl": "vn-vi"}
        headers = self._build_ddg_headers()

        search_url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode(params)
        logger.info("[DDG] Fallback request URL: %s", search_url)

        try:
            resp = requests.post(
                "https://html.duckduckgo.com/html/",
                data={"q": keyword, "kl": "vn-vi"},
                headers=headers,
                timeout=_REQUEST_TIMEOUT,
                allow_redirects=True,
            )
        except requests.Timeout:
            logger.error("[DDG] Timeout khi search keyword: %s", keyword)
            return []
        except requests.ConnectionError as e:
            logger.error("[DDG] Lỗi kết nối: %s", e)
            return []
        except Exception as e:
            logger.error("[DDG] Lỗi không xác định: %s", e, exc_info=True)
            return []

        logger.info(
            "[DDG] keyword='%s' | HTTP %d | url=%s",
            keyword, resp.status_code, resp.url,
        )
        body_preview = resp.text[:500].replace("\n", " ")
        logger.info("[DDG] Response body (500 chars): %s", body_preview)

        if resp.status_code != 200:
            logger.warning("[DDG] HTTP %d — bỏ qua keyword '%s'", resp.status_code, keyword)
            return []

        urls = self._parse_ddg_results(resp.text)
        logger.info("[DDG] Parse '%s': %d URL tìm thấy", keyword, len(urls))
        return urls

    def _parse_ddg_results(self, html: str) -> list[str]:
        """
        Parse HTML từ DuckDuckGo HTML search.
        DDG HTML dùng class "result__a" cho organic result links.
        """
        soup = BeautifulSoup(html, "html.parser")
        urls: list[str] = []
        seen: set[str]  = set()

        _SKIP_DOMAINS = ("duckduckgo.com", "duck.com")

        def _skip(href: str) -> bool:
            return any(d in href for d in _SKIP_DOMAINS)

        # Selector chính: class="result__a" (DDG organic results)
        for a in soup.find_all("a", class_="result__a"):
            href = a.get("href", "")
            # DDG dùng redirect /l/?uddg=URL
            if "uddg=" in href:
                qs   = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
                href = urllib.parse.unquote(qs.get("uddg", [""])[0])
            if href.startswith("http") and not _skip(href) and href not in seen:
                seen.add(href)
                urls.append(href)
                if len(urls) >= _MAX_URLS_PER_KW:
                    break

        # Fallback: tất cả <a href="https://..."> ngoài DDG
        if len(urls) < 3:
            for a in soup.find_all("a", href=lambda h: h and h.startswith("https://")):
                href = a.get("href", "")
                if not _skip(href) and href not in seen:
                    seen.add(href)
                    urls.append(href)
                    if len(urls) >= _MAX_URLS_PER_KW:
                        break

        if not urls:
            logger.warning("[DDG] Parse 0 URL. HTML preview: %s", html[:300].replace("\n", " "))

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
            logger.debug("[CRAWL] Thất bại '%s': %s", url[:80], e)
            return None
        except Exception as e:
            logger.debug("[CRAWL] Lỗi không xác định '%s': %s", url[:80], e)
            return None

        if resp.status_code != 200:
            logger.debug("[CRAWL] HTTP %d cho '%s'", resp.status_code, url[:80])
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
                if price and price > 100:
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

    def scrape_all(self) -> tuple[list[dict], list[str]]:
        """
        Bước 1: Lấy URL qua cascade 3 chiến lược (mỗi keyword → 10-20 URL):
                  S1 Google HTML → S2 Playwright → S3 DuckDuckGo
        Bước 2: Crawl từng URL thu được.

        Returns:
            (records, blocked_keywords)
            records          : Danh sách bản ghi đã crawl.
            blocked_keywords : Danh sách keyword bị block ở cả 3 nguồn.

        Raises:
            GoogleBlockedError: Nếu TẤT CẢ keywords đều bị chặn ở cả 3 nguồn.
        """
        all_urls        = []   # list of (url, keyword)
        blocked_kw      = []   # keyword bị block cả 3 lớp
        kw_source_map   = {}   # keyword → "google_html"|"google_playwright"|"duckduckgo"|"blocked"

        for i, keyword in enumerate(self.keywords):
            logger.info(
                "[SCRAPER] [%d/%d] Xử lý keyword: '%s'",
                i + 1, len(self.keywords), keyword,
            )
            urls_found: list[str] = []
            source_used = "none"

            # ── Chiến lược 1: Google HTML (requests + BeautifulSoup) ──────────
            try:
                urls_found = self.search_google(keyword)
                if urls_found:
                    source_used = "google_html"
                    logger.info(
                        "[SCRAPER] [S1-GoogleHTML] '%s': %d URL", keyword, len(urls_found)
                    )
            except GoogleBlockedError as e:
                logger.warning(
                    "[SCRAPER] [S1-GoogleHTML] Bị block '%s': %s", keyword, e
                )
                self._log_etl_blocked(keyword, f"S1 GoogleHTML: {e}")
            except Exception as e:
                logger.error(
                    "[SCRAPER] [S1-GoogleHTML] Lỗi '%s': %s", keyword, e, exc_info=True
                )

            # ── Chiến lược 2: Playwright (headless Chromium) ─────────────────
            if not urls_found:
                logger.info("[SCRAPER] [S2-Playwright] Thử Playwright cho '%s'...", keyword)
                try:
                    urls_found = self._search_google_playwright(keyword)
                    if urls_found:
                        source_used = "google_playwright"
                        logger.info(
                            "[SCRAPER] [S2-Playwright] OK '%s': %d URL", keyword, len(urls_found)
                        )
                    else:
                        logger.warning(
                            "[SCRAPER] [S2-Playwright] 0 URL cho '%s' — thử S3", keyword
                        )
                        self._log_etl_blocked(keyword, "S2 Playwright: 0 URL")
                except Exception as e:
                    logger.error(
                        "[SCRAPER] [S2-Playwright] Lỗi '%s': %s", keyword, e, exc_info=True
                    )
                    self._log_etl_blocked(keyword, f"S2 Playwright error: {e}")

            # ── Chiến lược 3: DuckDuckGo HTML ────────────────────────────────
            if not urls_found:
                logger.info("[SCRAPER] [S3-DuckDuckGo] Thử DDG cho '%s'...", keyword)
                try:
                    urls_found = self.search_duckduckgo(keyword)
                    if urls_found:
                        source_used = "duckduckgo"
                        logger.info(
                            "[SCRAPER] [S3-DuckDuckGo] OK '%s': %d URL", keyword, len(urls_found)
                        )
                    else:
                        source_used = "blocked"
                        blocked_kw.append(keyword)
                        logger.warning(
                            "[SCRAPER] [S3-DuckDuckGo] 0 URL '%s' — bỏ qua keyword này",
                            keyword,
                        )
                        self._log_etl_blocked(keyword, "S3 DDG: 0 URL — all strategies failed")
                except Exception as ddg_exc:
                    source_used = "blocked"
                    blocked_kw.append(keyword)
                    logger.error(
                        "[SCRAPER] [S3-DuckDuckGo] Lỗi '%s': %s",
                        keyword, ddg_exc, exc_info=True,
                    )
                    self._log_etl_blocked(keyword, f"S3 DDG error: {ddg_exc}")

            kw_source_map[keyword] = source_used

            for u in urls_found:
                all_urls.append((u, keyword))

            if urls_found:
                self.update_keyword_usage(keyword)

            # Delay giữa các keyword (ít nhất MIN_DELAY_BETWEEN_KEYWORDS giây)
            if i < len(self.keywords) - 1:
                delay = random.uniform(
                    max(self.delay_range[0], MIN_DELAY_BETWEEN_KEYWORDS),
                    max(self.delay_range[1], MIN_DELAY_BETWEEN_KEYWORDS + 1),
                )
                logger.info("[SCRAPER] Chờ %.1f giây trước keyword tiếp theo...", delay)
                time.sleep(delay)

        # Tất cả keyword đều bị block ở cả 3 nguồn
        if len(blocked_kw) == len(self.keywords):
            raise GoogleBlockedError(
                "Tất cả keywords đều bị chặn ở cả 3 nguồn (Google HTML, Playwright, DuckDuckGo) — cần thử lại sau"
            )

        # Dedup URL, giữ mapping keyword
        seen_urls = {}
        for url, kw in all_urls:
            if url not in seen_urls:
                seen_urls[url] = kw

        logger.info(
            "[SCRAPER] Tổng %d URL duy nhất từ %d/%d keywords thành công",
            len(seen_urls), len(self.keywords) - len(blocked_kw), len(self.keywords),
        )

        # Giới hạn số URL crawl
        urls_to_crawl = list(seen_urls.items())[:_MAX_CRAWL_PER_RUN]
        records = []

        for j, (url, keyword) in enumerate(urls_to_crawl):
            logger.debug("[CRAWL] [%d/%d] %s", j + 1, len(urls_to_crawl), url[:80])
            data = self.crawl_url(url)
            if data:
                data["keyword"]      = keyword
                data["position"]     = j + 1
                data["content_hash"] = self._content_hash(
                    data.get("title", ""), data.get("snippet", "")
                )
                records.append(data)

            if j < len(urls_to_crawl) - 1:
                self._sleep(self.crawl_delay_range)

        logger.info(
            "[SCRAPER] scrape_all hoàn thành: %d URL crawl → %d bản ghi | blocked=%s",
            len(urls_to_crawl), len(records), blocked_kw,
        )
        return records, blocked_kw

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
        """Tra cứu keyword_id từ scraper_keywords theo danh sách keyword string."""
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

            cid = self.company_id or None

            for r in records:
                ch = r.get("content_hash")
                if ch and ch in existing:
                    skipped += 1
                    continue

                kw  = r.get("keyword", "")
                kid = kw_id_map.get(kw)

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
        """Ghi log vào file ETL khi Google/DDG chặn — để trace lại sau."""
        try:
            log_dir = _REPO_ROOT / "logs"
            log_dir.mkdir(exist_ok=True)
            log_file = log_dir / "etl_google_blocked.log"
            ts = self._now_vn()
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"[{ts}] keyword='{keyword}' | {reason}\n")
        except Exception as e:
            logger.debug("Không ghi được ETL log file: %s", e)

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
            dict: {status, keywords_processed, results_found, results_new,
                   results_skipped, blocked_keywords, error_detail, csv_path}
        """
        logger.info("=== GoogleScraper bắt đầu (mode=%s) ===", _SCRAPER_MODE)

        blocked_keywords: list[str] = []

        if _SCRAPER_MODE == "offline":
            records = self._load_offline_csv()
        else:
            try:
                records, blocked_keywords = self.scrape_all()
            except GoogleBlockedError as e:
                logger.error("Tất cả keywords bị block: %s", e)
                return {
                    "status":             "blocked",
                    "keywords_processed": len(self.keywords),
                    "results_found":      0,
                    "results_new":        0,
                    "results_skipped":    0,
                    "blocked_keywords":   self.keywords,
                    "error_detail":       str(e),
                    "csv_path":           None,
                    # Legacy keys cho backward-compat
                    "total_scraped":      0,
                    "inserted":           0,
                    "skipped":            0,
                }
            except Exception as e:
                logger.error("Lỗi không xác định trong run(): %s", e, exc_info=True)
                return {
                    "status":             "error",
                    "keywords_processed": len(self.keywords),
                    "results_found":      0,
                    "results_new":        0,
                    "results_skipped":    0,
                    "blocked_keywords":   blocked_keywords,
                    "error_detail":       str(e)[:500],
                    "csv_path":           None,
                    "total_scraped":      0,
                    "inserted":           0,
                    "skipped":            0,
                }

        csv_path = self.export_csv(records)
        inserted, skipped = self.save_to_db(records)

        # Xác định status tổng hợp
        if len(blocked_keywords) == 0:
            status = "success"
        elif len(blocked_keywords) < len(self.keywords):
            status = "partial"
        else:
            status = "blocked"

        summary = {
            "status":             status,
            "keywords_processed": len(self.keywords),
            "results_found":      len(records),
            "results_new":        inserted,
            "results_skipped":    skipped,
            "blocked_keywords":   blocked_keywords,
            "error_detail":       None,
            "csv_path":           str(csv_path) if csv_path else None,
            # Legacy keys cho backward-compat với main.py
            "total_scraped":      len(records),
            "inserted":           inserted,
            "skipped":            skipped,
        }
        logger.info(
            "=== GoogleScraper xong: status=%s | found=%d | new=%d | skipped=%d | blocked=%s ===",
            status, len(records), inserted, skipped, blocked_keywords,
        )
        return summary

    def run_with_fallback(self) -> pd.DataFrame:
        """
        Wrapper an toàn: thử scrape Google/DDG.
        KHÔNG tạo mock data trong bất kỳ trường hợp.

        Returns:
            pd.DataFrame: Dữ liệu scrape được (có thể rỗng nếu bị chặn).
        """
        try:
            records, blocked_kw = self.scrape_all()
            csv_path = self.export_csv(records)
            self.save_to_db(records)
            if blocked_kw:
                logger.warning(
                    "run_with_fallback: %d keyword bị block: %s",
                    len(blocked_kw), blocked_kw,
                )
            logger.info("run_with_fallback: %d bản ghi thu thập được", len(records))
            return pd.DataFrame(records) if records else pd.DataFrame()
        except GoogleBlockedError as e:
            logger.warning(
                "Google+DDG đều bị chặn — trả về empty DataFrame. Lý do: %s", e
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
