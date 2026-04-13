# -*- coding: utf-8 -*-
"""
Unit tests cho ExcelImporter.
Test: đọc file, validate schema, normalize phone, parse date.
Chạy: pytest src/api-integration/tests/test_excel_importer.py -v
"""
import os
import pytest
import pandas as pd
import tempfile
from ..importers.excel_importer import ExcelImporter, ValidationError


# ── Fixtures ──────────────────────────────────────────────────────────────

@pytest.fixture
def sample_csv(tmp_path):
    """Tạo file CSV mẫu hợp lệ."""
    data = {
        "order_id":      ["ORD001", "ORD002", "ORD003"],
        "customer_name": ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C"],
        "customer_phone": ["0901234567", "0912345678", "0923456789"],
        "product_name":  ["Áo thun", "Quần jean", "Giày thể thao"],
        "quantity":      ["2", "1", "3"],
        "unit_price":    ["150000", "350000", "500000"],
        "discount":      ["10000", "0", "50000"],
        "channel":       ["offline", "offline", "offline"],
        "order_date":    ["01/04/2026", "02/04/2026", "03/04/2026"],
        "status":        ["DELIVERED", "DELIVERED", "PENDING"],
    }
    df   = pd.DataFrame(data)
    path = str(tmp_path / "test_orders.csv")
    df.to_csv(path, index=False, encoding="utf-8-sig")
    return path


@pytest.fixture
def missing_columns_csv(tmp_path):
    """File CSV thiếu cột bắt buộc."""
    df   = pd.DataFrame({"order_id": ["ORD001"], "customer_name": ["Test"]})
    path = str(tmp_path / "bad.csv")
    df.to_csv(path, index=False)
    return path


@pytest.fixture
def invalid_data_csv(tmp_path):
    """File CSV có dữ liệu không hợp lệ."""
    data = {
        "order_id":      ["ORD001", "ORD002", ""],           # ORD002: qty âm, "": id trống
        "customer_name": ["A", "B", "C"],
        "customer_phone": ["0901234567", "0912345678", "0923456789"],
        "product_name":  ["P1", "P2", "P3"],
        "quantity":      ["2", "-5", "3"],                   # ORD002: qty âm → lỗi
        "unit_price":    ["100000", "abc", "200000"],         # ORD002: price không phải số
        "channel":       ["offline", "offline", "offline"],
        "order_date":    ["01/04/2026", "invalid_date", "03/04/2026"],
    }
    df   = pd.DataFrame(data)
    path = str(tmp_path / "invalid.csv")
    df.to_csv(path, index=False)
    return path


# ════════════════════════════════════════════════════════════════════════════
# Test ExcelImporter.__init__
# ════════════════════════════════════════════════════════════════════════════

class TestExcelImporterInit:

    def test_raises_if_file_not_found(self):
        """Raise FileNotFoundError nếu file không tồn tại."""
        with pytest.raises(FileNotFoundError):
            ExcelImporter("/nonexistent/path/file.csv")

    def test_detects_csv_extension(self, sample_csv):
        """Nhận diện đúng extension .csv."""
        importer = ExcelImporter(sample_csv)
        assert importer.ext == ".csv"

    def test_file_path_stored(self, sample_csv):
        """Lưu đúng file_path."""
        importer = ExcelImporter(sample_csv)
        assert importer.file_path == sample_csv


# ════════════════════════════════════════════════════════════════════════════
# Test _read_sheet
# ════════════════════════════════════════════════════════════════════════════

class TestReadSheet:

    def test_reads_csv_correctly(self, sample_csv):
        """Đọc đúng số dòng và cột từ CSV."""
        importer = ExcelImporter(sample_csv)
        df = importer._read_sheet("orders")
        assert len(df) == 3
        assert "order_id" in df.columns

    def test_normalizes_column_names(self, tmp_path):
        """Chuẩn hóa tên cột: trim, lowercase, thay space bằng _."""
        df   = pd.DataFrame({"Order ID": ["1"], "Customer Name": ["A"],
                             " Product Name ": ["B"], "Unit Price": ["100"]})
        path = str(tmp_path / "col_test.csv")
        df.to_csv(path, index=False)

        importer = ExcelImporter(path)
        result   = importer._read_sheet("orders")
        assert "order_id" in result.columns
        assert "customer_name" in result.columns
        assert "product_name" in result.columns

    def test_drops_empty_rows(self, tmp_path):
        """Xóa dòng rỗng hoàn toàn."""
        df = pd.DataFrame({
            "order_id": ["ORD001", None, "ORD002"],
            "customer_name": ["A", None, "B"],
        })
        path = str(tmp_path / "empty_rows.csv")
        df.to_csv(path, index=False)

        importer = ExcelImporter(path)
        result   = importer._read_sheet("orders")
        assert len(result) == 2   # Dòng None bị xóa


# ════════════════════════════════════════════════════════════════════════════
# Test _validate_schema
# ════════════════════════════════════════════════════════════════════════════

class TestValidateSchema:

    def test_valid_schema_passes(self, sample_csv):
        """Schema hợp lệ không raise exception."""
        importer = ExcelImporter(sample_csv)
        df       = importer._read_sheet("orders")
        importer._validate_schema(df, "orders")   # Không raise

    def test_missing_required_column_raises(self, missing_columns_csv):
        """Thiếu cột bắt buộc → raise ValidationError."""
        importer = ExcelImporter(missing_columns_csv)
        df       = importer._read_sheet("orders")
        with pytest.raises(ValidationError) as exc_info:
            importer._validate_schema(df, "orders")
        assert "thiếu" in str(exc_info.value).lower() or "missing" in str(exc_info.value).lower()


