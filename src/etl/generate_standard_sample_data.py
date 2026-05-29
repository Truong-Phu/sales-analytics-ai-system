# -*- coding: utf-8 -*-
"""
generate_standard_sample_data.py
Tạo dữ liệu mẫu chuẩn theo đúng cấu trúc response của 4 Open Platform:
  Shopee (get_order_detail), TikTok Shop (Search Orders),
  Lazada (GetOrders + GetOrderItems), GHN (shipping-order/detail)

Khoảng thời gian: 01/07/2024 → ngày hiện tại (động)
Target: Shopee=550, TikTok=330, Lazada=270, GHN=~1050

Chạy: python src/etl/generate_standard_sample_data.py
      (cần .env với DATABASE_URL)
"""

import json
import os
import random
import string
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

# ── Config ───────────────────────────────────────────────────────────────────
START_DATE = datetime(2024, 7, 1, tzinfo=timezone.utc)
END_DATE   = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59, microsecond=0)
SHOP_ID    = "885"
COMPANY_NAME = "Phú Thịnh"

VN_NAMES = [
    "Nguyễn Văn An",   "Trần Thị Bình",  "Lê Minh Đức",    "Phạm Thu Hà",
    "Hoàng Quốc Khải", "Ngô Thị Lan",    "Vũ Đức Mạnh",    "Đinh Thị Nga",
    "Bùi Văn Phong",   "Đặng Thị Quỳnh", "Dương Minh Tú",  "Lý Thanh Hương",
    "Trịnh Văn Long",  "Phan Thị Mai",   "Võ Đức Nam",     "Huỳnh Thị Oanh",
    "Đỗ Minh Tuấn",    "Nguyễn Thị Vân", "Trần Văn Hùng",  "Lê Thị Kim",
    "Pham Van Toan",   "Nguyen Thi Thuy","Hoang Van Binh",  "Tran Thi Dung",
    "Le Van Cuong",    "Phan Thi Hoa",   "Vu Thi Lan",     "Do Van Duc",
    "Bui Thi Thu",     "Dinh Van Hai",
]

VN_PHONES = [
    "0901234567", "0912345678", "0923456789", "0934567890", "0945678901",
    "0956789012", "0967890123", "0978901234", "0989012345", "0990123456",
    "0331234567", "0342345678", "0353456789", "0364567890", "0375678901",
    "0386789012", "0397890123", "0701234567", "0712345678", "0723456789",
]

PROVINCES_HCM = [
    ("Quận 1",          "Phường Bến Nghé",  "TP. Hồ Chí Minh", 1452),
    ("Quận 3",          "Phường 5",          "TP. Hồ Chí Minh", 1453),
    ("Quận 5",          "Phường 3",          "TP. Hồ Chí Minh", 1454),
    ("Quận Bình Thạnh", "Phường 7",          "TP. Hồ Chí Minh", 1444),
    ("Quận Gò Vấp",    "Phường 12",         "TP. Hồ Chí Minh", 1450),
]
PROVINCES_HN = [
    ("Quận Hoàn Kiếm",  "Phường Hàng Bạc",  "Hà Nội",           1490),
    ("Quận Đống Đa",    "Phường Quốc Tử Giám", "Hà Nội",         1489),
    ("Quận Cầu Giấy",   "Phường Nghĩa Tân",  "Hà Nội",           1488),
]
PROVINCES_DN = [
    ("Quận Hải Châu",   "Phường Hải Châu 1", "Đà Nẵng",          1553),
    ("Quận Thanh Khê",  "Phường Thanh Khê Đông", "Đà Nẵng",      1554),
]
ALL_PROVINCES = PROVINCES_HCM + PROVINCES_HN + PROVINCES_DN

