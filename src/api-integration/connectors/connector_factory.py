# -*- coding: utf-8 -*-
"""
ConnectorFactory – Tạo API Connector theo platform và company_id.

Cách dùng:
    connector = ConnectorFactory.get_connector("shopee", company_id)
    connector.sync_orders(lookback_days=7)
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .exceptions import IntegrationNotFoundError, SyncError
from ..utils.logger import get_logger

if TYPE_CHECKING:
    from ..base.base_connector import BaseConnector

logger = get_logger("connector_factory")

# Mapping platform → connector class (import lazy để tránh circular)
_PLATFORM_MAP = {
    "shopee":            ("connectors.shopee",            "ShopeeConnector"),
    "lazada":            ("connectors.lazada",            "LazadaConnector"),
    "tiktok":            ("connectors.tiktok_shop",       "TikTokShopConnector"),
    "tiktok_shop":       ("connectors.tiktok_shop",       "TikTokShopConnector"),
    "facebook":          ("connectors.facebook",          "FacebookConnector"),
    "vnpay":             ("connectors.vnpay",             "VNPayConnector"),
    "ghn":               ("connectors.ghn",               "GHNConnector"),
    "facebook_scraper":  ("connectors.facebook_scraper",  "FacebookScraper"),
    "google_scraper":    ("connectors.google_scraper",    "GoogleScraper"),
}


class ConnectorFactory:
    """Factory tạo connector theo platform."""

    @staticmethod
    def get_connector(platform: str, company_id: str) -> "BaseConnector":
        """
        Tạo và trả về connector cho platform + company_id.

        Raises:
            ValueError: Nếu platform không hợp lệ.
            IntegrationNotFoundError: Nếu company chưa kết nối platform.
        """
        entry = _PLATFORM_MAP.get(platform.lower())
        if not entry:
            raise ValueError(
                f"Platform '{platform}' không hợp lệ. "
                f"Hỗ trợ: {', '.join(_PLATFORM_MAP.keys())}"
            )

        module_path, class_name = entry
        # Import lazy để tránh circular imports
        import importlib
        module = importlib.import_module(f"..{module_path}", package=__package__)
        cls    = getattr(module, class_name)

        try:
            return cls(company_id)
        except IntegrationNotFoundError:
            raise
        except Exception as exc:
            raise SyncError(platform, str(exc), company_id) from exc

    @staticmethod
    def get_supported_platforms() -> list[str]:
        """Danh sách platform được hỗ trợ."""
        return list(_PLATFORM_MAP.keys())
