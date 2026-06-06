# -*- coding: utf-8 -*-
"""Router /anomaly – Phát hiện bất thường doanh thu + Root Cause Analysis."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.anomaly_service import detect_anomalies
from services.db_service import query_df

router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])


class AnomalyPoint(BaseModel):
    date:      str
    actual:    float
    expected:  float
    z_score:   float
    direction: str   # "HIGH" | "LOW"
    severity:  str   # "WARNING" | "CRITICAL"
    message:   str


class AnomalyResponse(BaseModel):
    days_analyzed: int
    channel:       Optional[str]
    anomaly_count: int
    data:          List[AnomalyPoint]


@router.get(
    "",
    response_model=AnomalyResponse,
    summary="Phát hiện bất thường doanh thu",
    description=(
        "Phát hiện ngày có doanh thu bất thường (cao/thấp bất ngờ) "
        "bằng phương pháp Z-score trên rolling window 14 ngày.\n\n"
        "- **days**: số ngày nhìn lại (mặc định 90)\n"
        "- **channel**: lọc theo kênh. Bỏ trống = tất cả kênh"
    ),
)
def get_anomalies(
    days: int = Query(default=90, ge=14, le=365, description="Số ngày phân tích"),
    channel: Optional[str] = Query(default=None, description="Tên kênh bán hàng"),
):
    try:
        data = detect_anomalies(days=days, channel=channel)
        return AnomalyResponse(
            days_analyzed=days,
            channel=channel,
            anomaly_count=len(data),
            data=[AnomalyPoint(**p) for p in data],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi phát hiện anomaly: {e}")


# ── Root Cause Analysis ───────────────────────────────────────────────────────

class ChannelBreakdown(BaseModel):
    channel:      str
    revenue:      float
    vs_avg:       float    # % so với trung bình kỳ đó
    contribution: float    # % đóng góp vào tổng biến động


class ProductBreakdown(BaseModel):
    product_name: str
    revenue:      float
    qty_sold:     int
    vs_avg:       float


class RootCauseResponse(BaseModel):
    date:              str
    actual_revenue:    float
    expected_revenue:  float
    z_score:           float
    direction:         str        # "HIGH" | "LOW"
    severity:          str
    # Root cause layers
    channel_breakdown: List[ChannelBreakdown]
    product_breakdown: List[ProductBreakdown]
    time_breakdown:    dict       # morning/afternoon/evening split nếu có
    root_cause_summary: str       # Văn bản tóm tắt nguyên nhân
    possible_causes:   List[str]
    actions:           List[str]
    is_mock:           bool


def _channel_breakdown(date_str: str, expected: float, company_id: str = None) -> List[ChannelBreakdown]:
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"date": date_str}
    if company_id:
        params["cid"] = company_id

    # Doanh thu theo kênh trong ngày bất thường
    day_sql = f"""
        SELECT ch.channel_name AS channel, SUM(oi.subtotal) AS revenue
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        JOIN public.sales_channels ch ON o.channel_id = ch.channel_id
        WHERE DATE(o.order_date) = %(date)s
          AND o.status NOT IN ('CANCELLED','RETURNED')
          {cmp_filter}
        GROUP BY ch.channel_name ORDER BY revenue DESC
    """
    # Doanh thu trung bình theo kênh (30 ngày trước đó)
    avg_sql = f"""
        SELECT ch.channel_name AS channel, AVG(daily_rev) AS avg_revenue
        FROM (
            SELECT DATE(o.order_date) AS d, ch.channel_name, SUM(oi.subtotal) AS daily_rev
            FROM public.orders o
            JOIN public.order_items oi ON oi.order_id = o.order_id
            JOIN public.sales_channels ch ON o.channel_id = ch.channel_id
            WHERE o.order_date BETWEEN (%(date)s::date - INTERVAL '30 days') AND (%(date)s::date - INTERVAL '1 day')
              AND o.status NOT IN ('CANCELLED','RETURNED')
              {cmp_filter}
            GROUP BY DATE(o.order_date), ch.channel_name
        ) sub GROUP BY ch.channel_name
    """
    df_day = query_df(day_sql, params)
    df_avg = query_df(avg_sql, params)

    if df_day.empty:
        return []

    total_day = float(df_day["revenue"].sum())
    total_delta = total_day - expected if expected > 0 else total_day

    avg_map = {} if df_avg.empty else dict(zip(df_avg["channel"], df_avg["avg_revenue"]))

    result = []
    for _, row in df_day.iterrows():
        ch  = str(row["channel"])
        rev = float(row["revenue"])
        avg = float(avg_map.get(ch, rev))
        vs_avg = round((rev - avg) / avg * 100, 1) if avg > 0 else 0
        contribution = round(rev / total_day * 100, 1) if total_day > 0 else 0
        result.append(ChannelBreakdown(channel=ch, revenue=rev, vs_avg=vs_avg, contribution=contribution))
    return result


def _product_breakdown(date_str: str, company_id: str = None, top_n: int = 5) -> List[ProductBreakdown]:
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"date": date_str}
    if company_id:
        params["cid"] = company_id

    sql = f"""
        SELECT p.product_name, SUM(oi.subtotal) AS revenue, SUM(oi.quantity) AS qty_sold,
               AVG(avg_sub.avg_rev) AS avg_revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.order_id = oi.order_id
        JOIN public.products p ON p.product_id = oi.product_id
        LEFT JOIN (
            SELECT oi2.product_id, AVG(oi2.subtotal) AS avg_rev
            FROM public.order_items oi2
            JOIN public.orders o2 ON o2.order_id = oi2.order_id
            WHERE DATE(o2.order_date) != %(date)s::date
              AND o2.order_date >= (%(date)s::date - INTERVAL '30 days')
            GROUP BY oi2.product_id
        ) avg_sub ON avg_sub.product_id = oi.product_id
        WHERE DATE(o.order_date) = %(date)s
          AND o.status NOT IN ('CANCELLED','RETURNED')
          {cmp_filter}
        GROUP BY p.product_name ORDER BY revenue DESC LIMIT {int(top_n)}
    """
    df = query_df(sql, params)
    if df.empty:
        return []

    result = []
    for _, row in df.iterrows():
        rev  = float(row["revenue"])
        avg  = float(row.get("avg_revenue") or rev)
        vs_a = round((rev - avg) / avg * 100, 1) if avg > 0 else 0
        result.append(ProductBreakdown(
            product_name=str(row["product_name"]),
            revenue=rev, qty_sold=int(row["qty_sold"]),
            vs_avg=vs_a,
        ))
    return result


def _build_root_cause_summary(
    date: str, actual: float, expected: float, z: float,
    direction: str, channels: List[ChannelBreakdown], products: List[ProductBreakdown],
) -> tuple[str, List[str], List[str]]:
    """Tạo văn bản tóm tắt nguyên nhân và gợi ý hành động."""
    pct = round(abs(actual - expected) / expected * 100, 1) if expected > 0 else 0
    dir_vn = "tăng" if direction == "HIGH" else "giảm"

    # Tìm kênh đóng góp lớn nhất vào biến động
    top_ch  = max(channels, key=lambda c: abs(c.vs_avg), default=None)
    top_prd = products[0] if products else None

    summary = f"Ngày {date} doanh thu {dir_vn} {pct}% so với dự kiến (z={abs(z):.1f}σ). "

    causes = []
    actions = []

    if top_ch and abs(top_ch.vs_avg) > 15:
        dir_ch = "tăng vọt" if top_ch.vs_avg > 0 else "giảm mạnh"
        summary += (
            f"Kênh **{top_ch.channel}** {dir_ch} {abs(top_ch.vs_avg):.0f}% so với trung bình, "
            f"đóng góp {top_ch.contribution:.0f}% tổng doanh thu ngày này. "
        )
        causes.append(f"Kênh {top_ch.channel} có hiệu suất bất thường ({dir_ch} {abs(top_ch.vs_avg):.0f}%)")

    if top_prd and abs(top_prd.vs_avg) > 20:
        dir_prd = "tăng đột biến" if top_prd.vs_avg > 0 else "giảm mạnh"
        summary += f"Sản phẩm **{top_prd.product_name}** {dir_prd} {abs(top_prd.vs_avg):.0f}%."
        causes.append(f"Sản phẩm '{top_prd.product_name}' có doanh số bất thường")

    if direction == "HIGH":
        causes += ["Có thể có chương trình khuyến mãi/flash sale", "Viral marketing trên mạng xã hội"]
        actions += [
            f"Tận dụng momentum kênh {top_ch.channel if top_ch else 'bán tốt'} – tăng tồn kho",
            "Phân tích nguồn traffic để nhân rộng chiến lược",
            "Kiểm tra xem có sự kiện/flash sale nào diễn ra ngày này không",
        ]
    else:
        causes += ["Sự cố kỹ thuật trên sàn TMĐT", "Hết hàng bất ngờ", "Cạnh tranh giá từ đối thủ"]
        actions += [
            f"Kiểm tra trạng thái gian hàng kênh {top_ch.channel if top_ch else 'chính'}",
            "Xem lại tồn kho các sản phẩm bán chạy",
            "So sánh giá với đối thủ – có thể bị mất khách vì giá cao hơn",
        ]

    return summary, causes[:4], actions[:3]


@router.get(
    "/root-cause",
    response_model=RootCauseResponse,
    summary="Phân tích nguyên nhân gốc rễ của ngày bất thường",
    description=(
        "Drill-down vào một ngày cụ thể có doanh thu bất thường để tìm nguyên nhân:\n"
        "- **Kênh nào** gây ra biến động chính?\n"
        "- **Sản phẩm nào** đột biến hoặc sụt giảm?\n"
        "- Tóm tắt nguyên nhân và gợi ý hành động khắc phục.\n\n"
        "**date**: ngày cần phân tích (YYYY-MM-DD) – thường lấy từ kết quả `/anomaly`"
    ),
)
def get_root_cause(
    date:       str            = Query(..., description="Ngày bất thường (YYYY-MM-DD)"),
    company_id: Optional[str] = Query(default=None),
):
    # Lấy anomaly info cho ngày này để có expected/z_score
    try:
        all_anomalies = detect_anomalies(days=365)
        anomaly = next((a for a in all_anomalies if a["date"] == date), None)
    except Exception:
        anomaly = None

    if anomaly is None:
        # Không phải ngày bất thường – vẫn trả về breakdown để user xem
        anomaly = {
            "date": date, "actual": 0, "expected": 0,
            "z_score": 0, "direction": "LOW", "severity": "WARNING",
            "message": "Ngày này không được phát hiện là bất thường",
        }

    channels = _channel_breakdown(date, float(anomaly["expected"]), company_id)
    products = _product_breakdown(date, company_id)

    summary, causes, actions = _build_root_cause_summary(
        date=date,
        actual=float(anomaly["actual"]),
        expected=float(anomaly["expected"]),
        z=float(anomaly["z_score"]),
        direction=str(anomaly["direction"]),
        channels=channels,
        products=products,
    )

    return RootCauseResponse(
        date=date,
        actual_revenue=float(anomaly["actual"]),
        expected_revenue=float(anomaly["expected"]),
        z_score=float(anomaly["z_score"]),
        direction=str(anomaly["direction"]),
        severity=str(anomaly["severity"]),
        channel_breakdown=channels,
        product_breakdown=products,
        time_breakdown={},
        root_cause_summary=summary,
        possible_causes=causes,
        actions=actions,
        is_mock=False,
    )