PRODUCTS = [
    {"name": "Áo thun nam basic cotton thoáng mát",   "sku_base": "AT-NAM-001", "price": 220000, "weight": 0.3},
    {"name": "Áo sơ mi nam công sở dài tay",           "sku_base": "ASM-NAM-004","price": 280000, "weight": 0.35},
    {"name": "Quần jean nam slim fit",                  "sku_base": "QJ-NAM-002", "price": 520000, "weight": 0.6},
    {"name": "Đầm maxi nữ đi biển",                    "sku_base": "DAM-NU-003", "price": 399000, "weight": 0.4},
    {"name": "Túi xách nữ da PU",                       "sku_base": "TX-NU-005",  "price": 650000, "weight": 0.5},
    {"name": "Áo khoác bomber unisex",                  "sku_base": "AK-UNI-006", "price": 480000, "weight": 0.5},
    {"name": "Quần shorts nữ vải linen",                "sku_base": "QS-NU-007",  "price": 180000, "weight": 0.25},
    {"name": "Áo polo nam cổ bẻ",                      "sku_base": "AP-NAM-008", "price": 320000, "weight": 0.3},
    {"name": "Váy midi nữ hoa nhí",                     "sku_base": "VY-NU-009",  "price": 420000, "weight": 0.4},
    {"name": "Balo thời trang đi học",                  "sku_base": "BL-UNI-010", "price": 350000, "weight": 0.6},
]

VARIATIONS = {
    "AT-NAM-001": [("Trắng - S", "TRANG-S"), ("Trắng - M", "TRANG-M"), ("Trắng - L", "TRANG-L"),
                   ("Đen - S",   "DEN-S"),   ("Đen - M",   "DEN-M"),   ("Đen - L",   "DEN-L")],
    "ASM-NAM-004":[("Trắng - M", "TRANG-M"), ("Trắng - L", "TRANG-L"), ("Xanh - M",  "XANH-M")],
    "QJ-NAM-002": [("Xanh đậm - 29", "XANH-29"), ("Xanh đậm - 30", "XANH-30"),
                   ("Xanh đậm - 32", "XANH-32"), ("Xanh đậm - 34", "XANH-34")],
    "DAM-NU-003": [("Trắng - S", "TRANG-S"), ("Xanh - M",  "XANH-M"),  ("Hồng - L",  "HONG-L")],
    "TX-NU-005":  [("Đen - OS",  "DEN-OS")],
    "AK-UNI-006": [("Đen - S",   "DEN-S"),   ("Đen - M",   "DEN-M"),   ("Xanh - M",  "XANH-M")],
    "QS-NU-007":  [("Trắng - S", "TRANG-S"), ("Be - M",    "BE-M")],
    "AP-NAM-008": [("Xanh - M",  "XANH-M"),  ("Đen - L",   "DEN-L"),   ("Đỏ - M",    "DO-M")],
    "VY-NU-009":  [("Hoa nhí - S","HOANHI-S"),("Hoa nhí - M","HOANHI-M")],
    "BL-UNI-010": [("Đen - OS",  "DEN-OS"),  ("Xanh - OS", "XANH-OS")],
}

PAYMENT_METHODS_SHOPEE = ["Cash on Delivery", "VNPAY", "Momo", "ShopeePay"]
PAYMENT_METHODS_TIKTOK = ["COD", "VNPay", "Ví MoMo", "ZaloPay"]
PAYMENT_METHODS_LAZADA = ["CashOnDelivery", "CreditCard", "BankTransfer", "Momo"]
PAY_WEIGHTS_COD    = [60, 25, 10, 5]
PAY_WEIGHTS_NONCODE= [5, 40, 35, 20]

SHOPEE_STATUSES  = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED",
                     "COMPLETED", "SHIPPED", "READY_TO_SHIP", "CANCELLED", "RETURN_REFUND"]
TIKTOK_STATUSES  = ["COMPLETED","COMPLETED","COMPLETED","COMPLETED","DELIVERED",
                     "IN_TRANSIT","AWAITING_SHIPMENT","CANCELLED","RETURNED","COMPLETED"]
LAZADA_STATUSES  = ["delivered","delivered","delivered","delivered","shipped",
                     "ready_to_ship","canceled","returned","delivered","delivered"]

# ── Helpers ──────────────────────────────────────────────────────────────────

def _rand_str(n: int) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

def _unix(dt: datetime) -> int:
    return int(dt.timestamp())

def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S+07:00")

