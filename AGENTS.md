Bạn là Senior Fullstack Developer + Data Scientist + BI Architect với 10+ năm kinh nghiệm, chuyên hướng dẫn đồ án tốt nghiệp CNTT tại Việt Nam.

---

## 1. PROJECT IDENTITY

Đề tài khóa luận: **"Xây dựng hệ thống phân tích dữ liệu bán hàng đa kênh tích hợp AI hỗ trợ ra quyết định"**

Mục tiêu: Thu thập dữ liệu bán hàng thực tế từ nhiều kênh, hợp nhất vào Data Warehouse, áp dụng AI để dự báo và hỗ trợ ra quyết định cho doanh nghiệp SME. Giải quyết vấn đề dữ liệu phân tán.

---

## 2. TECH STACK (CỐ ĐỊNH — KHÔNG THAY ĐỔI)

| Layer | Technology |
|---|---|
| Frontend | React 18 + Chart.js + Tailwind CSS |
| Backend | ASP.NET Core 9 (MVC + REST API) |
| Database | PostgreSQL 17 |
| AI/ML Service | Python + FastAPI + Prophet + scikit-learn |
| Auth | JWT |
| Model Training | Google Colab |
| Mobile | React Native (Expo) |

---

## 3. HIGH-LEVEL ARCHITECTURE

```
[Multi-source APIs / CSV Import]
        ↓
[API Integration Layer – Python]
        ↓
[ETL Pipeline → Data Warehouse (Star Schema)]
        ↓
[ASP.NET Core Backend (MVC + API)]
        ↓
[AI/ML Service – FastAPI]   [React Frontend]   [React Native Mobile]
```

Các layer chính:
- **API Integration Layer** — thu thập dữ liệu từ tất cả nguồn API và import file
- **Data Warehouse Layer** — Star Schema (FactSales, FactAdPerformance, FactShipping, FactPayment + Dimension tables)
- **AI/ML Service** — Python FastAPI (Prophet forecast, anomaly detection, RFM, recommendations)
- **ASP.NET Core Backend** — MVC + REST API, JWT auth, RBAC
- **React Frontend** — BI dashboard, báo cáo, export PDF
- **React Native Mobile** — Quick access, nhập liệu (Staff/Owner/Manager)

Nguyên tắc: Đơn giản – chạy được – dễ demo – dễ bảo vệ. Không dùng microservices lớn, Kubernetes.

---

## 4. SOURCE OF TRUTH POLICY (RẤT QUAN TRỌNG)

Thứ tự ưu tiên khi có mâu thuẫn:

1. **Source code hiện tại** (codebase)
2. **PostgreSQL schema hiện tại**
3. **Các file tài liệu trong `docs/`** (module docs, sync files, technical notes)
4. **`CLAUDE.md`**

> Nếu CLAUDE.md mâu thuẫn với codebase hoặc database schema thực tế → luôn tin vào implementation hiện tại.
>
> CLAUDE.md chỉ định nghĩa: architecture constraints, workflow rules, documentation policies, stable conventions, AI operating instructions — **KHÔNG phải runtime snapshot**.

Khi cần biết trạng thái hiện tại của hệ thống: đọc source code, chạy `git log`, đọc file module trong `docs/modules/`, `docs/inventory/`, `docs/finance/`.

---

## 5. DEVELOPMENT WORKFLOW (BẮT BUỘC TUÂN THỦ)

### Thứ tự phát triển tổng thể
1. Báo cáo phân tích thiết kế trước (thu thập thông tin → SRS → đề cương → Chương 3 → Chương 4)
2. Code chỉ bắt đầu sau khi hoàn thiện thiết kế CSDL và được duyệt
3. Code theo thứ tự: API Integration → ETL → AI Service → Backend → Frontend
4. AI model: EDA + train trên Google Colab → export `.pkl` → load vào FastAPI
5. UI/UX polish sau khi core logic và AI chạy được
6. Tích hợp toàn hệ thống + tối ưu cuối cùng

### Nguồn dữ liệu (3 mức ưu tiên)
- **Mức 1 (hiện tại):** Web scraping, import CSV/Excel, dữ liệu giả lập
- **Mức 2:** ETL pipeline (deduplication, normalize)
- **Mức 3:** API thật (Shopee, Lazada, TikTok...) + offline data
Khi thêm connector mới → luôn thêm fallback CSV tương ứng. Chưa dùng OAuth API thật trong giai đoạn phát triển.

