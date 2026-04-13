# -*- coding: utf-8 -*-
"""
Normalize – Chuẩn hóa dữ liệu về định dạng thống nhất trước khi load vào DW.

Các chuẩn hóa chính:
  - Số điện thoại → 10 chữ số bắt đầu bằng 0
  - Tỉnh thành → tên chuẩn + vùng kinh tế (Bắc/Trung/Nam/...)
  - Payment method → nhóm chuẩn (CASH/COD/EWALLET/TRANSFER)
  - Order status → chuẩn hóa về OLTP enum
  - Tên kênh → channel_type chuẩn
"""
import re
import logging
from typing import Dict, List, Optional

logger = logging.getLogger("etl.transform.normalize")

# ── Mapping tỉnh thành → vùng kinh tế ────────────────────────────────────────
PROVINCE_TO_REGION: Dict[str, str] = {
    # Miền Bắc
    "Hà Nội": "Bắc", "Hải Phòng": "Bắc", "Quảng Ninh": "Bắc",
    "Bắc Giang": "Bắc", "Bắc Kạn": "Bắc", "Bắc Ninh": "Bắc",
    "Cao Bằng": "Bắc", "Điện Biên": "Bắc", "Hà Giang": "Bắc",
    "Hà Nam": "Bắc", "Hải Dương": "Bắc", "Hòa Bình": "Bắc",
    "Hưng Yên": "Bắc", "Lai Châu": "Bắc", "Lạng Sơn": "Bắc",
    "Lào Cai": "Bắc", "Nam Định": "Bắc", "Ninh Bình": "Bắc",
    "Phú Thọ": "Bắc", "Sơn La": "Bắc", "Thái Bình": "Bắc",
    "Thái Nguyên": "Bắc", "Tuyên Quang": "Bắc", "Vĩnh Phúc": "Bắc",
    "Yên Bái": "Bắc",
    # Miền Trung
    "Đà Nẵng": "Trung", "Huế": "Trung", "Thừa Thiên Huế": "Trung",
    "Quảng Bình": "Trung", "Quảng Nam": "Trung", "Quảng Ngãi": "Trung",
    "Quảng Trị": "Trung", "Bình Định": "Trung", "Hà Tĩnh": "Trung",
    "Nghệ An": "Trung", "Khánh Hòa": "Trung", "Ninh Thuận": "Trung",
    "Bình Thuận": "Trung", "Phú Yên": "Trung", "Thanh Hóa": "Trung",
    # Tây Nguyên
    "Đắk Lắk": "Tây Nguyên", "Đắk Nông": "Tây Nguyên",
    "Gia Lai": "Tây Nguyên", "Kon Tum": "Tây Nguyên", "Lâm Đồng": "Tây Nguyên",
    # Đông Nam Bộ
    "TP. Hồ Chí Minh": "Nam", "Hồ Chí Minh": "Nam",
    "Bà Rịa - Vũng Tàu": "Nam", "Bình Dương": "Nam", "Bình Phước": "Nam",
    "Đồng Nai": "Nam", "Tây Ninh": "Nam",
    # ĐBSCL
    "An Giang": "Nam", "Bạc Liêu": "Nam", "Bến Tre": "Nam",
    "Cà Mau": "Nam", "Cần Thơ": "Nam", "Đồng Tháp": "Nam",
    "Hậu Giang": "Nam", "Kiên Giang": "Nam", "Long An": "Nam",
    "Sóc Trăng": "Nam", "Tiền Giang": "Nam", "Trà Vinh": "Nam",
    "Vĩnh Long": "Nam",
}

# ── Mapping payment method → nhóm chuẩn ──────────────────────────────────────
PAYMENT_NORMALIZE: Dict[str, str] = {
    "cod":          "COD",
    "cash_on_delivery": "COD",
    "cash":         "CASH",
    "momo":         "EWALLET",
    "vnpay":        "TRANSFER",
    "zalopay":      "EWALLET",
    "shopeepay":    "EWALLET",
    "lazada_wallet": "EWALLET",
    "credit_card":  "TRANSFER",
    "bank_transfer": "TRANSFER",
    "atm":          "TRANSFER",
}

# ── Mapping order status → OLTP enum ─────────────────────────────────────────
STATUS_NORMALIZE: Dict[str, str] = {
    # Shopee statuses
    "UNPAID":           "PENDING",
    "READY_TO_SHIP":    "CONFIRMED",
    "PROCESSED":        "CONFIRMED",
    "SHIPPED":          "SHIPPED",
    "TO_CONFIRM_RECEIVE": "SHIPPED",
    "IN_CANCEL":        "CANCELLED",
    "CANCELLED":        "CANCELLED",
    "TO_RETURN":        "RETURNED",
    "COMPLETED":        "DELIVERED",
    # Lazada statuses
    "pending":          "PENDING",
    "pending_payment":  "PENDING",
    "shipped":          "SHIPPED",
    "delivered":        "DELIVERED",
    "failed":           "CANCELLED",
    "canceled":         "CANCELLED",
    "returned":         "RETURNED",
}


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    """Chuẩn hóa số điện thoại VN về dạng 0xxxxxxxxx (10 chữ số)."""
    if not phone:
        return None
    phone = re.sub(r"[\s\-\.\(\)]", "", str(phone).strip())
    if phone.startswith("+84"):
        phone = "0" + phone[3:]
    elif phone.startswith("84") and len(phone) == 11:
        phone = "0" + phone[2:]
    # Chỉ giữ chữ số
    phone = re.sub(r"\D", "", phone)
    return phone[:10] if len(phone) >= 10 else phone


