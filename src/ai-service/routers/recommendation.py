# -*- coding: utf-8 -*-
"""
Router /recommendation – Gợi ý hành động dựa trên phân tích dữ liệu.

Kết hợp rule-based logic + kết quả từ forecast/trend/anomaly
để sinh ra các gợi ý cụ thể cho người quản lý.
"""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.db_service import load_revenue_series, query_df
from services.anomaly_service import detect_anomalies

router = APIRouter(prefix="/recommendation", tags=["Recommendations"])


class Recommendation(BaseModel):
    priority:  str    # "HIGH" | "MEDIUM" | "LOW"
    category:  str    # "REVENUE" | "INVENTORY" | "CHANNEL" | "MARKETING"
    title:     str
    detail:    str
    action:    str


class RecommendationResponse(BaseModel):
    generated_at:    str
    total:           int
    recommendations: List[Recommendation]


def _analyze_channel_performance() -> List[Recommendation]:
    """Phân tích hiệu suất kênh bán hàng và sinh gợi ý."""
    recs = []
    sql = """
        SELECT
            dc.channel_name,
            SUM(fs.net_revenue)  AS revenue,
            SUM(fs.order_count)  AS orders,
            AVG(fs.profit_margin) AS avg_margin
        FROM dw.fact_sales fs
        JOIN dw.dim_date    dd ON fs.date_id    = dd.date_id
        JOIN dw.dim_channel dc ON fs.channel_id = dc.channel_id
        WHERE dd.full_date >= CURRENT_DATE - INTERVAL '30 days'
          AND fs.order_status = 'DELIVERED'
        GROUP BY dc.channel_name
        ORDER BY revenue DESC
    """
    try:
        df = query_df(sql)
        if df.empty:
            return recs

        total_revenue = df["revenue"].sum()
        for _, row in df.iterrows():
            pct = row["revenue"] / total_revenue * 100 if total_revenue else 0
            # Kênh chiếm < 10% doanh thu
            if pct < 10:
                recs.append(Recommendation(
                    priority="MEDIUM",
                    category="CHANNEL",
                    title=f"Kênh {row['channel_name']} đang yếu",
                    detail=f"Kênh {row['channel_name']} chỉ chiếm {pct:.1f}% doanh thu 30 ngày qua.",
                    action=f"Xem xét tăng ngân sách quảng cáo hoặc chạy flash sale trên {row['channel_name']}.",
                ))
            # Kênh có margin thấp
            if row["avg_margin"] and row["avg_margin"] < 10:
                recs.append(Recommendation(
                    priority="HIGH",
                    category="REVENUE",
                    title=f"Biên lợi nhuận thấp trên {row['channel_name']}",
                    detail=f"Biên lợi nhuận TB chỉ {row['avg_margin']:.1f}% trên kênh {row['channel_name']}.",
                    action="Rà soát chính sách giảm giá và phí vận chuyển, tăng giá bán hoặc giảm chi phí.",
                ))
    except Exception:
        pass
    return recs


def _analyze_anomalies() -> List[Recommendation]:
    """Chuyển đổi anomaly thành gợi ý hành động."""
    recs = []
    anomalies = detect_anomalies(days=14)
    for a in anomalies[:3]:  # Chỉ lấy 3 anomaly nghiêm trọng nhất
        if a["direction"] == "LOW" and a["severity"] == "CRITICAL":
            recs.append(Recommendation(
                priority="HIGH",
                category="REVENUE",
                title=f"Doanh thu sụt giảm nghiêm trọng ngày {a['date']}",
                detail=a["message"],
                action="Kiểm tra ngay hệ thống API, đơn hàng bị hủy, và tình trạng vận chuyển.",
            ))
        elif a["direction"] == "HIGH":
            recs.append(Recommendation(
                priority="LOW",
                category="MARKETING",
                title=f"Đỉnh doanh thu bất ngờ ngày {a['date']}",
                detail=a["message"],
                action="Phân tích nguyên nhân (campaign, viral, ...) để tái lập trong tương lai.",
            ))
    return recs


def _analyze_top_products() -> List[Recommendation]:
    """Phân tích sản phẩm bán chạy và tồn kho."""
    recs = []
    sql = """
        SELECT
            dp.product_name,
            SUM(fs.item_quantity)  AS qty_sold,
            SUM(fs.net_revenue)    AS revenue
        FROM dw.fact_sales fs
        JOIN dw.dim_date    dd ON fs.date_id    = dd.date_id
        JOIN dw.dim_product dp ON fs.product_id = dp.product_id
        WHERE dd.full_date >= CURRENT_DATE - INTERVAL '7 days'
          AND fs.order_status = 'DELIVERED'
        GROUP BY dp.product_name
        ORDER BY qty_sold DESC
        LIMIT 5
    """
    try:
        df = query_df(sql)
        if not df.empty:
            top = df.iloc[0]
            recs.append(Recommendation(
                priority="MEDIUM",
                category="INVENTORY",
                title=f"Top sản phẩm: {top['product_name']}",
                detail=f"Bán {int(top['qty_sold'])} sản phẩm trong 7 ngày qua – doanh thu {top['revenue']:,.0f} VNĐ.",
                action="Đảm bảo tồn kho đủ để đáp ứng nhu cầu. Xem xét nhập thêm hàng.",
            ))
    except Exception:
        pass
    return recs


@router.get(
    "",
    response_model=RecommendationResponse,
    summary="Gợi ý hành động từ AI",
    description=(
        "Phân tích tổng hợp dữ liệu (trend, anomaly, channel, product) "
        "và đưa ra các gợi ý hành động ưu tiên cho người quản lý."
    ),
)
def get_recommendations():
    try:
        from datetime import datetime, timezone
        recs: List[Recommendation] = []

        recs += _analyze_channel_performance()
        recs += _analyze_anomalies()
        recs += _analyze_top_products()

        # Sắp xếp theo priority
        priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        recs.sort(key=lambda r: priority_order.get(r.priority, 9))

        return RecommendationResponse(
            generated_at=datetime.now(timezone.utc).isoformat(),
            total=len(recs),
            recommendations=recs,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh gợi ý: {e}")
