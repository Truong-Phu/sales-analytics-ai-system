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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import forecast, anomaly, trend, recommendation

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)

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


@app.get("/", include_in_schema=False)
def root():
    return {"message": "Sales Analytics AI Service – truy cập /docs để xem API"}
