import sys
import os
import io

os.environ['PYTHONUTF8'] = '1'

if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, 'src/api-integration')
sys.path.insert(0, 'src/ai-service')
sys.path.insert(0, 'src/etl')

print("=== TEST MUC 1 ===")

# Test 1: Google Scraper
print("\n[1] Chay Google Scraper...")
try:
    from connectors.google_scraper import GoogleScraper
    scraper = GoogleScraper()
    scraper.run()
    print("PASS - Google Scraper chay xong")
except Exception as e:
    print(f"FAIL - {e}")

# Test 2: Query Engine — kiểm tra search có dấu và không dấu
print("\n[2] Chay Query Engine...")
try:
    from query_engine import QueryEngine
    qe = QueryEngine()

    # 2a: Query không dấu (giống input cũ)
    ctx = qe.get_context("san pham ban chay nhat")
    google_no_accent = len(ctx.get('google_results', []))
    print(f"PASS - Keywords (khong dau): {ctx.get('keywords', [])}")
    print(f"     Google results (khong dau): {google_no_accent}")

    # 2b: Query có dấu tiếng Việt
    ctx2 = qe.get_context("sản phẩm bán chạy nhất")
    google_accent = len(ctx2.get('google_results', []))
    print(f"PASS - Keywords (co dau): {ctx2.get('keywords', [])}")
    print(f"     Google results (co dau): {google_accent}")

    # Đánh giá
    if google_no_accent > 0 and google_accent > 0:
        print("     => Ca 2 query deu tim duoc results - unaccent hoat dong dung")
    elif google_accent > 0:
        print("     => Co dau tim duoc, khong dau chua match (can kiem tra them)")
    else:
        print(f"     => Google results = 0 (DW co du lieu nen dung level2, google bi bo qua)")
    print(f"     Sales summary: {ctx.get('sales_summary', {})}")
    print(f"     Data level: {ctx.get('data_level', 'N/A')}")
except Exception as e:
    print(f"FAIL - {e}")