# -*- coding: utf-8 -*-
"""
BaseConnector – Lớp cơ sở trừu tượng cho tất cả API Connectors.

Cung cấp sẵn:
  - Authentication: OAuth2 Authorization Code, Client Credentials, API Key, HMAC
  - Rate Limiting: Token Bucket (tránh vượt giới hạn request/giây của API)
  - Retry Logic: Exponential Backoff với jitter
  - Pagination: Cursor-based và Page-based
  - Incremental Sync: Watermark-based (chỉ lấy dữ liệu mới)
  - Logging: Structured logging ra console + file
  - Error Handling: Phân loại lỗi và xử lý phù hợp

Mỗi connector cụ thể (Shopee, Lazada...) kế thừa class này
và chỉ cần implement các method abstract.
"""
import time
import hmac
import hashlib
import threading
import requests
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, Generator, List, Optional

from ..utils.logger import get_logger
from ..utils.db import get_conn, get_watermark, upsert_watermark


class RateLimiter:
    """
    Token Bucket Rate Limiter – đảm bảo không vượt quá
    `max_calls` request trong mỗi khoảng `period` giây.
    Thread-safe.
    """

    def __init__(self, max_calls: int = 10, period: float = 1.0):
        self.max_calls = max_calls    # Số request tối đa mỗi `period` giây
        self.period    = period       # Khoảng thời gian (giây)
        self._lock     = threading.Lock()
        self._calls: List[float] = [] # Timestamp các request gần đây

    def wait(self) -> None:
        """Chờ nếu đã đạt giới hạn rate limit."""
        with self._lock:
            now = time.monotonic()
            # Xóa các timestamp cũ hơn 1 period
            self._calls = [t for t in self._calls if now - t < self.period]
            if len(self._calls) >= self.max_calls:
                # Chờ đến khi token cũ nhất hết hạn
                sleep_time = self.period - (now - self._calls[0])
                if sleep_time > 0:
                    time.sleep(sleep_time)
            self._calls.append(time.monotonic())


