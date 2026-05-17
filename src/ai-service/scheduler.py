# -*- coding: utf-8 -*-
"""APScheduler – Lên lịch auto-retrain và cập nhật cache.

Jobs được đăng ký:
  - retrain_prophet    : CN 02:00 (Asia/Ho_Chi_Minh) — train lại Prophet nếu MAPE cải thiện
  - update_anomaly     : hàng ngày 01:00 — tính lại Z-score cache
  - update_rfm         : T2 03:00 — cập nhật RFM segments cache
"""

import json
import logging
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from prophet import Prophet

from services.anomaly_service import compute_and_cache_anomaly
from services.db_service import load_revenue_series

logger = logging.getLogger("ai.scheduler")

# Đường dẫn model và metadata (đồng nhất với prophet_service.py)
MODEL_PATH    = os.getenv("PROPHET_MODEL_PATH", "models/prophet_revenue.pkl")
METADATA_PATH = MODEL_PATH.replace(".pkl", "_metadata.json")


# ── Trạng thái retrain job hiện tại (dùng cho GET /retrain/status) ────────────
_retrain_status: dict = {
    "status":       "idle",   # "idle" | "running" | "success" | "error"
    "last_retrain": None,
    "current_mape": None,
    "data_points":  None,
    "message":      "",
    "started_at":   None,
}


# ── Hàm lấy dữ liệu ───────────────────────────────────────────────────────────

def load_data_from_db() -> pd.DataFrame:
    """Lấy chuỗi doanh thu mới nhất từ DB (DW → fallback OLTP)."""
    return load_revenue_series()


# ── Huấn luyện Prophet ────────────────────────────────────────────────────────

def train_prophet(df: pd.DataFrame) -> Prophet:
    """Train Prophet model mới từ DataFrame với cột ds, y.

    Cấu hình:
      - multiplicative seasonality (phù hợp doanh thu tăng trưởng)
      - yearly + weekly seasonality bật
      - Thêm Vietnamese public holidays
    """
    m = Prophet(
        seasonality_mode="multiplicative",
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        changepoint_prior_scale=0.1,
        seasonality_prior_scale=10,
        interval_width=0.90,
    )
    # Thêm ngày lễ Việt Nam (Tết, Quốc khánh, Ngày thành lập...)
    m.add_country_holidays(country_name="VN")

    # Thêm regressor cuối tuần nếu model cũ có (giữ nhất quán)
    df = df[["ds", "y"]].copy()
    m.fit(df)
    logger.info("Đã train Prophet với %d điểm dữ liệu", len(df))
    return m


# ── Đánh giá model ────────────────────────────────────────────────────────────

def evaluate_prophet(model: Prophet, df: pd.DataFrame) -> float:
    """Tính MAPE trên tập test (20% cuối). Trả về MAPE (%)."""
    n_test = max(7, int(len(df) * 0.2))
    test_df = df.iloc[-n_test:].copy()

    # Dự báo toàn bộ rồi lấy phần test
    future   = model.make_future_dataframe(periods=n_test)
    forecast = model.predict(future)
    pred     = forecast.tail(n_test)["yhat"].values
    actual   = test_df["y"].values

    # Tránh chia cho 0 (những ngày không có doanh thu)
    mask = actual > 0
    if not mask.any():
        logger.warning("Tất cả giá trị actual = 0 trong tập test — MAPE trả về 999")
        return 999.0

    mape = np.mean(np.abs((actual[mask] - pred[mask]) / actual[mask])) * 100
    return float(round(mape, 2))


# ── Lưu / đọc model & metadata ───────────────────────────────────────────────

