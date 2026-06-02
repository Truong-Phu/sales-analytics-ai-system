# -*- coding: utf-8 -*-
"""Router /churn – Dự báo khách hàng có nguy cơ rời bỏ (Churn Prediction)."""
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.churn_service import predict_churn

router = APIRouter(prefix="/churn", tags=["Churn Prediction"])


class ChurnCustomer(BaseModel):
    customer_id:  str
    full_name:    str
    email:        str
    phone:        str
    channels:     List[Dict[str, Any]]  # [{channel, orders, revenue}] sắp xếp theo revenue
    recency_days: int
    frequency:    int
    monetary:     float
    churn_prob:   float
    risk:         str
    action:       str


class ChurnResponse(BaseModel):
    total_customers:    int
    high_risk_count:    int
    medium_risk_count:  int
    low_risk_count:     int
    churn_rate_pct:     float
    churn_threshold_days: int
    model:              str
    note:               str
    customers:          List[ChurnCustomer]


@router.get(
    "",
    response_model=ChurnResponse,
    summary="Dự báo nguy cơ churn của khách hàng",
    description=(
        "Dùng RFM (Recency, Frequency, Monetary) + RandomForestClassifier "
        "để dự báo khả năng từng khách hàng sẽ rời bỏ.\n\n"
        "- **top_n**: số khách hàng nguy cơ cao trả về (mặc định 50)\n"
        "- **retrain**: train lại model từ dữ liệu mới nhất\n"
        "- **company_id**: lọc theo công ty (multi-tenant)"
    ),
)
def get_churn_prediction(
    top_n:      int            = Query(default=50, ge=1,  le=500),
    retrain:    bool           = Query(default=False, description="Train lại model"),
    company_id: Optional[str] = Query(default=None,  description="UUID công ty"),
):
    result = predict_churn(
        company_id=company_id,
        retrain=retrain,
        top_n=top_n,
    )
    return ChurnResponse(**result)


@router.post(
    "/retrain",
    summary="Train lại Churn model",
    description="Trigger train lại RandomForest từ dữ liệu RFM mới nhất.",
)
def retrain_churn_model(company_id: Optional[str] = Query(default=None)):
    result = predict_churn(company_id=company_id, retrain=True, top_n=1)
    return {
        "status":  "success",
        "message": f"Đã train lại churn model với {result['total_customers']} khách hàng",
        "model":   result["model"],
    }
