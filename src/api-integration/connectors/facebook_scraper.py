# -*- coding: utf-8 -*-
"""
FacebookScraper – Scrape bài đăng và comments từ Facebook page public.

DISCLAIMER:
    Chỉ dùng cho mục đích nghiên cứu khóa luận tốt nghiệp.
    Scrape trang Facebook do tác giả tự tạo và sở hữu.
    KHÔNG scrape dữ liệu cá nhân của người khác.
    KHÔNG vi phạm Terms of Service của Facebook trong phạm vi
    sử dụng cho nghiên cứu học thuật.

Kỹ thuật:
    - Dùng phiên bản mobile (m.facebook.com) – ít JS hơn, dễ parse hơn
    - Random User-Agent và delay giữa các request
    - BeautifulSoup4 để parse HTML
"""

import hashlib
import json
import logging
import os
import random
import re
import time
from datetime import datetime, timezone
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── User-Agent cho mobile (ít bị chặn hơn desktop) ──────────────────────────
_MOBILE_USER_AGENTS = [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
]


import csv as _csv_module
from pathlib import Path as _Path

# Đường dẫn file CSV mẫu cho offline mode
_SAMPLE_FB_CSV = (
    _Path(__file__).resolve().parents[3]
    / "notebooks" / "sample_data" / "sample_facebook_data.csv"
)


