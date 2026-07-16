# MSAS — Multi-channel Sales Analytics System

**Hệ thống Phân tích Dữ liệu Bán hàng Đa kênh Tích hợp AI**

Khóa luận tốt nghiệp — Trường Đại học Nam Cần Thơ  
Tác giả: **Nguyễn Trường Phú** | MSSV: 223714  
Giảng viên hướng dẫn: **ThS. Võ Văn Phúc**

---

## Giới thiệu

MSAS là hệ thống phân tích dữ liệu bán hàng đa kênh dành cho doanh nghiệp SME Việt Nam. Hệ thống tự động thu thập dữ liệu từ Shopee, Lazada, TikTok Shop và kênh offline, hợp nhất vào Data Warehouse theo mô hình Star Schema, sau đó ứng dụng AI (Prophet, RandomForest, Apriori, Z-score) để dự báo doanh thu, phát hiện bất thường và hỗ trợ ra quyết định kinh doanh.

---

## Tech Stack

| Tầng | Công nghệ | Phiên bản |
|------|-----------|-----------|
| Frontend Web | React + Vite + Chart.js | React 19, Vite 6 |
| Backend API | ASP.NET Core + EF Core | .NET 9 |
| AI/ML Service | FastAPI + Prophet + scikit-learn | Python 3.13 |
| Database | PostgreSQL | 17 |
| ETL Pipeline | Python + APScheduler + Pandas | - |
| Mobile | React Native + Expo SDK | SDK 54 |
| AI Chatbot | Google Gemini 2.5 Flash + Groq LLaMA | - |

---

## Kiến trúc hệ thống

```
src/
├── backend/          # ASP.NET Core 9 — 32 Controllers, RBAC, JWT
├── ai-service/       # FastAPI — 34 endpoints (Prophet, RFM, Churn, Basket...)
├── frontend/         # React 19 + Vite — 59 trang, Dashboard 6 tab
├── mobile/           # React Native Expo SDK 54 — 18 màn hình
├── etl/              # Python ETL Pipeline — 3 pipeline (Offline/Auto/Manual)
└── api-integration/  # Connector tích hợp sàn TMĐT
```

Luồng dữ liệu: `Nguồn bên ngoài → Staging → OLTP (public) → DW (dw schema)`  
AI Service giao tiếp với Backend qua REST API nội bộ tại `localhost:8001`.

---

## Yêu cầu môi trường

| Thành phần | Phiên bản tối thiểu |
|------------|---------------------|
| .NET SDK | 9.0 |
| Python | 3.11+ (khuyến nghị 3.13) |
| Node.js | 18+ |
| PostgreSQL | 17 |
| Expo CLI | Mới nhất (`npm install -g expo-cli`) |

---

## Cài đặt

### Bước 1 — Clone và cấu hình môi trường

```bash
git clone https://github.com/Truong-Phu/sales-analytics-ai-system.git
cd sales-analytics-ai-system

# Sao chép file cấu hình mẫu
copy .env.example .env
```

Mở file `.env` và điền các giá trị:

```env
DB_PASSWORD=your_postgres_password
CONNECTION_STRING=Host=localhost;Port=5432;Database=sales_analytics_ai_db;Username=postgres;Password=your_password
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/sales_analytics_ai_db
JWT_SECRET_KEY=your_random_secret_key_at_least_32_chars
GEMINI_API_KEY=your_gemini_api_key       # Lấy tại: aistudio.google.com
GROQ_API_KEY=your_groq_api_key           # Lấy tại: console.groq.com
RESEND_API_KEY=your_resend_api_key       # Lấy tại: resend.com (tùy chọn)
```

### Bước 2 — Khởi tạo cơ sở dữ liệu

```bash
# 1. Tạo database PostgreSQL
psql -U postgres -c "CREATE DATABASE sales_analytics_ai_db;"

# 2. Khôi phục cơ sở dữ liệu từ file backup (đã bao gồm toàn bộ Schema, Indexes và hơn 9.400 đơn hàng thực nghiệm)
psql -U postgres -d sales_analytics_ai_db -f docs/msas_db_backup.sql
```

