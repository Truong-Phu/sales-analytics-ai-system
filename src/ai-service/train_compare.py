# -*- coding: utf-8 -*-
"""
train_compare.py — So sánh Prophet với Holt-Winters, LightGBM và 2 baseline.

Chạy: python train_compare.py
Output: models/comparison_metrics.json

Câu chuyện so sánh (5 model):
  Naive         → baseline tối giản (ngày mai = hôm nay)
  MA-7          → baseline đơn giản (trung bình 7 ngày)
  Holt-Winters  → thống kê cổ điển (trend + weekly seasonality)
  LightGBM      → Machine Learning (lag/calendar features)
  Prophet       → time-series chuyên biệt (holiday, changepoint, uncertainty)

Tất cả train trên cùng tập train, đánh giá trên cùng tập test → so sánh công bằng.
"""

import json
import os
import warnings
from datetime import date
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from prophet import Prophet
from sklearn.metrics import mean_absolute_error, mean_squared_error
from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")
load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:021204@localhost:5432/sales_analytics_ai_db",
)
MODELS_DIR  = Path(__file__).parent / "models"
OUTPUT_PATH = MODELS_DIR / "comparison_metrics.json"

CAMPAIGN_DAYS: set[date] = set()
for y in [2024, 2025]:
    CAMPAIGN_DAYS.update([
        date(y, 11, 9), date(y, 11, 10), date(y, 11, 11), date(y, 11, 12),
        date(y, 12, 11), date(y, 12, 12), date(y, 12, 13),
        date(y, 11, 28), date(y, 11, 29),
    ])
CAMPAIGN_DAYS.update([
    date(2025, 1, 27), date(2025, 1, 28), date(2025, 1, 29),
    date(2026, 1, 15), date(2026, 1, 16), date(2026, 1, 17),
    date(2025, 3, 8), date(2025, 4, 30), date(2025, 5, 1),
    date(2024, 12, 25), date(2025, 12, 25),
])


# ── Helpers ───────────────────────────────────────────────────────────────────

def qdf(sql):
    with psycopg2.connect(DATABASE_URL) as conn:
        return pd.read_sql(sql, conn)


def smape(actual: np.ndarray, pred: np.ndarray) -> float:
    denom = (np.abs(actual) + np.abs(pred)) / 2 + 1e-8
    return float(np.mean(np.abs(actual - pred) / denom) * 100)


def calc_metrics(actual: np.ndarray, pred: np.ndarray) -> dict:
    mae_v  = float(mean_absolute_error(actual, pred))
    rmse_v = float(np.sqrt(mean_squared_error(actual, pred)))
    mask   = actual > 0
    mape_v = float(np.mean(np.abs((actual[mask] - pred[mask]) / actual[mask])) * 100) \
             if mask.sum() > 0 else None
    smp    = smape(actual, pred)
    return {
        "mae":       round(mae_v, 0),
        "rmse":      round(rmse_v, 0),
        "mape_pct":  round(mape_v, 2) if mape_v else None,
        "smape_pct": round(smp, 2),
    }


def print_row(name: str, m: dict):
    print(f"  {name:<16}  MAE={m['mae']:>12,.0f}  RMSE={m['rmse']:>12,.0f}"
          f"  MAPE={m['mape_pct']:>6.1f}%  SMAPE={m['smape_pct']:>5.1f}%")


# ── Load & chuẩn bị dữ liệu ──────────────────────────────────────────────────

def load_data() -> pd.DataFrame:
    try:
        df = qdf("""
            SELECT dd.full_date AS ds, SUM(fs.net_revenue) AS y
            FROM dw.fact_sales fs
            JOIN dw.dim_date dd ON fs.date_key = dd.date_key
            GROUP BY dd.full_date ORDER BY dd.full_date
        """)
        if len(df) >= 30:
            df["ds"] = pd.to_datetime(df["ds"])
            df["y"]  = df["y"].astype(float)
            print(f"  [DW] {len(df)} ngày")
            return df.dropna().sort_values("ds").reset_index(drop=True)
    except Exception as e:
        print(f"  [DW] lỗi: {e}")
    df = qdf("""
        SELECT DATE(o.order_date) AS ds, SUM(oi.subtotal) AS y
        FROM public.orders o JOIN public.order_items oi ON o.order_id = oi.order_id
        WHERE o.status NOT IN ('CANCELLED','RETURNED')
        GROUP BY DATE(o.order_date) ORDER BY ds
    """)
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"]  = df["y"].astype(float)
    print(f"  [OLTP] {len(df)} ngày")
    return df.dropna().sort_values("ds").reset_index(drop=True)


def fill_gaps(df: pd.DataFrame) -> pd.DataFrame:
    full = pd.date_range(df["ds"].min(), df["ds"].max(), freq="D")
    df   = df.set_index("ds").reindex(full, fill_value=0).reset_index()
    df.columns = ["ds", "y"]
    return df


