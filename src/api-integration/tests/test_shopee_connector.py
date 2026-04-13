# -*- coding: utf-8 -*-
"""
Unit tests cho ShopeeConnector.
Test: signature, map_to_staging, sync_orders (mock API).
Chạy: pytest src/api-integration/tests/test_shopee_connector.py -v
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone


class TestShopeeSignature:
    """Test HMAC signature theo đúng công thức Shopee."""

    def test_signature_format(self):
        """Signature phải là hex string 64 ký tự."""
        from ..connectors.shopee import ShopeeConnector
        with patch.dict("os.environ", {
            "SHOPEE_PARTNER_ID":  "12345",
            "SHOPEE_PARTNER_KEY": "test_key",
            "SHOPEE_ACCESS_TOKEN": "test_token",
            "SHOPEE_SHOP_ID":     "67890",
        }):
            conn = ShopeeConnector()
            sig  = conn._make_signature("/order/get_order_list", 1712500000)
            assert len(sig) == 64
            assert all(c in "0123456789abcdef" for c in sig)

    def test_signature_changes_with_timestamp(self):
        """Timestamp khác nhau → signature khác nhau (replay attack prevention)."""
        from ..connectors.shopee import ShopeeConnector
        with patch.dict("os.environ", {
            "SHOPEE_PARTNER_ID":  "12345",
            "SHOPEE_PARTNER_KEY": "test_key",
            "SHOPEE_ACCESS_TOKEN": "token",
            "SHOPEE_SHOP_ID":     "67890",
        }):
            conn = ShopeeConnector()
            sig1 = conn._make_signature("/order/get_order_list", 1712500000)
            sig2 = conn._make_signature("/order/get_order_list", 1712500001)
            assert sig1 != sig2


class TestShopeeMapToStaging:
    """Test hàm map dữ liệu từ Shopee API sang staging schema."""

    def _get_connector(self):
        with patch.dict("os.environ", {
            "SHOPEE_PARTNER_ID":   "111",
            "SHOPEE_PARTNER_KEY":  "key",
            "SHOPEE_ACCESS_TOKEN": "tok",
            "SHOPEE_SHOP_ID":      "999",
        }):
            from ..connectors.shopee import ShopeeConnector
            return ShopeeConnector()

    def test_map_basic_order(self):
        """Map đơn hàng Shopee cơ bản sang staging."""
        conn = self._get_connector()
        raw_order = {
            "order_sn":      "SH20260407001",
            "order_status":  "COMPLETED",
            "buyer_user_id": 12345,
            "buyer_username": "nguyen_van_a",
            "total_amount":  250000,
            "currency":      "VND",
            "payment_method": "COD",
            "create_time":   1712500000,
            "update_time":   1712500100,
            "item_list":     [{"item_id": 1, "name": "Áo thun", "qty": 2}],
        }
        result = conn._map_to_staging(raw_order)

        assert result["order_sn"]      == "SH20260407001"
        assert result["order_status"]  == "COMPLETED"
        assert result["total_amount"]  == 250000.0
        assert result["is_processed"]  is False
        assert "raw_payload" in result
        assert "fetched_at" in result

    def test_map_handles_missing_fields(self):
        """Map không bị crash khi thiếu field không bắt buộc."""
        conn   = self._get_connector()
        result = conn._map_to_staging({})   # Order rỗng hoàn toàn

        assert result["order_sn"]     == ""
        assert result["total_amount"] == 0.0
        assert result["is_processed"] is False

    def test_map_total_amount_type(self):
        """total_amount luôn là float."""
        conn   = self._get_connector()
        result = conn._map_to_staging({"total_amount": "150000"})
        assert isinstance(result["total_amount"], float)


class TestShopeeSync:
    """Test luồng sync đơn hàng Shopee (mock API calls)."""

    @patch("src.api_integration.connectors.shopee.ShopeeConnector.save_to_staging")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector._fetch_order_detail")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector._fetch_order_list")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector.authenticate")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector.get_sync_window")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector.update_watermark")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector.log_etl_result")
    def test_sync_orders_success(
        self, mock_log, mock_wm, mock_window,
        mock_auth, mock_list, mock_detail, mock_save
    ):
        """sync_orders() gọi đúng API và trả về số đơn đã sync."""
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        mock_window.return_value = (now - timedelta(days=7), now)

        # Mock API trả về 3 đơn hàng, 1 trang
        mock_list.return_value = {
            "response": {
                "order_list": [
                    {"order_sn": "SH001"},
                    {"order_sn": "SH002"},
                    {"order_sn": "SH003"},
                ],
                "more": False,
            }
        }
        mock_detail.return_value = [
            {"order_sn": "SH001", "total_amount": 100000},
            {"order_sn": "SH002", "total_amount": 200000},
            {"order_sn": "SH003", "total_amount": 150000},
        ]
        mock_save.return_value = 3  # 3 bản ghi inserted

        with patch.dict("os.environ", {
            "SHOPEE_PARTNER_ID":   "111",
            "SHOPEE_PARTNER_KEY":  "key",
            "SHOPEE_ACCESS_TOKEN": "tok",
            "SHOPEE_SHOP_ID":      "999",
        }):
            from ..connectors.shopee import ShopeeConnector
            conn  = ShopeeConnector()
            count = conn.sync_orders()

        assert count == 3
        mock_save.assert_called_once()
        mock_wm.assert_called_once()

    @patch("src.api_integration.connectors.shopee.ShopeeConnector.authenticate")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector.get_sync_window")
    @patch("src.api_integration.connectors.shopee.ShopeeConnector._fetch_order_list")
    def test_sync_orders_empty_response(self, mock_list, mock_window, mock_auth):
        """sync_orders() trả về 0 khi API không có đơn hàng mới."""
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        mock_window.return_value = (now - timedelta(days=7), now)
        mock_list.return_value   = {"response": {"order_list": [], "more": False}}

        with patch.dict("os.environ", {
            "SHOPEE_PARTNER_ID":   "111",
            "SHOPEE_PARTNER_KEY":  "key",
            "SHOPEE_ACCESS_TOKEN": "tok",
            "SHOPEE_SHOP_ID":      "999",
        }):
            from ..connectors.shopee import ShopeeConnector
            with patch.object(ShopeeConnector, "update_watermark"):
                with patch.object(ShopeeConnector, "log_etl_result"):
                    conn  = ShopeeConnector()
                    count = conn.sync_orders()

        assert count == 0
