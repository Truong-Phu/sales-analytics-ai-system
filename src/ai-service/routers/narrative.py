# -*- coding: utf-8 -*-
"""
Router /narrative – Tự động sinh nhận xét bằng ngôn ngữ tự nhiên (Smart Narrative).

Pipeline:
  1. Lấy KPI period hiện tại vs. kỳ trước (doanh thu, đơn hàng, khách hàng mới)
  2. Lấy anomaly nổi bật nhất
  3. Lấy kênh top và worst
  4. Sinh đoạn văn nhận xét theo template (tiếng Việt/Anh)

Hoàn toàn rule-based → miễn phí, không cần API key.
Nhưng có hook để gọi AI (Claude/Gemini) nếu cấu hình sau.
"""
import logging
import os
from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import query_df

logger = logging.getLogger("ai.narrative")

router = APIRouter(prefix="/narrative", tags=["Smart Narrative"])


class NarrativeResponse(BaseModel):
    period:          str
    language:        str
    headline:        str          # 1 câu tóm tắt ngắn nhất
    full_narrative:  str          # Đoạn văn đầy đủ
    key_metrics:     dict         # Các số liệu chính dùng trong narrative
    anomaly_note:    str          # Ghi chú bất thường nếu có
    recommendations: list         # 2-3 gợi ý ngắn
    generated_by:    str          # "rule_based" | "ai_claude" | "ai_gemini"
    is_mock:         bool


def _get_period_kpi(days: int, company_id: str = None) -> dict:
    """Lấy KPI so sánh 2 kỳ."""
    cmp_filter  = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"cid": company_id} if company_id else None

    sql = f"""
        SELECT
            SUM(CASE WHEN o.order_date >= NOW() - INTERVAL '{int(days)} days'
                     THEN oi.subtotal ELSE 0 END)                          AS current_revenue,
            SUM(CASE WHEN o.order_date >= NOW() - INTERVAL '{int(days*2)} days'
                      AND o.order_date <  NOW() - INTERVAL '{int(days)} days'
                     THEN oi.subtotal ELSE 0 END)                          AS prev_revenue,
            COUNT(DISTINCT CASE WHEN o.order_date >= NOW() - INTERVAL '{int(days)} days'
                           THEN o.order_id END)                            AS current_orders,
            COUNT(DISTINCT CASE WHEN o.order_date >= NOW() - INTERVAL '{int(days*2)} days'
                            AND o.order_date < NOW() - INTERVAL '{int(days)} days'
                           THEN o.order_id END)                            AS prev_orders
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          {cmp_filter}
    """
    df = query_df(sql, params)
    if df.empty:
        return {}

    row = df.iloc[0]
    curr_rev  = float(row.get("current_revenue",  0) or 0)
    prev_rev  = float(row.get("prev_revenue",     0) or 0)
    curr_ord  = int(row.get("current_orders",     0) or 0)
    prev_ord  = int(row.get("prev_orders",        0) or 0)

    rev_chg = round((curr_rev - prev_rev) / prev_rev * 100, 1) if prev_rev > 0 else 0
    ord_chg = round((curr_ord - prev_ord) / prev_ord * 100, 1) if prev_ord > 0 else 0

    return {
        "current_revenue":  curr_rev,
        "prev_revenue":     prev_rev,
        "revenue_change":   rev_chg,
        "current_orders":   curr_ord,
        "prev_orders":      prev_ord,
        "orders_change":    ord_chg,
    }


def _get_top_channel(days: int, company_id: str = None) -> tuple[str, float]:
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"cid": company_id} if company_id else None

    sql = f"""
        SELECT ch.channel_name, SUM(oi.subtotal) AS rev
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id  = o.order_id
        JOIN public.sales_channels ch ON o.channel_id = ch.channel_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
          {cmp_filter}
        GROUP BY ch.channel_name ORDER BY rev DESC LIMIT 1
    """
    df = query_df(sql, params)
    if df.empty:
        return "N/A", 0.0
    return str(df.iloc[0]["channel_name"]), float(df.iloc[0]["rev"])


def _get_top_product(days: int, company_id: str = None) -> str:
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"cid": company_id} if company_id else None

    sql = f"""
        SELECT p.product_name, SUM(oi.quantity) AS qty
        FROM public.order_items oi
        JOIN public.orders   o ON oi.order_id   = o.order_id
        JOIN public.products p ON oi.product_id = p.product_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
          {cmp_filter}
        GROUP BY p.product_name ORDER BY qty DESC LIMIT 1
    """
    df = query_df(sql, params)
    return str(df.iloc[0]["product_name"]) if not df.empty else "N/A"


