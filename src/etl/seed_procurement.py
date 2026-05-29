#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed_procurement.py
Tạo dữ liệu demo cho: suppliers, purchase_orders, goods_receipts.

Dữ liệu phù hợp ngành thời trang của Công ty Phú Thịnh.
- 5 nhà cung cấp thật
- 4 phiếu đặt hàng (RECEIVED / PARTIALLY_RECEIVED / APPROVED / DRAFT)
- 2 phiếu nhập kho (linked với PO đã duyệt)

KHÔNG thay đổi products.stock_quantity (seed là dữ liệu lịch sử,
tồn kho hiện tại đã phản ánh các lần nhập/bán trước đó).

Chạy: python src/etl/seed_procurement.py
"""
import json
import pathlib
import sys
sys.stdout.reconfigure(encoding='utf-8')
from datetime import datetime, timezone, timedelta

import psycopg2
from psycopg2.extras import RealDictCursor

NOW = datetime.now(timezone(timedelta(hours=7)))


def load_conn_params() -> dict:
    p = pathlib.Path(__file__).parent.parent / "backend" / "SalesAnalytics.API" / "appsettings.Development.json"
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8-sig"))
            cs = data.get("ConnectionStrings", {}).get("Default", "")
            m = {"Host": "host", "Port": "port", "Database": "dbname",
                 "Username": "user", "Password": "password"}
            params = {}
            for part in cs.split(";"):
                if "=" not in part:
                    continue
                k, v = part.split("=", 1)
                if k.strip() in m:
                    params[m[k.strip()]] = v.strip()
            if params:
                return params
        except Exception:
            pass
    return {"host": "localhost", "port": "5432", "dbname": "sales_analytics_ai_db",
            "user": "postgres", "password": "021204"}


def days_ago(n: int) -> datetime:
    return NOW - timedelta(days=n)


def main():
    conn = psycopg2.connect(**load_conn_params())
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # ── Lấy company ───────────────────────────────────────────────────
            cur.execute("SELECT id FROM public.companies WHERE email = 'contact@phuthinh.vn' LIMIT 1")
            row = cur.fetchone()
            if not row:
                print("Khong tim thay company. Chay seed chinh truoc.")
                return
            company_id = str(row["id"])

            # ── Lấy user owner để gán created_by / approved_by ────────────────
            cur.execute("SELECT user_id FROM public.users WHERE company_id = %s::uuid AND role = 'Owner' LIMIT 1",
                        (company_id,))
            u = cur.fetchone()
            if not u:
                cur.execute("SELECT user_id FROM public.users WHERE company_id = %s::uuid LIMIT 1", (company_id,))
                u = cur.fetchone()
            owner_id = u["user_id"] if u else None

            # ── Kiểm tra đã seed chưa ─────────────────────────────────────────
            cur.execute("SELECT COUNT(*) AS cnt FROM public.suppliers WHERE company_id = %s::uuid", (company_id,))
            if cur.fetchone()["cnt"] > 0:
                print("Da co nha cung cap. Xoa truoc neu muon chay lai.")
                return

            # ═════════════════════════════════════════════════════════════════
            # 1. SUPPLIERS
            # ═════════════════════════════════════════════════════════════════
            suppliers_data = [
                {
                    "code": "NCC-001", "name": "Cong ty TNHH Det May Phuong Nam",
                    "contact": "Nguyen Van Minh", "phone": "0901234567",
                    "email": "sales@detmayphuongnam.vn",
                    "address": "123 Nguyen Thi Minh Khai, Q.1, TP.HCM",
                    "tax": "0310123456", "note": "NCC chinh: ao thun, quan jean, hoodie",
                },
                {
                    "code": "NCC-002", "name": "Xuong Giay Dep Hoa Phat",
                    "contact": "Tran Thi Lan", "phone": "0912345678",
                    "email": "order@giaydeyhoaphat.com",
                    "address": "45 Le Van Sy, Q.3, TP.HCM",
                    "tax": "0310234567", "note": "NCC giay sneaker, cao got, dep",
                },
                {
                    "code": "NCC-003", "name": "Cong ty CP Tui Xach Bac Viet",
                    "contact": "Le Quoc Hung", "phone": "0923456789",
                    "email": "contact@tuixachbacviet.vn",
                    "address": "78 Tran Hung Dao, Q.5, TP.HCM",
                    "tax": "0310345678", "note": "NCC tui xach, balo, vi",
                },
                {
                    "code": "NCC-004", "name": "Co So May Mac Thanh Xuan",
                    "contact": "Pham Thi Huong", "phone": "0934567890",
                    "email": "thanhxuanmay@gmail.com",
                    "address": "12 Hoang Dieu, Q.4, TP.HCM",
                    "tax": "0310456789", "note": "NCC vay, dam, chan vay",
                },
                {
                    "code": "NCC-005", "name": "Cong ty TNHH Thoi Trang A Chau",
                    "contact": "Hoang Van Duc", "phone": "0945678901",
                    "email": "import@thoitrangachau.vn",
                    "address": "56 Ben Chuong Duong, Q.1, TP.HCM",
                    "tax": "0310567890", "note": "Hang nhap khau da dang",
                },
            ]

            supplier_ids = {}
            for s in suppliers_data:
                cur.execute("""
                    INSERT INTO public.suppliers
                        (company_id, supplier_code, supplier_name, contact_name,
                         phone, email, address, tax_code, note,
                         is_active, created_at, updated_at)
                    VALUES
                        (%s::uuid, %s, %s, %s, %s, %s, %s, %s, %s,
                         TRUE, NOW(), NOW())
                    RETURNING supplier_id
                """, (company_id, s["code"], s["name"], s["contact"],
                      s["phone"], s["email"], s["address"], s["tax"], s["note"]))
                sid = cur.fetchone()["supplier_id"]
                supplier_ids[s["code"]] = sid
                print(f"  [NCC] {s['code']} — {s['name']}")

            # ═════════════════════════════════════════════════════════════════
            # 2. PURCHASE ORDERS
            # ═════════════════════════════════════════════════════════════════
            # PO-001: RECEIVED (nhap ao thun, quan, hoodie 60 ngay truoc)
            # PO-002: PARTIALLY_RECEIVED (giay dep, con thieu 15 doi sneaker)
            # PO-003: APPROVED (chua nhan — san pham het hang can nhap gap)
            # PO-004: DRAFT  (dang lap ke hoach)

            po_defs = [
                {
                    "code": "PO-20260329-001",
                    "supplier_code": "NCC-001",
                    "status": "RECEIVED",
                    "created_at": days_ago(61),
                    "approved_at": days_ago(58),
                    "note": "Nhap bo ao thun, quan jean, hoodie cho mua he",
                    "items": [
                        # (product_id, qty, import_price, received_qty)
                        (303, 200, 190000, 200),   # Ao so mi nam
                        (304, 150, 220000, 150),   # Quan jean nam slim
                        (308, 100, 230000, 100),   # Ao hoodie unisex
                    ],
                },
                {
                    "code": "PO-20260429-002",
                    "supplier_code": "NCC-002",
                    "status": "PARTIALLY_RECEIVED",
                    "created_at": days_ago(31),
                    "approved_at": days_ago(28),
                    "note": "Nhap giay dep mua he — lot 1",
                    "items": [
                        (319, 50, 310000, 35),    # Giay sneaker (con thieu 15)
                        (320, 100, 250000, 100),  # Giay cao got (da nhan du)
                        (321, 150, 110000, 150),  # Dep quai hau (da nhan du)
                    ],
                },
                {
                    "code": "PO-20260519-003",
                    "supplier_code": "NCC-001",
                    "status": "APPROVED",
                    "created_at": days_ago(10),
                    "approved_at": days_ago(7),
                    "note": "Nhap gap hang het kho: ao thun, quan, polo",
                    "items": [
                        (3096, 100, 90000,  0),   # Ao thun basic (het hang)
                        (3097, 80,  168000, 0),   # Quan jean slim (het hang)
                        (3101, 60,  90000,  0),   # Ao polo tay ngan (het hang)
                    ],
                },
                {
                    "code": "PO-20260526-004",
                    "supplier_code": "NCC-003",
                    "status": "DRAFT",
                    "created_at": days_ago(3),
                    "approved_at": None,
                    "note": "Ke hoach nhap tui xach, balo quy 3",
                    "items": [
                        (327, 80,  210000, 0),   # Balo the thao
                        (325, 60,  290000, 0),   # Tui xach da PU
                        (328, 100, 160000, 0),   # Vi clutch
                    ],
                },
            ]

            po_ids = {}  # code → po_id
            for po in po_defs:
                total_amount = sum(qty * price for _, qty, price, _ in po["items"])
                cur.execute("""
                    INSERT INTO public.purchase_orders
                        (company_id, supplier_id, purchase_code, status,
                         total_amount, note, created_by, approved_by,
                         created_at, updated_at, approved_at)
                    VALUES
                        (%s::uuid, %s, %s, %s,
                         %s, %s, %s, %s,
                         %s, %s, %s)
                    RETURNING purchase_order_id
                """, (
                    company_id, supplier_ids[po["supplier_code"]], po["code"], po["status"],
                    total_amount, po["note"], owner_id,
                    owner_id if po["approved_at"] else None,
                    po["created_at"], po["created_at"],
                    po["approved_at"],
                ))
                po_id = cur.fetchone()["purchase_order_id"]
                po_ids[po["code"]] = po_id

                # Insert purchase_order_items
                for product_id, qty, import_price, received_qty in po["items"]:
                    cur.execute("""
                        INSERT INTO public.purchase_order_items
                            (purchase_order_id, product_id, quantity,
                             received_quantity, import_price, total_price)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (po_id, product_id, qty, received_qty,
                          import_price, qty * import_price))

                items_str = ", ".join(f"{qty}sp" for _, qty, _, _ in po["items"])
                print(f"  [PO] {po['code']} | {po['status']} | {items_str} | {total_amount:,.0f}đ")

            # ═════════════════════════════════════════════════════════════════
            # 3. GOODS RECEIPTS (chỉ cho PO đã có hàng về)
            # ═════════════════════════════════════════════════════════════════
            gr_defs = [
                {
                    "po_code": "PO-20260329-001",
                    "code": "GR-20260403-001",
                    "created_at": days_ago(56),
                    "note": "Nhan hang dot 1 — du so luong theo PO",
                    "items": [
                        # (product_id, poi_product_id, received_qty, import_price)
                        (303, 200, 190000),
                        (304, 150, 220000),
                        (308, 100, 230000),
                    ],
                },
                {
                    "po_code": "PO-20260429-002",
                    "code": "GR-20260504-002",
                    "created_at": days_ago(25),
                    "note": "Nhan giay cao got va dep — sneaker giao thieu 15 doi",
                    "items": [
                        (319, 35,  310000),   # Nhan 35/50
                        (320, 100, 250000),   # Nhan du
                        (321, 150, 110000),   # Nhan du
                    ],
                },
            ]

            for gr in gr_defs:
                po_id = po_ids[gr["po_code"]]
                total_qty = sum(qty for _, qty, _ in gr["items"])
                total_amt = sum(qty * price for _, qty, price in gr["items"])

                cur.execute("""
                    INSERT INTO public.goods_receipts
                        (company_id, purchase_order_id, receipt_code,
                         total_quantity, total_amount, note,
                         created_by, created_at)
                    VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING goods_receipt_id
                """, (company_id, po_id, gr["code"],
                      total_qty, total_amt, gr["note"],
                      owner_id, gr["created_at"]))
                gr_id = cur.fetchone()["goods_receipt_id"]

                # Lấy purchase_order_item_id cho từng product
                for product_id, received_qty, import_price in gr["items"]:
                    cur.execute("""
                        SELECT purchase_order_item_id
                        FROM public.purchase_order_items
                        WHERE purchase_order_id = %s AND product_id = %s
                    """, (po_id, product_id))
                    poi_row = cur.fetchone()
                    if not poi_row:
                        print(f"  [WARN] Khong tim thay POI: po_id={po_id} product_id={product_id}")
                        continue
                    poi_id = poi_row["purchase_order_item_id"]

                    cur.execute("""
                        INSERT INTO public.goods_receipt_items
                            (goods_receipt_id, purchase_order_item_id, product_id,
                             received_quantity, import_price, total_price)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (gr_id, poi_id, product_id,
                          received_qty, import_price, received_qty * import_price))

                print(f"  [GR] {gr['code']} | {total_qty} sp | {total_amt:,.0f}đ")

        conn.commit()
        print("\nHoan tat seed procurement:")
        print(f"  5 nha cung cap")
        print(f"  4 phieu dat hang (RECEIVED / PARTIALLY_RECEIVED / APPROVED / DRAFT)")
        print(f"  2 phieu nhap kho")

    except Exception as e:
        conn.rollback()
        print(f"LOI: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
