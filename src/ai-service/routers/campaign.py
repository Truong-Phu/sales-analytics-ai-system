# -*- coding: utf-8 -*-
"""
Router /campaign – Lên lịch chiến dịch thông minh.

Phân tích seasonal patterns từ dữ liệu lịch sử để gợi ý:
  - Tuần/tháng tốt nhất để chạy chiến dịch
  - Các dịp lễ Việt Nam có doanh thu cao
  - Cảnh báo mùa thấp điểm (chuẩn bị kế hoạch khuyến mãi)

Dùng Prophet seasonality components (weekly + yearly).
Hoàn toàn miễn phí.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import load_revenue_series, query_df

logger = logging.getLogger("ai.campaign")

router = APIRouter(prefix="/campaign", tags=["Campaign Planner"])

# Các dịp lễ quan trọng Việt Nam (tháng, ngày)
VN_EVENTS = [
    {"month": 1,  "day": 1,   "name": "Tết Dương lịch",     "boost_expected": 1.3},
    {"month": 1,  "day": 25,  "name": "Tết Nguyên Đán",     "boost_expected": 2.5},
    {"month": 2,  "day": 14,  "name": "Valentine",          "boost_expected": 1.5},
    {"month": 3,  "day": 8,   "name": "Quốc tế Phụ nữ",     "boost_expected": 1.8},
    {"month": 4,  "day": 30,  "name": "30/4 - Nghỉ lễ",     "boost_expected": 1.4},
    {"month": 5,  "day": 1,   "name": "Quốc tế Lao động",   "boost_expected": 1.4},
    {"month": 6,  "day": 1,   "name": "Ngày Quốc tế Thiếu nhi", "boost_expected": 1.6},
    {"month": 9,  "day": 2,   "name": "Quốc khánh",         "boost_expected": 1.3},
    {"month": 10, "day": 20,  "name": "Ngày Phụ nữ VN",     "boost_expected": 1.9},
    {"month": 11, "day": 11,  "name": "11.11 Sale",          "boost_expected": 3.5},
    {"month": 12, "day": 12,  "name": "12.12 Sale",          "boost_expected": 3.2},
    {"month": 12, "day": 25,  "name": "Giáng Sinh",          "boost_expected": 1.6},
]


class CampaignWindow(BaseModel):
    period:          str         # "2026-W03" hoặc "2026-03"
    period_type:     str         # "week" | "month"
    avg_revenue:     float
    vs_overall_pct:  float       # So với trung bình tổng thể
    recommendation:  str         # "RUN_CAMPAIGN" | "PREPARE" | "LOW_SEASON" | "NORMAL"
    label:           str         # Nhãn hiển thị
    events:          List[str]   # Sự kiện trong kỳ này


class SeasonalInsight(BaseModel):
    best_month:       int
    best_month_name:  str
    worst_month:      int
    worst_month_name: str
    best_weekday:     str
    weekly_pattern:   List[dict]   # [{day: "Mon", avg: 5000000, rank: 1}]


class CampaignResponse(BaseModel):
    windows:          List[CampaignWindow]
    seasonal_insight: SeasonalInsight
    upcoming_events:  List[dict]
    note:             str
    is_mock:          bool


_MONTH_VN = [
    "", "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
    "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
    "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
]
_DOW_VN = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]


def _upcoming_events(days_ahead: int = 60) -> List[dict]:
    """Trả về các sự kiện sắp tới trong days_ahead ngày."""
    import datetime
    today = datetime.date.today()
    result = []
    for ev in VN_EVENTS:
        year = today.year
        try:
            ev_date = datetime.date(year, ev["month"], ev["day"])
        except ValueError:
            continue
        if ev_date < today:
            try:
                ev_date = datetime.date(year + 1, ev["month"], ev["day"])
            except ValueError:
                continue
        diff = (ev_date - today).days
        if 0 <= diff <= days_ahead:
            result.append({
                "name":          ev["name"],
                "date":          ev_date.isoformat(),
                "days_until":    diff,
                "boost_expected": ev["boost_expected"],
                "prepare_by":    (ev_date - datetime.timedelta(days=7)).isoformat(),
                "tip": (
                    f"Chuẩn bị chiến dịch trước {ev['name']} ít nhất 7 ngày. "
                    f"Dự kiến doanh thu tăng {(ev['boost_expected']-1)*100:.0f}%."
                ),
            })
    result.sort(key=lambda x: x["days_until"])
    return result


def _empty_campaign(days_ahead: int) -> CampaignResponse:
    return CampaignResponse(
        windows=[],
        seasonal_insight=SeasonalInsight(
            best_month=0, best_month_name="Chưa đủ dữ liệu",
            worst_month=0, worst_month_name="Chưa đủ dữ liệu",
            best_weekday="Chưa đủ dữ liệu",
            weekly_pattern=[],
        ),
        upcoming_events=_upcoming_events(days_ahead),
        note="Cần ≥ 60 ngày dữ liệu để phân tích seasonal pattern.",
        is_mock=False,
    )


@router.get(
    "",
    response_model=CampaignResponse,
    summary="Lên lịch chiến dịch marketing thông minh",
    description=(
        "Phân tích seasonal patterns từ lịch sử bán hàng để gợi ý:\n"
        "- Tuần/tháng tốt nhất để chạy chiến dịch\n"
        "- Các dịp lễ Việt Nam sắp tới\n"
        "- Cảnh báo mùa thấp điểm để chuẩn bị khuyến mãi\n"
        "- Pattern theo ngày trong tuần"
    ),
)
def get_campaign_plan(
    company_id:  Optional[str] = Query(default=None),
    days_ahead:  int           = Query(default=60, ge=7, le=180, description="Số ngày sự kiện sắp tới"),
):
    import datetime

    df = load_revenue_series(company_id=company_id)
    if df.empty or len(df) < 60:
        return _empty_campaign(days_ahead)

    df["ds"] = pd.to_datetime(df["ds"]) if "ds" in df.columns else df.index
    df["month"]   = df["ds"].dt.month
    df["weekday"] = df["ds"].dt.weekday   # 0=Mon, 6=Sun
    df["week"]    = df["ds"].dt.isocalendar().week.astype(int)
    df["year"]    = df["ds"].dt.year

    overall_avg = float(df["y"].mean())

    # ── Monthly pattern ──────────────────────────────────────────────────────
    monthly = df.groupby("month")["y"].mean().reset_index()
    monthly.columns = ["month", "avg"]
    best_month  = int(monthly.loc[monthly["avg"].idxmax(), "month"])
    worst_month = int(monthly.loc[monthly["avg"].idxmin(), "month"])

    # ── Weekly pattern ───────────────────────────────────────────────────────
    weekly = df.groupby("weekday")["y"].mean().reset_index()
    weekly.columns = ["weekday", "avg"]
    best_dow    = int(weekly.loc[weekly["avg"].idxmax(), "weekday"])
    ranked_dow  = weekly.sort_values("avg", ascending=False).reset_index(drop=True)
    weekly_pattern = [
        {
            "day": _DOW_VN[int(row["weekday"])],
            "avg": round(float(row["avg"]), 0),
            "rank": int(ranked_dow[ranked_dow["weekday"] == row["weekday"]].index[0]) + 1,
        }
        for _, row in weekly.iterrows()
    ]
    weekly_pattern.sort(key=lambda x: x["rank"])

    # ── Monthly windows (next 12 months) ─────────────────────────────────────
    today = datetime.date.today()
    windows: List[CampaignWindow] = []
    for m_offset in range(1, 7):
        target_month = (today.month + m_offset - 1) % 12 + 1
        target_year  = today.year + (today.month + m_offset - 1) // 12
        period_str   = f"{target_year}-{target_month:02d}"

        hist_month = monthly[monthly["month"] == target_month]
        if hist_month.empty:
            continue
        avg_rev  = round(float(hist_month["avg"].iloc[0]), 0)
        vs_ovl   = round((avg_rev - overall_avg) / overall_avg * 100, 1) if overall_avg else 0

        events_in_month = [
            ev["name"] for ev in VN_EVENTS if ev["month"] == target_month
        ]

        if vs_ovl >= 30:
            rec = "RUN_CAMPAIGN"
            label = f"{_MONTH_VN[target_month]} – Mùa cao điểm"
        elif vs_ovl >= 10:
            rec = "PREPARE"
            label = f"{_MONTH_VN[target_month]} – Tốt, nên chuẩn bị"
        elif vs_ovl <= -20:
            rec = "LOW_SEASON"
            label = f"{_MONTH_VN[target_month]} – Thấp điểm"
        else:
            rec = "NORMAL"
            label = f"{_MONTH_VN[target_month]} – Bình thường"

        windows.append(CampaignWindow(
            period=period_str,
            period_type="month",
            avg_revenue=avg_rev,
            vs_overall_pct=vs_ovl,
            recommendation=rec,
            label=label,
            events=events_in_month,
        ))

    insight = SeasonalInsight(
        best_month=best_month,
        best_month_name=_MONTH_VN[best_month],
        worst_month=worst_month,
        worst_month_name=_MONTH_VN[worst_month],
        best_weekday=_DOW_VN[best_dow],
        weekly_pattern=weekly_pattern,
    )

    return CampaignResponse(
        windows=windows,
        seasonal_insight=insight,
        upcoming_events=_upcoming_events(days_ahead),
        note=f"Phân tích từ {len(df)} ngày dữ liệu lịch sử",
        is_mock=False,
    )


# Import pandas cần ở module level để dùng trong function
import pandas as pd