# ── Baseline models ───────────────────────────────────────────────────────────

def run_naive(df_train: pd.DataFrame, df_test: pd.DataFrame) -> np.ndarray:
    """Naive: dự báo = giá trị ngày cuối cùng của train."""
    last_val = float(df_train["y"].iloc[-1])
    return np.full(len(df_test), last_val)


def run_ma7(df_train: pd.DataFrame, df_test: pd.DataFrame) -> np.ndarray:
    """MA-7: dự báo = trung bình 7 ngày cuối train."""
    ma7_val = float(df_train["y"].tail(7).mean())
    return np.full(len(df_test), ma7_val)


# ── Holt-Winters ──────────────────────────────────────────────────────────────

def run_holtwinters(df_train: pd.DataFrame, df_test: pd.DataFrame) -> np.ndarray:
    model = ExponentialSmoothing(
        df_train["y"],
        trend="add",
        seasonal="add",
        seasonal_periods=7,
        damped_trend=True,
        initialization_method="estimated",
    ).fit(optimized=True)
    return np.maximum(model.forecast(len(df_test)).values, 0)


# ── LightGBM ─────────────────────────────────────────────────────────────────

FEAT_COLS = ["dow", "month", "doy", "is_weekend", "is_campaign",
             "lag_1", "lag_7", "lag_14", "lag_30",
             "roll_7", "roll_14", "roll_30"]


def make_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    d["dow"]         = d["ds"].dt.dayofweek
    d["month"]       = d["ds"].dt.month
    d["doy"]         = d["ds"].dt.dayofyear
    d["is_weekend"]  = (d["dow"] >= 5).astype(int)
    d["is_campaign"] = d["ds"].dt.date.isin(CAMPAIGN_DAYS).astype(int)
    for lag in [1, 7, 14, 30]:
        d[f"lag_{lag}"] = d["y"].shift(lag).fillna(0)
    for w in [7, 14, 30]:
        d[f"roll_{w}"] = d["y"].shift(1).rolling(w, min_periods=1).mean().fillna(0)
    return d


def run_lightgbm(df_train: pd.DataFrame, df_test: pd.DataFrame) -> tuple[np.ndarray, dict]:
    df_full = pd.concat([df_train, df_test], ignore_index=True)
    df_feat = make_features(df_full)
    X_train = df_feat.iloc[:len(df_train)][FEAT_COLS].values
    y_train = df_train["y"].values
    X_test  = df_feat.iloc[len(df_train):][FEAT_COLS].values
    dtrain  = lgb.Dataset(X_train, label=y_train)
    params  = {
        "objective": "regression", "metric": "mae",
        "num_leaves": 31, "learning_rate": 0.05,
        "feature_fraction": 0.9, "bagging_fraction": 0.8,
        "bagging_freq": 5, "min_child_samples": 10, "verbose": -1,
    }
    model = lgb.train(
        params, dtrain, num_boost_round=300,
        valid_sets=[dtrain],
        callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(period=-1)],
    )
    pred = np.maximum(model.predict(X_test), 0)

    # Feature importance (gain)
    importance = dict(zip(
        FEAT_COLS,
        [round(float(v), 2) for v in model.feature_importance(importance_type="gain")]
    ))
    total = sum(importance.values()) or 1
    importance_pct = {k: round(v / total * 100, 1) for k, v in importance.items()}
    # Sắp xếp giảm dần
    importance_pct = dict(sorted(importance_pct.items(), key=lambda x: -x[1]))

    model.save_model(str(MODELS_DIR / "lgbm_revenue.txt"))
    return pred, importance_pct


# ── Prophet (train trên train set để so sánh công bằng) ──────────────────────

