# -*- coding: utf-8 -*-
"""
Market Basket Analysis – Phân tích sản phẩm hay mua chung.

Thuật toán: Apriori (mlxtend) → Association Rules
Output: Các cặp/nhóm sản phẩm thường xuất hiện cùng nhau trong 1 đơn hàng.
Ứng dụng: Gợi ý bundle, cross-sell, up-sell.

Hoàn toàn miễn phí – chỉ dùng mlxtend + pandas.
"""
import logging
from typing import List

import pandas as pd

from services.db_service import query_df

logger = logging.getLogger("ai.basket")


def _load_order_items(company_id: str = None, days: int = 180) -> pd.DataFrame:
    """Lấy dữ liệu order_items từ OLTP."""
    cmp_filter = "AND o.company_id = %(cid)s::uuid" if company_id else ""
    params = {"cid": company_id} if company_id else None

    sql = f"""
        SELECT
            o.order_id,
            p.product_name
        FROM public.order_items oi
        JOIN public.orders   o ON oi.order_id   = o.order_id
        JOIN public.products p ON oi.product_id = p.product_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURNED')
          AND o.order_date >= NOW() - INTERVAL '{int(days)} days'
          {cmp_filter}
    """
    return query_df(sql, params)


def _mock_basket_data() -> list:
    """Dữ liệu mẫu khi DB chưa có đủ đơn hàng."""
    return [
        {
            "antecedents": ["Áo thun nam"],
            "consequents": ["Quần short nam"],
            "support":     0.25,
            "confidence":  0.72,
            "lift":        2.4,
            "conviction":  3.1,
            "transactions": 45,
            "recommendation": "72% khách mua Áo thun nam cũng mua Quần short nam → tạo bundle giảm 5%",
        },
        {
            "antecedents": ["Váy hoa nữ"],
            "consequents": ["Băng đô thời trang"],
            "support":     0.18,
            "confidence":  0.65,
            "lift":        3.2,
            "conviction":  2.5,
            "transactions": 33,
            "recommendation": "65% khách mua Váy hoa nữ cũng mua Băng đô → đề xuất cross-sell",
        },
        {
            "antecedents": ["Giày sneaker"],
            "consequents": ["Tất cotton"],
            "support":     0.31,
            "confidence":  0.81,
            "lift":        2.1,
            "conviction":  4.2,
            "transactions": 58,
            "recommendation": "81% khách mua Giày sneaker cũng mua Tất cotton → hiển thị gợi ý ngay trang sản phẩm",
        },
    ]


