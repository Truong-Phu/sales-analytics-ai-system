# -*- coding: utf-8 -*-
"""
Integration test cho ETL pipeline – sử dụng mock connection, không cần DB thật.
"""
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone

from etl.pipeline import run_pipeline


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _mock_conn():
    """Tạo mock psycopg2 connection."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cursor
    return conn, cursor


def _shopee_order():
    return {
        "id":         1,
        "order_sn":   "SN-TEST-001",
        "order_status": "COMPLETED",
        "total_amount": 200000.0,
        "payment_method": "cod",
        "actual_shipping_fee": 30000,
        "create_time": datetime(2024, 3, 1, tzinfo=timezone.utc),
        "update_time": None,
        "pay_time":    None,
        "recipient_address": {
            "name":   "Khách Test",
            "phone":  "0901111222",
            "state":  "Hà Nội",
            "full_address": "123 Đường Test",
        },
        "item_list": [
            {
                "item_id":   9001,
                "item_name": "Sản phẩm Test",
                "item_sku":  "TST-001",
                "model_quantity_purchased": 1,
                "model_original_price":    200000,
                "model_discounted_price":  200000,
                "model_name": "",
                "model_sku":  "TST-001",
            }
        ],
        "raw_payload": {},
    }


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestRunPipeline:

    @patch("etl.pipeline._get_db_conn")
    @patch("etl.pipeline.extract_all")
    @patch("etl.pipeline.load_dispatch")
    def test_dry_run_does_not_commit(self, mock_load, mock_extract, mock_get_conn):
        """dry_run=True → rollback được gọi, load KHÔNG được gọi."""
        conn, _ = _mock_conn()
        mock_get_conn.return_value = conn
        mock_extract.return_value = {
            "shopee": [_shopee_order()],
            "lazada": [],
        }

        report = run_pipeline(dsn="mock://", dry_run=True)

        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        mock_load.assert_not_called()
        assert report["sources"]["shopee"]["dry_run"] is True

    @patch("etl.pipeline._get_db_conn")
    @patch("etl.pipeline.extract_all")
    @patch("etl.pipeline.load_dispatch")
    def test_normal_run_commits(self, mock_load, mock_extract, mock_get_conn):
        """Chạy bình thường → commit được gọi."""
        conn, _ = _mock_conn()
        mock_get_conn.return_value = conn
        mock_extract.return_value = {
            "shopee": [_shopee_order()],
            "lazada": [],
        }
        mock_load.return_value = {
            "inserted": 1, "skipped": 0,
            "processed_ids": [1], "processed_count": 1,
        }

        report = run_pipeline(dsn="mock://")

        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()
        assert report["sources"]["shopee"]["inserted"] == 1

    @patch("etl.pipeline._get_db_conn")
    @patch("etl.pipeline.extract_all")
    def test_empty_data_skips_load(self, mock_extract, mock_get_conn):
        """Không có dữ liệu → load không chạy, pipeline thành công."""
        conn, _ = _mock_conn()
        mock_get_conn.return_value = conn
        mock_extract.return_value = {"shopee": [], "lazada": []}

        report = run_pipeline(dsn="mock://")

        conn.commit.assert_called_once()
        assert report["sources"]["shopee"]["extracted"] == 0

    @patch("etl.pipeline._get_db_conn")
    @patch("etl.pipeline.extract_all")
    def test_extract_failure_triggers_rollback(self, mock_extract, mock_get_conn):
        """Exception trong extract → rollback và re-raise."""
        conn, _ = _mock_conn()
        mock_get_conn.return_value = conn
        mock_extract.side_effect = RuntimeError("DB connection lost")

        with pytest.raises(RuntimeError, match="DB connection lost"):
            run_pipeline(dsn="mock://")

        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()

    @patch("etl.pipeline._get_db_conn")
    @patch("etl.pipeline.extract_all")
    @patch("etl.pipeline.load_dispatch")
    def test_report_contains_timing(self, mock_load, mock_extract, mock_get_conn):
        """Report phải có started_at, finished_at, duration_s."""
        conn, _ = _mock_conn()
        mock_get_conn.return_value = conn
        mock_extract.return_value = {"shopee": [], "lazada": []}

        report = run_pipeline(dsn="mock://")

        assert "started_at"  in report
        assert "finished_at" in report
        assert "duration_s"  in report
        assert isinstance(report["duration_s"], float)
