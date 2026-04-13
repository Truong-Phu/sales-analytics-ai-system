# -*- coding: utf-8 -*-
"""
Anomaly Service – Phát hiện bất thường trong dữ liệu doanh thu.

Phương pháp: Z-score + IQR kết hợp, không cần model riêng.
Phát hiện ngày có doanh thu bất thường cao/thấp so với kỳ vọng.
"""
import logging
from typing import List

import numpy as np
import pandas as pd

from services.db_service import load_revenue_series

logger = logging.getLogger("ai.anomaly")

# Ngưỡng Z-score để coi là bất thường
Z_THRESHOLD = 2.5


def detect_anomalies(
    days: int = 90,
    channel: str = None,
) -> List[dict]:
    """
    Phát hiện ngày bất thường trong days ngày gần nhất.

    Args:
        days:    số ngày nhìn lại (lookback window)
        channel: lọc theo kênh

    Returns:
        list[dict]: {date, actual, expected, z_score, direction, severity}
    """
    df = load_revenue_series(channel)
    if len(df) < 14:
        logger.warning("Không đủ dữ liệu để phát hiện anomaly (cần ≥ 14 ngày).")
        return []

    # Chỉ xét trong window gần nhất
    df = df.tail(max(days, 30)).copy()

    # Tính rolling mean và std (window 14 ngày) để phát hiện deviation
    df["rolling_mean"] = df["y"].rolling(window=14, min_periods=7).mean()
    df["rolling_std"]  = df["y"].rolling(window=14, min_periods=7).std()

    # Thay std=0 bằng 1 để tránh chia 0
    df["rolling_std"] = df["rolling_std"].replace(0, 1)

    # Z-score từng điểm
    df["z_score"] = (df["y"] - df["rolling_mean"]) / df["rolling_std"]

    # Lọc anomaly
    anomalies = df[df["z_score"].abs() >= Z_THRESHOLD].dropna(subset=["rolling_mean"])

    result = []
    for _, row in anomalies.iterrows():
        direction = "HIGH" if row["z_score"] > 0 else "LOW"
        severity  = "CRITICAL" if abs(row["z_score"]) >= 4 else "WARNING"
        result.append({
            "date":      row["ds"].strftime("%Y-%m-%d"),
            "actual":    round(row["y"], 0),
            "expected":  round(row["rolling_mean"], 0),
            "z_score":   round(row["z_score"], 2),
            "direction": direction,
            "severity":  severity,
            "message": (
                f"Doanh thu {'cao' if direction=='HIGH' else 'thấp'} bất thường "
                f"({abs(row['z_score']):.1f}σ so với trung bình)"
            ),
        })

    # Sắp xếp theo mức độ nghiêm trọng
    result.sort(key=lambda x: abs(x["z_score"]), reverse=True)
    logger.info(f"Phát hiện {len(result)} anomaly trong {days} ngày qua")
    return result
