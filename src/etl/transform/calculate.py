# -*- coding: utf-8 -*-
"""
Calculate – Tính toán các metrics tài chính trước khi load vào fact_sales.

Metrics được tính:
  - gross_revenue    = unit_price × quantity (trước giảm giá)
  - discount_amount  = (unit_price - discounted_price) × quantity
  - net_revenue      = gross_revenue - discount_amount
  - cost_amount      = cost_price × quantity  (nếu có dữ liệu)
  - gross_profit     = net_revenue - cost_amount
  - profit_margin    = gross_profit / net_revenue × 100  (%)
  - shipping_fee     = từ order-level data

Bổ sung (Mức 2):
  RelevanceCalculator – Tính relevance_score cho raw_google_data đã normalize.
"""
import logging
import os
from typing import Dict, List, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("etl.transform.calculate")


def safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Chia an toàn, trả về default nếu denominator = 0."""
    if denominator == 0:
        return default
    return numerator / denominator


def calculate_item_metrics(
    item: Dict,
    cost_price: float = 0.0,
    shipping_fee: float = 0.0,
) -> Dict:
    """
    Tính toán metrics tài chính cho một item trong đơn hàng.

    Args:
        item: dict chứa quantity, unit_price, discounted_price
        cost_price: giá vốn của sản phẩm (từ bảng products)
        shipping_fee: phí vận chuyển phân bổ (nếu có)

    Returns:
        dict chứa tất cả measures cho fact_sales
    """
    qty             = max(int(item.get("quantity", 1) or 1), 1)
    unit_price      = float(item.get("unit_price", 0) or 0)
    discounted_price = float(item.get("discounted_price") or unit_price)

    # Doanh thu gộp: giá gốc × số lượng
    gross_revenue  = round(unit_price * qty, 2)

    # Giảm giá: (giá gốc - giá sau giảm) × số lượng
    discount_amount = round((unit_price - discounted_price) * qty, 2)
    discount_amount = max(discount_amount, 0)  # Không âm

    # Doanh thu thuần
    net_revenue = round(gross_revenue - discount_amount, 2)

    # Giá vốn (nếu có)
    cost_amount = round(cost_price * qty, 2)

    # Lợi nhuận gộp
    gross_profit = round(net_revenue - cost_amount, 2)

    # Tỷ lệ lợi nhuận (%)
    profit_margin = (
        round(safe_div(gross_profit, net_revenue) * 100, 4)
        if net_revenue > 0 else None
    )

    return {
        "order_count":    1,
        "item_quantity":  qty,
        "gross_revenue":  gross_revenue,
        "discount_amount": discount_amount,
        "net_revenue":    net_revenue,
        "cost_amount":    cost_amount,
        "gross_profit":   gross_profit,
        "profit_margin":  profit_margin,
        "shipping_fee":   round(shipping_fee, 2),
        "return_count":   0,
        "return_amount":  0.0,
    }


def calculate_shopee(rows: List[Dict], product_costs: Dict[str, float] = None) -> List[Dict]:
    """
    Tính toán metrics cho danh sách đơn hàng Shopee đã normalize.

    Mỗi item trong một đơn → một bản ghi riêng trong fact_sales.

    Args:
        rows: danh sách đơn hàng đã normalize
        product_costs: dict {sku: cost_price} để tính giá vốn

    Returns:
        list[dict] – Danh sách fact records sẵn sàng load vào DW
    """
    product_costs = product_costs or {}
    fact_records  = []

    for order in rows:
        items        = order.get("items_normalized", [])
        shipping_fee = float(order.get("actual_shipping_fee", 0) or 0)
        # Phân bổ phí vận chuyển đều cho các item
        fee_per_item = safe_div(shipping_fee, len(items)) if items else 0

        for item in items:
            sku        = item.get("sku", "")
            cost_price = product_costs.get(sku, 0.0)
            metrics    = calculate_item_metrics(item, cost_price, fee_per_item)

            fact_records.append({
                # Keys để lookup dim tables
                "_source":          "shopee",
                "_staging_id":      order.get("id"),
                "_external_order_id": f"SHOPEE-{order.get('order_sn', '')}-{item.get('item_id', '')}",
                "_order_date":      order.get("create_time"),
                "_customer_name":   order.get("customer_name", ""),
                "_customer_phone":  order.get("customer_phone"),
                "_province":        order.get("province", ""),
                "_region":          order.get("region", ""),
                "_product_sku":     sku,
                "_product_name":    item.get("item_name", ""),
                "_channel_name":    "shopee",
                "_payment_method":  order.get("payment_method_normalized", "COD"),
                "_status":          order.get("status_normalized", "DELIVERED"),
                # Measures
                **metrics,
            })

    logger.info(f"Calculate Shopee: {len(rows)} đơn → {len(fact_records)} fact records")
    return fact_records


def calculate_lazada(rows: List[Dict], product_costs: Dict[str, float] = None) -> List[Dict]:
    """Tính toán metrics cho đơn hàng Lazada."""
    product_costs = product_costs or {}
    fact_records  = []

    for order in rows:
        items = order.get("items_normalized", [])
        for item in items:
            sku        = item.get("sku", "")
            cost_price = product_costs.get(sku, 0.0)
            metrics    = calculate_item_metrics(item, cost_price, 0.0)

            fact_records.append({
                "_source":          "lazada",
                "_staging_id":      order.get("id"),
                "_external_order_id": f"LAZADA-{order.get('order_id', '')}-{item.get('item_id', '')}",
                "_order_date":      order.get("created_at"),
                "_customer_name":   order.get("customer_name", ""),
                "_customer_phone":  order.get("customer_phone"),
                "_province":        order.get("province", ""),
                "_region":          order.get("region", ""),
                "_product_sku":     sku,
                "_product_name":    item.get("item_name", ""),
                "_channel_name":    "lazada",
                "_payment_method":  order.get("payment_method_normalized", "TRANSFER"),
                "_status":          order.get("status_normalized", "DELIVERED"),
                **metrics,
            })

    logger.info(f"Calculate Lazada: {len(rows)} đơn → {len(fact_records)} fact records")
    return fact_records


def calculate_dispatch(
    source: str,
    rows: List[Dict],
    product_costs: Dict[str, float] = None,
) -> List[Dict]:
    """Dispatch calculate theo nguồn."""
    fn_map = {
        "shopee": calculate_shopee,
        "lazada": calculate_lazada,
    }
    fn = fn_map.get(source)
    if not fn:
        logger.warning(f"Không có calculate function cho source='{source}'")
        return []
    return fn(rows, product_costs)


# ══════════════════════════════════════════════════════════════════════════════
# RelevanceCalculator – Tính điểm relevance cho raw_google_data (Mức 2)
# ══════════════════════════════════════════════════════════════════════════════

class RelevanceCalculator:
    """
    Tính relevance_score cho raw_google_data đã qua normalize.

    Công thức:
        +3 nếu keyword xuất hiện trong title
        +1 nếu keyword xuất hiện trong snippet
        +2 nếu position <= 3 (top 3 kết quả tìm kiếm)
    """

    def __init__(self, db_url: str = ""):
        self.db_url = db_url or os.getenv("DATABASE_URL", "")
        if not self.db_url:
            logger.warning("RelevanceCalculator: DATABASE_URL chưa cấu hình")

    def _get_conn(self):
        return psycopg2.connect(self.db_url)

    def add_missing_columns(self) -> None:
        """Thêm cột relevance_score int default 0 nếu chưa có."""
        if not self.db_url:
            return
        try:
            conn = self._get_conn()
            conn.autocommit = True
            cur  = conn.cursor()
            cur.execute(
                "ALTER TABLE public.raw_google_data "
                "ADD COLUMN IF NOT EXISTS relevance_score INT DEFAULT 0"
            )
            cur.close()
            conn.close()
            logger.info("RelevanceCalculator.add_missing_columns hoàn thành")
        except Exception as e:
            logger.error("add_missing_columns lỗi: %s", e, exc_info=True)

    def calculate_google_relevance(self, keywords: list) -> int:
        """
        Tính relevance_score cho raw_google_data đã normalize.

        Điều kiện: normalized_at IS NOT NULL

        Scoring:
            +3 nếu keyword trong title
            +1 nếu keyword trong snippet
            +2 nếu position <= 3

        Args:
            keywords: Danh sách từ khóa để tính score.

        Returns:
            int: Số bản ghi đã tính score.
        """
        if not self.db_url or not keywords:
            return 0

        count = 0
        try:
            conn = self._get_conn()
            cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            cur.execute("""
                SELECT id, keyword, title, snippet, position
                FROM   public.raw_google_data
                WHERE  normalized_at IS NOT NULL
                ORDER BY scraped_at ASC
            """)
            rows = cur.fetchall()
            logger.info("calculate_google_relevance: %d bản ghi cần tính", len(rows))

            update_cur = conn.cursor()
            for row in rows:
                title   = (row["title"]   or "").lower()
                snippet = (row["snippet"] or "").lower()
                pos     = row["position"] or 99

                score = 0
                for kw in keywords:
                    kw_lower = kw.lower()
                    if kw_lower in title:
                        score += 3
                    if kw_lower in snippet:
                        score += 1
                # Bonus top 3
                if pos <= 3:
                    score += 2

                update_cur.execute(
                    "UPDATE public.raw_google_data SET relevance_score = %s WHERE id = %s",
                    (score, row["id"]),
                )
                count += 1

            conn.commit()
            cur.close()
            update_cur.close()
            conn.close()
            logger.info("calculate_google_relevance hoàn thành: %d bản ghi", count)

        except Exception as e:
            logger.error("calculate_google_relevance lỗi: %s", e, exc_info=True)

        return count
