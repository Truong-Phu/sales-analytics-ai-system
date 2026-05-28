# -*- coding: utf-8 -*-
"""
Phase 6 - End-to-End Business Flow Tests
Kiểm tra luồng nghiệp vụ hoàn chỉnh từ đầu đến cuối.

FLOW-1: Vòng đời đơn hàng (tạo → hoàn thành → hoàn trả)
FLOW-2: Chỉnh kho thủ công (tăng → kiểm tra → giảm → kiểm tra)
FLOW-3: Inventory Dashboard (tất cả endpoint trả dữ liệu hợp lệ)
FLOW-4: AI Service tồn kho
"""

import os
import sys
import json
import time
import requests
import psycopg2

# Fix encoding on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = "http://localhost:5136"
DB_DSN = "host=localhost port=5432 dbname=sales_analytics_ai_db user=postgres password=021204"

PASS = "✅ PASS"
FAIL = "❌ FAIL"
SKIP = "⏭  SKIP"

results = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token(role="owner"):
    creds = {
        "owner":   ("owner@phuthinh.vn",   "PhuThinh@2024"),
        "manager": ("manager@phuthinh.vn", "PhuThinh@2024"),
        "staff":   ("staff@phuthinh.vn",   "PhuThinh@2024"),
    }
    email, pw = creds.get(role, creds["owner"])
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=10)
    body = r.json()
    token = (body.get("token")
             or body.get("data", {}).get("accessToken")
             or body.get("accessToken"))
    if not token:
        raise RuntimeError(f"Login failed for {email}: {body}")
    return token


