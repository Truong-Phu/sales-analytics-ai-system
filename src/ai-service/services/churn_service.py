# -*- coding: utf-8 -*-
"""
Churn Prediction Service – Dự báo khách hàng có nguy cơ rời bỏ.

Pipeline:
  1. Tính RFM (Recency, Frequency, Monetary) từ OLTP
  2. Label: churn = khách không mua trong 60 ngày gần nhất
  3. Train RandomForestClassifier trên RFM features
  4. Trả về danh sách khách kèm xác suất churn + hành động gợi ý

Hoàn toàn miễn phí – chỉ dùng scikit-learn.
"""
import logging
import os
from datetime import datetime, timedelta

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

from services.db_service import get_conn, query_df

logger = logging.getLogger("ai.churn")

_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
_CHURN_MODEL_PATH  = os.path.join(_MODEL_DIR, "churn_model.pkl")
_CHURN_SCALER_PATH = os.path.join(_MODEL_DIR, "churn_scaler.pkl")

# Khách không mua trong CHURN_DAYS ngày → label = 1 (churned)
CHURN_DAYS = 60


def _build_rfm(company_id: str = None) -> pd.DataFrame:
    """Tính bảng RFM + breakdown theo kênh từ orders OLTP."""
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"cid": company_id} if company_id else None

    sql = f"""
        SELECT
            o.customer_id,
            c.full_name,
            c.email,
            c.phone,
            MAX(o.order_date)           AS last_order_date,
            COUNT(DISTINCT o.order_id)  AS frequency,
            SUM(oi.subtotal)            AS monetary
        FROM public.orders o
        JOIN public.order_items oi ON o.order_id = oi.order_id
        JOIN public.customers c    ON o.customer_id = c.customer_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          {cmp_filter}
        GROUP BY o.customer_id, c.full_name, c.email, c.phone
        HAVING COUNT(DISTINCT o.order_id) >= 1
    """

    channel_sql = f"""
        SELECT
            o.customer_id,
            sc.channel_type,
            COUNT(DISTINCT o.order_id)  AS ch_orders,
            SUM(oi.subtotal)            AS ch_revenue,
            MAX(o.order_date)           AS ch_last_order
        FROM public.orders o
        JOIN public.order_items oi  ON o.order_id  = oi.order_id
        JOIN public.sales_channels sc ON o.channel_id = sc.channel_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          {cmp_filter}
        GROUP BY o.customer_id, sc.channel_type
    """

    df = query_df(sql, params)
    if df.empty:
        return df

    df_ch = query_df(channel_sql, params)

    # Gộp breakdown kênh thành dict per customer_id (kèm recency từng kênh)
    channel_map: dict = {}
    if not df_ch.empty:
        now_ts = datetime.utcnow()
        for _, row in df_ch.iterrows():
            cid = int(row["customer_id"])
            ch_recency = None
            raw_ts = row.get("ch_last_order")
            if pd.notna(raw_ts):
                try:
                    ch_last = pd.to_datetime(raw_ts)
                    # Normalize về naive UTC để trừ với datetime.utcnow()
                    if ch_last.tzinfo is not None:
                        ch_last = ch_last.tz_convert("UTC").tz_localize(None)
                    ch_recency = int((now_ts - ch_last).days)
                except Exception:
                    ch_recency = None
            channel_map.setdefault(cid, []).append({
                "channel":      str(row["channel_type"]),
                "orders":       int(row["ch_orders"]),
                "revenue":      round(float(row["ch_revenue"]), 0),
                "recency_days": ch_recency,
            })

    df["channels"] = df["customer_id"].apply(
        lambda cid: sorted(channel_map.get(int(cid), []), key=lambda x: -x["revenue"])
    )

    df["last_order_date"] = pd.to_datetime(df["last_order_date"]).dt.tz_localize(None)
    now = datetime.utcnow()
    df["recency"]   = (now - df["last_order_date"]).dt.days
    df["frequency"] = df["frequency"].astype(float)
    df["monetary"]  = df["monetary"].astype(float)
    return df


