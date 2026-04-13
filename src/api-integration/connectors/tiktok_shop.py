# -*- coding: utf-8 -*-
"""
TikTokShopConnector – Kết nối TikTok Shop Partner API.

Tài liệu: https://partner.tiktokshop.com/doc
Auth: OAuth2 (access_token) + HMAC-SHA256 signature
"""
import os
import time
import json
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Dict, List, Optional
from urllib.parse import urlencode

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, APIError, AuthError

load_dotenv()

TIKTOK_APP_KEY    = os.getenv("TIKTOK_APP_KEY", "")
TIKTOK_APP_SECRET = os.getenv("TIKTOK_APP_SECRET", "")
TIKTOK_ACCESS_TOKEN = os.getenv("TIKTOK_ACCESS_TOKEN", "")
TIKTOK_SHOP_ID    = os.getenv("TIKTOK_SHOP_ID", "")
TIKTOK_BASE_URL   = "https://open-api.tiktokglobalshop.com"


class TikTokShopConnector(BaseConnector):
    """Connector cho TikTok Shop Partner API."""

    def __init__(self):
        super().__init__(
            channel_name="tiktok_shop",
            rate_limit_calls=5,
            rate_limit_period=1.0,
            max_retries=3,
            retry_base_delay=2.0,
        )
        self.app_key      = TIKTOK_APP_KEY
        self.app_secret   = TIKTOK_APP_SECRET
        self.access_token = TIKTOK_ACCESS_TOKEN
        self.shop_id      = TIKTOK_SHOP_ID

    def _sign(self, path: str, params: Dict, body: str = "") -> str:
        """
        Tạo signature TikTok Shop:
        sign = HMAC-SHA256(app_secret, app_secret + path + sorted_params + body + app_secret)
        """
        sorted_p  = "".join(f"{k}{v}" for k, v in sorted(params.items()) if k != "sign")
        base_str  = f"{self.app_secret}{path}{sorted_p}{body}{self.app_secret}"
        return hmac.new(
            self.app_secret.encode("utf-8"),
            base_str.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _build_params(self, path: str, extra: Dict = None) -> Dict:
        ts = str(int(time.time()))
        params = {
            "app_key":      self.app_key,
            "timestamp":    ts,
            "access_token": self.access_token,
            "shop_id":      self.shop_id,
        }
        if extra:
            params.update(extra)
        params["sign"] = self._sign(path, params)
        return params

    def authenticate(self) -> None:
        if not self.access_token:
            raise AuthError("TIKTOK_ACCESS_TOKEN chưa được cấu hình")
        self.logger.info(f"TikTok Shop authenticated: shop_id={self.shop_id}")

    def refresh_token(self) -> None:
        refresh_tok = os.getenv("TIKTOK_REFRESH_TOKEN", "")
        path = "/api/token/refresh"
        params = self._build_params(path, {"refresh_token": refresh_tok})
        resp = self.post(f"{TIKTOK_BASE_URL}{path}", params=params)
        if resp.get("code") != 0:
            raise AuthError(f"TikTok refresh thất bại: {resp.get('message')}")
        self.access_token = resp["data"]["access_token"]
        self.logger.info("TikTok access_token đã được làm mới")

    def sync_orders(self, lookback_days: int = 7) -> int:
        """Đồng bộ đơn hàng TikTok Shop vào staging."""
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("orders", lookback_days)

        self.logger.info(f"Bắt đầu sync TikTok Shop: {from_dt.date()} → {to_dt.date()}")
        total  = 0
        cursor = None

        while True:
            path = "/api/orders/search"
            extra = {
                "update_time_from": int(from_dt.timestamp()),
                "update_time_to":   int(to_dt.timestamp()),
                "page_size":        100,
            }
            if cursor:
                extra["cursor"] = cursor

            resp = self.post(
                f"{TIKTOK_BASE_URL}{path}",
                params=self._build_params(path, extra),
                json=extra,
            )

            if resp.get("code") != 0:
                raise APIError(f"TikTok API lỗi: {resp.get('message')}")

            data   = resp.get("data", {})
            orders = data.get("order_list", [])
            if not orders:
                break

            records = [self._map_to_staging(o) for o in orders]
            inserted = self.save_to_staging("staging.shopee_orders_raw", records)
            total += inserted

            cursor = data.get("next_cursor")
            if not data.get("more") or not cursor:
                break

        self.update_watermark("orders", to_dt)
        self.logger.info(f"✓ TikTok Shop sync hoàn thành: {total} đơn hàng")
        return total

    def _map_to_staging(self, order: Dict) -> Dict:
        """Map TikTok Shop order sang staging schema."""
        return {
            "order_sn":       order.get("order_id", ""),
            "shop_id":        int(self.shop_id) if self.shop_id else 0,
            "order_status":   order.get("order_status", ""),
            "buyer_user_id":  order.get("buyer_uid"),
            "buyer_username": order.get("buyer_username", ""),
            "total_amount":   float(order.get("payment", {}).get("total_amount", 0)),
            "currency":       "VND",
            "payment_method": order.get("payment", {}).get("payment_method", ""),
            "create_time":    order.get("create_time"),
            "update_time":    order.get("update_time"),
            "item_list":      json.dumps(order.get("line_items", [])),
            "raw_payload":    json.dumps(order),
            "is_processed":   False,
            "fetched_at":     datetime.now(timezone.utc),
        }
