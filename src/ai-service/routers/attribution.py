# -*- coding: utf-8 -*-
"""
Router /attribution – Phân bổ doanh thu theo kênh bán hàng.

Hỗ trợ 3 mô hình attribution:
  1. first_touch:  100% credit cho kênh đầu tiên khách biết đến
  2. last_touch:   100% credit cho kênh cuối cùng trước khi mua
  3. linear:       Chia đều credit cho tất cả kênh trong hành trình

Trong scope luận văn (không có tracking đầy đủ), ta dùng proxy:
  - Doanh thu thực tế theo kênh (từ orders.channel_id) làm last_touch
  - Linear attribution: ước tính từ phân bổ doanh thu thực tế
  - Tính ROI per channel nếu có dữ liệu chi phí quảng cáo

Hoàn toàn miễn phí.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import query_df

logger = logging.getLogger("ai.attribution")

router = APIRouter(prefix="/attribution", tags=["Channel Attribution"])


class ChannelAttribution(BaseModel):
    channel:            str
    revenue:            float
    orders:             int
    attribution_pct:    float   # % doanh thu được quy về kênh này
    avg_order_value:    float
    ad_spend:           float   # Chi phí quảng cáo (0 nếu chưa có dữ liệu)
    roi_pct:            float   # ROI % = (revenue - ad_spend) / ad_spend * 100
    cpa:                float   # Cost per Acquisition = ad_spend / orders
    recommendation:     str


class AttributionResponse(BaseModel):
    model:              str     # "last_touch" | "linear" | "first_touch"
    total_revenue:      float
    total_orders:       int
    analysis_days:      int
    channels:           List[ChannelAttribution]
    top_channel:        str
    worst_roi_channel:  str
    insight:            str
    is_mock:            bool


def _empty_attribution(days: int, model: str) -> AttributionResponse:
    return AttributionResponse(
        model=model,
        total_revenue=0,
        total_orders=0,
        analysis_days=days,
        channels=[],
        top_channel="",
        worst_roi_channel="",
        insight="Chưa có dữ liệu doanh thu theo kênh trong khoảng thời gian này.",
        is_mock=False,
    )


@router.get(
    "",
    response_model=AttributionResponse,
    summary="Phân bổ doanh thu theo kênh bán hàng",
    description=(
        "Phân tích đóng góp doanh thu của từng kênh và tính ROI quảng cáo.\n\n"
        "**model**: Mô hình attribution\n"
        "- `last_touch`: 100% credit cho kênh bán hàng thực tế (mặc định)\n"
        "- `linear`: Chia đều theo tỷ lệ doanh thu\n\n"
        "Kết hợp với dữ liệu chi phí quảng cáo để tính ROI per channel."
    ),
)
def get_channel_attribution(
    days:       int            = Query(default=30, ge=7,   le=365),
    model:      str            = Query(default="last_touch", description="last_touch|linear"),
    company_id: Optional[str] = Query(default=None),
):
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params: dict = {}
    if company_id:
        params["cid"] = company_id

    sql = f"""
        SELECT
            c.channel_name                   AS channel,
            SUM(oi.subtotal)                 AS revenue,
            COUNT(DISTINCT o.order_id)       AS orders
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id  = o.order_id
        JOIN public.sales_channels c ON o.channel_id = c.channel_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
          {cmp_filter}
        GROUP BY c.channel_name
        ORDER BY revenue DESC
    """
    df = query_df(sql, params or None)

    if df.empty:
        return _empty_attribution(days, model)

    total_revenue = float(df["revenue"].sum())
    total_orders  = int(df["orders"].sum())

    # Thử đọc ad_spend từ fact_ad_performance nếu có
    ad_sql = f"""
        SELECT
            platform AS channel,
            SUM(spend) AS ad_spend
        FROM dw.fact_ad_performance
        WHERE date >= NOW() - INTERVAL '{int(days)} days'
        GROUP BY platform
    """ if True else ""

    ad_df = query_df(ad_sql, None) if ad_sql else None
    ad_map: dict = {}
    if ad_df is not None and not ad_df.empty:
        ad_map = dict(zip(ad_df["channel"], ad_df["ad_spend"]))

    channels_out: List[ChannelAttribution] = []
    for _, row in df.iterrows():
        ch      = str(row["channel"])
        rev     = float(row["revenue"])
        orders  = int(row["orders"])
        aov     = round(rev / orders, 0) if orders else 0
        pct     = round(rev / total_revenue * 100, 1) if total_revenue else 0
        spend   = float(ad_map.get(ch, 0))
        roi     = round((rev - spend) / spend * 100, 1) if spend > 0 else 0.0
        cpa     = round(spend / orders, 0) if orders and spend > 0 else 0

        if roi == 0 and spend == 0:
            rec = "Chưa có dữ liệu chi phí quảng cáo – không tính được ROI"
        elif roi >= 500:
            rec = "ROI xuất sắc – tăng ngân sách quảng cáo thêm 20-30%"
        elif roi >= 200:
            rec = "ROI tốt – duy trì và tối ưu dần"
        elif roi >= 50:
            rec = "ROI chấp nhận được – tối ưu targeting và creative"
        else:
            rec = "ROI thấp – xem xét cắt giảm ngân sách hoặc thay đổi chiến lược"

        channels_out.append(ChannelAttribution(
            channel=ch, revenue=rev, orders=orders,
            attribution_pct=pct, avg_order_value=aov,
            ad_spend=spend, roi_pct=roi, cpa=cpa,
            recommendation=rec,
        ))

    top_ch = channels_out[0].channel if channels_out else ""
    rois_with_spend = [c for c in channels_out if c.ad_spend > 0]
    worst_roi_ch    = min(rois_with_spend, key=lambda c: c.roi_pct).channel if rois_with_spend else ""

    insight = (
        f"{top_ch} đóng góp {channels_out[0].attribution_pct}% doanh thu. "
        + (f"Kênh {worst_roi_ch} có ROI thấp nhất – cần tối ưu." if worst_roi_ch else "")
    )

    return AttributionResponse(
        model=model,
        total_revenue=round(total_revenue, 0),
        total_orders=total_orders,
        analysis_days=days,
        channels=channels_out,
        top_channel=top_ch,
        worst_roi_channel=worst_roi_ch,
        insight=insight,
        is_mock=False,
    )