def _fmt_vnd_short(val: float) -> str:
    if val >= 1_000_000_000:
        return f"{val/1_000_000_000:.1f} tỷ"
    if val >= 1_000_000:
        return f"{val/1_000_000:.1f} triệu"
    return f"{val:,.0f}"


def _build_narrative_vi(kpi: dict, channel: str, product: str, days: int) -> tuple[str, str]:
    """Sinh narrative tiếng Việt."""
    rev     = kpi.get("current_revenue",  0)
    rev_chg = kpi.get("revenue_change",   0)
    orders  = kpi.get("current_orders",   0)
    ord_chg = kpi.get("orders_change",    0)

    period_lbl = {7: "tuần", 30: "tháng", 90: "quý"}.get(days, f"{days} ngày")

    # Headline
    if rev_chg >= 10:
        headline = f"Doanh thu {period_lbl} tăng mạnh {rev_chg:.1f}% – kết quả kinh doanh rất tích cực!"
    elif rev_chg >= 0:
        headline = f"Doanh thu {period_lbl} ổn định, tăng nhẹ {rev_chg:.1f}% so với kỳ trước."
    elif rev_chg >= -10:
        headline = f"Doanh thu {period_lbl} giảm nhẹ {abs(rev_chg):.1f}% – cần theo dõi và điều chỉnh."
    else:
        headline = f"Doanh thu {period_lbl} giảm {abs(rev_chg):.1f}% – cần hành động khẩn cấp!"

    # Full narrative
    rev_str  = _fmt_vnd_short(rev)
    rev_dir  = "tăng" if rev_chg >= 0 else "giảm"
    ord_dir  = "tăng" if ord_chg >= 0 else "giảm"

    full = (
        f"Trong {days} ngày vừa qua, tổng doanh thu đạt **{rev_str} VNĐ**, "
        f"{rev_dir} **{abs(rev_chg):.1f}%** so với kỳ trước. "
        f"Số lượng đơn hàng {ord_dir} {abs(ord_chg):.1f}% với **{orders:,} đơn**. "
    )

    if channel != "N/A":
        full += f"Kênh **{channel}** tiếp tục dẫn đầu về doanh thu. "
    if product != "N/A":
        full += f"Sản phẩm bán chạy nhất là **{product}**. "

    if rev_chg >= 10:
        full += "Xu hướng hiện tại rất thuận lợi – nên duy trì chiến lược và tăng ngân sách marketing."
    elif rev_chg < -10:
        full += "Cần phân tích nguyên nhân sụt giảm và triển khai chương trình khuyến mãi sớm."

    return headline, full


def _build_narrative_en(kpi: dict, channel: str, product: str, days: int) -> tuple[str, str]:
    """Sinh narrative tiếng Anh."""
    rev     = kpi.get("current_revenue",  0)
    rev_chg = kpi.get("revenue_change",   0)
    orders  = kpi.get("current_orders",   0)
    ord_chg = kpi.get("orders_change",    0)

    period_lbl = {7: "week", 30: "month", 90: "quarter"}.get(days, f"{days} days")
    rev_str    = _fmt_vnd_short(rev)
    rev_dir    = "increased" if rev_chg >= 0 else "decreased"
    ord_dir    = "increased" if ord_chg >= 0 else "decreased"

    if rev_chg >= 10:
        headline = f"Revenue surged {rev_chg:.1f}% this {period_lbl} – excellent performance!"
    elif rev_chg >= 0:
        headline = f"Revenue slightly grew {rev_chg:.1f}% this {period_lbl}."
    elif rev_chg >= -10:
        headline = f"Revenue dipped {abs(rev_chg):.1f}% – monitor closely."
    else:
        headline = f"Revenue dropped {abs(rev_chg):.1f}% – urgent action needed!"

    full = (
        f"Over the past {days} days, total revenue reached **{rev_str} VNĐ**, "
        f"{rev_dir} **{abs(rev_chg):.1f}%** vs. prior period. "
        f"Order count {ord_dir} {abs(ord_chg):.1f}% to **{orders:,} orders**. "
    )
    if channel != "N/A":
        full += f"**{channel}** remains the top-performing channel. "
    if product != "N/A":
        full += f"Best-selling product: **{product}**. "

    return headline, full


def _build_recommendations_vi(kpi: dict, channel: str) -> list:
    recs = []
    rev_chg = kpi.get("revenue_change", 0)
    if rev_chg < -5:
        recs.append(f"Triển khai chương trình giảm giá 10-15% trong tuần tới để kích cầu.")
    if channel != "N/A":
        recs.append(f"Tập trung ngân sách quảng cáo vào kênh {channel} – đang dẫn đầu doanh thu.")
    recs.append("Xem xét phân tích RFM để chăm sóc khách hàng có nguy cơ rời bỏ.")
    return recs[:3]


