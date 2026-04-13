# -*- coding: utf-8 -*-
"""Router /anomaly – Phát hiện bất thường doanh thu."""
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.anomaly_service import detect_anomalies

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
