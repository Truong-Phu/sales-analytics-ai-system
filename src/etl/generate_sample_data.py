#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_sample_data.py
Tạo dữ liệu mẫu chuẩn cho hệ thống MSAS.

Kết quả: JSON files trong docs/sample-data/
  shopee/ → shopee_orders_2024_q3.json, q4.json, 2025_q1.json, products.json
  tiktok/ → tiktok_orders_2024_q4.json, 2025_q1.json, products.json
  lazada/ → lazada_orders_2024_q4.json, 2025_q1.json, products.json

Chạy: python generate_sample_data.py
"""

import json
import math
import os
import random
from datetime import datetime, timedelta, timezone

random.seed(42)

# ── Đường dẫn output ─────────────────────────────────────────────────────────
BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sample-data")
SHOPEE_DIR = os.path.join(BASE_DIR, "shopee")
TIKTOK_DIR = os.path.join(BASE_DIR, "tiktok")
LAZADA_DIR = os.path.join(BASE_DIR, "lazada")

for d in [SHOPEE_DIR, TIKTOK_DIR, LAZADA_DIR]:
    os.makedirs(d, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# 1. DANH SÁCH SẢN PHẨM (30 SP — Thời trang & Phụ kiện)
# ══════════════════════════════════════════════════════════════════════════════

PRODUCTS = [
    # --- Thời trang nam (8 SP) ---
    {
        "sku": "AT-NAM-001", "name": "Áo thun nam basic cotton 100%",
        "desc": "Chất liệu cotton 100% thoáng mát, phù hợp mọi dịp",
        "base_price": 250000, "sale_price": 220000, "cost": 90000,
        "category": "Thời trang nam", "sub": "Áo nam", "stock": 500,
        "top_seller": False, "weight": "0.3",
        "variants": [("Trắng","S"),("Trắng","M"),("Trắng","L"),("Trắng","XL"),
                     ("Đen","S"),("Đen","M"),("Đen","L"),("Đen","XL"),
                     ("Xám","M"),("Xám","L"),("Navy","M"),("Navy","L")],
    },
    {
        "sku": "AT-NAM-002", "name": "Áo thun nam polo cotton pique",
        "desc": "Áo polo nam cổ bẻ, chất cotton pique cao cấp",
        "base_price": 380000, "sale_price": 350000, "cost": 155000,
        "category": "Thời trang nam", "sub": "Áo nam", "stock": 300,
        "top_seller": False, "weight": "0.35",
        "variants": [("Trắng","M"),("Trắng","L"),("Đen","M"),("Đen","L"),
                     ("Navy","M"),("Navy","L"),("Xanh lá","M"),("Xanh lá","L")],
    },
    {
        "sku": "AT-NAM-003", "name": "Áo sơ mi nam cổ button-down kẻ sọc",
        "desc": "Áo sơ mi công sở chất liệu linen thoáng mát",
        "base_price": 480000, "sale_price": 430000, "cost": 190000,
        "category": "Thời trang nam", "sub": "Áo nam", "stock": 200,
        "top_seller": False, "weight": "0.4",
        "variants": [("Trắng","M"),("Trắng","L"),("Trắng","XL"),
                     ("Xanh dương","M"),("Xanh dương","L"),("Hồng nhạt","M"),("Hồng nhạt","L")],
    },
    {
        "sku": "QJ-NAM-001", "name": "Quần jean nam slim fit co giãn",
        "desc": "Denim cao cấp, form slim fit tôn dáng, co giãn 4 chiều",
        "base_price": 550000, "sale_price": 490000, "cost": 220000,
        "category": "Thời trang nam", "sub": "Quần nam", "stock": 400,
        "top_seller": True, "weight": "0.6",
        "variants": [("Xanh đậm","29"),("Xanh đậm","30"),("Xanh đậm","31"),("Xanh đậm","32"),
                     ("Đen","29"),("Đen","30"),("Đen","31"),("Đen","32"),
                     ("Xanh nhạt","30"),("Xanh nhạt","31")],
    },
    {
        "sku": "QJ-NAM-002", "name": "Quần jean nam straight fit basic",
        "desc": "Form thẳng cổ điển, chất denim bền đẹp",
        "base_price": 520000, "sale_price": 460000, "cost": 205000,
        "category": "Thời trang nam", "sub": "Quần nam", "stock": 350,
        "top_seller": False, "weight": "0.6",
        "variants": [("Xanh đậm","29"),("Xanh đậm","30"),("Xanh đậm","31"),("Xanh đậm","32"),
                     ("Đen","30"),("Đen","31"),("Đen","32")],
    },
    {
        "sku": "QD-NAM-001", "name": "Quần đùi nam thể thao thun lạnh",
        "desc": "Chất thun lạnh mát mẻ, phù hợp gym và đi biển",
        "base_price": 180000, "sale_price": 160000, "cost": 65000,
        "category": "Thời trang nam", "sub": "Quần nam", "stock": 600,
        "top_seller": False, "weight": "0.25",
        "variants": [("Đen","M"),("Đen","L"),("Đen","XL"),
                     ("Xám","M"),("Xám","L"),("Navy","M"),("Navy","L")],
    },
    {
        "sku": "KAK-NAM-001", "name": "Quần kaki nam công sở slim",
        "desc": "Chất kaki Hàn Quốc, form công sở lịch sự",
        "base_price": 420000, "sale_price": 380000, "cost": 165000,
        "category": "Thời trang nam", "sub": "Quần nam", "stock": 250,
        "top_seller": False, "weight": "0.5",
        "variants": [("Be","29"),("Be","30"),("Be","31"),("Be","32"),
                     ("Đen","30"),("Đen","31"),("Xanh rêu","30"),("Xanh rêu","31")],
    },
    {
        "sku": "HOODIE-NAM-001", "name": "Áo hoodie unisex nỉ bông dày",
        "desc": "Nỉ bông dày ấm, mũ 2 lớp, túi kangaroo",
        "base_price": 580000, "sale_price": 520000, "cost": 230000,
        "category": "Thời trang nam", "sub": "Áo nam", "stock": 300,
        "top_seller": True, "weight": "0.7",
        "variants": [("Đen","S"),("Đen","M"),("Đen","L"),("Đen","XL"),
                     ("Trắng","M"),("Trắng","L"),("Xám","M"),("Xám","L"),("Xám","XL")],
    },
    # --- Thời trang nữ (10 SP) ---
    {
        "sku": "AT-NU-001", "name": "Áo thun nữ basic cotton form rộng",
        "desc": "Form rộng oversize, chất cotton mềm mại",
        "base_price": 220000, "sale_price": 195000, "cost": 80000,
        "category": "Thời trang nữ", "sub": "Áo nữ", "stock": 500,
        "top_seller": False, "weight": "0.25",
        "variants": [("Trắng","S"),("Trắng","M"),("Trắng","L"),
                     ("Đen","S"),("Đen","M"),("Đen","L"),
                     ("Hồng","S"),("Hồng","M"),("Be","M"),("Be","L")],
    },
    {
        "sku": "AT-NU-002", "name": "Áo croptop nữ cotton thêu hoa",
        "desc": "Croptop tay ngắn thêu hoa nhỏ nhắn, dễ thương",
        "base_price": 185000, "sale_price": 165000, "cost": 65000,
        "category": "Thời trang nữ", "sub": "Áo nữ", "stock": 400,
        "top_seller": False, "weight": "0.2",
        "variants": [("Trắng","S"),("Trắng","M"),("Hồng","S"),("Hồng","M"),
                     ("Vàng","S"),("Vàng","M"),("Xanh mint","S"),("Xanh mint","M")],
    },
    {
        "sku": "AT-NU-003", "name": "Áo sơ mi nữ linen cổ V tay dài",
        "desc": "Linen tự nhiên mát mẻ, phong cách công sở thanh lịch",
        "base_price": 380000, "sale_price": 340000, "cost": 150000,
        "category": "Thời trang nữ", "sub": "Áo nữ", "stock": 250,
        "top_seller": False, "weight": "0.35",
        "variants": [("Trắng","S"),("Trắng","M"),("Trắng","L"),
                     ("Be","S"),("Be","M"),("Be","L"),
                     ("Xanh dương nhạt","M"),("Xanh dương nhạt","L")],
    },
    {
        "sku": "QJ-NU-001", "name": "Quần jean nữ ống rộng thời trang",
        "desc": "Denim ống suông rộng, cao cấp, phong cách Y2K",
        "base_price": 450000, "sale_price": 390000, "cost": 175000,
        "category": "Thời trang nữ", "sub": "Quần nữ", "stock": 350,
        "top_seller": True, "weight": "0.55",
        "variants": [("Xanh đậm","26"),("Xanh đậm","27"),("Xanh đậm","28"),("Xanh đậm","29"),
                     ("Đen","26"),("Đen","27"),("Đen","28"),
                     ("Xanh nhạt","27"),("Xanh nhạt","28")],
    },
    {
        "sku": "QJ-NU-002", "name": "Quần jean nữ skinny co giãn cao eo",
        "desc": "Skinny jeans cao eo ôm dáng, co giãn 4 chiều",
        "base_price": 390000, "sale_price": 350000, "cost": 155000,
        "category": "Thời trang nữ", "sub": "Quần nữ", "stock": 300,
        "top_seller": False, "weight": "0.5",
        "variants": [("Xanh đậm","25"),("Xanh đậm","26"),("Xanh đậm","27"),("Xanh đậm","28"),
                     ("Đen","25"),("Đen","26"),("Đen","27"),("Đen","28")],
    },
    {
        "sku": "DAM-001", "name": "Đầm maxi boho thêu hoa mùa hè",
        "desc": "Vải lụa Thái mềm nhẹ, thêu hoa boho độc đáo, dài chạm đất",
        "base_price": 680000, "sale_price": 580000, "cost": 270000,
        "category": "Thời trang nữ", "sub": "Đầm & Váy", "stock": 200,
        "top_seller": True, "weight": "0.5",
        "variants": [("Trắng","S"),("Trắng","M"),("Trắng","L"),
                     ("Xanh dương","S"),("Xanh dương","M"),("Xanh dương","L"),
                     ("Hồng","M"),("Hồng","L")],
    },
    {
        "sku": "DAM-002", "name": "Đầm công sở midi tay lỡ cổ V",
        "desc": "Vải taft bóng, form A-line công sở thanh lịch, dài đến bắp chân",
        "base_price": 580000, "sale_price": 500000, "cost": 225000,
        "category": "Thời trang nữ", "sub": "Đầm & Váy", "stock": 180,
        "top_seller": False, "weight": "0.45",
        "variants": [("Đen","S"),("Đen","M"),("Đen","L"),
                     ("Navy","S"),("Navy","M"),("Navy","L"),
                     ("Đỏ đô","M"),("Đỏ đô","L")],
    },
    {
        "sku": "DAM-003", "name": "Đầm babydoll hoa nhí tay phồng",
        "desc": "Vải voan hoa nhí nhẹ nhàng, tay phồng nữ tính",
        "base_price": 420000, "sale_price": 370000, "cost": 160000,
        "category": "Thời trang nữ", "sub": "Đầm & Váy", "stock": 250,
        "top_seller": False, "weight": "0.35",
        "variants": [("Hồng","S"),("Hồng","M"),("Hồng","L"),
                     ("Trắng","S"),("Trắng","M"),("Xanh mint","S"),("Xanh mint","M")],
    },
    {
        "sku": "VAY-001", "name": "Váy wrap midi satin bóng",
        "desc": "Váy quấn dây buộc, vải satin bóng mượt, dài midi",
        "base_price": 480000, "sale_price": 420000, "cost": 185000,
        "category": "Thời trang nữ", "sub": "Đầm & Váy", "stock": 200,
        "top_seller": False, "weight": "0.4",
        "variants": [("Đen","S"),("Đen","M"),("Đen","L"),
                     ("Be","S"),("Be","M"),("Xanh lá","S"),("Xanh lá","M")],
    },
    {
        "sku": "VAY-002", "name": "Chân váy jean ống suông midi",
        "desc": "Denim ống suông midi vintage, có khuy cài trước",
        "base_price": 360000, "sale_price": 320000, "cost": 130000,
        "category": "Thời trang nữ", "sub": "Đầm & Váy", "stock": 280,
        "top_seller": False, "weight": "0.45",
        "variants": [("Xanh đậm","25"),("Xanh đậm","26"),("Xanh đậm","27"),("Xanh đậm","28"),
                     ("Đen","25"),("Đen","26"),("Đen","27"),
                     ("Xanh nhạt","26"),("Xanh nhạt","27")],
    },
    # --- Giày dép (5 SP) ---
    {
        "sku": "GIAY-NAM-001", "name": "Giày sneaker nam da PU đế êm",
        "desc": "Sneaker casual phong cách Hàn Quốc, đế foam êm ái",
        "base_price": 780000, "sale_price": 680000, "cost": 310000,
        "category": "Giày dép", "sub": "Giày dép", "stock": 150,
        "top_seller": True, "weight": "0.8",
        "variants": [("Trắng","39"),("Trắng","40"),("Trắng","41"),("Trắng","42"),("Trắng","43"),
                     ("Đen","39"),("Đen","40"),("Đen","41"),("Đen","42"),("Đen","43")],
    },
    {
        "sku": "GIAY-NU-001", "name": "Giày cao gót nữ mũi nhọn 7cm",
        "desc": "Gót nhọn 7cm, vải lụa bóng, sang trọng dự tiệc",
        "base_price": 650000, "sale_price": 560000, "cost": 250000,
        "category": "Giày dép", "sub": "Giày dép", "stock": 120,
        "top_seller": False, "weight": "0.6",
        "variants": [("Đen","35"),("Đen","36"),("Đen","37"),("Đen","38"),
                     ("Be","35"),("Be","36"),("Be","37"),("Be","38"),
                     ("Đỏ","36"),("Đỏ","37")],
    },
    {
        "sku": "DEP-001", "name": "Dép quai hậu da thật unisex",
        "desc": "Da bò thật, đế cao su non chống trơn, bền bỉ",
        "base_price": 320000, "sale_price": 280000, "cost": 110000,
        "category": "Giày dép", "sub": "Giày dép", "stock": 300,
        "top_seller": False, "weight": "0.5",
        "variants": [("Nâu","37"),("Nâu","38"),("Nâu","39"),("Nâu","40"),("Nâu","41"),
                     ("Đen","37"),("Đen","38"),("Đen","39"),("Đen","40"),("Đen","41")],
    },
    {
        "sku": "SLIP-001", "name": "Giày slip-on vải canvas unisex",
        "desc": "Canvas nhẹ, đế bằng, dễ mang tháo, unisex",
        "base_price": 480000, "sale_price": 420000, "cost": 185000,
        "category": "Giày dép", "sub": "Giày dép", "stock": 200,
        "top_seller": False, "weight": "0.55",
        "variants": [("Trắng","36"),("Trắng","37"),("Trắng","38"),("Trắng","39"),("Trắng","40"),
                     ("Đen","36"),("Đen","37"),("Đen","38"),("Đen","39"),("Đen","40")],
    },
    {
        "sku": "BOOT-NU-001", "name": "Boot cổ ngắn nữ da PU gót block",
        "desc": "Cổ ngắn mắt cá, gót block 4cm, kéo khóa sau",
        "base_price": 920000, "sale_price": 780000, "cost": 370000,
        "category": "Giày dép", "sub": "Giày dép", "stock": 100,
        "top_seller": False, "weight": "0.9",
        "high_return": True,   # 25% tỷ lệ hoàn (sản phẩm lỗi size)
        "variants": [("Đen","35"),("Đen","36"),("Đen","37"),("Đen","38"),
                     ("Nâu","35"),("Nâu","36"),("Nâu","37"),("Nâu","38")],
    },
    # --- Túi xách & Ba lô (5 SP) ---
    {
        "sku": "TUI-TOTE-001", "name": "Túi tote canvas size lớn",
        "desc": "Canvas dày, quai da, đựng vừa A4 + laptop 13 inch",
        "base_price": 320000, "sale_price": 280000, "cost": 110000,
        "category": "Túi xách & Ba lô", "sub": "Túi xách & Ba lô", "stock": 400,
        "top_seller": False, "weight": "0.4",
        "variants": [("Kem","Free"),("Đen","Free"),("Xanh dương","Free"),("Be","Free")],
    },
    {
        "sku": "TUI-XACH-001", "name": "Túi xách da PU công sở tay cầm",
        "desc": "Da PU cao cấp, 3 ngăn rộng rãi, kèm dây đeo chéo",
        "base_price": 750000, "sale_price": 630000, "cost": 290000,
        "category": "Túi xách & Ba lô", "sub": "Túi xách & Ba lô", "stock": 180,
        "top_seller": True, "weight": "0.6",
        "variants": [("Đen","Free"),("Nâu","Free"),("Be","Free"),("Trắng kem","Free")],
    },
    {
        "sku": "TUI-DEO-001", "name": "Túi đeo chéo mini da PU nắp gập",
        "desc": "Size mini xinh xắn, đeo chéo hoặc tay, da PU mềm",
        "base_price": 380000, "sale_price": 340000, "cost": 140000,
        "category": "Túi xách & Ba lô", "sub": "Túi xách & Ba lô", "stock": 300,
        "top_seller": False, "weight": "0.35",
        "variants": [("Đen","Free"),("Trắng","Free"),("Hồng","Free"),("Xanh mint","Free"),("Nâu","Free")],
    },
    {
        "sku": "BA-LO-001", "name": "Balo thể thao unisex chống nước",
        "desc": "Vải Oxford chống nước, ngăn laptop 15.6 inch, nhẹ nhàng",
        "base_price": 550000, "sale_price": 480000, "cost": 210000,
        "category": "Túi xách & Ba lô", "sub": "Túi xách & Ba lô", "stock": 250,
        "top_seller": True, "weight": "0.7",
        "variants": [("Đen","Free"),("Xám","Free"),("Navy","Free"),("Xanh dương","Free")],
    },
    {
        "sku": "CLUTCH-001", "name": "Ví clutch dự tiệc sequin lấp lánh",
        "desc": "Sequin lấp lánh, dây xích mỏng, vừa điện thoại + son",
        "base_price": 420000, "sale_price": 370000, "cost": 160000,
        "category": "Túi xách & Ba lô", "sub": "Túi xách & Ba lô", "stock": 150,
        "top_seller": False, "weight": "0.3",
        "variants": [("Vàng","Free"),("Bạc","Free"),("Đen","Free"),("Hồng","Free")],
    },
    # --- Phụ kiện thời trang (2 SP) ---
    {
        "sku": "VONG-001", "name": "Vòng tay đan thủ công hạt gỗ",
        "desc": "Hạt gỗ thơm tự nhiên đan tay, nhiều màu sắc",
        "base_price": 190000, "sale_price": 160000, "cost": 55000,
        "category": "Phụ kiện thời trang", "sub": "Phụ kiện thời trang", "stock": 500,
        "top_seller": False, "weight": "0.1",
        "variants": [("Nâu","Free"),("Trắng","Free"),("Đen","Free"),("Đỏ","Free")],
    },
    {
        "sku": "MU-001", "name": "Mũ bucket vải canvas thêu logo",
        "desc": "Canvas dày, thêu logo nhỏ, nhiều màu thời trang",
        "base_price": 230000, "sale_price": 200000, "cost": 75000,
        "category": "Phụ kiện thời trang", "sub": "Phụ kiện thời trang", "stock": 400,
        "top_seller": False, "weight": "0.15",
        "variants": [("Đen","Free"),("Trắng","Free"),("Be","Free"),("Hồng","Free"),("Navy","Free")],
    },
]

# SKU tra cứu nhanh
SKU_MAP = {p["sku"]: p for p in PRODUCTS}

# Sản phẩm bán chạy (top sellers — tạo Pareto 80/20)
TOP_SKUS = [p["sku"] for p in PRODUCTS if p.get("top_seller")]
# → QJ-NAM-001, HOODIE-NAM-001, QJ-NU-001, DAM-001, GIAY-NAM-001, TUI-XACH-001, BA-LO-001

# Shopee: 30 products (tất cả)
SHOPEE_SKUS = [p["sku"] for p in PRODUCTS]
# TikTok: 20 products
TIKTOK_SKUS = [
    "AT-NAM-001","AT-NAM-002","QJ-NAM-001","QJ-NAM-002","HOODIE-NAM-001",
    "AT-NU-001","AT-NU-002","QJ-NU-001","QJ-NU-002","DAM-001","DAM-002","DAM-003",
    "GIAY-NAM-001","GIAY-NU-001","DEP-001",
    "TUI-TOTE-001","TUI-XACH-001","TUI-DEO-001","BA-LO-001",
    "MU-001",
]
# Lazada: 20 products (overlap + một số khác)
LAZADA_SKUS = [
    "AT-NAM-001","AT-NAM-003","QJ-NAM-001","QJ-NAM-002","KAK-NAM-001",
    "AT-NU-001","AT-NU-003","QJ-NU-001","DAM-001","DAM-002","VAY-001","VAY-002",
    "GIAY-NAM-001","GIAY-NU-001","BOOT-NU-001","SLIP-001",
    "TUI-XACH-001","BA-LO-001","CLUTCH-001",
    "VONG-001",
]


# ══════════════════════════════════════════════════════════════════════════════
# 2. DỮ LIỆU KHÁCH HÀNG (200 khách)
# ══════════════════════════════════════════════════════════════════════════════

HO = ["Nguyễn","Trần","Lê","Phạm","Hoàng","Vũ","Đặng","Bùi","Đỗ","Hồ",
      "Ngô","Dương","Lý","Đinh","Phan","Tô","Mai","Võ","Hà","Cao"]

TEN_NAM = ["Văn An","Văn Hùng","Văn Minh","Đức Long","Thanh Tú","Quang Huy",
           "Trọng Nghĩa","Minh Khôi","Hoàng Nam","Tiến Đạt","Mạnh Hưng",
           "Quốc Bảo","Xuân Trường","Hữu Phúc","Thành Đô","Anh Dũng"]

TEN_NU = ["Thị Mai","Thị Lan","Thị Hoa","Thị Thu","Thị Nga","Thị Bích",
          "Thị Linh","Thị Tuyết","Thị Hằng","Thị Phương","Thị Hương",
          "Kiều Trinh","Bảo Châu","Ngọc Hà","Thanh Thủy","Mỹ Linh"]

PROVINCES = {
    "TP. Hồ Chí Minh": {
        "weight": 0.38,
        "districts": ["Quận 1","Quận 3","Quận 5","Quận 7","Quận 10",
                       "Quận 11","Quận 12","Bình Thạnh","Tân Bình",
                       "Gò Vấp","Phú Nhuận","Thủ Đức"],
        "zip": "700000",
    },
    "Hà Nội": {
        "weight": 0.25,
        "districts": ["Hoàn Kiếm","Đống Đa","Cầu Giấy","Long Biên",
                       "Nam Từ Liêm","Hoàng Mai","Thanh Xuân","Ba Đình"],
        "zip": "100000",
    },
    "Đà Nẵng": {
        "weight": 0.08,
        "districts": ["Hải Châu","Thanh Khê","Sơn Trà","Ngũ Hành Sơn"],
        "zip": "550000",
    },
    "Cần Thơ": {
        "weight": 0.05,
        "districts": ["Ninh Kiều","Bình Thủy","Cái Răng"],
        "zip": "900000",
    },
    "Hải Phòng": {
        "weight": 0.05,
        "districts": ["Lê Chân","Hồng Bàng","Ngô Quyền"],
        "zip": "180000",
    },
    "Bình Dương": {
        "weight": 0.05,
        "districts": ["Thuận An","Dĩ An","Thủ Dầu Một"],
        "zip": "820000",
    },
    "Đồng Nai": {
        "weight": 0.04,
        "districts": ["Biên Hòa","Long Khánh"],
        "zip": "810000",
    },
    "Khánh Hòa": {
        "weight": 0.03,
        "districts": ["Nha Trang","Cam Ranh"],
        "zip": "650000",
    },
    "Thừa Thiên Huế": {
        "weight": 0.03,
        "districts": ["TP. Huế","Phú Vang"],
        "zip": "530000",
    },
    "Bình Định": {
        "weight": 0.02,
        "districts": ["Quy Nhơn","An Nhơn"],
        "zip": "590000",
    },
    "Long An": {
        "weight": 0.02,
        "districts": ["Tân An","Bến Lức"],
        "zip": "850000",
    },
}

STREETS = ["Nguyễn Trãi","Lê Lợi","Trần Hưng Đạo","Điện Biên Phủ",
           "Nguyễn Huệ","Lý Thường Kiệt","Trường Chinh","Phạm Văn Đồng",
           "Nguyễn Văn Cừ","Hoàng Diệu","Võ Thị Sáu","Hai Bà Trưng",
           "Bà Triệu","Lê Duẩn","Cách Mạng Tháng 8"]


def _random_province():
    provs = list(PROVINCES.keys())
    weights = [PROVINCES[p]["weight"] for p in provs]
    return random.choices(provs, weights=weights, k=1)[0]


def _make_customer(idx):
    gender = random.choice(["M", "F"])
    ho = random.choice(HO)
    ten = random.choice(TEN_NAM if gender == "M" else TEN_NU)
    full_name = f"{ho} {ten}"
    prov = _random_province()
    district = random.choice(PROVINCES[prov]["districts"])
    phone = f"0{random.choice(['9','8','7','3','5'])}{random.randint(10000000,99999999)}"
    street_num = random.randint(1, 500)
    street = random.choice(STREETS)
    address = f"{street_num} {street}, {district}, {prov}"
    username = (ho.lower().replace(" ","") + "_" +
                ten.split()[-1].lower().replace("đ","d").replace("ă","a")
                                      .replace("â","a").replace("ê","e")
                                      .replace("ô","o").replace("ơ","o")
                                      .replace("ư","u").replace("ị","i")
                                      .replace("ộ","o").replace("ọ","o")
                                      .replace("ừ","u").replace("ứ","u")
                                      .replace("ả","a").replace("ắ","a")
                                      .replace("ẹ","e").replace("ế","e")
                                      .replace("ữ","u").replace("ỳ","y")
                + f"_{idx:03d}")
    return {
        "full_name": full_name,
        "username": username,
        "phone": phone,
        "province": prov,
        "district": district,
        "address": address,
        "zip": PROVINCES[prov]["zip"],
        "gender": gender,
    }


CUSTOMERS = [_make_customer(i) for i in range(1, 221)]


# ══════════════════════════════════════════════════════════════════════════════
# 3. HÀM TIỆN ÍCH
# ══════════════════════════════════════════════════════════════════════════════

def _ts(dt: datetime) -> int:
    """datetime → Unix timestamp (giây)."""
    return int(dt.replace(tzinfo=timezone.utc).timestamp())


def _date_range(start: datetime, end: datetime):
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, delta))


def _seasonal_weight(dt: datetime) -> float:
    """Trọng số theo mùa — doanh thu thực tế Việt Nam."""
    m = dt.month
    weights = {7: 0.7, 8: 0.8, 9: 0.75, 10: 0.9, 11: 1.25, 12: 1.5,
               1: 0.65, 2: 0.85, 3: 1.0}
    return weights.get(m, 1.0)


def _pick_product(skus, is_top_seller_bias=True):
    """Chọn sản phẩm theo phân phối Pareto (20% = 80%)."""
    top = [s for s in skus if s in TOP_SKUS]
    other = [s for s in skus if s not in TOP_SKUS]
    if is_top_seller_bias and top:
        if random.random() < 0.80:
            return random.choice(top)
    return random.choice(other if other else skus)


def _payment_method(channel="shopee"):
    """Phân phối phương thức thanh toán theo kênh."""
    r = random.random()
    if channel == "shopee":
        if r < 0.60: return "COD"
        if r < 0.85: return "VNPAY"
        return "MOMO"
    if channel == "tiktok":
        if r < 0.55: return "COD"
        if r < 0.80: return "VNPay"
        return "Ví MoMo"
    # lazada
    if r < 0.60: return "CashOnDelivery"
    if r < 0.82: return "VirtualAccount"
    return "MobileWallet"


def _order_status(channel, dt, sku, is_flash_sale_day=False):
    """Trạng thái đơn hàng theo kênh và ngày."""
    r = random.random()
    # Sản phẩm lỗi (BOOT-NU-001) tỷ lệ hoàn cao 25%
    if sku == "BOOT-NU-001":
        r2 = random.random()
        if r2 < 0.25:
            if channel == "shopee": return "RETURN_REFUND"
            if channel == "tiktok": return 122  # Delivered (returned)
            return "returned"
    if channel == "shopee":
        if r < 0.70: return "COMPLETED"
        if r < 0.85: return "SHIPPED"
        if r < 0.93: return "CANCELLED"
        return "RETURN_REFUND"
    if channel == "tiktok":
        if r < 0.75: return 105   # COMPLETED
        if r < 0.90: return 121   # IN_TRANSIT
        if r < 0.95: return 106   # CANCELLED
        return 122                 # Delivered (then returned)
    # lazada
    if r < 0.70: return "delivered"
    if r < 0.83: return "shipped"
    if r < 0.93: return "cancelled"
    return "returned"


def _pick_customer(retention_pool, all_customers):
    """30% khách hàng quay lại (retention)."""
    if retention_pool and random.random() < 0.30:
        return random.choice(retention_pool)
    c = random.choice(all_customers)
    if c not in retention_pool:
        retention_pool.append(c)
    return c


def _generate_dates_for_period(start: datetime, end: datetime,
                               count: int, flash_sale_date=None,
                               tiktok_drop_start=None):
    """Tạo danh sách ngày cho count đơn hàng trong khoảng thời gian."""
    dates = []
    delta_days = (end - start).days

    # Phân bổ theo seasonal weight
    day_list = [start + timedelta(days=d) for d in range(delta_days + 1)]
    day_weights = [_seasonal_weight(d) for d in day_list]

    # Flash sale 11/11: tăng 300% (thêm 8 đơn trong 1 ngày)
    if flash_sale_date:
        for i, d in enumerate(day_list):
            if d.date() == flash_sale_date.date():
                day_weights[i] *= 4.0  # 300% tăng → weight x4

    # TikTok drop tuần 13-19/1/2025: giảm 40%
    if tiktok_drop_start:
        drop_end = tiktok_drop_start + timedelta(days=6)
        for i, d in enumerate(day_list):
            if tiktok_drop_start.date() <= d.date() <= drop_end.date():
                day_weights[i] *= 0.60  # giảm 40%

    total_w = sum(day_weights)
    day_weights = [w / total_w for w in day_weights]
    chosen_days = random.choices(day_list, weights=day_weights, k=count)
    for d in chosen_days:
        hour = random.randint(7, 22)
        minute = random.randint(0, 59)
        dates.append(d.replace(hour=hour, minute=minute, second=random.randint(0,59)))
    return sorted(dates)


# ══════════════════════════════════════════════════════════════════════════════
# 4. TẠO DỮ LIỆU SHOPEE
# ══════════════════════════════════════════════════════════════════════════════

def _shopee_order(order_num, dt, customer, sku, status):
    prod = SKU_MAP[sku]
    variant = random.choice(prod["variants"])
    color, size = variant
    model_sku = f"{sku}-{color.upper().replace(' ','-')[:6]}-{size}"
    qty = random.choices([1, 2, 3], weights=[0.70, 0.25, 0.05], k=1)[0]
    orig_price = prod["base_price"]
    disc_price = prod["sale_price"]
    shipping_fee_est = random.choice([25000, 30000, 35000])
    shipping_fee_act = random.choice([25000, 30000])
    total = disc_price * qty + shipping_fee_act
    payment = _payment_method("shopee")
    carrier = random.choice(["SPX Express", "GHN", "GHTK", "J&T Express"])

    # Mã đơn hàng kiểu Shopee: YYMMDD + 4 ký tự alpha + 4 chữ số
    alpha = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ', k=4))
    digits = f"{random.randint(1000,9999)}"
    order_sn = dt.strftime("%y%m%d") + alpha + digits

    item_id = 100000 + SHOPEE_SKUS.index(sku) * 100 + 1
    model_id = 200000 + SHOPEE_SKUS.index(sku) * 100 + hash(model_sku) % 50

    update_dt = dt + timedelta(hours=random.randint(24, 96))
    ship_date = dt + timedelta(days=random.randint(1, 3))

    cancel_reason = ""
    if status == "CANCELLED":
        cancel_reason = random.choice([
            "Buyer cancelled order",
            "Out of stock",
            "Seller cannot fulfil",
        ])
    return_reason = ""
    if status == "RETURN_REFUND":
        return_reason = random.choice([
            "Product not as described",
            "Wrong size delivered",
            "Defective product",
        ])

    tracking = f"SPX{random.randint(100000000, 999999999)}" if status not in ["CANCELLED","UNPAID"] else ""

    return {
        "order_sn": order_sn,
        "order_status": status,
        "create_time": _ts(dt),
        "update_time": _ts(update_dt),
        "days_to_ship": 2,
        "ship_by_date": _ts(ship_date),
        "buyer_username": customer["username"],
        "buyer_user_id": random.randint(100000000, 999999999),
        "estimated_shipping_fee": shipping_fee_est,
        "actual_shipping_fee": shipping_fee_act,
        "total_amount": str(total),
        "payment_method": payment,
        "shipping_carrier": carrier,
        "cancel_reason": cancel_reason,
        "return_reason": return_reason,
        "note": "",
        "item_list": [
            {
                "item_id": item_id,
                "item_name": prod["name"],
                "item_sku": sku,
                "model_id": model_id,
                "model_name": f"{color} - {size}",
                "model_sku": model_sku,
                "model_quantity_purchased": qty,
                "model_original_price": str(orig_price),
                "model_discounted_price": str(disc_price),
                "wholesale": False,
                "weight": prod["weight"],
                "add_on_deal": False,
                "main_item": True,
                "order_item_id": random.randint(300000, 399999),
                "promotion_type": "",
                "promotion_id": 0,
                "image_info": {
                    "image_url": f"https://example.com/shopee/{sku.lower()}.jpg"
                },
            }
        ],
        "recipient_address": {
            "name": customer["full_name"],
            "phone": customer["phone"],
            "town": f"Phường {random.randint(1,15)}",
            "district": customer["district"],
            "city": customer["province"],
            "state": "",
            "region": "VN",
            "zipcode": customer["zip"],
            "full_address": customer["address"],
        },
        "package_list": [
            {
                "package_number": tracking,
                "logistics_status": "LOGISTICS_DELIVERY_DONE" if status == "COMPLETED" else "LOGISTICS_REQUEST_CREATED",
                "shipping_carrier": carrier,
                "tracking_number": tracking,
                "item_list": [{"item_id": item_id, "model_id": model_id, "quantity": qty}],
            }
        ] if status not in ["CANCELLED"] else [],
        "invoice_data": None,
        "checkout_shipping_carrier": carrier,
        "reverse_shipping_fee": 0,
        "actual_shipping_fee_confirmed": True,
        "buyer_cpf_id": "",
    }


def generate_shopee_orders(skus, start, end, count,
                           flash_sale_date=None, tiktok_drop=None):
    retention = []
    dates = _generate_dates_for_period(start, end, count,
                                       flash_sale_date=flash_sale_date)
    orders = []
    for i, dt in enumerate(dates):
        sku = _pick_product(skus)
        cust = _pick_customer(retention, CUSTOMERS)
        status = _order_status("shopee", dt, sku)
        orders.append(_shopee_order(i + 1, dt, cust, sku, status))
    return {"orders": orders}


def _shopee_product(p):
    item_id = 100000 + SHOPEE_SKUS.index(p["sku"]) * 100 + 1
    skus_list = []
    for color, size in p["variants"]:
        model_sku = f"{p['sku']}-{color.upper().replace(' ','-')[:6]}-{size}"
        skus_list.append({
            "model_id": 200000 + hash(model_sku) % 50000,
            "model_name": f"{color} - {size}",
            "model_sku": model_sku,
            "price_info": [{"currency":"VND","original_price":p["base_price"],"current_price":p["sale_price"]}],
            "stock_info_v2": {"summary_info": {"total_reserved_stock":random.randint(0,10),"total_available_stock":max(0,p["stock"]//len(p["variants"]))}},
        })
    return {
        "item_id": item_id,
        "category_id": 100644,
        "item_name": p["name"],
        "description": p["desc"],
        "item_sku": p["sku"],
        "create_time": _ts(datetime(2024, 1, 1)),
        "update_time": _ts(datetime(2024, 10, 1)),
        "price_info": [{"currency":"VND","original_price":p["base_price"],"current_price":p["sale_price"]}],
        "stock_info_v2": {"summary_info": {"total_reserved_stock":random.randint(0,20),"total_available_stock":p["stock"]}},
        "image": {"image_url_list": [f"https://example.com/shopee/{p['sku'].lower()}-1.jpg",f"https://example.com/shopee/{p['sku'].lower()}-2.jpg"]},
        "weight": p["weight"],
        "dimension": {"package_length":30,"package_width":25,"package_height":5},
        "logistic_info": [{"logistic_id":10002,"logistic_name":"SPX Express","enabled":True,"shipping_fee":25000,"is_free":False}],
        "pre_order": {"is_pre_order":False,"days_to_ship":2},
        "condition": "NEW",
        "item_status": "NORMAL",
        "has_model": len(p["variants"]) > 1,
        "promotion_id": 0,
        "video_info": [],
        "brand": {"brand_id":0,"original_brand_name":"PhuThinh Fashion"},
        "item_dangerous": 0,
        "complaint_policy": {"warranty_time":"30 ngày","warranty_type":"SELLER","description":"Đổi trả trong 30 ngày nếu lỗi nhà sản xuất"},
        "models": skus_list,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 5. TẠO DỮ LIỆU TIKTOK SHOP
# ══════════════════════════════════════════════════════════════════════════════

def _tiktok_order(order_num, dt, customer, sku, status):
    prod = SKU_MAP[sku]
    variant = random.choice(prod["variants"])
    color, size = variant
    seller_sku = f"{sku}-{color.upper().replace(' ','-')[:6]}-{size}"
    qty = random.choices([1, 2], weights=[0.80, 0.20], k=1)[0]
    orig_price = prod["base_price"]
    sale_price_unit = prod["sale_price"]
    seller_discount = random.choice([0, 20000, 30000, 50000])
    platform_discount = random.choice([0, 20000, 30000])
    shipping_orig = 30000
    shipping_platform_disc = random.choice([0, 30000])
    actual_shipping = max(0, shipping_orig - shipping_platform_disc)
    sub_total = sale_price_unit * qty - seller_discount - platform_discount
    total = sub_total + actual_shipping
    payment = _payment_method("tiktok")
    carrier = random.choice(["GHN", "GHTK", "J&T Express"])
    order_id = str(random.randint(500000000000000000, 599999999999999999))
    tracking = f"TTK{carrier.replace(' ','')[:3].upper()}{random.randint(100000000,999999999)}"

    status_desc = {105:"COMPLETED",121:"IN_TRANSIT",106:"CANCELLED",122:"RETURNED",
                   111:"AWAITING_SHIPMENT",100:"UNPAID"}.get(status, "COMPLETED")

    update_dt = dt + timedelta(hours=random.randint(24, 120))
    return {
        "order_id": order_id,
        "order_status": status,
        "order_status_desc": status_desc,
        "create_time": _ts(dt),
        "update_time": _ts(update_dt),
        "buyer_info": {
            "buyer_uid": str(random.randint(7000000000000000000, 7999999999999999999)),
            "buyer_nickname": customer["username"],
        },
        "recipient_address": {
            "name": customer["full_name"],
            "phone_number": customer["phone"],
            "address_detail": customer["address"].split(",")[0],
            "district_info": {
                "address_level1": customer["province"],
                "address_level2": customer["district"],
                "address_level3": f"Phường {random.randint(1,12)}",
            },
            "postal_code": customer["zip"],
        },
        "payment_info": {
            "currency": "VND",
            "original_total_product_price": str(orig_price * qty),
            "seller_discount": str(seller_discount),
            "platform_discount": str(platform_discount),
            "shipping_fee_original": str(shipping_orig),
            "shipping_fee_seller_discount": "0",
            "shipping_fee_platform_discount": str(shipping_platform_disc),
            "actual_shipping_fee": str(actual_shipping),
            "sub_total": str(sub_total),
            "total_amount": str(total),
            "payment_method_name": payment,
        },
        "line_items": [
            {
                "item_id": str(random.randint(1700000000000000000, 1799999999999999999)),
                "product_name": prod["name"],
                "sku_id": str(random.randint(1700000000000000001, 1799999999999999999)),
                "seller_sku": seller_sku,
                "quantity": qty,
                "sale_price": str(sale_price_unit),
                "original_price": str(orig_price),
                "sku_image": f"https://example.com/tiktok/{sku.lower()}.jpg",
                "product_id": str(random.randint(1700000000000000000, 1799999999999999999)),
                "sku_name": f"{color} - {size}",
                "fulfillment_type": 1,
                "shipping_provider_name": carrier,
                "tracking_number": tracking if status not in [106,100] else "",
                "package_id": f"TTP{random.randint(100000000,999999999)}",
                "rtc_type": 0,
                "cancel_reason": "Buyer request" if status == 106 else "",
                "cancel_user": "buyer" if status == 106 else "",
            }
        ],
        "shipping_info": {
            "shipping_type": 2,
            "shipping_provider_name": carrier,
            "tracking_number": tracking if status not in [106,100] else "",
            "shipping_provider_id": "6002",
            "estimated_shipping_fee": str(shipping_orig),
            "actual_shipping_fee": str(actual_shipping),
            "return_tracking_number": "",
        },
    }


def generate_tiktok_orders(skus, start, end, count,
                           tiktok_drop_start=None):
    retention = []
    dates = _generate_dates_for_period(start, end, count,
                                       tiktok_drop_start=tiktok_drop_start)
    orders = []
    for i, dt in enumerate(dates):
        sku = _pick_product(skus)
        cust = _pick_customer(retention, CUSTOMERS)
        status = _order_status("tiktok", dt, sku)
        orders.append(_tiktok_order(i + 1, dt, cust, sku, status))
    return {"orders": orders}


def _tiktok_product(p):
    skus_list = []
    for color, size in p["variants"]:
        seller_sku = f"{p['sku']}-{color.upper().replace(' ','-')[:6]}-{size}"
        skus_list.append({
            "sku_id": str(random.randint(1700000000000000001, 1799999999999999999)),
            "seller_sku": seller_sku,
            "original_price": str(p["base_price"]),
            "sale_price": str(p["sale_price"]),
            "stock_infos": [{"warehouse_id":"0","available_stock":max(5, p["stock"]//len(p["variants"]))}],
            "sku_unit_count": 1,
            "sku_image": {"url_list":[f"https://example.com/tiktok/{p['sku'].lower()}.jpg"]},
            "sales_attributes": [
                {"attribute_id":"100089","attribute_name":"Màu sắc","value_id":str(hash(color)%1000+200),"value_name":color,"sku_img":None},
                {"attribute_id":"100090","attribute_name":"Kích thước","value_id":str(hash(size)%1000+300),"value_name":size,"sku_img":None},
            ],
        })
    return {
        "product_id": str(random.randint(1700000000000000000, 1799999999999999999)),
        "product_name": p["name"],
        "product_status": 4,
        "product_status_desc": "ACTIVATED",
        "seller_sku": p["sku"],
        "create_time": _ts(datetime(2024, 1, 1)),
        "update_time": _ts(datetime(2024, 10, 1)),
        "description": p["desc"],
        "category_list": [{"category_id":"601251","local_name":p["sub"]}],
        "brand": {"brand_id":"0","brand_name":"PhuThinh Fashion"},
        "main_images": [{"url_list":[f"https://example.com/tiktok/{p['sku'].lower()}.jpg"]}],
        "skus": skus_list,
        "video": None,
        "certifications": [],
        "package_weight": p["weight"],
        "package_dimension": {"length":"30","width":"25","height":"5","unit":"CENTIMETER"},
        "is_cod_supported": True,
        "delivery_service_ids": ["GHN","GHTK"],
    }


# ══════════════════════════════════════════════════════════════════════════════
# 6. TẠO DỮ LIỆU LAZADA
# ══════════════════════════════════════════════════════════════════════════════

def _lazada_order(order_num, dt, customer, sku, status):
    prod = SKU_MAP[sku]
    variant = random.choice(prod["variants"])
    color, size = variant
    item_sku = f"{sku}-{color.upper().replace(' ','-')[:6]}-{size}"
    orig_price = prod["base_price"]
    paid_price = prod["sale_price"]
    seller_discount = orig_price - paid_price
    shipping_fee = random.choice([25000, 30000, 35000])
    total = paid_price + shipping_fee
    payment = _payment_method("lazada")
    carrier = "Lazada Logistics"
    order_id = random.randint(1000000000, 9999999999)
    tracking = f"LZD-VN-TRACK-{random.randint(100000,999999)}"

    created_str = dt.strftime("%Y-%m-%d %H:%M:%S +0700")
    updated_dt = dt + timedelta(hours=random.randint(24, 96))
    updated_str = updated_dt.strftime("%Y-%m-%d %H:%M:%S +0700")
    promise_str = (dt + timedelta(days=2)).strftime("%Y-%m-%d 23:59:59 +0700")

    reason = ""
    if status == "cancelled":
        reason = random.choice(["Buyer cancelled","Out of stock","Logistics issue"])

    first_name = customer["full_name"].split()[0]
    last_name = " ".join(customer["full_name"].split()[1:])

    return {
        "order_id": order_id,
        "order_number": f"LZD-{order_id}",
        "created_at": created_str,
        "updated_at": updated_str,
        "status": status,
        "address_updated_at": created_str,
        "address": {
            "address1": customer["address"].split(",")[0],
            "address2": customer["district"],
            "address3": "",
            "address4": "",
            "address5": "",
            "city": customer["province"],
            "ward": f"Phường {random.randint(1,15)}",
            "region": customer["province"],
            "zip": customer["zip"],
            "country": "Vietnam",
            "phone": customer["phone"],
            "phone2": "",
            "first_name": first_name,
            "last_name": last_name,
            "customer_email": f"{customer['username']}@gmail.com",
        },
        "national_registration_number": "",
        "payment_method": payment,
        "remarks": "",
        "delivery_info": "",
        "price": str(total),
        "gift_option": False,
        "gift_message": "",
        "voucher_platform": 0,
        "voucher": "0",
        "voucher_seller": "0",
        "shipping_fee": str(shipping_fee),
        "warehouse_code": "dropshipping",
        "order_flag": "DEFAULT",
        "global_order": False,
        "items": [
            {
                "order_item_id": random.randint(9000000000, 9999999999),
                "order_id": order_id,
                "package_id": f"MP-PKGVN{random.randint(100000,999999)}",
                "sku": item_sku,
                "shop_sku": f"{item_sku}_VN",
                "shippment_provider": carrier,
                "is_fbl": False,
                "name": f"{prod['name']} - {color} - {size}",
                "variation": f"{color};{size}",
                "shop_id": 1234,
                "order_type": "Normal",
                "reason": reason,
                "reason_detail": reason,
                "purchase_order_id": "",
                "purchase_order_number": "",
                "package_number": f"MP-PKGVN{random.randint(100000,999999)}",
                "promise_shipping_time": promise_str,
                "shipping_provider_type": "standard",
                "created_at": created_str,
                "updated_at": updated_str,
                "paid_price": str(paid_price),
                "unit_price": str(orig_price),
                "seller_discount_total": str(seller_discount),
                "shipping_amount": str(shipping_fee),
                "tax_amount": "0",
                "coupon_amount": "0",
                "digital_delivery_info": "",
                "extra_attributes": "",
                "status": status,
                "product_main_image": f"https://example.com/lazada/{sku.lower()}.jpg",
                "voucher_amount": 0,
                "buyer_failed_delivery_return_initiator": "",
                "buyer_failed_delivery_reason": "",
                "voucher_code": "",
                "voucher_platform_amount": 0,
                "return_status": "returned" if status == "returned" else "",
                "invoice_number": "",
                "tracking_code": tracking if status not in ["cancelled","pending"] else "",
                "tracking_code_pre": "",
            }
        ],
    }


def generate_lazada_orders(skus, start, end, count):
    retention = []
    dates = _generate_dates_for_period(start, end, count)
    orders = []
    for i, dt in enumerate(dates):
        sku = _pick_product(skus)
        cust = _pick_customer(retention, CUSTOMERS)
        status = _order_status("lazada", dt, sku)
        orders.append(_lazada_order(i + 1, dt, cust, sku, status))
    return {"orders": orders}


def _lazada_product(p, idx):
    skus_list = []
    for color, size in p["variants"]:
        item_sku = f"{p['sku']}-{color.upper().replace(' ','-')[:6]}-{size}"
        skus_list.append({
            "SkuId": 600000 + idx * 100 + hash(item_sku) % 100,
            "SellerSku": item_sku,
            "color_family": color,
            "size": size,
            "price": p["base_price"],
            "special_price": p["sale_price"],
            "special_from_date": "2024-10-01 00:00:00",
            "special_to_date": "2025-03-31 23:59:59",
            "package_width": "30",
            "package_height": "5",
            "package_length": "35",
            "package_weight": p["weight"],
            "quantity": max(5, p["stock"] // len(p["variants"])),
            "Images": [f"https://example.com/lazada/{p['sku'].lower()}.jpg"],
            "Status": "active",
            "multiWarehouseInventories": [
                {"warehouseCode":"dropshipping","quantity":max(5, p["stock"]//len(p["variants"])),
                 "occupiedQuantity":0,"availableQuantity":max(5, p["stock"]//len(p["variants"])),
                 "sellableQuantity":max(5, p["stock"]//len(p["variants"]))}
            ],
        })
    return {
        "item_id": 500000 + idx,
        "primary_category": 10000892,
        "attributes": {
            "name": p["name"],
            "description": p["desc"],
            "brand": "PhuThinh Fashion",
            "model": p["sku"],
            "material": "Vải cao cấp",
            "color_family": p["variants"][0][0] if p["variants"] else "",
            "wash_care_instructions": "Giặt tay, không dùng chất tẩy mạnh",
            "SellerSku": p["sku"],
            "warranty_type": "Seller",
            "warranty": "30 ngày",
        },
        "skus": skus_list,
        "images": [
            f"https://example.com/lazada/{p['sku'].lower()}-1.jpg",
            f"https://example.com/lazada/{p['sku'].lower()}-2.jpg",
        ],
        "status": "active",
        "sub_status": "",
    }


# ══════════════════════════════════════════════════════════════════════════════
# 7. MAIN — Tạo tất cả files
# ══════════════════════════════════════════════════════════════════════════════

def save_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(path) // 1024
    print(f"  ✓ {os.path.basename(path)} ({size_kb} KB, {len(data.get('orders', data.get('items', data.get('products',[]))))} records)")


def main():
    print("═" * 55)
    print("MSAS — Tạo dữ liệu mẫu")
    print("═" * 55)

    # Khoảng thời gian
    q3_2024_start = datetime(2024, 7, 1)
    q3_2024_end   = datetime(2024, 9, 30, 23, 59, 59)
    q4_2024_start = datetime(2024, 10, 1)
    q4_2024_end   = datetime(2024, 12, 31, 23, 59, 59)
    q1_2025_start = datetime(2025, 1, 1)
    q1_2025_end   = datetime(2025, 3, 31, 23, 59, 59)

    # Ngày bất thường
    flash_sale_day   = datetime(2024, 11, 11)   # 11/11 Double Eleven
    tiktok_drop_week = datetime(2025, 1, 13)    # TikTok doanh thu giảm 40%

    # ── SHOPEE ────────────────────────────────────────────────
    print("\n[Shopee]")
    data = generate_shopee_orders(SHOPEE_SKUS, q3_2024_start, q3_2024_end, 65)
    save_json(data, os.path.join(SHOPEE_DIR, "shopee_orders_2024_q3.json"))

    data = generate_shopee_orders(SHOPEE_SKUS, q4_2024_start, q4_2024_end, 100,
                                  flash_sale_date=flash_sale_day)
    save_json(data, os.path.join(SHOPEE_DIR, "shopee_orders_2024_q4.json"))

    data = generate_shopee_orders(SHOPEE_SKUS, q1_2025_start, q1_2025_end, 112)
    save_json(data, os.path.join(SHOPEE_DIR, "shopee_orders_2025_q1.json"))

    products_shopee = {"items": [_shopee_product(p) for p in PRODUCTS if p["sku"] in SHOPEE_SKUS]}
    save_json(products_shopee, os.path.join(SHOPEE_DIR, "shopee_products.json"))

    # ── TIKTOK SHOP ───────────────────────────────────────────
    print("\n[TikTok Shop]")
    tiktok_prods = [p for p in PRODUCTS if p["sku"] in TIKTOK_SKUS]

    data = generate_tiktok_orders(TIKTOK_SKUS, q4_2024_start, q4_2024_end, 80)
    save_json(data, os.path.join(TIKTOK_DIR, "tiktok_orders_2024_q4.json"))

    data = generate_tiktok_orders(TIKTOK_SKUS, q1_2025_start, q1_2025_end, 80,
                                  tiktok_drop_start=tiktok_drop_week)
    save_json(data, os.path.join(TIKTOK_DIR, "tiktok_orders_2025_q1.json"))

    products_tiktok = {"products": [_tiktok_product(p) for p in tiktok_prods]}
    save_json(products_tiktok, os.path.join(TIKTOK_DIR, "tiktok_products.json"))

    # ── LAZADA ────────────────────────────────────────────────
    print("\n[Lazada]")
    lazada_prods = [p for p in PRODUCTS if p["sku"] in LAZADA_SKUS]

    data = generate_lazada_orders(LAZADA_SKUS, q4_2024_start, q4_2024_end, 70)
    save_json(data, os.path.join(LAZADA_DIR, "lazada_orders_2024_q4.json"))

    data = generate_lazada_orders(LAZADA_SKUS, q1_2025_start, q1_2025_end, 70)
    save_json(data, os.path.join(LAZADA_DIR, "lazada_orders_2025_q1.json"))

    products_lazada = {"products": [_lazada_product(p, i) for i, p in enumerate(lazada_prods)]}
    save_json(products_lazada, os.path.join(LAZADA_DIR, "lazada_products.json"))

    # ── TỔNG KẾT ──────────────────────────────────────────────
    print("\n" + "═" * 55)
    print("Hoàn tất! Các files đã lưu vào docs/sample-data/")
    print("Bước tiếp theo:")
    print("  1. psql -d sales_analytics_ai_db -f docs/sql/reset_all_data.sql")
    print("  2. psql -d sales_analytics_ai_db -f docs/sql/05_seed_phuthinh.sql")
    print("  3. python src/etl/import_sample_shopee.py")
    print("  4. python src/etl/import_sample_tiktok.py")
    print("  5. python src/etl/import_sample_lazada.py")
    print("═" * 55)


if __name__ == "__main__":
    main()
