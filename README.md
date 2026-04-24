# Hệ thống Phân tích Dữ liệu Bán hàng Đa kênh Tích hợp AI

**Multi-Channel Sales Analytics System with AI Decision Support (MSAS)**

Khóa luận tốt nghiệp — Khoa Công nghệ Thông tin  
Tác giả: **Nguyễn Trường Phú**

---

## Giới thiệu

Hệ thống thu thập dữ liệu bán hàng từ nhiều kênh (Shopee, Lazada, TikTok Shop, Website), hợp nhất vào Data Warehouse theo mô hình Star Schema, rồi dùng Prophet để dự báo doanh thu và phát hiện bất thường. Mục tiêu là giúp doanh nghiệp SME Việt Nam ra quyết định dựa trên dữ liệu thay vì cảm tính.

## Tech Stack

![ASP.NET Core](https://img.shields.io/badge/ASP.NET_Core-9.0-512BD4?logo=dotnet)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi)
![Expo](https://img.shields.io/badge/Expo-Mobile-000020?logo=expo)

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────┐
│  NGUỒN DỮ LIỆU                                          │
│  Shopee API │ Lazada API │ TikTok Shop │ Facebook │ GHN │
└──────────────────────────┬──────────────────────────────┘
                           │ ETL Pipeline (Python)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  DATA WAREHOUSE (PostgreSQL – Star Schema)              │
│  fact_sales │ dim_product │ dim_customer │ dim_date     │
└──────────────────────────┬──────────────────────────────┘
          ┌─────────────────┴──────────────┐
          ▼                                ▼
┌──────────────────┐            ┌──────────────────────┐
│  AI Service      │            │  ASP.NET Core API    │
│  FastAPI/Prophet │◄──────────►│  (port 5136)         │
│  (port 8001)     │            │  JWT Auth + RBAC     │
└──────────────────┘            └──────────┬───────────┘
                                           │
                          ┌────────────────┴───────────┐
                          ▼                             ▼
               ┌──────────────────┐         ┌──────────────────┐
               │  React Frontend  │         │  Expo Mobile App │
               │  (port 5173)     │         │  (iOS / Android) │
               └──────────────────┘         └──────────────────┘
```

## Cài đặt và chạy

### Yêu cầu
- PostgreSQL 17, Python 3.13, .NET 9 SDK, Node.js 20+

### Step 1 — PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE sales_analytics_ai_db;"
psql -U postgres -d sales_analytics_ai_db -f docs/sql/01_create_oltp_tables.sql
psql -U postgres -d sales_analytics_ai_db -f docs/sql/02_create_warehouse_tables.sql
psql -U postgres -d sales_analytics_ai_db -f docs/sql/03_create_indexes.sql
psql -U postgres -d sales_analytics_ai_db -f docs/sql/04_seed_data.sql
```

### Step 2 — AI Service (port 8001)

```bash
cd src/ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env            # Điền DB_PASSWORD
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
# Docs: http://localhost:8001/docs
```

### Step 3 — Backend ASP.NET Core (port 5136)

```bash
cd src/backend
# Sửa src/backend/SalesAnalytics.API/appsettings.json:
#   ConnectionStrings.Default -> điền đúng DB_PASSWORD
#   Jwt.Secret -> đặt chuỗi ngẫu nhiên >= 32 ký tự
dotnet run --project SalesAnalytics.API
# Swagger: http://localhost:5136/swagger
```

### Step 4 — Frontend React (port 5173)

```bash
cd src/frontend
npm install
cp .env.example .env    # VITE_API_URL để trống, dùng Vite proxy → localhost:5136
npm run dev
# App: http://localhost:5173
```

### Step 5 — Mobile Expo

```bash
cd src/mobile
npm install
# Cấu hình IP backend: copy .env.example → .env, điền IP LAN máy tính
cp .env.example .env

npx expo start
# Quét QR bằng Expo Go app (iOS/Android)
# Điện thoại và máy tính phải cùng WiFi

# Nếu bị lỗi "Internet connection offline" → dùng tunnel:
npx expo start --tunnel
```

> Chi tiết xem: `docs/GhiChu_Mobile.md`

## Cấu trúc thư mục

```
graduation_thesis/
├── src/
│   ├── api-integration/     # Shopee, Lazada, TikTok, Facebook, GHN connectors
│   ├── etl/                 # ETL pipeline: extract → transform → load
│   ├── ai-service/          # FastAPI + Prophet: forecast, anomaly, trend
│   ├── backend/             # ASP.NET Core 9: Auth, Dashboard, Report, AI proxy
│   ├── frontend/            # React 18 + Vite + Chart.js + i18n (vi/en)
│   └── mobile/              # Expo (React Native): quick access + nhập liệu
├── notebooks/
│   ├── 01_EDA_SalesData.ipynb       # Phân tích dữ liệu (Colab-ready)
│   ├── 02_Prophet_Training.ipynb    # Train mô hình dự báo (Colab-ready)
│   └── sample_data/                 # CSV mẫu 730 ngày để chạy trên Colab
├── docs/
│   ├── sql/                 # Scripts SQL tạo bảng + seed data
│   ├── diagrams/            # PlantUML diagrams (.puml) cho báo cáo
│   └── Report.docx          # Báo cáo khóa luận
└── docker/                  # Docker compose (tùy chọn)
```

## Tài khoản demo

| Tài khoản | Mật khẩu | Role |
|---|---|---|
| `admin@demo.vn` | `Admin@123456` | Admin |
| `owner@demo.vn` | `Owner@123456` | Owner (Chủ doanh nghiệp) |
| `manager@demo.vn` | `Manager@123456` | Manager |
| `staff@demo.vn` | `Staff@123456` | Staff |

> **Lưu ý:** Tài khoản demo chỉ dùng khi chạy seed data (`04_seed_data.sql`). Đổi mật khẩu sau khi deploy thực tế.

## Tác giả

**Nguyễn Trường Phú**  
Khóa luận tốt nghiệp Đại học — Khoa Công nghệ Thông tin  
Email: nguyentruongphu02122004@gmail.com  
GitHub: [Truong-Phu/sales-analytics-ai-system](https://github.com/Truong-Phu/sales-analytics-ai-system)
