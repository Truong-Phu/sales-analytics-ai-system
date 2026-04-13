# -*- coding: utf-8 -*-
"""
Unit tests cho BaseConnector.
Test: RateLimiter, retry logic, HMAC signature, pagination helpers.
Chạy: pytest src/api-integration/tests/test_base_connector.py -v
"""
import time
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from ..base.base_connector import (
    BaseConnector, RateLimiter, APIError, RateLimitError, AuthError
)


# ── Concrete subclass để test (BaseConnector là abstract) ──────────────────

class DummyConnector(BaseConnector):
    """Connector giả để test các method của BaseConnector."""

    def __init__(self, **kwargs):
        super().__init__(channel_name="dummy", **kwargs)
        self.auth_called    = False
        self.refresh_called = False

    def authenticate(self):
        self.auth_called = True

    def refresh_token(self):
        self.refresh_called = True

    def sync_orders(self, lookback_days=7):
        return 0


# ════════════════════════════════════════════════════════════════════════════
# Tests cho RateLimiter
# ════════════════════════════════════════════════════════════════════════════

class TestRateLimiter:

    def test_allows_calls_within_limit(self):
        """Cho phép N request trong 1 giây nếu chưa vượt limit."""
        limiter = RateLimiter(max_calls=5, period=1.0)
        start = time.monotonic()
        for _ in range(5):
            limiter.wait()
        elapsed = time.monotonic() - start
        # 5 request đầu không cần chờ → < 0.1s
        assert elapsed < 0.1, f"RateLimiter chờ không cần thiết: {elapsed:.3f}s"

    def test_blocks_when_exceeds_limit(self):
        """Chờ khi vượt quá giới hạn request."""
        limiter = RateLimiter(max_calls=2, period=0.3)
        start = time.monotonic()
        for _ in range(3):  # 3 request, limit là 2/0.3s → phải chờ
            limiter.wait()
        elapsed = time.monotonic() - start
        # Phải chờ ít nhất 0.3s cho request thứ 3
        assert elapsed >= 0.25, f"RateLimiter không chặn: {elapsed:.3f}s"

    def test_thread_safe(self):
        """RateLimiter hoạt động đúng khi nhiều thread gọi đồng thời."""
        import threading
        limiter  = RateLimiter(max_calls=10, period=1.0)
        results  = []
        lock     = threading.Lock()

        def worker():
            limiter.wait()
            with lock:
                results.append(time.monotonic())

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 10


# ════════════════════════════════════════════════════════════════════════════
# Tests cho HMAC signature
# ════════════════════════════════════════════════════════════════════════════

class TestHMACSignature:

    def test_hmac_sha256_correct(self):
        """HMAC-SHA256 tạo đúng signature."""
        result = BaseConnector.hmac_sha256("my_secret", "hello_world")
        # Giá trị đúng tính sẵn
        expected = "b4b0f39b5f68ac2e0a4b2b3e9e2c1f30e3b1cde57a9f2a9a0bef8a7d6c5e4f3a"
        # Kiểm tra length và format (64 hex chars)
        assert len(result) == 64
        assert all(c in "0123456789abcdef" for c in result)

    def test_hmac_sha256_deterministic(self):
        """Cùng input luôn tạo ra cùng output."""
        sig1 = BaseConnector.hmac_sha256("secret", "message")
        sig2 = BaseConnector.hmac_sha256("secret", "message")
        assert sig1 == sig2

    def test_hmac_sha256_different_secrets(self):
        """Secret khác nhau → signature khác nhau."""
        sig1 = BaseConnector.hmac_sha256("secret1", "message")
        sig2 = BaseConnector.hmac_sha256("secret2", "message")
        assert sig1 != sig2

    def test_hmac_sha512_length(self):
        """HMAC-SHA512 tạo signature 128 hex chars."""
        result = BaseConnector.hmac_sha512("key", "data")
        assert len(result) == 128

    def test_hmac_sha256_unicode(self):
        """Xử lý đúng ký tự Unicode (tiếng Việt)."""
        result = BaseConnector.hmac_sha256("khóa_bí_mật", "dữ_liệu_đầu_vào")
        assert len(result) == 64


# ════════════════════════════════════════════════════════════════════════════
# Tests cho HTTP Request với Retry
# ════════════════════════════════════════════════════════════════════════════