> **Mẹo khôi phục bằng giao diện pgAdmin 4:**
> 1. Mở pgAdmin 4, tạo một database mới tên là `sales_analytics_ai_db`.
> 2. Click chuột phải vào database vừa tạo -> Chọn **Query Tool**.
> 3. Mở tệp tin `docs/msas_db_backup.sql` bằng Query Tool và nhấn nút **Execute/Play (F5)** để chạy và khôi phục toàn bộ cấu trúc bảng cũng như dữ liệu mẫu.

### Bước 3 — Cài đặt và cấu hình bảo mật Backend (User Secrets)

```bash
cd src/backend/SalesAnalytics.API
dotnet restore

# 1. Cấu hình chuỗi kết nối cơ sở dữ liệu local (thay your_password bằng mật khẩu Postgres của bạn)
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=sales_analytics_ai_db;Username=postgres;Password=your_password"

# 2. Cấu hình khóa JWT (điền chuỗi bí mật dài ngẫu nhiên bất kỳ trên 32 ký tự)
dotnet user-secrets set "Jwt:Secret" "YOUR_RANDOM_SECRET_KEY_AT_LEAST_32_CHARS"

# 3. Cấu hình các API Key dịch vụ AI & Email (Tùy chọn nếu muốn chạy tính năng AI/Email thật)
dotnet user-secrets set "Gemini:ApiKey" "your_gemini_api_key"        # Lấy tại aistudio.google.com
dotnet user-secrets set "Groq:ApiKey" "your_groq_api_key"            # Lấy tại console.groq.com
dotnet user-secrets set "Resend:ApiKey" "your_resend_api_key"        # Lấy tại resend.com
dotnet user-secrets set "Resend:OtpSalt" "your_otp_salt_value"
dotnet user-secrets set "Encryption:Key" "5898e48c97c09104e3f3d2692c83709936a42c127024d0cc87420c39215242f4"
```

> **Mẹo kiểm tra nhanh:** Bạn có thể chạy script `powershell -ExecutionPolicy Bypass -File .\verify-user-secrets.local.ps1` ở thư mục gốc của dự án để kiểm tra xem đã thiết lập đầy đủ và chính xác các khóa này chưa.

### Bước 4 — Cài đặt dependencies AI Service & ETL

```bash
# Tạo virtual environment (tại thư mục gốc)
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate    # Linux/Mac

# Cài đặt thư viện
pip install -r src/ai-service/requirements.txt
pip install -r src/etl/requirements.txt
```

### Bước 5 — Cài đặt dependencies Frontend

```bash
cd src/frontend
npm install
```

### Bước 6 — Cài đặt dependencies Mobile

```bash
cd src/mobile
npm install
```

Cập nhật IP LAN trong `.env`:
```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:5136/api
```
> Tìm IP LAN bằng lệnh: `ipconfig | findstr IPv4`

---

## Khởi động hệ thống

### Khởi động nhanh (Windows — khuyến nghị)

```bat
start_all.bat
```

Script này tự động khởi động tất cả 4 thành phần theo đúng thứ tự và hiển thị URL truy cập.

### Khởi động từng thành phần

