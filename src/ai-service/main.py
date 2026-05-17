# -*- coding: utf-8 -*-
"""
AI/ML Service – FastAPI

Endpoints:
  GET /forecast        – Dự báo doanh thu (Prophet)
  GET /forecast/model-info – Thông tin model
  GET /anomaly         – Phát hiện bất thường (Z-score)
  GET /trend           – Phân tích xu hướng
  GET /recommendation  – Gợi ý hành động
  GET /health          – Health check

Chạy:
  uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""
import logging
import os

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import forecast, anomaly, trend, recommendation
from routers.recommendation import customers_router
from routers.cache import router as cache_router, insights_router
from scheduler import scheduler as _scheduler, retrain_prophet, get_retrain_status

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger("ai.main")

app = FastAPI(
    title="Sales Analytics AI Service",
    description=(
        "AI/ML microservice cho hệ thống phân tích bán hàng đa kênh.\n\n"
        "**Mô hình:** Facebook Prophet (time-series forecasting)\n\n"
        "**Dữ liệu:** PostgreSQL Data Warehouse (Star Schema)"
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS – cho phép ASP.NET Core Backend và React Frontend gọi
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Thay bằng domain cụ thể khi deploy production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Đăng ký routers
app.include_router(forecast.router)
app.include_router(anomaly.router)
app.include_router(trend.router)
app.include_router(recommendation.router)
app.include_router(customers_router)
app.include_router(cache_router)
app.include_router(insights_router)


@app.on_event("startup")
def startup_scheduler():
    """Khởi động APScheduler khi FastAPI start."""
    _scheduler.start()
    logger.info("APScheduler đã khởi động (timezone=Asia/Ho_Chi_Minh)")


@app.on_event("shutdown")
def shutdown_scheduler():
    """Dừng APScheduler khi FastAPI shutdown."""
    _scheduler.shutdown(wait=False)
    logger.info("APScheduler đã dừng")


@app.post("/retrain", tags=["System"])
async def trigger_retrain(background_tasks: BackgroundTasks):
    """Trigger retrain Prophet ngay lập tức (chạy nền, không block request).

    - Nếu đang retrain → trả về 'already_running'
    - Sau khi kích hoạt → kiểm tra tiến trình tại GET /retrain/status
    """
    status = get_retrain_status()
    if status.get("status") == "running":
        return {
            "job_id":  "retrain",
            "status":  "already_running",
            "message": "Đang retrain, vui lòng đợi và kiểm tra /retrain/status",
        }
    background_tasks.add_task(retrain_prophet)
    return {
        "job_id":  "retrain",
        "status":  "started",
        "message": "Đã kích hoạt retrain Prophet. Theo dõi tiến trình tại GET /retrain/status",
    }


@app.get("/retrain/status", tags=["System"])
def retrain_status():
    """Trả về trạng thái job retrain hiện tại (polling-friendly)."""
    return get_retrain_status()


@app.get("/health", tags=["System"])
def health_check():
    """Kiểm tra trạng thái service."""
    from services.prophet_service import get_model_info
    model_info = get_model_info()
    return {
        "status":       "ok",
        "service":      "ai-service",
        "version":      "1.0.0",
        "model_status": model_info.get("status", "unknown"),
    }


@app.get("/health/connectors", tags=["System"])
def connector_health():
    """
    Kiểm tra trạng thái kết nối tất cả API connector.
    Gọi health_check.py từ api-integration layer.
    Dùng bởi DataSyncController (GET /api/datasync/connector-health).
    """
    import sys
    import os as _os
    from pathlib import Path

    # Thêm đường dẫn api-integration/connectors vào sys.path
    connectors_dir = (
        Path(__file__).resolve().parents[1]
        / "api-integration" / "connectors"
    )
    api_int_dir = connectors_dir.parent
    for p in [str(connectors_dir), str(api_int_dir)]:
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        # Import trực tiếp (không qua package)
        import importlib.util
        spec   = importlib.util.spec_from_file_location(
            "health_check", str(connectors_dir / "health_check.py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.check_all_connectors()
    except Exception as e:
        return {
            "error":      str(e),
            "message":    "Không thể load health_check.py",
            "checked_at": __import__("datetime").datetime.utcnow().isoformat(),
        }


@app.post("/scrape/facebook", tags=["Scraper"])
async def scrape_facebook(company_id: str, background_tasks: BackgroundTasks):
    """
    Kích hoạt scrape Facebook Page thủ công cho một tenant.
    Đọc credentials từ bảng integrations theo company_id.
    Chạy ngầm, trả về kết quả ngay khi xong (timeout 60s).
    """
    import sys
    from pathlib import Path

    connectors_dir = (
        Path(__file__).resolve().parents[1]
        / "api-integration" / "connectors"
    )
    api_int_dir = connectors_dir.parent
    for p in [str(connectors_dir), str(api_int_dir)]:
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        import importlib.util
        spec   = importlib.util.spec_from_file_location(
            "facebook_scraper", str(connectors_dir / "facebook_scraper.py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        scraper = module.FacebookScraper(company_id=company_id)
        result  = scraper.run()

        posts_found = result.get("total_scraped", 0)
        inserted    = result.get("inserted", 0)
        return {
            "success":          True,
            "company_id":       company_id,
            "total_scraped":    posts_found,
            "inserted":         inserted,
            "skipped":          result.get("skipped", 0),
            "csv_path":         result.get("csv_path"),
            "comments_scraped": result.get("comments_scraped", 0),
            "sentiment":        result.get("sentiment", {}),
            "message": (
                f"Đã scrape {posts_found} bài đăng, {inserted} mới"
                if posts_found > 0
                else "Không tìm thấy bài đăng. Kiểm tra token và quyền truy cập."
            ),
        }
    except ValueError as e:
        return {
            "success":       False,
            "company_id":    company_id,
            "total_scraped": 0,
            "message":       str(e),
            "hint":          "Thử ngắt kết nối và kết nối lại với token mới",
        }
    except Exception as e:
        logger.error("Scrape Facebook thất bại: company=%s error=%s", company_id, e)
        return {
            "success":       False,
            "company_id":    company_id,
            "total_scraped": 0,
            "message":       f"Lỗi không xác định: {str(e)[:200]}",
            "hint":          "Kiểm tra log FastAPI terminal để biết thêm chi tiết",
        }


@app.get("/feedback/summary", tags=["Feedback"])
def feedback_summary(company_id: str = ""):
    """
    Tổng hợp phản hồi mạng xã hội (Facebook comments) theo company.
    Trả về: tổng số, tỉ lệ sentiment, top issues/praises, 5 comment gần nhất.
    """
    from services.db_service import get_conn, query_df
    import pandas as pd

    # Nếu không có company_id → dùng toàn bộ dữ liệu (dev mode)
    where = "WHERE company_id = %(cid)s::uuid" if company_id else ""
    params = {"cid": company_id} if company_id else {}

    # Tổng hợp theo sentiment
    agg_sql = f"""
        SELECT sentiment, COUNT(*) AS cnt
        FROM   public.facebook_feedback
        {where}
        GROUP  BY sentiment
    """
    df_agg = query_df(agg_sql, params or None)

    total    = int(df_agg["cnt"].sum()) if not df_agg.empty else 0
    pos      = int(df_agg.loc[df_agg["sentiment"] == "positive", "cnt"].sum())
    neg      = int(df_agg.loc[df_agg["sentiment"] == "negative", "cnt"].sum())
    neu      = int(df_agg.loc[df_agg["sentiment"] == "neutral",  "cnt"].sum())

    # 5 comment gần nhất
    recent_sql = f"""
        SELECT comment_id, message, author_name, sentiment, like_count,
               created_at, scraped_at
        FROM   public.facebook_feedback
        {where}
        ORDER  BY scraped_at DESC NULLS LAST
        LIMIT  5
    """
    df_recent = query_df(recent_sql, params or None)
    recent_comments = []
    if not df_recent.empty:
        for _, row in df_recent.iterrows():
            recent_comments.append({
                "comment_id":  row.get("comment_id", ""),
                "message":     row.get("message", ""),
                "author_name": row.get("author_name", ""),
                "sentiment":   row.get("sentiment", "neutral"),
                "like_count":  int(row.get("like_count", 0)),
                "created_at":  str(row.get("created_at", "")),
            })

    # Trích xuất top issues / praises từ negative / positive messages
    def extract_keywords(messages: list[str], kwlist: list[str]) -> list[str]:
        counts: dict[str, int] = {}
        for msg in messages:
            msg_lower = msg.lower()
            for kw in kwlist:
                if kw in msg_lower:
                    counts[kw] = counts.get(kw, 0) + 1
        return [k for k, _ in sorted(counts.items(), key=lambda x: -x[1])][:3]

    NEGATIVE_KW = ["giao chậm", "sai size", "sai màu", "không phản hồi",
                   "kém chất lượng", "lỗi", "hỏng", "fake", "giả", "thất vọng"]
    POSITIVE_KW = ["giao nhanh", "chất vải đẹp", "nhiệt tình", "đúng mô tả",
                   "chính hãng", "ổn", "tốt", "đẹp", "recommend"]

    neg_msgs_sql = f"""
        SELECT message FROM public.facebook_feedback
        {where + (' AND' if where else 'WHERE')} sentiment = 'negative'
        LIMIT 100
    """
    pos_msgs_sql = f"""
        SELECT message FROM public.facebook_feedback
        {where + (' AND' if where else 'WHERE')} sentiment = 'positive'
        LIMIT 100
    """
    df_neg = query_df(neg_msgs_sql, params or None)
    df_pos = query_df(pos_msgs_sql, params or None)
    neg_msgs = df_neg["message"].tolist() if not df_neg.empty else []
    pos_msgs = df_pos["message"].tolist() if not df_pos.empty else []

    return {
        "total_comments":   total,
        "positive":         pos,
        "negative":         neg,
        "neutral":          neu,
        "positive_pct":     round(pos / total * 100, 1) if total else 0,
        "negative_pct":     round(neg / total * 100, 1) if total else 0,
        "neutral_pct":      round(neu / total * 100, 1) if total else 0,
        "top_issues":       extract_keywords(neg_msgs, NEGATIVE_KW),
        "top_praises":      extract_keywords(pos_msgs, POSITIVE_KW),
        "recent_comments":  recent_comments,
    }


@app.get("/", include_in_schema=False)
def root():
    return {"message": "Sales Analytics AI Service – truy cập /docs để xem API"}
