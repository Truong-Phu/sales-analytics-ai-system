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

logger = logging.getLogger(__name__)

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


# ── Models cho POST /recommendation (AI chatbot) ─────────────────────────────

class AskRequest(BaseModel):
    question: str                   # Câu hỏi tự nhiên của người dùng
    language: str = "vi"            # Ngôn ngữ trả về: "vi" hoặc "en"


class AskResponse(BaseModel):
    question:       str
    recommendation: str             # Gợi ý text từ AI hoặc rule-based fallback
    data_sources:   List[str]       # Nguồn dữ liệu đã dùng
    confidence:     str             # "low" | "medium" | "high"
    note:           str             # Ghi chú về nguồn dữ liệu


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
            SUM(fs.item_quantity) AS qty_sold,
            SUM(fs.net_revenue)   AS revenue
        FROM dw.fact_sales fs
        JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
        JOIN dw.dim_product dp ON fs.product_key = dp.product_key
        WHERE dd.full_date >= CURRENT_DATE - INTERVAL '7 days'
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
    Pipeline xử lý:
        1. Gọi QueryEngine.get_context(question) → thu thập context
        2. Gọi AI (Claude → OpenAI → rule-based fallback)
        3. Trả về gợi ý text + metadata nguồn dữ liệu

    Confidence:
        - Nếu có AI thật → "medium"
        - Nếu dùng rule-based → "low" (Mức 1 – dữ liệu chưa kiểm chứng)
    """
    question = (body.question or "").strip()
    language = body.language or "vi"

    if not question:
        raise HTTPException(status_code=400, detail="question không được để trống")

    # Bước 1: Lấy context từ QueryEngine
    try:
        # Import lazy để không crash khi module chưa sẵn sàng
        import sys
        import os as _os
        ai_service_dir = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
        if ai_service_dir not in sys.path:
            sys.path.insert(0, ai_service_dir)
        from query_engine import QueryEngine
        context = QueryEngine().get_context(question)
    except Exception as e:
        logger.error("Lỗi QueryEngine: %s", e)
        context = {
            "question":         question,
            "keywords":         [],
            "google_results":   [],
            "facebook_results": [],
            "sales_summary":    {},
            "retrieved_at":     datetime.now(timezone.utc).isoformat(),
        }

    # Xác định nguồn dữ liệu đã dùng
    data_sources = []
    dw_results       = context.get("dw_results", [])
    google_results   = context.get("google_results", [])
    facebook_results = context.get("facebook_results", [])
    sales_summary    = context.get("sales_summary", {})
    data_level       = context.get("data_level", "level1")

    if dw_results:
        data_sources.append("Data Warehouse")
    if google_results:
        data_sources.append("Google Search")
    if facebook_results:
        data_sources.append("Facebook")
    if sales_summary:
        data_sources.append("Bán hàng")

    # Tính confidence score trước khi gọi AI
    # Logic Mức 2: nhiều nguồn sạch → confidence cao hơn
    _conf_score = 0
    if len(dw_results) >= 5:
        _conf_score += 1    # DW có ít nhất 5 bản ghi đã clean
    if facebook_results:
        _conf_score += 1    # Có cả dữ liệu Facebook
    if sales_summary.get("order_count_30d", 0) > 0:
        _conf_score += 1    # Có dữ liệu bán hàng thực

    # Bước 2: Gọi AI hoặc fallback
    recommendation_text = ""
    confidence          = "low"
    ai_used             = "fallback"

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    openai_key    = os.getenv("OPENAI_API_KEY", "")

    if anthropic_key:
        # Ưu tiên Claude API
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)

            sys_prompt = (
                "Bạn là trợ lý phân tích kinh doanh cho doanh nghiệp vừa và nhỏ (SME) Việt Nam. "
                "Dựa trên dữ liệu được cung cấp, hãy đưa ra gợi ý ngắn gọn, thực tế. "
                f"Trả lời bằng {'tiếng Việt' if language == 'vi' else 'tiếng Anh'}."
            )
            context_text = json.dumps(context, ensure_ascii=False, indent=2, default=str)
            user_prompt  = f"Câu hỏi: {question}\n\nDữ liệu:\n{context_text[:3000]}"

            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",   # Dùng Haiku cho tốc độ nhanh
                max_tokens=500,
                system=sys_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            recommendation_text = msg.content[0].text
            confidence          = "medium"
            ai_used             = "claude"
            logger.info("Đã dùng Claude API để sinh gợi ý")
        except ImportError:
            logger.warning("anthropic chưa được cài – fallback sang OpenAI")
        except Exception as e:
            logger.error("Lỗi Claude API: %s – fallback", e)

    if not recommendation_text and openai_key:
        # Fallback sang OpenAI
        try:
            import openai
            client     = openai.OpenAI(api_key=openai_key)
            sys_prompt = (
                "Bạn là trợ lý phân tích kinh doanh cho SME Việt Nam. "
                "Dựa trên dữ liệu, đưa ra gợi ý ngắn gọn, thực tế. "
                f"Trả lời bằng {'tiếng Việt' if language == 'vi' else 'English'}."
            )
            context_text = json.dumps(context, ensure_ascii=False, indent=2, default=str)
            user_prompt  = f"Câu hỏi: {question}\n\nDữ liệu:\n{context_text[:3000]}"

            resp = client.chat.completions.create(
                model="gpt-3.5-turbo",
                max_tokens=500,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
            )
            recommendation_text = resp.choices[0].message.content
            confidence          = "medium"
            ai_used             = "openai"
            logger.info("Đã dùng OpenAI API để sinh gợi ý")
        except ImportError:
            logger.warning("openai chưa được cài – dùng rule-based fallback")
        except Exception as e:
            logger.error("Lỗi OpenAI API: %s – dùng rule-based fallback", e)

    if not recommendation_text:
        # Rule-based fallback – không cần API key
        recommendation_text = rule_based_recommendation(question, context, language)
        # Confidence dựa trên dữ liệu đầu vào, không phải AI model
        if _conf_score == 0:
            confidence = "low"
        elif _conf_score <= 2:
            confidence = "medium"
        else:
            confidence = "high"
        ai_used = "rule-based"
        logger.info(
            "Dùng rule-based fallback | conf_score=%d → confidence=%s",
            _conf_score, confidence,
        )
    elif confidence == "medium" and _conf_score >= 2:
        # AI đã được dùng + dữ liệu tốt → nâng lên high
        confidence = "high"

    # Bước 3: Trả về kết quả
    if data_level == "level2":
        note_vi = (
            f"Gợi ý dựa trên dữ liệu Mức 2 (đã qua clean/normalize) "
            f"– được tạo bởi {'AI (' + ai_used + ')' if ai_used != 'rule-based' else 'rule-based engine'}"
        )
        note_en = (
            f"Recommendation based on Level 2 data (cleaned/normalized) "
            f"– generated by {'AI (' + ai_used + ')' if ai_used != 'rule-based' else 'rule-based engine'}"
        )
    else:
        note_vi = (
            "Gợi ý từ dữ liệu Mức 1 (web scraping) – chưa qua kiểm chứng"
            if ai_used == "rule-based"
            else f"Gợi ý được tạo bởi AI ({ai_used}) dựa trên dữ liệu Mức 1"
        )
        note_en = (
            "Recommendation from Level 1 data (web scraping) – not yet verified"
            if ai_used == "rule-based"
            else f"Recommendation generated by AI ({ai_used}) from Level 1 data"
        )

    return AskResponse(
        question=question,
        recommendation=recommendation_text,
        data_sources=data_sources,
        confidence=confidence,
        note=note_vi if language == "vi" else note_en,
    )
