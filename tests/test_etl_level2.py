import sys
import os
import io

os.environ['PYTHONUTF8'] = '1'

if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, 'src/api-integration')
sys.path.insert(0, 'src/ai-service')
sys.path.insert(0, 'src/etl')

print("=== TEST MUC 2 ===")

# Test 1: Clean
print("\n[1] Chay Clean...")
try:
    from transform.clean import RawDataCleaner
    cleaner = RawDataCleaner()
    cleaner.add_missing_columns()
    n = cleaner.clean_google_batch()
    print(f"PASS - Da clean: {n} records")
except Exception as e:
    print(f"FAIL - {e}")

# Test 2: Normalize
print("\n[2] Chay Normalize...")
try:
    from transform.normalize import RawDataNormalizer
    norm = RawDataNormalizer()
    norm.add_missing_columns()
    n = norm.normalize_google()
    print(f"PASS - Da normalize: {n} records")
except Exception as e:
    print(f"FAIL - {e}")

# Test 3: Load DW
print("\n[3] Load vao Data Warehouse...")
try:
    from load import DataLoader
    n = DataLoader().load_google_to_dw()
    print(f"PASS - Da load vao DW: {n} records")
except Exception as e:
    print(f"FAIL - {e}")

# Test 4: Kiem tra confidence
print("\n[4] Kiem tra AI confidence sau Muc 2...")
try:
    from query_engine import QueryEngine
    qe = QueryEngine()
    ctx = qe.get_context("san pham ban chay nhat")
    dw_count = len(ctx.get('dw_results', []))
    print(f"PASS - DW records: {dw_count}")
    if dw_count >= 5:
        print("     => confidence se la: medium")
    else:
        print(f"     => Can them {5 - dw_count} records nua de dat medium")
except Exception as e:
    print(f"FAIL - {e}")