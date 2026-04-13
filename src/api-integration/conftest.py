# -*- coding: utf-8 -*-
"""
conftest.py – Cấu hình pytest cho API Integration Layer.
Mock các external dependencies (database, HTTP) để test chạy được offline.
"""
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture(autouse=True)
def mock_db(monkeypatch):
    """
    Tự động mock database connection cho tất cả tests.
    Ngăn tests gọi vào PostgreSQL thật.
    """
    mock_conn    = MagicMock()
    mock_cursor  = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__  = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cursor
    mock_conn.__enter__ = lambda s: s
    mock_conn.__exit__  = MagicMock(return_value=False)

    monkeypatch.setattr(
        "src.api_integration.utils.db.get_conn",
        lambda: mock_conn
    )
    monkeypatch.setattr(
        "src.api_integration.utils.db.get_watermark",
        lambda job, entity: None
    )
    monkeypatch.setattr(
        "src.api_integration.utils.db.upsert_watermark",
        lambda job, entity, ts: None
    )
    return mock_conn


@pytest.fixture
def mock_env(monkeypatch):
    """Cung cấp biến môi trường giả cho tests cần credentials."""
    env_vars = {
        "SHOPEE_PARTNER_ID":   "12345",
        "SHOPEE_PARTNER_KEY":  "test_secret_key",
        "SHOPEE_ACCESS_TOKEN": "test_access_token",
        "SHOPEE_SHOP_ID":      "67890",
        "LAZADA_APP_KEY":      "lazada_key",
        "LAZADA_APP_SECRET":   "lazada_secret",
        "LAZADA_ACCESS_TOKEN": "lazada_token",
        "GHN_TOKEN":           "ghn_token",
        "GHN_SHOP_ID":         "ghn_shop",
        "VNPAY_TMN_CODE":      "vnpay_code",
        "VNPAY_SECRET_KEY":    "vnpay_secret",
        "DB_PASSWORD":         "test_pass",
    }
    for k, v in env_vars.items():
        monkeypatch.setenv(k, v)
    return env_vars
