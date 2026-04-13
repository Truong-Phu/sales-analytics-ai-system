# -*- coding: utf-8 -*-
"""
Unit tests cho ETL Transform layer: clean, normalize, calculate.
Không cần database – chạy hoàn toàn offline.
"""
import pytest
from datetime import datetime, timezone

from etl.transform.clean import clean_shopee, clean_lazada
from etl.transform.normalize import (
    normalize_phone, normalize_province, get_region,
    normalize_payment_method, normalize_status,
    normalize_shopee_row, normalize_lazada_row,
)
from etl.transform.calculate import (
    safe_div, calculate_item_metrics,
    calculate_shopee, calculate_lazada,
)


# ══════════════════════════════════════════════════════════════════════════════
# Clean – Shopee
# ══════════════════════════════════════════════════════════════════════════════

class TestCleanShopee:
    def _make_row(self, **overrides):
        base = {
            "order_sn":    "SN123",
            "total_amount": "150000",
            "order_status": "COMPLETED",
            "item_list":   [{"item_id": 1}],
            "create_time": 1700000000,
        }
        base.update(overrides)
        return base

    def test_valid_row_passes(self):
        valid, rejected = clean_shopee([self._make_row()])
        assert len(valid) == 1
        assert len(rejected) == 0

    def test_missing_order_sn_rejected(self):
        _, rejected = clean_shopee([self._make_row(order_sn="")])
        assert len(rejected) == 1
        assert any("order_sn" in r for r in rejected[0]["_reject_reasons"])

    def test_negative_total_amount_rejected(self):
        _, rejected = clean_shopee([self._make_row(total_amount="-100")])
        assert len(rejected) == 1

    def test_empty_item_list_rejected(self):
        _, rejected = clean_shopee([self._make_row(item_list=[])])
        assert len(rejected) == 1

    def test_unix_timestamp_converted_to_datetime(self):
        valid, _ = clean_shopee([self._make_row(create_time=1700000000)])
        assert isinstance(valid[0]["create_time"], datetime)
        assert valid[0]["create_time"].tzinfo == timezone.utc

    def test_total_amount_coerced_to_float(self):
        valid, _ = clean_shopee([self._make_row(total_amount="99999.5")])
        assert valid[0]["total_amount"] == 99999.5

    def test_multiple_rows_mixed(self):
        rows = [
            self._make_row(),
            self._make_row(order_sn=""),        # invalid
            self._make_row(order_sn="SN456"),   # valid
        ]
        valid, rejected = clean_shopee(rows)
        assert len(valid) == 2
        assert len(rejected) == 1


# ══════════════════════════════════════════════════════════════════════════════
# Clean – Lazada
# ══════════════════════════════════════════════════════════════════════════════

class TestCleanLazada:
    def _make_row(self, **overrides):
        base = {"order_id": "LZ001", "price": "250000"}
        base.update(overrides)
        return base

    def test_valid_row_passes(self):
        valid, rejected = clean_lazada([self._make_row()])
        assert len(valid) == 1

    def test_missing_order_id_rejected(self):
        _, rejected = clean_lazada([self._make_row(order_id="")])
        assert len(rejected) == 1

    def test_price_with_comma_coerced(self):
        valid, _ = clean_lazada([self._make_row(price="1,500,000")])
        assert valid[0]["price"] == 1500000.0


# ══════════════════════════════════════════════════════════════════════════════
# Normalize – phone
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("raw,expected", [
    ("0901234567",   "0901234567"),
    ("+84901234567", "0901234567"),
    ("84901234567",  "0901234567"),   # 11 chars with 84 prefix
    ("090-123-4567", "0901234567"),
    ("(090) 123 4567", "0901234567"),
    (None,           None),
    ("",             None),
])
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