def _date_weight(d: datetime) -> float:
    """Trọng số thời gian — tăng đột biến dịp sale (11/11, 12/12, Tết)."""
    month, day = d.month, d.day
    if month == 11 and day == 11: return 4.0
    if month == 12 and day == 12: return 3.0
    if month in (1, 2) and day <= 15: return 0.6  # Tết giảm
    if month == 3 and 1 <= day <= 10: return 1.2   # Phục hồi sau Tết
    if month in (11, 12): return 1.5
    return 1.0

def _sample_dates(n: int) -> List[datetime]:
    """Lấy n ngày ngẫu nhiên có trọng số theo mùa vụ."""
    total_days = (END_DATE - START_DATE).days
    dates: List[datetime] = []
    while len(dates) < n:
        offset = random.randint(0, total_days)
        d = START_DATE + timedelta(days=offset)
        w = _date_weight(d)
        if random.random() < w / 4.0:
            hour   = random.randint(8, 22)
            minute = random.randint(0, 59)
            dates.append(d.replace(hour=hour, minute=minute, second=random.randint(0, 59)))
    return sorted(dates)

def _pick_product() -> Tuple[Dict, str, str]:
    prod = random.choice(PRODUCTS)
    sku_base = prod["sku_base"]
    vars_ = VARIATIONS[sku_base]
    var_name, var_suffix = random.choice(vars_)
    sku = f"{sku_base}-{var_suffix}"
    return prod, var_name, sku

def _pick_location() -> Tuple[str, str, str, int]:
    """Trả về (district, ward, province, ghn_district_id)"""
    weights = [0.6] * len(PROVINCES_HCM) + [0.25] * len(PROVINCES_HN) + [0.15] * len(PROVINCES_DN)
    all_ = ALL_PROVINCES
    choice = random.choices(all_, weights=weights)[0]
    return choice  # (district, ward, province, ghn_district_id)

def _ghn_ward_code(province: str) -> str:
    mapping = {
        "TP. Hồ Chí Minh": ["20305", "20308", "20310", "20312"],
        "Hà Nội":           ["1A0101", "1A0102", "1A0103"],
        "Đà Nẵng":          ["550101", "550102"],
    }
    codes = mapping.get(province, ["20305"])
    return random.choice(codes)

# ── Shopee generator ──────────────────────────────────────────────────────────

