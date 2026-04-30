#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
retrain.py — Script huấn luyện lại Prophet standalone (không cần Jupyter).
Sử dụng: python notebooks/retrain.py

Quy trình:
  1. Tạo dữ liệu từ DB (hoặc dùng CSV đã có)
  2. Validate dữ liệu
  3. Train Prophet
  4. Evaluate (MAE, RMSE, MAPE)
  5. Lưu model + metrics
  6. Ghi log
"""
import json
import logging
import os
import sys
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
load_dotenv(Path(__file__).parent.parent / ".env")

# ── Setup logging ─────────────────────────────────────────────────────────────
LOGS_DIR  = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)
log_file  = LOGS_DIR / "retrain.log"

handlers = [
    logging.FileHandler(log_file, encoding="utf-8"),
    logging.StreamHandler(sys.stdout),
]
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=handlers,
)
log = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent.parent / "src" / "ai-service" / "models"
MODELS_DIR.mkdir(exist_ok=True)

# ── Helpers ───────────────────────────────────────────────────────────────────
def load_data() -> pd.DataFrame:
    """Đọc dữ liệu: ưu tiên từ DB, fallback CSV."""
    csv_path = DATA_DIR / "sales_timeseries.csv"
    if csv_path.exists():
        df = pd.read_csv(csv_path, parse_dates=["ds"])
        log.info("Đọc dữ liệu từ CSV: %s (%d dòng)", csv_path, len(df))
        return df

    log.info("Chưa có CSV — chạy generate_sample_data.py trước...")
    sys.exit(1)

def validate(df: pd.DataFrame) -> pd.DataFrame:
    assert "ds" in df.columns and "y" in df.columns, "Cần cột ds và y"
    df = df.dropna(subset=["ds", "y"]).drop_duplicates("ds").sort_values("ds").reset_index(drop=True)
    assert len(df) >= 30, f"Chỉ có {len(df)} dòng — cần tối thiểu 30!"
    log.info("Dữ liệu hợp lệ: %d điểm, từ %s đến %s", len(df), df["ds"].min(), df["ds"].max())
    return df

def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Thêm regressor: is_weekend, is_month_end."""
    df = df.copy()
    df["ds"] = pd.to_datetime(df["ds"])
    df["is_weekend"]   = df["ds"].dt.dayofweek.isin([5, 6]).astype(float)
    df["is_month_end"] = df["ds"].dt.is_month_end.astype(float)
    return df

def make_holidays() -> pd.DataFrame:
    """Ngày lễ Việt Nam + Tết (giả lập cho sample data 2025)."""
    vn_holidays = [
        # Tết Nguyên Đán 2025
        *[f"2025-01-{d:02d}" for d in range(25, 32)],
        *[f"2025-02-{d:02d}" for d in range(1, 3)],
        # Giỗ Tổ Hùng Vương
        "2025-04-07",
        # 30/4, 1/5
        "2025-04-30", "2025-05-01",
        # Quốc khánh 2/9
        "2025-09-01", "2025-09-02",
        # 10/10
        "2025-10-10",
        # Black Friday (ảnh hưởng TMĐT)
        "2025-11-28",
        # 12/12 (Double 12)
        "2025-12-12",
    ]
    rows = []
    for d in vn_holidays:
        rows.append({"holiday": "vn_holiday", "ds": pd.Timestamp(d), "lower_window": -1, "upper_window": 2})
    return pd.DataFrame(rows)

def compute_metrics(actual, predicted) -> dict:
    mae  = float(np.mean(np.abs(actual - predicted)))
    rmse = float(np.sqrt(np.mean((actual - predicted) ** 2)))
    # MAPE — tránh chia 0
    mask = actual != 0
    mape = float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)
    return {"mae": round(mae, 2), "rmse": round(rmse, 2), "mape": round(mape, 2)}

def run_retrain():
    log.info("=" * 60)
    log.info("BẮT ĐẦU RETRAIN PROPHET — %s", datetime.now().isoformat())
    log.info("=" * 60)

    # ── Import Prophet ────────────────────────────────────────────
    try:
        from prophet import Prophet
        from prophet.serialize import model_to_json
    except ImportError:
        log.error("Chưa cài prophet: pip install prophet")
        sys.exit(1)

    # ── Load & validate data ──────────────────────────────────────
    df = load_data()
    df = validate(df)
    df = add_features(df)

    # ── Train/Test split 80/20 ───────────────────────────────────
    split_idx = int(len(df) * 0.8)
    train = df.iloc[:split_idx].copy()
    test  = df.iloc[split_idx:].copy()
    log.info("Train: %d dòng, Test: %d dòng", len(train), len(test))

    # ── Khởi tạo model ───────────────────────────────────────────
    holidays = make_holidays()
    m = Prophet(
        seasonality_mode       = "multiplicative",
        yearly_seasonality     = True,
        weekly_seasonality     = True,
        daily_seasonality      = False,
        changepoint_prior_scale= 0.05,
        holidays               = holidays,
    )
    m.add_regressor("is_weekend")
    m.add_regressor("is_month_end")

    # ── Fit ───────────────────────────────────────────────────────
    log.info("Đang fit model...")
    m.fit(train[["ds", "y", "is_weekend", "is_month_end"]])
    log.info("Fit xong!")

    # ── Forecast test set ─────────────────────────────────────────
    future = test[["ds", "is_weekend", "is_month_end"]].copy()
    forecast = m.predict(future)
    predicted = forecast["yhat"].values
    actual    = test["y"].values

    metrics = compute_metrics(actual, predicted)
    log.info("MAE  = %,.0f VND", metrics["mae"])
    log.info("RMSE = %,.0f VND", metrics["rmse"])
    log.info("MAPE = %.1f%%",    metrics["mape"])

    # ── Forecast 30 ngày tiếp theo ────────────────────────────────
    future30 = m.make_future_dataframe(periods=30)
    future30["is_weekend"]   = future30["ds"].dt.dayofweek.isin([5, 6]).astype(float)
    future30["is_month_end"] = future30["ds"].dt.is_month_end.astype(float)
    full_forecast = m.predict(future30)

    # ── Lưu model (JSON) ─────────────────────────────────────────
    model_path = MODELS_DIR / "prophet_model.json"
    with open(model_path, "w", encoding="utf-8") as f:
        json.dump(model_to_json(m), f, ensure_ascii=False)
    log.info("Đã lưu model: %s", model_path)

    # ── Lưu metrics ──────────────────────────────────────────────
    metrics_data = {
        **metrics,
        "trained_at":       datetime.now().isoformat(),
        "data_points":      len(df),
        "train_points":     len(train),
        "test_points":      len(test),
        "forecast_horizon": 30,
        "model_type":       "Prophet (multiplicative)",
    }
    metrics_path = MODELS_DIR / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, ensure_ascii=False, indent=2)
    log.info("Đã lưu metrics: %s", metrics_path)

    log.info("RETRAIN HOÀN TẤT — MAPE=%.1f%%", metrics["mape"])
    return metrics_data

if __name__ == "__main__":
    result = run_retrain()
    print("\n=== KẾT QUẢ ===")
    for k, v in result.items():
        print(f"  {k}: {v}")
