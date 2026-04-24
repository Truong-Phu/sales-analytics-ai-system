# -*- coding: utf-8 -*-
"""
QueryEngine – Truy vấn dữ liệu liên quan từ nhiều nguồn để cung cấp context cho AI.

Pipeline:
    1. extract_keywords(question) → trích xuất từ khóa bằng underthesea (nếu có)
    2. search_dw_external(keywords) → tìm trong dim_external_source (DW, Mức 2 - ưu tiên)
    3. search_google_data(keywords) → fallback tìm raw_google_data (Mức 1)
    4. search_facebook_data(keywords) → tìm raw_facebook_data
    5. search_sales_data(keywords) → tổng hợp số liệu từ OLTP
    6. get_context(question) → gọi tất cả nguồn, trả về dict context

Context này được endpoint /recommendation dùng để gửi lên AI.
"""

import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


# ── Normalize tiếng Việt ─────────────────────────────────────────────────────

def remove_accents(text: str) -> str:
    """
    Chuyển chuỗi tiếng Việt có dấu → không dấu để so sánh.
    Ví dụ: "bán chạy" → "ban chay", "sản phẩm" → "san pham"
    Không cần cài thư viện ngoài – dùng unicodedata chuẩn.
    """
    nfd = unicodedata.normalize("NFD", text)
    # Loại bỏ các combining characters (dấu thanh, dấu phụ)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


# ── Tải stopwords từ file ────────────────────────────────────────────────────
def _load_stopwords() -> set:
    """
    Tải danh sách stopwords tiếng Việt từ file data/stopwords_vi.txt.
    Fallback về hardcoded set nếu file không tồn tại.
    """
    stopwords_path = Path(__file__).parent / "data" / "stopwords_vi.txt"
    if stopwords_path.exists():
        words = set()
        for line in stopwords_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                words.add(line.lower())
        logger.debug("Đã tải %d stopwords từ %s", len(words), stopwords_path)
        return words
    # Fallback hardcoded
    return {
        "là", "có", "được", "và", "của", "trong", "cho", "với", "tôi", "bạn",
        "hệ", "thống", "đang", "sẽ", "nào", "gì", "không", "như", "thế", "này",
        "về", "từ", "lên", "xuống", "ra", "vào", "đó", "đây", "khi", "mà",
        "nhất", "hơn", "rất", "thì", "cũng", "đã", "để", "hay", "hoặc", "theo",
        "các", "những", "một", "hai", "ba", "nhiều", "ít", "tất", "cả", "mọi",
        "ai", "giai", "đoạn", "qua", "lại", "còn", "nên", "phải", "cần", "muốn",
    }

_VI_STOPWORDS = _load_stopwords()

# ── Kiểm tra underthesea ─────────────────────────────────────────────────────
try:
    from underthesea import word_tokenize as _underthesea_tokenize
    _HAS_UNDERTHESEA = True
    logger.info("underthesea đã sẵn sàng – dùng word_tokenize cho tiếng Việt")
except ImportError:
    _HAS_UNDERTHESEA = False
    logger.warning("underthesea chưa cài – fallback về simple tokenizer")


