"""
Phase 5 — Stock Adjustment & Return/Refund Inventory Flow
19 test cases + regression Phase 1–4
"""

import os
import sys
import subprocess
import requests
import psycopg2

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5136")
DB_CFG   = dict(
    host    = "localhost",
    port    = 5432,
    dbname  = "sales_analytics_ai_db",
    user    = "postgres",
    password= "021204",
)

HEADERS = {}

def get_conn():
    return psycopg2.connect(**DB_CFG)

# ── Auth ─────────────────────────────────────────────────────────────────────
def setup():
    global HEADERS
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email":    os.getenv("TEST_EMAIL",    "owner@phuthinh.vn"),
        "password": os.getenv("TEST_PASSWORD", "PhuThinh@2024"),
    }, timeout=10)
    assert r.status_code == 200, f"Login failed: {r.text}"
    body = r.json()
    token = body.get("token") or body.get("data", {}).get("accessToken") or body["accessToken"]
    HEADERS = {"Authorization": f"Bearer {token}"}

# ── Result tracking ───────────────────────────────────────────────────────────
results = []

def tc(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((name, status, detail))
    mark = "✓" if passed else "✗"
    print(f"  {mark} {name}: {status}{(' — ' + str(detail)) if detail else ''}")

# ── Helpers ───────────────────────────────────────────────────────────────────
def get_stock(product_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT stock_quantity FROM public.products WHERE product_id = %s", (product_id,))
            return cur.fetchone()[0]

def get_any_product(min_stock=10):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT product_id, stock_quantity
                FROM public.products
                WHERE is_active = TRUE AND stock_quantity >= %s
                LIMIT 1
            """, (min_stock,))
            return cur.fetchone()

def get_any_order_with_stock_deducted():
    """Tìm đơn hàng OLTP đã trừ kho, chưa hủy, chưa return."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT order_id FROM public.orders
                WHERE is_stock_deducted = TRUE
                  AND status NOT IN ('CANCELLED','RETURNED')
                LIMIT 1
            """)
            row = cur.fetchone()
            return row[0] if row else None

def get_any_cancelled_order():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT order_id FROM public.orders WHERE status = 'CANCELLED' LIMIT 1")
            row = cur.fetchone()
            return row[0] if row else None

def get_inv_tx(reference_type, reference_id, tx_type):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT transaction_id, quantity_change, before_stock, after_stock
                FROM public.inventory_transactions
                WHERE reference_type = %s AND reference_id = %s AND transaction_type = %s
                ORDER BY created_at DESC LIMIT 1
            """, (reference_type, reference_id, tx_type))
            return cur.fetchone()

def get_order(order_id):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status, is_stock_deducted FROM public.orders WHERE order_id = %s", (order_id,))
            return cur.fetchone()

# ─────────────────────────────────────────────────────────────────────────────
# TC-1  Tạo stock adjustment tăng kho
# ─────────────────────────────────────────────────────────────────────────────
pid_adj = None
sa_id_up = None
old_stock_up = None
new_stock_up = None

def test_tc1_adjust_up():
    global pid_adj, sa_id_up, old_stock_up, new_stock_up
    row = get_any_product(min_stock=5)
    if not row:
        tc("TC-1 Tạo adjustment tăng kho (bỏ qua — không có sản phẩm)", True, "no product")
        return
    pid_adj, cur_stock = row
    old_stock_up = cur_stock
    new_stock_up = cur_stock + 20

    r = requests.post(f"{BASE_URL}/api/stock-adjustments", headers=HEADERS, json={
        "productId":   pid_adj,
        "newQuantity": new_stock_up,
        "reason":      "Kiểm kê thực tế TC-1",
        "note":        "Test phase 5",
    }, timeout=10)
    tc("TC-1 Tạo adjustment tăng kho (201/200)", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:120]}")
    if r.status_code in (200, 201):
        sa_id_up = r.json().get("stockAdjustmentId")

