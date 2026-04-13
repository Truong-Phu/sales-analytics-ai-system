# -*- coding: utf-8 -*-
"""
GoogleAnalyticsConnector – Kết nối Google Analytics 4 Data API.

Tài liệu: https://developers.google.com/analytics/devguides/reporting/data/v1
Auth: OAuth2 Service Account (JSON key file)
Dữ liệu: Sessions, users, revenue từ website/app

Yêu cầu: google-analytics-data library
"""
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, AuthError

load_dotenv()

GA4_PROPERTY_ID   = os.getenv("GA4_PROPERTY_ID", "")       # VD: "properties/123456789"
GA4_CREDENTIALS   = os.getenv("GA4_SERVICE_ACCOUNT_JSON")  # JSON string hoặc file path


class GoogleAnalyticsConnector(BaseConnector):
    """
    Connector cho GA4 Data API dùng google-analytics-data SDK.
    Không dùng HTTP request thủ công mà dùng official Python client.
    """

    def __init__(self):
        super().__init__(
            channel_name="google_analytics",
            rate_limit_calls=10,
            rate_limit_period=1.0,
        )
        self.property_id = GA4_PROPERTY_ID
        self._client     = None   # BetaAnalyticsDataClient – khởi tạo lazy

    def authenticate(self) -> None:
        """
        Xác thực bằng Service Account JSON key.
        Dùng google.oauth2.service_account.Credentials.
        """
        try:
            from google.analytics.data_v1beta import BetaAnalyticsDataClient
            from google.oauth2.service_account import Credentials

            if GA4_CREDENTIALS and os.path.isfile(GA4_CREDENTIALS):
                # Đọc từ file
                creds = Credentials.from_service_account_file(
                    GA4_CREDENTIALS,
                    scopes=["https://www.googleapis.com/auth/analytics.readonly"],
                )
            elif GA4_CREDENTIALS:
                # Đọc từ JSON string trong env
                info = json.loads(GA4_CREDENTIALS)
                creds = Credentials.from_service_account_info(
                    info,
                    scopes=["https://www.googleapis.com/auth/analytics.readonly"],
                )
            else:
                raise AuthError("GA4_SERVICE_ACCOUNT_JSON chưa được cấu hình")

            self._client = BetaAnalyticsDataClient(credentials=creds)
            self.logger.info(f"GA4 authenticated: property={self.property_id}")

        except ImportError:
            raise AuthError(
                "Cần cài đặt: pip install google-analytics-data google-auth"
            )

    def refresh_token(self) -> None:
        """Service Account không cần refresh token thủ công."""
        self.authenticate()

    def sync_orders(self, lookback_days: int = 7) -> int:
        """GA4 không có đơn hàng trực tiếp – không implement."""
        return 0

    def get_website_traffic(self, lookback_days: int = 7) -> List[Dict]:
        """
        Lấy metrics traffic website: sessions, users, pageviews, bounce_rate.
        """
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("traffic", lookback_days)

        from google.analytics.data_v1beta.types import (
            RunReportRequest, Dimension, Metric, DateRange
        )

        request = RunReportRequest(
            property=self.property_id,
            dimensions=[
                Dimension(name="date"),
                Dimension(name="sessionSource"),
                Dimension(name="sessionMedium"),
            ],
            metrics=[
                Metric(name="sessions"),
                Metric(name="activeUsers"),
                Metric(name="screenPageViews"),
                Metric(name="bounceRate"),
                Metric(name="averageSessionDuration"),
            ],
            date_ranges=[
                DateRange(
                    start_date=from_dt.strftime("%Y-%m-%d"),
                    end_date=(to_dt - timedelta(days=1)).strftime("%Y-%m-%d"),
                )
            ],
        )

        response = self._client.run_report(request)
        results  = []
        for row in response.rows:
            dims = [d.value for d in row.dimension_values]
            mets = [m.value for m in row.metric_values]
            results.append({
                "date":                   dims[0],
                "source":                 dims[1],
                "medium":                 dims[2],
                "sessions":               int(mets[0]),
                "active_users":           int(mets[1]),
                "page_views":             int(mets[2]),
                "bounce_rate":            float(mets[3]),
                "avg_session_duration_s": float(mets[4]),
            })

        self.logger.info(f"GA4: lấy được {len(results)} dòng traffic data")
        self.update_watermark("traffic", to_dt)
        return results

    def get_ecommerce_revenue(self, lookback_days: int = 7) -> List[Dict]:
        """
        Lấy dữ liệu doanh thu từ GA4 Enhanced E-commerce.
        Chỉ hoạt động nếu website đã implement GA4 e-commerce tracking.
        """
        self.authenticate()
        from_dt, to_dt = self.get_sync_window("ecommerce", lookback_days)

        from google.analytics.data_v1beta.types import (
            RunReportRequest, Dimension, Metric, DateRange
        )

        request = RunReportRequest(
            property=self.property_id,
            dimensions=[Dimension(name="date"), Dimension(name="itemName")],
            metrics=[
                Metric(name="ecommercePurchases"),
                Metric(name="purchaseRevenue"),
                Metric(name="itemsPurchased"),
            ],
            date_ranges=[
                DateRange(
                    start_date=from_dt.strftime("%Y-%m-%d"),
                    end_date=(to_dt - timedelta(days=1)).strftime("%Y-%m-%d"),
                )
            ],
        )

        response = self._client.run_report(request)
        results  = []
        for row in response.rows:
            dims = [d.value for d in row.dimension_values]
            mets = [m.value for m in row.metric_values]
            results.append({
                "date":          dims[0],
                "item_name":     dims[1],
                "purchases":     int(mets[0]),
                "revenue":       float(mets[1]),
                "items_sold":    int(mets[2]),
            })

        self.logger.info(f"GA4 e-commerce: {len(results)} dòng dữ liệu")
        return results