def gen_shopee_orders(n: int) -> List[Dict]:
    orders = []
    dates  = _sample_dates(n)
    used_sns: set = set()

    for d in dates:
        create_ts = _unix(d)
        sn = f"24{d.strftime('%m')}{_rand_str(10).lower()}"
        while sn in used_sns:
            sn = f"24{d.strftime('%m')}{_rand_str(10).lower()}"
        used_sns.add(sn)

        name = random.choice(VN_NAMES)
        phone = random.choice(VN_PHONES)
        district, ward, province, _ = _pick_location()
        addr_full = f"{''.join(random.choices(string.digits, k=3))} {random.choice(['Nguyễn Trãi','Lê Lợi','Trần Phú','Đinh Tiên Hoàng','Hoàng Hoa Thám'])}, {ward}, {district}, {province}"

        prod, var_name, sku = _pick_product()
        qty = random.choices([1, 2, 3], weights=[70, 25, 5])[0]
        orig_price = prod["price"]
        disc_pct   = random.choice([0, 5, 10, 15, 20])
        sale_price = int(orig_price * (1 - disc_pct / 100))
        ship_fee   = random.choice([25000, 30000, 35000])
        total_amount = sale_price * qty + ship_fee

        is_cod    = random.random() < 0.6
        pay_method = random.choices(
            PAYMENT_METHODS_SHOPEE,
            weights=[60, 20, 15, 5] if is_cod else [5, 40, 35, 20]
        )[0]

        status = random.choice(SHOPEE_STATUSES)

        pay_ts    = create_ts + random.randint(300, 3600) if status != "UNPAID" else 0
        pickup_ts = pay_ts + random.randint(3600, 7200) if status in ("COMPLETED", "SHIPPED") else 0

        carrier   = "Giao Hàng Nhanh"
        pkg_number = f"SPX{d.strftime('%Y%m%d')}{_rand_str(6)}" if status not in ("CANCELLED", "RETURN_REFUND") else ""

        order = {
            "order_sn":       sn,
            "create_time":    create_ts,
            "update_time":    create_ts + random.randint(3600, 86400),
            "order_status":   status,
            "message_to_seller": "",
            "buyer_username": f"user_{_rand_str(8).lower()}",
            "buyer_user_id":  random.randint(100000, 9999999),
            "pay_time":       pay_ts,
            "pickup_done_time": pickup_ts,
            "ship_by_date":   create_ts + (3 * 86400),
            "days_to_ship":   3,
            "recipient_address": {
                "name":         name,
                "phone":        phone,
                "full_address": addr_full,
                "district":     district,
                "city":         province,
                "state":        province,
                "town":         ward,
                "region":       "VN",
                "zipcode":      f"{random.randint(70000, 99999)}",
            },
            "item_list": [{
                "item_id":                   random.randint(1000000, 9999999),
                "item_name":                 prod["name"],
                "item_sku":                  prod["sku_base"],
                "order_item_id":             random.randint(10000000, 99999999),
                "model_id":                  random.randint(100000, 999999),
                "model_name":                var_name,
                "model_sku":                 sku,
                "model_quantity_purchased":  qty,
                "model_original_price":      orig_price,
                "model_discounted_price":    sale_price,
                "weight":                    prod["weight"],
                "image_info": {"image_url": f"https://cf.shopee.vn/file/{sku.lower().replace('-','_')}.jpg"},
                "promotion_type":            "flash_sale" if disc_pct >= 15 else "",
            }],
            "package_list": [{
                "package_number":   pkg_number,
                "logistics_status": "LOGISTICS_DELIVERY_DONE" if status == "COMPLETED" else "LOGISTICS_REQUEST_CREATED",
                "shipping_carrier": carrier,
            }] if pkg_number else [],
            "payment_method":         pay_method,
            "total_amount":           str(total_amount),
            "estimated_shipping_fee": ship_fee,
            "actual_shipping_fee":    ship_fee if status == "COMPLETED" else 0,
            "buyer_cpf_id":           "",
            "fulfillment_flag":       1,
        }
        orders.append(order)

    return orders

# ── TikTok generator ──────────────────────────────────────────────────────────

