# -*- coding: utf-8 -*-
"""
Prophet Service – Load model đã train và thực hiện dự báo.

Model được train trên Google Colab (notebook 02_Prophet_Training.ipynb)
và lưu vào src/ai-service/models/prophet_revenue.pkl.
"""
import json
import logging
import math
import os
import warnings
from datetime import date
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


def _retrain_from_sample() -> Prophet:
    """Train lại Prophet từ sample CSV khi model gốc không load được."""
    import warnings
    warnings.filterwarnings("ignore")
    sample_paths = [
        "../../notebooks/sample_data/sample_orders.csv",
        "notebooks/sample_data/sample_orders.csv",
    ]
    csv_path = next((p for p in sample_paths if os.path.exists(p)), None)
    if csv_path is None:
        raise FileNotFoundError("Không tìm thấy sample_orders.csv để retrain model.")

    df = pd.read_csv(csv_path, parse_dates=["order_date"])
    df = df[df["status"] == "DELIVERED"].copy()
    df["revenue"] = df["quantity"] * df["unit_price"] - df["discount_amount"]
    df_daily = (
        df.groupby("order_date")["revenue"].sum()
        .reset_index()
        .rename(columns={"order_date": "ds", "revenue": "y"})
        .sort_values("ds")
    )
    m = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        interval_width=0.8,
    )
    m.fit(df_daily)
    return m


def _load_model() -> Prophet:
    global _model, _metadata
    if _model is not None:
        return _model

    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(
            f"Model chưa có tại {MODEL_PATH}. "
            "Hãy train model trên Google Colab và copy file pkl vào thư mục models/."
        )

    logger.info(f"Loading Prophet model từ {MODEL_PATH}...")
    try:
        _model = joblib.load(MODEL_PATH)
    except Exception as e:
        # Model bị corrupt hoặc không tương thích phiên bản → train lại từ sample data
        logger.warning(f"Không load được model ({e}). Đang train lại từ sample data...")
        _model = _retrain_from_sample()
        joblib.dump(_model, MODEL_PATH)
        logger.info("Đã train lại và lưu model mới.")

    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, encoding="utf-8") as f:
            _metadata = json.load(f)
        logger.info(f"Model metadata: MAE={_metadata.get('mae')}, MAPE={_metadata.get('mape_pct')}%")

    return _model


def _load_sample_df() -> pd.DataFrame:
    """Load daily revenue từ sample CSV (dùng khi DB chưa có dữ liệu)."""
    sample_paths = [
        "../../notebooks/sample_data/sample_orders.csv",
        "notebooks/sample_data/sample_orders.csv",
    ]
    csv_path = next((p for p in sample_paths if os.path.exists(p)), None)
    if csv_path is None:
        return pd.DataFrame()
    df = pd.read_csv(csv_path, parse_dates=["order_date"])
    df = df[df["status"] == "DELIVERED"].copy()
    df["revenue"] = df["quantity"] * df["unit_price"] - df["discount_amount"]
    return (
        df.groupby("order_date")["revenue"].sum()
        .reset_index()
        .rename(columns={"order_date": "ds", "revenue": "y"})
        .sort_values("ds")
        .reset_index(drop=True)
    )