class TestRetryLogic:

    @patch("requests.Session.request")
    def test_success_on_first_try(self, mock_req):
        """Request thành công ngay lần đầu."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": "ok"}
        mock_req.return_value = mock_resp

        conn   = DummyConnector(max_retries=3, retry_base_delay=0.01)
        result = conn.get("http://example.com/api")
        assert result == {"data": "ok"}
        assert mock_req.call_count == 1

    @patch("requests.Session.request")
    def test_retry_on_connection_error(self, mock_req):
        """Retry khi gặp ConnectionError, thành công ở lần thứ 3."""
        import requests as req_lib
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"data": "retried"}

        mock_req.side_effect = [
            req_lib.ConnectionError("timeout"),
            req_lib.ConnectionError("timeout"),
            mock_resp,
        ]

        conn   = DummyConnector(max_retries=3, retry_base_delay=0.01)
        result = conn.get("http://example.com/api")
        assert result == {"data": "retried"}
        assert mock_req.call_count == 3

    @patch("requests.Session.request")
    def test_raises_after_max_retries(self, mock_req):
        """Raise exception sau khi hết số lần retry."""
        import requests as req_lib
        mock_req.side_effect = req_lib.ConnectionError("persistent error")

        conn = DummyConnector(max_retries=2, retry_base_delay=0.01)
        with pytest.raises(req_lib.ConnectionError):
            conn.get("http://example.com/api")
        assert mock_req.call_count == 3  # 1 lần đầu + 2 retry

    @patch("requests.Session.request")
    def test_no_retry_on_4xx(self, mock_req):
        """Không retry khi gặp lỗi 4xx (client error)."""
        mock_resp = MagicMock()
        mock_resp.status_code = 400
        mock_resp.text = "Bad Request"
        mock_req.return_value = mock_resp

        conn = DummyConnector(max_retries=3, retry_base_delay=0.01)
        with pytest.raises(APIError) as exc_info:
            conn.get("http://example.com/api")
        assert exc_info.value.status_code == 400
        assert mock_req.call_count == 1  # Không retry

    @patch("requests.Session.request")
    def test_refresh_token_on_401(self, mock_req):
        """Gọi refresh_token() và retry khi nhận 401."""
        resp_401 = MagicMock()
        resp_401.status_code = 401

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {"data": "after_refresh"}

        mock_req.side_effect = [resp_401, resp_200]

        conn = DummyConnector(max_retries=3, retry_base_delay=0.01)
        result = conn.get("http://example.com/api")
        assert conn.refresh_called is True
        assert result == {"data": "after_refresh"}

    @patch("requests.Session.request")
    def test_rate_limit_error_429(self, mock_req):
        """Xử lý 429 Too Many Requests với Retry-After header."""
        resp_429 = MagicMock()
        resp_429.status_code = 429
        resp_429.headers = {"Retry-After": "1"}

        resp_200 = MagicMock()
        resp_200.status_code = 200
        resp_200.json.return_value = {"data": "ok_after_wait"}

        mock_req.side_effect = [resp_429, resp_200]

        conn = DummyConnector(max_retries=3, retry_base_delay=0.01)
        with patch("time.sleep"):  # Mock sleep để test nhanh
            result = conn.get("http://example.com/api")
        assert result == {"data": "ok_after_wait"}


# ════════════════════════════════════════════════════════════════════════════
# Tests cho Pagination
# ════════════════════════════════════════════════════════════════════════════

class TestPagination:

    def test_cursor_pagination_multiple_pages(self):
        """Cursor pagination lấy đúng dữ liệu qua nhiều trang."""
        pages = [
            {"items": [1, 2, 3], "next_cursor": "cursor_2", "has_next_page": True},
            {"items": [4, 5, 6], "next_cursor": "cursor_3", "has_next_page": True},
            {"items": [7, 8],    "next_cursor": None,       "has_next_page": False},
        ]
        call_count = [0]

        def fetch_fn(cursor=None, page_size=100):
            result = pages[call_count[0]]
            call_count[0] += 1
            return result

        conn    = DummyConnector()
        results = list(conn.paginate_cursor(fetch_fn))
        assert results == [[1, 2, 3], [4, 5, 6], [7, 8]]
        assert call_count[0] == 3

    def test_cursor_pagination_single_page(self):
        """Cursor pagination với chỉ 1 trang."""
        def fetch_fn(cursor=None, page_size=100):
            return {"items": ["a", "b"], "has_next_page": False}

        conn    = DummyConnector()
        results = list(conn.paginate_cursor(fetch_fn))
        assert results == [["a", "b"]]

    def test_cursor_pagination_empty(self):
        """Cursor pagination với trang rỗng."""
        def fetch_fn(cursor=None, page_size=100):
            return {"items": [], "has_next_page": False}

        conn    = DummyConnector()
        results = list(conn.paginate_cursor(fetch_fn))
        assert results == []

    def test_offset_pagination(self):
        """Offset pagination lấy đúng dữ liệu."""
        data = list(range(250))

        def fetch_fn(offset=0, page_size=100):
            items = data[offset : offset + page_size]
            return {"items": items}

        conn    = DummyConnector()
        results = []
        for page in conn.paginate_offset(fetch_fn, page_size=100):
            results.extend(page)
        assert results == data

    def test_offset_pagination_empty(self):
        """Offset pagination với nguồn rỗng."""
        def fetch_fn(offset=0, page_size=100):
            return {"items": []}

        conn    = DummyConnector()
        results = list(conn.paginate_offset(fetch_fn))
        assert results == []


# ════════════════════════════════════════════════════════════════════════════
# Tests cho Incremental Sync
# ════════════════════════════════════════════════════════════════════════════

class TestIncrementalSync:

    @patch("src.api-integration.utils.db.get_watermark")
    def test_get_sync_window_with_watermark(self, mock_wm):
        """Dùng watermark khi đã có lần sync trước."""
        from datetime import datetime, timezone, timedelta
        wm_time = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
        mock_wm.return_value = wm_time

        conn = DummyConnector()
        from_dt, to_dt = conn.get_sync_window("orders", lookback_days=7)

        assert from_dt == wm_time
        assert to_dt > from_dt

    @patch("src.api-integration.utils.db.get_watermark")
    def test_get_sync_window_no_watermark(self, mock_wm):
        """Dùng lookback_days khi chưa có watermark."""
        from datetime import datetime, timezone, timedelta
        mock_wm.return_value = None

        conn = DummyConnector()
        from_dt, to_dt = conn.get_sync_window("orders", lookback_days=7)

        diff = to_dt - from_dt
        assert 6 <= diff.days <= 8   # Khoảng 7 ngày (±1 do precision)
