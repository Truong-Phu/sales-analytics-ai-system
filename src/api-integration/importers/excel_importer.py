# -*- coding: utf-8 -*-
"""
ExcelImporter – Fallback import dữ liệu từ file Excel/CSV.

Dùng khi API không khả dụng (test, demo, hoặc kênh chưa có API).
Hỗ trợ:
  - Import đơn hàng (orders) từ template Excel chuẩn
  - Import sản phẩm (products)
  - Import khách hàng (customers)
  - Validate schema trước khi import
  - Báo cáo lỗi chi tiết theo dòng

Schema file Excel:
  Sheet "orders": order_id, customer_name, customer_phone, product_name,
                  quantity, unit_price, discount, channel, order_date, status
  Sheet "products": sku, product_name, category, base_price, cost_price
  Sheet "customers": customer_code, full_name, phone, email, province
"""
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import pandas as pd
from ..utils.logger import get_logger
from ..utils.db import get_conn

logger = get_logger("importer.excel")


class ValidationError(Exception):
    """Lỗi validate dữ liệu Excel."""
    pass


class ExcelImporter:
    """
    Import dữ liệu từ file Excel/CSV vào database.

    Quy trình:
      1. Đọc file (hỗ trợ .xlsx, .xls, .csv)
      2. Validate schema (cột bắt buộc)
      3. Validate từng dòng dữ liệu
      4. Normalize (chuẩn hóa format ngày tháng, số, chuỗi)
      5. Insert vào staging/OLTP với báo cáo lỗi chi tiết
    """

    # Schema yêu cầu cho từng loại import
    REQUIRED_COLUMNS = {
        "orders": [
            "order_id", "customer_name", "customer_phone",
            "product_name", "quantity", "unit_price", "channel", "order_date",
        ],
        "products": ["sku", "product_name", "base_price"],
        "customers": ["full_name", "phone"],
    }

    OPTIONAL_COLUMNS = {
        "orders":    ["discount", "status", "notes", "province"],
        "products":  ["category", "cost_price", "description", "is_active"],
        "customers": ["customer_code", "email", "province", "segment_label"],
    }

    def __init__(self, file_path: str):
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file: {file_path}")
        self.file_path  = file_path
        self.ext        = os.path.splitext(file_path)[1].lower()
        self.errors:    List[Dict] = []   # Danh sách lỗi theo dòng
        self.warnings:  List[Dict] = []
        self._imported  = datetime.now(timezone.utc)

    # ── Đọc file ─────────────────────────────────────────────────────────────

    def _read_sheet(self, sheet_name: str) -> pd.DataFrame:
        """Đọc một sheet từ Excel hoặc toàn bộ CSV."""
        try:
            if self.ext == ".csv":
                df = pd.read_csv(self.file_path, dtype=str, encoding="utf-8-sig")
            else:
                df = pd.read_excel(self.file_path, sheet_name=sheet_name, dtype=str)
            # Xóa dòng rỗng hoàn toàn
            df = df.dropna(how="all").reset_index(drop=True)
            # Chuẩn hóa tên cột (trim whitespace, lowercase)
            df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
            logger.info(f"Đọc sheet '{sheet_name}': {len(df)} dòng, {len(df.columns)} cột")
            return df
        except Exception as e:
            raise ValidationError(f"Không thể đọc sheet '{sheet_name}': {e}")

    # ── Validate ──────────────────────────────────────────────────────────────

    def _validate_schema(self, df: pd.DataFrame, import_type: str) -> None:
        """Kiểm tra các cột bắt buộc có tồn tại không."""
        required = self.REQUIRED_COLUMNS.get(import_type, [])
        missing  = [c for c in required if c not in df.columns]
        if missing:
            raise ValidationError(
                f"File thiếu các cột bắt buộc: {missing}\n"
                f"Các cột hiện có: {list(df.columns)}"
            )

    def _validate_row_orders(self, row: pd.Series, line_num: int) -> Optional[Dict]:
        """
        Validate một dòng đơn hàng.
        Trả về dict đã clean hoặc None nếu có lỗi nghiêm trọng.
        """
        errors = []

        # Kiểm tra order_id không rỗng
        order_id = str(row.get("order_id", "")).strip()
        if not order_id:
            errors.append("order_id trống")

        # Kiểm tra quantity > 0
        try:
            qty = int(float(str(row.get("quantity", 0)).replace(",", "")))
            if qty <= 0:
                errors.append(f"quantity phải > 0 (giá trị: {qty})")
        except ValueError:
            qty = 0
            errors.append(f"quantity không hợp lệ: {row.get('quantity')}")

        # Kiểm tra unit_price >= 0
        try:
            price = float(str(row.get("unit_price", 0)).replace(",", "").replace(".", ""))
            if price < 0:
                errors.append(f"unit_price không được âm (giá trị: {price})")
        except ValueError:
            price = 0
            errors.append(f"unit_price không hợp lệ: {row.get('unit_price')}")

        # Kiểm tra order_date
        order_date = self._parse_date(str(row.get("order_date", "")))
        if not order_date:
            errors.append(f"order_date không hợp lệ: {row.get('order_date')}")

        if errors:
            self.errors.append({
                "line":    line_num,
                "order_id": order_id or "(rỗng)",
                "errors":  errors,
            })
            return None

        # Normalize discount
        try:
            discount = float(str(row.get("discount", 0)).replace(",", ""))
        except (ValueError, AttributeError):
            discount = 0.0
            self.warnings.append({
                "line": line_num,
                "msg":  f"discount không hợp lệ, dùng 0"
            })

        return {
            "order_id":      order_id,
            "customer_name": str(row.get("customer_name", "")).strip(),
            "customer_phone": self._normalize_phone(str(row.get("customer_phone", ""))),
            "product_name":  str(row.get("product_name", "")).strip(),
            "quantity":      qty,
            "unit_price":    price,
            "discount":      discount,
            "channel":       str(row.get("channel", "unknown")).strip().lower(),
            "order_date":    order_date,
            "status":        str(row.get("status", "DELIVERED")).strip().upper(),
            "province":      str(row.get("province", "")).strip(),
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_date(raw: str) -> Optional[str]:
        """Thử parse ngày với nhiều format phổ biến VN."""
        formats = [
            "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d",
            "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M",
        ]
        raw = raw.strip()
        for fmt in formats:
            try:
                return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return None

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Chuẩn hóa số điện thoại VN: xóa dấu cách, '-', bắt đầu bằng 0 hoặc +84."""
        import re
        phone = re.sub(r"[\s\-\.]", "", phone.strip())
        if phone.startswith("+84"):
            phone = "0" + phone[3:]
        return phone[:15]   # Cắt tối đa 15 ký tự

    # ── Import Orders ─────────────────────────────────────────────────────────

    def import_orders(self, channel_name: str = "offline") -> Tuple[int, int]:
        """
        Import đơn hàng từ file Excel/CSV vào OLTP database.
        Tự động tạo khách hàng và sản phẩm nếu chưa có.

        Trả về (success_count, error_count).
        """
        sheet = "orders" if self.ext != ".csv" else None
        df    = self._read_sheet(sheet or "orders")
        self._validate_schema(df, "orders")

        self.errors   = []
        self.warnings = []
        success       = 0
        error         = 0

        with get_conn() as conn:
            with conn.cursor() as cur:
                # Lấy channel_id
                cur.execute(
                    "SELECT channel_id FROM public.sales_channels WHERE channel_name ILIKE %s",
                    (channel_name,)
                )
                row = cur.fetchone()
                if not row:
                    raise ValidationError(
                        f"Không tìm thấy kênh bán hàng '{channel_name}' trong database"
                    )
                channel_id = row[0]

                for i, (_, row_data) in enumerate(df.iterrows(), start=2):  # Dòng 1 là header
                    cleaned = self._validate_row_orders(row_data, line_num=i)
                    if not cleaned:
                        error += 1
                        continue

                    try:
                        # Upsert customer
                        cur.execute(
                            """
                            INSERT INTO public.customers (full_name, phone_number, province)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (phone_number) DO UPDATE
                              SET full_name = EXCLUDED.full_name
                            RETURNING customer_id
                            """,
                            (cleaned["customer_name"],
                             cleaned["customer_phone"],
                             cleaned["province"] or None),
                        )
                        customer_id = cur.fetchone()[0]

                        # Upsert product
                        cur.execute(
                            """
                            INSERT INTO public.products (product_name, sku)
                            VALUES (%s, %s)
                            ON CONFLICT (sku) DO NOTHING
                            RETURNING product_id
                            """,
                            (cleaned["product_name"],
                             cleaned["order_id"] + "_" + cleaned["product_name"][:10]),
                        )
                        res = cur.fetchone()
                        if not res:
                            cur.execute(
                                "SELECT product_id FROM public.products WHERE product_name = %s LIMIT 1",
                                (cleaned["product_name"],)
                            )
                            res = cur.fetchone()
                        product_id = res[0] if res else None

                        # Insert order
                        cur.execute(
                            """
                            INSERT INTO public.orders
                              (customer_id, channel_id, status, order_date,
                               total_amount, external_order_id)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (external_order_id) DO NOTHING
                            """,
                            (customer_id, channel_id,
                             cleaned["status"],
                             cleaned["order_date"],
                             cleaned["unit_price"] * cleaned["quantity"] - cleaned["discount"],
                             cleaned["order_id"]),
                        )
                        success += 1

                    except Exception as e:
                        self.errors.append({
                            "line":    i,
                            "order_id": cleaned["order_id"],
                            "errors":  [str(e)],
                        })
                        error += 1

        self._print_report(success, error)
        return success, error

    def _print_report(self, success: int, error: int) -> None:
        """In báo cáo import."""
        logger.info(f"\n{'─'*50}")
        logger.info(f"KẾT QUẢ IMPORT: {success} thành công, {error} lỗi")
        if self.errors:
            logger.warning(f"\nDANH SÁCH LỖI ({len(self.errors)} dòng):")
            for err in self.errors[:20]:   # In tối đa 20 lỗi đầu
                logger.warning(f"  Dòng {err['line']} [order_id={err['order_id']}]: "
                               + "; ".join(err["errors"]))
            if len(self.errors) > 20:
                logger.warning(f"  ... và {len(self.errors) - 20} lỗi khác")
        if self.warnings:
            logger.warning(f"\nCẢNH BÁO ({len(self.warnings)}):")
            for w in self.warnings[:10]:
                logger.warning(f"  Dòng {w['line']}: {w['msg']}")
        logger.info(f"{'─'*50}")

    def get_error_report(self) -> pd.DataFrame:
        """Trả về DataFrame chứa tất cả lỗi để export ra Excel."""
        if not self.errors:
            return pd.DataFrame()
        rows = []
        for e in self.errors:
            rows.append({
                "Dòng":     e["line"],
                "Order ID": e.get("order_id", ""),
                "Lỗi":      "; ".join(e["errors"]),
            })
        return pd.DataFrame(rows)
