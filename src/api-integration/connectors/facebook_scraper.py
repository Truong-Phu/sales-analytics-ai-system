# -*- coding: utf-8 -*-
"""
FacebookScraper – Thu thập bài đăng và comments từ Facebook Page.

PHƯƠNG ÁN A (ưu tiên): Facebook Graph API
    - Endpoint: GET /{page-id}/posts?fields=message,created_time,
                likes.summary(true),comments{message,created_time},
                shares,attachments
    - Token: đọc từ env FACEBOOK_PAGE_TOKEN + FACEBOOK_PAGE_ID
    - Nếu token rỗng → raise EnvironmentError (KHÔNG mock)

PHƯƠNG ÁN B (fallback khi không có token):
    - Export thủ công: Facebook Page → Insights → Export Data → CSV
    - Method load_from_export(filepath) đọc file CSV export
    - Normalize về schema chuẩn

OFFLINE MODE (SCRAPER_MODE=offline):
    Đọc CSV mẫu từ notebooks/sample_data/sample_facebook_data.csv

DISCLAIMER:
    Chỉ dùng cho mục đích nghiên cứu khóa luận tốt nghiệp.
    Chỉ truy cập Page do tác giả sở hữu hoặc được cấp quyền.
"""

import csv as _csv_module
import hashlib
import json
import logging
import os
import re
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
_REPO_ROOT    = Path(__file__).resolve().parents[3]
_SAMPLE_CSV   = _REPO_ROOT / "notebooks" / "sample_data" / "sample_facebook_data.csv"
_OUTPUT_DIR   = _REPO_ROOT / "notebooks" / "sample_data"
_TZ_VN        = timezone(timedelta(hours=7))

# ── Sentiment keywords (Vietnamese + English) ────────────────────────────────
_POSITIVE_KW = [
    "tốt", "đẹp", "ngon", "chất", "ok", "good", "great", "ổn",
    "thích", "hay", "tuyệt", "xuất sắc", "ưng", "hài lòng",
    "recommend", "like", "love", "nice", "perfect", "awesome",
]
_NEGATIVE_KW = [
    "tệ", "xấu", "kém", "lỗi", "hỏng", "bad", "poor", "chán",
    "fail", "dở", "dở tệ", "không ổn", "thất vọng", "tệ hại",
    "terrible", "horrible", "worst", "awful", "broken", "defect",
]

# ── Graph API base ────────────────────────────────────────────────────────────
_GRAPH_BASE = "https://graph.facebook.com/v18.0"
_REQUEST_TIMEOUT = 15


def _analyze_sentiment(text: str) -> str:
    """
    Phân tích sentiment đơn giản dựa trên từ khóa.
    Returns: "positive" | "negative" | "neutral"
    """
    lower = text.lower()
    pos = sum(1 for kw in _POSITIVE_KW if kw in lower)
    neg = sum(1 for kw in _NEGATIVE_KW if kw in lower)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _extract_products(text: str) -> str:
    """
    Trích xuất tên sản phẩm được đề cập trong nội dung (heuristic).
    Tìm cụm danh từ sau "sản phẩm", "sp", "mặt hàng", "áo", "quần", v.v.
    Returns: chuỗi tên sản phẩm ngắn gọn, hoặc "" nếu không tìm được.
    """
    patterns = [
        r"(?:sản phẩm|sp|mặt hàng|món|item)[:\s]+([^\.\n,]{5,60})",
        r"(?:áo|quần|giày|túi|điện thoại|laptop|son|kem|sữa)[^\.\n]{0,40}",
    ]
    found = []
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            g = m.group(1).strip() if m.lastindex else m.group(0).strip()
            if g:
                found.append(g[:100])
    return "; ".join(found[:3]) if found else ""


