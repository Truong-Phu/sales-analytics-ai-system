# -*- coding: utf-8 -*-
"""Router /forecast – Dự báo doanh thu bằng Prophet."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.prophet_service import forecast_revenue, get_model_info, get_metrics, get_actual_revenue

router = APIRouter(prefix="/forecast", tags=["Forecast"])


class ForecastPoint(BaseModel):
    date:     str
    forecast: float
    lower:    float
    upper:    float


class ActualPoint(BaseModel):
    date:   str
    actual: float


class ForecastResponse(BaseModel):
    horizon_days: int
    channel:      Optional[str]
    model_info:   dict
    data:         List[ForecastPoint]
    actual:       List[ActualPoint] = []   # 90 ngày lịch sử thực tế


@router.get(
    "",
    response_model=ForecastResponse,
    summary="Dự báo doanh thu",
    description=(
        "Dự báo doanh thu N ngày tiếp theo bằng mô hình Prophet đã train.\n\n"
        "- **horizon**: số ngày dự báo (1–90)\n"
        "- **channel**: lọc theo kênh (shopee, lazada, ...). Bỏ trống = tất cả kênh"
    ),
)
def get_forecast(
    horizon: int = Query(default=30, ge=1, le=90, description="Số ngày dự báo"),
    channel: Optional[str] = Query(default=None, description="Tên kênh bán hàng"),
):
    try:
        data       = forecast_revenue(horizon_days=horizon, channel=channel)
        model_info = get_model_info()
        history    = get_actual_revenue(days=90, channel=channel)
        return ForecastResponse(
            horizon_days=horizon,
            channel=channel,
            model_info=model_info,
            data=[ForecastPoint(**p) for p in data],
            actual=[ActualPoint(**p) for p in history],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi dự báo: {e}")


@router.get("/model-info", summary="Thông tin model Prophet")
def model_info():
    """Trả về metadata của model đang được sử dụng."""
    return get_model_info()


@router.get(
    "/metrics",
    summary="Đánh giá độ chính xác model",
    description=(
        "Trả về các chỉ số đánh giá độ chính xác của model Prophet.\n\n"
        "Phương pháp: hold-out 80% train / 20% test trên dữ liệu lịch sử.\n\n"
        "- **mae**: Mean Absolute Error (VND)\n"
        "- **rmse**: Root Mean Squared Error (VND)\n"
        "- **mape_pct**: Mean Absolute Percentage Error (%)\n"
        "- **train_from/to**: khoảng thời gian train\n"
        "- **test_from/to**: khoảng thời gian test\n"
        "- **n_train / n_test**: số ngày train / test"
    ),
)
def forecast_metrics():
    """Metrics đánh giá model (MAE, RMSE, MAPE) theo hold-out 80/20."""
    try:
        return get_metrics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi tính metrics: {e}")
