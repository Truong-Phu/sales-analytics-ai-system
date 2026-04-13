# -*- coding: utf-8 -*-
"""
ShopeeConnector – Kết nối Shopee Open API v2.

Tài liệu API: https://open.shopee.com/documents
Auth: HMAC-SHA256 signature (partner_id + api_path + timestamp + access_token + shop_id)
Rate limit: 1000 requests/hour per shop

Quy trình:
  1. authenticate()   – lấy access_token qua OAuth2 Authorization Code
  2. sync_orders()    – lấy đơn hàng mới theo watermark
  3. Lưu vào staging.shopee_orders_raw
"""
import os
import time
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, APIError, AuthError

load_dotenv()

# ── Cấu hình từ .env ────────────────────────────────────────────────────────
SHOPEE_PARTNER_ID  = os.getenv("SHOPEE_PARTNER_ID", "")
SHOPEE_PARTNER_KEY = os.getenv("SHOPEE_PARTNER_KEY", "")
SHOPEE_ACCESS_TOKEN = os.getenv("SHOPEE_ACCESS_TOKEN", "")
SHOPEE_REFRESH_TOKEN_VAL = os.getenv("SHOPEE_REFRESH_TOKEN", "")
SHOPEE_SHOP_ID     = int(os.getenv("SHOPEE_SHOP_ID", "0"))
SHOPEE_BASE_URL    = "https://partner.shopeemobile.com/api/v2"
# Dùng sandbox khi dev: https://partner.test-stable.shopeemobile.com/api/v2