class QueryEngine:
    """
    Truy vấn dữ liệu liên quan từ PostgreSQL để xây dựng context cho AI.

    Sử dụng connection string từ biến môi trường DATABASE_URL.
    """

    def __init__(self):
        """Khởi tạo, kết nối PostgreSQL từ DATABASE_URL trong .env."""
        self.db_url = os.getenv("DATABASE_URL", "")
        if not self.db_url:
            logger.warning(
                "DATABASE_URL chưa cấu hình – QueryEngine sẽ trả về kết quả rỗng"
            )

    def _get_conn(self):
        """Tạo kết nối PostgreSQL mới. Ném lỗi nếu không kết nối được."""
        return psycopg2.connect(
            self.db_url,
            cursor_factory=psycopg2.extras.RealDictCursor,
        )

    # ── Trích xuất từ khóa ───────────────────────────────────────────────────

    def extract_keywords(self, question: str) -> list[str]:
        """
        Trích xuất từ khóa từ câu hỏi của người dùng.

        Thuật toán (theo thứ tự ưu tiên):
            1. underthesea.word_tokenize → tách từ tiếng Việt chuẩn (ghép cụm từ)
               Ví dụ: "bán chạy nhất" → ["bán chạy", "nhất"]
            2. Fallback: tách theo khoảng trắng nếu underthesea chưa cài
            3. Lọc stopwords từ data/stopwords_vi.txt
            4. Giữ lại token >= 2 ký tự

        Ví dụ:
            "Sản phẩm nào đang bán chạy nhất?"
            → underthesea: ["sản phẩm", "bán chạy"]  (lọc bỏ "nào", "đang", "nhất")
            → fallback:    ["sản", "phẩm", "bán", "chạy"]

        Args:
            question: Câu hỏi tự nhiên của người dùng.

        Returns:
            List[str]: Danh sách từ khóa đã lọc.
        """
        if not question:
            return []

        # Loại bỏ ký tự đặc biệt, giữ chữ cái tiếng Việt và số
        cleaned = re.sub(r"[^\w\s]", " ", question.lower(), flags=re.UNICODE).strip()

        if _HAS_UNDERTHESEA:
            # underthesea tách từ → nhận diện cụm từ ghép tiếng Việt
            try:
                raw_tokens = _underthesea_tokenize(cleaned)
                # word_tokenize trả về list token, token cụm có dấu cách
                tokens = [t.strip() for t in raw_tokens if t.strip()]
            except Exception as e:
                logger.warning("underthesea lỗi: %s – fallback simple split", e)
                tokens = cleaned.split()
        else:
            tokens = cleaned.split()

        # Lọc stopwords và token ngắn (>= 2 ký tự)
        keywords = [
            t for t in tokens
            if t.lower() not in _VI_STOPWORDS and len(t) >= 2
        ]

        # Dedup giữ thứ tự xuất hiện, thêm phiên bản không dấu để tăng coverage
        seen = set()
        unique_kws = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique_kws.append(kw)
            # Thêm phiên bản không dấu nếu khác với bản gốc
            kw_no_accent = remove_accents(kw)
            if kw_no_accent != kw and kw_no_accent not in seen:
                seen.add(kw_no_accent)
                unique_kws.append(kw_no_accent)

        logger.debug("Câu hỏi: '%s' → Từ khóa: %s", question, unique_kws)
        return unique_kws[:10]  # Giới hạn 10 từ khóa

    # ── Tìm kiếm Google data (raw – Mức 1 fallback) ────────────────────────────

    def search_google_data(self, keywords: list[str]) -> list[dict]:
        """
        Tìm kiếm trong bảng raw_google_data bằng ILIKE OR.

        Logic:
            1. Xây dựng điều kiện ILIKE OR trên title, snippet, keyword
               cho từng keyword (OR giữa các keyword → match bất kỳ)
            2. Scoring: +2 title match, +1 snippet match, +1 top 3 position
            3. Nếu không tìm được → fallback lấy 10 bản ghi mới nhất

        Không dùng FTS (plainto_tsquery và tiếng Việt có dấu không tương thích
        tốt với 'simple' dictionary — chỉ AND match, không OR, không normalize diacritics).
        Dùng unaccent() PostgreSQL để so sánh không phân biệt dấu tiếng Việt.

        Args:
            keywords: Danh sách từ khóa cần tìm (có thể có/không có dấu tiếng Việt).

        Returns:
            List[dict]: tối đa 10 kết quả liên quan nhất.
        """
        if not self.db_url:
            return []

        results = []
        try:
            conn = self._get_conn()
            cur  = conn.cursor()

            # Dùng tối đa 5 keywords đầu tiên, mỗi keyword dùng phiên bản không dấu
            kw_list = keywords[:5] if keywords else []

            if kw_list:
                conditions = []
                params     = []
                for kw in kw_list:
                    # unaccent() normalize cả cột lẫn keyword → match dù có/không dấu
                    conditions.append(
                        "(unaccent(lower(title))   ILIKE unaccent(lower(%s))"
                        " OR unaccent(lower(snippet)) ILIKE unaccent(lower(%s))"
                        " OR unaccent(lower(keyword)) ILIKE unaccent(lower(%s)))"
                    )
                    params += [f"%{kw}%", f"%{kw}%", f"%{kw}%"]

                # Scoring params dùng keyword đầu tiên (không dấu để đồng nhất)
                first_kw = kw_list[0]
                score_params = [f"%{first_kw}%", f"%{first_kw}%"]

                where = " OR ".join(conditions)
                sql = f"""
                    SELECT id, keyword, title, snippet, url, position,
                           scraped_at::text AS scraped_at,
                           COALESCE(is_processed, false) AS is_processed,
                           (
                               CASE WHEN unaccent(lower(title))   ILIKE unaccent(lower(%s)) THEN 2 ELSE 0 END +
                               CASE WHEN unaccent(lower(snippet)) ILIKE unaccent(lower(%s)) THEN 1 ELSE 0 END +
                               CASE WHEN COALESCE(position, 99) <= 3 THEN 1 ELSE 0 END
                           ) AS score
                    FROM   public.raw_google_data
                    WHERE  {where}
                    ORDER BY is_processed DESC, score DESC, scraped_at DESC
                    LIMIT  10
                """
                cur.execute(sql, score_params + params)
                rows    = cur.fetchall()
                results = [dict(r) for r in rows]
                logger.debug("search_google_data unaccent ILIKE: %d kết quả", len(results))

            # Fallback: không có kết quả → lấy 10 bản ghi mới nhất
            if not results:
                logger.info("search_google_data: không match keyword → fallback 10 mới nhất")
                cur.execute("""
                    SELECT id, keyword, title, snippet, url, position,
                           scraped_at::text AS scraped_at,
                           COALESCE(is_processed, false) AS is_processed,
                           0 AS score
                    FROM   public.raw_google_data
                    ORDER BY scraped_at DESC
                    LIMIT  10
                """)
                rows    = cur.fetchall()
                results = [dict(r) for r in rows]
                logger.debug("search_google_data fallback: %d bản ghi mới nhất", len(results))

            cur.close()
            conn.close()

        except psycopg2.OperationalError as e:
            logger.error("Lỗi kết nối DB khi search_google_data: %s", e)
        except Exception as e:
            logger.error("Lỗi search_google_data: %s", e, exc_info=True)

        return results

    # ── Tìm kiếm Facebook data ───────────────────────────────────────────────

    def search_facebook_data(self, keywords: list[str]) -> list[dict]:
        """
        Tìm kiếm trong bảng raw_facebook_data.

        Tìm trong post_content và comments (JSONB text search).

        Args:
            keywords: Danh sách từ khóa cần tìm.

        Returns:
            List[dict]: [{id, page_name, post_content, reactions_count, post_date}]
        """
        if not keywords or not self.db_url:
            return []

        results = []
        try:
            conn = self._get_conn()
            cur  = conn.cursor()

            conditions = []
            params     = []
            for kw in keywords[:5]:
                conditions.append(
                    "(post_content ILIKE %s OR comments::text ILIKE %s)"
                )
                params += [f"%{kw}%", f"%{kw}%"]

            where_clause = " OR ".join(conditions) if conditions else "TRUE"

            sql = f"""
                SELECT id, page_name, post_id,
                       LEFT(post_content, 300) AS post_content,
                       reactions_count,
                       post_date::text AS post_date,
                       scraped_at::text AS scraped_at
                FROM   public.raw_facebook_data
                WHERE  {where_clause}
                ORDER BY scraped_at DESC
                LIMIT  10
            """
            cur.execute(sql, params)
            rows    = cur.fetchall()
            results = [dict(r) for r in rows]

            cur.close()
            conn.close()
            logger.debug(
                "search_facebook_data: %d kết quả cho %s", len(results), keywords
            )

        except psycopg2.OperationalError as e:
            logger.error("Lỗi kết nối DB khi search_facebook_data: %s", e)
        except Exception as e:
            logger.error("Lỗi search_facebook_data: %s", e, exc_info=True)

        return results

    # ── Tổng hợp số liệu bán hàng ────────────────────────────────────────────

    def search_sales_data(self, keywords: list[str]) -> dict:
        """
        Tổng hợp số liệu từ các bảng OLTP: orders, products, order_items.

        Trả về summary: tổng doanh thu, top sản phẩm, đơn hàng gần đây.
        Keywords dùng để lọc theo tên sản phẩm nếu có liên quan.

        Args:
            keywords: Từ khóa (có thể dùng để lọc tên sản phẩm).

        Returns:
            dict: {total_revenue_30d, order_count_30d, top_products, recent_orders}
        """
        if not self.db_url:
            return {}

        summary = {}
        try:
            conn = self._get_conn()
            cur  = conn.cursor()

            # Tự động mở rộng date range để bắt được dữ liệu demo:
            # 30 ngày → 90 ngày → 365 ngày, dừng khi có dữ liệu
            date_ranges = [30, 90, 365]
            actual_days = 30
            order_count = 0

            for days in date_ranges:
                cur.execute(
                    "SELECT COUNT(*) AS cnt FROM public.orders "
                    "WHERE status = 'DELIVERED' "
                    "  AND order_date >= CURRENT_DATE - INTERVAL '%s days'",
                    (days,),
                )
                row_cnt      = cur.fetchone()
                count        = row_cnt["cnt"] if row_cnt else 0
                actual_days  = days
                order_count  = count
                if count > 0:
                    break   # Tìm thấy dữ liệu trong cửa sổ này

            if order_count == 0:
                logger.info("search_sales_data: không có đơn DELIVERED nào")
            else:
                logger.info(
                    "search_sales_data: dùng cửa sổ %d ngày (%d đơn)", actual_days, order_count
                )

            # 1. Tổng doanh thu và số đơn (trong cửa sổ đã xác định)
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(net_amount), 0)::float  AS total_revenue,
                    COUNT(*)                              AS order_count,
                    COALESCE(AVG(net_amount), 0)::float  AS avg_order_value
                FROM public.orders
                WHERE order_date >= CURRENT_DATE - INTERVAL '%s days'
                  AND status = 'DELIVERED'
                """,
                (actual_days,),
            )
            row = cur.fetchone()
            if row:
                summary["total_revenue_30d"] = round(row["total_revenue"], 0)
                summary["order_count_30d"]   = row["order_count"]
                summary["avg_order_value"]   = round(row["avg_order_value"], 0)
                summary["date_range_days"]   = actual_days  # Cho frontend biết cửa sổ thực tế

            # 2. Top 5 sản phẩm bán chạy nhất (cùng cửa sổ)
            cur.execute(
                """
                SELECT
                    p.product_name,
                    SUM(oi.quantity)        AS qty_sold,
                    SUM(oi.subtotal)::float AS revenue
                FROM public.order_items oi
                JOIN public.products    p  ON oi.product_id = p.product_id
                JOIN public.orders      o  ON oi.order_id   = o.order_id
                WHERE o.order_date >= CURRENT_DATE - INTERVAL '%s days'
                  AND o.status = 'DELIVERED'
                GROUP BY p.product_name
                ORDER BY qty_sold DESC
                LIMIT 5
                """,
                (actual_days,),
            )
            rows = cur.fetchall()
            summary["top_products"] = [
                {
                    "name":     r["product_name"],
                    "qty_sold": r["qty_sold"],
                    "revenue":  round(r["revenue"], 0),
                }
                for r in rows
            ]

            # 3. Đơn hàng gần nhất (5 đơn – không lọc theo date range)
            cur.execute("""
                SELECT
                    o.order_code,
                    c.full_name    AS customer_name,
                    o.net_amount::float,
                    o.status,
                    o.order_date::text
                FROM public.orders   o
                JOIN public.customers c ON o.customer_id = c.customer_id
                ORDER BY o.order_date DESC
                LIMIT 5
            """)
            rows = cur.fetchall()
            summary["recent_orders"] = [dict(r) for r in rows]

            cur.close()
            conn.close()

        except psycopg2.OperationalError as e:
            logger.error("Lỗi kết nối DB khi search_sales_data: %s", e)
        except Exception as e:
            logger.error("Lỗi search_sales_data: %s", e, exc_info=True)

        return summary

    # ── Tìm kiếm Data Warehouse (Mức 2 – ưu tiên) ──────────────────────────────

    def search_dw_external(self, keywords: list[str]) -> list[dict]:
        """
        Tìm kiếm trong bảng dim_external_source (Data Warehouse – Mức 2).

        Dữ liệu đã qua clean + normalize + relevance scoring.
        Chỉ lấy bản ghi từ 30 ngày gần nhất, sắp xếp theo relevance_score.

        Nếu không tìm được kết quả khớp keyword → fallback lấy 10 mới nhất
        trong 30 ngày (đảm bảo luôn có context cho AI khi DW đã có dữ liệu).

        Args:
            keywords: Danh sách từ khóa cần tìm.

        Returns:
            List[dict]: [{source_id, source_type, keyword, title, content,
                          url, relevance_score, collected_date}]
        """
        if not self.db_url:
            return []

        results = []
        try:
            conn = self._get_conn()
            cur  = conn.cursor()

            kw_list = keywords[:5] if keywords else []

            if kw_list:
                conditions = []
                params     = []
                for kw in kw_list:
                    conditions.append(
                        "(title ILIKE %s OR content ILIKE %s OR keyword ILIKE %s)"
                    )
                    params += [f"%{kw}%", f"%{kw}%", f"%{kw}%"]

                where = " OR ".join(conditions)
                sql = f"""
                    SELECT source_id, source_type, keyword, title,
                           LEFT(content, 300) AS content,
                           url, relevance_score,
                           collected_date::text AS collected_date
                    FROM   public.dim_external_source
                    WHERE  ({where})
                      AND  collected_date >= CURRENT_DATE - INTERVAL '30 days'
                    ORDER BY relevance_score DESC, collected_date DESC
                    LIMIT  10
                """
                cur.execute(sql, params)
                rows    = cur.fetchall()
                results = [dict(r) for r in rows]
                logger.debug("search_dw_external ILIKE: %d kết quả", len(results))

            # Fallback: không match keyword → lấy 10 bản ghi có score cao nhất
            if not results:
                logger.info(
                    "search_dw_external: không match keyword → fallback top relevance"
                )
                cur.execute("""
                    SELECT source_id, source_type, keyword, title,
                           LEFT(content, 300) AS content,
                           url, relevance_score,
                           collected_date::text AS collected_date
                    FROM   public.dim_external_source
                    WHERE  collected_date >= CURRENT_DATE - INTERVAL '30 days'
                    ORDER BY relevance_score DESC, collected_date DESC
                    LIMIT  10
                """)
                rows    = cur.fetchall()
                results = [dict(r) for r in rows]
                logger.debug("search_dw_external fallback: %d bản ghi top score", len(results))

            cur.close()
            conn.close()
            logger.debug(
                "search_dw_external: %d kết quả từ DW cho %s", len(results), keywords
            )

        except psycopg2.OperationalError as e:
            logger.error("Lỗi kết nối DB khi search_dw_external: %s", e)
        except Exception as e:
            logger.debug("search_dw_external không khả dụng: %s", e)

        return results

    # ── Entry point ──────────────────────────────────────────────────────────

    def get_context(self, question: str) -> dict:
        """
        Tổng hợp context từ nhiều nguồn dữ liệu để gửi lên AI.

        Pipeline (theo thứ tự ưu tiên):
            extract_keywords
            → search_dw_external (Mức 2 – dữ liệu sạch, ưu tiên)
            → search_google_data (Mức 1 fallback nếu DW chưa có dữ liệu)
            → search_facebook_data
            → search_sales_data

        Args:
            question: Câu hỏi tự nhiên của người dùng.

        Returns:
            dict: {
                question, keywords,
                dw_results,           # Từ DW (Mức 2) – ưu tiên
                google_results,       # Raw (Mức 1) – fallback
                facebook_results,
                sales_summary,
                data_level,           # "level2", "level1", hoặc "level0"
                retrieved_at
            }
        """
        keywords = self.extract_keywords(question)

        # Mức 2: Thử DW trước
        dw_results = self.search_dw_external(keywords)

        # Mức 1: Fallback nếu DW chưa có dữ liệu
        google_results = []
        if not dw_results:
            google_results = self.search_google_data(keywords)
            if google_results:
                data_level = "level1"
                logger.info(
                    "get_context: DW chưa có dữ liệu → fallback raw_google_data"
                )
            else:
                # Mức 0: Cả DW lẫn raw đều trống – AI chỉ dựa vào sales_summary
                data_level = "level0"
                logger.warning(
                    "get_context: Không có dữ liệu ngoài (DW + Google đều rỗng) → level0"
                )
        else:
            data_level = "level2"

        facebook_results = self.search_facebook_data(keywords)
        sales_summary    = self.search_sales_data(keywords)

        context = {
            "question":         question,
            "keywords":         keywords,
            "dw_results":       dw_results,
            "google_results":   google_results,
            "facebook_results": facebook_results,
            "sales_summary":    sales_summary,
            "data_level":       data_level,
            "retrieved_at":     datetime.now(timezone.utc).isoformat(),
        }

        logger.info(
            "get_context cho '%s': dw=%d | google=%d | fb=%d | level=%s | sales=%s",
            question[:50],
            len(dw_results),
            len(google_results),
            len(facebook_results),
            data_level,
            "có dữ liệu" if sales_summary else "rỗng",
        )
        return context


# ── Chạy trực tiếp để test ──────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
    )
    engine  = QueryEngine()
    context = engine.get_context("sản phẩm bán chạy nhất")
    print(json.dumps(context, ensure_ascii=False, indent=2, default=str))
