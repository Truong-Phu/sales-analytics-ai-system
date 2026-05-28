"""
Phase 4 — Inventory Dashboard & Recommendations
16 test cases
Yêu cầu: backend đang chạy tại http://localhost:5005, đã đăng nhập lấy JWT token.
"""

import os
import sys
import json
import requests
import psycopg2
import psycopg2.extras

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5005")
DB_URL   = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/salesanalytics")

# ── Auth helper ───────────────────────────────────────────────────────────────
def get_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email":    os.getenv("TEST_EMAIL",    "owner@phuthinh.vn"),
        "password": os.getenv("TEST_PASSWORD", "PhuThinh@2024"),
    }, timeout=10)
    assert r.status_code == 200, f"Login failed: {r.text}"
    body = r.json()
    # Response: { success, data: { accessToken, ... } }
    return body.get("token") or body.get("data", {}).get("accessToken") or body["accessToken"]

TOKEN   = None
HEADERS = {}

def setup():
    global TOKEN, HEADERS
    TOKEN   = get_token()
    HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# ── DB helper ─────────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(DB_URL)

# ── Result tracking ───────────────────────────────────────────────────────────
results = []

def tc(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((name, status, detail))
    mark = "✓" if passed else "✗"
    print(f"  {mark} {name}: {status}{(' — ' + detail) if detail else ''}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-1  GET /api/inventory/dashboard/overview trả 200
# ─────────────────────────────────────────────────────────────────────────────
def test_tc1_overview_200():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/overview", headers=HEADERS, timeout=10)
    tc("TC-1 overview HTTP 200", r.status_code == 200, f"status={r.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-2  Overview có đủ fields bắt buộc
# ─────────────────────────────────────────────────────────────────────────────
def test_tc2_overview_fields():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/overview", headers=HEADERS).json()
    required = ["totalProducts","totalStockQuantity","lowStockCount","outOfStockCount",
                "stockInToday","stockOutToday","inventoryValue",
                "pendingPurchaseOrders","approvedPurchaseOrders","partiallyReceivedPurchaseOrders"]
    missing = [f for f in required if f not in r]
    tc("TC-2 overview fields đầy đủ", not missing, f"thiếu: {missing}" if missing else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-3  totalProducts >= 0 và tất cả counts không âm
# ─────────────────────────────────────────────────────────────────────────────
def test_tc3_overview_nonneg():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/overview", headers=HEADERS).json()
    checks = {k: r.get(k, -1) >= 0 for k in
              ["totalProducts","totalStockQuantity","lowStockCount","outOfStockCount",
               "stockInToday","stockOutToday"]}
    failed = [k for k, ok in checks.items() if not ok]
    tc("TC-3 overview counts không âm", not failed, f"âm: {failed}" if failed else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-4  GET /api/inventory/dashboard/stock-movement trả 200 và là array
# ─────────────────────────────────────────────────────────────────────────────
def test_tc4_movement_200():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/stock-movement", headers=HEADERS, timeout=10)
    tc("TC-4 stock-movement HTTP 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        tc("TC-4b stock-movement là array", isinstance(data, list), type(data).__name__)

# ─────────────────────────────────────────────────────────────────────────────
# TC-5  Nếu có movement items thì có fields date/stockIn/stockOut/netChange
# ─────────────────────────────────────────────────────────────────────────────
def test_tc5_movement_fields():
    data = requests.get(f"{BASE_URL}/api/inventory/dashboard/stock-movement", headers=HEADERS).json()
    if not isinstance(data, list) or len(data) == 0:
        tc("TC-5 movement fields (bỏ qua — không có data)", True, "no data")
        return
    item = data[0]
    required = ["date","stockIn","stockOut","netChange"]
    missing  = [f for f in required if f not in item]
    tc("TC-5 movement fields đủ", not missing, f"thiếu: {missing}" if missing else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-6  GET /api/inventory/dashboard/low-stock trả 200 và là array
# ─────────────────────────────────────────────────────────────────────────────
def test_tc6_lowstock_200():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/low-stock", headers=HEADERS, timeout=10)
    tc("TC-6 low-stock HTTP 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        tc("TC-6b low-stock là array", isinstance(data, list), type(data).__name__)

# ─────────────────────────────────────────────────────────────────────────────
# TC-7  low-stock items có stockQuantity <= threshold (mặc định 10)
# ─────────────────────────────────────────────────────────────────────────────
def test_tc7_lowstock_threshold():
    threshold = 10
    data = requests.get(
        f"{BASE_URL}/api/inventory/dashboard/low-stock",
        headers=HEADERS, params={"threshold": threshold}
    ).json()
    if not isinstance(data, list) or len(data) == 0:
        tc("TC-7 low-stock threshold (bỏ qua — không có data)", True, "no data")
        return
    violations = [i["productName"] for i in data if i.get("stockQuantity", 999) > threshold]
    tc("TC-7 low-stock ≤ threshold", not violations, f"vi phạm: {violations}" if violations else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-8  GET /api/inventory/dashboard/product-velocity trả 200
# ─────────────────────────────────────────────────────────────────────────────
def test_tc8_velocity_200():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/product-velocity", headers=HEADERS, timeout=10)
    tc("TC-8 product-velocity HTTP 200", r.status_code == 200, f"status={r.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-9  velocity có 3 keys: topFastMovingProducts, slowMovingProducts, deadStockProducts
# ─────────────────────────────────────────────────────────────────────────────
def test_tc9_velocity_keys():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/product-velocity", headers=HEADERS).json()
    required = ["topFastMovingProducts","slowMovingProducts","deadStockProducts","analysisDays"]
    missing  = [k for k in required if k not in r]
    tc("TC-9 velocity keys đầy đủ", not missing, f"thiếu: {missing}" if missing else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-10  GET /api/inventory/dashboard/supplier-performance trả 200 và là array
# ─────────────────────────────────────────────────────────────────────────────
def test_tc10_supplier_200():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/supplier-performance", headers=HEADERS, timeout=10)
    tc("TC-10 supplier-performance HTTP 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        tc("TC-10b supplier-performance là array", isinstance(data, list), type(data).__name__)

# ─────────────────────────────────────────────────────────────────────────────
# TC-11  GET /api/inventory/recommendations trả 200 với đúng structure
# ─────────────────────────────────────────────────────────────────────────────
def test_tc11_recs_200():
    r = requests.get(f"{BASE_URL}/api/inventory/recommendations", headers=HEADERS, timeout=10)
    tc("TC-11 recommendations HTTP 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        data = r.json()
        has_keys = all(k in data for k in ["targetDays","items","count"])
        tc("TC-11b recommendations structure đúng", has_keys, str(list(data.keys())))

# ─────────────────────────────────────────────────────────────────────────────
# TC-12  Mỗi recommendation item có riskLevel ∈ {CRITICAL,HIGH,MEDIUM,LOW}
# ─────────────────────────────────────────────────────────────────────────────
def test_tc12_risk_levels():
    data = requests.get(f"{BASE_URL}/api/inventory/recommendations", headers=HEADERS).json()
    items = data.get("items", [])
    if not items:
        tc("TC-12 riskLevel valid (bỏ qua — không có items)", True, "no items")
        return
    valid_risks = {"CRITICAL","HIGH","MEDIUM","LOW"}
    invalid = [i["productName"] for i in items if i.get("riskLevel") not in valid_risks]
    tc("TC-12 riskLevel hợp lệ", not invalid, f"invalid: {invalid}" if invalid else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-13  recommendedReorderQuantity >= 0 với mọi item
# ─────────────────────────────────────────────────────────────────────────────
def test_tc13_reorder_nonneg():
    data = requests.get(f"{BASE_URL}/api/inventory/recommendations", headers=HEADERS).json()
    items = data.get("items", [])
    if not items:
        tc("TC-13 reorderQty >= 0 (bỏ qua — không có items)", True, "no items")
        return
    neg = [i["productName"] for i in items if i.get("recommendedReorderQuantity", -1) < 0]
    tc("TC-13 recommendedReorderQuantity >= 0", not neg, f"âm: {neg}" if neg else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-14  CRITICAL chỉ xuất hiện khi stock=0 hoặc daysLeft<=3
# ─────────────────────────────────────────────────────────────────────────────
def test_tc14_critical_condition():
    data = requests.get(f"{BASE_URL}/api/inventory/recommendations", headers=HEADERS).json()
    items = data.get("items", [])
    criticals = [i for i in items if i.get("riskLevel") == "CRITICAL"]
    if not criticals:
        tc("TC-14 CRITICAL condition (bỏ qua — không có CRITICAL)", True, "no criticals")
        return
    wrong = [i["productName"] for i in criticals
             if i.get("currentStock", 1) > 0
             and (i.get("estimatedDaysLeft") or 999) > 3]
    tc("TC-14 CRITICAL chỉ khi stock=0 hoặc daysLeft≤3", not wrong,
       f"vi phạm: {wrong}" if wrong else "")

# ─────────────────────────────────────────────────────────────────────────────
# TC-15  API trả 200 khi không có JWT (Unauthorized = 401)
# ─────────────────────────────────────────────────────────────────────────────
def test_tc15_unauthorized():
    r = requests.get(f"{BASE_URL}/api/inventory/dashboard/overview", timeout=10)
    tc("TC-15 overview 401 khi không có JWT", r.status_code == 401, f"status={r.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# TC-16  Regression Phase 1–3 vẫn PASS (kiểm tra stock không âm)
# ─────────────────────────────────────────────────────────────────────────────
def test_tc16_regression_no_negative_stock():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) FROM public.products
                WHERE stock_quantity < 0
            """)
            count = cur.fetchone()[0]
    tc("TC-16 Regression — không có stock âm", count == 0, f"có {count} sản phẩm stock âm")

# ─────────────────────────────────────────────────────────────────────────────
# Main runner
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("\n=== Phase 4 — Inventory Dashboard Tests ===\n")
    try:
        setup()
    except Exception as e:
        print(f"SETUP FAILED: {e}")
        sys.exit(1)

    tests = [
        test_tc1_overview_200,
        test_tc2_overview_fields,
        test_tc3_overview_nonneg,
        test_tc4_movement_200,
        test_tc5_movement_fields,
        test_tc6_lowstock_200,
        test_tc7_lowstock_threshold,
        test_tc8_velocity_200,
        test_tc9_velocity_keys,
        test_tc10_supplier_200,
        test_tc11_recs_200,
        test_tc12_risk_levels,
        test_tc13_reorder_nonneg,
        test_tc14_critical_condition,
        test_tc15_unauthorized,
        test_tc16_regression_no_negative_stock,
    ]

    for t in tests:
        try:
            t()
        except Exception as e:
            tc(t.__name__, False, f"EXCEPTION: {e}")

    passed = sum(1 for _, s, _ in results if s == "PASS")
    total  = len(results)
    print(f"\n{'='*44}")
    print(f"  Phase 4: {passed}/{total} PASS")
    print(f"{'='*44}\n")
    sys.exit(0 if passed == total else 1)

if __name__ == "__main__":
    main()
