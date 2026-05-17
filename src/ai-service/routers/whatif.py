# -*- coding: utf-8 -*-
"""
Router /whatif – Mô phỏng kịch bản "Điều gì xảy ra nếu..."

Các kịch bản hỗ trợ:
  1. price_change:    Thay đổi giá bán X% → doanh thu thay đổi thế nào?
  2. discount:        Chạy khuyến mãi giảm X% trong Y ngày → doanh thu kỳ vọng?
  3. new_channel:     Mở thêm kênh mới → ước tính doanh thu thêm?
  4. boost_marketing: Tăng ngân sách quảng cáo X% → tác động dự kiến?

Phương pháp:
  - Dùng Prophet model đã train (nếu có) để dự báo baseline
  - Áp dụng elasticity/multiplier lên baseline
  - Price elasticity mặc định = -1.5 (ngành thời trang SME)

Hoàn toàn miễn phí.
"""
import logging
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import load_revenue_series

logger = logging.getLogger("ai.whatif")

router = APIRouter(prefix="/whatif", tags=["What-If Simulator"])

# Price elasticity của cầu (ngành thời trang/SME, ước tính)
# -1.5 nghĩa là tăng giá 10% → giảm lượng cầu 15%
DEFAULT_PRICE_ELASTICITY = -1.5


# ── Models ────────────────────────────────────────────────────────────────────

class ScenarioRequest(BaseModel):
    scenario:        str            # "price_change" | "discount" | "new_channel" | "boost_marketing"
    change_pct:      float          # % thay đổi (âm = giảm, dương = tăng)
    horizon_days:    int   = 30     # Mô phỏng trong bao nhiêu ngày tới
    channel:         Optional[str] = None
    company_id:      Optional[str] = None
    price_elasticity: float = DEFAULT_PRICE_ELASTICITY


class ScenarioPoint(BaseModel):
    date:         str
    baseline:     float   # Doanh thu dự báo không thay đổi
    simulated:    float   # Doanh thu dự báo sau thay đổi
    delta:        float   # Chênh lệch tuyệt đối
    delta_pct:    float   # Chênh lệch %


class WhatIfResponse(BaseModel):
    scenario:            str
    change_pct:          float
    horizon_days:        int
    baseline_total:      float
    simulated_total:     float
    delta_total:         float
    delta_total_pct:     float
    breakeven_days:      Optional[int]   # Bao nhiêu ngày để hoà vốn (nếu áp dụng)
    recommendation:      str
    chart_data:          List[ScenarioPoint]
    assumptions:         List[str]
    is_mock:             bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_baseline_from_prophet(horizon: int) -> List[float]:
    """Lấy dự báo baseline từ Prophet nếu model có sẵn."""
    try:
        import os
        import joblib
        model_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "models", "prophet_revenue.pkl"
        )
        if not os.path.exists(model_path):
            return []

        m = joblib.load(model_path)
        future = m.make_future_dataframe(periods=horizon)
        forecast = m.predict(future)
        baseline = forecast.tail(horizon)["yhat"].clip(lower=0).tolist()
        return baseline
    except Exception as e:
        logger.warning("Không load được Prophet model: %s", e)
        return []


def _get_baseline_from_history(days: int, horizon: int) -> List[float]:
    """Fallback: dùng trung bình 30 ngày gần nhất nhân theo mùa vụ đơn giản."""
    df = load_revenue_series()
    if df.empty:
        avg = 5_000_000
    else:
        avg = float(df["y"].tail(days).mean())

    import datetime
    import math
    today = datetime.date.today()
    baseline = []
    for i in range(horizon):
        d = today + datetime.timedelta(days=i + 1)
        # Cuối tuần (T7, CN) thường bán tốt hơn ~20%
        multiplier = 1.2 if d.weekday() >= 5 else 1.0
        baseline.append(round(avg * multiplier, 0))
    return baseline


def _compute_multiplier(scenario: str, change_pct: float, elasticity: float) -> float:
    """Tính hệ số nhân doanh thu dựa trên kịch bản."""
    c = change_pct / 100.0

    if scenario == "price_change":
        # Revenue = Price × Quantity; Quantity thay đổi theo elasticity
        revenue_mult = (1 + c) * (1 + elasticity * c)
        return max(revenue_mult, 0.1)

    if scenario == "discount":
        # Giảm giá kích cầu: quantity tăng, nhưng giá giảm
        quantity_boost = 1 + (-elasticity * (-c))   # giảm giá → tăng demand
        revenue_mult   = (1 + c) * quantity_boost   # c âm (giảm giá), qty tăng
        return max(revenue_mult, 0.1)

    if scenario == "new_channel":
        # Kênh mới đóng góp thêm change_pct% doanh thu
        return 1.0 + abs(c)

    if scenario == "boost_marketing":
        # Tăng ngân sách X% → ROAS trung bình 3x → doanh thu tăng khoảng X%*0.3
        # (conservative estimate)
        return 1.0 + abs(c) * 0.3

    return 1.0