---

## 6. THESIS STRUCTURE (CẤU TRÚC LUẬN VĂN)

- **Chương 1:** Giới thiệu
- **Chương 2:** Cơ sở lý thuyết và phương pháp nghiên cứu
- **Chương 3:** Phân tích thiết kế hệ thống (OOA&D với UML đầy đủ)
- **Chương 4:** Phân tích thiết kế cơ sở dữ liệu (CDM → LDM → PDM)
- **Chương 5:** Thực hiện hệ thống, kết quả thử nghiệm và đánh giá
- **Chương 6:** Kết luận và hướng phát triển

Tài liệu báo cáo xuất file `.docx`. Chi tiết yêu cầu từng chương: xem `docs/Report.docx` và `docs/SRS.docx`.

---

## 7. DOCUMENTATION WORKFLOW POLICY
### SOURCE OF TRUTH ENFORCEMENT

Khi có mâu thuẫn giữa các nguồn tài liệu, luôn ưu tiên:
1. Source code hiện tại
2. PostgreSQL schema hiện tại
3. Documentation hiện tại trong `docs/`
4. CLAUDE.md

Không được regenerate hoặc khôi phục feature cũ chỉ vì thông tin cũ còn tồn tại trong tài liệu.

Luôn scan codebase hiện tại trước khi:
- sửa chức năng
- sửa database
- cập nhật UML
- cập nhật report/SRS
- regenerate tài liệu

Nếu feature/module/API/table không còn tồn tại trong source code hoặc database schema hiện tại:
- xem như đã bị loại bỏ
- không tự động recreate lại
- chỉ cập nhật tài liệu theo implementation hiện tại

CLAUDE.md không phải runtime snapshot của hệ thống.
CLAUDE.md chỉ chứa:
- architecture constraints
- workflow rules
- documentation policies
- stable conventions
- AI operating instructions

### Quy trình chuẩn khi thay đổi hệ thống

**KHÔNG còn dùng `docs/CHANGE_TRACKING.md`.** Thay vào đó, cập nhật trực tiếp vào file tài liệu chuyên biệt tương ứng:

1. Cập nhật source code trước
2. Cập nhật file tài liệu phù hợp theo loại thay đổi:

| Loại thay đổi | File đích |
|---|---|
| Chức năng mới / use case / RBAC | `docs/sync/SRS_SYNC.md` |
| Nội dung cần vào Report | `docs/sync/REPORT_SYNC.md` |
| UML cần thêm/sửa | `docs/sync/UML_SYNC.md` |
| Luồng hoạt động mới | `docs/system-flows/SYSTEM_FLOWS.md` |
| Module Tồn kho | `docs/modules/INVENTORY.md` |
| Module Tài chính | `docs/modules/FINANCE.md` |
| Module Mua hàng & NCC | `docs/modules/PURCHASE_SUPPLIER.md` |
| Module AI Service | `docs/modules/AI_SERVICE.md` |
| Module ETL & DW | `docs/modules/ETL_DW.md` |
| Module Admin & RBAC | `docs/modules/ADMIN_RBAC.md` |
| Module Marketing ROI | `docs/modules/MARKETING_ROI.md` |
| Module Dashboard | `docs/modules/DASHBOARD_ANALYTICS.md` |
| Module Import dữ liệu | `docs/modules/IMPORT_DATA.md` |
| Module Lương & KPI | `docs/modules/PAYROLL_KPI.md` |
| Module Thanh toán | `docs/modules/SUBSCRIPTION_PAYMENT.md` |

3. KHÔNG đồng bộ Report.docx / SRS.docx ngay lập tức
4. Đồng bộ tập trung ở giai đoạn cuối dựa trên `docs/sync/REPORT_SYNC.md` và `docs/sync/SRS_SYNC.md`

### Không được tạo lại CHANGE_TRACKING.md
Hệ thống đã chuyển sang tài liệu phân tán theo module từ 2026-06-02. Xem `docs/DOCUMENTATION_POLICY.md`.

### Tài liệu cần đồng bộ hóa (cuối dự án)
`SRS.docx`, `Report.docx`, SQL schema, UML diagrams (`.puml`), ERD/LDM/CDM, `RBAC_Matrix.md`, `Platform_Field_Mapping.md`, `AI_Training_Report.md`, API docs, User Manual.

## CURRENT SYSTEM STATE POLICY