class FacebookScraper:
    """
    Thu thập dữ liệu bài đăng Facebook Page qua Graph API hoặc CSV export.

    Ưu tiên: Graph API (Phương án A) → CSV export (Phương án B).
    """

    def __init__(self, company_id: str = ""):
        self.company_id = company_id
        self.db_url     = os.getenv("DATABASE_URL", "")
        self.mode       = os.getenv("SCRAPER_MODE", "online").lower()
        self._session   = requests.Session()
        # Một company có thể có nhiều Facebook Page
        self._integrations: list = []

        if company_id:
            self._load_integrations_from_db(company_id)
        else:
            # Fallback: đọc từ .env (dev mode)
            self.page_token = os.getenv("FACEBOOK_PAGE_TOKEN", "").strip()
            self.page_id    = os.getenv("FACEBOOK_PAGE_ID", "").strip()
            self._integrations = [{
                "id":           "",
                "company_id":   "",
                "access_token": self.page_token,
                "account_id":   self.page_id,
                "additional_config": {},
            }] if self.page_token else []

        # Sử dụng integration đầu tiên làm mặc định (tương thích ngược)
        if self._integrations:
            self.page_token = self._integrations[0]["access_token"]
            self.page_id    = self._integrations[0]["account_id"]
        else:
            self.page_token = ""
            self.page_id    = ""

        logger.info(
            "FacebookScraper khởi tạo: mode=%s, company=%s, pages=%d, token=%s",
            self.mode,
            company_id or "dev",
            len(self._integrations),
            "có" if self.page_token else "chưa cấu hình",
        )

    def _load_integrations_from_db(self, company_id: str) -> None:
        """Tải tất cả Facebook Page integrations của company từ DB."""
        try:
            from .integration_repository import IntegrationRepository
            repo = IntegrationRepository()
            self._integrations = repo.get_all_active(platform="facebook")
            # Lọc theo company_id cụ thể
            self._integrations = [
                i for i in self._integrations if i["company_id"] == company_id
            ]
        except Exception as exc:
            logger.warning(f"Không thể load integrations từ DB: {exc}")

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _content_hash(page_id: str, post_id: str) -> str:
        return hashlib.md5(f"{page_id}{post_id}".encode()).hexdigest()

    @staticmethod
    def _now_vn() -> str:
        return datetime.now(_TZ_VN).isoformat()

    def _graph_get(self, endpoint: str, params: dict) -> dict:
        """
        Gọi Facebook Graph API GET request.

        Raises:
            EnvironmentError: Khi chưa cấu hình token.
            requests.HTTPError: Khi API trả về lỗi.
        """
        if not self.page_token:
            raise EnvironmentError(
                "Cần FACEBOOK_PAGE_TOKEN trong .env — "
                "xem hướng dẫn tại https://developers.facebook.com/docs/pages/access-tokens"
            )
        params["access_token"] = self.page_token
        url = f"{_GRAPH_BASE}/{endpoint}"
        resp = self._session.get(url, params=params, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise requests.HTTPError(
                f"Graph API lỗi: {data['error'].get('message', data['error'])}"
            )
        return data

    # ── Kết nối ──────────────────────────────────────────────────────────────

    def test_connection(self) -> dict:
        """
        Kiểm tra kết nối đến Facebook Graph API.

        Returns:
            {"connected": bool, "message": str, "page_name": str|None}
        """
        if not self.page_token or not self.page_id:
            missing = []
            if not self.page_token:
                missing.append("FACEBOOK_PAGE_TOKEN")
            if not self.page_id:
                missing.append("FACEBOOK_PAGE_ID")
            return {
                "connected": False,
                "message":   f"Cần {', '.join(missing)} trong .env",
                "page_name": None,
            }
        try:
            data = self._graph_get(self.page_id, {"fields": "name,id"})
            return {
                "connected": True,
                "message":   f"Kết nối thành công — Page: {data.get('name')}",
                "page_name": data.get("name"),
            }
        except EnvironmentError as e:
            return {"connected": False, "message": str(e), "page_name": None}
        except Exception as e:
            return {"connected": False, "message": str(e), "page_name": None}

    # ── PHƯƠNG ÁN A: Graph API ────────────────────────────────────────────────

    def fetch_posts_api(self, limit: int = 50) -> list[dict]:
        """
        Lấy bài đăng qua Facebook Graph API.

        Yêu cầu: FACEBOOK_PAGE_TOKEN + FACEBOOK_PAGE_ID trong .env.
        Nếu thiếu → raise EnvironmentError (KHÔNG tạo mock).

        Args:
            limit: Số bài tối đa cần lấy (mỗi page API = 25 bài).

        Returns:
            List[dict]: Danh sách bài đăng đã normalize.
        """
        if not self.page_token:
            raise EnvironmentError(
                "Cần FACEBOOK_PAGE_TOKEN trong .env để dùng Graph API. "
                "Nếu chưa có token, dùng load_from_export() với file CSV export thủ công."
            )
        if not self.page_id:
            raise EnvironmentError("Cần FACEBOOK_PAGE_ID trong .env")

        posts    = []
        fetched  = 0
        endpoint = f"{self.page_id}/posts"
        params   = {
            "fields": (
                "id,message,created_time,"
                "likes.summary(true),"
                "comments.limit(50){message,created_time},"
                "shares"
            ),
            "limit": min(limit, 25),
        }

        while fetched < limit:
            try:
                data = self._graph_get(endpoint, params)
            except EnvironmentError:
                raise
            except requests.HTTPError as e:
                logger.error("Graph API lỗi khi fetch posts: %s", e)
                break
            except Exception as e:
                logger.error("Lỗi kết nối Graph API: %s", e)
                break

            for item in data.get("data", []):
                post = self._normalize_api_post(item)
                posts.append(post)
                fetched += 1
                if fetched >= limit:
                    break

            # Phân trang
            next_url = data.get("paging", {}).get("next")
            if not next_url or fetched >= limit:
                break

            # Delay nhỏ giữa các page
            time.sleep(1)
            # Dùng cursor thay vì full URL
            cursors = data.get("paging", {}).get("cursors", {})
            after   = cursors.get("after")
            if after:
                params["after"] = after
            else:
                break

        logger.info("Graph API: lấy được %d bài đăng", len(posts))
        return posts

    def _normalize_api_post(self, item: dict) -> dict:
        """Chuẩn hóa 1 bài đăng từ Graph API về schema thống nhất."""
        post_id      = item.get("id", "")
        post_content = item.get("message", "")

        # Comments
        comments_raw = item.get("comments", {}).get("data", [])
        comments = []
        for c in comments_raw:
            ctext     = c.get("message", "")
            sentiment = _analyze_sentiment(ctext)
            comments.append({
                "comment_text": ctext,
                "sentiment":    sentiment,
                "created_time": c.get("created_time", ""),
            })

        # Likes / shares
        likes_count  = item.get("likes", {}).get("summary", {}).get("total_count", 0)
        shares_count = item.get("shares", {}).get("count", 0) if item.get("shares") else 0

        # Thời gian
        posted_at = None
        ct = item.get("created_time")
        if ct:
            try:
                posted_at = datetime.fromisoformat(ct.replace("Z", "+00:00"))
            except ValueError:
                posted_at = None

        return {
            "page_name":        self.page_id,
            "post_id":          post_id,
            "post_content":     post_content[:2000],
            "posted_at":        posted_at,
            "likes_count":      likes_count,
            "comments_count":   len(comments),
            "shares_count":     shares_count,
            "comments":         comments,
            "product_mentioned": _extract_products(post_content),
            "content_hash":     self._content_hash(self.page_id, post_id),
        }

    # ── PHƯƠNG ÁN B: CSV Export ───────────────────────────────────────────────

    def load_from_export(self, filepath: str) -> list[dict]:
        """
        Đọc file CSV export thủ công từ Facebook Page Insights.

        Hướng dẫn export:
            Facebook Page → Insights → Export Data → chọn loại dữ liệu → tải CSV

        CSV columns chuẩn (Facebook export thường có):
            Post ID, Message, Created Time, Lifetime Post Total Impressions,
            Lifetime Post Engaged Users, Lifetime Post Total Reactions,
            Lifetime Talking About This (Shares of Post)

        Args:
            filepath: Đường dẫn file CSV export từ Facebook.

        Returns:
            List[dict]: Danh sách bài đăng đã normalize.
        """
        fp = Path(filepath)
        if not fp.exists():
            raise FileNotFoundError(f"Không tìm thấy file CSV export: {fp}")

        posts = []
        try:
            with open(fp, encoding="utf-8-sig", newline="") as f:
                reader = _csv_module.DictReader(f)
                for row in reader:
                    post = self._normalize_export_row(row)
                    if post:
                        posts.append(post)
        except Exception as e:
            logger.error("Lỗi đọc CSV export: %s", e)
            raise

        logger.info("CSV export: đọc được %d bài từ %s", len(posts), fp.name)
        return posts

    def _normalize_export_row(self, row: dict) -> Optional[dict]:
        """Chuẩn hóa 1 dòng từ Facebook CSV export về schema thống nhất."""
        # Tìm các cột theo nhiều tên có thể
        def get_col(*keys):
            for k in keys:
                for col in row:
                    if k.lower() in col.lower():
                        return row[col].strip()
            return ""

        post_id      = get_col("post id", "id")
        post_content = get_col("message", "description", "content")
        if not post_content and not post_id:
            return None

        # Ngày đăng
        posted_at = None
        dt_str = get_col("created time", "publish time", "time", "date")
        if dt_str:
            for fmt in ("%Y-%m-%dT%H:%M:%S+0000", "%Y-%m-%d %H:%M:%S",
                        "%m/%d/%Y %H:%M", "%Y-%m-%d"):
                try:
                    posted_at = datetime.strptime(dt_str[:19], fmt[:len(dt_str)])
                    break
                except ValueError:
                    continue

        def to_int(val: str) -> int:
            try:
                return int(re.sub(r"[^\d]", "", val) or "0")
            except ValueError:
                return 0

        likes_count  = to_int(get_col("reactions", "likes", "total reactions"))
        shares_count = to_int(get_col("shares", "talking about"))
        page_name    = get_col("page", "page name") or self.page_id or "unknown"

        return {
            "page_name":         page_name,
            "post_id":           post_id or hashlib.md5(post_content[:50].encode()).hexdigest()[:16],
            "post_content":      post_content[:2000],
            "posted_at":         posted_at,
            "likes_count":       likes_count,
            "comments_count":    0,
            "shares_count":      shares_count,
            "comments":          [],
            "product_mentioned": _extract_products(post_content),
            "content_hash":      self._content_hash(page_name, post_id),
        }

    # ── Offline mode ─────────────────────────────────────────────────────────

    def _load_offline_sample(self) -> list[dict]:
        """Đọc CSV mẫu khi SCRAPER_MODE=offline."""
        if not _SAMPLE_CSV.exists():
            logger.error("OFFLINE MODE: Không tìm thấy CSV mẫu: %s", _SAMPLE_CSV)
            return []
        try:
            return self.load_from_export(str(_SAMPLE_CSV))
        except Exception as e:
            logger.error("Lỗi đọc CSV mẫu offline: %s", e)
            return []

    # ── Export CSV ────────────────────────────────────────────────────────────

    def export_csv(self, records: list[dict]) -> Optional[Path]:
        """Xuất dữ liệu ra CSV: notebooks/sample_data/facebook_posts_YYYYMMDD.csv"""
        if not records:
            return None
        _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        date_str  = datetime.now(_TZ_VN).strftime("%Y%m%d")
        out_path  = _OUTPUT_DIR / f"facebook_posts_{date_str}.csv"

        rows = []
        for r in records:
            row = {k: v for k, v in r.items() if k != "comments"}
            row["comments_json"] = json.dumps(r.get("comments", []), ensure_ascii=False)
            rows.append(row)

        pd.DataFrame(rows).to_csv(out_path, index=False, encoding="utf-8-sig")
        logger.info("Đã xuất CSV: %s (%d dòng)", out_path, len(rows))
        return out_path

    # ── Database ──────────────────────────────────────────────────────────────

    def save_to_db(self, records: list[dict]) -> tuple[int, int]:
        """
        INSERT vào raw_facebook_data, bỏ qua bản ghi trùng content_hash.

        Returns:
            (inserted, skipped)
        """
        if not records:
            return 0, 0
        if not self.db_url:
            logger.error("DATABASE_URL chưa cấu hình — không thể lưu DB.")
            return 0, len(records)

        inserted = skipped = 0
        try:
            conn = psycopg2.connect(self.db_url)
            cur  = conn.cursor()

            hashes = [r.get("content_hash") for r in records if r.get("content_hash")]
            if hashes:
                cur.execute(
                    "SELECT content_hash FROM public.raw_facebook_data "
                    "WHERE content_hash = ANY(%s)",
                    (hashes,),
                )
                existing = {row[0] for row in cur.fetchall()}
            else:
                existing = set()

            for r in records:
                ch = r.get("content_hash")
                if ch and ch in existing:
                    skipped += 1
                    continue

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
                        r.get("likes_count", 0),
                        r.get("posted_at"),
                        ch,
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

    # ── Entry points ──────────────────────────────────────────────────────────

    def run(self) -> dict:
        """
        Chạy luồng đầy đủ:
        - SCRAPER_MODE=offline → đọc CSV mẫu
        - online + có token   → Graph API (Phương án A)
        - online + không token → log hướng dẫn, trả về empty (KHÔNG crash)

        Returns:
            dict: {total_scraped, inserted, skipped, csv_path}
        """
        logger.info("=== FacebookScraper bắt đầu (mode=%s) ===", self.mode)

        if self.mode == "offline":
            records = self._load_offline_sample()
        else:
            try:
                records = self.fetch_posts_api()
            except EnvironmentError:
                logger.error(
                    "Thiếu FACEBOOK_PAGE_TOKEN hoặc FACEBOOK_PAGE_ID trong .env.\n"
                    "Cách lấy Page Access Token:\n"
                    "  1. Vào https://developers.facebook.com/\n"
                    "  2. Tạo App → Add Product → Facebook Login\n"
                    "  3. Vào Graph API Explorer\n"
                    "  4. Chọn Page → Generate Access Token\n"
                    "  5. Cần quyền: pages_read_engagement, pages_show_list\n"
                    "  6. Copy token vào .env: FACEBOOK_PAGE_TOKEN=...\n"
                    "  7. Tìm Page ID: vào Page → About → Page ID\n"
                    "Phương án thủ công:\n"
                    "  1. Vào Facebook Page → Insights → Export Data\n"
                    "  2. Tải CSV → lưu vào notebooks/sample_data/\n"
                    "  3. Đặt SCRAPER_MODE=offline rồi chạy lại"
                )
                return {"total_scraped": 0, "inserted": 0, "skipped": 0, "csv_path": None}

        csv_path = self.export_csv(records)
        inserted, skipped = self.save_to_db(records)

        summary = {
            "total_scraped": len(records),
            "inserted":      inserted,
            "skipped":       skipped,
            "csv_path":      str(csv_path) if csv_path else None,
        }
        logger.info(
            "=== FacebookScraper xong: scraped=%d | inserted=%d | skipped=%d ===",
            len(records), inserted, skipped,
        )
        return summary


    def run_safe(self) -> pd.DataFrame:
        """
        Wrapper an toàn cho scheduler: không raise exception bất kỳ trường hợp nào.
        Trả về empty DataFrame nếu thiếu token hoặc gặp lỗi.
        """
        try:
            self.run()
        except Exception as e:
            logger.error("FacebookScraper run_safe lỗi không xác định: %s", e, exc_info=True)
        return pd.DataFrame()


# ── Chạy trực tiếp để test ────────────────────────────────────────────────────
if __name__ == "__main__":
    import logging as _log
    _log.basicConfig(
        level=_log.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )
    scraper = FacebookScraper()
    print("Test kết nối:", scraper.test_connection())
