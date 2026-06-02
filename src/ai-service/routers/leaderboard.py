# -*- coding: utf-8 -*-
"""
Router /leaderboard – Bảng xếp hạng hiệu suất bán hàng.

Hiển thị bảng xếp hạng:
  1. Nhân viên theo doanh thu (gamification cho staff)
  2. Sản phẩm bán chạy nhất
  3. Khách hàng VIP (theo monetary)
  4. Kênh bán chạy nhất

Hoàn toàn miễn phí – chỉ dùng psycopg2 + pandas.
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import query_df

logger = logging.getLogger("ai.leaderboard")

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


class RankEntry(BaseModel):
    rank:       int
    name:       str
    value:      float       # Doanh thu / Số lượng tuỳ context
    value_label: str        # "12,500,000 VNĐ" / "150 đơn"
    orders:     int
    badge:      str         # "🥇" | "🥈" | "🥉" | ""
    trend:      str         # "UP" | "DOWN" | "STABLE"
    change_pct: float       # % thay đổi so với kỳ trước


class LeaderboardResponse(BaseModel):
    category:         str   # "staff" | "product" | "customer" | "channel"
    period_label:     str
    analysis_days:    int
    entries:          List[RankEntry]
    total_revenue:    float
    is_mock:          bool


def _badge(rank: int) -> str:
    return {1: "🥇", 2: "🥈", 3: "🥉"}.get(rank, "")


def _fmt_vnd(val: float) -> str:
    if val >= 1_000_000_000:
        return f"{val/1_000_000_000:.1f} tỷ VNĐ"
    if val >= 1_000_000:
        return f"{val/1_000_000:.1f} triệu VNĐ"
    return f"{val:,.0f} VNĐ"


def _empty_leaderboard(category: str, days: int, period_label: str = "") -> LeaderboardResponse:
    """Trả về response rỗng khi không có đủ dữ liệu — không bao giờ trả mock."""
    if not period_label:
        period_map = {7: "7 ngày", 14: "14 ngày", 30: "30 ngày", 90: "90 ngày", 365: "1 năm"}
        period_label = period_map.get(days, f"{days} ngày") + " gần nhất"
    return LeaderboardResponse(
        category=category,
        period_label=period_label,
        analysis_days=days,
        entries=[],
        total_revenue=0.0,
        is_mock=False,
    )


@router.get(
    "",
    response_model=LeaderboardResponse,
    summary="Bảng xếp hạng hiệu suất bán hàng",
    description=(
        "Hiển thị top performers theo danh mục:\n"
        "- `product`: Sản phẩm bán chạy nhất\n"
        "- `customer`: Khách hàng VIP (doanh thu cao nhất)\n"
        "- `channel`: Kênh bán hiệu quả nhất\n"
        "- `staff`: Nhân viên doanh số cao nhất (gamification)\n\n"
        "Kèm trend so sánh với kỳ trước."
    ),
)
def get_leaderboard(
    category:   str            = Query(default="product", description="product|customer|channel|staff"),
    days:       int            = Query(default=30, ge=1, le=3650),
    top_n:      int            = Query(default=10, ge=3, le=50),
    company_id: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None, description="YYYY-MM-DD — nếu có thì dùng date range thay vì days"),
    end_date:   Optional[str] = Query(default=None, description="YYYY-MM-DD exclusive"),
):
    valid_cats = ("product", "customer", "channel", "staff", "staff_warehouse", "staff_marketing")
    if category not in valid_cats:
        category = "product"

    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params: dict = {}
    if company_id:
        params["cid"] = company_id

    # Tính date filter và period label
    if start_date and end_date:
        curr_date_filter = f"AND o.order_date >= '{start_date}' AND o.order_date < '{end_date}'"
        sd_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        ed_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        duration = max((ed_dt - sd_dt).days, 1)
        prev_sd = (sd_dt - timedelta(days=duration)).isoformat()
        prev_filter = f"AND o.order_date >= '{prev_sd}' AND o.order_date < '{start_date}'"
        # Label: hiện end_date - 1 ngày (vì end_date là exclusive)
        display_end = (ed_dt - timedelta(days=1)).strftime("%d/%m/%Y")
        period_label = f"{sd_dt.strftime('%d/%m/%Y')} – {display_end}"
        analysis_days = duration
    else:
        curr_date_filter = f"AND o.order_date >= NOW() - INTERVAL '{int(days)} days'"
        prev_filter = f"AND o.order_date >= NOW() - INTERVAL '{int(days*2)} days' AND o.order_date < NOW() - INTERVAL '{int(days)} days'"
        period_map = {7: "7 ngày", 14: "14 ngày", 30: "30 ngày", 90: "90 ngày", 365: "1 năm"}
        period_label = period_map.get(days, f"{days} ngày") + " gần nhất"
        analysis_days = days

    if company_id:
        prev_filter += " AND o.company_id = %(cid)s::uuid"

    if category == "product":
        sql = f"""
            WITH curr AS (
                SELECT p.product_id, p.product_name,
                       SUM(oi.subtotal)        AS value,
                       COUNT(DISTINCT o.order_id) AS orders
                FROM public.order_items oi
                JOIN public.orders   o ON oi.order_id   = o.order_id
                JOIN public.products p ON oi.product_id = p.product_id
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                  {curr_date_filter}
                  {cmp_filter}
                GROUP BY p.product_id, p.product_name
            ),
            prev AS (
                SELECT oi.product_id, SUM(oi.subtotal) AS prev_value
                FROM public.order_items oi
                JOIN public.orders o ON oi.order_id = o.order_id
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                  {prev_filter}
                GROUP BY oi.product_id
            )
            SELECT c.product_name AS name, c.value, c.orders,
                   COALESCE(p.prev_value, 0) AS prev_value
            FROM curr c
            LEFT JOIN prev p ON p.product_id = c.product_id
            ORDER BY c.value DESC
            LIMIT {int(top_n)}
        """
    elif category == "customer":
        sql = f"""
            WITH curr AS (
                SELECT cu.customer_id, cu.full_name AS name,
                       SUM(oi.subtotal) AS value,
                       COUNT(DISTINCT o.order_id) AS orders
                FROM public.orders o
                JOIN public.order_items oi ON oi.order_id   = o.order_id
                JOIN public.customers  cu ON o.customer_id  = cu.customer_id
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                  {curr_date_filter}
                  {cmp_filter}
                GROUP BY cu.customer_id, cu.full_name
            ),
            prev AS (
                SELECT o.customer_id, SUM(oi.subtotal) AS prev_value
                FROM public.orders o
                JOIN public.order_items oi ON oi.order_id = o.order_id
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                  {prev_filter}
                GROUP BY o.customer_id
            )
            SELECT c.name, c.value, c.orders,
                   COALESCE(p.prev_value, 0) AS prev_value
            FROM curr c
            LEFT JOIN prev p ON p.customer_id = c.customer_id
            ORDER BY c.value DESC
            LIMIT {int(top_n)}
        """
    elif category == "channel":
        sql = f"""
            WITH curr AS (
                SELECT ch.channel_id, ch.channel_name AS name,
                       SUM(oi.subtotal) AS value,
                       COUNT(DISTINCT o.order_id) AS orders
                FROM public.orders o
                JOIN public.order_items oi ON oi.order_id   = o.order_id
                JOIN public.sales_channels ch ON o.channel_id = ch.channel_id
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                  {curr_date_filter}
                  {cmp_filter}
                GROUP BY ch.channel_id, ch.channel_name
            ),
            prev AS (
                SELECT o.channel_id, SUM(oi.subtotal) AS prev_value
                FROM public.orders o
                JOIN public.order_items oi ON oi.order_id = o.order_id
                WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
                  {prev_filter}
                GROUP BY o.channel_id
            )
            SELECT c.name, c.value, c.orders,
                   COALESCE(p.prev_value, 0) AS prev_value
            FROM curr c
            LEFT JOIN prev p ON p.channel_id = c.channel_id
            ORDER BY c.value DESC
            LIMIT {int(top_n)}
        """
    elif category == "staff_warehouse":
        # KPI kho: số phiếu nhập + tổng giá trị nhập theo goods_receipts
        gr_date_filter = curr_date_filter.replace("o.order_date", "gr.created_at")
        gr_prev_filter = prev_filter.replace("o.order_date", "gr.created_at") \
                                    .replace("o.company_id", "gr.company_id")
        cmp_gr = f"AND gr.company_id = %(cid)s::uuid" if company_id else ""
        cmp_u  = f"AND u.company_id  = %(cid)s::uuid" if company_id else ""
        sql = f"""
            WITH curr AS (
                SELECT u.user_id, u.full_name AS name,
                       COALESCE(SUM(gr.total_amount), 0) AS value,
                       COUNT(gr.goods_receipt_id)        AS orders
                FROM public.users u
                LEFT JOIN public.goods_receipts gr
                    ON gr.created_by = u.user_id
                    {gr_date_filter}
                    {cmp_gr}
                WHERE u.is_active = TRUE
                  AND u.role = 'Staff_Warehouse'
                  {cmp_u}
                GROUP BY u.user_id, u.full_name
            ),
            prev AS (
                SELECT gr.created_by AS user_id,
                       SUM(gr.total_amount) AS prev_value
                FROM public.goods_receipts gr
                WHERE TRUE
                  {gr_prev_filter}
                GROUP BY gr.created_by
            )
            SELECT c.name, c.value, c.orders,
                   COALESCE(p.prev_value, 0) AS prev_value
            FROM curr c
            LEFT JOIN prev p ON p.user_id = c.user_id
            ORDER BY c.value DESC
            LIMIT {int(top_n)}
        """

    elif category == "staff_marketing":
        # KPI marketing: tổng chi phí quảng cáo quản lý theo ad_spend_monthly
        # Dùng year/month thay vì timestamp
        now = datetime.now()
        if start_date and end_date:
            sd_dt2 = datetime.strptime(start_date, "%Y-%m-%d").date()
            ed_dt2 = datetime.strptime(end_date,   "%Y-%m-%d").date()
            asm_curr_filter = f"""AND (asm.year * 100 + asm.month) >= {sd_dt2.year * 100 + sd_dt2.month}
                              AND (asm.year * 100 + asm.month) <  {ed_dt2.year * 100 + ed_dt2.month}"""
            prev_months = max(1, (ed_dt2.year - sd_dt2.year) * 12 + (ed_dt2.month - sd_dt2.month))
            p_year  = sd_dt2.year  - (prev_months // 12)
            p_month = sd_dt2.month - (prev_months  % 12)
            if p_month <= 0:
                p_month += 12; p_year -= 1
            asm_prev_filter = f"""AND (asm.year * 100 + asm.month) >= {p_year * 100 + p_month}
                              AND (asm.year * 100 + asm.month) <  {sd_dt2.year * 100 + sd_dt2.month}"""
        else:
            months_back = max(1, days // 30)
            curr_ym = now.year * 100 + now.month
            prev_year  = now.year  - ((months_back * 2) // 12)
            prev_month = now.month - ((months_back * 2)  % 12)
            if prev_month <= 0:
                prev_month += 12; prev_year -= 1
            prev2_ym = prev_year * 100 + prev_month
            curr2_year  = now.year  - (months_back // 12)
            curr2_month = now.month - (months_back  % 12)
            if curr2_month <= 0:
                curr2_month += 12; curr2_year -= 1
            mid_ym = curr2_year * 100 + curr2_month
            asm_curr_filter = f"AND (asm.year * 100 + asm.month) >= {mid_ym} AND (asm.year * 100 + asm.month) <= {curr_ym}"
            asm_prev_filter = f"AND (asm.year * 100 + asm.month) >= {prev2_ym} AND (asm.year * 100 + asm.month) < {mid_ym}"

        cmp_asm = f"AND asm.company_id = %(cid)s::uuid" if company_id else ""
        cmp_u   = f"AND u.company_id   = %(cid)s::uuid" if company_id else ""
        sql = f"""
            WITH curr AS (
                SELECT u.user_id, u.full_name AS name,
                       COALESCE(SUM(asm.amount), 0) AS value,
                       COUNT(asm.id)                AS orders
                FROM public.users u
                LEFT JOIN public.ad_spend_monthly asm
                    ON asm.created_by = u.user_id
                    {asm_curr_filter}
                    {cmp_asm}
                WHERE u.is_active = TRUE
                  AND u.role = 'Staff_Marketing'
                  {cmp_u}
                GROUP BY u.user_id, u.full_name
            ),
            prev AS (
                SELECT asm.created_by AS user_id,
                       SUM(asm.amount) AS prev_value
                FROM public.ad_spend_monthly asm
                WHERE TRUE
                  {asm_prev_filter}
                  {cmp_asm}
                GROUP BY asm.created_by
            )
            SELECT c.name, c.value, c.orders,
                   COALESCE(p.prev_value, 0) AS prev_value
            FROM curr c
            LEFT JOIN prev p ON p.user_id = c.user_id
            ORDER BY c.value DESC
            LIMIT {int(top_n)}
        """

    else:  # staff – NV bán hàng, chỉ đơn offline (created_by_user_id)
        sql = f"""
            WITH curr AS (
                SELECT u.user_id, u.full_name AS name,
                       COALESCE(SUM(o.total_amount), 0) AS value,
                       COUNT(DISTINCT o.order_id)       AS orders
                FROM public.users u
                LEFT JOIN public.orders o
                    ON o.created_by_user_id = u.user_id
                    AND o.status NOT IN ('CANCELLED','RETURNED')
                    {curr_date_filter}
                    {cmp_filter}
                WHERE u.is_active = TRUE
                  AND u.role = 'Staff_Sales'
                  {'AND u.company_id = %(cid)s::uuid' if company_id else ''}
                GROUP BY u.user_id, u.full_name
            ),
            prev AS (
                SELECT o.created_by_user_id AS user_id,
                       SUM(o.total_amount) AS prev_value
                FROM public.orders o
                WHERE o.status NOT IN ('CANCELLED','RETURNED')
                  {prev_filter}
                GROUP BY o.created_by_user_id
            )
            SELECT c.name, c.value, c.orders,
                   COALESCE(p.prev_value, 0) AS prev_value
            FROM curr c
            LEFT JOIN prev p ON p.user_id = c.user_id
            WHERE c.value > 0
            ORDER BY c.value DESC
            LIMIT {int(top_n)}
        """

    df = query_df(sql, params or None)

    if df.empty:
        return _empty_leaderboard(category, analysis_days, period_label)

    total_rev = float(df["value"].sum())
    entries: List[RankEntry] = []
    for i, (_, row) in enumerate(df.iterrows(), start=1):
        val      = float(row["value"])
        prev_val = float(row["prev_value"]) if "prev_value" in row and row["prev_value"] else 0.0
        chg_pct  = round((val - prev_val) / prev_val * 100, 1) if prev_val > 0 else 0.0
        trend    = "UP" if chg_pct > 2 else ("DOWN" if chg_pct < -2 else "STABLE")
        entries.append(RankEntry(
            rank=i, name=str(row["name"]),
            value=val, value_label=_fmt_vnd(val),
            orders=int(row["orders"]),
            badge=_badge(i), trend=trend, change_pct=chg_pct,
        ))

    return LeaderboardResponse(
        category=category,
        period_label=period_label,
        analysis_days=analysis_days,
        entries=entries,
        total_revenue=round(total_rev, 0),
        is_mock=False,
    )
