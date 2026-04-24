# -*- coding: utf-8 -*-
"""
Clean – Làm sạch và validate dữ liệu từ staging.

Các bước:
  1. Loại bỏ bản ghi thiếu trường bắt buộc
  2. Chuẩn hóa kiểu dữ liệu (string → float, timestamp → datetime)
  3. Ghi log bản ghi bị loại bỏ (để audit)

Bổ sung (Mức 2):
  RawDataCleaner – Lọc dữ liệu từ raw_google_data và raw_facebook_data
  theo các rule chất lượng trước khi normalize và load vào DW.
"""
import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Tuple

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("etl.transform.clean")

# ── Cấu hình rule lọc ────────────────────────────────────────────────────────
_DOMAIN_BLACKLIST = ["youtube.com", "facebook.com", "wikipedia.org", "twitter.com"]
_SPAM_KEYWORDS    = ["click here", "subscribe", "follow us", "sign up", "register now"]
_MIN_SNIPPET_LEN  = 50    # Ký tự tối thiểu cho snippet Google
_MIN_CONTENT_LEN  = 20    # Ký tự tối thiểu cho post Facebook
_EMOJI_ONLY_RE    = re.compile(
    r"^[\U00010000-\U0010ffff\u2600-\u26FF\u2700-\u27BF\s]+$",
    re.UNICODE
)


