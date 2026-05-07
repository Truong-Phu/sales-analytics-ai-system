# -*- coding: utf-8 -*-
"""
IntegrationRepository – Truy vấn và cập nhật bảng public.integrations.

Cung cấp:
  - get_integration(company_id, platform) → trả về credentials đã decrypt
  - get_all_active(platform) → danh sách tất cả integration đang hoạt động
  - update_tokens(...)    → cập nhật token sau khi refresh
  - update_status(...)    → cập nhật trạng thái kết nối
  - log_sync(...)         → ghi kết quả sync lên cột last_sync_at / last_error
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..utils.db import get_conn
from ..utils.logger import get_logger
from .crypto_service import decrypt as _dec, encrypt as _enc

logger = get_logger("integration_repo")


class IntegrationRepository:
    """Truy cập bảng public.integrations."""

    # ── Read ─────────────────────────────────────────────────────────────────

    def get_integration(
        self, company_id: str, platform: str
    ) -> Optional[Dict[str, Any]]:
        """
        Trả về integration đang active của company + platform.
        access_token và refresh_token đã được giải mã.
        Trả về None nếu chưa kết nối.
        """
        sql = """
            SELECT id, company_id, platform, account_id, account_name,
                   access_token, refresh_token, token_expiry,
                   additional_config, status, is_active, last_sync_at
            FROM   public.integrations
            WHERE  company_id = %s::uuid
              AND  platform   = %s
              AND  is_active  = TRUE
            ORDER BY connected_at DESC NULLS LAST
            LIMIT 1
        """
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (company_id, platform))
                row = cur.fetchone()

        if row is None:
            return None

        return self._row_to_dict(row)

    def get_all_active(
        self, platform: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Lấy tất cả integrations đang hoạt động (tùy chọn lọc theo platform).
        Dùng cho scheduler để biết cần sync company nào.
        """
        if platform:
            sql    = "SELECT id,company_id,platform,account_id,account_name,access_token,refresh_token,token_expiry,additional_config,status,is_active,last_sync_at FROM public.integrations WHERE is_active=TRUE AND status='connected' AND platform=%s ORDER BY company_id,platform"
            params = (platform,)
        else:
            sql    = "SELECT id,company_id,platform,account_id,account_name,access_token,refresh_token,token_expiry,additional_config,status,is_active,last_sync_at FROM public.integrations WHERE is_active=TRUE AND status='connected' ORDER BY company_id,platform"
            params = ()

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._row_to_dict(r) for r in rows]

    # ── Write ─────────────────────────────────────────────────────────────────

    def update_tokens(
        self,
        integration_id: str,
        access_token: str,
        refresh_token: str,
        expiry: Optional[datetime] = None,
    ) -> None:
        """Lưu token mới (đã mã hóa) sau khi refresh thành công."""
        sql = """
            UPDATE public.integrations
               SET access_token  = %s,
                   refresh_token = %s,
                   token_expiry  = %s,
                   status        = 'connected',
                   updated_at    = NOW()
             WHERE id = %s::uuid
        """
        enc_access  = _enc(access_token)
        enc_refresh = _enc(refresh_token) if refresh_token else None
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (enc_access, enc_refresh, expiry, integration_id))
        logger.debug(f"Tokens updated: integration_id={integration_id}")

    def update_status(
        self,
        integration_id: str,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        """Cập nhật trạng thái kết nối (connected / error / expired / disconnected)."""
        sql = """
            UPDATE public.integrations
               SET status     = %s,
                   last_error = %s,
                   updated_at = NOW()
             WHERE id = %s::uuid
        """
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (status, error, integration_id))

    def log_sync(
        self,
        integration_id: str,
        company_id: str,
        status: str,
        records_synced: int,
        error: Optional[str] = None,
    ) -> None:
        """
        Ghi kết quả sync lên bảng integrations.
        Đồng thời update status nếu có lỗi.
        """
        sql = """
            UPDATE public.integrations
               SET last_sync_at = NOW(),
                   last_error   = %s,
                   status       = %s,
                   updated_at   = NOW()
             WHERE id = %s::uuid
        """
        final_status = "error" if error else "connected"
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (error, final_status, integration_id))

        logger.info(
            f"Sync log: integration={integration_id}, company={company_id}, "
            f"status={final_status}, records={records_synced}"
            + (f", error={error}" if error else "")
        )

    # ── Helper ────────────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_dict(row) -> Dict[str, Any]:
        """Chuyển row DB thành dict, giải mã tokens."""
        (
            rid, company_id, platform, account_id, account_name,
            access_token, refresh_token, token_expiry,
            additional_config, status, is_active, last_sync_at,
        ) = row

        return {
            "id":                str(rid),
            "company_id":        str(company_id),
            "platform":          platform,
            "account_id":        account_id or "",
            "account_name":      account_name or "",
            "access_token":      _dec(access_token) if access_token else "",
            "refresh_token":     _dec(refresh_token) if refresh_token else "",
            "token_expiry":      token_expiry,
            "additional_config": additional_config if isinstance(additional_config, dict) else (json.loads(additional_config) if additional_config else {}),
            "status":            status,
            "is_active":         is_active,
            "last_sync_at":      last_sync_at,
        }