def normalize_province(province: Optional[str]) -> str:
    """Chuẩn hóa tên tỉnh thành về key trong PROVINCE_TO_REGION."""
    if not province:
        return "Khác"
    province = province.strip()
    # Thử exact match trước
    if province in PROVINCE_TO_REGION:
        return province
    # Thử substring match
    for key in PROVINCE_TO_REGION:
        if key.lower() in province.lower() or province.lower() in key.lower():
            return key
    return province   # Giữ nguyên nếu không tìm thấy


def get_region(province: str) -> str:
    """Lấy vùng kinh tế từ tên tỉnh thành đã chuẩn hóa."""
    return PROVINCE_TO_REGION.get(province, "Khác")


def normalize_payment_method(method: Optional[str]) -> str:
    """Chuẩn hóa phương thức thanh toán."""
    if not method:
        return "COD"
    key = method.lower().replace(" ", "_").replace("-", "_")
    return PAYMENT_NORMALIZE.get(key, method.upper()[:20])


def normalize_status(status: Optional[str]) -> str:
    """Chuẩn hóa trạng thái đơn hàng."""
    if not status:
        return "PENDING"
    return STATUS_NORMALIZE.get(status, status.upper()[:20])


def normalize_shopee_row(row: Dict) -> Dict:
    """
    Chuẩn hóa một bản ghi Shopee đã qua bước clean.
    Trích xuất thông tin khách hàng và sản phẩm từ nested JSON.
    """
    address = row.get("recipient_address") or {}
    items   = row.get("item_list") or []

    # Thông tin người nhận
    row["customer_name"]    = address.get("name", "")
    row["customer_phone"]   = normalize_phone(address.get("phone"))
    raw_province            = address.get("state") or address.get("city", "")
    row["province"]         = normalize_province(raw_province)
    row["region"]           = get_region(row["province"])
    row["full_address"]     = address.get("full_address", "")

    # Chuẩn hóa payment và status
    row["payment_method_normalized"] = normalize_payment_method(row.get("payment_method"))
    row["status_normalized"]         = normalize_status(row.get("order_status"))

    # Chuẩn hóa items – mỗi item trở thành một record trong fact_sales
    normalized_items = []
    for item in items:
        normalized_items.append({
            "item_id":       item.get("item_id"),
            "item_name":     item.get("item_name", "").strip(),
            "model_name":    item.get("model_name", ""),
            "sku":           str(item.get("item_sku") or item.get("model_sku") or ""),
            "quantity":      int(item.get("model_quantity_purchased", 1) or 1),
            "unit_price":    float(item.get("model_original_price", 0) or 0),
            "discounted_price": float(item.get("model_discounted_price", 0) or 0),
        })
    row["items_normalized"] = normalized_items
    return row


def normalize_lazada_row(row: Dict) -> Dict:
    """Chuẩn hóa một bản ghi Lazada."""
    address = row.get("shipping_address") or {}
    items   = row.get("items") or []

    customer_name = f"{row.get('customer_first_name','')} {row.get('customer_last_name','')}".strip()
    row["customer_name"]  = customer_name or address.get("name", "")
    row["customer_phone"] = normalize_phone(address.get("phone"))
    raw_province          = address.get("province", "") or address.get("city", "")
    row["province"]       = normalize_province(raw_province)
    row["region"]         = get_region(row["province"])

    row["payment_method_normalized"] = normalize_payment_method(row.get("payment_method"))
    row["status_normalized"]         = normalize_status(row.get("order_status"))

    normalized_items = []
    for item in items:
        normalized_items.append({
            "item_id":    item.get("item_id"),
            "item_name":  item.get("name", "").strip(),
            "sku":        str(item.get("sku") or ""),
            "quantity":   int(item.get("units", 1) or 1),
            "unit_price": float(item.get("paid_price", 0) or 0),
            "discounted_price": float(item.get("paid_price", 0) or 0),
        })
    row["items_normalized"] = normalized_items
    return row


def normalize_dispatch(source: str, rows: List[Dict]) -> List[Dict]:
    """Dispatch normalize theo nguồn."""
    fn_map = {
        "shopee": normalize_shopee_row,
        "lazada": normalize_lazada_row,
    }
    fn = fn_map.get(source, lambda r: r)
    result = [fn(row) for row in rows]
    logger.info(f"Normalize {source}: {len(result)} bản ghi")
    return result