def gen_tiktok_orders(n: int) -> List[Dict]:
    orders = []
    dates  = _sample_dates(n)
    used_ids: set = set()

    for d in dates:
        create_ts = _unix(d)
        oid = f"576{''.join(random.choices(string.digits, k=15))}"
        while oid in used_ids:
            oid = f"576{''.join(random.choices(string.digits, k=15))}"
        used_ids.add(oid)

        name  = random.choice(VN_NAMES)
        phone = random.choice(VN_PHONES)
        district, ward, province, _ = _pick_location()
        addr_detail = f"{''.join(random.choices(string.digits, k=3))} {random.choice(['Lê Lợi','Nguyễn Huệ','Trần Hưng Đạo'])}"
        addr_full   = f"{addr_detail}, {ward}, {district}, {province}"

        prod, var_name, sku = _pick_product()
        qty = random.choices([1, 2, 3], weights=[75, 20, 5])[0]
        orig_price = prod["price"]
        disc_pct   = random.choice([0, 5, 10, 15])
        sale_price = int(orig_price * (1 - disc_pct / 100))
        ship_fee   = random.choice([25000, 30000])
        total_amt  = sale_price * qty + ship_fee
        sub_total  = sale_price * qty

        is_cod     = random.random() < 0.55
        pay_method = random.choices(PAYMENT_METHODS_TIKTOK, weights=[55, 20, 15, 10])[0]
        is_cod_flag = (pay_method == "COD")

        status = random.choice(TIKTOK_STATUSES)

        paid_ts   = create_ts + random.randint(300, 7200) if status not in ("AWAITING_SHIPMENT",) else 0
        update_ts = create_ts + random.randint(3600, 86400)
        tracking  = f"TTKGHN{d.strftime('%Y%m%d')}{_rand_str(6)}" if status not in ("CANCELLED","RETURNED") else ""
        sku_id    = f"27{random.randint(10000000, 99999999)}"
        product_id = f"17{random.randint(10000000, 99999999)}"
        pkg_id    = f"11{random.randint(10000000, 99999999)}" if tracking else ""

        platform_disc = int(orig_price * 0.05) if disc_pct >= 10 else 0
        seller_disc   = int(orig_price * 0.02) if disc_pct >= 5 else 0

        order = {
            "id":          oid,
            "status":      status,
            "create_time": create_ts,
            "update_time": update_ts,
            "paid_time":   paid_ts,
            "rts_time":    paid_ts + 7200 if paid_ts else 0,
            "buyer_uid":   f"user_{_rand_str(8).lower()}",
            "buyer_message": "",
            "is_cod":      is_cod_flag,
            "payment_method_name": pay_method,
            "shipping_type": "TIKTOK",
            "fulfillment_type": "FULFILLMENT_BY_SELLER",
            "payment": {
                "currency":             "VND",
                "total_amount":         str(total_amt),
                "sub_total":            str(sub_total),
                "shipping_fee":         str(ship_fee),
                "original_total_product_price": str(orig_price * qty),
                "shipping_fee_platform_discount": "0",
                "seller_discount":      str(seller_disc),
                "platform_discount":    str(platform_disc),
            },
            "recipient_address": {
                "name":          name,
                "phone_number":  phone,
                "full_address":  addr_full,
                "address_detail": addr_detail,
                "postal_code":   f"{random.randint(70000, 99999)}",
                "region_code":   "VN",
                "district_info": [
                    {"address_level_name": "Province", "address_name": province, "address_level": "L1"},
                    {"address_level_name": "District",  "address_name": district, "address_level": "L2"},
                    {"address_level_name": "Ward",      "address_name": ward,     "address_level": "L3"},
                ],
            },
            "line_items": [{
                "id":                    f"94{random.randint(10000000, 99999999)}",
                "sku_id":                sku_id,
                "product_id":            product_id,
                "product_name":          prod["name"],
                "seller_sku":            sku,
                "sku_name":              var_name,
                "sku_image":             f"https://p16-oec-va.ibyteimg.com/tos/{sku.lower()}.jpg",
                "original_price":        str(orig_price),
                "sale_price":            str(sale_price),
                "platform_discount":     str(platform_disc),
                "seller_discount":       str(seller_disc),
                "currency":              "VND",
                "quantity":              qty,
                "display_status":        status,
                "package_status":        "COMPLETED" if status == "COMPLETED" else "TO_FULFILL",
                "shipping_provider_name":"GHN",
                "tracking_number":       tracking,
                "package_id":            pkg_id,
            }],
        }
        orders.append(order)

    return orders

# ── Lazada generator ──────────────────────────────────────────────────────────

