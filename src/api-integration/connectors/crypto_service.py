# -*- coding: utf-8 -*-
"""
CryptoService – AES-256-GCM encrypt / decrypt cho Integration tokens.

Key lấy từ biến môi trường ENCRYPTION_KEY (64 hex chars = 32 bytes).
Nếu key chưa được cấu hình → passthrough (không mã hóa) – chỉ dùng khi dev/test.

Format ciphertext: base64( nonce[12] + ciphertext + tag[16] )
Tương thích với phía .NET nếu cùng format (nonce đầu, tag cuối).
"""
import base64
import os
from typing import Optional

_KEY_HEX: str = os.getenv("ENCRYPTION_KEY", "")


def _get_key() -> Optional[bytes]:
    """Trả về 32-byte key từ ENCRYPTION_KEY hoặc None nếu chưa cấu hình."""
    if len(_KEY_HEX) == 64:
        try:
            return bytes.fromhex(_KEY_HEX)
        except ValueError:
            pass
    return None


def encrypt(plaintext: str) -> str:
    """
    Mã hóa chuỗi bằng AES-256-GCM.
    Trả về chuỗi base64 (nonce + ciphertext + tag).
    Nếu ENCRYPTION_KEY chưa cấu hình → trả về plaintext nguyên.
    """
    key = _get_key()
    if key is None:
        return plaintext  # passthrough khi dev không có key

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        nonce = os.urandom(12)   # 96-bit nonce cho GCM
        aesgcm = AESGCM(key)
        ct_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        return base64.b64encode(nonce + ct_with_tag).decode("ascii")
    except ImportError:
        # cryptography chưa được cài → passthrough
        return plaintext


def decrypt(ciphertext: str) -> str:
    """
    Giải mã chuỗi AES-256-GCM đã được mã hóa bởi encrypt().
    Nếu ENCRYPTION_KEY chưa cấu hình hoặc decrypt lỗi → trả về ciphertext nguyên.
    """
    if not ciphertext:
        return ciphertext

    key = _get_key()
    if key is None:
        return ciphertext  # passthrough khi dev không có key

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        data        = base64.b64decode(ciphertext)
        nonce       = data[:12]
        ct_with_tag = data[12:]
        aesgcm      = AESGCM(key)
        return aesgcm.decrypt(nonce, ct_with_tag, None).decode("utf-8")
    except Exception:
        # Decrypt thất bại (có thể dữ liệu chưa được mã hóa) → trả về nguyên
        return ciphertext
