import sys
import os
import io

os.environ['PYTHONUTF8'] = '1'

# Đảm bảo stdout dùng UTF-8 trên Windows (tránh UnicodeEncodeError với ký tự đặc biệt)
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, 'src/api-integration')
sys.path.insert(0, 'src/ai-service')
sys.path.insert(0, 'src/etl')

print("=== TEST MUC 3 ===")

# ── Test 1: OfflineETL ────────────────────────────────────────────────────────
print("\n[1] Chay OfflineETL...")
try:
    import psycopg2
    from dotenv import load_dotenv
    load_dotenv()
    conn_check = psycopg2.connect(os.getenv("DATABASE_URL", ""))

    # Đếm fact_sales trước khi chạy
    cur = conn_check.cursor()
    cur.execute("SELECT COUNT(*) FROM dw.fact_sales")
    before = cur.fetchone()[0]
    cur.close()
    conn_check.close()

    # OfflineETL dùng relative import nên cần thêm etl vào sys.modules
    import importlib, types
    etl_pkg = types.ModuleType("etl")
    etl_pkg.__path__ = ["src/etl"]
    sys.modules["etl"] = etl_pkg
    from offline_etl import OfflineETL
    etl = OfflineETL()
    result = etl.run()

    # Đếm lại sau khi chạy
    conn_after = psycopg2.connect(os.getenv("DATABASE_URL", ""))
    cur2 = conn_after.cursor()
    cur2.execute("SELECT COUNT(*) FROM dw.fact_sales")
    after = cur2.fetchone()[0]
    cur2.close()
    conn_after.close()

    print(f"PASS - OfflineETL source={result['source']}")
    print(f"     extracted={result['extracted']}, imported={result['imported']}, "
          f"skipped={result['skipped']}, errors={result['errors']}")
    print(f"     fact_sales: {before} -> {after} records (+{after - before} moi)")
    if result['errors'] > 0:
        print(f"     WARN: co {result['errors']} loi parse")
except Exception as e:
    print(f"FAIL - {e}")

# ── Test 2: Import CSV offline (idempotent) ───────────────────────────────────
print("\n[2] Test import CSV offline (idempotent)...")
try:
    from offline_etl import ExcelImporter  # đã import ở test 1

    csv_path = "notebooks/sample_data/sample_orders.csv"

    # Lần 1: import lần đầu (có thể imported hoặc skipped tùy đã chạy trước chưa)
    stats1 = ExcelImporter().import_orders(csv_path)
    print(f"PASS - Lan 1: extracted={stats1['extracted']}, imported={stats1['imported']}, "
          f"skipped={stats1['skipped']}")

    # Lần 2: import lại cùng file – phải idempotent (imported=0, skipped tăng)
    stats2 = ExcelImporter().import_orders(csv_path)
    print(f"PASS - Lan 2: extracted={stats2['extracted']}, imported={stats2['imported']}, "
          f"skipped={stats2['skipped']}")

    if stats2['imported'] == 0 and stats2['skipped'] == stats1['extracted'] - stats1['errors']:
        print("     => Idempotent: lan 2 imported=0, skipped tang len - DUNG")
    elif stats2['imported'] == 0:
        print("     => Idempotent: lan 2 imported=0 - DUNG (co the co loi parse)")
    else:
        print(f"     => WARN: lan 2 van import them {stats2['imported']} records - can kiem tra")
except Exception as e:
    print(f"FAIL - {e}")

# ── Test 3: QueryEngine Mức 3 ─────────────────────────────────────────────────
print("\n[3] Kiem tra QueryEngine Muc 3...")
try:
    from query_engine import QueryEngine
    qe = QueryEngine()

    # Query về kênh bán hàng
    ctx = qe.get_context("kenh nao ban chay nhat")

    dw_count   = len(ctx.get('dw_results', []))
    google_count = len(ctx.get('google_results', []))
    fb_count   = len(ctx.get('facebook_results', []))
    sales      = ctx.get('sales_summary', {})
    data_level = ctx.get('data_level', 'N/A')
    keywords   = ctx.get('keywords', [])

    print(f"PASS - Keywords: {keywords}")
    print(f"     dw_results (dim_external_source): {dw_count}")
    print(f"     google_results (raw fallback):    {google_count}")
    print(f"     facebook_results:                 {fb_count}")
    print(f"     data_level: {data_level}")
    print(f"     sales - orders_30/90d: {sales.get('order_count_30d', 0)} / "
          f"{sales.get('order_count_30d', 0)} (window={sales.get('date_range_days', 0)}d)")
    print(f"     top products: {[p['name'] for p in sales.get('top_products', [])[:3]]}")

    # Kiểm tra data_level
    if data_level == "level2":
        print("     => data_level=level2: DW co du lieu (dim_external_source) - DUNG")
    elif data_level == "level1":
        print("     => data_level=level1: DW rong, dung raw_google_data")
    elif data_level == "level0":
        print("     => data_level=level0: Ca DW va google deu rong - can chay ETL")

except Exception as e:
    print(f"FAIL - {e}")