def hdrs(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def record(tc, desc, passed, detail="", skip=False):
    if skip:
        status = SKIP
    else:
        status = PASS if passed else FAIL
    results.append((tc, desc, status, detail))
    print(f"  {status} {tc}: {desc}" + (f" — {detail}" if detail else ""))


def db_query(sql, params=None):
    with psycopg2.connect(DB_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def get_any_active_product(min_stock=5):
    rows = db_query(
        "SELECT product_id, stock_quantity, COALESCE(sale_price, base_price, 100000) "
        "FROM public.products WHERE is_active=TRUE AND stock_quantity >= %s LIMIT 1",
        (min_stock,)
    )
    if not rows:
        raise RuntimeError("Không có sản phẩm active nào với stock >= 5")
    return rows[0]  # (product_id, stock_quantity, unit_price)


def get_any_channel_id():
    rows = db_query("SELECT channel_id FROM public.sales_channels LIMIT 1")
    return rows[0][0] if rows else 16


def get_company_id(token):
    r = requests.get(f"{BASE}/api/products", headers=hdrs(token), params={"pageSize": 1}, timeout=10)
    # company_id nằm trong tenant context — lấy từ response nếu có
    body = r.json()
    if isinstance(body, dict) and "companyId" in body:
        return body["companyId"]
    # fallback: lấy từ DB qua product
    rows = db_query("SELECT DISTINCT company_id FROM public.products WHERE is_active=TRUE LIMIT 1")
    return str(rows[0][0]) if rows else None


# ── FLOW-1: Vòng đời đơn hàng ─────────────────────────────────────────────────

def flow1_order_lifecycle(token):
    print("\n─ FLOW-1: Vòng đời đơn hàng ─")

    # Tìm đơn hàng đã tính kho (is_stock_deducted=TRUE), chưa bị return/cancel
    # để test return flow thực tế
    order_rows = db_query(
        "SELECT o.order_id, oi.product_id, p.stock_quantity "
        "FROM public.orders o "
        "JOIN public.order_items oi ON oi.order_id = o.order_id "
        "JOIN public.products p ON p.product_id = oi.product_id "
        "WHERE o.is_stock_deducted = TRUE "
        "  AND o.status NOT IN ('CANCELLED','RETURNED') "
        "  AND p.is_active = TRUE "
        "LIMIT 1"
    )
    if not order_rows:
        record("F1-1", "Tìm đơn hàng is_stock_deducted=TRUE để test return", False,
               "Không có đơn hàng phù hợp trong DB — FLOW-1 skipped", skip=True)
        # Sub-tests skipped
        for tc in ["F1-2","F1-3","F1-4","F1-5","F1-6","F1-7","F1-8"]:
            record(tc, "Skipped — no suitable order", False, "", skip=True)
        return

    order_id, product_id, stock_before = order_rows[0]
    record("F1-1", "Tìm đơn hàng is_stock_deducted=TRUE", True,
           f"order_id={order_id}, product_id={product_id}, stock={stock_before}")

    # Hoàn trả đơn hàng
    r = requests.post(f"{BASE}/api/orders/oltp/{order_id}/return",
                      headers=hdrs(token), timeout=10)
    passed = r.status_code == 200
    record("F1-2", "Return order → 200", passed, f"HTTP {r.status_code}")
    if not passed:
        print(f"    Response: {r.text[:200]}")
        # Cleanup not needed since nothing changed
        return

    # Kiểm tra stock hoàn về
    time.sleep(0.3)
    item_rows = db_query(
        "SELECT quantity FROM public.order_items WHERE order_id=%s AND product_id=%s LIMIT 1",
        (order_id, product_id)
    )
    qty_returned = item_rows[0][0] if item_rows else 0

    stock_rows = db_query(
        "SELECT stock_quantity FROM public.products WHERE product_id=%s", (product_id,)
    )
    stock_after = stock_rows[0][0]
    stock_restored = stock_after == stock_before + qty_returned
    record("F1-3", f"Stock hoàn về ({stock_before}+{qty_returned}={stock_before+qty_returned}, actual={stock_after})",
           stock_restored)

    # Block return lần 2
    r2 = requests.post(f"{BASE}/api/orders/oltp/{order_id}/return",
                       headers=hdrs(token), timeout=10)
    record("F1-4", "Return lần 2 bị block (400)", r2.status_code == 400, f"HTTP {r2.status_code}")

    # Order status = RETURNED, is_stock_deducted = FALSE
    status_rows = db_query(
        "SELECT status, is_stock_deducted FROM public.orders WHERE order_id=%s", (order_id,)
    )
    if status_rows:
        record("F1-5", "Order status = RETURNED", status_rows[0][0] == "RETURNED",
               f"status={status_rows[0][0]}")
        record("F1-6", "is_stock_deducted = FALSE", status_rows[0][1] is False)

    # RETURN_REFUND inventory transaction
    tx_rows = db_query(
        "SELECT COUNT(*) FROM public.inventory_transactions "
        "WHERE transaction_type='RETURN_REFUND' AND reference_type='order' AND reference_id=%s",
        (order_id,)
    )
    has_tx = tx_rows[0][0] > 0 if tx_rows else False
    record("F1-7", "RETURN_REFUND transaction ghi vào inventory_transactions", has_tx,
           f"count={tx_rows[0][0] if tx_rows else 0}")

    # Tạo đơn mới để kiểm tra OLTP create endpoint còn hoạt động
    cust_rows = db_query("SELECT customer_id FROM public.customers WHERE is_active=TRUE LIMIT 1")
    if cust_rows:
        customer_id = cust_rows[0][0]
        channel_id  = get_any_channel_id()
        _, _, unit_price = get_any_active_product(min_stock=1)
        unit_price_f = float(unit_price)
        payload = {
            "customerId": customer_id, "channelId": channel_id,
            "orderDate": "2026-05-28T00:00:00Z",
            "totalAmount": unit_price_f, "discountAmount": 0, "shippingFee": 0,
            "paymentMethod": "CASH",
            "items": [{"productId": product_id, "quantity": 1,
                       "unitPrice": unit_price_f, "discount": 0}],
        }
        r3 = requests.post(f"{BASE}/api/orders/oltp", json=payload, headers=hdrs(token), timeout=10)
        record("F1-8", "Tạo đơn hàng OLTP mới (201)", r3.status_code in (200, 201),
               f"HTTP {r3.status_code}")


# ── FLOW-2: Chỉnh kho thủ công ────────────────────────────────────────────────

def flow2_stock_adjustment(token):
    print("\n─ FLOW-2: Chỉnh kho thủ công ─")

    try:
        product_id, current_stock, _price = get_any_active_product(min_stock=0)
    except RuntimeError as e:
        record("F2-1", "Lấy sản phẩm test", False, str(e))
        return

    record("F2-1", "Lấy sản phẩm test", True, f"product_id={product_id}, stock={current_stock}")

    target_qty = current_stock + 50

    # Tạo phiếu chỉnh tăng
    adj_payload = {
        "productId": product_id,
        "newQuantity": target_qty,
        "reason": "E2E kiểm kê — tăng kho",
        "note": "Automated test"
    }
    r = requests.post(f"{BASE}/api/stock-adjustments", json=adj_payload,
                      headers=hdrs(token), timeout=10)
    passed = r.status_code in (200, 201)
    record("F2-2", f"Tạo phiếu chỉnh tăng ({current_stock}→{target_qty})", passed, f"HTTP {r.status_code}")
    if not passed:
        print(f"    Response: {r.text[:200]}")
        return

    adj_id = r.json().get("stockAdjustmentId") or r.json().get("data", {}).get("stockAdjustmentId")

    # Kiểm tra stock mới
    stock_rows = db_query(
        "SELECT stock_quantity FROM public.products WHERE product_id=%s",
        (product_id,)
    )
    stock_after = stock_rows[0][0]
    record("F2-3", f"Stock tăng đúng ({stock_after} = {target_qty})", stock_after == target_qty)

    # Kiểm tra inventory_transaction
    tx_rows = db_query(
        "SELECT transaction_type, quantity_change, before_stock, after_stock "
        "FROM public.inventory_transactions "
        "WHERE reference_type='stock_adjustment' AND reference_id=%s",
        (adj_id,)
    )
    if tx_rows:
        tx = tx_rows[0]
        tx_ok = (tx[0] == "MANUAL_ADJUST_UP"
                 and tx[1] == 50
                 and tx[3] == target_qty)
        record("F2-4", "MANUAL_ADJUST_UP transaction đúng", tx_ok,
               f"type={tx[0]}, change={tx[1]}, after={tx[3]}")
    else:
        record("F2-4", "MANUAL_ADJUST_UP transaction đúng", False, "Không tìm thấy transaction")

    # Chỉnh giảm về số ban đầu
    restore_qty = current_stock
    adj_down = {
        "productId": product_id,
        "newQuantity": restore_qty,
        "reason": "E2E kiểm kê — khôi phục",
        "note": "Automated test cleanup"
    }
    r2 = requests.post(f"{BASE}/api/stock-adjustments", json=adj_down,
                       headers=hdrs(token), timeout=10)
    record("F2-5", f"Chỉnh giảm về {restore_qty} (200/201)", r2.status_code in (200, 201),
           f"HTTP {r2.status_code}")

    # Block khi không thay đổi
    r3 = requests.post(f"{BASE}/api/stock-adjustments", json=adj_down,
                       headers=hdrs(token), timeout=10)
    record("F2-6", "Block khi số lượng không đổi (400)", r3.status_code == 400,
           f"HTTP {r3.status_code}")

    # Danh sách phiếu chỉnh kho
    r4 = requests.get(f"{BASE}/api/stock-adjustments", headers=hdrs(token), timeout=10)
    record("F2-7", "GET /api/stock-adjustments (200)", r4.status_code == 200, f"HTTP {r4.status_code}")


# ── FLOW-3: Inventory Dashboard ────────────────────────────────────────────────

def flow3_inventory_dashboard(token):
    print("\n─ FLOW-3: Inventory Dashboard ─")

    endpoints = [
        ("F3-1", "/api/inventory/dashboard/overview",          "Overview KPI"),
        ("F3-2", "/api/inventory/dashboard/stock-movement",    "Stock movement chart"),
        ("F3-3", "/api/inventory/dashboard/low-stock",         "Low stock list"),
        ("F3-4", "/api/inventory/dashboard/product-velocity",  "Product velocity"),
        ("F3-5", "/api/inventory/dashboard/supplier-performance", "Supplier performance"),
        ("F3-6", "/api/inventory/recommendations",             "Reorder recommendations"),
    ]

    for tc, endpoint, label in endpoints:
        r = requests.get(f"{BASE}{endpoint}", headers=hdrs(token), timeout=10)
        passed = r.status_code == 200
        try:
            body = r.json()
            not_empty = body is not None
        except Exception:
            not_empty = False
        record(tc, f"{label} → 200 + JSON", passed and not_empty, f"HTTP {r.status_code}")


# ── FLOW-4: AI Service ─────────────────────────────────────────────────────────

def flow4_ai_service():
    print("\n─ FLOW-4: AI Service tồn kho ─")

    AI_BASE = "http://localhost:8000"
    try:
        r = requests.get(f"{AI_BASE}/inventory", timeout=10)
        passed = r.status_code == 200
        body = r.json() if passed else {}
        has_items = isinstance(body.get("items"), list)
        has_flag  = "is_mock" in body
        record("F4-1", "GET /inventory → 200", passed, f"HTTP {r.status_code}")
        record("F4-2", "Response có items[]", has_items, f"count={len(body.get('items', []))}")
        record("F4-3", "Response có is_mock flag", has_flag, f"is_mock={body.get('is_mock')}")
    except requests.exceptions.ConnectionError:
        record("F4-1", "AI service reachable", False, "AI service chưa chạy", skip=True)
        record("F4-2", "Response có items[]", False, "Skipped", skip=True)
        record("F4-3", "Response có is_mock flag", False, "Skipped", skip=True)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Phase 6 — E2E Business Flow Tests")
    print("=" * 60)

    try:
        token = get_token("owner")
        print(f"  Auth: OK (owner)")
    except Exception as e:
        print(f"  {FAIL} Auth failed: {e}")
        sys.exit(1)

    flow1_order_lifecycle(token)
    flow2_stock_adjustment(token)
    flow3_inventory_dashboard(token)
    flow4_ai_service()

    print("\n" + "=" * 60)
    total   = len(results)
    passed  = sum(1 for _, _, s, _ in results if s == PASS)
    skipped = sum(1 for _, _, s, _ in results if s == SKIP)
    failed  = sum(1 for _, _, s, _ in results if s == FAIL)

    print(f"Phase 6 E2E: {passed}/{total - skipped} PASS  ({failed} FAIL, {skipped} SKIP)")

    if failed:
        print("\nFailed tests:")
        for tc, desc, status, detail in results:
            if status == FAIL:
                print(f"  {status} {tc}: {desc}" + (f" — {detail}" if detail else ""))
        sys.exit(1)
    else:
        print("Tất cả E2E tests PASS ✓")


if __name__ == "__main__":
    main()