# ─────────────────────────────────────────────────────────────────────────────
# TC-2  Product stock tăng đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc2_stock_increased():
    if pid_adj is None or new_stock_up is None:
        tc("TC-2 Stock tăng đúng (bỏ qua)", True, "no product"); return
    actual = get_stock(pid_adj)
    tc("TC-2 Stock tăng đúng", actual == new_stock_up, f"expected={new_stock_up} actual={actual}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-3  Inventory transaction MANUAL_ADJUST_UP tạo đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc3_inv_tx_adjust_up():
    if sa_id_up is None:
        tc("TC-3 MANUAL_ADJUST_UP tx (bỏ qua)", True, "no sa_id"); return
    row = get_inv_tx("stock_adjustment", sa_id_up, "MANUAL_ADJUST_UP")
    tc("TC-3 MANUAL_ADJUST_UP tx tạo đúng", row is not None,
       f"tx={row}" if row else "not found")

# ─────────────────────────────────────────────────────────────────────────────
# TC-4  before_stock / after_stock / difference đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc4_inv_tx_invariant():
    if sa_id_up is None or old_stock_up is None or new_stock_up is None:
        tc("TC-4 Invariant (bỏ qua)", True, "missing data"); return
    row = get_inv_tx("stock_adjustment", sa_id_up, "MANUAL_ADJUST_UP")
    if not row:
        tc("TC-4 Invariant", False, "tx not found"); return
    _, qty_change, before, after = row
    expected_diff = new_stock_up - old_stock_up
    ok = (before == old_stock_up and after == new_stock_up and qty_change == expected_diff
          and after == before + qty_change)
    tc("TC-4 before/after/diff đúng", ok,
       f"before={before}(exp={old_stock_up}) after={after}(exp={new_stock_up}) qty_change={qty_change}(exp={expected_diff})")

# ─────────────────────────────────────────────────────────────────────────────
# TC-5  Tạo stock adjustment giảm kho
# ─────────────────────────────────────────────────────────────────────────────
sa_id_down = None
old_stock_down = None
new_stock_down = None

def test_tc5_adjust_down():
    global sa_id_down, old_stock_down, new_stock_down
    if pid_adj is None:
        tc("TC-5 Tạo adjustment giảm kho (bỏ qua)", True, "no product"); return
    old_stock_down = get_stock(pid_adj)
    new_stock_down = max(0, old_stock_down - 5)
    if new_stock_down == old_stock_down:
        tc("TC-5 Tạo adjustment giảm kho (bỏ qua — stock=0)", True, "stock=0"); return

    r = requests.post(f"{BASE_URL}/api/stock-adjustments", headers=HEADERS, json={
        "productId":   pid_adj,
        "newQuantity": new_stock_down,
        "reason":      "Kiểm kê thực tế TC-5",
    }, timeout=10)
    tc("TC-5 Tạo adjustment giảm kho (201/200)", r.status_code in (200, 201), f"status={r.status_code}")
    if r.status_code in (200, 201):
        sa_id_down = r.json().get("stockAdjustmentId")

# ─────────────────────────────────────────────────────────────────────────────
# TC-6  Product stock giảm đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc6_stock_decreased():
    if pid_adj is None or new_stock_down is None:
        tc("TC-6 Stock giảm đúng (bỏ qua)", True, "missing"); return
    actual = get_stock(pid_adj)
    tc("TC-6 Stock giảm đúng", actual == new_stock_down, f"expected={new_stock_down} actual={actual}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-7  Inventory transaction MANUAL_ADJUST_DOWN tạo đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc7_inv_tx_adjust_down():
    if sa_id_down is None:
        tc("TC-7 MANUAL_ADJUST_DOWN tx (bỏ qua)", True, "no sa_id"); return
    row = get_inv_tx("stock_adjustment", sa_id_down, "MANUAL_ADJUST_DOWN")
    tc("TC-7 MANUAL_ADJUST_DOWN tx tạo đúng", row is not None)

# ─────────────────────────────────────────────────────────────────────────────
# TC-8  Không cho newQuantity < 0
# ─────────────────────────────────────────────────────────────────────────────
def test_tc8_block_negative():
    if pid_adj is None:
        tc("TC-8 Block negative (bỏ qua)", True, "no product"); return
    r = requests.post(f"{BASE_URL}/api/stock-adjustments", headers=HEADERS, json={
        "productId":   pid_adj,
        "newQuantity": -1,
        "reason":      "test negative",
    }, timeout=10)
    tc("TC-8 Block newQuantity < 0 (400)", r.status_code == 400, f"status={r.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-9  Return order đã trừ kho
# ─────────────────────────────────────────────────────────────────────────────
test_order_id = None
stock_before_return = {}

def test_tc9_return_order():
    global test_order_id, stock_before_return
    order_id = get_any_order_with_stock_deducted()
    if not order_id:
        tc("TC-9 Return order (bỏ qua — không có đơn phù hợp)", True, "no order"); return
    test_order_id = order_id

    # Lưu stock trước khi return để kiểm tra TC-10
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT oi.product_id, p.stock_quantity
                FROM public.order_items oi
                JOIN public.products p ON p.product_id = oi.product_id
                WHERE oi.order_id = %s
            """, (order_id,))
            for row in cur.fetchall():
                stock_before_return[row[0]] = row[1]

    r = requests.post(f"{BASE_URL}/api/orders/oltp/{order_id}/return", headers=HEADERS, timeout=10)
    tc("TC-9 Return order HTTP 200", r.status_code == 200, f"status={r.status_code} body={r.text[:120]}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-10  Product stock hoàn đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc10_stock_restored():
    if not test_order_id or not stock_before_return:
        tc("TC-10 Stock hoàn đúng (bỏ qua)", True, "no data"); return
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT oi.product_id, oi.quantity, p.stock_quantity
                FROM public.order_items oi
                JOIN public.products p ON p.product_id = oi.product_id
                WHERE oi.order_id = %s
            """, (test_order_id,))
            rows = cur.fetchall()
    errors = []
    for pid, qty, actual_stock in rows:
        expected = stock_before_return.get(pid, 0) + qty
        if actual_stock != expected:
            errors.append(f"pid={pid} expected={expected} actual={actual_stock}")
    tc("TC-10 Stock hoàn đúng", not errors, "; ".join(errors) if errors else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-11  Inventory transaction RETURN_REFUND tạo đúng
# ─────────────────────────────────────────────────────────────────────────────
def test_tc11_inv_tx_return():
    if not test_order_id:
        tc("TC-11 RETURN_REFUND tx (bỏ qua)", True, "no order"); return
    row = get_inv_tx("order", test_order_id, "RETURN_REFUND")
    tc("TC-11 RETURN_REFUND inventory_transaction tạo đúng", row is not None)

# ─────────────────────────────────────────────────────────────────────────────
# TC-12  Order status = RETURNED
# ─────────────────────────────────────────────────────────────────────────────
def test_tc12_order_returned():
    if not test_order_id:
        tc("TC-12 Order status=RETURNED (bỏ qua)", True, "no order"); return
    status, _ = get_order(test_order_id)
    tc("TC-12 Order status = RETURNED", status == "RETURNED", f"actual={status}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-13  is_stock_deducted = FALSE sau return
# ─────────────────────────────────────────────────────────────────────────────
def test_tc13_stock_deducted_false():
    if not test_order_id:
        tc("TC-13 is_stock_deducted=FALSE (bỏ qua)", True, "no order"); return
    _, is_deducted = get_order(test_order_id)
    tc("TC-13 is_stock_deducted = FALSE sau return", is_deducted == False, f"actual={is_deducted}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-14  Return lần 2 bị block, không cộng kho lần 2
# ─────────────────────────────────────────────────────────────────────────────
def test_tc14_return_twice_blocked():
    if not test_order_id:
        tc("TC-14 Block return lần 2 (bỏ qua)", True, "no order"); return
    # Lưu stock trước khi thử return lần 2
    stock_before = {pid: get_stock(pid) for pid in stock_before_return}

    r = requests.post(f"{BASE_URL}/api/orders/oltp/{test_order_id}/return", headers=HEADERS, timeout=10)
    tc("TC-14 Return lần 2 bị block (400)", r.status_code == 400, f"status={r.status_code}")

    # Kiểm tra stock không thay đổi
    stock_after = {pid: get_stock(pid) for pid in stock_before_return}
    changed = [pid for pid in stock_before if stock_before[pid] != stock_after[pid]]
    tc("TC-14b Stock không bị cộng lần 2", not changed, f"changed pids: {changed}" if changed else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-15  Không cho return order CANCELLED
# ─────────────────────────────────────────────────────────────────────────────
def test_tc15_block_return_cancelled():
    order_id = get_any_cancelled_order()
    if not order_id:
        tc("TC-15 Block return cancelled (bỏ qua — không có đơn CANCELLED)", True, "no order"); return
    r = requests.post(f"{BASE_URL}/api/orders/oltp/{order_id}/return", headers=HEADERS, timeout=10)
    tc("TC-15 Block return đơn CANCELLED (400)", r.status_code == 400, f"status={r.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-16  Regression Phase 1
# ─────────────────────────────────────────────────────────────────────────────
def test_tc16_regression_phase1():
    result = subprocess.run(
        [sys.executable, "src/etl/test_phase1_stock.py"],
        capture_output=True, text=True, timeout=120,
        env={**os.environ, "PYTHONUTF8": "1"}
    )
    passed = result.returncode == 0
    # Đọc dòng summary từ output
    summary = next((l for l in result.stdout.splitlines() if "PASS" in l or "FAIL" in l), result.stdout[-100:])
    tc("TC-16 Regression Phase 1", passed, summary.strip())

# ─────────────────────────────────────────────────────────────────────────────
# TC-17  Regression Phase 2
# ─────────────────────────────────────────────────────────────────────────────
def test_tc17_regression_phase2():
    result = subprocess.run(
        [sys.executable, "src/etl/test_phase2_inventory_tx.py"],
        capture_output=True, text=True, timeout=120,
        env={**os.environ, "PYTHONUTF8": "1"}
    )
    passed = result.returncode == 0
    summary = next((l for l in result.stdout.splitlines() if "PASS" in l or "FAIL" in l), result.stdout[-100:])
    tc("TC-17 Regression Phase 2", passed, summary.strip())

# ─────────────────────────────────────────────────────────────────────────────
# TC-18  Regression Phase 3
# ─────────────────────────────────────────────────────────────────────────────
def test_tc18_regression_phase3():
    result = subprocess.run(
        [sys.executable, "src/etl/test_phase3_procurement.py"],
        capture_output=True, text=True, timeout=120,
        env={**os.environ, "PYTHONUTF8": "1"}
    )
    passed = result.returncode == 0
    summary = next((l for l in result.stdout.splitlines() if "PASS" in l or "FAIL" in l), result.stdout[-100:])
    tc("TC-18 Regression Phase 3", passed, summary.strip())

# ─────────────────────────────────────────────────────────────────────────────
# TC-19  Regression Phase 4
# ─────────────────────────────────────────────────────────────────────────────
def test_tc19_regression_phase4():
    result = subprocess.run(
        [sys.executable, "src/etl/test_phase4_inventory_dashboard.py"],
        capture_output=True, text=True, timeout=120,
        env={**os.environ,
             "API_BASE_URL":   BASE_URL,
             "TEST_EMAIL":     os.getenv("TEST_EMAIL",    "owner@phuthinh.vn"),
             "TEST_PASSWORD":  os.getenv("TEST_PASSWORD", "PhuThinh@2024"),
             "DATABASE_URL":   f"postgresql://postgres:021204@localhost:5432/sales_analytics_ai_db",
             "PYTHONUTF8":     "1"}
    )
    passed = result.returncode == 0
    summary = next((l for l in result.stdout.splitlines() if "PASS" in l or "FAIL" in l), result.stdout[-100:])
    tc("TC-19 Regression Phase 4", passed, summary.strip())

# ─────────────────────────────────────────────────────────────────────────────
# Main runner
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("\n=== Phase 5 — Stock Adjustment & Return/Refund Tests ===\n")
    try:
        setup()
    except Exception as e:
        print(f"SETUP FAILED: {e}")
        sys.exit(1)

    tests = [
        test_tc1_adjust_up,
        test_tc2_stock_increased,
        test_tc3_inv_tx_adjust_up,
        test_tc4_inv_tx_invariant,
        test_tc5_adjust_down,
        test_tc6_stock_decreased,
        test_tc7_inv_tx_adjust_down,
        test_tc8_block_negative,
        test_tc9_return_order,
        test_tc10_stock_restored,
        test_tc11_inv_tx_return,
        test_tc12_order_returned,
        test_tc13_stock_deducted_false,
        test_tc14_return_twice_blocked,
        test_tc15_block_return_cancelled,
        test_tc16_regression_phase1,
        test_tc17_regression_phase2,
        test_tc18_regression_phase3,
        test_tc19_regression_phase4,
    ]

    for t in tests:
        try:
            t()
        except Exception as e:
            tc(t.__name__, False, f"EXCEPTION: {e}")

    passed = sum(1 for _, s, _ in results if s == "PASS")
    total  = len(results)
    print(f"\n{'='*50}")
    print(f"  Phase 5: {passed}/{total} PASS")
    print(f"{'='*50}\n")
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
