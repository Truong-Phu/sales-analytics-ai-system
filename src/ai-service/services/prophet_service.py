# -*- coding: utf-8 -*-
"""
Prophet Service – Load model đã train và thực hiện dự báo.

Model được train bằng notebook 02_Prophet_Training.ipynb và lưu vào
src/ai-service/models/prophet_revenue.pkl.

Nếu model chưa có → trả lỗi rõ ràng (không dùng CSV sample làm fallback).
"""
import json
import logging
import math
import os
import warnings
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
from prophet import Prophet

from services.db_service import load_revenue_series

logger = logging.getLogger("ai.prophet")

MODEL_PATH    = os.getenv("PROPHET_MODEL_PATH", "models/prophet_revenue.pkl")
METADATA_PATH = MODEL_PATH.replace(".pkl", "_metadata.json")
HORIZON_DAYS  = int(os.getenv("FORECAST_HORIZON_DAYS", "30"))

# Cache model trong memory (tránh load lại mỗi request)
_model: Optional[Prophet] = None
_metadata: dict = {}


def _load_model() -> Prophet:
    global _model, _metadata
    if _model is not None:
        return _model

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model chưa có tại '{MODEL_PATH}'. "
            "Hãy chạy notebook 02_Prophet_Training.ipynb để train "
            "và copy file .pkl vào thư mục models/."
        )

    logger.info("Loading Prophet model từ %s...", MODEL_PATH)
    _model = joblib.load(MODEL_PATH)

    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, encoding="utf-8") as f:
            _metadata = json.load(f)
        logger.info(
            "Model metadata: MAE=%.0f  MAPE=%.2f%%",
            _metadata.get("mae", 0),
            _metadata.get("mape_pct", 0),
        )

    return _model


def get_model_info() -> dict:
    """Trả về thông tin model đã train (status + metadata)."""
    try:
        _load_model()
        return {
            "status":      "loaded",
            "model_path":  MODEL_PATH,
            "data_source": _metadata.get("data_source", "unknown"),
            **_metadata,
        }
    except FileNotFoundError as e:
        return {
            "status":  "not_found",
            "message": str(e),
            "hint":    "Chạy notebooks/02_Prophet_Training.ipynb để train model",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_metrics() -> dict:
    """Trả về metrics đánh giá model từ metadata JSON."""
    try:
        _load_model()
    except FileNotFoundError:
        return {}
    keys = ["mae", "rmse", "mape_pct", "smape_pct", "cv_mape_pct",
            "train_from", "train_to", "train_rows",
            "data_source", "seasonality_mode"]
    return {k: _metadata[k] for k in keys if k in _metadata}


def forecast_revenue(
    horizon_days: int = HORIZON_DAYS,
    channel: str = None,
    company_id: str = None,
) -> List[dict]:
    """
    Dự báo doanh thu cho horizon_days ngày tiếp theo.

    Args:
        horizon_days: số ngày dự báo (mặc định 30)
        channel:      lọc theo kênh (None = tất cả)
        company_id:   lọc theo công ty (multi-tenant)

    Returns:
        list[dict]: [{date, forecast, lower, upper}]
    """
    warnings.filterwarnings("ignore")
    model = _load_model()

    # Tải dữ liệu lịch sử để làm anchor cho future dataframe
    df_history = load_revenue_series(channel=channel, company_id=company_id)
    if df_history.empty:
        logger.warning("Không có dữ liệu lịch sử — không thể dự báo")
        return []

    if len(df_history) < 7:
        logger.warning("Chỉ có %d ngày lịch sử — dự báo có thể không chính xác", len(df_history))

    # Dự báo
    future = model.make_future_dataframe(periods=horizon_days)
    forecast = model.predict(future)

    # Chỉ lấy phần forecast (horizon_days ngày cuối)
    future_only = forecast.tail(horizon_days)

    result = []
    for _, row in future_only.iterrows():
        result.append({
            "date":     row["ds"].strftime("%Y-%m-%d"),
            "forecast": max(round(float(row["yhat"]), 0), 0),
            "lower":    max(round(float(row["yhat_lower"]), 0), 0),
            "upper":    max(round(float(row["yhat_upper"]), 0), 0),
        })

    logger.info("Forecast %d ngày (horizon=%d, channel=%s)", len(result), horizon_days, channel)
    return result


def get_actual_revenue(
    days: int = 90,
    channel: str = None,
    company_id: str = None,
) -> List[dict]:
    """Trả về doanh thu thực tế (days ngày gần nhất) từ DB."""
    df = load_revenue_series(channel=channel, company_id=company_id)
    if df.empty:
        return []

    df_recent = df.tail(days)
    return [
        {
            "date":   row["ds"].strftime("%Y-%m-%d"),
            "actual": round(float(row["y"]), 0),
        }
        for _, row in df_recent.iterrows()
    ]