def run_prophet(df_train: pd.DataFrame, df_test: pd.DataFrame) -> np.ndarray:
    years    = list(range(df_train["ds"].min().year, df_test["ds"].max().year + 2))
    tet      = {2024: "2024-02-10", 2025: "2025-01-29", 2026: "2026-01-17"}
    rows = []
    for y in years:
        rows += [
            {"holiday": "Tet",        "ds": tet.get(y, f"{y}-01-25"), "lower_window": -5, "upper_window": 7},
            {"holiday": "Sale_1111",  "ds": f"{y}-11-11", "lower_window": -2, "upper_window": 1},
            {"holiday": "Sale_1212",  "ds": f"{y}-12-12", "lower_window": -1, "upper_window": 1},
            {"holiday": "BlackFriday","ds": f"{y}-11-29", "lower_window": -1, "upper_window": 1},
            {"holiday": "QH29",       "ds": f"{y}-04-30", "lower_window": 0,  "upper_window": 1},
        ]
    holidays = pd.DataFrame(rows)
    holidays["ds"] = pd.to_datetime(holidays["ds"])

    m = Prophet(
        changepoint_prior_scale=0.15,
        seasonality_mode="multiplicative",
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        seasonality_prior_scale=15,
        holidays=holidays,
        holidays_prior_scale=15.0,
        interval_width=0.90,
        uncertainty_samples=0,   # tắt uncertainty để train nhanh hơn
    )
    m.add_seasonality(name="monthly", period=30.5, fourier_order=5)
    m.fit(df_train[["ds", "y"]])

    future   = m.make_future_dataframe(periods=len(df_test))
    forecast = m.predict(future)
    pred     = forecast.tail(len(df_test))["yhat"].values
    return np.maximum(pred, 0)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 62)
    print("Model Comparison — MSAS")
    print("=" * 62)

    print("\n[1] Load dữ liệu...")
    df_raw = load_data()
    df     = fill_gaps(df_raw)
    print(f"  Sau fill gaps: {len(df)} ngày")

    n_train  = int(len(df) * 0.8)
    df_train = df.iloc[:n_train].copy()
    df_test  = df.iloc[n_train:].copy()
    print(f"  Train: {len(df_train)} ngày | Test: {len(df_test)} ngày")

    actual     = df_test["y"].values
    test_dates = df_test["ds"].dt.strftime("%Y-%m-%d").tolist()
    results: dict[str, dict] = {}
    preds:   dict[str, list] = {}

    # 2. Baseline — Naive
    print("\n[2] Baselines...")
    naive_p = run_naive(df_train, df_test)
    results["Naive"] = calc_metrics(actual, naive_p)
    preds["Naive"]   = [round(float(v), 0) for v in naive_p]
    print_row("Naive", results["Naive"])

    ma7_p = run_ma7(df_train, df_test)
    results["MA-7"] = calc_metrics(actual, ma7_p)
    preds["MA-7"]   = [round(float(v), 0) for v in ma7_p]
    print_row("MA-7", results["MA-7"])

    # 3. Holt-Winters
    print("\n[3] Holt-Winters...")
    hw_p = run_holtwinters(df_train, df_test)
    results["Holt-Winters"] = calc_metrics(actual, hw_p)
    preds["Holt-Winters"]   = [round(float(v), 0) for v in hw_p]
    print_row("Holt-Winters", results["Holt-Winters"])

    # 4. LightGBM
    print("\n[4] LightGBM...")
    lgb_p, feat_imp = run_lightgbm(df_train, df_test)
    results["LightGBM"] = calc_metrics(actual, lgb_p)
    preds["LightGBM"]   = [round(float(v), 0) for v in lgb_p]
    print_row("LightGBM", results["LightGBM"])
    print(f"  Feature importance: {list(feat_imp.items())[:3]}...")

    # 5. Prophet
    print("\n[5] Prophet (train trên train set)...")
    prop_p = run_prophet(df_train, df_test)
    results["Prophet"] = calc_metrics(actual, prop_p)
    preds["Prophet"]   = [round(float(v), 0) for v in prop_p]
    print_row("Prophet", results["Prophet"])

    # 6. Lưu
    output = {
        "generated_at": pd.Timestamp.now().isoformat(),
        "train_period": {
            "from": str(df_train["ds"].min().date()),
            "to":   str(df_train["ds"].max().date()),
            "days": len(df_train),
        },
        "test_period": {
            "from": str(df_test["ds"].min().date()),
            "to":   str(df_test["ds"].max().date()),
            "days": len(df_test),
        },
        "models":     results,
        "chart_data": {
            "dates":        test_dates,
            "actual":       [round(float(v), 0) for v in actual],
            "predictions":  {k: preds[k] for k in ["Holt-Winters", "LightGBM", "Prophet"]},
        },
        "lgbm_feature_importance": feat_imp,
        "selected_model":  "Prophet",
        "selection_reason": (
            "Prophet được chọn vì cung cấp khoảng tin cậy (confidence interval), "
            "xử lý ngày lễ Việt Nam và flash sale e-commerce, "
            "phù hợp với dữ liệu có trend + seasonality + holiday."
        ),
    }
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # 7. Tóm tắt
    print("\n" + "=" * 62)
    print(f"{'Model':<16} {'MAE (VNĐ)':>14} {'RMSE (VNĐ)':>14} {'MAPE':>8} {'SMAPE':>8}")
    print("-" * 62)
    order = ["Naive", "MA-7", "Holt-Winters", "LightGBM", "Prophet"]
    for name in order:
        m = results[name]
        marker = " ←" if name == min(results, key=lambda k: results[k]["smape_pct"]) else ""
        print(f"{name:<16} {m['mae']:>14,.0f} {m['rmse']:>14,.0f}"
              f" {m['mape_pct']:>7.1f}% {m['smape_pct']:>7.1f}%{marker}")
    print(f"\n  Đã lưu {OUTPUT_PATH}")
    print("  Restart FastAPI để endpoint /forecast/model-comparison phản ánh kết quả mới.")


if __name__ == "__main__":
    main()