_MOCK_NARRATIVE = NarrativeResponse(
    period="30 ngày gần nhất",
    language="vi",
    headline="Doanh thu tháng tăng 15.3% – kết quả kinh doanh rất tích cực!",
    full_narrative=(
        "Trong 30 ngày vừa qua, tổng doanh thu đạt **158.5 triệu VNĐ**, "
        "tăng **15.3%** so với tháng trước. "
        "Số lượng đơn hàng tăng 8.7% với **680 đơn**. "
        "Kênh **Shopee** tiếp tục dẫn đầu về doanh thu. "
        "Sản phẩm bán chạy nhất là **Áo thun nam cổ tròn**. "
        "Xu hướng hiện tại rất thuận lợi – nên duy trì chiến lược và tăng ngân sách marketing."
    ),
    key_metrics={
        "current_revenue": 158_500_000,
        "revenue_change":  15.3,
        "current_orders":  680,
        "orders_change":   8.7,
    },
    anomaly_note="Phát hiện 1 ngày bất thường: 05/05/2026 doanh thu cao đột biến (+3.2σ)",
    recommendations=[
        "Tập trung ngân sách quảng cáo vào kênh Shopee – đang dẫn đầu doanh thu.",
        "Xem xét phân tích RFM để chăm sóc khách hàng có nguy cơ rời bỏ.",
        "Chuẩn bị chiến dịch 11.11 sớm – dự kiến doanh thu tăng 3.5x.",
    ],
    generated_by="rule_based",
    is_mock=True,
)


@router.get(
    "",
    response_model=NarrativeResponse,
    summary="Sinh nhận xét doanh thu tự động bằng ngôn ngữ tự nhiên",
    description=(
        "Tự động tổng hợp số liệu và viết đoạn văn nhận xét chuyên nghiệp.\n\n"
        "Phù hợp để:\n"
        "- Chèn vào báo cáo export (PDF)\n"
        "- Hiển thị trên Dashboard như 'AI Insight'\n"
        "- Gửi kèm trong email KPI hàng ngày\n\n"
        "**language**: `vi` (Tiếng Việt) hoặc `en` (English)"
    ),
)
def get_narrative(
    days:       int            = Query(default=30, ge=7,  le=365),
    language:   str            = Query(default="vi", description="vi|en"),
    company_id: Optional[str] = Query(default=None),
):
    kpi     = _get_period_kpi(days, company_id)
    if not kpi:
        _MOCK_NARRATIVE.language = language
        return _MOCK_NARRATIVE

    channel = _get_top_channel(days, company_id)[0]
    product = _get_top_product(days, company_id)

    period_map = {7: "7 ngày gần nhất", 30: "30 ngày gần nhất", 90: "90 ngày gần nhất"}
    period_lbl = period_map.get(days, f"{days} ngày gần nhất")

    if language == "en":
        headline, full = _build_narrative_en(kpi, channel, product, days)
        recs = [
            f"Focus ad budget on {channel} – top revenue channel.",
            "Run RFM analysis to identify at-risk customers.",
            "Prepare for upcoming seasonal peaks.",
        ]
    else:
        headline, full = _build_narrative_vi(kpi, channel, product, days)
        recs = _build_recommendations_vi(kpi, channel)

    # Thử lấy anomaly nổi bật
    anomaly_note = ""
    try:
        from services.anomaly_service import detect_anomalies
        anomalies = detect_anomalies(days=days)
        if anomalies:
            a = anomalies[0]
            direction = "cao" if a["direction"] == "HIGH" else "thấp"
            if language == "vi":
                anomaly_note = (
                    f"Phát hiện {len(anomalies)} ngày bất thường: "
                    f"{a['date']} doanh thu {direction} đột biến "
                    f"({abs(a['z_score']):.1f}σ so với trung bình)."
                )
            else:
                anomaly_note = (
                    f"Detected {len(anomalies)} anomalies: "
                    f"{a['date']} revenue was unusually {'high' if a['direction']=='HIGH' else 'low'} "
                    f"({abs(a['z_score']):.1f}σ vs. average)."
                )
    except Exception:
        pass

    return NarrativeResponse(
        period=period_lbl,
        language=language,
        headline=headline,
        full_narrative=full,
        key_metrics=kpi,
        anomaly_note=anomaly_note,
        recommendations=recs,
        generated_by="rule_based",
        is_mock=False,
    )