def save_model(model: Prophet) -> None:
    """Lưu model Prophet vào file pkl."""
    os.makedirs(os.path.dirname(MODEL_PATH) or ".", exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    logger.info("Đã lưu model mới vào %s", MODEL_PATH)


def load_metadata() -> dict:
    """Đọc metadata JSON (trả về {} nếu chưa có)."""
    if not os.path.exists(METADATA_PATH):
        return {}
    with open(METADATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def update_metadata(data: dict) -> None:
    """Merge và ghi metadata JSON."""
    existing = load_metadata()
    existing.update(data)
    os.makedirs(os.path.dirname(METADATA_PATH) or ".", exist_ok=True)
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    logger.info("Đã cập nhật metadata: %s", METADATA_PATH)


# ── Cập nhật RFM cache ───────────────────────────────────────────────────────

def update_rfm_segments() -> None:
    """Tính lại RFM segments và lưu cache (gọi từ scheduler T2 03:00)."""
    try:
        # Gọi hàm nội bộ trong router recommendation
        from routers.recommendation import _compute_rfm_cache
        _compute_rfm_cache()
        logger.info("RFM segments đã được cập nhật thành công")
    except ImportError:
        logger.warning("Không tìm thấy _compute_rfm_cache trong routers.recommendation — bỏ qua")
    except Exception as e:
        logger.warning("update_rfm_segments gặp lỗi (bỏ qua, không ảnh hưởng service): %s", e)


# ── Job chính: retrain Prophet ────────────────────────────────────────────────

def retrain_prophet() -> None:
    """Job retrain Prophet: train model mới, chỉ deploy nếu MAPE không tệ hơn 10%.

    Quy tắc deploy:
      new_mape < old_mape * 1.1  → lưu model mới (cho phép tệ hơn tối đa 10%)
      Ngược lại                  → giữ model cũ, log cảnh báo
    """
    global _retrain_status

    # Ngăn chạy song song
    if _retrain_status.get("status") == "running":
        logger.warning("retrain_prophet đang chạy — bỏ qua lần gọi này")
        return

    _retrain_status.update({
        "status":     "running",
        "started_at": datetime.now().isoformat(),
        "message":    "Đang tải dữ liệu từ DB...",
    })
    logger.info("=== Bắt đầu auto-retrain Prophet ===")

    try:
        # Bước 1: Lấy dữ liệu
        df = load_data_from_db()
        n  = len(df)
        logger.info("Loaded %d ngày doanh thu từ DB", n)

        if n < 30:
            msg = f"Không đủ dữ liệu để retrain ({n} ngày, cần >= 30)"
            logger.warning(msg)
            _retrain_status.update({"status": "idle", "message": msg})
            return

        # Bước 2: Train model mới
        _retrain_status["message"] = f"Đang train Prophet với {n} ngày dữ liệu..."
        new_model = train_prophet(df)

        # Bước 3: Đánh giá
        _retrain_status["message"] = "Đang đánh giá model (MAPE)..."
        new_mape = evaluate_prophet(new_model, df)
        old_mape = load_metadata().get("mape_pct", 999.0)
        logger.info("MAPE mới: %.2f%% | MAPE cũ: %.2f%%", new_mape, old_mape)

        # Bước 4: Quyết định deploy
        if new_mape < old_mape * 1.1:
            # Deploy model mới
            save_model(new_model)
            update_metadata({
                "mape_pct":     new_mape,
                "retrained_at": datetime.now().isoformat(),
                "data_points":  n,
                "train_from":   str(df["ds"].min().date()),
                "train_to":     str(df["ds"].max().date()),
                "train_rows":   n,
                "data_source":  "auto_retrain",
            })

            # Xóa cache model trong memory của prophet_service để load lại lần sau
            try:
                import services.prophet_service as ps
                ps._model    = None
                ps._metadata = {}
                logger.info("Đã xóa cache model trong memory — sẽ load lại lần request tiếp")
            except Exception as cache_err:
                logger.warning("Không thể xóa cache prophet_service: %s", cache_err)

            msg = f"Retrain thành công. MAPE mới: {new_mape:.1f}% (cũ: {old_mape:.1f}%)"
            logger.info(msg)
            _retrain_status.update({
                "status":       "success",
                "last_retrain": datetime.now().isoformat(),
                "current_mape": new_mape,
                "data_points":  n,
                "message":      msg,
            })
        else:
            # Giữ model cũ
            msg = (
                f"Model mới MAPE={new_mape:.1f}% tệ hơn model cũ {old_mape:.1f}% "
                f"(vượt ngưỡng 10%). Giữ nguyên model cũ."
            )
            logger.warning(msg)
            _retrain_status.update({
                "status":       "idle",
                "current_mape": old_mape,
                "message":      msg,
            })

    except Exception as e:
        logger.error("retrain_prophet lỗi: %s", e, exc_info=True)
        _retrain_status.update({
            "status":  "error",
            "message": f"Lỗi khi retrain: {e}",
        })


# ── Trạng thái retrain (cho endpoint GET /retrain/status) ────────────────────

def get_retrain_status() -> dict:
    """Trả về trạng thái job retrain hiện tại kết hợp với metadata file."""
    meta = load_metadata()
    return {
        **_retrain_status,
        # Nếu status chưa có, fallback sang metadata file
        "current_mape": _retrain_status["current_mape"] or meta.get("mape_pct"),
        "data_points":  _retrain_status["data_points"]  or meta.get("data_points"),
        "last_retrain": _retrain_status["last_retrain"] or meta.get("retrained_at"),
        # Thêm thông tin từ metadata để frontend hiển thị đầy đủ
        "train_from":   meta.get("train_from"),
        "train_to":     meta.get("train_to"),
        "data_source":  meta.get("data_source"),
    }


# ── APScheduler setup ─────────────────────────────────────────────────────────
# Khởi tạo scheduler với timezone Việt Nam
scheduler = BackgroundScheduler(timezone="Asia/Ho_Chi_Minh")

# CN 02:00 — retrain Prophet (cuối tuần để không ảnh hưởng traffic)
scheduler.add_job(
    retrain_prophet,
    CronTrigger(day_of_week="sun", hour=2, minute=0),
    id="retrain_prophet",
    replace_existing=True,
    misfire_grace_time=3600,  # Cho phép trễ tối đa 1 tiếng
)

# Hàng ngày 01:00 — cập nhật anomaly cache (sau ETL midnight)
scheduler.add_job(
    compute_and_cache_anomaly,
    CronTrigger(hour=1, minute=0),
    id="update_anomaly",
    replace_existing=True,
    misfire_grace_time=1800,
)

# T2 03:00 — cập nhật RFM segments (đầu tuần)
scheduler.add_job(
    update_rfm_segments,
    CronTrigger(day_of_week="mon", hour=3, minute=0),
    id="update_rfm",
    replace_existing=True,
    misfire_grace_time=3600,
)