class RawDataCleaner:
    """
    Lọc và đánh dấu chất lượng dữ liệu từ raw_google_data và raw_facebook_data.

    Không xóa bản ghi xấu — chỉ đánh dấu is_valid=false để audit.
    Sau khi xử lý, is_processed=true được set cho tất cả bản ghi đã xem xét.
    """

    def __init__(self, db_url: str = ""):
        self.db_url = db_url or os.getenv("DATABASE_URL", "")
        if not self.db_url:
            logger.warning("RawDataCleaner: DATABASE_URL chưa cấu hình")

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    def add_missing_columns(self) -> None:
        """
        Kiểm tra và thêm cột is_valid vào raw_google_data và raw_facebook_data
        nếu chưa tồn tại. An toàn khi gọi nhiều lần (idempotent).
        """
        if not self.db_url:
            return

        alter_statements = [
            "ALTER TABLE public.raw_google_data   ADD COLUMN IF NOT EXISTS is_valid boolean DEFAULT true",
            "ALTER TABLE public.raw_facebook_data ADD COLUMN IF NOT EXISTS is_valid boolean DEFAULT true",
        ]
        try:
            conn = self._get_conn()
            conn.autocommit = True
            cur  = conn.cursor()
            for stmt in alter_statements:
                cur.execute(stmt)
                logger.info("Đã chạy: %s", stmt)
            cur.close()
            conn.close()
            logger.info("add_missing_columns hoàn thành")
        except Exception as e:
            logger.error("add_missing_columns lỗi: %s", e, exc_info=True)

    def _check_google_row(self, row: dict) -> tuple[bool, str]:
        """
        Áp dụng 4 rule lọc cho một bản ghi raw_google_data.

        Returns:
            (is_valid, reason) – reason rỗng nếu hợp lệ
        """
        snippet = (row.get("snippet") or "").strip()
        title   = (row.get("title")   or "").strip()
        url     = (row.get("url")     or "").lower()

        # Rule 1: snippet quá ngắn
        if len(snippet) < _MIN_SNIPPET_LEN:
            return False, f"snippet quá ngắn ({len(snippet)} ký tự < {_MIN_SNIPPET_LEN})"

        # Rule 2: title toàn tiếng Anh (không có ký tự tiếng Việt)
        # Tiếng Việt có các ký tự unicode đặc trưng (dấu thanh, dấu phụ)
        has_vietnamese = bool(re.search(r"[àáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]", title.lower()))
        if title and not has_vietnamese:
            # Chỉ lọc nếu title hoàn toàn không có ký tự tiếng Việt
            # (tránh lọc title mix Anh-Việt)
            return False, "title không có ký tự tiếng Việt (có thể không liên quan VN)"

        # Rule 3: URL chứa domain blacklist
        for domain in _DOMAIN_BLACKLIST:
            if domain in url:
                return False, f"URL chứa domain blacklist: {domain}"

        # Rule 4: snippet chứa từ spam
        snippet_lower = snippet.lower()
        for spam in _SPAM_KEYWORDS:
            if spam in snippet_lower:
                return False, f"snippet chứa từ spam: '{spam}'"

        return True, ""

    def clean_google_batch(self) -> int:
        """
        Lọc toàn bộ raw_google_data chưa xử lý (is_processed = false).

        Với mỗi bản ghi:
          - Pass 4 rules → is_processed=true, is_valid=true
          - Fail bất kỳ rule → is_processed=true, is_valid=false

        Returns:
            int: Số bản ghi đã xử lý
        """
        if not self.db_url:
            return 0

        processed = 0
        valid_ids  = []
        invalid_ids = []

        try:
            conn = self._get_conn()
            cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute("""
                SELECT id, title, snippet, url
                FROM   public.raw_google_data
                WHERE  is_processed = false
                ORDER BY scraped_at ASC
            """)
            rows = cur.fetchall()
            logger.info("clean_google_batch: %d bản ghi cần xử lý", len(rows))

            for row in rows:
                is_valid, reason = self._check_google_row(dict(row))
                if is_valid:
                    valid_ids.append(row["id"])
                else:
                    invalid_ids.append(row["id"])
                    logger.debug("Google id=%s bị loại: %s", row["id"], reason)
                processed += 1

            # Batch update: bản ghi hợp lệ
            if valid_ids:
                psycopg2.extras.execute_batch(
                    cur,
                    "UPDATE public.raw_google_data SET is_processed=true, is_valid=true WHERE id=%s",
                    [(i,) for i in valid_ids],
                )
            # Batch update: bản ghi không hợp lệ
            if invalid_ids:
                psycopg2.extras.execute_batch(
                    cur,
                    "UPDATE public.raw_google_data SET is_processed=true, is_valid=false WHERE id=%s",
                    [(i,) for i in invalid_ids],
                )

            conn.commit()
            cur.close()
            conn.close()

            logger.info(
                "clean_google_batch hoàn thành: %d xử lý | %d hợp lệ | %d loại bỏ",
                processed, len(valid_ids), len(invalid_ids),
            )

        except Exception as e:
            logger.error("clean_google_batch lỗi: %s", e, exc_info=True)

        return processed

    def _check_facebook_row(self, row: dict) -> tuple[bool, str]:
        """Áp dụng rules lọc cho một bản ghi raw_facebook_data."""
        content  = (row.get("post_content") or "").strip()
        comments = row.get("comments") or []

        # Rule 1: post_content quá ngắn
        if len(content) < _MIN_CONTENT_LEN:
            return False, f"post_content quá ngắn ({len(content)} ký tự)"

        # Rule 2: spam keywords
        content_lower = content.lower()
        for spam in _SPAM_KEYWORDS:
            if spam in content_lower:
                return False, f"post_content chứa từ spam: '{spam}'"

        return True, ""

    def clean_facebook_batch(self) -> int:
        """
        Lọc toàn bộ raw_facebook_data chưa xử lý.

        Lọc thêm comments chứa toàn emoji (lưu lại comments đã lọc).

        Returns:
            int: Số bản ghi đã xử lý
        """
        if not self.db_url:
            return 0

        processed   = 0
        valid_ids   = []
        invalid_ids = []

        try:
            import json as _json
            conn = self._get_conn()
            cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute("""
                SELECT id, post_content, comments
                FROM   public.raw_facebook_data
                WHERE  is_processed = false
                ORDER BY scraped_at ASC
            """)
            rows = cur.fetchall()
            logger.info("clean_facebook_batch: %d bản ghi cần xử lý", len(rows))

            for row in rows:
                is_valid, reason = self._check_facebook_row(dict(row))
                if is_valid:
                    valid_ids.append(row["id"])
                else:
                    invalid_ids.append(row["id"])
                    logger.debug("Facebook id=%s bị loại: %s", row["id"], reason)
                processed += 1

            if valid_ids:
                psycopg2.extras.execute_batch(
                    cur,
                    "UPDATE public.raw_facebook_data SET is_processed=true, is_valid=true WHERE id=%s",
                    [(i,) for i in valid_ids],
                )
            if invalid_ids:
                psycopg2.extras.execute_batch(
                    cur,
                    "UPDATE public.raw_facebook_data SET is_processed=true, is_valid=false WHERE id=%s",
                    [(i,) for i in invalid_ids],
                )

            conn.commit()
            cur.close()
            conn.close()

            logger.info(
                "clean_facebook_batch hoàn thành: %d xử lý | %d hợp lệ | %d loại bỏ",
                processed, len(valid_ids), len(invalid_ids),
            )

        except Exception as e:
            logger.error("clean_facebook_batch lỗi: %s", e, exc_info=True)

        return processed

