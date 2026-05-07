# -*- coding: utf-8 -*-
"""
VNPayConnector – Kết nối VNPay Payment Gateway API.

Tài liệu: https://sandbox.vnpayment.vn/apis/docs/truy-van-ket-qua-thanh-toan/
Auth: HMAC-SHA512 signature
Dữ liệu: Lịch sử giao dịch thanh toán (Query DR)

Lưu ý: VNPay dùng chủ yếu để query lịch sử, không phải real-time webhook.
"""
import os
import time
import hashlib
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, List

from dotenv import load_dotenv
from ..base.base_connector import BaseConnector, AuthError

load_dotenv()

VNPAY_URL = os.getenv("VNPAY_URL", "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction")


class VNPayConnector(BaseConnector):
    """
    Connector cho VNPay – query lịch sử giao dịch.
    company_id bắt buộc → tmn_code và secret_key lấy từ bảng integrations.
    Signature: HMAC-SHA512 trên sorted params.
    """

    def __init__(self, company_id: str):
        super().__init__(
            channel_name="vnpay",
            company_id=company_id,
            rate_limit_calls=5,
            rate_limit_period=1.0,
        )
        # Credentials VNPay: lấy từ DB theo company_id
        from .integration_repository import IntegrationRepository
        from .exceptions import IntegrationNotFoundError
        self._repo        = IntegrationRepository()
        self._integration = self._repo.get_integration(company_id, "vnpay")
        if not self._integration:
            raise IntegrationNotFoundError(company_id, "vnpay")

        cfg             = self._integration.get("additional_config") or {}
        self.tmn_code   = self._integration["account_id"]    # VNPay TmnCode = account_id
        self.secret_key = self._integration["access_token"]  # secret_key lưu ở access_token

    def _sign(self, params: Dict) -> str:
        """
        Tạo signature VNPay:
        1. Sort params theo key (loại bỏ vnp_SecureHash)
        2. URL encode thành query string
        3. HMAC-SHA512 với secret_key
        """
        sorted_p  = sorted(
            [(k, v) for k, v in params.items() if k != "vnp_SecureHash"]
        )
        query_str = urllib.parse.urlencode(sorted_p)
        return self.hmac_sha512(self.secret_key, query_str)

    def authenticate(self) -> None:
        if not self.tmn_code or not self.secret_key:
            raise AuthError("VNPAY_TMN_CODE hoặc VNPAY_SECRET_KEY chưa được cấu hình")
        self.logger.info(f"VNPay configured: TmnCode={self.tmn_code}")

    def refresh_token(self) -> None:
        """VNPay không dùng token – không cần refresh."""
        pass

    def query_transaction(self, order_id: str, transaction_date: str) -> Dict:
        """
        Query kết quả một giao dịch theo mã đơn hàng.
        transaction_date: format yyyyMMddHHmmss
        """
        self.authenticate()
        params = {
            "vnp_RequestId":      f"QR{int(time.time())}",
            "vnp_Version":        "2.1.0",
            "vnp_Command":        "querydr",
            "vnp_TmnCode":        self.tmn_code,
            "vnp_TxnRef":         order_id,
            "vnp_OrderInfo":      f"Query order {order_id}",
            "vnp_TransactionDate": transaction_date,
            "vnp_CreateDate":     datetime.now().strftime("%Y%m%d%H%M%S"),
            "vnp_IpAddr":         "127.0.0.1",
        }
        params["vnp_SecureHash"] = self._sign(params)

        resp = self.post(VNPAY_URL, json=params)
        self.logger.debug(f"VNPay query {order_id}: {resp.get('vnp_ResponseCode')}")
        return resp

    def sync_orders(self, lookback_days: int = 7) -> int:
        """
        VNPay không có API lấy danh sách giao dịch theo khoảng thời gian.
        Lịch sử giao dịch được lấy từ VNPay Merchant Portal (file CSV/Excel)
        hoặc qua webhook notification.
        Connector này hỗ trợ query từng giao dịch theo order_id.
        """
        self.logger.info(
            "VNPay: sync lịch sử giao dịch thông qua webhook hoặc import file từ Merchant Portal. "
            "Dùng ExcelImporter để import file báo cáo giao dịch VNPay."
        )
        return 0
