# API Integration Layer – MSAS

Thu thập dữ liệu bán hàng từ các API đa kênh: Shopee, Lazada, TikTok Shop, Facebook, GHN, VNPay.

## Cấu trúc thư mục

```
api-integration/
├── base/
│   └── base_connector.py    # Abstract base: auth, retry, rate limit, pagination
├── connectors/
│   ├── shopee.py            # Shopee Open API v2 (HMAC-SHA256)
│   ├── lazada.py            # Lazada Open Platform (HMAC-SHA256)
│   ├── tiktok_shop.py       # TikTok Shop Partner API (OAuth2)
│   ├── facebook.py          # Facebook Graph API + Ads API (OAuth2)
│   ├── ghn.py               # GHN Shipping API (Token)
│   └── vnpay.py             # VNPay Payment API (HMAC-SHA512)
├── importers/
│   └── excel_importer.py    # Fallback: import từ Excel/CSV
├── utils/
│   ├── logger.py            # Logging ra console + file
│   └── db.py                # PostgreSQL connection + watermark
├── tests/
│   ├── test_base_connector.py
│   ├── test_shopee_connector.py
│   └── test_excel_importer.py
├── .env.example             # Template biến môi trường
├── requirements.txt
└── README.md
```

## Cài đặt

**Bước 1**: Tạo virtual environment

```bash
cd src/api-integration
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
```

**Bước 2**: Cài dependencies

```bash
pip install -r requirements.txt
```

**Bước 3**: Cấu hình môi trường

```bash
cp .env.example .env
# Mở .env và điền đầy đủ credentials
```

**Bước 4**: Kiểm tra kết nối database

```bash
python -c "from utils.db import get_conn; print('DB OK')"
```

## Cách dùng

### Sync đơn hàng Shopee

```python
from connectors.shopee import ShopeeConnector

conn  = ShopeeConnector()
count = conn.sync_orders(lookback_days=7)
print(f"Đã sync {count} đơn hàng Shopee")
```

### Sync đơn hàng Lazada

```python
from connectors.lazada import LazadaConnector

conn  = LazadaConnector()
count = conn.sync_orders(lookback_days=7)
print(f"Đã sync {count} đơn hàng Lazada")
```

### Import từ Excel (Fallback)

```python
from importers.excel_importer import ExcelImporter

importer = ExcelImporter("data/orders_april.xlsx")
success, errors = importer.import_orders(channel_name="offline")
print(f"Import: {success} thành công, {errors} lỗi")

# Xem báo cáo lỗi
error_df = importer.get_error_report()
error_df.to_excel("error_report.xlsx", index=False)
```

### Sync tất cả kênh

```python
from connectors.shopee import ShopeeConnector
from connectors.lazada import LazadaConnector
from connectors.tiktok_shop import TikTokShopConnector

connectors = [ShopeeConnector(), LazadaConnector(), TikTokShopConnector()]
for conn in connectors:
    try:
        count = conn.sync_orders(lookback_days=1)
        print(f"✓ {conn.channel_name}: {count} đơn hàng")
    except Exception as e:
        print(f"✗ {conn.channel_name}: {e}")
```

## Chạy tests

```bash
# Chạy tất cả tests
pytest tests/ -v

# Chạy một file test cụ thể
pytest tests/test_base_connector.py -v

# Chạy với coverage report
pytest tests/ --cov=. --cov-report=html
# Mở coverage_report/index.html để xem chi tiết

# Chạy test nhanh (không coverage)
pytest tests/ -v --no-cov
```

## Quy trình xác thực từng kênh

| Kênh | Auth Type | Hướng dẫn |
|------|-----------|-----------|
| Shopee | HMAC-SHA256 + OAuth2 | Đăng ký Partner → Authorize Shop → Lấy access_token |
| Lazada | HMAC-SHA256 + OAuth2 | Đăng ký App → Authorize Seller → Lấy access_token |
| TikTok Shop | HMAC-SHA256 + OAuth2 | Đăng ký Partner → Authorize Shop |
| Facebook | OAuth2 Long-lived Token | Tạo App → Generate Page Access Token (60 ngày) |
| GHN | API Token Header | Đăng ký GHN API → Copy token từ dashboard |
| VNPay | HMAC-SHA512 | Đăng ký Merchant → Lấy TmnCode + SecretKey |

## Lưu ý quan trọng

- **Rate Limiting**: Mỗi connector đã có sẵn rate limiter. Không gọi connector trong vòng lặp không có delay.
- **Incremental Sync**: Luôn dùng `sync_orders(lookback_days=N)` thay vì fetch toàn bộ lịch sử.
- **Fallback**: Nếu API lỗi, dùng `ExcelImporter` để import từ file export của từng sàn.
- **Logs**: Xem file `logs/api_integration.log` để debug.
- **Credentials**: Không commit file `.env` lên git. Chỉ commit `.env.example`.
