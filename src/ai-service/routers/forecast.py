# -*- coding: utf-8 -*-
"""Router /forecast – Dự báo doanh thu bằng Prophet."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.prophet_service import forecast_revenue, get_model_info

router = APIRouter(prefix="/forecast", tags=["Forecast"])


class ForecastPoint(BaseModel):
    date:     str
    forecast: float
    lower:    float
    upper:    float


class ForecastResponse(BaseModel):
    horizon_days: int
    channel:      Optional[str]
    model_info:   dict
    data:         List[ForecastPoint]


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
        return ForecastResponse(
            horizon_days=horizon,
            channel=channel,
            model_info=model_info,
            data=[ForecastPoint(**p) for p in data],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi dự báo: {e}")


@router.get("/model-info", summary="Thông tin model Prophet")
def model_info():
    """Trả về metadata của model đang được sử dụng."""
    return get_model_info()
