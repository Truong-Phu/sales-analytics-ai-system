# -*- coding: utf-8 -*-
"""
LazadaConnector – Kết nối Lazada Open Platform API.

Tài liệu: https://open.lazada.com/apps/doc/api
Auth: HMAC-SHA256 signature (app_key + params sorted + timestamp + app_secret)
Rate limit: ~1000 calls/day (tùy endpoint)
"""
import os
import time
import json
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Dict, List
from urllib.parse import urlencode

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, APIError, AuthError

load_dotenv()

# ── Credentials dùng chung toàn hệ thống (lưu trong .env) ───────────────────
LAZADA_APP_KEY    = os.getenv("LAZADA_APP_KEY", "")
LAZADA_APP_SECRET = os.getenv("LAZADA_APP_SECRET", "")
LAZADA_BASE_URL   = "https://api.lazada.vn/rest"  # Endpoint Việt Nam


class LazadaConnector(BaseConnector):
    """
    Connector cho Lazada Open Platform.
    company_id bắt buộc → seller access_token lấy từ bảng integrations.
    Signature: HMAC-SHA256 trên sorted params.
    """

    def __init__(self, company_id: str):
        super().__init__(
            channel_name="lazada",
            company_id=company_id,
            rate_limit_calls=3,
            rate_limit_period=1.0,
            max_retries=3,
            retry_base_delay=2.0,
        )
        # App credentials: dùng chung, lấy từ .env
        self.app_key    = LAZADA_APP_KEY
        self.app_secret = LAZADA_APP_SECRET

        # Seller access_token: lấy từ DB theo company_id
        from .integration_repository import IntegrationRepository
        from .exceptions import IntegrationNotFoundError
        self._repo        = IntegrationRepository()
        self._integration = self._repo.get_integration(company_id, "lazada")
        if not self._integration:
            raise IntegrationNotFoundError(company_id, "lazada")

        self.access_token = self._integration["access_token"]
        self.seller_id    = self._integration["account_id"]

    # ── Signature Lazada ─────────────────────────────────────────────────────

    def _sign(self, api_path: str, params: Dict) -> str:
        """
        Tạo signature Lazada:
        1. Sort params theo key
        2. Nối thành chuỗi: api_path + key1value1 + key2value2...
        3. HMAC-SHA256 với app_secret
        """
        sorted_params = sorted(params.items())
        param_str     = "".join(f"{k}{v}" for k, v in sorted_params)
        base_string   = api_path + param_str
        return hmac.new(
            self.app_secret.encode("utf-8"),
            base_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest().upper()

    def _build_params(self, api_path: str, extra: Dict = None) -> Dict:
        """Tạo params chuẩn Lazada (bao gồm sign)."""
        ts = str(int(time.time() * 1000))  # Lazada dùng millisecond
        params = {
            "app_key":      self.app_key,
            "timestamp":    ts,
            "access_token": self.access_token,
            "sign_method":  "sha256",
        }
        if extra:
            params.update(extra)
        params["sign"] = self._sign(api_path, params)
        return params

    # ── Authentication ───────────────────────────────────────────────────────

    def authenticate(self) -> None:
        """Kiểm tra access_token đã được cấu hình chưa."""
        if not self.access_token:
            raise AuthError(
                "LAZADA_ACCESS_TOKEN chưa được cấu hình. "
                "Hoàn thành OAuth2 trên Lazada Open Platform."
            )
        self.logger.info("Lazada authenticated")

    def refresh_token(self) -> None:
        """Làm mới access_token Lazada."""
        refresh_tok = os.getenv("LAZADA_REFRESH_TOKEN", "")
        if not refresh_tok:
            raise AuthError("LAZADA_REFRESH_TOKEN chưa được cấu hình")

        api_path = "/auth/token/refresh"
        params   = self._build_params(api_path, {"refresh_token": refresh_tok})
        resp     = self.get(f"{LAZADA_BASE_URL}{api_path}", params=params)

        if resp.get("code") != "0":
            raise AuthError(f"Lazada refresh token thất bại: {resp.get('message')}")

        self.access_token = resp["access_token"]
        self.logger.info("Lazada access_token đã được làm mới")

    # ── Sync orders ──────────────────────────────────────────────────────────

    def sync_orders(self, lookback_days: int = 7) -> int:
        """Đồng bộ đơn hàng Lazada vào staging.lazada_orders_raw."""
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("orders", lookback_days)

        # Lazada dùng ISO 8601 format
        from_str = from_dt.strftime("%Y-%m-%dT%H:%M:%S+07:00")
        to_str   = to_dt.strftime("%Y-%m-%dT%H:%M:%S+07:00")

        self.logger.info(f"Bắt đầu sync Lazada orders: {from_dt.date()} → {to_dt.date()}")
        total = 0
        offset = 0
        page_size = 100

        while True:
            api_path = "/orders/get"
            extra = {
                "created_after":  from_str,
                "created_before": to_str,
                "offset":         offset,
                "limit":          page_size,
                "sort_by":        "updated_at",
                "sort_direction": "ASC",
            }
            resp = self.get(
                f"{LAZADA_BASE_URL}{api_path}",
                params=self._build_params(api_path, extra),
            )

            if resp.get("code") != "0":
                raise APIError(f"Lazada API lỗi: {resp.get('message')}")

            orders = resp.get("data", {}).get("orders", [])
            if not orders:
                break

            records = [self._map_to_staging(o) for o in orders]
            inserted = self.save_to_staging("staging.lazada_orders_raw", records)
            total += inserted
            offset += len(orders)

            # Lazada không có cursor, dùng offset
            if len(orders) < page_size:
                break

        self.update_watermark("orders", to_dt)
        self.log_etl_result("lazada_sync", total,
                            message=f"Sync Lazada orders: {total} đơn hàng")
        self.logger.info(f"✓ Lazada sync hoàn thành: {total} đơn hàng")
        return total

    def _map_to_staging(self, order: Dict) -> Dict:
        return {
            "order_id":         str(order.get("order_id", "")),
            "order_number":     order.get("order_number", ""),
            "order_status":     order.get("statuses", [""])[0] if order.get("statuses") else "",
            "price":            float(order.get("price", 0)),
            "gift_message":     order.get("gift_message", ""),
            "customer_last_name":  order.get("customer_last_name", ""),
            "customer_first_name": order.get("customer_first_name", ""),
            "shipping_name":    order.get("address_shipping", {}).get("last_name", ""),
            "shipping_address": json.dumps(order.get("address_shipping", {})),
            "payment_method":   order.get("payment_method", ""),
            "created_at":       order.get("created_at"),
            "updated_at":       order.get("updated_at"),
            "items":            json.dumps(order.get("items", [])),
            "raw_payload":      json.dumps(order),
            "is_processed":     False,
            "fetched_at":       datetime.now(timezone.utc),
        }

    # ── Stub & CSV Fallback ───────────────────────────────────────────────────

    def get_orders(self, **kwargs) -> List[Dict]:
        """
        Lấy đơn hàng từ Lazada Open Platform API.
        Yêu cầu LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_ACCESS_TOKEN trong .env.

        Raises:
            NotImplementedError: Khi chưa cấu hình credentials.
        """
        if not self.access_token or not self.app_key:
            raise NotImplementedError(
                "Lazada API chưa được cấu hình. Hướng dẫn:\n"
                "  1. Đăng ký Lazada Open Platform tại https://open.lazada.com\n"
                "  2. Điền LAZADA_APP_KEY, LAZADA_APP_SECRET, LAZADA_ACCESS_TOKEN vào .env\n"
                "  3. Hoặc dùng get_orders_from_csv(filepath) để import từ CSV xuất tay"
            )
        return []

    def get_orders_from_csv(self, filepath: str) -> List[Dict]:
        """
        Fallback: đọc đơn hàng từ file CSV xuất từ Lazada Seller Center.

        Args:
            filepath: Đường dẫn file CSV.

        Returns:
            list[dict]: Danh sách đơn hàng đã parse.
        """
        import csv as _csv
        path = __import__('pathlib').Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"File Lazada CSV không tồn tại: {path}")

        orders = []
        with open(path, encoding="utf-8-sig", newline="") as f:
            reader = _csv.DictReader(f)
            for row in reader:
                orders.append({k.strip(): v.strip() for k, v in row.items() if k})
        self.logger.info(
            "Đọc %d đơn hàng Lazada từ CSV: %s", len(orders), path.name
        )
        return orders


# Alias để test có thể import theo tên đầy đủ
LazadaAPIConnector = LazadaConnector