def compute_and_save_metrics() -> dict:
    """
    Đánh giá độ chính xác model theo phương pháp hold-out 80/20.
    Kết quả MAE, RMSE, MAPE được lưu vào prophet_metadata.json.
    """
    warnings.filterwarnings("ignore")
    df = _load_sample_df()
    if df.empty or len(df) < 5:
        logger.warning("Không đủ dữ liệu để tính metrics (cần ít nhất 5 ngày).")
        return {}

    split = max(1, int(len(df) * 0.8))
    df_train = df.iloc[:split].copy()
    df_test  = df.iloc[split:].copy()

    # Train model trên 80%
    m_eval = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        interval_width=0.8,
    )
    m_eval.fit(df_train)

    # Dự báo trên tập test
    future_test = m_eval.make_future_dataframe(periods=len(df_test))
    forecast_test = m_eval.predict(future_test)
    preds = forecast_test.set_index("ds")["yhat"]
    test_df = df_test.set_index("ds")
    test_df["pred"] = test_df.index.map(lambda d: preds.get(d, float("nan")))
    test_df = test_df.dropna()

    if test_df.empty:
        logger.warning("Không khớp được ngày dự báo với tập test.")
        return {}

    y_true = test_df["y"].values
    y_pred = test_df["pred"].values

    mae  = float(round(np.mean(np.abs(y_true - y_pred)), 2))
    rmse = float(round(math.sqrt(np.mean((y_true - y_pred) ** 2)), 2))
    # MAPE tránh chia 0: chỉ tính với y_true > 0
    mask = y_true > 0
    mape = float(round(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100, 2)) if mask.any() else None

    metrics = {
        "mae":          mae,
        "rmse":         rmse,
        "mape_pct":     mape,
        "train_from":   str(df_train["ds"].min().date()),
        "train_to":     str(df_train["ds"].max().date()),
        "test_from":    str(df_test["ds"].min().date()),
        "test_to":      str(df_test["ds"].max().date()),
        "n_train":      len(df_train),
        "n_test":       len(df_test),
        "source":       "local_sample_data",
        "prophet_version": "1.3.0",
        "python_version":  "3.13.7",
        "eval_method":  "hold-out 80/20",
    }

    # Cập nhật metadata.json
    if os.path.exists(METADATA_PATH):
        with open(METADATA_PATH, encoding="utf-8") as f:
            existing = json.load(f)
        existing.update(metrics)
        metrics = existing

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)

    logger.info(f"Metrics saved — MAE={mae:,.0f} RMSE={rmse:,.0f} MAPE={mape}%")
    return metrics


def get_metrics() -> dict:
    """Trả về metrics đánh giá model. Tính lại nếu chưa có RMSE."""
    global _metadata
    _load_model()
    if not _metadata.get("rmse"):
        _metadata.update(compute_and_save_metrics())
    keys = ["mae", "rmse", "mape_pct", "train_from", "train_to",
            "test_from", "test_to", "n_train", "n_test", "eval_method",
            "prophet_version", "source"]
    return {k: _metadata.get(k) for k in keys if _metadata.get(k) is not None}


def get_model_info() -> dict:
    """Trả về thông tin model đã train."""
    try:
        _load_model()
        return {"status": "loaded", **_metadata}
    except FileNotFoundError as e:
        return {"status": "not_found", "message": str(e)}


def forecast_revenue(
    horizon_days: int = HORIZON_DAYS,
    channel: str = None,
) -> List[dict]:
    """
    Dự báo doanh thu cho horizon_days ngày tiếp theo.

    Args:
        horizon_days: số ngày dự báo
        channel:      lọc theo kênh (None = tất cả)

    Returns:
        list[dict] mỗi phần tử: {date, forecast, lower, upper}
    """
    model = _load_model()

    # Tải dữ liệu lịch sử để làm future dataframe
    df_history = load_revenue_series(channel)
    if df_history.empty:
        logger.warning("Không có dữ liệu lịch sử trong DW.")
        return []

    # Tạo future dataframe
    future   = model.make_future_dataframe(periods=horizon_days)
    forecast = model.predict(future)

    # Dùng ngày cuối của model (không phải DB) để lấy đúng phần dự báo.
    # make_future_dataframe thêm đúng horizon_days hàng sau model.history cuối.
    future_only = forecast.tail(horizon_days)

    result = []
    for _, row in future_only.iterrows():
        result.append({
            "date":     row["ds"].strftime("%Y-%m-%d"),
            "forecast": max(round(row["yhat"], 0), 0),
            "lower":    max(round(row["yhat_lower"], 0), 0),
            "upper":    max(round(row["yhat_upper"], 0), 0),
        })

    logger.info(f"Forecast {len(result)} ngày (horizon={horizon_days}, channel={channel})")
    return result