def _label_churn(df: pd.DataFrame) -> pd.DataFrame:
    """Label churn = 1 nếu recency > CHURN_DAYS."""
    df = df.copy()
    df["churn_label"] = (df["recency"] > CHURN_DAYS).astype(int)
    return df


def _train_model(df: pd.DataFrame):
    """Train RandomForest và lưu model + scaler."""
    os.makedirs(_MODEL_DIR, exist_ok=True)
    X = df[["recency", "frequency", "monetary"]].values
    y = df["churn_label"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Cân bằng class imbalance bằng class_weight="balanced"
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=5,
        class_weight="balanced",
        random_state=42,
    )
    clf.fit(X_scaled, y)

    joblib.dump(clf,    _CHURN_MODEL_PATH)
    joblib.dump(scaler, _CHURN_SCALER_PATH)
    logger.info("Churn model đã train xong với %d khách hàng", len(df))
    return clf, scaler


def _load_or_train(df: pd.DataFrame):
    """Load model có sẵn hoặc train mới."""
    if os.path.exists(_CHURN_MODEL_PATH) and os.path.exists(_CHURN_SCALER_PATH):
        clf    = joblib.load(_CHURN_MODEL_PATH)
        scaler = joblib.load(_CHURN_SCALER_PATH)
        return clf, scaler
    return _train_model(df)


def _risk_label(prob: float) -> str:
    if prob >= 0.7:
        return "HIGH"
    if prob >= 0.4:
        return "MEDIUM"
    return "LOW"


_CHANNEL_LABEL = {
    "shopee":      "Shopee",
    "tiktok":      "TikTok Shop",
    "tiktok_shop": "TikTok Shop",
    "lazada":      "Lazada",
    "facebook":    "Facebook",
    "website":     "Website",
    "pos":         "Cửa hàng",
    "offline":     "Cửa hàng",
}

def _action(risk: str, recency: int, frequency: int, channels: list = None) -> str:
    """Action tổng hợp ở cấp khách hàng (dùng overall recency + kênh chính)."""
    top_ch = ""
    if channels:
        raw = channels[0]["channel"]
        top_ch = _CHANNEL_LABEL.get(raw.lower(), raw)
    ch = top_ch or "kênh chính"
    if risk == "HIGH":
        return f"Chưa mua {recency} ngày – Ưu tiên chạy campaign giữ chân trên {ch}"
    if risk == "MEDIUM":
        return f"Tần suất giảm – Nhắc mua hàng định kỳ trên {ch}"
    return f"Khách ổn định – Duy trì upsell trên {ch}"


def _enrich_channel_actions(channels: list, risk: str) -> list:
    """Thêm action riêng cho từng kênh dựa trên recency của kênh đó."""
    result = []
    for ch in channels:
        label = _CHANNEL_LABEL.get(ch["channel"].lower(), ch["channel"])
        r = ch.get("recency_days")
        if r is None:
            action = f"Duy trì hoạt động trên {label}"
        elif risk == "HIGH":
            action = f"Không mua {r} ngày trên {label} – Ưu tiên tái kích hoạt"
        elif risk == "MEDIUM":
            action = f"Giảm tần suất trên {label} – Nhắc mua hàng định kỳ"
        else:
            action = f"Ổn định trên {label} – Duy trì upsell"
        result.append({**ch, "action": action})
    return result


