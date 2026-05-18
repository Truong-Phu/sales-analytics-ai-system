# -*- coding: utf-8 -*-
"""
Router /geo – Phân bổ khách hàng theo địa lý (Geo Heatmap).

Trả về dữ liệu để hiển thị heatmap trên bản đồ Việt Nam (Leaflet.js).
Mỗi điểm = tỉnh/thành phố với: số khách, doanh thu, lat/lng.

Hoàn toàn miễn phí.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from services.db_service import query_df

logger = logging.getLogger("ai.geo")

router = APIRouter(prefix="/geo", tags=["Geo Heatmap"])

# Tọa độ trung tâm 63 tỉnh/thành Việt Nam
VN_PROVINCE_COORDS: dict = {
    "Hà Nội":           (21.0285,  105.8542),
    "TP. Hồ Chí Minh":  (10.7769,  106.7009),
    "Đà Nẵng":          (16.0471,  108.2062),
    "Hải Phòng":        (20.8449,  106.6881),
    "Cần Thơ":          (10.0341,  105.7878),
    "An Giang":         (10.3861,  105.4350),
    "Bà Rịa - Vũng Tàu":(10.5418,  107.2430),
    "Bắc Giang":        (21.2819,  106.1977),
    "Bắc Kạn":          (22.1472,  105.8349),
    "Bạc Liêu":         (9.2940,   105.7278),
    "Bắc Ninh":         (21.1861,  106.0763),
    "Bến Tre":          (10.2433,  106.3753),
    "Bình Định":        (13.7765,  109.2237),
    "Bình Dương":       (11.1684,  106.6515),
    "Bình Phước":       (11.7512,  106.7234),
    "Bình Thuận":       (11.0904,  108.0721),
    "Cà Mau":           (9.1769,   105.1524),
    "Cao Bằng":         (22.6657,  106.2578),
    "Đắk Lắk":          (12.7100,  108.2378),
    "Đắk Nông":         (12.0045,  107.6867),
    "Điện Biên":        (21.3860,  103.0230),
    "Đồng Nai":         (11.0686,  107.1676),
    "Đồng Tháp":        (10.4938,  105.6882),
    "Gia Lai":          (13.9810,  108.0000),
    "Hà Giang":         (22.8026,  104.9784),
    "Hà Nam":           (20.5481,  105.9224),
    "Hà Tĩnh":          (18.3559,  105.8877),
    "Hải Dương":        (20.9374,  106.3143),
    "Hậu Giang":        (9.7579,   105.6413),
    "Hòa Bình":         (20.8135,  105.3376),
    "Hưng Yên":         (20.6464,  106.0511),
    "Khánh Hòa":        (12.2388,  109.1967),
    "Kiên Giang":       (9.8250,   105.1259),
    "Kon Tum":          (14.3497,  107.9996),
    "Lai Châu":         (22.3864,  103.4312),
    "Lâm Đồng":         (11.5753,  108.1429),
    "Lạng Sơn":         (21.8530,  106.7611),
    "Lào Cai":          (22.4809,  103.9750),
    "Long An":          (10.6956,  106.2431),
    "Nam Định":         (20.4388,  106.1621),
    "Nghệ An":          (19.2342,  104.9200),
    "Ninh Bình":        (20.2506,  105.9745),
    "Ninh Thuận":       (11.6740,  108.8628),
    "Phú Thọ":          (21.3989,  105.2288),
    "Phú Yên":          (13.0882,  109.0929),
    "Quảng Bình":       (17.4689,  106.5948),
    "Quảng Nam":        (15.5394,  108.0191),
    "Quảng Ngãi":       (15.1214,  108.8044),
    "Quảng Ninh":       (21.2060,  107.2925),
    "Quảng Trị":        (16.7403,  107.1854),
    "Sóc Trăng":        (9.6003,   105.9800),
    "Sơn La":           (21.3256,  103.9188),
    "Tây Ninh":         (11.3351,  106.1099),
    "Thái Bình":        (20.4463,  106.3366),
    "Thái Nguyên":      (21.5942,  105.8412),
    "Thanh Hóa":        (19.8072,  105.7773),
    "Thừa Thiên Huế":   (16.4637,  107.5909),
    "Tiền Giang":       (10.3598,  106.3642),
    "Trà Vinh":         (9.9477,   106.3421),
    "Tuyên Quang":      (21.8234,  105.2143),
    "Vĩnh Long":        (10.2538,  105.9722),
    "Vĩnh Phúc":        (21.3609,  105.5474),
    "Yên Bái":          (21.7051,  104.8989),
}


class GeoPoint(BaseModel):
    province:       str
    lat:            float
    lng:            float
    customer_count: int
    revenue:        float
    orders:         int
    intensity:      float   # 0.0–1.0 để hiển thị màu heatmap


class GeoResponse(BaseModel):
    total_customers: int
    total_provinces: int
    top_province:    str
    points:          List[GeoPoint]
    analysis_days:   int
    is_mock:         bool


def _mock_geo() -> GeoResponse:
    raw = [
        ("TP. Hồ Chí Minh",  4500, 285_000_000, 1820),
        ("Hà Nội",           3200, 198_000_000, 1340),
        ("Đà Nẵng",           890,  52_000_000,  423),
        ("Bình Dương",        780,  41_000_000,  310),
        ("Đồng Nai",          640,  33_000_000,  265),
        ("Hải Phòng",         520,  28_000_000,  198),
        ("Cần Thơ",           410,  22_000_000,  168),
        ("Khánh Hòa",         320,  17_000_000,  124),
    ]
    max_cust = max(r[1] for r in raw)
    points = []
    for prov, cust, rev, orders in raw:
        coords = VN_PROVINCE_COORDS.get(prov, (16.0, 106.0))
        points.append(GeoPoint(
            province=prov, lat=coords[0], lng=coords[1],
            customer_count=cust, revenue=rev, orders=orders,
            intensity=round(cust / max_cust, 3),
        ))
    return GeoResponse(
        total_customers=sum(r[1] for r in raw),
        total_provinces=len(raw),
        top_province="TP. Hồ Chí Minh",
        points=points,
        analysis_days=30,
        is_mock=True,
    )


@router.get(
    "",
    response_model=GeoResponse,
    summary="Phân bổ khách hàng theo tỉnh/thành (Geo Heatmap)",
    description=(
        "Trả về dữ liệu phân bổ khách hàng và doanh thu theo tỉnh/thành phố "
        "để hiển thị trên bản đồ nhiệt Việt Nam (Leaflet.js).\n\n"
        "**intensity**: 0.0–1.0, dùng để tô màu heatmap "
        "(tỉnh có nhiều khách nhất = 1.0)"
    ),
)
def get_geo_distribution(
    days:       int            = Query(default=30, ge=7, le=365),
    company_id: Optional[str] = Query(default=None),
    metric:     str            = Query(default="customers", description="customers|revenue|orders"),
):
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params: dict = {}
    if company_id:
        params["cid"] = company_id

    sql = f"""
        SELECT
            COALESCE(c.province, 'Không xác định') AS province,
            COUNT(DISTINCT c.customer_id)           AS customer_count,
            SUM(oi.subtotal)                        AS revenue,
            COUNT(DISTINCT o.order_id)              AS orders
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id  = o.order_id
        JOIN public.customers c    ON o.customer_id = c.customer_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
          {cmp_filter}
        GROUP BY COALESCE(c.province, 'Không xác định')
        ORDER BY customer_count DESC
    """
    df = query_df(sql, params or None)

    if df.empty:
        return _mock_geo()

    metric_col = {
        "customers": "customer_count",
        "revenue":   "revenue",
        "orders":    "orders",
    }.get(metric, "customer_count")

    max_val = float(df[metric_col].max()) if not df.empty else 1

    points: List[GeoPoint] = []
    for _, row in df.iterrows():
        prov   = str(row["province"])
        coords = VN_PROVINCE_COORDS.get(prov, None)
        if coords is None:
            # Fuzzy match tên tỉnh
            for key in VN_PROVINCE_COORDS:
                if key.replace("TP. ", "").lower() in prov.lower() or prov.lower() in key.lower():
                    coords = VN_PROVINCE_COORDS[key]
                    break
            if coords is None:
                coords = (16.0, 106.0)   # Fallback: trung tâm VN

        intensity = round(float(row[metric_col]) / max_val, 3) if max_val > 0 else 0
        points.append(GeoPoint(
            province=prov,
            lat=coords[0], lng=coords[1],
            customer_count=int(row["customer_count"]),
            revenue=float(row["revenue"]),
            orders=int(row["orders"]),
            intensity=intensity,
        ))

    top = points[0].province if points else ""
    return GeoResponse(
        total_customers=int(df["customer_count"].sum()),
        total_provinces=len(points),
        top_province=top,
        points=points,
        analysis_days=days,
        is_mock=False,
    )
