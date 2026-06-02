#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
train_prophet.py — Retrain Prophet với toàn bộ dữ liệu mới từ DB.

Chạy: python train_prophet.py
Output:
  models/prophet_revenue.pkl
  models/prophet_revenue_metadata.json
  models/prophet_shopee.pkl
  models/prophet_tiktok.pkl
  models/prophet_lazada.pkl
"""
import json
import logging
import os
import re
import warnings
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from prophet import Prophet
from prophet.diagnostics import cross_validation, performance_metrics
from sklearn.metrics import mean_absolute_error, mean_squared_error

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.WARNING)  # bỏ noise của cmdstanpy

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
MODELS_DIR   = Path(__file__).parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

FORECAST_HORIZON = 30


# ── Kết nối DB ────────────────────────────────────────────────────────────────

def qdf(sql, params=None):
    with psycopg2.connect(DATABASE_URL) as conn:
        return pd.read_sql(sql, conn, params=params)


# ── Load dữ liệu (DW ưu tiên, fallback OLTP) ─────────────────────────────────

def load_all_revenue():
    """Load chuỗi doanh thu ngày từ DW → OLTP fallback."""
    # Thử DW trước
    try:
        df = qdf("""
            SELECT dd.full_date AS ds, SUM(fs.net_revenue) AS y
            FROM dw.fact_sales fs
            JOIN dw.dim_date dd ON fs.date_key = dd.date_key
            GROUP BY dd.full_date
            ORDER BY dd.full_date
        """)
        if not df.empty and len(df) >= 30:
            df["ds"] = pd.to_datetime(df["ds"])
            print(f"  [DW]   {len(df)} ngày ({df['ds'].min().date()} → {df['ds'].max().date()})")
            df["ds"] = pd.to_datetime(df["ds"])
            df["y"]  = df["y"].astype(float)
            return df.dropna().sort_values("ds").reset_index(drop=True)
    except Exception as e:
        print(f"  [DW] Lỗi: {e}")

    # Fallback OLTP
    print("  [DW] Trống — fallback sang OLTP...")
    df = qdf("""
        SELECT DATE(o.order_date) AS ds, SUM(oi.subtotal) AS y
        FROM public.orders o
        JOIN public.order_items oi ON o.order_id = oi.order_id
        WHERE o.status NOT IN ('CANCELLED','RETURNED')
        GROUP BY DATE(o.order_date)
        ORDER BY ds
    """)
    df["ds"] = pd.to_datetime(df["ds"])
    print(f"  [OLTP] {len(df)} ngày ({df['ds'].min().date()} → {df['ds'].max().date()})")
    df["y"]  = df["y"].astype(float)
    return df.dropna().sort_values("ds").reset_index(drop=True)


def load_channel_revenue(channel_name):
    """Load doanh thu theo kênh (từ DW dim_channel)."""
    try:
        df = qdf("""
            SELECT dd.full_date AS ds, SUM(fs.net_revenue) AS y
            FROM dw.fact_sales fs
            JOIN dw.dim_date    dd ON fs.date_key    = dd.date_key
            JOIN dw.dim_channel dc ON fs.channel_key = dc.channel_key
            WHERE dc.channel_name ILIKE %(ch)s
            GROUP BY dd.full_date
            ORDER BY dd.full_date
        """, {"ch": f"%{channel_name}%"})
    except Exception:
        df = qdf("""
            SELECT DATE(o.order_date) AS ds, SUM(oi.subtotal) AS y
            FROM public.orders o
            JOIN public.order_items oi ON o.order_id = oi.order_id
            JOIN public.sales_channels c ON o.channel_id = c.channel_id
            WHERE o.status NOT IN ('CANCELLED','RETURNED')
              AND c.channel_name ILIKE %(ch)s
            GROUP BY DATE(o.order_date)
            ORDER BY ds
        """, {"ch": f"%{channel_name}%"})
    if df.empty:
        return df
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"]  = df["y"].astype(float)
    return df.dropna().sort_values("ds").reset_index(drop=True)


# ── Ngày lễ VN ────────────────────────────────────────────────────────────────

def make_vn_holidays(years):
    rows = []
    tet_dates = {2023: "2023-01-22", 2024: "2024-02-10", 2025: "2025-01-29", 2026: "2026-01-17"}
    for y in years:
        rows += [
            {"holiday": "Tết Nguyên Đán",    "ds": tet_dates.get(y, f"{y}-01-25"),  "lower_window": -5, "upper_window": 7},
            {"holiday": "Giỗ Tổ Hùng Vương", "ds": f"{y}-04-18",  "lower_window": 0,  "upper_window": 1},
            {"holiday": "Ngày 30/4-1/5",      "ds": f"{y}-04-30",  "lower_window": 0,  "upper_window": 2},
            {"holiday": "Quốc khánh 2/9",     "ds": f"{y}-09-02",  "lower_window": 0,  "upper_window": 1},
            {"holiday": "8/3 Phụ nữ",         "ds": f"{y}-03-08",  "lower_window": -1, "upper_window": 1},
            {"holiday": "Sale 11.11",          "ds": f"{y}-11-11",  "lower_window": -2, "upper_window": 1},
            {"holiday": "Black Friday",        "ds": f"{y}-11-29",  "lower_window": -1, "upper_window": 1},
            {"holiday": "Sale 12.12",          "ds": f"{y}-12-12",  "lower_window": -1, "upper_window": 1},
        ]
    df = pd.DataFrame(rows)
    df["ds"] = pd.to_datetime(df["ds"])
    return df


# ── Chuẩn bị dữ liệu ──────────────────────────────────────────────────────────

def prepare_df(df_raw):
    """Fill gap ngày, smooth outliers cực đoan."""
    date_range = pd.date_range(df_raw["ds"].min(), df_raw["ds"].max(), freq="D")
    df = df_raw.set_index("ds").reindex(date_range, fill_value=0).reset_index()
    df.columns = ["ds", "y"]

    # Cap outlier tại 99th percentile × 3 (giữ spike nhưng tránh outlier hỏng model)
    p99 = df["y"].quantile(0.99)
    cap = p99 * 3
    n_capped = (df["y"] > cap).sum()
    if n_capped > 0:
        df["y"] = df["y"].clip(upper=cap)
        print(f"    Cap {n_capped} outlier tại {cap:,.0f} VNĐ")

    n_zero = (df["y"] == 0).sum()
    print(f"    {len(df)} ngày tổng ({n_zero} ngày trống/zero được fill)")
    return df


# ── Train một model ───────────────────────────────────────────────────────────

def train_model(df, holidays, label="ALL"):
    """Train và đánh giá Prophet. Trả về (model, metrics_dict)."""
    split_idx = int(len(df) * 0.8)
    df_train  = df.iloc[:split_idx].copy()
    df_test   = df.iloc[split_idx:].copy()

    print(f"    Train: {len(df_train)} ngày ({df_train['ds'].min().date()} → {df_train['ds'].max().date()})")
    print(f"    Test : {len(df_test)} ngày  ({df_test['ds'].min().date()} → {df_test['ds'].max().date()})")

    model = Prophet(
        changepoint_prior_scale =0.15,
        changepoint_range       =0.85,
        yearly_seasonality      =True,
        weekly_seasonality      =True,
        daily_seasonality       =False,
        seasonality_mode        ="multiplicative",
        seasonality_prior_scale =15,
        holidays                =holidays,
        holidays_prior_scale    =15.0,
        interval_width          =0.90,
        uncertainty_samples     =300,
    )
    model.add_seasonality(name="monthly", period=30.5, fourier_order=5)
    model.fit(df_train)

    # Đánh giá trên test set
    future   = model.make_future_dataframe(periods=len(df_test) + FORECAST_HORIZON)
    forecast = model.predict(future)
    fc_test  = forecast[forecast["ds"].isin(df_test["ds"])][["ds", "yhat"]].copy()
    df_eval  = df_test.merge(fc_test, on="ds")

    mae  = mean_absolute_error(df_eval["y"], df_eval["yhat"])
    rmse = float(np.sqrt(mean_squared_error(df_eval["y"], df_eval["yhat"])))
    mask = df_eval["y"] > 0
    mape = float(np.mean(np.abs((df_eval.loc[mask, "y"] - df_eval.loc[mask, "yhat"]) / df_eval.loc[mask, "y"])) * 100) if mask.sum() > 0 else None
    # SMAPE: cân bằng hơn MAPE khi actual gần 0 (phổ biến trong e-commerce)
    smape = float(np.mean(
        2 * np.abs(df_eval["y"] - df_eval["yhat"])
        / (np.abs(df_eval["y"]) + np.abs(df_eval["yhat"]) + 1e-8)
    ) * 100)

    metrics = {
        "mae":        round(float(mae), 0),
        "rmse":       round(float(rmse), 0),
        "mape_pct":   round(mape, 2) if mape else None,
        "smape_pct":  round(smape, 2),
        "train_rows": int(len(df_train)),
        "test_rows":  int(len(df_test)),
        "train_from": str(df_train["ds"].min().date()),
        "train_to":   str(df_train["ds"].max().date()),
    }
    print(f"    MAE={mae:,.0f}  RMSE={rmse:,.0f}  MAPE={mape:.1f}%  SMAPE={smape:.1f}%")

    # Cross-validation (chỉ khi đủ data)
    cv_mape = None
    if len(df) >= 365:
        try:
            init_days = max(180, int(len(df) * 0.55))
            print(f"    ⏳ Cross-validation (initial={init_days}d, period=30d, horizon=30d)...")
            df_cv   = cross_validation(model, initial=f"{init_days} days",
                                       period="30 days", horizon="30 days", parallel="processes")
            df_perf = performance_metrics(df_cv)
            col     = "mape" if "mape" in df_perf.columns else "smape"
            cv_mape = float(df_perf[col].mean() * 100)
            print(f"    CV MAPE = {cv_mape:.2f}%")
            metrics["cv_mape_pct"] = round(cv_mape, 2)
        except Exception as e:
            print(f"    ⚠ CV bỏ qua: {e}")
    else:
        print(f"    ⚠ {len(df)} ngày — bỏ qua cross-validation (cần ≥ 365)")

    return model, metrics


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Prophet Retraining — MSAS")
    print("=" * 60)

    # 1. Load toàn bộ data
    print("\n[1] Load dữ liệu...")
    df_raw = load_all_revenue()
    if len(df_raw) < 30:
        print(f"❌ Chỉ có {len(df_raw)} ngày — quá ít để train. Kiểm tra DB.")
        return

    years    = list(range(df_raw["ds"].min().year, df_raw["ds"].max().year + 2))
    holidays = make_vn_holidays(years)
    print(f"  Tổng: {len(df_raw)} ngày raw | {len(holidays)} ngày lễ cho {len(years)} năm")

    # 2. Chuẩn bị và train model tổng
    print("\n[2] Train model TỔNG (tất cả kênh)...")
    df = prepare_df(df_raw)
    model_all, metrics_all = train_model(df, holidays, label="ALL")

    # 2b. Retrain FINAL trên 100% data (để forecast từ hôm nay, không phải từ split point)
    print("    ⏳ Final retrain trên 100% data...")
    model_final = Prophet(
        changepoint_prior_scale =0.15,
        changepoint_range       =0.85,
        yearly_seasonality      =True,
        weekly_seasonality      =True,
        daily_seasonality       =False,
        seasonality_mode        ="multiplicative",
        seasonality_prior_scale =15,
        holidays                =holidays,
        holidays_prior_scale    =15.0,
        interval_width          =0.90,
        uncertainty_samples     =300,
    )
    model_final.add_seasonality(name="monthly", period=30.5, fourier_order=5)
    model_final.fit(df)
    print(f"    ✅ Final model train trên {len(df)} ngày ({df['ds'].min().date()} → {df['ds'].max().date()})")

    # 3. Lưu model tổng (dùng final model 100% data)
    model_path = MODELS_DIR / "prophet_revenue.pkl"
    meta_path  = MODELS_DIR / "prophet_revenue_metadata.json"
    joblib.dump(model_final, model_path)

    metadata = {
        "model_type":       "Prophet",
        "trained_at":       pd.Timestamp.now().isoformat(),
        "data_source":      "DW (dw.fact_sales) → OLTP fallback",
        "company_id":       "all",
        "seasonality_mode": "multiplicative",
        "vn_holidays":      True,
        "horizon_days":     FORECAST_HORIZON,
        "train_to_full":    str(df["ds"].max().date()),  # final model cover đến ngày này
        **metrics_all,
    }
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"  ✅ Đã lưu {model_path.name}")
    print(f"  ✅ Đã lưu {meta_path.name}")

    # 4. Train model từng kênh
    channel_slugs = {"shopee": "Shopee", "tiktok": "TikTok", "lazada": "Lazada"}
    channel_results = {}

    print("\n[3] Train model theo từng kênh...")
    for slug, keyword in channel_slugs.items():
        print(f"\n  [{keyword}]")
        df_ch = load_channel_revenue(keyword)
        if df_ch.empty or len(df_ch) < 30:
            print(f"    ⚠ {len(df_ch)} ngày — bỏ qua")
            continue

        df_ch_prep  = prepare_df(df_ch)
        _, m = train_model(df_ch_prep, holidays, label=keyword)

        # Final retrain trên 100% data channel
        print(f"    ⏳ Final retrain {keyword} trên 100% data...")
        model_ch_final = Prophet(
            changepoint_prior_scale =0.15,
            yearly_seasonality=True, weekly_seasonality=True, daily_seasonality=False,
            seasonality_mode="multiplicative", changepoint_range=0.85,
            seasonality_prior_scale=15, holidays=holidays, holidays_prior_scale=15.0,
            interval_width=0.90, uncertainty_samples=300,
        )
        model_ch_final.add_seasonality(name="monthly", period=30.5, fourier_order=5)
        model_ch_final.fit(df_ch_prep)

        out_path = MODELS_DIR / f"prophet_{slug}.pkl"
        joblib.dump(model_ch_final, out_path)
        print(f"    ✅ Đã lưu {out_path.name}")
        channel_results[keyword] = {**m, "file": out_path.name}

    # 5. Cập nhật metadata với kết quả channel
    metadata["channel_models"] = channel_results
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    # 6. Tóm tắt
    print("\n" + "=" * 60)
    print("KẾT QUẢ TRAIN")
    print("=" * 60)
    print(f"  Data      : {metrics_all['train_from']} → {df['ds'].max().date()}")
    print(f"  Train rows: {metrics_all['train_rows']} ngày")
    print(f"  MAE       : {metrics_all['mae']:>15,.0f} VNĐ")
    print(f"  RMSE      : {metrics_all['rmse']:>15,.0f} VNĐ")
    if metrics_all.get("mape_pct"):
        print(f"  MAPE      : {metrics_all['mape_pct']:>14.2f}%")
    if metrics_all.get("smape_pct"):
        print(f"  SMAPE     : {metrics_all['smape_pct']:>14.2f}%")
    if metrics_all.get("cv_mape_pct"):
        print(f"  CV MAPE   : {metrics_all['cv_mape_pct']:>14.2f}%")
    print(f"\n  Models: {', '.join(str(p.name) for p in MODELS_DIR.glob('*.pkl'))}")
    print("\n✅ Xong! Restart FastAPI để load model mới.")
    print("   uvicorn main:app --port 8001 --reload")


if __name__ == "__main__":
    main()
