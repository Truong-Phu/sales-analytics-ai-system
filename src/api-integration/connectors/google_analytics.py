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


class GoogleAnalyticsConnector(BaseConnector):
    """
    Connector cho GA4 Data API dùng google-analytics-data SDK.
    company_id bắt buộc → property_id và service account lấy từ integrations.
    Không dùng HTTP request thủ công mà dùng official Python client.
    """

    def __init__(self, company_id: str):
        super().__init__(
            channel_name="google_analytics",
            company_id=company_id,
            rate_limit_calls=10,
            rate_limit_period=1.0,
        )
        # GA4 credentials: lấy từ DB theo company_id
        from .integration_repository import IntegrationRepository
        from .exceptions import IntegrationNotFoundError
        self._repo        = IntegrationRepository()
        self._integration = self._repo.get_integration(company_id, "google")
        if not self._integration:
            raise IntegrationNotFoundError(company_id, "google")

        cfg              = self._integration.get("additional_config") or {}
        self.property_id = cfg.get("property_id", self._integration["account_id"])
        # Service account JSON: lưu trong additional_config["service_account_json"]
        self._sa_json    = cfg.get("service_account_json") or os.getenv("GA4_SERVICE_ACCOUNT_JSON")
        self._client     = None   # BetaAnalyticsDataClient – khởi tạo lazy

    def authenticate(self) -> None:
        """
        Xác thực bằng Service Account JSON key.
        JSON key lấy từ additional_config["service_account_json"] trong DB.
        """
        if not self._sa_json:
            raise AuthError(
                f"GA4 service account JSON chưa cấu hình cho company {self.company_id}. "
                "Lưu JSON vào Settings → Kênh bán hàng → Google Analytics."
            )
        try:
            from google.analytics.data_v1beta import BetaAnalyticsDataClient
            from google.oauth2.service_account import Credentials

            if os.path.isfile(self._sa_json):
                # Đường dẫn file
                creds = Credentials.from_service_account_file(
                    self._sa_json,
                    scopes=["https://www.googleapis.com/auth/analytics.readonly"],
                )
            else:
                # JSON string
                info = json.loads(self._sa_json)
                creds = Credentials.from_service_account_info(
                    info,
                    scopes=["https://www.googleapis.com/auth/analytics.readonly"],
                )

            self._client = BetaAnalyticsDataClient(credentials=creds)
            self.logger.info(f"GA4 authenticated: property={self.property_id}, company={self.company_id}")

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