def run_basket_analysis(
    company_id: str = None,
    days: int = 180,
    min_support: float = 0.001,  # 0.1% — đủ thấp để tìm được rules với dataset 2000+ đơn
    min_confidence: float = 0.1, # 10%
    min_lift: float = 1.0,
    top_n: int = 20,
) -> dict:
    """
    Chạy Apriori và trả về association rules.

    Args:
        min_support:    tần suất xuất hiện tối thiểu (2% đơn hàng)
        min_confidence: độ tin cậy tối thiểu (30%)
        min_lift:       lift tối thiểu (>1 = có mối quan hệ thực sự)
        top_n:          số rules trả về (sắp theo lift)

    Returns:
        dict với keys: total_transactions, total_rules, rules (list)
    """
    df = _load_order_items(company_id, days)
    n_orders = len(df["order_id"].unique()) if not df.empty else 0

    if df.empty or n_orders < 5:
        logger.info("Chua du don hang cho basket analysis: %d don (can >= 5 don co >= 2 san pham)", n_orders)
        return {
            "total_transactions": n_orders,
            "total_rules":        0,
            "rules":              [],
            "parameters": {
                "days":           days,
                "min_support":    min_support,
                "min_confidence": min_confidence,
                "min_lift":       min_lift,
            },
            "note": (
                f"Chưa đủ dữ liệu để phân tích sản phẩm hay mua chung. "
                f"Cần ít nhất 5 đơn hàng có từ 2 sản phẩm trở lên. "
                f"Hiện tại có {n_orders} đơn đủ điều kiện."
            ),
            "is_mock": False,
        }

    try:
        from mlxtend.frequent_patterns import apriori, association_rules
        from mlxtend.preprocessing import TransactionEncoder

        # Tạo danh sách transaction
        transactions = df.groupby("order_id")["product_name"].apply(list).tolist()
        total_txn = len(transactions)

        # Phát hiện: tất cả đơn chỉ có 1 sản phẩm → không thể tìm co-occurrence
        multi_item_count = sum(1 for t in transactions if len(t) > 1)
        if multi_item_count == 0:
            return {
                "total_transactions": total_txn,
                "total_rules": 0,
                "rules": [],
                "parameters": {
                    "days": days, "min_support": min_support,
                    "min_confidence": min_confidence, "min_lift": min_lift,
                },
                "note": (
                    f"Không tìm được rules: {total_txn} đơn hàng được phân tích nhưng "
                    "tất cả đều chỉ có 1 sản phẩm. "
                    "Market Basket Analysis cần đơn hàng có từ 2 sản phẩm trở lên để phát hiện pattern mua chung."
                ),
                "is_mock": False,
            }

        # Encode thành ma trận one-hot
        te = TransactionEncoder()
        te_array = te.fit_transform(transactions)
        df_encoded = pd.DataFrame(te_array, columns=te.columns_)

        # Tìm frequent itemsets
        frequent_itemsets = apriori(
            df_encoded,
            min_support=min_support,
            use_colnames=True,
            max_len=3,
        )

        if frequent_itemsets.empty:
            return {
                "total_transactions": total_txn,
                "total_rules":        0,
                "rules":              [],
                "parameters": {
                    "days": days, "min_support": min_support,
                    "min_confidence": min_confidence, "min_lift": min_lift,
                },
                "note": f"Không tìm thấy itemsets thường xuất hiện với min_support={min_support:.1%}. Thử giảm ngưỡng Min Confidence.",
                "is_mock": False,
            }

        # Sinh association rules
        rules = association_rules(
            frequent_itemsets,
            metric="lift",
            min_threshold=min_lift,
        )
        rules = rules[rules["confidence"] >= min_confidence]
        rules = rules.sort_values("lift", ascending=False).head(top_n)

        rules_list = []
        for _, row in rules.iterrows():
            ante = list(row["antecedents"])
            cons = list(row["consequents"])
            support    = round(float(row["support"]),    4)
            confidence = round(float(row["confidence"]), 4)
            lift       = round(float(row["lift"]),       2)
            conviction = round(float(row.get("conviction", 1.0)), 2)

            pct = round(confidence * 100, 1)
            ante_str = " + ".join(ante)
            cons_str = " + ".join(cons)
            recommendation = (
                f"{pct}% khách mua {ante_str} cũng mua {cons_str} "
                f"(lift={lift}x) → {'tạo bundle' if lift > 2 else 'đề xuất cross-sell'}"
            )

            rules_list.append({
                "antecedents":    ante,
                "consequents":    cons,
                "support":        support,
                "confidence":     confidence,
                "lift":           lift,
                "conviction":     conviction,
                "transactions":   int(support * total_txn),
                "recommendation": recommendation,
            })

        return {
            "total_transactions": total_txn,
            "total_rules":        len(rules_list),
            "rules":              rules_list,
            "parameters": {
                "days":           days,
                "min_support":    min_support,
                "min_confidence": min_confidence,
                "min_lift":       min_lift,
            },
            "note": f"Phân tích {total_txn} đơn hàng trong {days} ngày gần nhất",
            "is_mock": False,
        }

    except ImportError:
        logger.error("mlxtend chưa cài – chạy: pip install mlxtend>=0.23.0")
        return {
            "total_transactions": 0,
            "total_rules":        0,
            "rules":              _mock_basket_data(),
            "note":               "mlxtend chưa cài – đang dùng mock data. Chạy: pip install mlxtend",
            "is_mock":            True,
        }
    except Exception as e:
        logger.error("Basket analysis error: %s", e)
        return {
            "total_transactions": 0,
            "total_rules":        0,
            "rules":              [],
            "note":               f"Lỗi phân tích: {str(e)}",
            "is_mock":            False,
        }