def gen_lazada_orders(n: int) -> List[Tuple[Dict, Dict]]:
    orders_with_items = []
    dates = _sample_dates(n)
    used_ids: set = set()

    for d in dates:
        oid = int(f"70{random.randint(10000000, 99999999)}")
        while str(oid) in used_ids:
            oid = int(f"70{random.randint(10000000, 99999999)}")
        used_ids.add(str(oid))
        order_number = f"{random.randint(100000000000000, 999999999999999)}"

        name_full = random.choice(VN_NAMES)
        parts = name_full.split()
        last_name = parts[0]
        first_name = " ".join(parts[1:]) if len(parts) > 1 else parts[0]
        phone = random.choice(VN_PHONES)
        district, ward, province, _ = _pick_location()
        addr1 = f"{''.join(random.choices(string.digits, k=3))} {random.choice(['Nguyễn Trãi','Lê Duẩn','Trần Phú'])}"

        prod, var_name, sku = _pick_product()
        orig_price_f = float(prod["price"])
        disc_pct     = random.choice([0, 5, 10])
        paid_price_f = orig_price_f * (1 - disc_pct / 100)
        ship_fee_f   = random.choice([25000.0, 30000.0, 35000.0])
        total_f      = paid_price_f + ship_fee_f

        pay_method = random.choice(PAYMENT_METHODS_LAZADA)
        status     = random.choice(LAZADA_STATUSES)

        created_str = _iso(d)
        updated_str = _iso(d + timedelta(hours=random.randint(1, 48)))
        tracking    = f"LZD-VN-{_rand_str(10)}" if status not in ("canceled","returned") else ""
        lzd_item_id = random.randint(100000, 9999999)
        order_item_id = random.randint(10000000, 99999999)
        shop_sku      = f"{sku}_VN"

        order_data = {
            "order_id":         str(oid),
            "order_number":     order_number,
            "created_at":       created_str,
            "updated_at":       updated_str,
            "status":           status,
            "payment_method":   pay_method,
            "price":            str(int(total_f)),
            "shipping_fee":     str(int(ship_fee_f)),
            "shipping_fee_original": str(int(ship_fee_f)),
            "shipping_fee_discount_platform": "0",
            "voucher":          "0.00",
            "voucher_platform": "0.00",
            "customer_first_name": first_name,
            "customer_last_name":  last_name,
            "address_shipping": {
                "first_name": first_name,
                "last_name":  last_name,
                "phone":      phone,
                "address1":   addr1,
                "city":       district,
                "address3":   province,
                "address4":   ward,
                "country":    "Vietnam",
            },
            "items_count":    "1",
            "warehouse_code": "dropshipping",
        }

        items_data = {
            "order_id":       str(oid),
            "order_item_id":  str(order_item_id),
            "name":           prod["name"],
            "sku":            sku,
            "shop_sku":       shop_sku,
            "variation":      var_name,
            "item_price":     str(int(orig_price_f)),
            "paid_price":     str(int(paid_price_f)),
            "shipping_amount": str(int(ship_fee_f)),
            "status":         status,
            "shipment_provider": "Lazada Logistics",
            "tracking_code":  tracking,
            "created_at":     created_str,
            "updated_at":     updated_str,
            "currency":       "VND",
            "product_main_image": f"https://my-live-02.slatic.net/p/{lzd_item_id}.jpg",
            "product_id":     str(lzd_item_id),
            "shop_id":        "1001",
            "is_digital":     "false",
            "quantity":       "1",
        }

        orders_with_items.append((order_data, items_data))

    return orders_with_items

# ── GHN generator ────────────────────────────────────────────────────────────

