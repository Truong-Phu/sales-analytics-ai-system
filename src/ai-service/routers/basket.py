# -*- coding: utf-8 -*-
"""Router /basket – Phân tích sản phẩm hay mua chung (Market Basket Analysis)."""
from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.basket_service import run_basket_analysis

router = APIRouter(prefix="/basket", tags=["Market Basket Analysis"])


class AssociationRule(BaseModel):
    antecedents:    List[str]   # Sản phẩm A
    consequents:    List[str]   # Sản phẩm B (thường mua cùng A)
    support:        float       # Tần suất cặp này xuất hiện
    confidence:     float       # Xác suất mua B khi đã mua A
    lift:           float       # Mức độ tương quan (>1 là tốt)
    conviction:     float
    transactions:   int         # Số đơn chứa cặp này
    recommendation: str         # Gợi ý hành động


class BasketResponse(BaseModel):
    total_transactions: int
    total_rules:        int
    rules:              List[AssociationRule]
    parameters:         dict
    note:               str
    is_mock:            bool


@router.get(
    "",
    response_model=BasketResponse,
    summary="Phân tích sản phẩm hay mua chung",
    description=(
        "Dùng thuật toán Apriori để tìm các cặp/nhóm sản phẩm "
        "thường xuất hiện cùng nhau trong một đơn hàng.\n\n"
        "Ứng dụng:\n"
        "- Tạo bundle sản phẩm với giá ưu đãi\n"
        "- Hiển thị 'Khách hàng cũng mua' trên trang sản phẩm\n"
        "- Tăng Average Order Value (AOV)\n\n"
        "**min_support**: Tối thiểu bao nhiêu % đơn hàng có cặp sản phẩm này (0.02 = 2%)\n"
        "**min_confidence**: Xác suất tối thiểu (0.3 = 30%)\n"
        "**min_lift**: Lift tối thiểu (>1 = có quan hệ thực sự)"
    ),
)
def get_basket_analysis(
    days:           int            = Query(default=180, ge=30,   le=365),
    min_support:    float          = Query(default=0.02, ge=0.01, le=0.5),
    min_confidence: float          = Query(default=0.3,  ge=0.1,  le=1.0),
    min_lift:       float          = Query(default=1.0,  ge=1.0,  le=10.0),
    top_n:          int            = Query(default=20,   ge=1,    le=100),
    company_id:     Optional[str] = Query(default=None),
):
    result = run_basket_analysis(
        company_id=company_id,
        days=days,
        min_support=min_support,
        min_confidence=min_confidence,
        min_lift=min_lift,
        top_n=top_n,
    )
    return BasketResponse(**result)