# ══════════════════════════════════════════════════════════════════════════════
# Normalize – province & region
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("raw,expected_province,expected_region", [
    ("Hà Nội",             "Hà Nội",           "Bắc"),
    ("TP. Hồ Chí Minh",   "TP. Hồ Chí Minh",  "Nam"),
    ("Hồ Chí Minh",       "Hồ Chí Minh",       "Nam"),
    ("Đà Nẵng",           "Đà Nẵng",           "Trung"),
    ("Lâm Đồng",          "Lâm Đồng",          "Tây Nguyên"),
    ("Tỉnh Hà Nội",       "Hà Nội",            "Bắc"),   # substring match
    (None,                "Khác",              "Khác"),
])
def test_normalize_province_and_region(raw, expected_province, expected_region):
    province = normalize_province(raw)
    assert province == expected_province
    assert get_region(province) == expected_region


# ══════════════════════════════════════════════════════════════════════════════
# Normalize – payment method
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("raw,expected", [
    ("cod",           "COD"),
    ("COD",           "COD"),
    ("momo",          "EWALLET"),
    ("zalopay",       "EWALLET"),
    ("bank_transfer", "TRANSFER"),
    ("vnpay",         "TRANSFER"),
    (None,            "COD"),
    ("unknown_pay",   "UNKNOWN_PAY"),
])
def test_normalize_payment_method(raw, expected):
    assert normalize_payment_method(raw) == expected


# ══════════════════════════════════════════════════════════════════════════════
# Normalize – order status
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("raw,expected", [
    ("COMPLETED",   "DELIVERED"),
    ("CANCELLED",   "CANCELLED"),
    ("SHIPPED",     "SHIPPED"),
    ("UNPAID",      "PENDING"),
    ("delivered",   "DELIVERED"),
    ("canceled",    "CANCELLED"),
    (None,          "PENDING"),
])
def test_normalize_status(raw, expected):
    assert normalize_status(raw) == expected


# ══════════════════════════════════════════════════════════════════════════════
# Normalize – Shopee row
# ══════════════════════════════════════════════════════════════════════════════

def test_normalize_shopee_row_extracts_fields():
    row = {
        "recipient_address": {
            "name":         "Nguyễn A",
            "phone":        "0901234567",
            "state":        "Hà Nội",
            "full_address": "123 Phố X",
        },
        "item_list": [
            {
                "item_id":    1001,
                "item_name":  "Áo thun",
                "item_sku":   "AT001",
                "model_quantity_purchased": 2,
                "model_original_price":    150000,
                "model_discounted_price":  120000,
            }
        ],
        "payment_method": "cod",
        "order_status":   "COMPLETED",
    }
    result = normalize_shopee_row(row)
    assert result["customer_name"]  == "Nguyễn A"
    assert result["customer_phone"] == "0901234567"
    assert result["province"]       == "Hà Nội"
    assert result["region"]         == "Bắc"
    assert result["payment_method_normalized"] == "COD"
    assert result["status_normalized"]         == "DELIVERED"
    assert len(result["items_normalized"]) == 1
    item = result["items_normalized"][0]
    assert item["sku"]              == "AT001"
    assert item["quantity"]         == 2
    assert item["unit_price"]       == 150000.0
    assert item["discounted_price"] == 120000.0


# ══════════════════════════════════════════════════════════════════════════════
# Calculate – safe_div
# ══════════════════════════════════════════════════════════════════════════════

def test_safe_div_normal():
    assert safe_div(10.0, 4.0) == 2.5

def test_safe_div_zero_denominator():
    assert safe_div(10.0, 0.0) == 0.0

def test_safe_div_custom_default():
    assert safe_div(5.0, 0.0, default=-1.0) == -1.0


# ══════════════════════════════════════════════════════════════════════════════
# Calculate – item metrics
# ══════════════════════════════════════════════════════════════════════════════