# ════════════════════════════════════════════════════════════════════════════
# Test _parse_date
# ════════════════════════════════════════════════════════════════════════════

class TestParseDate:

    @pytest.mark.parametrize("date_str,expected", [
        ("01/04/2026",            "2026-04-01"),
        ("01-04-2026",            "2026-04-01"),
        ("2026-04-01",            "2026-04-01"),
        ("01/04/2026 10:30:00",   "2026-04-01"),
        ("2026-04-01 10:30:00",   "2026-04-01"),
        ("31/12/2025",            "2025-12-31"),
    ])
    def test_valid_date_formats(self, date_str, expected):
        """Parse đúng nhiều format ngày tháng phổ biến ở Việt Nam."""
        result = ExcelImporter._parse_date(date_str)
        assert result == expected

    @pytest.mark.parametrize("bad_date", [
        "not_a_date", "32/01/2026", "", "   ", "2026-13-01",
    ])
    def test_invalid_dates_return_none(self, bad_date):
        """Ngày không hợp lệ trả về None."""
        result = ExcelImporter._parse_date(bad_date)
        assert result is None


# ════════════════════════════════════════════════════════════════════════════
# Test _normalize_phone
# ════════════════════════════════════════════════════════════════════════════

class TestNormalizePhone:

    @pytest.mark.parametrize("raw,expected", [
        ("0901 234 567",   "0901234567"),
        ("090-123-4567",   "0901234567"),
        ("+84901234567",   "0901234567"),
        ("0901.234.567",   "0901234567"),
        ("84901234567",    "84901234567"),   # Không có +84 → giữ nguyên
        ("0912345678",     "0912345678"),
    ])
    def test_phone_normalization(self, raw, expected):
        """Chuẩn hóa đúng số điện thoại VN."""
        result = ExcelImporter._normalize_phone(raw)
        assert result == expected

    def test_phone_max_length(self):
        """Cắt tối đa 15 ký tự."""
        long_phone = "0901234567890123456"
        result     = ExcelImporter._normalize_phone(long_phone)
        assert len(result) <= 15


# ════════════════════════════════════════════════════════════════════════════
# Test _validate_row_orders
# ════════════════════════════════════════════════════════════════════════════

class TestValidateRowOrders:

    def _make_valid_row(self):
        return pd.Series({
            "order_id":      "ORD001",
            "customer_name": "Nguyễn Văn A",
            "customer_phone": "0901234567",
            "product_name":  "Áo thun",
            "quantity":      "2",
            "unit_price":    "150000",
            "discount":      "10000",
            "channel":       "offline",
            "order_date":    "01/04/2026",
            "status":        "DELIVERED",
        })

    def test_valid_row_returns_dict(self, tmp_path):
        """Dòng hợp lệ trả về dict đã clean."""
        path     = str(tmp_path / "dummy.csv")
        pd.DataFrame({"a": [1]}).to_csv(path, index=False)
        importer = ExcelImporter(path)
        row      = self._make_valid_row()
        result   = importer._validate_row_orders(row, line_num=2)

        assert result is not None
        assert result["order_id"]    == "ORD001"
        assert result["quantity"]    == 2
        assert result["unit_price"]  == 150000.0
        assert result["discount"]    == 10000.0

    def test_empty_order_id_returns_none(self, tmp_path):
        """order_id trống → lỗi, trả về None."""
        path     = str(tmp_path / "dummy.csv")
        pd.DataFrame({"a": [1]}).to_csv(path, index=False)
        importer = ExcelImporter(path)
        row      = self._make_valid_row()
        row["order_id"] = ""
        result   = importer._validate_row_orders(row, line_num=2)

        assert result is None
        assert len(importer.errors) == 1

    def test_negative_quantity_returns_none(self, tmp_path):
        """Quantity âm → lỗi."""
        path     = str(tmp_path / "dummy.csv")
        pd.DataFrame({"a": [1]}).to_csv(path, index=False)
        importer = ExcelImporter(path)
        row      = self._make_valid_row()
        row["quantity"] = "-1"
        result   = importer._validate_row_orders(row, line_num=2)

        assert result is None
        assert any("quantity" in e["errors"][0] for e in importer.errors)

    def test_invalid_unit_price_returns_none(self, tmp_path):
        """unit_price không phải số → lỗi."""
        path     = str(tmp_path / "dummy.csv")
        pd.DataFrame({"a": [1]}).to_csv(path, index=False)
        importer = ExcelImporter(path)
        row      = self._make_valid_row()
        row["unit_price"] = "abc_not_a_number"
        result   = importer._validate_row_orders(row, line_num=2)

        assert result is None

    def test_get_error_report(self, tmp_path):
        """get_error_report() trả về DataFrame với thông tin lỗi."""
        path     = str(tmp_path / "dummy.csv")
        pd.DataFrame({"a": [1]}).to_csv(path, index=False)
        importer = ExcelImporter(path)
        # Tạo vài lỗi giả
        importer.errors = [
            {"line": 2, "order_id": "ORD001", "errors": ["quantity âm"]},
            {"line": 5, "order_id": "ORD004", "errors": ["order_id trống", "date sai"]},
        ]
        report = importer.get_error_report()

        assert isinstance(report, pd.DataFrame)
        assert len(report) == 2
        assert "Dòng" in report.columns
