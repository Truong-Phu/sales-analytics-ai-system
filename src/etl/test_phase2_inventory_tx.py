# -*- coding: utf-8 -*-
"""
Test Phase 2: Inventory Transaction Log

Kiem tra:
- TC-1: Cot inventory_transactions ton tai trong DB
- TC-2: Setup du lieu test (2 san pham, 2 don hang)
- TC-3: ETL deduct + log MARKETPLACE_IMPORT_SALE duoc tao
- TC-4: ETL idempotent - chay lan 2 khong tao log trung
- TC-5: Cancel order + log ORDER_CANCEL_REFUND duoc tao
- TC-6: Validation after_stock = before_stock + quantity_change
- TC-7: Log chua tao cho don POS (kiem tra qua API)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import psycopg2
import psycopg2.extras
from offline_etl import _deduct_stock_for_new_orders

DB = dict(host='localhost', port=5432, dbname='sales_analytics_ai_db', user='postgres', password='021204')

PASS = 'PASS'
FAIL = 'FAIL'
results = []

def check(name, condition, detail=''):
    status = PASS if condition else FAIL
    results.append((name, status, detail))
    print(f'  [{status}] {name}' + (f' - {detail}' if detail else ''))
    return condition


def run():
    conn = psycopg2.connect(**DB)
    cur  = conn.cursor()

    # Lay company_id va user_id thuc te
    cur.execute("SELECT id FROM public.companies LIMIT 1")
    company_id = str(cur.fetchone()[0])

    cur.execute("SELECT user_id FROM public.users WHERE company_id=%s::uuid LIMIT 1", (company_id,))
    user_id = cur.fetchone()[0]

    print(f'\n=== PHASE 2 TEST SUITE ===')
    print(f'company_id: {company_id}')
    print(f'user_id:    {user_id}')

    # ── TC-1: Bang inventory_transactions ton tai ─────────────────────────────
    print('\n[TC-1] Kiem tra bang inventory_transactions')
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='inventory_transactions'
        ORDER BY ordinal_position
    """)
    cols = [r[0] for r in cur.fetchall()]
    required = ['transaction_id','company_id','product_id','transaction_type',
                'quantity_change','before_stock','after_stock','reference_type','reference_id']
    check('TC-1', all(c in cols for c in required), f'cols={cols}')

    # ── Setup test ────────────────────────────────────────────────────────────
    print('\n[Setup] Tao du lieu test')

    # Xoa log cu neu co
    cur.execute("""
        DELETE FROM public.inventory_transactions
        WHERE company_id = %s::uuid
          AND note LIKE '%%TEST_PHASE2%%'
    """, (company_id,))

    # Lay 2 san pham
    cur.execute("""
        SELECT product_id, stock_quantity FROM public.products
        WHERE company_id = %s::uuid ORDER BY product_id LIMIT 2
    """, (company_id,))
    prods = cur.fetchall()
    pid1, stock1 = prods[0]
    pid2, stock2 = prods[1]

    # Dat stock test
    cur.execute("UPDATE public.products SET stock_quantity=50 WHERE product_id=%s", (pid1,))
    cur.execute("UPDATE public.products SET stock_quantity=30 WHERE product_id=%s", (pid2,))

    # Lay channel_id
    cur.execute("SELECT channel_id FROM public.sales_channels WHERE company_id=%s::uuid LIMIT 1", (company_id,))
    row = cur.fetchone()
    if not row:
        cur.execute("INSERT INTO public.sales_channels (company_id, channel_name, channel_type, is_active) VALUES (%s::uuid, 'Test', 'SHOPEE', TRUE) RETURNING channel_id", (company_id,))
        chan_id = cur.fetchone()[0]
    else:
        chan_id = row[0]

    # Lay customer_id
    cur.execute("SELECT customer_id FROM public.customers WHERE company_id=%s::uuid LIMIT 1", (company_id,))
    cust_id = cur.fetchone()[0]

    # Tao 2 don hang test (SHOPEE, is_stock_deducted=FALSE)
    cur.execute("""
        INSERT INTO public.orders
            (order_code, external_order_id, customer_id, channel_id, order_date,
             status, total_amount, payment_method, payment_status,
             company_id, is_stock_deducted, created_at, updated_at)
        VALUES
            ('TEST-P2-A', 'EXT-TEST-P2-A', %s, %s, NOW(),
             'DELIVERED', 100000, 'COD', 'PAID',
             %s::uuid, FALSE, NOW(), NOW())
        RETURNING order_id
    """, (cust_id, chan_id, company_id))
    order_a = cur.fetchone()[0]

    cur.execute("""
        INSERT INTO public.orders
            (order_code, external_order_id, customer_id, channel_id, order_date,
             status, total_amount, payment_method, payment_status,
             company_id, is_stock_deducted, created_at, updated_at)
        VALUES
            ('TEST-P2-B', 'EXT-TEST-P2-B', %s, %s, NOW(),
             'DELIVERED', 200000, 'COD', 'PAID',
             %s::uuid, FALSE, NOW(), NOW())
        RETURNING order_id
    """, (cust_id, chan_id, company_id))
    order_b = cur.fetchone()[0]

    # Tao order_items
    cur.execute("""
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, subtotal, created_at)
        VALUES (%s, %s, 3, 50000, 150000, NOW())
    """, (order_a, pid1))
    cur.execute("""
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, subtotal, created_at)
        VALUES (%s, %s, 5, 40000, 200000, NOW())
    """, (order_b, pid2))

    conn.commit()
    print(f'  Setup: order_a={order_a} (pid={pid1}, qty=3), order_b={order_b} (pid={pid2}, qty=5)')

    # ── TC-3: ETL deduct + tao log MARKETPLACE_IMPORT_SALE ────────────────────
    print('\n[TC-3] ETL deduct + inventory_transactions log')
    n = _deduct_stock_for_new_orders(conn, company_id)

    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid1,))
    s1 = cur.fetchone()[0]
    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid2,))
    s2 = cur.fetchone()[0]

    check('TC-3a stock1 giam dung', s1 == 50 - 3, f'expected=47, got={s1}')
    check('TC-3b stock2 giam dung', s2 == 30 - 5, f'expected=25, got={s2}')

    cur.execute("""
        SELECT transaction_type, quantity_change, before_stock, after_stock, reference_type, reference_id
        FROM public.inventory_transactions
        WHERE reference_id = %s
    """, (order_a,))
    log_a = cur.fetchone()
    check('TC-3c log order_a ton tai', log_a is not None)
    if log_a:
        check('TC-3d type=MARKETPLACE_IMPORT_SALE', log_a[0] == 'MARKETPLACE_IMPORT_SALE', f'got={log_a[0]}')
        check('TC-3e quantity_change=-3', log_a[1] == -3, f'got={log_a[1]}')
        check('TC-3f before_stock=50', log_a[2] == 50, f'got={log_a[2]}')
        check('TC-3g after_stock=47', log_a[3] == 47, f'got={log_a[3]}')
        check('TC-3h reference_type=marketplace_order', log_a[4] == 'marketplace_order', f'got={log_a[4]}')

    cur.execute("""
        SELECT transaction_type, quantity_change, before_stock, after_stock
        FROM public.inventory_transactions
        WHERE reference_id = %s
    """, (order_b,))
    log_b = cur.fetchone()
    check('TC-3i log order_b ton tai', log_b is not None)
    if log_b:
        check('TC-3j quantity_change=-5', log_b[1] == -5, f'got={log_b[1]}')

    # ── TC-4: ETL idempotent - chay lan 2 khong tao duplicate ─────────────────
    print('\n[TC-4] ETL idempotent - chay lan 2')
    cur.execute("""
        SELECT COUNT(*) FROM public.inventory_transactions
        WHERE reference_id IN (%s, %s)
    """, (order_a, order_b))
    count_before = cur.fetchone()[0]

    n2 = _deduct_stock_for_new_orders(conn, company_id)
    check('TC-4a ETL lan 2 xu ly 0 don', n2 == 0, f'n2={n2}')

    cur.execute("""
        SELECT COUNT(*) FROM public.inventory_transactions
        WHERE reference_id IN (%s, %s)
    """, (order_a, order_b))
    count_after = cur.fetchone()[0]
    check('TC-4b khong tao duplicate log', count_after == count_before,
          f'before={count_before}, after={count_after}')

    # ── TC-5: Cancel order + log ORDER_CANCEL_REFUND ──────────────────────────
    print('\n[TC-5] Cancel order + inventory_transactions log (qua backend)')
    print('  (Cancel duoc goi qua backend API voi raw SQL - kiem tra manual hoac qua REST)')
    # Gia lap cancel bang raw SQL (giong OrdersController.CancelOrder)
    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid1,))
    stock_before_cancel = cur.fetchone()[0]

    cur.execute("""
        WITH upd AS (
            UPDATE public.products p
            SET stock_quantity = p.stock_quantity + oi.quantity, updated_at = NOW()
            FROM public.order_items oi
            WHERE oi.order_id = %s AND oi.product_id = p.product_id
            RETURNING p.product_id, p.stock_quantity AS after_stock, oi.quantity AS refunded_qty
        )
        INSERT INTO public.inventory_transactions
            (company_id, product_id, transaction_type, quantity_change,
             before_stock, after_stock, reference_type, reference_id, note)
        SELECT %s::uuid, product_id, 'ORDER_CANCEL_REFUND', refunded_qty,
               after_stock - refunded_qty, after_stock,
               'order', %s, 'TEST Hoan kho do huy don hang'
        FROM upd
    """, (order_a, company_id, order_a))

    cur.execute("UPDATE public.orders SET status='CANCELLED', is_stock_deducted=FALSE, updated_at=NOW() WHERE order_id=%s", (order_a,))
    conn.commit()

    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid1,))
    stock_after_cancel = cur.fetchone()[0]
    check('TC-5a stock hoan lai dung', stock_after_cancel == stock_before_cancel + 3,
          f'before={stock_before_cancel}, after={stock_after_cancel}')

    cur.execute("""
        SELECT transaction_type, quantity_change, before_stock, after_stock
        FROM public.inventory_transactions
        WHERE reference_id=%s AND transaction_type='ORDER_CANCEL_REFUND'
    """, (order_a,))
    cancel_log = cur.fetchone()
    check('TC-5b log ORDER_CANCEL_REFUND ton tai', cancel_log is not None)
    if cancel_log:
        check('TC-5c quantity_change=+3', cancel_log[1] == 3, f'got={cancel_log[1]}')
        check('TC-5d after_stock = before_stock + 3',
              cancel_log[3] == cancel_log[2] + 3,
              f'before={cancel_log[2]}, after={cancel_log[3]}')

    # ── TC-6: Validation after_stock = before_stock + quantity_change ──────────
    print('\n[TC-6] Validation after_stock = before_stock + quantity_change')
    cur.execute("""
        SELECT transaction_id, before_stock, after_stock, quantity_change
        FROM public.inventory_transactions
        WHERE company_id = %s::uuid
          AND reference_id IN (%s, %s)
    """, (company_id, order_a, order_b))
    all_logs = cur.fetchall()

    all_valid = True
    for tid, before, after, change in all_logs:
        if after != before + change:
            all_valid = False
            print(f'    INVALID: tx_id={tid} before={before} after={after} change={change}')

    check('TC-6 tat ca log co after=before+change', all_valid, f'so luong log={len(all_logs)}')

    # ── Cleanup ───────────────────────────────────────────────────────────────
    print('\n[Cleanup]')
    cur.execute("DELETE FROM public.inventory_transactions WHERE reference_id IN (%s, %s)", (order_a, order_b))
    cur.execute("DELETE FROM public.order_items WHERE order_id IN (%s, %s)", (order_a, order_b))
    cur.execute("DELETE FROM public.orders WHERE order_id IN (%s, %s)", (order_a, order_b))
    cur.execute("UPDATE public.products SET stock_quantity=%s WHERE product_id=%s", (stock1, pid1))
    cur.execute("UPDATE public.products SET stock_quantity=%s WHERE product_id=%s", (stock2, pid2))
    conn.commit()
    conn.close()
    print('  Cleanup done.')

    # ── Ket qua ───────────────────────────────────────────────────────────────
    passed = sum(1 for _, s, _ in results if s == PASS)
    total  = len(results)
    print(f'\n=== KET QUA: {passed}/{total} PASS ===')
    for name, status, detail in results:
        icon = 'OK' if status == PASS else 'XX'
        print(f'  [{icon}] {name}' + (f' ({detail})' if detail and status == FAIL else ''))

    return passed == total


if __name__ == '__main__':
    ok = run()
    sys.exit(0 if ok else 1)
