# -*- coding: utf-8 -*-
"""Router /cache — quản lý cache AI + GET /insights tổng hợp."""
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter

logger = logging.getLogger("ai.cache")

router   = APIRouter(tags=["Cache"])
insights_router = APIRouter(prefix="/insights", tags=["Insights"])

# ── Đường dẫn file cache ─────────────────────────────────────────────────────
_MODELS_DIR   = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
_ANOMALY_PATH = os.path.join(_MODELS_DIR, "anomaly_cache.json")
_RFM_PATH     = os.path.join(_MODELS_DIR, "rfm_segments.json")
_META_PATH    = os.path.join(_MODELS_DIR, "prophet_revenue_metadata.json")

# ── Trạng thái cache trong memory ────────────────────────────────────────────
_cache_state = {
    "cache_valid":    True,
    "last_updated":   datetime.utcnow().isoformat(),
    "needs_retrain":  False,
    "invalidated_at": None,
}

# Cache insights 1 giờ
_insights_cache: dict = {"data": None, "expires_at": None}


# ── /cache/invalidate ─────────────────────────────────────────────────────────

@router.post(
    "/cache/invalidate",
    summary="Xóa cache AI — gọi sau khi ETL xong",
    description=(
        "Xóa cache anomaly detection + forecast cũ.\n"
        "Set flag `needs_retrain=True` để nhắc retrain Prophet.\n"
        "Không retrain ngay (tốn thời gian) — chỉ tính lại Z-score."
    ),
)
def invalidate_cache():
    global _cache_state, _insights_cache

    _cache_state["cache_valid"]    = False
    _cache_state["needs_retrain"]  = True
    _cache_state["invalidated_at"] = datetime.utcnow().isoformat()
    _insights_cache["data"]        = None  # xóa cache insights

    # Tự động tính lại anomaly cache từ dữ liệu mới
    try:
        from services.anomaly_service import compute_and_cache_anomaly
        compute_and_cache_anomaly()
        _cache_state["cache_valid"]   = True
        _cache_state["last_updated"]  = datetime.utcnow().isoformat()
        logger.info("Cache invalidated + anomaly recomputed")
        return {
            "status":        "refreshed",
            "message":       "Cache đã xóa và tính lại Z-score từ dữ liệu mới",
            "needs_retrain": True,
            "last_updated":  _cache_state["last_updated"],
        }
    except Exception as e:
        logger.warning("Không thể tính lại anomaly: %s", e)
        return {
            "status":        "invalidated",
            "message":       f"Cache đã xóa. Tính lại anomaly thất bại: {e}",
            "needs_retrain": True,
            "invalidated_at": _cache_state["invalidated_at"],
        }


# ── /cache/status ─────────────────────────────────────────────────────────────

@router.get(
    "/cache/status",
    summary="Trạng thái cache AI",
)
def cache_status():
    return {
        "cache_valid":    _cache_state["cache_valid"],
        "last_updated":   _cache_state["last_updated"],
        "needs_retrain":  _cache_state["needs_retrain"],
        "invalidated_at": _cache_state.get("invalidated_at"),
        "anomaly_file":   os.path.exists(_ANOMALY_PATH),
        "rfm_file":       os.path.exists(_RFM_PATH),
        "model_file":     os.path.exists(_META_PATH),
    }


# ── /insights ─────────────────────────────────────────────────────────────────