class FacebookScraper:
    """
    Scrape bài đăng và comments từ Facebook page public dùng requests + BeautifulSoup.

    Hỗ trợ 2 chế độ (SCRAPER_MODE trong .env):
        - online (mặc định): Scrape thực tế từ m.facebook.com
        - offline: Đọc dữ liệu mẫu từ notebooks/sample_data/sample_facebook_data.csv
          (dùng cho development, demo, testing khi không có tài khoản FB)

    Luồng (online):
        1. Với mỗi page_url → scrape_page() → lấy tối đa 20 bài gần nhất
        2. Với mỗi bài → scrape_comments() → tối đa 50 comments đầu
        3. Tính content_hash = md5(page_name + post_id)
        4. Lưu vào bảng raw_facebook_data, bỏ qua nếu hash đã tồn tại
    """

    def __init__(
        self,
        page_urls: Optional[list] = None,
        delay_range: tuple = (3, 7),
    ):
        """
        Khởi tạo scraper.

        Args:
            page_urls:   Danh sách URL page Facebook cần scrape.
                         Nếu None → đọc từ FACEBOOK_PAGE_URLS trong .env
                         (chuỗi phân cách bằng dấu phẩy).
                         Đây là page do người dùng tự tạo và kiểm soát.
            delay_range: (min, max) giây delay ngẫu nhiên giữa các request.
        """
        # Đọc page_urls từ env nếu không truyền vào
        if page_urls is not None:
            self.page_urls = page_urls
        else:
            env_urls = os.getenv("FACEBOOK_PAGE_URLS", "")
            self.page_urls = [
                u.strip() for u in env_urls.split(",")
                if u.strip()
            ] if env_urls else []

        self.delay_range = delay_range
        self.db_url      = os.getenv("DATABASE_URL", "")
        # Chế độ: offline → dùng CSV mẫu, online → scrape thực tế
        self.scraper_mode = os.getenv("SCRAPER_MODE", "online").lower()
        self._session    = requests.Session()
        self._session.headers.update({
            "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        })
        logger.info(
            "FacebookScraper khởi tạo: %d pages, delay=%s giây, mode=%s",
            len(self.page_urls), delay_range, self.scraper_mode,
        )

    # ── Offline fallback ─────────────────────────────────────────────────────

    def _load_offline_sample(self) -> list[dict]:
        """
        Đọc dữ liệu mẫu từ sample_facebook_data.csv khi SCRAPER_MODE=offline.

        CSV columns: page_name, post_id, post_content, reactions_count, post_date

        Returns:
            List[dict]: Danh sách post với content_hash đã tính sẵn.
        """
        csv_path = _SAMPLE_FB_CSV
        if not csv_path.exists():
            logger.warning(
                "Offline mode: file mẫu không tồn tại: %s", csv_path
            )
            return []

        posts = []
        with open(csv_path, encoding="utf-8-sig", newline="") as f:
            reader = _csv_module.DictReader(f)
            for row in reader:
                page_name = row.get("page_name", "").strip()
                post_id   = row.get("post_id", "").strip()
                content   = row.get("post_content", "").strip()
                if not content:
                    continue

                try:
                    reactions = int(row.get("reactions_count", 0) or 0)
                except ValueError:
                    reactions = 0

                post_date = None
                date_str  = (row.get("post_date") or "").strip()
                if date_str:
                    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
                        try:
                            post_date = datetime.strptime(date_str, fmt).replace(
                                tzinfo=timezone.utc
                            )
                            break
                        except ValueError:
                            continue

                posts.append({
                    "page_name":       page_name,
                    "post_id":         post_id,
                    "post_content":    content,
                    "reactions_count": reactions,
                    "post_date":       post_date,
                    "comments":        [],
                    "content_hash":    self._content_hash(page_name, post_id),
                })

        logger.info(
            "Offline mode: đã đọc %d bài từ %s", len(posts), csv_path.name
        )
        return posts

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _random_ua(self) -> str:
        """Chọn mobile User-Agent ngẫu nhiên."""
        return random.choice(_MOBILE_USER_AGENTS)

    def _sleep(self) -> None:
        """Delay ngẫu nhiên để tránh rate-limit."""
        secs = random.uniform(*self.delay_range)
        logger.debug("Đang chờ %.1f giây...", secs)
        time.sleep(secs)

    @staticmethod
    def _content_hash(page_name: str, post_id: str) -> str:
        """Tính MD5 từ page_name + post_id để dedup."""
        raw = (page_name or "") + (post_id or "")
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    @staticmethod
    def _to_mobile_url(page_url: str) -> str:
        """
        Chuyển URL desktop Facebook sang mobile (m.facebook.com).
        Mobile version dễ parse hơn vì ít JavaScript hơn.
        """
        url = page_url.strip()
        url = url.replace("https://www.facebook.com", "https://m.facebook.com")
        url = url.replace("https://facebook.com", "https://m.facebook.com")
        # Thêm ?_rdr để force redirect về mobile
        if "?" not in url:
            url += "?_rdr"
        return url

    @staticmethod
    def _extract_page_name(page_url: str) -> str:
        """Trích xuất tên/slug của page từ URL."""
        # VD: https://www.facebook.com/shopABC → shopABC
        parts = page_url.rstrip("/").split("/")
        return parts[-1] if parts else page_url

    @staticmethod
    def _extract_post_id(href: str) -> str:
        """Trích xuất post ID từ href bài đăng."""
        # VD: /shopABC/posts/123456789 hoặc /story.php?story_fbid=123&id=456
        m = re.search(r"/posts/(\d+)", href)
        if m:
            return m.group(1)
        m = re.search(r"story_fbid=(\d+)", href)
        if m:
            return m.group(1)
        # Fallback: dùng phần cuối href
        return href.split("/")[-1].split("?")[0] or href[:50]

    # ── Core scraping ────────────────────────────────────────────────────────

    def scrape_page(self, page_url: str) -> list[dict]:
        """
        Scrape danh sách bài đăng từ 1 Facebook page public.

        Dùng phiên bản mobile (m.facebook.com) để tránh render JS nặng.
        Lấy tối đa 20 bài gần nhất.
        Nếu page private hoặc lỗi → log và trả về [].

        Args:
            page_url: URL page Facebook (desktop hoặc mobile đều được).

        Returns:
            List[dict]: [{page_name, post_id, post_content, reactions_count, post_date}]
        """
        posts     = []
        page_name = self._extract_page_name(page_url)
        mobile_url = self._to_mobile_url(page_url)

        headers = {"User-Agent": self._random_ua()}

        try:
            resp = self._session.get(mobile_url, headers=headers, timeout=20)

            if resp.status_code == 404:
                logger.warning("Page không tồn tại hoặc đã bị xóa: %s", page_url)
                return []
            if resp.status_code != 200:
                logger.warning(
                    "HTTP %d khi scrape page: %s", resp.status_code, page_url
                )
                return []

            # Kiểm tra page có bị khóa riêng tư không
            if "This content isn't available" in resp.text or \
               "Nội dung này không khả dụng" in resp.text:
                logger.warning("Page private hoặc hạn chế: %s", page_url)
                return []

            soup = BeautifulSoup(resp.text, "lxml")

            # Tìm các bài đăng – trên m.facebook.com thường dùng article hoặc div[data-ft]
            post_containers = soup.find_all("article") or \
                              soup.find_all("div", attrs={"data-ft": True})

            for container in post_containers[:20]:   # Tối đa 20 bài
                # Lấy nội dung bài
                # Thử các selector phổ biến của Facebook mobile
                content_el = (
                    container.find("div", class_=re.compile(r"story_body|userContent|_5pbx"))
                    or container.find("p")
                )
                post_content = content_el.get_text(separator=" ", strip=True) \
                    if content_el else ""

                if not post_content:
                    continue  # Bỏ qua bài không có nội dung text

                # Lấy post ID từ link "xem thêm" hoặc timestamp
                post_id = ""
                link_el = container.find("a", href=re.compile(r"/posts/|story_fbid"))
                if link_el:
                    post_id = self._extract_post_id(link_el["href"])

                # Nếu không tìm được ID, tạo ID từ content hash (fallback)
                if not post_id:
                    post_id = hashlib.md5(post_content[:100].encode()).hexdigest()[:16]

                # Lấy số reactions
                reactions_count = 0
                reaction_el = container.find(
                    text=re.compile(r"\d+\s*(lượt thích|like|reaction)", re.I)
                )
                if reaction_el:
                    nums = re.findall(r"\d+", reaction_el)
                    reactions_count = int(nums[0]) if nums else 0

                # Lấy ngày đăng (từ thẻ abbr hoặc time)
                post_date = None
                time_el = container.find("abbr") or container.find("time")
                if time_el:
                    ts = time_el.get("data-utime") or time_el.get("datetime")
                    if ts:
                        try:
                            if ts.isdigit():
                                post_date = datetime.fromtimestamp(
                                    int(ts), tz=timezone.utc
                                )
                            else:
                                post_date = datetime.fromisoformat(ts)
                        except (ValueError, OSError):
                            post_date = None

                posts.append({
                    "page_name":       page_name,
                    "post_id":         post_id,
                    "post_content":    post_content[:2000],  # Giới hạn 2000 ký tự
                    "reactions_count": reactions_count,
                    "post_date":       post_date,
                    "post_url":        f"{page_url}/posts/{post_id}" if post_id else page_url,
                })

            logger.info(
                "scrape_page '%s': %d bài đăng", page_name, len(posts)
            )

        except requests.Timeout:
            logger.error("Timeout khi scrape page: %s", page_url)
        except requests.ConnectionError as e:
            logger.error("Lỗi kết nối '%s': %s", page_url, e)
        except Exception as e:
            logger.error(
                "Lỗi không xác định khi scrape '%s': %s", page_url, e, exc_info=True
            )

        return posts

    def scrape_comments(self, post_url: str) -> list[dict]:
        """
        Scrape comments của 1 bài đăng.

        Lấy tối đa 50 comments đầu tiên.
        Mỗi comment gồm: author, content, time.
        Trả về [] nếu không lấy được comments.

        Args:
            post_url: URL đầy đủ của bài đăng.

        Returns:
            List[dict]: [{"author": "...", "content": "...", "time": "..."}]
        """
        comments  = []
        mobile_url = self._to_mobile_url(post_url)
        headers   = {"User-Agent": self._random_ua()}

        try:
            resp = self._session.get(mobile_url, headers=headers, timeout=20)
            if resp.status_code != 200:
                return []

            soup = BeautifulSoup(resp.text, "lxml")

            # Tìm section comments trên mobile Facebook
            comment_els = soup.find_all("div", id=re.compile(r"^ufi_")) or \
                          soup.find_all("div", class_=re.compile(r"comment"))

            for el in comment_els[:50]:    # Tối đa 50 comments
                # Lấy tên tác giả
                author_el = el.find("a", class_=re.compile(r"actor|author"))
                author = author_el.get_text(strip=True) if author_el else "Ẩn danh"

                # Lấy nội dung comment
                body_el = el.find("div", class_=re.compile(r"_5mdd|_2b04|userContent"))
                content = body_el.get_text(strip=True) if body_el else ""
                if not content:
                    continue

                # Lấy thời gian
                time_el = el.find("abbr") or el.find("time")
                cmt_time = ""
                if time_el:
                    cmt_time = (
                        time_el.get("title")
                        or time_el.get("datetime")
                        or time_el.get_text(strip=True)
                        or ""
                    )

                comments.append({
                    "author":  author,
                    "content": content[:500],  # Giới hạn 500 ký tự/comment
                    "time":    cmt_time,
                })

        except Exception as e:
            logger.debug("Không lấy được comments từ %s: %s", post_url, e)

        return comments

    # ── Scrape all ───────────────────────────────────────────────────────────

    def scrape_all(self) -> list[dict]:
        """
        Lặp qua tất cả page_urls, scrape bài đăng và comments.

        Với mỗi page → scrape_page() → với mỗi bài → scrape_comments().
        Tính content_hash = md5(page_name + post_id).

        Returns:
            List[dict]: Tổng hợp tất cả bài đăng với comments đính kèm.
        """
        all_posts = []

        for i, page_url in enumerate(self.page_urls):
            logger.info(
                "[%d/%d] Đang scrape page: %s", i + 1, len(self.page_urls), page_url
            )

            posts = self.scrape_page(page_url)

            for post in posts:
                # Scrape comments cho từng bài
                self._sleep()   # Delay trước mỗi request comments
                comments = self.scrape_comments(post.get("post_url", page_url))
                post["comments"]     = comments
                post["content_hash"] = self._content_hash(
                    post["page_name"], post["post_id"]
                )
                all_posts.append(post)

            # Delay giữa các page
            if i < len(self.page_urls) - 1:
                self._sleep()

        logger.info(
            "scrape_all hoàn thành: %d bài từ %d pages",
            len(all_posts), len(self.page_urls),
        )
        return all_posts

    # ── Database ─────────────────────────────────────────────────────────────

    def save_to_db(self, results: list[dict]) -> tuple[int, int]:
        """
        Lưu kết quả vào bảng raw_facebook_data.

        Comments lưu dưới dạng JSONB.
        Bỏ qua bản ghi nếu content_hash đã tồn tại (dedup).

        Returns:
            (inserted, skipped): Số bản ghi đã lưu và bỏ qua.
        """
        if not results:
            logger.info("Không có bài đăng để lưu.")
            return 0, 0

        if not self.db_url:
            logger.error("DATABASE_URL chưa cấu hình – không thể lưu DB.")
            return 0, len(results)

        inserted = 0
        skipped  = 0

        try:
            conn = psycopg2.connect(self.db_url)
            cur  = conn.cursor()

            # Lấy hash đã tồn tại để batch check
            hashes = [r["content_hash"] for r in results if r.get("content_hash")]
            if hashes:
                cur.execute(
                    "SELECT content_hash FROM public.raw_facebook_data "
                    "WHERE content_hash = ANY(%s)",
                    (hashes,),
                )
                existing = {row[0] for row in cur.fetchall()}
            else:
                existing = set()

            for r in results:
                ch = r.get("content_hash")
                if ch and ch in existing:
                    skipped += 1
                    continue

                # Chuyển list comments sang JSON string
                comments_json = json.dumps(r.get("comments", []), ensure_ascii=False)

                cur.execute(
                    """
                    INSERT INTO public.raw_facebook_data
                        (page_name, post_id, post_content, comments,
                         reactions_count, post_date, content_hash)
                    VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s)
                    """,
                    (
                        r.get("page_name"),
                        r.get("post_id"),
                        r.get("post_content"),
                        comments_json,
                        r.get("reactions_count", 0),
                        r.get("post_date"),
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

    # ── Entry point ──────────────────────────────────────────────────────────

    def run(self) -> dict:
        """
        Chạy toàn bộ luồng: scrape_all() → save_to_db().

        Nếu SCRAPER_MODE=offline → đọc từ CSV mẫu thay vì scrape thực tế.
        Nếu SCRAPER_MODE=online và không có page_urls → trả về kết quả rỗng.

        Returns:
            dict: {total_scraped, inserted, skipped}
        """
        logger.info("=== FacebookScraper bắt đầu chạy (mode=%s) ===", self.scraper_mode)

        if self.scraper_mode == "offline":
            # Chế độ offline: dùng dữ liệu mẫu từ CSV
            results = self._load_offline_sample()
        elif not self.page_urls:
            logger.warning(
                "Không có page_urls – set FACEBOOK_PAGE_URLS trong .env "
                "hoặc SCRAPER_MODE=offline để dùng dữ liệu mẫu."
            )
            return {"total_scraped": 0, "inserted": 0, "skipped": 0}
        else:
            results = self.scrape_all()

        inserted, skipped = self.save_to_db(results)

        summary = {
            "total_scraped": len(results),
            "inserted":      inserted,
            "skipped":       skipped,
        }
        logger.info(
            "=== FacebookScraper hoàn thành: scrape=%d | lưu=%d | bỏ qua=%d ===",
            len(results), inserted, skipped,
        )
        return summary


# ── Chạy trực tiếp để test ──────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )
    # DISCLAIMER: Chỉ dùng cho mục đích nghiên cứu khóa luận,
    # scrape trang Facebook do tác giả tự tạo và sở hữu.
    scraper = FacebookScraper(page_urls=[
        # Thêm URL page Facebook của bạn vào đây
        # VD: "https://www.facebook.com/your-test-page"
    ])
    result = scraper.run()
    print(f"\nKết quả: {result}")