**1. AI Service (FastAPI) — Port 8001**
```bash
cd src/ai-service
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**2. Backend API (ASP.NET Core) — Port 5136**
```bash
cd src/backend/SalesAnalytics.API
dotnet run --launch-profile http
```

**3. Frontend Web (React) — Port 5173**
```bash
cd src/frontend
npm run dev
```

**4. ETL Pipeline (Python)**
```bash
cd src/etl
python offline_etl.py          # Chạy ETL thủ công một lần
# Auto sync chạy tự động qua APScheduler khi AI Service đang hoạt động
```

**5. Mobile App (Expo)**
```bash
cd src/mobile
npm start
# Quét QR bằng ứng dụng Expo Go trên điện thoại
```

---

## URL truy cập

| Dịch vụ | URL |
|---------|-----|
| Frontend Web | http://localhost:5173 |
| Backend API + Swagger | http://localhost:5136/swagger |
| AI Service + Docs | http://localhost:8001/docs |
| Mobile (Expo) | Quét QR trong terminal |

---

## Tài khoản demo

> Mật khẩu mặc định tất cả tài khoản: `12345678`

| Tài khoản | Vai trò | Quyền hạn |
|-----------|---------|-----------|
| `owner` | Owner | Toàn bộ hệ thống |
| `manager` | Manager | Phân tích, báo cáo, quản lý |
| `staff_sales` | Staff_Sales | POS, đơn hàng, khách hàng |
| `staff_warehouse` | Staff_Warehouse | Kho, NCC, phiếu nhập |
| `staff_marketing` | Staff_Marketing | Chi phí QC, chiến dịch |
| `datait` | DataIT | ETL, AI, đồng bộ dữ liệu |
| `viewer` | Viewer | Chỉ xem dashboard |
| `superadmin` | SuperAdmin | Quản trị nền tảng SaaS |

---

## Cấu trúc thư mục

```
graduation_thesis/
├── src/
│   ├── backend/              # ASP.NET Core 9
│   │   └── SalesAnalytics.API/
│   │       ├── Controllers/  # 32 controllers
│   │       ├── Services/     # Business logic
│   │       └── DTOs/         # Data Transfer Objects
│   ├── ai-service/           # FastAPI Python
│   │   ├── main.py           # Entry point, 10 endpoints
│   │   ├── routers/          # 24 endpoint nhóm chức năng
│   │   ├── services/         # Prophet, RFM, Churn, Basket...
│   │   └── models/           # File .pkl model đã train
│   ├── frontend/             # React 19 + Vite
│   │   └── src/
│   │       ├── pages/        # 59 trang
│   │       ├── components/   # Components tái sử dụng
│   │       ├── api/          # Axios API calls
│   │       └── hooks/        # Custom hooks
│   ├── mobile/               # React Native Expo
│   │   └── src/
│   │       ├── screens/      # 18 màn hình
│   │       └── navigation/   # RBAC tab navigator
│   └── etl/                  # Python ETL Pipeline
│       ├── offline_etl.py    # Pipeline 1: xử lý lịch sử
│       └── auto_sync.py      # Pipeline 2: tăng dần 30 phút
├── docs/
│   ├── NguyenTruongPhu_MSAS_Final.pdf   # Báo cáo khóa luận chính thức (PDF)
│   └── msas_db_backup.sql               # File backup cơ sở dữ liệu (Schema + Seed Data)
├── notebooks/                # Jupyter Notebook train mô hình AI
├── .env.example              # Mẫu cấu hình biến môi trường
├── start_all.bat             # Script khởi động toàn hệ thống
└── stop_all.bat              # Script dừng toàn hệ thống
```

---

## Mô hình AI

| Mô hình | Kỹ thuật | Kết quả |
|---------|----------|---------|
| Dự báo doanh thu | Prophet 1.3.0 | SMAPE=35,74% (885 ngày, split 80/20) |
| Phát hiện bất thường | Z-score rolling 14 ngày | Ngưỡng 2,5σ |
| Phân khúc khách hàng | RFM Clustering | 7 phân khúc / 346 khách hàng |
| Dự báo churn | RandomForestClassifier | 165 khách cross-platform |
| Phân tích giỏ hàng | Apriori MBA | lift tối đa 2,59x |

Huấn luyện: Google Colab → Xuất file `.pkl` → FastAPI load khi khởi động.

---

## Kiểm thử

```bash
# Unit Test (xUnit)
cd src/backend
dotnet test

# API Test
# Import file postman/MSAS.postman_collection.json vào Postman
# Kết quả: 28 test pass
```

---

## Lưu ý bảo mật

- Không commit file `.env` lên GitHub (đã có trong `.gitignore`)
- Không ghi API key, JWT secret, mật khẩu DB vào mã nguồn
- Credentials per-tenant (Shopee, Lazada, TikTok...) được lưu trong bảng `integrations` của DB, quản lý qua giao diện web

---

## Tác giả

**Nguyễn Trường Phú**  
Khóa luận tốt nghiệp — Kỹ thuật Phần mềm  
Trường Đại học Nam Cần Thơ | Tháng 06/2026  
Email: nguyentruongphu02122004@gmail.com
