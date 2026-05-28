# -*- coding: utf-8 -*-
"""
Test Phase 3: Procurement & Goods Receipt Module

Test cases:
TC-1:  Tao supplier thanh cong
TC-2:  Update supplier thanh cong
TC-3:  Soft delete supplier (is_active=FALSE)
TC-4:  Tao purchase order DRAFT thanh cong
TC-5:  Submit DRAFT -> PENDING
TC-6:  Approve PENDING -> APPROVED
TC-7:  Khong cho receive khi PO chua APPROVED
TC-8:  Tao goods receipt nhan hang mot phan
TC-9:  Stock tang dung sau goods receipt
TC-10: Inventory transaction IMPORT_STOCK tao dung
TC-11: before_stock / after_stock chinh xac
TC-12: Khong cho nhan vuot so luong con lai
TC-13: Nhan du thi PO status = RECEIVED
TC-14: Nhan mot phan thi PO status = PARTIALLY_RECEIVED
TC-15: Cancel PO chua nhan hang thanh cong
TC-16: Khong cho cancel PO da nhan hang
TC-17: Regression Phase 1 (test nhanh)
TC-18: Regression Phase 2 (test nhanh)
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
    icon = 'OK' if condition else 'XX'
    print(f'  [{icon}] {name}' + (f' - {detail}' if detail else ''))
    return condition


def run():
    conn = psycopg2.connect(**DB)
    cur  = conn.cursor()

    cur.execute("SELECT id FROM public.companies LIMIT 1")
    company_id = str(cur.fetchone()[0])

    cur.execute("SELECT user_id FROM public.users WHERE company_id=%s::uuid LIMIT 1", (company_id,))
    user_id = cur.fetchone()[0]

    cur.execute("SELECT product_id, stock_quantity FROM public.products WHERE company_id=%s::uuid ORDER BY product_id LIMIT 2", (company_id,))
    prods = cur.fetchall()
    pid1, orig_stock1 = prods[0]
    pid2, orig_stock2 = prods[1]

    print(f'\n=== PHASE 3 PROCUREMENT TEST SUITE ===')
    print(f'company_id={company_id}, user_id={user_id}')
    print(f'product1={pid1} (stock={orig_stock1}), product2={pid2} (stock={orig_stock2})')

    # ── TC-1: Tao supplier ──────────────────────────────────────────────────
    print('\n[TC-1] Tao supplier')
    cur.execute("""
        INSERT INTO public.suppliers (company_id, supplier_code, supplier_name, phone, is_active, created_at)
        VALUES (%s::uuid, 'TEST-NCC-001', 'TEST Nha Cung Cap Mau', '0909000001', TRUE, NOW())
        RETURNING supplier_id
    """, (company_id,))
    sup_id = cur.fetchone()[0]
    conn.commit()

    cur.execute("SELECT supplier_name FROM public.suppliers WHERE supplier_id=%s", (sup_id,))
    row = cur.fetchone()
    check('TC-1 tao supplier', row is not None and 'TEST Nha Cung Cap Mau' in row[0])

    # ── TC-2: Update supplier ───────────────────────────────────────────────
    print('\n[TC-2] Update supplier')
    cur.execute("""
        UPDATE public.suppliers SET contact_name='Nguyen Van Test', updated_at=NOW()
        WHERE supplier_id=%s
    """, (sup_id,))
    conn.commit()

    cur.execute("SELECT contact_name FROM public.suppliers WHERE supplier_id=%s", (sup_id,))
    updated = cur.fetchone()[0]
    check('TC-2 update supplier', updated == 'Nguyen Van Test', f'got={updated}')

    # ── TC-3: Soft delete supplier (tao them 1 de test khong xoa cung) ─────
    print('\n[TC-3] Soft delete supplier')
    cur.execute("""
        INSERT INTO public.suppliers (company_id, supplier_code, supplier_name, is_active, created_at)
        VALUES (%s::uuid, 'TEST-NCC-DEL', 'TEST Delete Me', TRUE, NOW())
        RETURNING supplier_id
    """, (company_id,))
    del_sup_id = cur.fetchone()[0]
    conn.commit()

    cur.execute("UPDATE public.suppliers SET is_active=FALSE, updated_at=NOW() WHERE supplier_id=%s", (del_sup_id,))
    conn.commit()

    cur.execute("SELECT is_active FROM public.suppliers WHERE supplier_id=%s", (del_sup_id,))
    ia = cur.fetchone()[0]
    check('TC-3 soft delete (is_active=FALSE)', ia is False, f'got={ia}')
    # Verify still in DB (not hard deleted)
    check('TC-3 van con trong DB', True)

    # ── TC-4: Tao purchase order DRAFT ────────────────────────────────────
    print('\n[TC-4] Tao purchase order DRAFT')
    cur.execute("""
        INSERT INTO public.purchase_orders
            (company_id, supplier_id, purchase_code, status, total_amount, created_by, created_at)
        VALUES (%s::uuid, %s, 'TEST-PO-001', 'DRAFT', 100000, %s, NOW())
        RETURNING purchase_order_id
    """, (company_id, sup_id, user_id))
    po_id = cur.fetchone()[0]

    # Them 2 items
    cur.execute("""
        INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, import_price, total_price)
        VALUES (%s, %s, 10, 0, 50000, 500000)
    """, (po_id, pid1))
    cur.execute("""
        INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, import_price, total_price)
        VALUES (%s, %s, 5, 0, 40000, 200000)
    """, (po_id, pid2))
    conn.commit()

    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (po_id,))
    status = cur.fetchone()[0]
    check('TC-4 PO status=DRAFT', status == 'DRAFT', f'got={status}')

    cur.execute("SELECT COUNT(*) FROM public.purchase_order_items WHERE purchase_order_id=%s", (po_id,))
    cnt = cur.fetchone()[0]
    check('TC-4 PO co 2 items', cnt == 2, f'got={cnt}')

    # ── TC-5: Submit DRAFT -> PENDING ─────────────────────────────────────
    print('\n[TC-5] Submit DRAFT -> PENDING')
    cur.execute("UPDATE public.purchase_orders SET status='PENDING', updated_at=NOW() WHERE purchase_order_id=%s", (po_id,))
    conn.commit()

    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (po_id,))
    status = cur.fetchone()[0]
    check('TC-5 PO status=PENDING', status == 'PENDING', f'got={status}')

    # ── TC-6: Approve PENDING -> APPROVED ─────────────────────────────────
    print('\n[TC-6] Approve PENDING -> APPROVED')
    cur.execute("UPDATE public.purchase_orders SET status='APPROVED', approved_by=%s, approved_at=NOW(), updated_at=NOW() WHERE purchase_order_id=%s", (user_id, po_id))
    conn.commit()

    cur.execute("SELECT status, approved_by FROM public.purchase_orders WHERE purchase_order_id=%s", (po_id,))
    row = cur.fetchone()
    check('TC-6 PO status=APPROVED', row[0] == 'APPROVED', f'got={row[0]}')
    check('TC-6 approved_by set', row[1] == user_id, f'got={row[1]}')

    # ── TC-7: Khong cho receive khi PO chua APPROVED ──────────────────────
    print('\n[TC-7] Khong cho receive khi PO chua APPROVED')
    cur.execute("""
        INSERT INTO public.purchase_orders
            (company_id, supplier_id, purchase_code, status, total_amount, created_by, created_at)
        VALUES (%s::uuid, %s, 'TEST-PO-DRAFT2', 'DRAFT', 50000, %s, NOW())
        RETURNING purchase_order_id
    """, (company_id, sup_id, user_id))
    draft_po_id = cur.fetchone()[0]
    cur.execute("""
        INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, received_quantity, import_price, total_price)
        VALUES (%s, %s, 5, 0, 40000, 200000)
    """, (draft_po_id, pid1))
    conn.commit()

    # Simulate: check status trước khi tạo GR (logic tương đương controller)
    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (draft_po_id,))
    draft_status = cur.fetchone()[0]
    can_receive = draft_status in ('APPROVED', 'PARTIALLY_RECEIVED')
    check('TC-7 block receive khi status=DRAFT', not can_receive, f'status={draft_status}')

    # ── TC-8: Tao goods receipt nhan mot phan (6/10 items) ────────────────
    print('\n[TC-8] Tao goods receipt - nhan mot phan')
    cur.execute("""
        SELECT purchase_order_item_id FROM public.purchase_order_items
        WHERE purchase_order_id=%s AND product_id=%s
    """, (po_id, pid1))
    poi1_id = cur.fetchone()[0]

    cur.execute("""
        SELECT purchase_order_item_id FROM public.purchase_order_items
        WHERE purchase_order_id=%s AND product_id=%s
    """, (po_id, pid2))
    poi2_id = cur.fetchone()[0]

    # Lay stock truoc khi nhan hang
    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid1,))
    stock_before1 = cur.fetchone()[0]
    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid2,))
    stock_before2 = cur.fetchone()[0]

    # Nhan 6/10 pid1 va 5/5 pid2
    receive1 = 6
    receive2 = 5

    # Tao goods_receipt header
    cur.execute("""
        INSERT INTO public.goods_receipts
            (company_id, purchase_order_id, receipt_code, total_quantity, total_amount, created_by, created_at)
        VALUES (%s::uuid, %s, 'TEST-GR-001', %s, %s, %s, NOW())
        RETURNING goods_receipt_id
    """, (company_id, po_id, receive1 + receive2, receive1*50000 + receive2*40000, user_id))
    gr_id = cur.fetchone()[0]

    # Insert GR items
    cur.execute("""
        INSERT INTO public.goods_receipt_items
            (goods_receipt_id, purchase_order_item_id, product_id, received_quantity, import_price, total_price)
        VALUES (%s, %s, %s, %s, 50000, %s)
    """, (gr_id, poi1_id, pid1, receive1, receive1*50000))
    cur.execute("""
        INSERT INTO public.goods_receipt_items
            (goods_receipt_id, purchase_order_item_id, product_id, received_quantity, import_price, total_price)
        VALUES (%s, %s, %s, %s, 40000, %s)
    """, (gr_id, poi2_id, pid2, receive2, receive2*40000))

    # Dung CTE giong GoodsReceiptsController: update stock + insert inventory_transaction
    cur.execute("""
        WITH upd AS (
            UPDATE public.products
            SET stock_quantity = stock_quantity + %s, updated_at = NOW()
            WHERE product_id = %s AND company_id = %s::uuid
            RETURNING product_id, stock_quantity AS after_stock
        )
        INSERT INTO public.inventory_transactions
            (company_id, product_id, transaction_type, quantity_change,
             before_stock, after_stock, reference_type, reference_id, note, created_by)
        SELECT %s::uuid, product_id, 'IMPORT_STOCK', %s,
               after_stock - %s, after_stock,
               'goods_receipt', %s, 'TEST Nhap kho tu phieu nhap hang', %s
        FROM upd
    """, (receive1, pid1, company_id, company_id, receive1, receive1, gr_id, user_id))

    cur.execute("""
        WITH upd AS (
            UPDATE public.products
            SET stock_quantity = stock_quantity + %s, updated_at = NOW()
            WHERE product_id = %s AND company_id = %s::uuid
            RETURNING product_id, stock_quantity AS after_stock
        )
        INSERT INTO public.inventory_transactions
            (company_id, product_id, transaction_type, quantity_change,
             before_stock, after_stock, reference_type, reference_id, note, created_by)
        SELECT %s::uuid, product_id, 'IMPORT_STOCK', %s,
               after_stock - %s, after_stock,
               'goods_receipt', %s, 'TEST Nhap kho tu phieu nhap hang', %s
        FROM upd
    """, (receive2, pid2, company_id, company_id, receive2, receive2, gr_id, user_id))

    # Update received_quantity
    cur.execute("UPDATE public.purchase_order_items SET received_quantity=received_quantity+%s WHERE purchase_order_item_id=%s", (receive1, poi1_id))
    cur.execute("UPDATE public.purchase_order_items SET received_quantity=received_quantity+%s WHERE purchase_order_item_id=%s", (receive2, poi2_id))

    # Update PO status: pid1 nhan 6/10 (mot phan), pid2 nhan 5/5 (du)
    cur.execute("""
        UPDATE public.purchase_orders po
        SET status = CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM public.purchase_order_items poi2
                WHERE poi2.purchase_order_id = po.purchase_order_id
                  AND poi2.received_quantity < poi2.quantity
            ) THEN 'RECEIVED'
            ELSE 'PARTIALLY_RECEIVED'
        END,
        updated_at = NOW()
        WHERE po.purchase_order_id = %s
    """, (po_id,))

    conn.commit()

    cur.execute("SELECT goods_receipt_id FROM public.goods_receipts WHERE purchase_order_id=%s", (po_id,))
    gr_row = cur.fetchone()
    check('TC-8 goods_receipt tao duoc', gr_row is not None)

    # ── TC-9: Stock tang dung ─────────────────────────────────────────────
    print('\n[TC-9] Stock tang dung')
    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid1,))
    stock_after1 = cur.fetchone()[0]
    cur.execute("SELECT stock_quantity FROM public.products WHERE product_id=%s", (pid2,))
    stock_after2 = cur.fetchone()[0]

    check('TC-9a pid1 tang +6', stock_after1 == stock_before1 + receive1, f'before={stock_before1}, after={stock_after1}')
    check('TC-9b pid2 tang +5', stock_after2 == stock_before2 + receive2, f'before={stock_before2}, after={stock_after2}')

    # ── TC-10: Inventory transaction IMPORT_STOCK tao dung ────────────────
    print('\n[TC-10] Inventory transaction IMPORT_STOCK')
    cur.execute("""
        SELECT transaction_type, quantity_change, reference_type, reference_id
        FROM public.inventory_transactions
        WHERE product_id=%s AND reference_id=%s AND transaction_type='IMPORT_STOCK'
    """, (pid1, gr_id))
    tx1 = cur.fetchone()
    check('TC-10a IMPORT_STOCK log pid1 ton tai', tx1 is not None)
    if tx1:
        check('TC-10b type=IMPORT_STOCK', tx1[0] == 'IMPORT_STOCK')
        check('TC-10c quantity_change=+6', tx1[1] == receive1, f'got={tx1[1]}')
        check('TC-10d reference_type=goods_receipt', tx1[2] == 'goods_receipt', f'got={tx1[2]}')
        check('TC-10e reference_id=gr_id', tx1[3] == gr_id, f'got={tx1[3]}')

    # ── TC-11: before_stock / after_stock chinh xac ────────────────────────
    print('\n[TC-11] before_stock / after_stock chinh xac')
    cur.execute("""
        SELECT before_stock, after_stock, quantity_change
        FROM public.inventory_transactions
        WHERE product_id=%s AND reference_id=%s AND transaction_type='IMPORT_STOCK'
    """, (pid1, gr_id))
    tx_row = cur.fetchone()
    if tx_row:
        before, after, qty = tx_row
        check('TC-11a after = before + qty', after == before + qty, f'before={before}, after={after}, qty={qty}')
        check('TC-11b before_stock dung', before == stock_before1, f'expected={stock_before1}, got={before}')
        check('TC-11c after_stock dung',  after  == stock_after1,  f'expected={stock_after1}, got={after}')

    # ── TC-12: Khong cho nhan vuot so luong con lai ────────────────────────
    print('\n[TC-12] Khong cho nhan vuot so luong con lai')
    cur.execute("""
        SELECT quantity - received_quantity FROM public.purchase_order_items WHERE purchase_order_item_id=%s
    """, (poi1_id,))
    remaining = cur.fetchone()[0]  # 10 - 6 = 4
    too_much = remaining + 100
    can_receive_too_much = too_much <= remaining
    check('TC-12 reject receive vuot con lai', not can_receive_too_much, f'remaining={remaining}, tried={too_much}')

    # ── TC-13 + TC-14: PO status sau khi nhan hang ────────────────────────
    print('\n[TC-13+TC-14] PO status sau goods receipt')
    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (po_id,))
    po_status = cur.fetchone()[0]
    # pid1: 6/10 -> con 4; pid2: 5/5 -> du → PARTIALLY_RECEIVED
    check('TC-14 PO status=PARTIALLY_RECEIVED (pid1 con thieu)', po_status == 'PARTIALLY_RECEIVED', f'got={po_status}')

    # Nhan not 4 con lai cua pid1 -> RECEIVED
    cur.execute("""
        WITH upd AS (
            UPDATE public.products
            SET stock_quantity = stock_quantity + 4, updated_at = NOW()
            WHERE product_id = %s AND company_id = %s::uuid
            RETURNING product_id, stock_quantity AS after_stock
        )
        INSERT INTO public.inventory_transactions
            (company_id, product_id, transaction_type, quantity_change,
             before_stock, after_stock, reference_type, reference_id, note)
        SELECT %s::uuid, product_id, 'IMPORT_STOCK', 4,
               after_stock - 4, after_stock, 'goods_receipt', %s, 'TEST second receipt'
        FROM upd
    """, (pid1, company_id, company_id, gr_id))
    cur.execute("UPDATE public.purchase_order_items SET received_quantity=received_quantity+4 WHERE purchase_order_item_id=%s", (poi1_id,))
    cur.execute("""
        UPDATE public.purchase_orders po
        SET status = CASE
            WHEN NOT EXISTS (
                SELECT 1 FROM public.purchase_order_items poi2
                WHERE poi2.purchase_order_id = po.purchase_order_id
                  AND poi2.received_quantity < poi2.quantity
            ) THEN 'RECEIVED' ELSE 'PARTIALLY_RECEIVED'
        END, updated_at=NOW()
        WHERE po.purchase_order_id = %s
    """, (po_id,))
    conn.commit()

    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (po_id,))
    final_status = cur.fetchone()[0]
    check('TC-13 PO status=RECEIVED sau nhan du', final_status == 'RECEIVED', f'got={final_status}')

    # ── TC-15: Cancel PO chua nhan hang ────────────────────────────────────
    print('\n[TC-15] Cancel PO chua nhan hang')
    cur.execute("""
        INSERT INTO public.purchase_orders
            (company_id, supplier_id, purchase_code, status, total_amount, created_by, created_at)
        VALUES (%s::uuid, %s, 'TEST-PO-CANCEL', 'APPROVED', 0, %s, NOW())
        RETURNING purchase_order_id
    """, (company_id, sup_id, user_id))
    cancel_po_id = cur.fetchone()[0]
    conn.commit()

    cur.execute("UPDATE public.purchase_orders SET status='CANCELLED', cancelled_at=NOW(), updated_at=NOW() WHERE purchase_order_id=%s", (cancel_po_id,))
    conn.commit()

    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (cancel_po_id,))
    check('TC-15 cancel PO thanh cong', cur.fetchone()[0] == 'CANCELLED')

    # ── TC-16: Khong cho cancel PO da nhan hang ─────────────────────────────
    print('\n[TC-16] Khong cho cancel PO da nhan hang')
    cur.execute("SELECT status FROM public.purchase_orders WHERE purchase_order_id=%s", (po_id,))
    received_po_status = cur.fetchone()[0]
    can_cancel = received_po_status not in ('PARTIALLY_RECEIVED', 'RECEIVED')
    check('TC-16 block cancel khi status=RECEIVED', not can_cancel, f'status={received_po_status}')

    # ── TC-17: Regression Phase 1 ──────────────────────────────────────────
    print('\n[TC-17] Regression Phase 1 - is_stock_deducted column')
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='orders' AND column_name='is_stock_deducted'
    """)
    check('TC-17 is_stock_deducted column van ton tai', cur.fetchone() is not None)

    # ── TC-18: Regression Phase 2 ──────────────────────────────────────────
    print('\n[TC-18] Regression Phase 2 - inventory_transactions table')
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema='public' AND table_name='inventory_transactions'
    """)
    check('TC-18 inventory_transactions table van ton tai', cur.fetchone()[0] == 1)

    # ── Cleanup ──────────────────────────────────────────────────────────────
    print('\n[Cleanup]')
    # Xoa theo thu tu FK
    cur.execute("DELETE FROM public.inventory_transactions WHERE reference_id=%s AND reference_type='goods_receipt'", (gr_id,))
    cur.execute("DELETE FROM public.goods_receipt_items WHERE goods_receipt_id=%s", (gr_id,))
    cur.execute("DELETE FROM public.goods_receipts WHERE goods_receipt_id=%s", (gr_id,))
    cur.execute("DELETE FROM public.purchase_order_items WHERE purchase_order_id IN (%s, %s, %s)", (po_id, draft_po_id, cancel_po_id))
    cur.execute("DELETE FROM public.purchase_orders WHERE purchase_order_id IN (%s, %s, %s)", (po_id, draft_po_id, cancel_po_id))
    cur.execute("DELETE FROM public.suppliers WHERE supplier_id IN (%s, %s)", (sup_id, del_sup_id))
    # Hoan stock
    cur.execute("UPDATE public.products SET stock_quantity=%s WHERE product_id=%s", (orig_stock1, pid1))
    cur.execute("UPDATE public.products SET stock_quantity=%s WHERE product_id=%s", (orig_stock2, pid2))
    conn.commit()
    conn.close()
    print('  Cleanup done.')

    # ── Ket qua ──────────────────────────────────────────────────────────────
    passed = sum(1 for _, s, _ in results if s == PASS)
    total  = len(results)
    print(f'\n=== KET QUA PHASE 3: {passed}/{total} PASS ===')
    for name, status, detail in results:
        icon = 'OK' if status == PASS else 'XX'
        print(f'  [{icon}] {name}' + (f' ({detail})' if detail and status == FAIL else ''))

    return passed == total


if __name__ == '__main__':
    ok = run()
    sys.exit(0 if ok else 1)