def gen_ghn_tracking(orders_raw: List[Dict]) -> List[Dict]:
    """Tạo GHN tracking record cho mỗi đơn không bị CANCELLED."""
    results = []
    for o in orders_raw:
        # Xác định trạng thái từ đơn sàn
        if "order_status" in o:  # Shopee
            platform_status = o["order_status"]
            order_code_src  = o["order_sn"]
            create_dt = datetime.fromtimestamp(o["create_time"], tz=timezone.utc)
            if "CANCEL" in platform_status: continue
            recip = o["recipient_address"]
        elif "status" in o and "line_items" in o:  # TikTok
            platform_status = o["status"]
            order_code_src  = o["id"]
            create_dt = datetime.fromtimestamp(o["create_time"], tz=timezone.utc)
            if platform_status == "CANCELLED": continue
            recip_raw = o["recipient_address"]
            recip = {
                "name": recip_raw["name"],
                "phone": recip_raw["phone_number"],
                "full_address": recip_raw["full_address"],
                "city": next((x["address_name"] for x in recip_raw["district_info"] if x["address_level"]=="L1"), ""),
                "district_id": 1452,
            }
        else:  # Lazada dict
            platform_status = o.get("status", "")
            if platform_status in ("canceled", "returned"): continue
            order_code_src = o.get("order_id", "")
            create_dt = datetime.now(tz=timezone.utc)
            addr = o.get("address_shipping", {})
            recip = {
                "name": f"{addr.get('first_name','')} {addr.get('last_name','')}".strip(),
                "phone": addr.get("phone", ""),
                "full_address": addr.get("address1", ""),
                "city": addr.get("city", ""),
                "district_id": 1452,
            }

        ghn_code = f"GHN{create_dt.strftime('%Y%m%d')}{_rand_str(6)}"
        is_delivered = platform_status in ("COMPLETED", "delivered", "DELIVERED")

        ghn_status_map = {
            "COMPLETED": "delivered",
            "delivered": "delivered",
            "SHIPPED": "delivering",
            "shipped": "delivering",
            "IN_TRANSIT": "delivering",
            "READY_TO_SHIP": "picking",
            "ready_to_ship": "picking",
            "RETURN_REFUND": "return",
            "returned": "return",
        }
        ghn_status = ghn_status_map.get(platform_status, "storing")

        district_id = recip.get("district_id", 1452)
        ward_code   = _ghn_ward_code(recip.get("city", ""))
        cod_amount  = 0  # sẽ fill từ order

        log_entries = [{"status": "ready_to_pick", "updated_date": _iso(create_dt)}]
        if ghn_status != "picking":
            log_entries.append({"status": "picked", "updated_date": _iso(create_dt + timedelta(hours=2))})
        if ghn_status in ("delivering", "delivered", "return"):
            log_entries.append({"status": "transporting", "updated_date": _iso(create_dt + timedelta(hours=12))})
            log_entries.append({"status": "delivering",   "updated_date": _iso(create_dt + timedelta(hours=24))})
        if ghn_status == "delivered":
            log_entries.append({"status": "delivered",    "updated_date": _iso(create_dt + timedelta(hours=36))})
        if ghn_status == "return":
            log_entries.append({"status": "return",       "updated_date": _iso(create_dt + timedelta(hours=48))})

        record = {
            "order_code":        ghn_code,
            "client_order_code": order_code_src,
            "shop_id":           885,
            "from_name":         "Phú Thịnh Fashion",
            "from_phone":        "0901234567",
            "from_address":      "123 Nguyễn Trãi, P.3, Q.5, TP.HCM",
            "from_ward_code":    "20305",
            "from_district_id":  1442,
            "to_name":           recip.get("name", ""),
            "to_phone":          recip.get("phone", ""),
            "to_address":        recip.get("full_address", ""),
            "to_ward_code":      ward_code,
            "to_district_id":    district_id,
            "weight":            300,
            "service_type_id":   2,
            "payment_type_id":   2,
            "cod_amount":        cod_amount,
            "insurance_value":   0,
            "status":            ghn_status,
            "created_date":      _iso(create_dt),
            "updated_date":      _iso(create_dt + timedelta(hours=random.randint(12, 72))),
            "leadtime":          _unix(create_dt + timedelta(days=3)),
            "log":               log_entries,
        }
        results.append(record)

    return results

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_db_conn():
    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/msas_db")
    return psycopg2.connect(db_url)