class TestCalculateItemMetrics:
    def test_basic_no_discount(self):
        item = {"quantity": 2, "unit_price": 100000, "discounted_price": 100000}
        m = calculate_item_metrics(item, cost_price=60000, shipping_fee=0)
        assert m["gross_revenue"]   == 200000.0
        assert m["discount_amount"] == 0.0
        assert m["net_revenue"]     == 200000.0
        assert m["cost_amount"]     == 120000.0
        assert m["gross_profit"]    == 80000.0
        assert m["profit_margin"]   == pytest.approx(40.0, rel=1e-3)

    def test_with_discount(self):
        item = {"quantity": 1, "unit_price": 200000, "discounted_price": 150000}
        m = calculate_item_metrics(item)
        assert m["discount_amount"] == 50000.0
        assert m["net_revenue"]     == 150000.0

    def test_discount_not_negative(self):
        # discounted_price > unit_price (dữ liệu lỗi) → discount = 0
        item = {"quantity": 1, "unit_price": 100000, "discounted_price": 120000}
        m = calculate_item_metrics(item)
        assert m["discount_amount"] == 0.0

    def test_profit_margin_none_when_no_revenue(self):
        item = {"quantity": 1, "unit_price": 0, "discounted_price": 0}
        m = calculate_item_metrics(item)
        assert m["profit_margin"] is None

    def test_shipping_fee_allocated(self):
        item = {"quantity": 1, "unit_price": 100000, "discounted_price": 100000}
        m = calculate_item_metrics(item, shipping_fee=30000.0)
        assert m["shipping_fee"] == 30000.0

    def test_quantity_defaults_to_1(self):
        item = {"unit_price": 50000, "discounted_price": 50000}
        m = calculate_item_metrics(item)
        assert m["item_quantity"] == 1
        assert m["gross_revenue"] == 50000.0

    def test_return_fields_default_zero(self):
        item = {"quantity": 1, "unit_price": 100000, "discounted_price": 100000}
        m = calculate_item_metrics(item)
        assert m["return_count"]  == 0
        assert m["return_amount"] == 0.0
        assert m["order_count"]   == 1


# ══════════════════════════════════════════════════════════════════════════════
# Calculate – Shopee full flow
# ══════════════════════════════════════════════════════════════════════════════

def _make_shopee_order(**overrides):
    base = {
        "id":          1,
        "order_sn":    "SN001",
        "create_time": datetime(2024, 1, 15, tzinfo=timezone.utc),
        "customer_name": "Khách A",
        "customer_phone": "0901234567",
        "province": "Hà Nội", "region": "Bắc",
        "payment_method_normalized": "COD",
        "status_normalized": "DELIVERED",
        "actual_shipping_fee": 30000,
        "items_normalized": [
            {
                "item_id":        101,
                "item_name":      "Sản phẩm A",
                "sku":            "SKU-A",
                "quantity":       2,
                "unit_price":     100000,
                "discounted_price": 90000,
            }
        ],
    }
    base.update(overrides)
    return base


class TestCalculateShopee:
    def test_one_order_one_item(self):
        records = calculate_shopee([_make_shopee_order()])
        assert len(records) == 1
        r = records[0]
        assert r["_source"]   == "shopee"
        assert r["_external_order_id"] == "SHOPEE-SN001-101"
        assert r["gross_revenue"]  == 200000.0
        assert r["discount_amount"] == 20000.0
        assert r["net_revenue"]     == 180000.0
        assert r["shipping_fee"]    == 30000.0

    def test_shipping_fee_split_per_item(self):
        order = _make_shopee_order(
            actual_shipping_fee=60000,
            items_normalized=[
                {"item_id": 1, "item_name": "A", "sku": "S1",
                 "quantity": 1, "unit_price": 50000, "discounted_price": 50000},
                {"item_id": 2, "item_name": "B", "sku": "S2",
                 "quantity": 1, "unit_price": 50000, "discounted_price": 50000},
            ]
        )
        records = calculate_shopee([order])
        assert len(records) == 2
        # Phí vận chuyển phân bổ đều: 60000 / 2 = 30000
        assert all(r["shipping_fee"] == 30000.0 for r in records)

    def test_product_costs_applied(self):
        records = calculate_shopee(
            [_make_shopee_order()],
            product_costs={"SKU-A": 70000.0}
        )
        r = records[0]
        # cost_amount = 70000 × 2 = 140000
        assert r["cost_amount"]  == 140000.0
        # gross_profit = 180000 - 140000 = 40000
        assert r["gross_profit"] == 40000.0

    def test_empty_orders_returns_empty(self):
        records = calculate_shopee([])
        assert records == []

    def test_order_with_no_items(self):
        order = _make_shopee_order(items_normalized=[])
        records = calculate_shopee([order])
        assert records == []
