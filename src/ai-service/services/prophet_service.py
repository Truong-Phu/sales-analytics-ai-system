# -*- coding: utf-8 -*-
"""
Prophet Service – Load model đã train và thực hiện dự báo.

Model được train trên Google Colab (notebook 02_Prophet_Training.ipynb)
và lưu vào src/ai-service/models/prophet_revenue.pkl.
"""
import json
import logging
import os
from datetime import date
from typing import List, Optional

import joblib
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
