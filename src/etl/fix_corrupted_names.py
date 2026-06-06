# -*- coding: utf-8 -*-
"""
fix_corrupted_names.py
----------------------
Dọn dẹp tên khách hàng bị lỗi từ import cũ.

Nguyên nhân lỗi: template Lazada cũ lệch cột Voucher → customer_name
lưu thành "0 Nguyễn", "0 Trần", v.v. (tiền tố số + dấu cách + họ).

Script này:
  1. Update orders.customer_name  — xóa tiền tố "<số> "
  2. Update customers.full_name   — xóa tiền tố "<số> "
  3. In báo cáo số bản ghi đã sửa

Chạy: python fix_corrupted_names.py
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

CONN_STR = os.getenv(
    "DATABASE_URL",
    "host=localhost port=5432 dbname=SalesAnalyticsDB user=postgres password=postgres",
)


def fix_names():
    conn = psycopg2.connect(CONN_STR)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 1. Fix orders.customer_name
        cur.execute("""
            UPDATE public.orders
            SET customer_name = TRIM(REGEXP_REPLACE(customer_name, '^\\d+\\s+', ''))
            WHERE customer_name ~ '^\\d+\\s'
        """)
        orders_fixed = cur.rowcount
        print(f"orders.customer_name: {orders_fixed} bản ghi đã sửa")

        # 2. Fix orders.shipping_name (cùng nguồn lỗi)
        cur.execute("""
            UPDATE public.orders
            SET shipping_name = TRIM(REGEXP_REPLACE(shipping_name, '^\\d+\\s+', ''))
            WHERE shipping_name ~ '^\\d+\\s'
        """)
        shipping_fixed = cur.rowcount
        print(f"orders.shipping_name:  {shipping_fixed} bản ghi đã sửa")

        # 3. Fix customers.full_name
        cur.execute("""
            UPDATE public.customers
            SET full_name = TRIM(REGEXP_REPLACE(full_name, '^\\d+\\s+', ''))
            WHERE full_name ~ '^\\d+\\s'
        """)
        customers_fixed = cur.rowcount
        print(f"customers.full_name:   {customers_fixed} bản ghi đã sửa")

        conn.commit()
        print(f"\nHoàn tất. Tổng: {orders_fixed + shipping_fixed + customers_fixed} bản ghi.")
    except Exception as e:
        conn.rollback()
        print(f"Lỗi: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    fix_names()
