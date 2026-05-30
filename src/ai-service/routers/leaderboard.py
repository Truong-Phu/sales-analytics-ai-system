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


def _mock_leaderboard(category: str) -> LeaderboardResponse:
    if category == "product":
        entries = [
            RankEntry(rank=1, name="Áo thun nam cổ tròn",   value=45_200_000, value_label="45.2 triệu VNĐ", orders=312, badge="🥇", trend="UP",     change_pct=12.3),
            RankEntry(rank=2, name="Váy hoa mùa hè",         value=38_700_000, value_label="38.7 triệu VNĐ", orders=265, badge="🥈", trend="UP",     change_pct=8.1),
            RankEntry(rank=3, name="Giày sneaker trắng",      value=31_500_000, value_label="31.5 triệu VNĐ", orders=198, badge="🥉", trend="STABLE", change_pct=0.5),
            RankEntry(rank=4, name="Quần short nam",          value=25_000_000, value_label="25.0 triệu VNĐ", orders=175, badge="",   trend="DOWN",   change_pct=-5.2),
            RankEntry(rank=5, name="Balo thời trang",         value=18_300_000, value_label="18.3 triệu VNĐ", orders=92,  badge="",   trend="UP",     change_pct=22.0),
        ]
    elif category == "customer":
        entries = [
            RankEntry(rank=1, name="Nguyễn Thị Lan",   value=8_500_000, value_label="8.5 triệu VNĐ",  orders=23, badge="🥇", trend="UP",     change_pct=15.0),
            RankEntry(rank=2, name="Trần Văn Minh",    value=6_200_000, value_label="6.2 triệu VNĐ",  orders=18, badge="🥈", trend="STABLE", change_pct=2.1),
            RankEntry(rank=3, name="Lê Thị Hoa",       value=5_800_000, value_label="5.8 triệu VNĐ",  orders=15, badge="🥉", trend="UP",     change_pct=9.3),
            RankEntry(rank=4, name="Phạm Quang Vinh",  value=4_100_000, value_label="4.1 triệu VNĐ",  orders=12, badge="",   trend="DOWN",   change_pct=-3.0),
            RankEntry(rank=5, name="Hoàng Thị Mai",    value=3_700_000, value_label="3.7 triệu VNĐ",  orders=10, badge="",   trend="UP",     change_pct=5.5),
        ]
    elif category == "channel":
        entries = [
            RankEntry(rank=1, name="Shopee",            value=45_000_000, value_label="45.0 triệu VNĐ", orders=312, badge="🥇", trend="UP",     change_pct=10.2),
            RankEntry(rank=2, name="TikTok Shop",       value=28_000_000, value_label="28.0 triệu VNĐ", orders=195, badge="🥈", trend="UP",     change_pct=35.8),
            RankEntry(rank=3, name="Lazada",            value=15_000_000, value_label="15.0 triệu VNĐ", orders=98,  badge="🥉", trend="STABLE", change_pct=1.2),
            RankEntry(rank=4, name="Facebook",          value=7_000_000,  value_label="7.0 triệu VNĐ",  orders=45,  badge="",   trend="DOWN",   change_pct=-8.5),
            RankEntry(rank=5, name="Website trực tiếp", value=5_000_000,  value_label="5.0 triệu VNĐ",  orders=30,  badge="",   trend="UP",     change_pct=4.0),
        ]
    else:  # staff
        entries = [
            RankEntry(rank=1, name="Nguyễn Văn An",   value=52_000_000, value_label="52.0 triệu VNĐ", orders=145, badge="🥇", trend="UP",     change_pct=18.5),
            RankEntry(rank=2, name="Trần Thị Bình",   value=43_500_000, value_label="43.5 triệu VNĐ", orders=128, badge="🥈", trend="STABLE", change_pct=3.2),
            RankEntry(rank=3, name="Lê Minh Châu",    value=38_200_000, value_label="38.2 triệu VNĐ", orders=112, badge="🥉", trend="UP",     change_pct=7.1),
        ]
    return LeaderboardResponse(
        category=category,
        period_label="30 ngày gần nhất",
        analysis_days=30,
        entries=entries,
        total_revenue=sum(e.value for e in entries),
        is_mock=True,
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
    days:       int            = Query(default=30, ge=7, le=365),
    top_n:      int            = Query(default=10, ge=3, le=50),
    company_id: Optional[str] = Query(default=None),
):
    valid_cats = ("product", "customer", "channel", "staff")
    if category not in valid_cats:
        category = "product"

    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    cmp_filter2 = "AND o2.company_id = %(cid)s::uuid" if company_id else ""
    params: dict = {}
    if company_id:
        params["cid"] = company_id

    # Tính kỳ trước để compare trend (cùng khoảng ngày, lùi thêm days)
    prev_filter  = f"AND o.order_date >= NOW() - INTERVAL '{int(days*2)} days' AND o.order_date < NOW() - INTERVAL '{int(days)} days'"
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
                  AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
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
                  AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
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
                  AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
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
    else:  # staff – dùng admin KPI data
        sql = f"""
            WITH curr AS (
                SELECT u.user_id, u.full_name AS name,
                       COALESCE(SUM(o.total_amount), 0) AS value,
                       COUNT(DISTINCT o.order_id) AS orders
                FROM public.users u
                LEFT JOIN public.orders o
                    ON o.created_by_user_id = u.user_id
                    AND o.status NOT IN ('CANCELLED','RETURNED')
                    AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
                    {cmp_filter.replace('o.company_id', 'o.company_id')}
                WHERE u.is_active = TRUE
                  AND u.role NOT IN ('SuperAdmin','Owner')
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
        return _mock_leaderboard(category)

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

    period_map = {7: "7 ngày", 30: "30 ngày", 90: "90 ngày", 365: "1 năm"}
    period_label = period_map.get(days, f"{days} ngày") + " gần nhất"

    return LeaderboardResponse(
        category=category,
        period_label=period_label,
        analysis_days=days,
        entries=entries,
        total_revenue=round(total_rev, 0),
        is_mock=False,
    )