class ShopeeConnector(BaseConnector):
    """
    Connector cho Shopee Open API v2.
    Rate limit mặc định: 5 requests/giây (an toàn, thực tế tối đa ~16/giây).
    """

    def __init__(self):
        super().__init__(
            channel_name="shopee",
            rate_limit_calls=5,   # 5 req/s để an toàn
            rate_limit_period=1.0,
            max_retries=3,
            retry_base_delay=2.0,
        )
        self.partner_id   = int(SHOPEE_PARTNER_ID) if SHOPEE_PARTNER_ID else 0
        self.partner_key  = SHOPEE_PARTNER_KEY
        self.access_token = SHOPEE_ACCESS_TOKEN
        self.refresh_tok  = SHOPEE_REFRESH_TOKEN_VAL
        self.shop_id      = SHOPEE_SHOP_ID

    # ── Signature ────────────────────────────────────────────────────────────

    def _make_signature(self, api_path: str, timestamp: int) -> str:
        """
        Tạo HMAC-SHA256 signature theo công thức Shopee:
        base_string = partner_id + api_path + timestamp + access_token + shop_id
        """
        base = (
            f"{self.partner_id}{api_path}{timestamp}"
            f"{self.access_token}{self.shop_id}"
        )
        return self.hmac_sha256(self.partner_key, base)

    def _build_params(self, api_path: str, extra: Dict = None) -> Dict:
        """Tạo bộ params chuẩn (partner_id, timestamp, sign, shop_id, access_token)."""
        ts = int(time.time())
        params = {
            "partner_id":   self.partner_id,
            "timestamp":    ts,
            "access_token": self.access_token,
            "shop_id":      self.shop_id,
            "sign":         self._make_signature(api_path, ts),
        }
        if extra:
            params.update(extra)
        return params

    # ── Authentication ───────────────────────────────────────────────────────

    def authenticate(self) -> None:
        """
        Xác thực ban đầu. Shopee dùng OAuth2 Authorization Code Flow.
        access_token được cấp sau khi shop owner authorize trên Shopee Seller Center.
        Trong hệ thống này, access_token được đọc từ .env (đã được cấp sẵn).
        """
        if not self.access_token:
            raise AuthError(
                "SHOPEE_ACCESS_TOKEN chưa được cấu hình trong .env. "
                "Vui lòng hoàn thành OAuth2 flow và lưu token vào .env."
            )
        self.logger.info(f"Shopee authenticated: shop_id={self.shop_id}")

    def refresh_token(self) -> None:
        """
        Làm mới access_token khi hết hạn (thường sau 4 giờ).
        Gọi Shopee API /auth/access_token/get với refresh_token.
        """
        api_path = "/auth/access_token/get"
        ts       = int(time.time())
        base_str = f"{self.partner_id}{api_path}{ts}"
        sign     = self.hmac_sha256(self.partner_key, base_str)

        payload = {
            "refresh_token": self.refresh_tok,
            "shop_id":       self.shop_id,
            "partner_id":    self.partner_id,
        }
        params = {"partner_id": self.partner_id, "timestamp": ts, "sign": sign}

        resp = self.post(
            f"{SHOPEE_BASE_URL}{api_path}",
            params=params,
            json=payload,
        )
        if resp.get("error"):
            raise AuthError(f"Refresh token thất bại: {resp.get('message')}")

        self.access_token = resp["access_token"]
        self.refresh_tok  = resp["refresh_token"]
        self.logger.info("Shopee access_token đã được làm mới thành công")

    # ── Lấy danh sách đơn hàng ───────────────────────────────────────────────

    def _fetch_order_list(
        self,
        from_ts: int,
        to_ts: int,
        cursor: Optional[str] = None,
        page_size: int = 100,
    ) -> Dict:
        """
        Gọi API /order/get_order_list để lấy danh sách order_sn.
        Shopee dùng cursor-based pagination.
        """
        api_path = "/order/get_order_list"
        extra = {
            "time_range_field": "update_time",
            "time_from":  from_ts,
            "time_to":    to_ts,
            "page_size":  page_size,
            "response_optional_fields": "order_status",
        }
        if cursor:
            extra["cursor"] = cursor

        return self.get(
            f"{SHOPEE_BASE_URL}{api_path}",
            params=self._build_params(api_path, extra),
        )

    def _fetch_order_detail(self, order_sn_list: List[str]) -> List[Dict]:
        """
        Lấy chi tiết đơn hàng qua API /order/get_order_detail.
        Shopee cho phép lấy tối đa 50 đơn/lần.
        """
        api_path = "/order/get_order_detail"
        results  = []
        # Chia thành batch 50 đơn
        for i in range(0, len(order_sn_list), 50):
            batch = order_sn_list[i : i + 50]
            extra = {
                "order_sn_list": ",".join(batch),
                "response_optional_fields": (
                    "buyer_user_id,buyer_username,estimated_shipping_fee,"
                    "recipient_address,actual_shipping_fee,goods_to_declare,"
                    "note,note_update_time,pay_time,dropshipper,dropshipper_phone,"
                    "split_up,buyer_cancel_reason,cancel_by,cancel_reason,"
                    "actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,"
                    "pickup_done_time,package_list,shipping_carrier,"
                    "payment_method,total_amount,invoice_data,no_plastic_packing,"
                    "order_chargeable_weight_gram,edt"
                ),
            }
            resp = self.get(
                f"{SHOPEE_BASE_URL}{api_path}",
                params=self._build_params(api_path, extra),
            )
            order_list = resp.get("response", {}).get("order_list", [])
            results.extend(order_list)
        return results

    def sync_orders(self, lookback_days: int = 7) -> int:
        """
        Đồng bộ đơn hàng Shopee mới vào staging.shopee_orders_raw.
        Dùng incremental sync dựa trên watermark.

        Trả về số đơn hàng đã sync.
        """
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("orders", lookback_days)
        from_ts = int(from_dt.timestamp())
        to_ts   = int(to_dt.timestamp())

        self.logger.info(
            f"Bắt đầu sync Shopee orders: {from_dt.date()} → {to_dt.date()}"
        )

        total_orders = 0
        cursor       = None

        while True:
            # Lấy danh sách order_sn
            resp = self._fetch_order_list(from_ts, to_ts, cursor=cursor)
            if resp.get("error"):
                raise APIError(
                    f"Shopee API lỗi: {resp.get('message', 'Unknown error')}"
                )

            response_data = resp.get("response", {})
            order_list    = response_data.get("order_list", [])
            if not order_list:
                break

            order_sn_list = [o["order_sn"] for o in order_list]

            # Lấy chi tiết từng đơn
            order_details = self._fetch_order_detail(order_sn_list)

            # Chuyển đổi sang format staging
            records = [self._map_to_staging(o) for o in order_details]

            # Lưu vào staging
            inserted = self.save_to_staging(
                "staging.shopee_orders_raw", records
            )
            total_orders += inserted

            # Xử lý pagination
            has_next = response_data.get("more", False)
            cursor   = response_data.get("next_cursor")
            if not has_next or not cursor:
                break

        # Cập nhật watermark
        self.update_watermark("orders", to_dt)

        # Ghi ETL log
        self.log_etl_result(
            "shopee_sync",
            total_orders,
            message=f"Sync Shopee orders thành công: {total_orders} đơn hàng",
        )
        self.logger.info(f"✓ Shopee sync hoàn thành: {total_orders} đơn hàng mới")
        return total_orders

    def _map_to_staging(self, order: Dict) -> Dict:
        """
        Map dữ liệu từ Shopee API sang schema bảng staging.shopee_orders_raw.
        """
        return {
            "order_sn":          order.get("order_sn", ""),
            "shop_id":           self.shop_id,
            "order_status":      order.get("order_status", ""),
            "buyer_user_id":     order.get("buyer_user_id"),
            "buyer_username":    order.get("buyer_username", ""),
            "total_amount":      float(order.get("total_amount", 0)),
            "currency":          order.get("currency", "VND"),
            "shipping_carrier":  order.get("shipping_carrier", ""),
            "actual_shipping_fee": float(order.get("actual_shipping_fee", 0)),
            "payment_method":    order.get("payment_method", ""),
            "pay_time":          order.get("pay_time"),   # Unix timestamp
            "create_time":       order.get("create_time"),
            "update_time":       order.get("update_time"),
            "recipient_address": json.dumps(order.get("recipient_address", {})),
            "item_list":         json.dumps(order.get("item_list", [])),
            "raw_payload":       json.dumps(order),
            "is_processed":      False,
            "fetched_at":        datetime.now(timezone.utc),
        }
