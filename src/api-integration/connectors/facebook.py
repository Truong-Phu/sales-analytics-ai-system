# -*- coding: utf-8 -*-
"""
FacebookConnector – Kết nối Facebook Graph API + Ads API.

Tài liệu: https://developers.facebook.com/docs/graph-api
Auth: OAuth2 Long-lived Page Access Token
Dữ liệu: Doanh số Facebook Shop + hiệu suất quảng cáo Facebook Ads
"""
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, APIError, AuthError

load_dotenv()

FB_ACCESS_TOKEN  = os.getenv("FACEBOOK_ACCESS_TOKEN", "")
FB_PAGE_ID       = os.getenv("FACEBOOK_PAGE_ID", "")
FB_AD_ACCOUNT_ID = os.getenv("FACEBOOK_AD_ACCOUNT_ID", "")  # VD: act_123456789
FB_API_VERSION   = os.getenv("FACEBOOK_API_VERSION", "v19.0")
FB_BASE_URL      = f"https://graph.facebook.com/{FB_API_VERSION}"


class FacebookConnector(BaseConnector):
    """
    Connector cho Facebook Graph API và Marketing (Ads) API.
    Lấy dữ liệu: đơn hàng Facebook Shop + metrics quảng cáo Ads.
    """

    def __init__(self):
        super().__init__(
            channel_name="facebook",
            rate_limit_calls=5,
            rate_limit_period=1.0,
            max_retries=3,
        )
        self.access_token  = FB_ACCESS_TOKEN
        self.page_id       = FB_PAGE_ID
        self.ad_account_id = FB_AD_ACCOUNT_ID

    def authenticate(self) -> None:
        if not self.access_token:
            raise AuthError("FACEBOOK_ACCESS_TOKEN chưa được cấu hình")
        # Verify token
        resp = self.get(
            f"{FB_BASE_URL}/me",
            params={"access_token": self.access_token, "fields": "id,name"},
        )
        self.logger.info(f"Facebook authenticated: {resp.get('name')} (id={resp.get('id')})")

    def refresh_token(self) -> None:
        """
        Facebook Long-lived token hợp lệ 60 ngày.
        Để refresh, dùng Graph API /oauth/access_token với fb_exchange_token.
        """
        app_id     = os.getenv("FACEBOOK_APP_ID", "")
        app_secret = os.getenv("FACEBOOK_APP_SECRET", "")
        resp = self.get(
            f"{FB_BASE_URL}/oauth/access_token",
            params={
                "grant_type":        "fb_exchange_token",
                "client_id":         app_id,
                "client_secret":     app_secret,
                "fb_exchange_token": self.access_token,
            },
        )
        if "access_token" not in resp:
            raise AuthError(f"Facebook token refresh thất bại: {resp}")
        self.access_token = resp["access_token"]
        self.logger.info("Facebook long-lived token đã được làm mới (60 ngày)")

    # ── Facebook Ads Performance ─────────────────────────────────────────────

    def sync_ad_performance(self, lookback_days: int = 7) -> int:
        """
        Lấy metrics quảng cáo Facebook Ads theo từng ngày.
        Lưu vào bảng public.recommendations (tạm thời) hoặc staging riêng.

        Metrics: impressions, clicks, spend, conversions, revenue (ROAS)
        """
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("ad_performance", lookback_days)

        from_str = from_dt.strftime("%Y-%m-%d")
        to_str   = (to_dt - timedelta(days=1)).strftime("%Y-%m-%d")

        self.logger.info(f"Sync Facebook Ads: {from_str} → {to_str}")

        resp = self.get(
            f"{FB_BASE_URL}/{self.ad_account_id}/insights",
            params={
                "access_token":  self.access_token,
                "level":         "account",
                "time_range":    json.dumps({"since": from_str, "until": to_str}),
                "time_increment": 1,       # Theo từng ngày
                "fields": (
                    "date_start,date_stop,impressions,clicks,spend,"
                    "actions,action_values,ctr,cpc"
                ),
            },
        )

        records = resp.get("data", [])
        self.logger.info(f"Facebook Ads: lấy được {len(records)} ngày dữ liệu")

        # Lưu vào DB (thực tế sẽ insert vào dw.fact_ad_performance sau ETL)
        # Ở đây chỉ log để demo
        for r in records:
            self.logger.debug(
                f"  {r.get('date_start')}: "
                f"impressions={r.get('impressions', 0)}, "
                f"clicks={r.get('clicks', 0)}, "
                f"spend={r.get('spend', 0)}"
            )

        self.update_watermark("ad_performance", to_dt)
        return len(records)

    def sync_orders(self, lookback_days: int = 7) -> int:
        """
        Facebook Commerce (Shop) orders – nếu page có Facebook Shop.
        Nhiều SME VN không dùng Facebook Shop chính thức, chủ yếu dùng Ads.
        """
        self.authenticate()
        self.logger.info(
            "Facebook Shop orders sync – cần kiểm tra page có Commerce enabled không"
        )
        # Facebook Shop API endpoint: /{page_id}/commerce_orders
        resp = self.get(
            f"{FB_BASE_URL}/{self.page_id}/commerce_orders",
            params={
                "access_token": self.access_token,
                "state":        "COMPLETED",
                "fields":       "id,created,last_updated,order_status,items,shipping_address",
            },
        )
        orders = resp.get("data", [])
        self.logger.info(f"Facebook Shop: {len(orders)} đơn hàng")
        return len(orders)
