# -*- coding: utf-8 -*-
"""
Router /recommendation – Gợi ý hành động dựa trên phân tích dữ liệu.

Có 2 endpoint:
    GET  /recommendation      – Gợi ý tự động từ rule-based + anomaly analysis
    POST /recommendation      – Trả lời câu hỏi tự nhiên từ người dùng,
                                 kết hợp QueryEngine + AI (Claude / OpenAI / fallback)
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.db_service import load_revenue_series, query_df
from services.anomaly_service import detect_anomalies
from services.basket_service import run_basket_analysis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recommendation", tags=["Recommendations"])

customers_router = APIRouter(prefix="/customers", tags=["Customers"])

_RFM_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "rfm_segments.json")


@customers_router.get("/segments", summary="Phân khúc khách hàng RFM")
def get_customer_segments():
    """Load kết quả phân khúc RFM từ file JSON (sinh bởi notebook 04)."""
    if not os.path.exists(_RFM_PATH):
        raise HTTPException(
            status_code=503,
            detail="RFM data chưa có. Hãy chạy notebook 04_RFM_Analysis.ipynb trước."
        )
    try:
        with open(_RFM_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi đọc RFM data: {e}")


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


# ── Models cho POST /recommendation (AI chatbot) ─────────────────────────────

class AskRequest(BaseModel):
    question: str                           # Câu hỏi tự nhiên của người dùng
    language: str = "vi"                    # Ngôn ngữ trả về: "vi" hoặc "en"
    context:  Optional[str]  = None         # "business_data"|"market_trends"|"customer_feedback"
    sources:  Optional[List[str]] = None    # ["fact_sales","oltp"|"google","external"|"facebook"]


class AskResponse(BaseModel):
    question:       str
    recommendation: str             # Gợi ý text từ AI hoặc rule-based fallback
    data_sources:   List[str]       # Nguồn dữ liệu đã dùng
    confidence:     str             # "LOW" | "MEDIUM" | "HIGH"
    note:           str             # Ghi chú về nguồn dữ liệu
    sources_used:   List[str] = []  # Tên nguồn thực tế đã truy vấn
    context_type:   str = ""        # Context đã dùng


# ── Rule-based fallback ──────────────────────────────────────────────────────

def rule_based_recommendation(question: str, context: dict, language: str = "vi") -> str:
    """
    Sinh gợi ý dựa trên rule-based khi không có API key AI.

    Logic:
        - Nếu có sales_summary → tóm tắt số liệu bán hàng
        - Nếu có google_results → liệt kê top 3 kết quả liên quan
        - Nếu có facebook_results → trích dẫn 1-2 posts liên quan
        - Luôn kết thúc bằng cảnh báo nguồn dữ liệu

    Args:
        question:  Câu hỏi của người dùng.
        context:   Dict context từ QueryEngine.get_context().
        language:  "vi" hoặc "en".

    Returns:
        str: Văn bản gợi ý.
    """
    is_vi = language.lower() != "en"
    parts = []

    # Phần 1: Số liệu bán hàng từ OLTP
    sales = context.get("sales_summary", {})
    if sales:
        if is_vi:
            parts.append("**Số liệu bán hàng (30 ngày qua):**")
            if "total_revenue_30d" in sales:
                parts.append(
                    f"- Tổng doanh thu: {sales['total_revenue_30d']:,.0f} VNĐ"
                )
            if "order_count_30d" in sales:
                parts.append(f"- Tổng đơn hàng: {sales['order_count_30d']} đơn")
            if "avg_order_value" in sales:
                parts.append(
                    f"- Giá trị đơn TB: {sales['avg_order_value']:,.0f} VNĐ"
                )
            top = sales.get("top_products", [])
            if top:
                parts.append("\n**Top sản phẩm bán chạy:**")
                for i, p in enumerate(top[:3], 1):
                    parts.append(
                        f"{i}. {p['name']} – {p['qty_sold']} sản phẩm"
                        f" ({p['revenue']:,.0f} VNĐ)"
                    )
        else:
            parts.append("**Sales Data (Last 30 days):**")
            if "total_revenue_30d" in sales:
                parts.append(f"- Total revenue: {sales['total_revenue_30d']:,.0f} VND")
            if "order_count_30d" in sales:
                parts.append(f"- Total orders: {sales['order_count_30d']}")
            top = sales.get("top_products", [])
            if top:
                parts.append("\n**Top selling products:**")
                for i, p in enumerate(top[:3], 1):
                    parts.append(f"{i}. {p['name']} – {p['qty_sold']} units")

    # Phần 2: Xu hướng từ Google Search
    google = context.get("google_results", [])
    if google:
        if is_vi:
            parts.append(
                f"\n**Xu hướng thị trường (từ Google Search – {len(google)} kết quả):**"
            )
            for r in google[:3]:
                title   = r.get("title", "")
                snippet = r.get("snippet", "")
                if title:
                    parts.append(f"- {title}: {snippet[:100]}..." if snippet else f"- {title}")
        else:
            parts.append(f"\n**Market trends (from Google – {len(google)} results):**")
            for r in google[:3]:
                title = r.get("title", "")
                if title:
                    parts.append(f"- {title}")

    # Phần 3: Insights từ Facebook
    facebook = context.get("facebook_results", [])
    if facebook:
        if is_vi:
            parts.append(
                f"\n**Thông tin từ Facebook page ({len(facebook)} bài đăng liên quan):**"
            )
            for r in facebook[:2]:
                content = r.get("post_content", "")
                page    = r.get("page_name", "")
                if content:
                    parts.append(
                        f"- [{page}] {content[:120]}..."
                        if len(content) > 120 else f"- [{page}] {content}"
                    )
        else:
            parts.append(f"\n**Facebook page insights ({len(facebook)} posts):**")
            for r in facebook[:2]:
                content = r.get("post_content", "")
                if content:
                    parts.append(f"- {content[:120]}...")

    # Nếu không có dữ liệu nào
    if not parts:
        if is_vi:
            parts.append(
                "Chưa có đủ dữ liệu để trả lời câu hỏi này. "
                "Vui lòng chạy scraper để thu thập dữ liệu trước."
            )
        else:
            parts.append(
                "Not enough data to answer this question. "
                "Please run the scraper to collect data first."
            )

    # Luôn kết thúc bằng cảnh báo nguồn dữ liệu
    if is_vi:
        parts.append(
            "\n⚠️ Lưu ý: Gợi ý dựa trên dữ liệu chưa kiểm chứng (Mức 1 – web scraping)."
        )
    else:
        parts.append(
            "\n⚠️ Note: This recommendation is based on unverified data (Level 1 – web scraping)."
        )

    return "\n".join(parts)


def _analyze_channel_performance() -> List[Recommendation]:
    """Phân tích hiệu suất kênh bán hàng và sinh gợi ý."""
    recs = []
    sql = """
        SELECT
            dc.channel_name,
            SUM(fs.net_revenue)   AS revenue,
            SUM(fs.order_count)   AS orders,
            AVG(fs.profit_margin) AS avg_margin
        FROM dw.fact_sales fs
        JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
        JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
        WHERE dd.full_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY dc.channel_name
        ORDER BY revenue DESC
    """
    try:
        df = query_df(sql)
        if df.empty:
            return recs

        _DISPLAY = {"shopee": "Shopee", "tiktok": "TikTok Shop", "lazada": "Lazada",
                    "facebook": "Facebook", "website": "Website"}
        total_revenue = df["revenue"].sum()
        for _, row in df.iterrows():
            pct  = row["revenue"] / total_revenue * 100 if total_revenue else 0
            ch   = row["channel_name"]
            name = _DISPLAY.get(ch.lower(), ch.title())
            # Kênh chiếm < 10% doanh thu
            if pct < 10:
                recs.append(Recommendation(
                    priority="MEDIUM",
                    category="CHANNEL",
                    title=f"Kênh {name} đang yếu",
                    detail=f"Kênh {name} chỉ chiếm {pct:.1f}% doanh thu 30 ngày qua.",
                    action=f"Xem xét tăng ngân sách quảng cáo hoặc chạy flash sale trên {name}.",
                ))
            # Kênh có margin thấp
            if row["avg_margin"] and row["avg_margin"] < 10:
                recs.append(Recommendation(
                    priority="HIGH",
                    category="REVENUE",
                    title=f"Biên lợi nhuận thấp trên {name}",
                    detail=f"Biên lợi nhuận TB chỉ {row['avg_margin']:.1f}% trên kênh {name}.",
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
    """Top sản phẩm bán chạy 7 ngày – cảnh báo tồn kho."""
    recs = []
    sql = """
        SELECT
            p.product_name,
            SUM(oi.quantity)   AS qty_sold,
            SUM(oi.subtotal)   AS revenue,
            COALESCE(MIN(pv.stock_quantity), 0) AS stock
        FROM public.order_items oi
        JOIN public.orders   o  ON oi.order_id   = o.order_id
        JOIN public.products p  ON oi.product_id = p.product_id
        LEFT JOIN public.product_variations pv ON pv.product_id = p.product_id AND pv.is_active
        WHERE o.status NOT IN ('CANCELLED','RETURNED')
          AND o.order_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY p.product_id, p.product_name
        ORDER BY qty_sold DESC
        LIMIT 5
    """
    try:
        df = query_df(sql)
        if df.empty:
            return recs
        for i, (_, row) in enumerate(df.iterrows()):
            stock = int(row.get("stock", 0))
            qty   = int(row["qty_sold"])
            if i == 0:
                recs.append(Recommendation(
                    priority="MEDIUM",
                    category="Sản phẩm",
                    title=f"Top sản phẩm: {row['product_name']}",
                    detail=f"Bán {qty} sản phẩm trong 7 ngày qua – doanh thu {row['revenue']:,.0f} VNĐ.",
                    action="Đảm bảo tồn kho đủ để đáp ứng nhu cầu. Xem xét nhập thêm hàng.",
                ))
            # Cảnh báo tồn kho thấp cho top sản phẩm
            if stock < 10 and qty > 3:
                recs.append(Recommendation(
                    priority="HIGH",
                    category="Tồn kho",
                    title=f"Sắp hết hàng: {row['product_name']}",
                    detail=f"Đang bán nhanh ({qty} đơn/tuần) nhưng tồn kho chỉ còn {stock} sản phẩm.",
                    action="Đặt hàng ngay để tránh mất đơn hàng trong 1–2 ngày tới.",
                ))
    except Exception:
        pass
    return recs


def _analyze_revenue_trend() -> List[Recommendation]:
    """So sánh doanh thu 7 ngày qua vs 7 ngày trước đó."""
    recs = []
    sql = """
        SELECT
            SUM(CASE WHEN order_date >= CURRENT_DATE - 7  THEN total_amount ELSE 0 END) AS curr,
            SUM(CASE WHEN order_date >= CURRENT_DATE - 14
                      AND order_date <  CURRENT_DATE - 7  THEN total_amount ELSE 0 END) AS prev,
            COUNT(CASE WHEN order_date >= CURRENT_DATE - 7  THEN 1 END) AS curr_orders,
            COUNT(CASE WHEN order_date >= CURRENT_DATE - 14
                        AND order_date <  CURRENT_DATE - 7  THEN 1 END) AS prev_orders
        FROM public.orders
        WHERE status NOT IN ('CANCELLED','RETURNED')
          AND order_date >= CURRENT_DATE - 14
    """
    try:
        df = query_df(sql)
        if df.empty:
            return recs
        row  = df.iloc[0]
        curr = float(row["curr"] or 0)
        prev = float(row["prev"] or 0)
        curr_ord = int(row["curr_orders"] or 0)
        prev_ord = int(row["prev_orders"] or 0)
        if prev > 0:
            chg = (curr - prev) / prev * 100
            if chg <= -15:
                recs.append(Recommendation(
                    priority="HIGH",
                    category="Doanh thu",
                    title=f"Doanh thu giảm {abs(chg):.0f}% so với tuần trước",
                    detail=f"Tuần này: {curr:,.0f} VNĐ ({curr_ord} đơn) – tuần trước: {prev:,.0f} VNĐ ({prev_ord} đơn).",
                    action="Kiểm tra lý do hủy đơn, tình trạng tồn kho, và hiệu quả quảng cáo.",
                ))
            elif chg >= 20:
                recs.append(Recommendation(
                    priority="LOW",
                    category="Doanh thu",
                    title=f"Doanh thu tăng trưởng tốt +{chg:.0f}% so với tuần trước",
                    detail=f"Tuần này: {curr:,.0f} VNĐ ({curr_ord} đơn) – tuần trước: {prev:,.0f} VNĐ ({prev_ord} đơn).",
                    action="Duy trì chiến lược hiện tại. Xem xét mở rộng ngân sách quảng cáo.",
                ))
        if curr_ord == 0:
            recs.append(Recommendation(
                priority="HIGH",
                category="Doanh thu",
                title="Không có đơn hàng trong 7 ngày qua",
                detail="Hệ thống chưa ghi nhận đơn hàng mới trong 7 ngày gần nhất.",
                action="Kiểm tra kết nối API các kênh bán hàng và trạng thái import dữ liệu.",
            ))
    except Exception:
        pass
    return recs


def _analyze_cancellation_rate() -> List[Recommendation]:
    """Cảnh báo tỷ lệ hủy đơn cao."""
    recs = []
    sql = """
        SELECT
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COUNT(*) AS total
        FROM public.orders
        WHERE order_date >= CURRENT_DATE - 14
    """
    try:
        df = query_df(sql)
        if df.empty:
            return recs
        row   = df.iloc[0]
        total = int(row["total"] or 0)
        canc  = int(row["cancelled"] or 0)
        if total >= 10:
            rate = canc / total * 100
            if rate >= 20:
                recs.append(Recommendation(
                    priority="HIGH",
                    category="Bất thường",
                    title=f"Tỷ lệ hủy đơn cao: {rate:.0f}%",
                    detail=f"{canc}/{total} đơn hàng bị hủy trong 14 ngày qua.",
                    action="Rà soát nguyên nhân hủy (hết hàng, giá sai, lỗi vận chuyển) và liên hệ khách hàng.",
                ))
            elif rate >= 10:
                recs.append(Recommendation(
                    priority="MEDIUM",
                    category="Bất thường",
                    title=f"Tỷ lệ hủy đơn cần chú ý: {rate:.0f}%",
                    detail=f"{canc}/{total} đơn hàng bị hủy trong 14 ngày qua.",
                    action="Theo dõi xu hướng – nếu tiếp tục tăng cần xem xét chính sách đổi trả.",
                ))
    except Exception:
        pass
    return recs


def _analyze_unpaid_orders() -> List[Recommendation]:
    """Cảnh báo đơn hàng chưa thanh toán tích lũy."""
    recs = []
    sql = """
        SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0) AS total_value
        FROM public.orders
        WHERE payment_status = 'UNPAID'
          AND status NOT IN ('CANCELLED','RETURNED')
          AND order_date >= CURRENT_DATE - 30
    """
    try:
        df = query_df(sql)
        if df.empty:
            return recs
        row = df.iloc[0]
        cnt = int(row["cnt"] or 0)
        val = float(row["total_value"] or 0)
        if cnt >= 5:
            recs.append(Recommendation(
                priority="MEDIUM",
                category="Doanh thu",
                title=f"{cnt} đơn hàng chưa thanh toán ({val:,.0f} VNĐ)",
                detail=f"Có {cnt} đơn hàng COD/chuyển khoản chưa xác nhận thanh toán trong 30 ngày qua.",
                action="Liên hệ khách hàng xác nhận hoặc chuyển sang trạng thái đã thanh toán.",
            ))
    except Exception:
        pass
    return recs


def _analyze_channel_mix() -> List[Recommendation]:
    """Phân tích đa dạng kênh bán – cảnh báo phụ thuộc 1 kênh."""
    recs = []
    sql = """
        SELECT sc.channel_name, SUM(o.total_amount) AS revenue
        FROM public.orders o
        JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
        WHERE o.status NOT IN ('CANCELLED','RETURNED')
          AND o.order_date >= CURRENT_DATE - 30
        GROUP BY sc.channel_name
        ORDER BY revenue DESC
    """
    try:
        df = query_df(sql)
        if df.empty or len(df) < 2:
            return recs
        total = df["revenue"].sum()
        top   = df.iloc[0]
        pct   = top["revenue"] / total * 100 if total else 0
        if pct >= 70:
            recs.append(Recommendation(
                priority="MEDIUM",
                category="Kênh bán hàng",
                title=f"Phụ thuộc cao vào kênh {top['channel_name']} ({pct:.0f}%)",
                detail=f"Kênh {top['channel_name']} chiếm {pct:.0f}% doanh thu 30 ngày – các kênh khác chiếm phần nhỏ.",
                action="Đầu tư phát triển thêm kênh thứ 2 để giảm rủi ro phụ thuộc.",
            ))
        # Kênh đang tăng trưởng nhanh
        for _, row in df.iterrows():
            if row["revenue"] / total * 100 < 5 and row["revenue"] > 0:
                recs.append(Recommendation(
                    priority="LOW",
                    category="Kênh bán hàng",
                    title=f"Kênh {row['channel_name']} chưa được khai thác",
                    detail=f"Chỉ chiếm {row['revenue']/total*100:.1f}% doanh thu – tiềm năng còn lớn.",
                    action=f"Thử chạy flash sale hoặc tăng quảng cáo trên kênh {row['channel_name']}.",
                ))
                break  # chỉ cảnh báo 1 kênh yếu nhất
    except Exception:
        pass
    return recs


def _analyze_forecast() -> List[Recommendation]:
    """
    Dự báo Prophet 7 ngày tới và so sánh với 7 ngày hiện tại.
    Gợi ý hành động phòng ngừa (proactive) thay vì chỉ phản ứng sau khi đã xảy ra.
    """
    recs = []
    try:
        from services.prophet_service import forecast_revenue, get_actual_revenue

        forecast = forecast_revenue(horizon_days=7)
        history  = get_actual_revenue(days=7)

        if not forecast or not history:
            return recs

        forecast_total = sum(p["forecast"] for p in forecast)
        actual_total   = sum(p["actual"]   for p in history)

        if actual_total <= 0:
            return recs

        change_pct = (forecast_total - actual_total) / actual_total * 100

        if change_pct <= -20:
            recs.append(Recommendation(
                priority="HIGH",
                category="FORECAST",
                title=f"Dự báo: Doanh thu 7 ngày tới giảm {abs(change_pct):.0f}%",
                detail=(
                    f"Mô hình Prophet dự báo doanh thu 7 ngày tới ≈ {forecast_total:,.0f} VNĐ, "
                    f"thấp hơn {abs(change_pct):.0f}% so với 7 ngày qua ({actual_total:,.0f} VNĐ). "
                    "Đây là cảnh báo sớm trước khi doanh thu thực sự sụt giảm."
                ),
                action="Chủ động chạy khuyến mãi hoặc tăng ngân sách quảng cáo ngay trong tuần này.",
            ))
        elif change_pct <= -10:
            recs.append(Recommendation(
                priority="MEDIUM",
                category="FORECAST",
                title=f"Dự báo: Doanh thu 7 ngày tới giảm nhẹ {abs(change_pct):.0f}%",
                detail=(
                    f"Prophet dự báo ≈ {forecast_total:,.0f} VNĐ – giảm {abs(change_pct):.0f}% "
                    f"so với tuần hiện tại ({actual_total:,.0f} VNĐ)."
                ),
                action="Theo dõi chặt chỉ số tỷ lệ chuyển đổi và tồn kho các sản phẩm chủ lực.",
            ))
        elif change_pct >= 15:
            recs.append(Recommendation(
                priority="LOW",
                category="FORECAST",
                title=f"Dự báo: Doanh thu 7 ngày tới tăng {change_pct:.0f}%",
                detail=(
                    f"Prophet dự báo ≈ {forecast_total:,.0f} VNĐ – tăng {change_pct:.0f}% "
                    f"so với tuần hiện tại ({actual_total:,.0f} VNĐ)."
                ),
                action="Đảm bảo tồn kho đủ hàng và nguồn lực xử lý đơn tăng cao.",
            ))
    except Exception as e:
        logger.warning("Prophet forecast analyzer lỗi: %s", e)
    return recs


def _analyze_rfm_segments() -> List[Recommendation]:
    """
    Đọc kết quả phân khúc RFM từ file JSON (sinh bởi notebook 04).
    Gợi ý hành động tái tương tác khách hàng At Risk / Lost và khai thác Champions.
    """
    recs = []
    try:
        if not os.path.exists(_RFM_PATH):
            return recs
        with open(_RFM_PATH, encoding="utf-8") as f:
            rfm_data = json.load(f)

        segments = rfm_data.get("segment_summary", {})
        total    = rfm_data.get("total_customers", 0)
        if not segments or total <= 0:
            return recs

        # Khách hàng At Risk — có nguy cơ rời bỏ
        at_risk = segments.get("At Risk", {})
        at_risk_cnt = int(at_risk.get("count", 0))
        if at_risk_cnt >= 5:
            pct = round(at_risk_cnt / total * 100, 1)
            avg_rev = at_risk.get("avg_monetary", 0)
            recs.append(Recommendation(
                priority="HIGH",
                category="CUSTOMER",
                title=f"Cảnh báo: {at_risk_cnt} khách hàng At Risk ({pct}% tổng khách)",
                detail=(
                    f"{at_risk_cnt} khách từng mua thường xuyên nhưng gần đây không mua nữa. "
                    f"CLV trung bình: {avg_rev:,.0f} VNĐ/người. "
                    f"Nếu mất hết nhóm này, doanh thu tiềm năng giảm "
                    f"~{at_risk_cnt * avg_rev:,.0f} VNĐ."
                ),
                action="Gửi voucher giảm giá 10-15% cho nhóm At Risk ngay trong tuần này.",
            ))

        # Khách hàng Lost — đã mất
        lost = segments.get("Lost", {})
        lost_cnt = int(lost.get("count", 0))
        if lost_cnt >= 10:
            pct = round(lost_cnt / total * 100, 1)
            recs.append(Recommendation(
                priority="MEDIUM",
                category="CUSTOMER",
                title=f"{lost_cnt} khách hàng đã ngừng mua ({pct}% tổng khách)",
                detail=(
                    f"Nhóm Lost là khách từng mua nhưng đã ngừng liên hệ quá lâu. "
                    f"Tỷ lệ win-back trung bình ngành ~15-20%."
                ),
                action="Chạy chiến dịch re-engagement với ưu đãi đặc biệt 'Nhớ bạn – Giảm 20%'.",
            ))

        # Khai thác Champions
        champs = segments.get("Champions", {})
        champs_cnt = int(champs.get("count", 0))
        if champs_cnt >= 3:
            avg_rev = champs.get("avg_monetary", 0)
            recs.append(Recommendation(
                priority="LOW",
                category="CUSTOMER",
                title=f"Cơ hội: {champs_cnt} khách Champions sẵn sàng upsell",
                detail=(
                    f"Nhóm Champions là khách mua thường xuyên và chi tiêu cao nhất. "
                    f"CLV TB: {avg_rev:,.0f} VNĐ/người."
                ),
                action="Mời vào chương trình VIP / loyalty. Ưu đãi preview sản phẩm mới.",
            ))
    except Exception as e:
        logger.warning("RFM analyzer lỗi: %s", e)
    return recs


def _analyze_basket_opportunities(company_id: str = None) -> List[Recommendation]:
    """
    Dùng kết quả Market Basket Analysis (Apriori) để gợi ý bundle/cross-sell.
    Chỉ gợi ý khi có rules thật (is_mock=False).
    """
    recs = []
    try:
        result = run_basket_analysis(company_id=company_id, days=180, top_n=3)
        if result.get("is_mock") or not result.get("rules"):
            return recs

        top_rules = result["rules"][:2]  # Chỉ lấy 2 rule có lift cao nhất
        for rule in top_rules:
            ante = " + ".join(rule["antecedents"])
            cons = " + ".join(rule["consequents"])
            lift = rule["lift"]
            conf = round(rule["confidence"] * 100, 0)
            txns = rule["transactions"]
            recs.append(Recommendation(
                priority="MEDIUM",
                category="MARKETING",
                title=f"Cơ hội bundle: {ante} → {cons}",
                detail=(
                    f"{conf:.0f}% khách mua '{ante}' cũng mua '{cons}' (lift={lift}x, "
                    f"{txns} đơn thực tế). "
                    f"Lift > 1 chứng tỏ 2 sản phẩm này có mối quan hệ mua chung thực sự."
                ),
                action=(
                    f"Tạo combo '{ante} + {cons}' với giá ưu đãi 5-10%. "
                    "Hiển thị gợi ý 'Thường mua cùng' trên trang sản phẩm."
                    if lift >= 2 else
                    f"Thêm '{cons}' vào mục 'Khách hàng cũng thích' trên trang '{ante}'."
                ),
            ))
    except Exception as e:
        logger.warning("Basket opportunity analyzer lỗi: %s", e)
    return recs


@router.get(
    "",
    response_model=RecommendationResponse,
    summary="Gợi ý hành động từ AI",
    description=(
        "Phân tích tổng hợp 10 tín hiệu: trend, forecast (Prophet), anomaly, "
        "channel, product, cancel rate, unpaid, RFM segments, market basket. "
        "Đưa ra gợi ý hành động ưu tiên cho người quản lý."
    ),
)
def get_recommendations(company_id: Optional[str] = Query(default=None)):
    try:
        recs: List[Recommendation] = []

        recs += _analyze_revenue_trend()
        recs += _analyze_forecast()            # Prophet ML — dự báo 7 ngày tới
        recs += _analyze_top_products()
        recs += _analyze_channel_performance()
        recs += _analyze_channel_mix()
        recs += _analyze_cancellation_rate()
        recs += _analyze_unpaid_orders()
        recs += _analyze_anomalies()           # Z-score ML — phát hiện bất thường
        recs += _analyze_rfm_segments()        # RFM clustering — phân khúc KH
        recs += _analyze_basket_opportunities(company_id)  # Apriori MBA — cơ hội bundle

        # Sắp xếp theo priority rồi loại trùng title
        priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        recs.sort(key=lambda r: priority_order.get(r.priority, 9))
        seen = set()
        unique: List[Recommendation] = []
        for r in recs:
            if r.title not in seen:
                seen.add(r.title)
                unique.append(r)

        return RecommendationResponse(
            generated_at=datetime.now(timezone.utc).isoformat(),
            total=len(unique),
            recommendations=unique,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sinh gợi ý: {e}")


@router.post(
    "",
    response_model=AskResponse,
    summary="Hỏi AI gợi ý theo câu hỏi tự nhiên",
    description=(
        "Nhận câu hỏi tự nhiên từ người dùng, truy vấn dữ liệu liên quan "
        "(Google scraping, Facebook scraping, OLTP), gửi lên AI để sinh gợi ý. "
        "Nếu không có API key AI → dùng rule-based fallback."
    ),
)
async def ask_recommendation(body: AskRequest):
    """
    Pipeline xử lý (hỗ trợ context/sources):
        1. Xác định context type: business_data | market_trends | customer_feedback
        2. Gọi QueryEngine.get_context_for_recommendation() → thu thập context theo nguồn
        3. Gọi AI (Claude → OpenAI → rule-based fallback) với system prompt theo context
        4. Trả về gợi ý text + metadata nguồn dữ liệu

    Context rules:
        business_data   → truy vấn fact_sales + OLTP
        market_trends   → truy vấn google data (DW + raw)
        customer_feedback → truy vấn facebook data
        None (mặc định) → truy vấn tất cả (get_context cũ)
    """
    question     = (body.question or "").strip()
    language     = body.language or "vi"
    ctx_type     = (body.context or "").strip() or None
    sources_req  = body.sources or []

    if not question:
        raise HTTPException(status_code=400, detail="question không được để trống")

    # Bước 1: Lấy context từ QueryEngine theo context/sources
    try:
        import sys
        import os as _os
        ai_service_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
        if ai_service_dir not in sys.path:
            sys.path.insert(0, ai_service_dir)
        from query_engine import QueryEngine
        engine = QueryEngine()

        if ctx_type or sources_req:
            # Chế độ có context/sources → gọi hàm định tuyến nguồn dữ liệu
            context = engine.get_context_for_recommendation(question, ctx_type, sources_req)
        else:
            # Backward compat: không có context → dùng get_context cũ
            context = engine.get_context(question)
    except Exception as e:
        logger.error("Lỗi QueryEngine: %s", e)
        context = {
            "question": question, "keywords": [],
            "google_results": [], "facebook_results": [],
            "fact_sales_results": [], "sales_summary": {},
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        }

    # Xác định nguồn dữ liệu đã dùng
    data_sources: List[str] = []
    sources_used: List[str] = []

    dw_results          = context.get("dw_results", [])
    google_results      = context.get("google_results", [])
    facebook_results    = context.get("facebook_results", [])
    fact_sales_results  = context.get("fact_sales_results", [])
    sales_summary       = context.get("sales_summary", {})
    data_level          = context.get("data_level", "level1")

    if dw_results or fact_sales_results:
        data_sources.append("Data Warehouse")
        sources_used.append("fact_sales")
    if google_results:
        data_sources.append("Google Search")
        sources_used.append("google")
    if facebook_results:
        data_sources.append("Facebook")
        sources_used.append("facebook")
    if sales_summary:
        if "Bán hàng" not in data_sources:
            data_sources.append("Bán hàng")
        if "oltp" not in sources_used:
            sources_used.append("oltp")

    # Confidence score
    _conf_score = 0
    if len(dw_results) >= 5 or len(fact_sales_results) >= 3:
        _conf_score += 1
    if facebook_results:
        _conf_score += 1
    if sales_summary.get("order_count_30d", 0) > 0:
        _conf_score += 1

    # Bước 2: System prompt theo context type
    def _build_system_prompt(ctx: str, lang: str) -> str:
        lang_str = "tiếng Việt" if lang == "vi" else "English"
        base = f"Trả lời bằng {lang_str}. Ngắn gọn, thực tế, phù hợp SME Việt Nam."
        if ctx == "business_data":
            return (
                "Bạn là chuyên gia phân tích dữ liệu bán hàng. "
                "Dựa trên doanh thu, đơn hàng, sản phẩm được cung cấp, "
                "hãy phân tích và đưa ra gợi ý chiến lược kinh doanh cụ thể. " + base
            )
        if ctx == "market_trends":
            return (
                "Bạn là chuyên gia phân tích thị trường. "
                "Dựa trên dữ liệu xu hướng từ Google Search và thị trường online, "
                "hãy chỉ ra các cơ hội kinh doanh và sản phẩm trending. " + base
            )
        if ctx == "customer_feedback":
            return (
                "Bạn là chuyên gia phân tích trải nghiệm khách hàng. "
                "Dựa trên bình luận và phản hồi từ mạng xã hội, "
                "hãy tóm tắt cảm xúc khách hàng và đưa ra gợi ý cải thiện dịch vụ/sản phẩm. " + base
            )
        return (
            "Bạn là trợ lý phân tích kinh doanh cho SME Việt Nam. "
            "Dựa trên dữ liệu được cung cấp, hãy đưa ra gợi ý ngắn gọn, thực tế. " + base
        )

    # Bước 3: Gọi AI theo thứ tự ưu tiên: Gemini → Groq → rule-based
    recommendation_text = ""
    confidence          = "LOW"
    ai_used             = "fallback"

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key   = os.getenv("GROQ_API_KEY", "")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    groq_model   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    sys_prompt   = _build_system_prompt(ctx_type or "", language)
    context_text = json.dumps(context, ensure_ascii=False, indent=2, default=str)
    user_prompt  = f"Câu hỏi: {question}\n\nDữ liệu:\n{context_text[:3000]}"

    # Tier 1: Gemini API (khớp với cấu hình chính của hệ thống)
    if gemini_key:
        try:
            import httpx
            full_prompt = f"{sys_prompt}\n\n{user_prompt}"
            payload = {
                "contents": [{"role": "user", "parts": [{"text": full_prompt}]}],
                "generationConfig": {"temperature": 0.5, "maxOutputTokens": 500, "candidateCount": 1},
            }
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}",
                json=payload, timeout=25,
            )
            if resp.status_code == 200:
                data = resp.json()
                recommendation_text = (
                    data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                )
                if recommendation_text:
                    confidence = "MEDIUM"
                    ai_used    = f"gemini-{gemini_model}"
                    logger.info("Đã dùng Gemini API, context=%s", ctx_type)
        except Exception as e:
            logger.error("Lỗi Gemini API: %s – thử Groq", e)

    # Tier 2: Groq fallback (OpenAI-compatible, miễn phí)
    if not recommendation_text and groq_key:
        try:
            import httpx
            payload = {
                "model": groq_model,
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                "temperature": 0.5,
                "max_tokens": 500,
            }
            headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
            resp = httpx.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json=payload, headers=headers, timeout=25,
            )
            if resp.status_code == 200:
                data = resp.json()
                recommendation_text = (
                    data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                )
                if recommendation_text:
                    confidence = "MEDIUM"
                    ai_used    = f"groq-{groq_model}"
                    logger.info("Đã dùng Groq API, context=%s", ctx_type)
        except Exception as e:
            logger.error("Lỗi Groq API: %s – rule-based fallback", e)

    if not recommendation_text:
        # Rule-based fallback phân biệt theo context
        recommendation_text = _rule_based_by_context(question, context, ctx_type, language)
        if _conf_score == 0:
            confidence = "LOW"
        elif _conf_score <= 2:
            confidence = "MEDIUM"
        else:
            confidence = "HIGH"
        ai_used = "rule-based"
        logger.info("Rule-based fallback: context=%s, conf=%s", ctx_type, confidence)
    elif confidence == "MEDIUM" and _conf_score >= 2:
        confidence = "HIGH"

    # Bước 4: Ghi chú nguồn
    ctx_label = {
        "business_data":    "dữ liệu kinh doanh nội bộ",
        "market_trends":    "xu hướng thị trường (Google)",
        "customer_feedback":"phản hồi khách hàng (Facebook)",
    }.get(ctx_type or "", "dữ liệu tổng hợp")

    note_vi = f"Gợi ý từ {ctx_label} – {ai_used}"
    note_en = f"Recommendation from {ctx_label} – {ai_used}"

    return AskResponse(
        question=question,
        recommendation=recommendation_text,
        data_sources=data_sources,
        confidence=confidence,
        note=note_vi if language == "vi" else note_en,
        sources_used=sources_used,
        context_type=ctx_type or "general",
    )


def _rule_based_by_context(question: str, context: dict, ctx_type: Optional[str], language: str = "vi") -> str:
    """
    Rule-based fallback phân biệt theo context type.

    business_data   → phân tích fact_sales + OLTP → top sản phẩm, kênh, doanh thu
    market_trends   → phân tích google data → xu hướng từ khóa, sản phẩm trending
    customer_feedback → phân tích facebook data → sentiment, sản phẩm được nhắc
    None            → tổng hợp tất cả (rule_based_recommendation cũ)
    """
    is_vi = language.lower() != "en"

    if ctx_type == "business_data":
        return _rule_business(context, is_vi)
    if ctx_type == "market_trends":
        return _rule_market(context, is_vi)
    if ctx_type == "customer_feedback":
        return _rule_feedback(context, is_vi)
    # General fallback
    return rule_based_recommendation(question, context, language)


def _rule_business(context: dict, is_vi: bool) -> str:
    parts = []
    sales = context.get("sales_summary", {})
    fact  = context.get("fact_sales_results", [])

    if sales:
        header = "**Dữ liệu kinh doanh thực tế:**" if is_vi else "**Business data:**"
        parts.append(header)
        if sales.get("total_revenue_30d"):
            label = "Doanh thu" if is_vi else "Revenue"
            parts.append(f"- {label}: {sales['total_revenue_30d']:,.0f} VNĐ")
        if sales.get("order_count_30d"):
            label = "Đơn hàng" if is_vi else "Orders"
            parts.append(f"- {label}: {sales['order_count_30d']}")
        top = sales.get("top_products", [])
        if top:
            header2 = "\n**Top sản phẩm bán chạy:**" if is_vi else "\n**Top products:**"
            parts.append(header2)
            for i, p in enumerate(top[:5], 1):
                parts.append(f"{i}. {p['name']} – {p.get('qty_sold', 0)} sp")

    if fact:
        label = "\n**Dữ liệu kho DW:**" if is_vi else "\n**DW data:**"
        parts.append(label)
        for r in fact[:3]:
            parts.append(f"- {r.get('channel_name', '')} | {r.get('revenue', 0):,.0f} VNĐ")

    if not parts:
        return ("Chưa có dữ liệu kinh doanh. Vui lòng chạy ETL pipeline." if is_vi
                else "No business data available. Please run the ETL pipeline.")
    parts.append("\n⚠️ Dữ liệu nội bộ – có thể tham khảo để quyết định chiến lược." if is_vi
                 else "\n⚠️ Internal data – use for strategic decisions.")
    return "\n".join(parts)


def _rule_market(context: dict, is_vi: bool) -> str:
    parts = []
    google  = context.get("google_results", [])
    dw      = context.get("dw_results", [])

    data = dw if dw else google
    if data:
        header = "**Xu hướng thị trường từ Google Search:**" if is_vi else "**Market trends from Google:**"
        parts.append(header)
        for r in data[:5]:
            title   = r.get("title", "")
            snippet = r.get("snippet") or r.get("content", "")
            if title:
                line = f"- {title}"
                if snippet:
                    line += f": {snippet[:120]}..."
                parts.append(line)

    if not parts:
        return ("Chưa có dữ liệu xu hướng. Vui lòng chạy Google Scraper." if is_vi
                else "No trend data. Please run the Google Scraper.")
    parts.append("\n⚠️ Dữ liệu thị trường – mang tính tham khảo." if is_vi
                 else "\n⚠️ Market data – for reference only.")
    return "\n".join(parts)


def _rule_feedback(context: dict, is_vi: bool) -> str:
    parts = []
    fb = context.get("facebook_results", [])

    if fb:
        pos = sum(1 for r in fb if "positive" in str(r.get("sentiment", "")))
        neg = sum(1 for r in fb if "negative" in str(r.get("sentiment", "")))
        total = len(fb)

        header = f"**Phân tích {total} bài đăng Facebook:**" if is_vi else f"**Analyzed {total} Facebook posts:**"
        parts.append(header)
        if is_vi:
            parts.append(f"- Tích cực: {pos}/{total} bài ({pos/total*100:.0f}%)")
            parts.append(f"- Tiêu cực: {neg}/{total} bài ({neg/total*100:.0f}%)")
        else:
            parts.append(f"- Positive: {pos}/{total} ({pos/total*100:.0f}%)")
            parts.append(f"- Negative: {neg}/{total} ({neg/total*100:.0f}%)")

        # Trích dẫn bài đăng tiêu biểu
        header2 = "\n**Bài đăng tiêu biểu:**" if is_vi else "\n**Sample posts:**"
        parts.append(header2)
        for r in fb[:3]:
            content = r.get("post_content", "")[:120]
            page    = r.get("page_name", "")
            if content:
                parts.append(f"- [{page}] {content}...")

    if not parts:
        return ("Chưa có dữ liệu phản hồi Facebook. Vui lòng cấu hình FACEBOOK_PAGE_TOKEN." if is_vi
                else "No Facebook data. Please configure FACEBOOK_PAGE_TOKEN.")
    parts.append("\n⚠️ Sentiment dựa trên từ khóa đơn giản – tham khảo thêm." if is_vi
                 else "\n⚠️ Sentiment based on keyword matching – verify further.")
    return "\n".join(parts)
