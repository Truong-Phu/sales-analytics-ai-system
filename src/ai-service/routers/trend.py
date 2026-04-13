# -*- coding: utf-8 -*-
"""Router /trend – Phân tích xu hướng doanh thu."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.db_service import load_revenue_series
import pandas as pd
import numpy as np

router = APIRouter(prefix="/trend", tags=["Trend Analysis"])


class TrendResponse(BaseModel):
    period_days:    int
    channel:        Optional[str]
    growth_rate_pct: float           # Tăng trưởng so với kỳ trước (%)
    trend_direction: str             # "UP" | "DOWN" | "STABLE"
    avg_daily_revenue: float
    peak_date:      str
    peak_revenue:   float
    ma7_latest:     float            # Moving average 7 ngày gần nhất
    summary:        str


@router.get(
    "",
    response_model=TrendResponse,
    summary="Phân tích xu hướng doanh thu",
    description="Tính tỷ lệ tăng trưởng, moving average và xu hướng tổng thể.",
)
def get_trend(
    days: int = Query(default=30, ge=7, le=365, description="Số ngày phân tích"),
    channel: Optional[str] = Query(default=None, description="Tên kênh"),
):
    try:
        df = load_revenue_series(channel)
        if len(df) < 14:
            raise HTTPException(status_code=422, detail="Không đủ dữ liệu (cần ≥ 14 ngày).")

        df_period = df.tail(days).copy()
        half      = len(df_period) // 2

        # Tăng trưởng: so sánh nửa đầu vs nửa sau của kỳ phân tích
        avg_first  = df_period.iloc[:half]["y"].mean()
        avg_second = df_period.iloc[half:]["y"].mean()
        growth_pct = ((avg_second - avg_first) / avg_first * 100) if avg_first else 0.0

        # Trend direction
        if growth_pct > 5:
            direction = "UP"
            summary   = f"Doanh thu đang tăng trưởng tốt (+{growth_pct:.1f}% trong {days} ngày)"
        elif growth_pct < -5:
            direction = "DOWN"
            summary   = f"Doanh thu đang suy giảm ({growth_pct:.1f}% trong {days} ngày)"
        else:
            direction = "STABLE"
            summary   = f"Doanh thu ổn định ({growth_pct:+.1f}% trong {days} ngày)"

        # MA7 và peak
        df_period["ma7"] = df_period["y"].rolling(7).mean()
        peak_row = df_period.loc[df_period["y"].idxmax()]

        return TrendResponse(
            period_days=days,
            channel=channel,
            growth_rate_pct=round(growth_pct, 2),
            trend_direction=direction,
            avg_daily_revenue=round(df_period["y"].mean(), 0),
            peak_date=peak_row["ds"].strftime("%Y-%m-%d"),
            peak_revenue=round(peak_row["y"], 0),
            ma7_latest=round(df_period["ma7"].iloc[-1] or 0, 0),
            summary=summary,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi phân tích trend: {e}")