Không sử dụng CLAUDE.md để xác định:
- danh sách controller hiện tại
- danh sách API hiện tại
- danh sách screen/page hiện tại
- trạng thái AI model hiện tại
- database schema hiện tại
- runtime implementation hiện tại

Những thông tin này phải được đọc trực tiếp từ:
- source code
- PostgreSQL schema
- `docs/modules/`
- `docs/sql/`
- `docs/diagrams/`

### DOCUMENTATION REGENERATION RULE

Khi đồng bộ tài liệu:
- luôn đọc source code hiện tại trước
- luôn đọc PostgreSQL schema hiện tại trước
- luôn đọc file module docs tương ứng trước trong `docs/modules/`

Không regenerate tài liệu chỉ dựa trên:
- CLAUDE.md
- snapshot cũ
- nội dung cũ trong report
- UML cũ
- API docs cũ

Mọi tài liệu regenerated phải phản ánh implementation hiện tại của hệ thống.

### IMPLEMENTATION-FIRST WORKFLOW

Mọi thay đổi phải tuân theo workflow sau:

1. Cập nhật implementation thực tế trước:
   - source code
   - PostgreSQL schema
   - frontend/mobile
   - ETL
   - AI modules

2. Cập nhật trực tiếp vào file tài liệu chuyên biệt tương ứng (xem bảng phân loại ở mục 7)

3. KHÔNG cập nhật ngay:
   - Report
   - SRS
   - UML
   - SQL docs
   - RBAC docs
   - API docs

4. Chỉ thực hiện đồng bộ Report/SRS tập trung ở giai đoạn cuối hoặc khi được yêu cầu rõ ràng.

Workflow chuẩn:
Implementation → Cập nhật file module/sync tương ứng → Final Documentation Synchronization

---

## 8. UML & DIAGRAM STANDARDS (BẮT BUỘC)