@insights_router.get(
    "",
    summary="AI Insights tổng hợp",
    description=(
        "Tổng hợp insight tự động từ Forecast + Anomaly + RFM.\n"
        "Cache 1 giờ — không tính lại mỗi request."
    ),
)
def get_insights():
    global _insights_cache

    # Kiểm tra cache còn hạn không
    if (
        _insights_cache["data"] is not None
        and _insights_cache["expires_at"] is not None
        and datetime.utcnow() < _insights_cache["expires_at"]
    ):
        return _insights_cache["data"]

    insights = []

    # 1. Từ metadata Prophet (forecast trend)
    try:
        if os.path.exists(_META_PATH):
            with open(_META_PATH, encoding="utf-8") as f:
                meta = json.load(f)
            cv_mape = meta.get("cv_mape_pct")
            train_to = meta.get("train_to", "")
            if cv_mape is not None:
                if cv_mape < 30:
                    insights.append(f"Mô hình dự báo đạt độ chính xác tốt (CV MAPE = {cv_mape:.1f}%), sẵn sàng cho kế hoạch 30 ngày tới")
                elif cv_mape < 60:
                    insights.append(f"Mô hình dự báo ở mức trung bình (CV MAPE = {cv_mape:.1f}%) — khuyến nghị thêm dữ liệu để cải thiện")
                else:
                    insights.append(f"Dữ liệu lịch sử còn ít, độ chính xác dự báo chưa cao (CV MAPE = {cv_mape:.1f}%)")
    except Exception as e:
        logger.warning("Insights: lỗi đọc metadata Prophet: %s", e)

    # 2. Từ anomaly cache (keys thực tế: total_count, critical_count, warning_count, anomalies)
    try:
        if os.path.exists(_ANOMALY_PATH):
            with open(_ANOMALY_PATH, encoding="utf-8") as f:
                anomaly_data = json.load(f)
            total    = anomaly_data.get("total_count", len(anomaly_data.get("anomalies", [])))
            critical = anomaly_data.get("critical_count", 0)
            warning  = anomaly_data.get("warning_count", 0)

            if critical > 0:
                insights.append(f"Phát hiện {critical} bất thường nghiêm trọng (CRITICAL) cần xem xét ngay")
            if warning > 0:
                insights.append(f"Có {warning} bất thường mức CẢNH BÁO trong dữ liệu 90 ngày gần nhất")
            if total == 0:
                insights.append("Không phát hiện bất thường đáng kể trong 90 ngày qua — doanh thu ổn định")
    except Exception as e:
        logger.warning("Insights: lỗi đọc anomaly cache: %s", e)

    # 3. Từ RFM segments (keys thực tế: segment_summary, total_customers)
    try:
        if os.path.exists(_RFM_PATH):
            with open(_RFM_PATH, encoding="utf-8") as f:
                rfm_data = json.load(f)
            seg       = rfm_data.get("segment_summary", {})
            # segment_summary values là dict {"count": N, ...}
            at_risk   = seg.get("At Risk", {}).get("count", 0) if isinstance(seg.get("At Risk"), dict) else seg.get("At Risk", 0)
            lost      = seg.get("Lost", {}).get("count", 0)    if isinstance(seg.get("Lost"), dict)     else seg.get("Lost", 0)
            vip       = seg.get("VIP", {}).get("count", 0)     if isinstance(seg.get("VIP"), dict)      else seg.get("VIP", 0)
            total_cus = rfm_data.get("total_customers", 0)

            if vip > 0:
                insights.append(f"Có {vip} khách hàng VIP — cần chăm sóc đặc biệt để duy trì doanh thu ổn định")
            if at_risk > 0:
                insights.append(f"{at_risk} khách hàng có nguy cơ rời bỏ (At Risk) — cần chiến dịch retention ngay")
            if lost > 0:
                pct = round(lost / total_cus * 100) if total_cus else 0
                insights.append(f"{lost} khách hàng đã ngừng mua ({pct}% tổng) — cân nhắc chiến dịch win-back")
    except Exception as e:
        logger.warning("Insights: lỗi đọc RFM segments: %s", e)

    # Fallback nếu không có insight nào
    if not insights:
        insights = [
            "Hệ thống AI đang khởi động — chạy notebook để train model và sinh insights",
        ]

    result = {
        "generated_at": datetime.utcnow().isoformat(),
        "count":        len(insights),
        "insights":     insights,
    }

    # Cache 1 giờ
    _insights_cache["data"]       = result
    _insights_cache["expires_at"] = datetime.utcnow() + timedelta(hours=1)

    return result