def predict_churn(
    company_id: str = None,
    retrain: bool = False,
    top_n: int = 50,
) -> dict:
    """
    Dự báo nguy cơ churn cho tất cả khách hàng.

    Returns:
        dict với keys: total_customers, high_risk_count, customers (list)
    """
    df = _build_rfm(company_id)
    if df.empty:
        return {
            "total_customers":    0,
            "high_risk_count":    0,
            "medium_risk_count":  0,
            "low_risk_count":     0,
            "churn_rate_pct":     0.0,
            "churn_threshold_days": CHURN_DAYS,
            "model":              "RandomForestClassifier",
            "customers":          [],
            "note":               "Chưa có dữ liệu khách hàng",
        }

    df = _label_churn(df)

    # Nếu chỉ có 1 class → dùng heuristic recency thay vì RF
    if df["churn_label"].nunique() < 2:
        max_r = df["recency"].max() or 1
        df["churn_prob"] = (df["recency"] / max_r).clip(0, 1)
        df["risk"]   = df["churn_prob"].apply(_risk_label)
        df["action"] = df.apply(lambda r: _action(r["risk"], r["recency"], r["frequency"], r.get("channels", [])), axis=1)
        df_sorted = df.sort_values("churn_prob", ascending=False)
        high   = int((df["risk"] == "HIGH").sum())
        medium = int((df["risk"] == "MEDIUM").sum())
        low    = int((df["risk"] == "LOW").sum())
        total  = len(df)
        customers = []
        for _, row in df_sorted.head(top_n).iterrows():
            risk = row["risk"]
            customers.append({
                "customer_id":  str(row.get("customer_id", "")),
                "full_name":    str(row.get("full_name", "N/A")),
                "email":        str(row["email"]) if pd.notna(row.get("email")) else "",
                "phone":        str(row["phone"]) if pd.notna(row.get("phone")) else "",
                "channels":     _enrich_channel_actions(row.get("channels", []), risk),
                "recency_days": int(row["recency"]),
                "frequency":    int(row["frequency"]),
                "monetary":     round(float(row["monetary"]), 0),
                "churn_prob":   round(float(row["churn_prob"]) * 100, 1),
                "risk":         risk,
                "action":       row["action"],
            })
        return {
            "total_customers": total, "high_risk_count": high,
            "medium_risk_count": medium, "low_risk_count": low,
            "churn_rate_pct": round(high / total * 100, 1) if total else 0.0,
            "customers": customers, "churn_threshold_days": CHURN_DAYS,
            "model": "Heuristic (Recency-based)",
            "note": f"Phân tích {total} khách hàng. Dùng heuristic do dữ liệu chỉ có 1 class.",
        }

    if retrain or not os.path.exists(_CHURN_MODEL_PATH):
        clf, scaler = _train_model(df)
    else:
        clf, scaler = _load_or_train(df)

    X = df[["recency", "frequency", "monetary"]].values
    X_scaled = scaler.transform(X)
    proba_matrix = clf.predict_proba(X_scaled)
    # RF chỉ trả 1 cột nếu fit với 1 class (safety net)
    probs = proba_matrix[:, 1] if proba_matrix.shape[1] > 1 else proba_matrix[:, 0]

    df["churn_prob"] = probs
    df["risk"]       = df["churn_prob"].apply(_risk_label)
    df["action"]     = df.apply(
        lambda r: _action(r["risk"], r["recency"], r["frequency"], r.get("channels", [])), axis=1
    )

    # Sắp xếp theo rủi ro cao nhất
    df_sorted = df.sort_values("churn_prob", ascending=False)

    high   = int((df["risk"] == "HIGH").sum())
    medium = int((df["risk"] == "MEDIUM").sum())
    low    = int((df["risk"] == "LOW").sum())
    total  = len(df)

    customers = []
    for _, row in df_sorted.head(top_n).iterrows():
        risk = row["risk"]
        customers.append({
            "customer_id":  str(row.get("customer_id", "")),
            "full_name":    str(row.get("full_name", "N/A")),
            "email":        str(row["email"]) if pd.notna(row.get("email")) else "",
            "phone":        str(row["phone"]) if pd.notna(row.get("phone")) else "",
            "channels":     _enrich_channel_actions(row.get("channels", []), risk),
            "recency_days": int(row["recency"]),
            "frequency":    int(row["frequency"]),
            "monetary":     round(float(row["monetary"]), 0),
            "churn_prob":   round(float(row["churn_prob"]) * 100, 1),
            "risk":         risk,
            "action":       row["action"],
        })

    return {
        "total_customers":   total,
        "high_risk_count":   high,
        "medium_risk_count": medium,
        "low_risk_count":    low,
        "churn_rate_pct":    round(high / total * 100, 1) if total else 0.0,
        "customers":         customers,
        "churn_threshold_days": CHURN_DAYS,
        "model":             "RandomForestClassifier",
        "note": (
            f"Phân tích {total} khách hàng. "
            f"Churn threshold: không mua trong {CHURN_DAYS} ngày."
        ),
    }