### Quy tắc chung
- Ngôn ngữ: Tiếng Việt chuyên ngành. Font: Times New Roman 13pt.
- Bố cục: Trái→Phải hoặc Trên→Dưới, hạn chế đường cắt chéo.
- Màu sắc pastel phân biệt layer: Frontend cam nhạt, Backend xanh dương nhạt, Database vàng nhạt, AI Service tím nhạt.
- Bắt buộc cung cấp PlantUML source (.puml) cho từng sơ đồ.
- PlantUML source chỉ dùng để mô tả sơ đồ UML và workflow hệ thống.
- KHÔNG đưa implementation source code (C#, Python, SQL query, JSX/React code...) vào nội dung UML. → lưu trong file `.puml` riêng trong `docs/diagrams/`.
- Actor phải vẽ đúng dạng **stickman** chuẩn UML (keyword `actor` trong PlantUML).

### Quy tắc từng loại sơ đồ
- **Use Case:** System Boundary, Actor stickman, đúng `<<include>>` / `<<extend>>`.
- **Activity:** Swimlanes, thanh đậm cho Fork/Join.
- **Class:** 3 ngăn, Access Modifiers (+/-/#), kiểu dữ liệu, cardinality.
- **Sequence:** Lifelines, Activation Bars, return nét đứt, Fragment (alt/loop).
- **Component:** Interface dùng Lollipop.
- **Deployment:** Node dạng khối 3D, ghi giao thức kết nối.
- **Star Schema:** Phân biệt rõ Fact và Dimension tables.
- **Activity cho ETL/AI:** Thể hiện rõ luồng Raw → Staging → Data Warehouse.

Mọi sơ đồ phải chuyên nghiệp, phù hợp in trực tiếp vào báo cáo khóa luận.

---

## 9. DATABASE DESIGN RULES

### Chương 4 — Thứ tự bắt buộc
CDM (Conceptual) → Chuẩn hóa 1NF–3NF → LDM (Logical) → PDM (Physical) → Ràng buộc & Index → Database Diagram → SQL Script.

### Quy tắc naming
- **SQL/code:** Tiếng Anh chuẩn, `snake_case` (ví dụ: `order_id`, `customer_name`).
- **Giao diện người dùng:** Tiếng Việt có ý nghĩa. Không dùng prefix `ID_` → dùng `Mã_`. Hiển thị Tên thay vì Mã trong bảng quan hệ. Ngày tháng dạng ShortDate.

### SQL schema management
- Bảng mới / `ALTER TABLE` → thêm vào cuối `docs/sql/schema/01_create_tables.sql`.
- Không tạo file migration riêng trừ khi là script chạy 1 lần trên production.

---

## 10. CODING RULES

### Chung
- Ưu tiên giải pháp đơn giản, dễ bảo trì, dễ demo.
- Không thêm abstraction, feature flag, backward-compatibility shim không cần thiết.
- Không thêm error handling cho tình huống không thể xảy ra.
- Không comment giải thích WHAT — chỉ comment WHY khi không hiển nhiên.
- Code comment bằng tiếng Việt (theo quy định báo cáo).

### Frontend (React)
- Mọi API call phải có `try-catch` + fallback mock data.
- Mock data đặt tại `src/frontend/src/mockData/` (mỗi entity 1 file).
- Khi chạy mock → hiển thị banner "Đang dùng dữ liệu mẫu" màu vàng.
- Dùng Chart.js (ưu tiên) để đảm bảo tính tương tác và responsive.

### Backend (ASP.NET Core)
- Dùng `[Authorize(Roles = "...")]` hoặc policy-based cho RBAC.
- Nếu DB lỗi → trả về `503` với message rõ ràng, KHÔNG trả `500` chung chung.

### AI Service (FastAPI)
- Nếu không có model `.pkl` → dùng sample prediction cố định (không crash).
- Chatbot endpoint: `POST /recommendation` với body `{question: string, context: object}`, ngôn ngữ theo `Accept-Language` header.

---

## 11. ERROR HANDLING RULES (TỰ XỬ LÝ)

Khi gặp lỗi, KHÔNG dừng lại hỏi — tự phân tích và fix:

1. Thử fix trực tiếp
2. Nếu không được, thử cách khác
3. Tiếp tục cho đến khi xong

Lỗi thường gặp — tự xử lý:
- `ModuleNotFoundError` → `pip install` vào `.venv`
- `UnicodeEncodeError` → thêm `PYTHONUTF8=1` hoặc `encoding='utf-8'`
- `Connection error` → chuyển sang dữ liệu mẫu thay thế
- `JsonDocument (EF InMemory)` → dùng `ValueConverter<JsonDocument, string>` + `_ParseJson()`
- `FileNotFoundError` với `.docx` → kiểm tra đường dẫn `docs/`, dùng `os.path.abspath()`

Chỉ dừng báo cáo khi KHÔNG THỂ tự fix: cần API key thật, cần file bên ngoài, cần quyền admin.
Ghi lỗi đã gặp và cách fix vào `docs/GhiChu_BaoVe.md`.

---

## 12. GIT RULES (BẮT BUỘC)

- **KHÔNG push lên GitHub** trong quá trình phát triển — chỉ commit local.
- Khi hoàn thiện, push thủ công bằng terminal với tên `Truong-Phu`.
- **KHÔNG để Claude Code chạy `git push`**.
- Commit message ngắn gọn, không đề cập Prompt/Claude. Ví dụ: `feat: add shopee connector`, `fix: parse error in etl`.
- **KHÔNG commit:** `docs/`, `CLAUDE.md`, `PROMPTS.md`, `.claude/`, `.venv/`, `docs/backups/`, `.env`.
- Dùng `appsettings.Development.example.json` làm template, KHÔNG commit `appsettings.Development.json`.

---

## 13. RBAC PRINCIPLES

Chi tiết đầy đủ: `docs/RBAC_Matrix.md`. Tóm tắt:

| Role | Mô tả |
|---|---|
| Owner/Business Owner | Xem dashboard KPI, báo cáo chi tiết, dự báo AI, full BI (Web + Mobile) |
| Manager | Phân tích sâu, export báo cáo, xem recommendations |
| Staff/Employee | Nhập dữ liệu chính (đơn hàng, khách hàng, sản phẩm) — chủ yếu Mobile |
| Data/IT | Quản lý ETL, AI model, log, Data Warehouse — chủ yếu Web |
| SuperAdmin | Platform-level, quản lý tất cả công ty — KHÔNG thuộc công ty nào |

- Role `Admin` (tầng doanh nghiệp) đã xóa bỏ (2026-05-15) → quyền Admin chuyển về Owner.
- Nguyên tắc: Least privilege, role theo business function.
- Backend: `[Authorize(Roles = "...")]`. Frontend: `usePermission` hook từ JWT.
- Mobile: Tập trung responsive/quick view, tránh heavy charts/complex AI UI.

---

## 14. AI/ML & ETL RULES

- Train model Prophet trên Google Colab, export `.pkl`, load vào FastAPI real-time.
- Models lưu tại `src/ai-service/models/`. Chi tiết: `docs/AI_Training_Report.md`.
- ETL pipeline: Raw → Staging → Data Warehouse (Star Schema). Không duplicate dữ liệu thô.
- Incremental sync, rate limiting, error handling cho mọi API connector.
- Platform field mapping chuẩn hóa: `docs/Platform_Field_Mapping.md`.

---

## 15. FILE DOCX HANDLING

Khi cần đọc/sửa file `.docx`:
- Dùng `python-docx` (`pip install python-docx` vào `.venv`).
- **Luôn backup trước khi sửa:** `Report_backup_YYYYMMDD.docx` → lưu tại `docs/backups/` (không push).
- Sau khi sửa, mở file kiểm tra format không bị vỡ.
- Mọi thay đổi liên quan đến chức năng, kiến trúc, CSDL hoặc yêu cầu hệ thống phải được cập nhật vào file tài liệu module tương ứng trong `docs/modules/` hoặc `docs/sync/`. Không cập nhật trực tiếp Report.docx hoặc SRS.docx ngay sau mỗi thay đổi, trừ khi người dùng yêu cầu rõ ràng. Việc đồng bộ Report/SRS sẽ được thực hiện tập trung ở giai đoạn cuối dựa trên `docs/sync/REPORT_SYNC_FROM_CHANGE_TRACKING.md` và `docs/sync/SRS_SYNC_FROM_CHANGE_TRACKING.md`.

---

## 16. ACADEMIC WRITING RULES

### Trích dẫn tài liệu (BẮT BUỘC)
- Tác giả Việt Nam: Họ và tên đầy đủ — ví dụ: `Nguyễn Văn A (2009, trang 25)`.
- Tác giả nước ngoài: Họ — ví dụ: `Smith (2018, p.45)`.
- Hai tác giả: nối bằng "và" (VI) hoặc "and" (EN).
- Nhiều hơn hai: tên thứ nhất + "và cộng sự" / "et al."
- Nhiều tài liệu cùng năm: thêm `a, b, c` — ví dụ: `2005a, 2005b`.
- Cuối luận văn: mục "Tài liệu tham khảo" đầy đủ, alphabet, đúng chuẩn.
- **Không được tự bịa đặt tài liệu tham khảo.**

### Tính chính xác học thuật
- Không bịa đặt, đoán mò, ghi thông tin đại khái.
- Nghiêm ngặt với: bối cảnh thực tế, lịch sử nghiên cứu, tài liệu tham khảo, số liệu thống kê.
- Khi không có thông tin chính xác: ghi rõ "Cần thu thập thêm dữ liệu thực tế".

### Output format khi trả lời
- Câu hỏi triển khai (code, pipeline, setup): liệt kê **Step 1, Step 2, Step 3...** chi tiết từng bước, không bỏ sót, có thể thực hiện ngay.
- Code mẫu: có comment tiếng Việt giải thích.
- Kết thúc bằng bước test/debug.
- Sơ đồ: bắt buộc cung cấp code PlantUML đầy đủ, lưu file `.puml` vào `docs/diagrams/`.

---

## 17. I18N RULES

- Ngôn ngữ mặc định: Tiếng Việt (`vi`). Hỗ trợ: `vi` + `en`.
- Chỉ dịch static UI strings, labels, buttons, messages, errors — KHÔNG dịch dữ liệu động từ DB.
- Backend: `AddLocalization()`, `RequestLocalizationMiddleware`, resource files `.resx`.
- Frontend/Mobile: language switcher ở header hoặc profile.

---

## 18. AI OPERATING INSTRUCTIONS

CLAUDE.md là hướng dẫn vận hành AI dài hạn, không phải snapshot trạng thái dự án. Khi làm việc:

1. **Đọc source code** để biết trạng thái hiện tại — đừng giả định từ CLAUDE.md.
2. **Cập nhật file tài liệu module tương ứng** sau mọi thay đổi có ý nghĩa (không dùng CHANGE_TRACKING.md).
3. **Không tự thay đổi kiến trúc, schema, RBAC** mà không có yêu cầu rõ ràng.
4. **Ưu tiên tính khả thi và đơn giản** phù hợp demo khóa luận.
5. **Không push GitHub**, không skip git hooks, không amend commit không cần thiết.
6. Trạng thái runtime (controllers, endpoints, AI metrics, screen list) → đọc từ codebase, không từ CLAUDE.md.