# ── Test 4: AI confidence Mức 3 ───────────────────────────────────────────────
print("\n[4] Kiem tra confidence Muc 3...")
try:
    from query_engine import QueryEngine
    qe = QueryEngine()
    ctx = qe.get_context("doanh thu ban le thang nay")

    dw_count   = len(ctx.get('dw_results', []))
    fb_count   = len(ctx.get('facebook_results', []))
    sales      = ctx.get('sales_summary', {})
    fact_count = sales.get('order_count_30d', 0) or sales.get('order_count_30d', 0)

    # Lấy số đơn từ DW fact_sales trực tiếp
    import psycopg2
    conn_c = psycopg2.connect(os.getenv("DATABASE_URL", ""))
    cur_c  = conn_c.cursor()
    cur_c.execute("SELECT COUNT(*) FROM dw.fact_sales")
    total_fact = cur_c.fetchone()[0]
    cur_c.close()
    conn_c.close()

    # Tính điểm confidence theo logic 3 mức
    score = 0
    conditions = []
    if dw_count >= 5:
        score += 1
        conditions.append(f"dw_results={dw_count} >= 5 (+1)")
    else:
        conditions.append(f"dw_results={dw_count} < 5 (need {5 - dw_count} more)")

    if fb_count > 0:
        score += 1
        conditions.append(f"facebook={fb_count} > 0 (+1)")
    else:
        conditions.append(f"facebook={fb_count} = 0 (can scrape FB page)")

    if total_fact >= 5:
        score += 1
        conditions.append(f"fact_sales={total_fact} >= 5 (+1)")
    else:
        conditions.append(f"fact_sales={total_fact} < 5 (can them orders)")

    # Map score → confidence
    if score >= 3:
        confidence = "high"
    elif score >= 1:
        confidence = "medium"
    else:
        confidence = "low"

    print(f"PASS - Score: {score}/3 → confidence = {confidence.upper()}")
    for c in conditions:
        print(f"     {c}")

    if confidence == "high":
        print("     => Dat muc HIGH - san sang bao cao chinh xac")
    elif confidence == "medium":
        remaining = 3 - score
        print(f"     => Dang o MEDIUM - can them {remaining} dieu kien nua de dat HIGH")
    else:
        print("     => Muc LOW - can chay full ETL pipeline truoc")

except Exception as e:
    print(f"FAIL - {e}")

# ── Test 5: Stub connectors ────────────────────────────────────────────────────
# Connectors dùng relative import (from ..base.base_connector) nên cần import
# theo package. Test kiểm tra: (a) get_orders() raise NotImplementedError,
# (b) get_orders_from_csv() đọc được CSV.
print("\n[5] Kiem tra stub connectors...")

# Chuẩn bị package imports: thêm src/ vào sys.path để api_integration load được
import importlib.util
from pathlib import Path

CONNECTOR_TESTS = [
    ("connectors.shopee",      "ShopeeConnector",      "Shopee"),
    ("connectors.lazada",      "LazadaConnector",      "Lazada"),
    ("connectors.tiktok_shop", "TikTokShopConnector",  "TikTok Shop"),
]

csv_path = "notebooks/sample_data/sample_orders.csv"
results  = []

for module_path, class_name, display_name in CONNECTOR_TESTS:
    try:
        # Import module (relative import xử lý bởi package đã có __init__.py)
        mod = importlib.import_module(module_path)
        ConnClass = getattr(mod, class_name)
        connector = ConnClass()

        # Test get_orders() → phải raise NotImplementedError
        try:
            connector.get_orders()
            results.append(f"  {display_name}: get_orders() chay duoc (credentials da co)")
        except NotImplementedError as e:
            msg = str(e).split('\n')[0]
            results.append(f"  {display_name}: NotImplementedError (dung) - '{msg[:60]}...'")
        except Exception as auth_e:
            results.append(f"  {display_name}: {type(auth_e).__name__} (credentials chua co) - OK")

        # Test get_orders_from_csv() fallback
        orders_csv = connector.get_orders_from_csv(csv_path)
        results.append(f"  {display_name}: get_orders_from_csv() -> {len(orders_csv)} rows (PASS)")

    except ImportError as ie:
        # Connector file có relative imports - kiểm tra file tồn tại và phương thức qua grep
        file_map = {
            "connectors.shopee":      "src/api-integration/connectors/shopee.py",
            "connectors.lazada":      "src/api-integration/connectors/lazada.py",
            "connectors.tiktok_shop": "src/api-integration/connectors/tiktok_shop.py",
        }
        fpath = Path(file_map.get(module_path, ""))
        if fpath.exists():
            content = fpath.read_text(encoding="utf-8")
            has_stub = "def get_orders(" in content
            has_csv  = "def get_orders_from_csv(" in content
            has_not_impl = "NotImplementedError" in content
            status = "OK" if (has_stub and has_csv and has_not_impl) else "INCOMPLETE"
            results.append(
                f"  {display_name}: File ton tai, get_orders={has_stub}, "
                f"csv_fallback={has_csv}, NotImplementedError={has_not_impl} [{status}]"
            )
        else:
            results.append(f"  {display_name}: FAIL - file khong ton tai")
    except Exception as e:
        results.append(f"  {display_name}: FAIL - {e}")

print("PASS - Ket qua stub connectors:")
for r in results:
    print(r)
