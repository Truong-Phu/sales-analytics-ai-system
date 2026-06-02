# -*- coding: utf-8 -*-
"""
Router /inventory – Thông minh dự báo hàng tồn kho và gợi ý đặt thêm.

Logic:
  1. Đọc tốc độ bán trung bình (units/ngày) từ 30 ngày gần nhất
  2. Đọc stock_quantity hiện tại
  3. Tính ngày hết hàng = stock / avg_daily_sales
  4. Phân loại: CRITICAL (<7 ngày), WARNING (<14 ngày), OK, OVERSTOCK
  5. Trả về danh sách sản phẩm kèm gợi ý đặt thêm

Hoàn toàn miễn phí – chỉ dùng pandas + psycopg2.
"""
import logging
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import query_df

logger = logging.getLogger("ai.inventory")

router = APIRouter(prefix="/inventory", tags=["Inventory Intelligence"])


# ── Pydantic Models ───────────────────────────────────────────────────────────

class InventoryItem(BaseModel):
    product_id:         str
    product_name:       str
    current_stock:      int
    avg_daily_sales:    float
    days_until_stockout: float   # -1 nếu không có tồn kho
    status:             str      # "CRITICAL" | "WARNING" | "OK" | "OVERSTOCK" | "NO_SALES"
    reorder_qty:        int      # Số lượng nên đặt thêm (= 30 ngày cung cấp)
    reorder_urgency:    str      # "IMMEDIATE" | "SOON" | "LATER" | "NONE"
    message:            str


class InventoryResponse(BaseModel):
    total_products:    int
    critical_count:    int
    warning_count:     int
    ok_count:          int
    overstock_count:   int
    analysis_days:     int
    items:             List[InventoryItem]
    note:              str
    is_mock:           bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _status_and_urgency(days: float, avg: float) -> tuple[str, str]:
    if avg <= 0:
        return "NO_SALES", "NONE"
    if days < 0:
        return "OUT_OF_STOCK", "IMMEDIATE"
    if days <= 7:
        return "CRITICAL", "IMMEDIATE"
    if days <= 14:
        return "WARNING", "SOON"
    if days >= 90:
        return "OVERSTOCK", "NONE"
    return "OK", "LATER"


def _reorder_qty(avg_daily: float, days_left: float, target_days: int = 30) -> int:
    """Đặt đủ hàng cho target_days ngày, trừ đi lượng còn lại."""
    needed = avg_daily * target_days
    already = avg_daily * max(days_left, 0)
    qty = max(int(needed - already), 0)
    return qty


def _message(status: str, name: str, days: float, qty: int) -> str:
    if status == "CRITICAL":
        return f"{name}: Còn {days:.0f} ngày hết hàng – Đặt ngay {qty} đơn vị!"
    if status == "WARNING":
        return f"{name}: Sắp hết trong {days:.0f} ngày – Lên kế hoạch đặt thêm {qty} đơn vị"
    if status == "OVERSTOCK":
        return f"{name}: Tồn kho nhiều ({days:.0f} ngày cung cấp) – Xem xét khuyến mãi để giải phóng hàng"
    if status == "NO_SALES":
        return f"{name}: Không có đơn hàng trong kỳ phân tích – Kiểm tra nhu cầu thị trường"
    if status == "OUT_OF_STOCK":
        return f"{name}: Đã hết hàng! Đặt ngay {qty} đơn vị"
    return f"{name}: Tình trạng bình thường ({days:.0f} ngày còn hàng)"




# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=InventoryResponse,
    summary="Thông minh dự báo tồn kho và gợi ý đặt thêm hàng",
    description=(
        "Tính tốc độ bán trung bình của từng sản phẩm → "
        "dự báo ngày hết hàng → phân loại mức độ khẩn cấp.\n\n"
        "**Status levels:**\n"
        "- 🔴 CRITICAL: Hết hàng trong < 7 ngày → Đặt NGAY\n"
        "- 🟡 WARNING: Hết hàng trong 7-14 ngày → Lên kế hoạch\n"
        "- 🟢 OK: Tình trạng bình thường\n"
        "- 🔵 OVERSTOCK: Tồn kho quá nhiều (>90 ngày) → Xem xét khuyến mãi"
    ),
)
def get_inventory_intelligence(
    days:       int            = Query(default=30,  ge=7,  le=90,  description="Số ngày tính tốc độ bán"),
    company_id: Optional[str] = Query(default=None, description="UUID công ty"),
    status:     Optional[str] = Query(default=None, description="Lọc: CRITICAL|WARNING|OK|OVERSTOCK"),
):
    # LEFT JOIN để hiện TẤT CẢ sản phẩm đang có tồn kho (is_active=TRUE, stock >= 0).
    # Sản phẩm không có đơn trong kỳ → avg_daily_sales = 0 → status = NO_SALES.
    cmp_prod   = "AND p.company_id = %(cid)s::uuid" if company_id else ""
    cmp_order  = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params: dict = {}
    if company_id:
        params["cid"] = company_id

    sales_sql = f"""
        SELECT
            p.product_id::text,
            p.product_name,
            p.stock_quantity,
            COALESCE(SUM(oi.quantity)::float, 0) / {int(days)} AS avg_daily_sales
        FROM public.products p
        LEFT JOIN public.order_items oi ON oi.product_id = p.product_id
        LEFT JOIN public.orders o ON o.order_id = oi.order_id
            AND o.status NOT IN ('CANCELLED', 'RETURNED')
            AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
            {cmp_order}
        WHERE p.is_active = TRUE
          AND p.stock_quantity > 0
          {cmp_prod}
        GROUP BY p.product_id, p.product_name, p.stock_quantity
        ORDER BY avg_daily_sales DESC, p.product_name
    """
    df = query_df(sales_sql, params or None)

    if df.empty:
        return InventoryResponse(
            total_products=0, critical_count=0, warning_count=0,
            ok_count=0, overstock_count=0, analysis_days=days,
            items=[],
            note="Chưa có sản phẩm nào trong kho",
            is_mock=False,
        )

    items: List[InventoryItem] = []
    for _, row in df.iterrows():
        avg   = float(row.get("avg_daily_sales", 0) or 0)
        stock = int(row.get("stock_quantity", 0) or 0)
        name  = str(row.get("product_name", ""))
        pid   = str(row.get("product_id",   ""))

        days_left = (stock / avg) if avg > 0 else 999.0
        stat, urgency = _status_and_urgency(days_left, avg)
        reorder = _reorder_qty(avg, days_left)
        msg     = _message(stat, name, days_left, reorder)

        item = InventoryItem(
            product_id=pid, product_name=name,
            current_stock=stock, avg_daily_sales=round(avg, 2),
            days_until_stockout=round(days_left, 1),
            status=stat, reorder_qty=reorder,
            reorder_urgency=urgency, message=msg,
        )
        items.append(item)

    # Lọc theo status nếu có
    if status:
        items = [i for i in items if i.status == status.upper()]

    critical  = sum(1 for i in items if i.status == "CRITICAL")
    warning   = sum(1 for i in items if i.status == "WARNING")
    ok        = sum(1 for i in items if i.status == "OK")
    overstock = sum(1 for i in items if i.status == "OVERSTOCK")

    return InventoryResponse(
        total_products=len(items),
        critical_count=critical,
        warning_count=warning,
        ok_count=ok,
        overstock_count=overstock,
        analysis_days=days,
        items=items,
        note=f"Phân tích {len(items)} sản phẩm dựa trên tốc độ bán {days} ngày gần nhất",
        is_mock=False,
    )
