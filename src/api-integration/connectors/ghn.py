# -*- coding: utf-8 -*-
"""
GHNConnector – Kết nối GHN (Giao Hàng Nhanh) API v2.

Tài liệu: https://api.ghn.vn/home/docs/detail
Auth: Token header (không cần OAuth2)
Dữ liệu: Thông tin vận chuyển đơn hàng, trạng thái giao hàng
"""
import os
import json
from datetime import datetime, timezone
from typing import Dict, List

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, AuthError

load_dotenv()

GHN_TOKEN    = os.getenv("GHN_TOKEN", "")
GHN_SHOP_ID  = os.getenv("GHN_SHOP_ID", "")
GHN_BASE_URL = "https://online-gateway.ghn.vn/shiip/public-api"


class GHNConnector(BaseConnector):
    """
    Connector cho GHN API v2.
    Auth đơn giản: Token trong request header.
    """

    def __init__(self):
        super().__init__(
            channel_name="ghn",
            rate_limit_calls=10,
            rate_limit_period=1.0,
            max_retries=3,
        )
        self.token   = GHN_TOKEN
        self.shop_id = GHN_SHOP_ID

    def authenticate(self) -> None:
        """GHN dùng Token header – không cần OAuth2 flow."""
        if not self.token:
            raise AuthError("GHN_TOKEN chưa được cấu hình")
        # Thêm token vào default headers
        self._session.headers.update({
            "Token":   self.token,
            "ShopId":  str(self.shop_id),
        })
        self.logger.info(f"GHN authenticated: shop_id={self.shop_id}")

    def refresh_token(self) -> None:
        """GHN token không hết hạn – không cần refresh."""
        pass

    def sync_orders(self, lookback_days: int = 7) -> int:
        """
        Lấy danh sách đơn vận chuyển từ GHN.
        Tracking status: ready_to_pick, picking, picked, delivering, delivered, return...
        """
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("shipping", lookback_days)

        self.logger.info(f"Sync GHN shipping: {from_dt.date()} → {to_dt.date()}")

        resp = self.post(
            f"{GHN_BASE_URL}/v2/shipping-order/get-list",
            json={
                "offset":     0,
                "limit":      100,
                "from_time":  int(from_dt.timestamp()),
                "to_time":    int(to_dt.timestamp()),
            },
        )

        if resp.get("code") != 200:
            self.logger.warning(f"GHN API: {resp.get('message')}")
            return 0

        orders = resp.get("data", {}).get("orders", [])
        self.logger.info(f"GHN: {len(orders)} đơn vận chuyển")

        # Lưu shipping data để ETL xử lý sau
        for order in orders:
            self.logger.debug(
                f"  GHN order {order.get('order_code')}: "
                f"status={order.get('status')}"
            )

        self.update_watermark("shipping", to_dt)
        return len(orders)

    def get_order_detail(self, order_code: str) -> Dict:
        """Lấy chi tiết một đơn vận chuyển theo order_code."""
        self.authenticate()
        resp = self.post(
            f"{GHN_BASE_URL}/v2/shipping-order/detail",
            json={"order_code": order_code},
        )
        if resp.get("code") != 200:
            raise Exception(f"GHN không tìm thấy đơn: {order_code}")
        return resp.get("data", {})

    def track_order(self, order_code: str) -> Dict:
        """Tracking trạng thái giao hàng real-time."""
        self.authenticate()
        resp = self.post(
            f"{GHN_BASE_URL}/v2/shipping-order/tracking",
            json={"order_code": order_code},
        )
        return resp.get("data", {})

    def calculate_fee(
        self,
        from_district_id: int,
        to_district_id: int,
        weight_gram: int,
        service_type_id: int = 2,   # 2 = Hàng nhanh
    ) -> float:
        """Tính phí vận chuyển ước tính."""
        self.authenticate()
        resp = self.post(
            f"{GHN_BASE_URL}/v2/shipping-order/fee",
            json={
                "from_district_id": from_district_id,
                "to_district_id":   to_district_id,
                "weight":           weight_gram,
                "service_type_id":  service_type_id,
                "insurance_value":  0,
            },
        )
        return float(resp.get("data", {}).get("total", 0))
