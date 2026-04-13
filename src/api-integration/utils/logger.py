# -*- coding: utf-8 -*-
"""
Logger dùng chung cho toàn bộ API Integration Layer.
Ghi log ra console và file logs/api_integration.log
"""
import logging
import os
from logging.handlers import RotatingFileHandler

LOG_DIR  = os.path.join(os.path.dirname(__file__), "..", "logs")
LOG_FILE = os.path.join(LOG_DIR, "api_integration.log")


def get_logger(name: str) -> logging.Logger:
    """Trả về logger đã cấu hình sẵn format và handler."""
    os.makedirs(LOG_DIR, exist_ok=True)

    logger = logging.getLogger(name)
    if logger.handlers:          # Tránh thêm handler trùng khi import nhiều lần
        return logger

    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler – chỉ INFO trở lên
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)

    # File handler – ghi tất cả, rotate 5MB × 3 file
    fh = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024,
                             backupCount=3, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)

    logger.addHandler(ch)
    logger.addHandler(fh)
    return logger