class APIError(Exception):
    """Lỗi từ API bên ngoài (4xx, 5xx)."""
    def __init__(self, message: str, status_code: int = 0, response: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.response    = response


class RateLimitError(APIError):
    """API trả về lỗi 429 Too Many Requests."""
    pass


class AuthError(APIError):
    """Lỗi xác thực (401 Unauthorized, 403 Forbidden)."""
    pass


class BaseConnector(ABC):
    """
    Lớp cơ sở trừu tượng cho tất cả API Connectors.

    Tham số khởi tạo:
        channel_name (str): Tên kênh bán hàng (VD: 'shopee', 'lazada')
        rate_limit_calls (int): Số request tối đa mỗi giây (mặc định 10)
        max_retries (int): Số lần retry tối đa khi gặp lỗi (mặc định 3)
        retry_base_delay (float): Thời gian chờ cơ bản khi retry (giây, mặc định 1.0)
        timeout (int): Timeout cho mỗi HTTP request (giây, mặc định 30)
    """

    def __init__(
        self,
        channel_name: str,
        rate_limit_calls: int = 10,
        rate_limit_period: float = 1.0,
        max_retries: int = 3,
        retry_base_delay: float = 1.0,
        timeout: int = 30,
    ):
        self.channel_name    = channel_name
        self.max_retries     = max_retries
        self.retry_base_delay = retry_base_delay
        self.timeout         = timeout
        self.logger          = get_logger(f"connector.{channel_name}")
        self._rate_limiter   = RateLimiter(rate_limit_calls, rate_limit_period)
        self._session        = requests.Session()
        self._session.headers.update({"Accept": "application/json"})

    # ── Authentication (abstract – mỗi connector tự implement) ───────────────

    @abstractmethod
    def authenticate(self) -> None:
        """
        Xác thực với API và lưu token/credentials vào instance.
        Được gọi tự động trước lần request đầu tiên.
        """

    @abstractmethod
    def refresh_token(self) -> None:
        """
        Làm mới access token khi hết hạn.
        Gọi khi nhận được lỗi 401 Unauthorized.
        """

    # ── HTTP Request với Retry + Rate Limit ──────────────────────────────────

    def _request(
        self,
        method: str,
        url: str,
        **kwargs,
    ) -> Dict:
        """
        Gửi HTTP request với rate limiting, retry và error handling.

        Tự động:
          - Áp dụng rate limiting trước mỗi request
          - Retry với exponential backoff khi gặp lỗi tạm thời (5xx, timeout)
          - Refresh token khi nhận 401
          - Raise exception rõ ràng cho lỗi 4xx
        """
        kwargs.setdefault("timeout", self.timeout)
        last_exc = None

        for attempt in range(self.max_retries + 1):
            try:
                self._rate_limiter.wait()  # Tuân thủ rate limit
                resp = self._session.request(method, url, **kwargs)

                # ── Xử lý theo HTTP status code ──────────────────────────
                if resp.status_code == 200:
                    return resp.json()

                if resp.status_code == 401:
                    self.logger.warning("Token hết hạn, đang refresh...")
                    self.refresh_token()
                    continue  # Retry sau khi refresh token

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 60))
                    self.logger.warning(
                        f"Rate limit! Chờ {retry_after}s (attempt {attempt+1}/{self.max_retries})"
                    )
                    time.sleep(retry_after)
                    raise RateLimitError(
                        f"Rate limit từ {self.channel_name}",
                        status_code=429,
                        response=resp,
                    )

                if 400 <= resp.status_code < 500:
                    # Lỗi client (4xx) – không retry
                    raise APIError(
                        f"Client error {resp.status_code}: {resp.text[:200]}",
                        status_code=resp.status_code,
                        response=resp,
                    )

                # Lỗi server (5xx) – retry
                resp.raise_for_status()

            except (requests.Timeout, requests.ConnectionError, RateLimitError) as exc:
                last_exc = exc
                if attempt >= self.max_retries:
                    break
                # Exponential backoff với jitter: delay = base * 2^attempt + random
                delay = self.retry_base_delay * (2 ** attempt)
                self.logger.warning(
                    f"Request thất bại ({exc.__class__.__name__}). "
                    f"Retry sau {delay:.1f}s (attempt {attempt+1}/{self.max_retries})..."
                )
                time.sleep(delay)

            except APIError:
                raise  # Lỗi 4xx không retry

        self.logger.error(
            f"Tất cả {self.max_retries} lần retry thất bại cho {url}"
        )
        raise last_exc or APIError(f"Request thất bại sau {self.max_retries} lần retry")

    def get(self, url: str, **kwargs) -> Dict:
        return self._request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> Dict:
        return self._request("POST", url, **kwargs)

    # ── HMAC Signature (dùng cho Shopee, Lazada, VNPay) ─────────────────────

    @staticmethod
    def hmac_sha256(secret: str, message: str) -> str:
        """Tạo HMAC-SHA256 signature (dùng cho Shopee, Lazada)."""
        return hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def hmac_sha512(secret: str, message: str) -> str:
        """Tạo HMAC-SHA512 signature (dùng cho VNPay)."""
        return hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha512,
        ).hexdigest()

    # ── Pagination Helpers ───────────────────────────────────────────────────

    def paginate_cursor(
        self,
        fetch_fn,
        cursor_field: str = "next_cursor",
        items_field: str = "items",
        page_size: int = 100,
    ) -> Generator[List, None, None]:
        """
        Cursor-based pagination (Shopee, TikTok Shop).
        Gọi fetch_fn(cursor, page_size) cho đến khi hết dữ liệu.

        Yield từng page (list items).
        """
        cursor = None
        page   = 0
        while True:
            page += 1
            self.logger.debug(f"Fetching page {page} (cursor={cursor})")
            result = fetch_fn(cursor=cursor, page_size=page_size)

            items = result.get(items_field, [])
            if items:
                yield items

            next_cursor = result.get(cursor_field)
            has_next    = result.get("has_next_page", bool(next_cursor))
            if not has_next or not next_cursor:
                self.logger.debug(f"Pagination kết thúc sau {page} trang")
                break
            cursor = next_cursor

    def paginate_offset(
        self,
        fetch_fn,
        items_field: str = "items",
        page_size: int = 100,
    ) -> Generator[List, None, None]:
        """
        Offset-based pagination (Lazada, Facebook).
        Gọi fetch_fn(offset, page_size) cho đến khi items trả về rỗng.

        Yield từng page (list items).
        """
        offset = 0
        page   = 0
        while True:
            page += 1
            self.logger.debug(f"Fetching page {page} (offset={offset})")
            result = fetch_fn(offset=offset, page_size=page_size)

            items = result.get(items_field, [])
            if not items:
                self.logger.debug(f"Pagination kết thúc sau {page} trang")
                break
            yield items
            offset += len(items)

    # ── Incremental Sync ─────────────────────────────────────────────────────

    def get_sync_window(
        self,
        entity_type: str,
        default_lookback_days: int = 7,
    ):
        """
        Lấy khoảng thời gian sync (from_time, to_time).
        from_time = watermark lần sync trước (hoặc lookback_days nếu chưa có).
        to_time   = thời điểm hiện tại.

        Trả về tuple (from_time: datetime, to_time: datetime) UTC.
        """
        from datetime import timedelta
        to_time   = datetime.now(timezone.utc)
        watermark = get_watermark(self.channel_name, entity_type)
        if watermark:
            from_time = watermark
        else:
            from_time = to_time - timedelta(days=default_lookback_days)
            self.logger.info(
                f"Chưa có watermark cho {entity_type}, "
                f"lấy {default_lookback_days} ngày gần nhất"
            )
        self.logger.info(
            f"Sync window: {from_time.isoformat()} → {to_time.isoformat()}"
        )
        return from_time, to_time

    def update_watermark(self, entity_type: str, sync_time=None) -> None:
        """Cập nhật watermark sau khi sync thành công."""
        ts = sync_time or datetime.now(timezone.utc)
        upsert_watermark(self.channel_name, entity_type, ts)
        self.logger.info(f"Watermark cập nhật: {entity_type} → {ts.isoformat()}")

    # ── Save to Staging ──────────────────────────────────────────────────────

    def save_to_staging(self, table: str, records: List[Dict]) -> int:
        """
        Lưu danh sách records vào bảng staging.
        Tự động bỏ qua bản ghi đã tồn tại (ON CONFLICT DO NOTHING).

        Trả về số bản ghi đã insert thành công.
        """
        if not records:
            return 0
        inserted = 0
        with get_conn() as conn:
            with conn.cursor() as cur:
                for rec in records:
                    cols   = list(rec.keys())
                    vals   = list(rec.values())
                    ph     = ", ".join(["%s"] * len(cols))
                    col_str = ", ".join(cols)
                    sql = (
                        f"INSERT INTO {table} ({col_str}) VALUES ({ph}) "
                        f"ON CONFLICT DO NOTHING"
                    )
                    cur.execute(sql, vals)
                    inserted += cur.rowcount
        self.logger.info(
            f"Đã lưu {inserted}/{len(records)} bản ghi vào {table}"
        )
        return inserted

    # ── Abstract methods – connector cụ thể phải implement ──────────────────

    @abstractmethod
    def sync_orders(self, lookback_days: int = 7) -> int:
        """
        Đồng bộ đơn hàng từ API vào staging.
        Trả về số đơn hàng đã sync.
        """

    def sync_products(self) -> int:
        """
        Đồng bộ danh sách sản phẩm (optional, không phải connector nào cũng có).
        Trả về số sản phẩm đã sync.
        """
        self.logger.debug(f"{self.channel_name} không hỗ trợ sync products")
        return 0

    # ── Logging helpers ──────────────────────────────────────────────────────

    def log_etl_result(
        self,
        job_name: str,
        records_count: int,
        status: str = "SUCCESS",
        message: str = "",
    ) -> None:
        """Ghi kết quả ETL vào bảng etl_logs."""
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.etl_logs (job_id, level, message, records_count, created_at)
                    SELECT ej.job_id, %(lvl)s, %(msg)s, %(cnt)s, NOW()
                    FROM   public.etl_jobs ej
                    WHERE  ej.job_name = %(job)s
                    """,
                    {
                        "job": job_name,
                        "lvl": "INFO" if status == "SUCCESS" else "ERROR",
                        "msg": message or f"{status}: {records_count} records",
                        "cnt": records_count,
                    },
                )
        self.logger.info(
            f"ETL log: job={job_name}, status={status}, records={records_count}"
        )

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} channel='{self.channel_name}'>"