def _build_recommendation(scenario: str, delta_pct: float, change_pct: float) -> str:
    if scenario == "price_change":
        if delta_pct > 0:
            return (
                f"Tăng giá {change_pct:.0f}% có thể tăng doanh thu {delta_pct:.1f}%. "
                "Tuy nhiên cần theo dõi tỷ lệ chuyển đổi để xác nhận elasticity thực tế."
            )
        return (
            f"Tăng giá {change_pct:.0f}% dự kiến giảm doanh thu {abs(delta_pct):.1f}%. "
            "Chỉ nên tăng giá nếu có lợi thế cạnh tranh rõ ràng."
        )
    if scenario == "discount":
        return (
            f"Chạy khuyến mãi giảm {abs(change_pct):.0f}% có thể "
            f"{'tăng' if delta_pct > 0 else 'giảm'} doanh thu {abs(delta_pct):.1f}% "
            "nhờ kích cầu. Kiểm tra biên lợi nhuận trước khi áp dụng."
        )
    if scenario == "new_channel":
        return (
            f"Mở thêm kênh mới ước tính tăng doanh thu {delta_pct:.1f}%. "
            "Chi phí vận hành kênh mới cần tính vào ROI thực tế."
        )
    if scenario == "boost_marketing":
        return (
            f"Tăng ngân sách quảng cáo {change_pct:.0f}% ước tính tăng doanh thu {delta_pct:.1f}% "
            "(ROAS 3x, conservative). Theo dõi CPA và ROAS thực tế để điều chỉnh."
        )
    return "Kịch bản không xác định."


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=WhatIfResponse,
    summary="Mô phỏng kịch bản What-If",
    description=(
        "Mô phỏng tác động doanh thu khi thay đổi chiến lược kinh doanh.\n\n"
        "**Các kịch bản:**\n"
        "- `price_change`: Thay đổi giá bán (dùng price elasticity)\n"
        "- `discount`: Chạy chương trình khuyến mãi\n"
        "- `new_channel`: Mở thêm kênh bán hàng mới\n"
        "- `boost_marketing`: Tăng ngân sách quảng cáo\n\n"
        "**change_pct**: Phần trăm thay đổi (10 = +10%, -20 = -20%)"
    ),
)
def simulate_whatif(body: ScenarioRequest):
    import datetime

    horizon = max(1, min(body.horizon_days, 90))

    # Lấy baseline
    baseline = _get_baseline_from_prophet(horizon)
    is_mock  = False
    if not baseline or len(baseline) < horizon:
        baseline = _get_baseline_from_history(30, horizon)
        is_mock  = True

    # Tính multiplier
    mult = _compute_multiplier(
        body.scenario, body.change_pct, body.price_elasticity
    )

    # Xây dữ liệu chart
    today = datetime.date.today()
    chart_data: List[ScenarioPoint] = []
    for i, base_val in enumerate(baseline[:horizon]):
        d          = today + datetime.timedelta(days=i + 1)
        sim_val    = round(base_val * mult, 0)
        delta      = sim_val - base_val
        delta_pct  = round(delta / base_val * 100, 2) if base_val else 0
        chart_data.append(ScenarioPoint(
            date=d.isoformat(),
            baseline=round(base_val, 0),
            simulated=sim_val,
            delta=round(delta, 0),
            delta_pct=delta_pct,
        ))

    baseline_total  = round(sum(p.baseline  for p in chart_data), 0)
    simulated_total = round(sum(p.simulated for p in chart_data), 0)
    delta_total     = round(simulated_total - baseline_total, 0)
    delta_total_pct = round(delta_total / baseline_total * 100, 2) if baseline_total else 0

    recommendation = _build_recommendation(body.scenario, delta_total_pct, body.change_pct)

    # Tính breakeven (cho kịch bản discount/marketing)
    breakeven = None
    if body.scenario in ("discount", "boost_marketing") and delta_total_pct > 0:
        # Ước tính chi phí: discount = change_pct% của baseline; marketing = change_pct% * budget_assumed
        cumulative_delta = 0.0
        for i, p in enumerate(chart_data):
            cumulative_delta += p.delta
            if cumulative_delta >= 0:
                breakeven = i + 1
                break

    assumptions = [
        f"Price elasticity = {body.price_elasticity} (mặc định ngành SME Việt Nam)",
        "Dự báo baseline từ Prophet model (hoặc lịch sử 30 ngày nếu chưa train)",
        "Không tính chi phí vận hành / sản xuất thêm",
        "Giả định các yếu tố khác không đổi (ceteris paribus)",
    ]

    return WhatIfResponse(
        scenario=body.scenario,
        change_pct=body.change_pct,
        horizon_days=horizon,
        baseline_total=baseline_total,
        simulated_total=simulated_total,
        delta_total=delta_total,
        delta_total_pct=delta_total_pct,
        breakeven_days=breakeven,
        recommendation=recommendation,
        chart_data=chart_data,
        assumptions=assumptions,
        is_mock=is_mock,
    )