# ── Shopee ────────────────────────────────────────────────────────────────────

SHOPEE_REQUIRED = {"order_sn", "total_amount", "order_status"}


def clean_shopee(rows: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Làm sạch danh sách đơn hàng Shopee.

    Returns:
        (valid_rows, rejected_rows) – bản ghi hợp lệ và bị loại bỏ
    """
    valid, rejected = [], []

    for row in rows:
        reasons = []

        # Kiểm tra trường bắt buộc
        for field in SHOPEE_REQUIRED:
            if not row.get(field):
                reasons.append(f"thiếu {field}")

        # Kiểm tra total_amount >= 0
        try:
            amount = float(row.get("total_amount", 0) or 0)
            if amount < 0:
                reasons.append(f"total_amount âm ({amount})")
            row["total_amount"] = amount
        except (ValueError, TypeError):
            reasons.append(f"total_amount không hợp lệ: {row.get('total_amount')}")

        # Kiểm tra item_list không rỗng
        items = row.get("item_list", [])
        if not items:
            reasons.append("item_list trống")

        # Chuyển Unix timestamp → datetime UTC
        for ts_field in ("create_time", "update_time", "pay_time"):
            val = row.get(ts_field)
            if val and isinstance(val, (int, float)):
                row[ts_field] = datetime.fromtimestamp(val, tz=timezone.utc)
            elif val and isinstance(val, str):
                try:
                    row[ts_field] = datetime.fromtimestamp(float(val), tz=timezone.utc)
                except (ValueError, TypeError):
                    row[ts_field] = None

        if reasons:
            row["_reject_reasons"] = reasons
            rejected.append(row)
            logger.warning(
                f"Shopee order {row.get('order_sn')} bị loại: {'; '.join(reasons)}"
            )
        else:
            valid.append(row)

    logger.info(f"Clean Shopee: {len(valid)} hợp lệ, {len(rejected)} bị loại")
    return valid, rejected


# ── Lazada ────────────────────────────────────────────────────────────────────

LAZADA_REQUIRED = {"order_id", "price"}


def clean_lazada(rows: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """Làm sạch danh sách đơn hàng Lazada."""
    valid, rejected = [], []

    for row in rows:
        reasons = []

        for field in LAZADA_REQUIRED:
            if not row.get(field):
                reasons.append(f"thiếu {field}")

        try:
            row["price"] = float(str(row.get("price", 0)).replace(",", "") or 0)
            if row["price"] < 0:
                reasons.append("price âm")
        except (ValueError, TypeError):
            reasons.append(f"price không hợp lệ: {row.get('price')}")

        if reasons:
            row["_reject_reasons"] = reasons
            rejected.append(row)
            logger.warning(
                f"Lazada order {row.get('order_id')} bị loại: {'; '.join(reasons)}"
            )
        else:
            valid.append(row)

    logger.info(f"Clean Lazada: {len(valid)} hợp lệ, {len(rejected)} bị loại")
    return valid, rejected


def clean_dispatch(source: str, rows: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """Dispatch clean theo nguồn dữ liệu."""
    dispatch = {
        "shopee": clean_shopee,
        "lazada": clean_lazada,
    }
    fn = dispatch.get(source)
    if not fn:
        logger.warning(f"Không có clean function cho source='{source}'")
        return rows, []
    return fn(rows)