def get_company_id(conn) -> Optional[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM public.companies WHERE name ILIKE %s LIMIT 1", (f"%{COMPANY_NAME}%",))
        row = cur.fetchone()
        return str(row[0]) if row else None

def insert_staging_shopee(conn, orders: List[Dict], company_id: str) -> int:
    sql = """
        INSERT INTO staging.raw_shopee_orders (company_id, order_sn, raw_data, imported_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (order_sn) DO NOTHING
    """
    count = 0
    with conn.cursor() as cur:
        for o in orders:
            cur.execute(sql, (company_id, o["order_sn"], json.dumps(o, ensure_ascii=False)))
            count += cur.rowcount
    conn.commit()
    return count

def insert_staging_tiktok(conn, orders: List[Dict], company_id: str) -> int:
    sql = """
        INSERT INTO staging.raw_tiktok_orders (company_id, order_id, raw_data, imported_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (order_id) DO NOTHING
    """
    count = 0
    with conn.cursor() as cur:
        for o in orders:
            cur.execute(sql, (company_id, o["id"], json.dumps(o, ensure_ascii=False)))
            count += cur.rowcount
    conn.commit()
    return count

def insert_staging_lazada(conn, orders_items: List[Tuple[Dict, Dict]], company_id: str) -> int:
    sql = """
        INSERT INTO staging.raw_lazada_orders (company_id, order_id, raw_order, raw_items, imported_at)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT (order_id) DO NOTHING
    """
    count = 0
    with conn.cursor() as cur:
        for order, item in orders_items:
            cur.execute(sql, (
                company_id,
                order["order_id"],
                json.dumps(order, ensure_ascii=False),
                json.dumps(item, ensure_ascii=False),
            ))
            count += cur.rowcount
    conn.commit()
    return count

def insert_staging_ghn(conn, records: List[Dict], company_id: str) -> int:
    sql = """
        INSERT INTO staging.raw_ghn_tracking
               (company_id, order_code, client_order_code, raw_data, imported_at)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT (order_code) DO NOTHING
    """
    count = 0
    with conn.cursor() as cur:
        for r in records:
            cur.execute(sql, (
                company_id,
                r["order_code"],
                r["client_order_code"],
                json.dumps(r, ensure_ascii=False),
            ))
            count += cur.rowcount
    conn.commit()
    return count

def save_json_files(shopee_orders, tiktok_orders, lazada_pairs, ghn_records):
    """Lưu ra file JSON để kiểm tra hoặc import thủ công."""
    out_dir = Path(__file__).resolve().parents[2] / "docs" / "sample-data"
    out_dir.mkdir(parents=True, exist_ok=True)

    with open(out_dir / "shopee_orders_sample.json", "w", encoding="utf-8") as f:
        json.dump(shopee_orders, f, ensure_ascii=False, indent=2)
    with open(out_dir / "tiktok_orders_sample.json", "w", encoding="utf-8") as f:
        json.dump(tiktok_orders, f, ensure_ascii=False, indent=2)
    with open(out_dir / "lazada_orders_sample.json", "w", encoding="utf-8") as f:
        json.dump([{"order": p[0], "items": p[1]} for p in lazada_pairs], f, ensure_ascii=False, indent=2)
    with open(out_dir / "ghn_tracking_sample.json", "w", encoding="utf-8") as f:
        json.dump(ghn_records, f, ensure_ascii=False, indent=2)

    print(f"✅ Đã lưu JSON sample files vào {out_dir}/")

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("🚀 Bắt đầu generate dữ liệu mẫu chuẩn Open Platform...")
    random.seed(42)

    # 1. Generate data
    print("  → Đang tạo 550 đơn Shopee...")
    shopee  = gen_shopee_orders(550)

    print("  → Đang tạo 330 đơn TikTok...")
    tiktok  = gen_tiktok_orders(330)

    print("  → Đang tạo 270 đơn Lazada...")
    lazada  = gen_lazada_orders(270)

    print("  → Đang tạo GHN tracking...")
    all_orders_for_ghn = shopee + tiktok + [pair[0] for pair in lazada]
    ghn = gen_ghn_tracking(all_orders_for_ghn)

    print(f"  Kết quả: Shopee={len(shopee)}, TikTok={len(tiktok)}, Lazada={len(lazada)}, GHN={len(ghn)}")

    # 2. Lưu JSON
    save_json_files(shopee, tiktok, lazada, ghn)

    # 3. Insert vào DB
    try:
        conn = get_db_conn()
        company_id = get_company_id(conn)
        if not company_id:
            print("⚠️  Không tìm thấy công ty 'Phú Thịnh' trong DB. Chỉ lưu JSON file.")
            conn.close()
            return

        print(f"  → Company ID: {company_id}")
        print("  → Inserting Shopee staging...")
        s = insert_staging_shopee(conn, shopee, company_id)
        print(f"     Inserted: {s}")

        print("  → Inserting TikTok staging...")
        t = insert_staging_tiktok(conn, tiktok, company_id)
        print(f"     Inserted: {t}")

        print("  → Inserting Lazada staging...")
        l = insert_staging_lazada(conn, lazada, company_id)
        print(f"     Inserted: {l}")

        print("  → Inserting GHN tracking staging...")
        g = insert_staging_ghn(conn, ghn, company_id)
        print(f"     Inserted: {g}")

        conn.close()
        print(f"\n✅ Hoàn thành! Shopee={s}, TikTok={t}, Lazada={l}, GHN={g}")
        print("   Chạy ETL để transform staging → OLTP → DW")

    except Exception as e:
        print(f"⚠️  Lỗi kết nối DB: {e}")
        print("   Dữ liệu đã được lưu vào JSON files.")


if __name__ == "__main__":
    main()
