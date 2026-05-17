# -*- coding: utf-8 -*-
"""Router /supplier – Đánh giá hiệu suất nhà cung cấp."""
from typing import List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import query_df

router = APIRouter(prefix="/supplier", tags=["Supplier Performance"])


class SupplierStat(BaseModel):
    supplier_name:      str
    total_deliveries:   int
    on_time_deliveries: int
    on_time_rate:       float
    avg_lead_days:      float
    late_deliveries:    int
    total_quantity:     int
    total_value:        float
    quality_score:      float   # proxy 1.0–5.0
    status:             str     # GOOD | WARNING | CRITICAL


class SupplierResponse(BaseModel):
    suppliers:     List[SupplierStat]
    days_analyzed: int
    is_mock:       bool


MOCK_SUPPLIERS = [
    SupplierStat(supplier_name="Nhà máy Dệt may Phong Phú",    total_deliveries=48, on_time_deliveries=44,
                 on_time_rate=0.917, avg_lead_days=3.2, late_deliveries=4,
                 total_quantity=2400, total_value=182_000_000, quality_score=4.5, status="GOOD"),
    SupplierStat(supplier_name="Công ty TNHH Thời Trang Việt", total_deliveries=35, on_time_deliveries=28,
                 on_time_rate=0.800, avg_lead_days=5.1, late_deliveries=7,
                 total_quantity=1750, total_value=124_000_000, quality_score=3.8, status="WARNING"),
    SupplierStat(supplier_name="XNK Hoàng Gia Fashion",        total_deliveries=22, on_time_deliveries=14,
                 on_time_rate=0.636, avg_lead_days=8.4, late_deliveries=8,
                 total_quantity=880,  total_value=67_000_000,  quality_score=2.9, status="CRITICAL"),
    SupplierStat(supplier_name="Dệt may Thành Công",           total_deliveries=31, on_time_deliveries=30,
                 on_time_rate=0.968, avg_lead_days=2.8, late_deliveries=1,
                 total_quantity=1550, total_value=98_000_000,  quality_score=4.8, status="GOOD"),
    SupplierStat(supplier_name="Công ty CP May Sơn Nam",       total_deliveries=18, on_time_deliveries=15,
                 on_time_rate=0.833, avg_lead_days=4.7, late_deliveries=3,
                 total_quantity=720,  total_value=51_000_000,  quality_score=4.1, status="GOOD"),
]


@router.get("", response_model=SupplierResponse, summary="Hiệu suất nhà cung cấp")
def get_supplier_performance(
    days:       int           = Query(default=90, ge=7, le=365),
    company_id: Optional[str] = Query(default=None),
):
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    since = (date.today() - timedelta(days=days)).isoformat()
    params: dict = {"since": since}
    if company_id:
        params["cid"] = company_id

    sql = f"""
        SELECT
            COALESCE(s.supplier_name, 'Chưa xác định') AS supplier_name,
            COUNT(*)  AS total_deliveries,
            SUM(CASE WHEN o.actual_delivery_date <= o.expected_delivery_date THEN 1 ELSE 0 END) AS on_time,
            AVG(EXTRACT(EPOCH FROM (o.actual_delivery_date - o.order_date)) / 86400) AS avg_lead_days,
            SUM(oi.quantity) AS total_quantity,
            SUM(oi.subtotal) AS total_value
        FROM public.orders o
        JOIN public.order_items oi  ON oi.order_id  = o.order_id
        LEFT JOIN public.suppliers s ON s.supplier_id = oi.supplier_id
        WHERE o.order_date >= %(since)s
          AND o.status = 'DELIVERED'
          {cmp_filter}
        GROUP BY s.supplier_name
        ORDER BY total_value DESC
        LIMIT 20
    """
    try:
        df = query_df(sql, params)
    except Exception:
        df = None

    if df is None or df.empty:
        return SupplierResponse(days_analyzed=days, is_mock=True, suppliers=MOCK_SUPPLIERS)

    suppliers = []
    for _, row in df.iterrows():
        total   = int(row["total_deliveries"])
        on_time = int(row.get("on_time") or 0)
        rate    = on_time / total if total > 0 else 0
        lead    = float(row.get("avg_lead_days") or 4.0)
        status  = "GOOD" if rate >= 0.85 else ("WARNING" if rate >= 0.70 else "CRITICAL")
        suppliers.append(SupplierStat(
            supplier_name=str(row["supplier_name"]),
            total_deliveries=total,
            on_time_deliveries=on_time,
            on_time_rate=round(rate, 3),
            avg_lead_days=round(lead, 1),
            late_deliveries=total - on_time,
            total_quantity=int(row.get("total_quantity") or 0),
            total_value=float(row.get("total_value") or 0),
            quality_score=round(3.0 + rate * 2.0, 1),
            status=status,
        ))

    return SupplierResponse(days_analyzed=days, is_mock=False, suppliers=suppliers)
