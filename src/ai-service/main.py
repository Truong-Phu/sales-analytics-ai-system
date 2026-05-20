# -*- coding: utf-8 -*-
"""
AI/ML Service – FastAPI

Endpoints cốt lõi:
  GET  /forecast        – Dự báo doanh thu (Prophet)
  GET  /anomaly         – Phát hiện bất thường (Z-score)
  GET  /trend           – Phân tích xu hướng
  GET  /recommendation  – Gợi ý hành động

Endpoints mới (chức năng sáng tạo):
  GET  /churn          – Dự báo khách hàng có nguy cơ rời bỏ (RandomForest)
  GET  /basket         – Phân tích sản phẩm hay mua chung (Apriori)
  GET  /inventory      – Thông minh dự báo tồn kho và gợi ý đặt hàng
  POST /whatif         – Mô phỏng kịch bản What-If
  GET  /attribution    – Phân bổ doanh thu theo kênh
  GET  /campaign       – Lên lịch chiến dịch marketing thông minh
  GET  /geo            – Phân bổ khách hàng theo địa lý (Heatmap)
  GET  /leaderboard    – Bảng xếp hạng hiệu suất bán hàng
  GET  /narrative      – Sinh nhận xét tự động bằng ngôn ngữ tự nhiên

ETL:
  POST /etl/oltp-to-dw – Đồng bộ OLTP → Data Warehouse (idempotent)
  GET  /etl/status     – Trạng thái lần ETL cuối

Chạy:
  uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""
import io
import logging
import os
import sys
from pathlib import Path

# Đảm bảo stdout/stderr dùng UTF-8 trên Windows (tránh lỗi charmap với tiếng Việt)
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import forecast, anomaly, trend, recommendation
from routers.recommendation import customers_router
from routers.cache import router as cache_router, insights_router
from routers.churn       import router as churn_router
from routers.basket      import router as basket_router
from routers.inventory   import router as inventory_router
from routers.whatif      import router as whatif_router
from routers.attribution import router as attribution_router
from routers.campaign    import router as campaign_router
from routers.geo         import router as geo_router
from routers.leaderboard import router as leaderboard_router
from routers.narrative   import router as narrative_router
from routers.supplier    import router as supplier_router
from routers.price       import router as price_router
from routers.etl         import router as etl_router
from scheduler import scheduler as _scheduler, retrain_prophet, get_retrain_status

# Chỉ định rõ đường dẫn .env (repo root), tránh find_dotenv() fail khi chạy từ subdirectory
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=_ENV_PATH, override=True)

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

# Đăng ký routers – cốt lõi
app.include_router(forecast.router)
app.include_router(anomaly.router)
app.include_router(trend.router)
app.include_router(recommendation.router)
app.include_router(customers_router)
app.include_router(cache_router)
app.include_router(insights_router)

# Đăng ký routers – chức năng sáng tạo mới
app.include_router(churn_router)
app.include_router(basket_router)
app.include_router(inventory_router)
app.include_router(whatif_router)
app.include_router(attribution_router)
app.include_router(campaign_router)
app.include_router(geo_router)
app.include_router(leaderboard_router)
app.include_router(narrative_router)
app.include_router(supplier_router)
app.include_router(price_router)
app.include_router(etl_router)


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


@app.get("/debug/env", tags=["System"])
def debug_env():
    """Debug: kiểm tra env vars và thử decrypt token đầu tiên trong DB."""
    import base64
    enc_key = os.getenv("ENCRYPTION_KEY", "")
    db_url  = os.getenv("DATABASE_URL", "")
    result  = {
        "cwd":                os.getcwd(),
        "encryption_key_len": len(enc_key),
        "encryption_key_ok":  len(enc_key) == 64,
        "database_url_set":   bool(db_url),
        "scraper_mode":       os.getenv("SCRAPER_MODE", ""),
    }
    # Thử decrypt token đầu tiên trong DB
    if db_url and len(enc_key) == 64:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url)
            cur  = conn.cursor()
            cur.execute("SELECT access_token FROM public.integrations WHERE platform='facebook' LIMIT 1")
            row = cur.fetchone()
            cur.close(); conn.close()
            if row:
                token = row[0] or ""
                try:
                    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                    data        = base64.b64decode(token)
                    nonce       = data[:12]
                    ct_with_tag = data[12:]
                    plain       = AESGCM(bytes.fromhex(enc_key)).decrypt(nonce, ct_with_tag, None).decode()
                    result["decrypt_ok"]      = True
                    result["token_prefix"]    = plain[:15] + "..."
                except Exception as e:
                    result["decrypt_ok"]    = False
                    result["decrypt_error"] = str(e)
        except Exception as e:
            result["db_error"] = str(e)
    return result


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


@app.post("/scrape/google", tags=["Scraper"])
async def scrape_google(company_id: str):
    """
    Kích hoạt scrape Google Search thủ công cho một tenant.
    Đọc keywords từ bảng scraper_keywords theo company_id.
    Lưu kết quả vào raw_google_data (dedup by content_hash).

    Chiến lược:
      1. Google Search → nếu bị block → tự động fallback DuckDuckGo HTML
      2. Delay ngẫu nhiên 3-7s giữa các keyword (rate limit)
      3. Retry 1 lần nếu HTTP 429 (chờ 60s)

    Response status:
      "success"  — tất cả keyword xử lý OK
      "partial"  — một số keyword bị block nhưng vẫn có kết quả
      "blocked"  — tất cả keyword bị chặn
      "error"    — lỗi không xác định
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
            "google_scraper", str(connectors_dir / "google_scraper.py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        scraper = module.GoogleScraper(company_id=company_id)
        result  = scraper.run()

        status           = result.get("status", "unknown")
        results_found    = result.get("results_found", result.get("total_scraped", 0))
        results_new      = result.get("results_new", result.get("inserted", 0))
        results_skipped  = result.get("results_skipped", result.get("skipped", 0))
        blocked_keywords = result.get("blocked_keywords", [])
        error_detail     = result.get("error_detail")

        # Sinh message rõ ràng theo status
        if status == "success" and results_found > 0:
            message = (
                f"Scrape hoàn tất: {results_found} kết quả, "
                f"{results_new} mới, {results_skipped} bỏ qua"
            )
        elif status == "partial":
            message = (
                f"Scrape một phần: {results_found} kết quả "
                f"({results_new} mới). "
                f"{len(blocked_keywords)} keyword bị chặn: {blocked_keywords}"
            )
        elif status == "blocked":
            message = (
                "Google Search và DuckDuckGo đều bị chặn. "
                "Thử lại sau hoặc đặt SCRAPER_MODE=offline."
            )
        elif status == "error":
            message = f"Lỗi: {error_detail or 'Xem log FastAPI terminal'}"
        else:
            message = (
                "Scrape hoàn tất nhưng không thu thập được kết quả. "
                "Có thể Google/DDG đang giới hạn hoặc chưa có keywords active."
            )

        return {
            "success":            status in ("success", "partial"),
            "status":             status,
            "company_id":         company_id,
            "keywords_processed": result.get("keywords_processed", 0),
            "results_found":      results_found,
            "results_new":        results_new,
            "results_skipped":    results_skipped,
            "blocked_keywords":   blocked_keywords,
            "error_detail":       error_detail,
            "csv_path":           result.get("csv_path"),
            "message":            message,
            # Legacy keys (backward-compat)
            "total_scraped":      results_found,
            "inserted":           results_new,
            "skipped":            results_skipped,
        }
    except Exception as e:
        logger.error("Scrape Google thất bại: company=%s error=%s", company_id, e, exc_info=True)
        return {
            "success":            False,
            "status":             "error",
            "company_id":         company_id,
            "keywords_processed": 0,
            "results_found":      0,
            "results_new":        0,
            "results_skipped":    0,
            "blocked_keywords":   [],
            "error_detail":       str(e)[:500],
            "csv_path":           None,
            "message":            f"Lỗi không xác định: {str(e)[:200]}",
            "hint":               "Kiểm tra log FastAPI terminal để biết thêm chi tiết",
            "total_scraped":      0,
            "inserted":           0,
            "skipped":            0,
        }


@app.get("/trends/summary", tags=["Scraper"])
def get_trends_summary(company_id: str = "", days: int = 30):
    """
    Trả về tóm tắt xu hướng từ dữ liệu Google Search đã scrape.
    Dùng để hiển thị trên Dashboard tab Thị trường.
    Trả về: top keywords theo số lần xuất hiện trong N ngày gần nhất.
    """
    from services.db_service import query_df

    where_clauses = [f"scraped_at >= NOW() - INTERVAL '{int(days)} days'"]
    params: dict = {}

    if company_id:
        where_clauses.append("company_id = %(cid)s::uuid")
        params["cid"] = company_id

    where_sql = "WHERE " + " AND ".join(where_clauses)

    sql = f"""
        SELECT keyword,
               COUNT(*)           AS hit_count,
               MIN(scraped_at)    AS first_seen,
               MAX(scraped_at)    AS last_seen,
               COUNT(DISTINCT url) AS unique_urls
        FROM   public.raw_google_data
        {where_sql}
        GROUP  BY keyword
        ORDER  BY hit_count DESC
        LIMIT  10
    """
    df = query_df(sql, params or None)

    total_sql = f"""
        SELECT COUNT(*) AS total
        FROM   public.raw_google_data
        {where_sql}
    """
    df_total  = query_df(total_sql, params or None)
    total_cnt = int(df_total["total"].iloc[0]) if not df_total.empty else 0

    if df.empty:
        return {
            "trending":      [],
            "total_records": total_cnt,
            "days":          days,
            "note":          "Chưa có dữ liệu — hãy chạy Scrape Google trước",
        }

    return {
        "trending": [
            {
                "keyword":     row["keyword"],
                "hits":        int(row["hit_count"]),
                "unique_urls": int(row.get("unique_urls", 0)),
                "first_seen":  str(row.get("first_seen", "")),
                "last_seen":   str(row.get("last_seen", "")),
            }
            for _, row in df.iterrows()
        ],
        "total_records": total_cnt,
        "days":          days,
    }


@app.get("/", include_in_schema=False)
def root():
    return {"message": "Sales Analytics AI Service – truy cập /docs để xem API"}
