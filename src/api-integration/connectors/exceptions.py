# -*- coding: utf-8 -*-
"""
Exceptions tùy chỉnh cho API Connectors.
"""


class IntegrationNotFoundError(Exception):
    """Không tìm thấy integration record cho company + platform trong DB."""

    def __init__(self, company_id: str, platform: str):
        self.company_id = company_id
        self.platform   = platform
        super().__init__(
            f"Chưa kết nối {platform} cho company {company_id}. "
            f"Vui lòng thêm integration trong Settings → Kênh bán hàng."
        )


class TokenExpiredError(Exception):
    """Access token hết hạn và không thể refresh tự động."""

    def __init__(self, platform: str, company_id: str = ""):
        self.platform   = platform
        self.company_id = company_id
        super().__init__(
            f"Token {platform} đã hết hạn"
            + (f" (company={company_id})" if company_id else "")
            + ". Vui lòng kết nối lại."
        )


class SyncError(Exception):
    """Lỗi trong quá trình đồng bộ dữ liệu."""

    def __init__(self, platform: str, message: str, company_id: str = ""):
        self.platform   = platform
        self.company_id = company_id
        super().__init__(f"[{platform}] Sync thất bại: {message}")
