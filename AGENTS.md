# AGENTS.md — AI Operating Guide for MSAS Project

## CURRENT WORKING MODE — FRONTEND LOGIC FIX ONLY

Dự án hiện tại đã gần hoàn thiện và đã khóa nội dung báo cáo, tài liệu, SRS, UML và các file documentation.
Từ thời điểm này, chỉ tập trung sửa lỗi logic frontend tối thiểu để hệ thống chạy đúng, hiển thị đúng dữ liệu API hiện tại và demo ổn định.

Không được mở rộng phạm vi sửa nếu chưa có yêu cầu rõ ràng.

---

## 1. Mục tiêu làm việc hiện tại

Mục tiêu hiện tại là:

* Fix lỗi logic frontend.
* Sửa dashboard, finance, filter hoặc các màn hình demo nếu hiển thị sai.
* Đảm bảo frontend dùng đúng dữ liệu API hiện tại.
* Giữ hệ thống ổn định để demo và bảo vệ khóa luận.
* Không làm rối hệ thống bằng việc sửa lan sang backend, database, docs hoặc kiến trúc.

Nguyên tắc ưu tiên:

```text
Sửa đúng bug → Sửa nhỏ nhất có thể → Không đổi cấu trúc → Không ảnh hưởng phần đã ổn định
```

---

## 2. Phạm vi được phép sửa

Chỉ được phép làm các việc sau:

* Đọc và kiểm tra file frontend liên quan đến bug được yêu cầu.
* Sửa logic trong frontend.
* Sửa cách truyền filter ngày, filter kênh, query params hoặc state nếu bị sai.
* Sửa logic tính toán hiển thị ở frontend nếu frontend đang xử lý sai dữ liệu API.
* Sửa mapping dữ liệu API sang UI nếu mapping sai.
* Sửa lỗi render biểu đồ, bảng, KPI, empty state nếu cần.
* Sửa lỗi gọi API sai endpoint, sai params hoặc sai dependency trong `useEffect`.
* Sửa lỗi format số, format ngày, format tiền tệ nếu đang gây hiểu sai.
* Sửa lỗi UI nhỏ phục vụ demo nếu không làm thay đổi layout lớn.
* Chạy build/test frontend để kiểm tra nếu có thể.

Các thư mục/file có thể kiểm tra tùy bug:

```text
src/frontend/
src/frontend/src/
src/frontend/src/pages/
src/frontend/src/components/
src/frontend/src/services/
src/frontend/src/api/
src/frontend/src/hooks/
src/frontend/src/utils/
```

Chỉ sửa file thật sự liên quan đến lỗi.

---

## 3. Những việc tuyệt đối không được làm

Không được thực hiện các việc sau nếu chưa có yêu cầu rõ ràng từ tôi:

* Không cập nhật `docs/`.
* Không sửa `Report.docx`.
* Không sửa `SRS.docx`.
* Không sửa UML.
* Không sửa file báo cáo học thuật.
* Không tạo thêm file tài liệu mới.
* Không sửa backend nếu chưa chứng minh được lỗi gốc nằm ở backend/API và chưa liệt kê rõ phạm vi sửa tối thiểu.
* Không sửa database schema.
* Không tạo migration mới.
* Không đổi kiến trúc hệ thống.
* Không đổi cấu trúc thư mục.
* Không refactor lớn.
* Không đổi UI layout lớn.
* Không thêm module mới.
* Không thêm feature mới.
* Không xóa chức năng đang có.
* Không đổi route hiện tại nếu không bắt buộc.
* Không đổi API contract hiện tại.
* Không đổi tên endpoint.
* Không đổi tên props, state, component nếu không cần thiết.
* Không đổi RBAC/phân quyền.
* Không đổi authentication/JWT.
* Không sửa AI service/FastAPI.
* Không sửa ETL pipeline.
* Không sửa model training.
* Không hardcode số liệu kinh doanh.
* Không dùng mock data nếu API thật đã có.
* Không push GitHub.
* Không commit nếu tôi chưa yêu cầu.

## Quy tắc phạm vi sửa hiện tại

Mặc định chỉ sửa logic frontend tối thiểu.

Tuy nhiên, nếu sau khi kiểm tra frontend xác định rõ lỗi gốc nằm ở backend/API và frontend không thể sửa đúng nếu không chỉnh backend, thì được phép sửa backend ở phạm vi tối thiểu.

Điều kiện được sửa backend:

1. Phải chứng minh được frontend đã gọi đúng API.
2. Phải chỉ ra API trả sai dữ liệu, thiếu field, sai filter, sai query hoặc sai business logic.
3. Phải liệt kê rõ file backend dự kiến sửa trước khi sửa.
4. Chỉ sửa đúng endpoint/service liên quan đến bug.
5. Không đổi API contract nếu không bắt buộc.
6. Không đổi database schema.
7. Không tạo migration mới.
8. Không đổi kiến trúc.
9. Không refactor backend lớn.
10. Không cập nhật docs/report/SRS/UML.

Nếu lỗi có thể sửa an toàn ở frontend thì không sửa backend.

Nếu lỗi nằm ở backend nhưng cần đổi schema/database thì dừng lại và hỏi tôi trước.

---

## 4. Quy trình bắt buộc trước khi sửa

Trước khi sửa bất kỳ lỗi nào, phải làm đúng quy trình sau:

1. Đọc đúng file frontend liên quan đến bug.
2. Xác định lỗi nằm ở đâu.
3. Giải thích ngắn gọn nguyên nhân lỗi.
4. Liệt kê danh sách file dự kiến sửa.
5. Chỉ sửa đúng các file đã liệt kê.
6. Không sửa lan sang file khác nếu chưa cần.
7. Nếu phát hiện lỗi nằm ở backend/API, phải chứng minh bằng request/response cụ thể và liệt kê file backend dự kiến sửa. Chỉ được sửa backend tối thiểu nếu frontend không thể xử lý đúng nếu không chỉnh backend. Nếu lỗi cần sửa database/schema/migration thì dừng lại và hỏi tôi trước.
8. Sau khi sửa, chạy build/test frontend nếu có thể.
9. Báo cáo kết quả sau khi sửa.

Báo cáo kết quả phải có format:

```text
Đã kiểm tra:
- ...

File đã sửa:
- ...

Logic đã sửa:
- ...

Không đụng đến:
- Backend
- Database
- Docs/Report/SRS/UML
- Kiến trúc hệ thống

Kết quả build/test:
- ...
```

---

## 5. Nguyên tắc sửa frontend

Khi sửa frontend, phải tuân thủ:

* Sửa tối thiểu đúng bug.
* Không refactor nếu không cần.
* Không thay đổi component structure nếu logic hiện tại vẫn dùng được.
* Không đổi UI layout lớn nếu tôi chưa yêu cầu.
* Không thêm thư viện mới.
* Không hardcode dữ liệu kinh doanh.
* Không hardcode KPI.
* Không hardcode doanh thu, lợi nhuận, chi phí, đơn hàng.
* Không dùng mock data nếu API thật đã có.
* Nếu API trả rỗng thì hiển thị empty state rõ ràng.
* Nếu API lỗi thì hiển thị lỗi thân thiện, không làm crash page.
* Giữ nguyên style hiện tại nếu không có yêu cầu chỉnh giao diện.
* Giữ nguyên route hiện tại.
* Giữ nguyên API contract hiện tại.
* Giữ nguyên phân quyền hiện tại.
* Giữ nguyên i18n hiện tại nếu có.

---

## 6. Quy tắc xử lý Dashboard, Finance và Filter

Các màn hình dashboard, finance và filter là khu vực ưu tiên cần ổn định để demo.

Khi sửa các phần này, cần chú ý:

* Filter ngày phải gửi đúng `startDate`, `endDate` hoặc params hiện tại mà API đang dùng.
* Filter kênh phải gửi đúng channel hiện tại.
* Không trộn dữ liệu đã lọc theo kênh với dữ liệu toàn hệ thống.
* Không lấy chi phí quảng cáo toàn tháng để trừ cho doanh thu của một ngày nếu filter đang chọn “Hôm nay”, trừ khi API/business rule đã quy định như vậy.
* Không tự tính lại KPI ở frontend nếu backend/API đã trả sẵn số liệu chuẩn.
* Nếu frontend bắt buộc phải tính, phải tính theo dữ liệu API trả về, không hardcode.
* Khi đổi filter, các KPI, biểu đồ và bảng liên quan phải refetch hoặc cập nhật đúng.
* Tránh lỗi `useEffect` thiếu dependency làm dữ liệu không refresh.
* Tránh lỗi gọi API nhiều lần không cần thiết gây chậm dashboard.
* Empty state phải rõ ràng khi không có dữ liệu.
* Không dùng số liệu mẫu để lấp giao diện khi API đã có dữ liệu thật.

---

## 7. Quy tắc với Backend/API

Mặc định không sửa backend.

Chỉ được đọc backend để hiểu API contract, DTO, endpoint và dữ liệu trả về.

Chỉ được sửa backend khi có đủ bằng chứng rằng lỗi gốc nằm ở backend/API và frontend không thể xử lý đúng nếu không sửa backend.

Ví dụ được phép sửa backend tối thiểu:

API không nhận filter ngày/kênh dù frontend đã gửi đúng.
API nhận params đúng nhưng query không áp dụng filter.
API trả sai field khiến frontend không thể mapping đúng.
API trả dữ liệu tổng toàn hệ thống trong khi endpoint được thiết kế để trả dữ liệu theo filter.
Backend tính KPI sai business rule hiện tại.
Backend trả lỗi do thiếu xử lý trường hợp dữ liệu rỗng.

Không được sửa backend trong các trường hợp:

Chỉ để refactor code cho đẹp hơn.
Chỉ để đổi kiến trúc.
Chỉ để đổi naming.
Chỉ để thêm feature mới.
Chỉ để đồng bộ docs.
Chỉ để tạo API mới khi API hiện tại vẫn dùng được.
Cần đổi database schema hoặc migration mới nhưng chưa được tôi duyệt.

Trước khi sửa backend, phải báo rõ:

Lỗi gốc nằm ở backend/API.

Bằng chứng:
- Frontend gửi request: ...
- API response hiện tại: ...
- Kết quả mong muốn: ...
- Nguyên nhân trong backend: ...

File backend dự kiến sửa:
- ...

Phạm vi sửa:
- Sửa tối thiểu endpoint/service liên quan.
- Không đổi schema.
- Không đổi kiến trúc.
- Không cập nhật docs.

Sau khi sửa backend, phải chạy build/test backend nếu có thể và báo cáo rõ.

---

## 8. Quy tắc với Documentation

Hiện tại documentation đã khóa.

Không cập nhật:

```text
docs/
Report.docx
SRS.docx
UML
README
CHANGE_TRACKING
AI_Training_Report
Recommendation docs
Module docs
```

Nếu thay đổi frontend có liên quan đến tài liệu, vẫn không cập nhật docs trong giai đoạn này.

Chỉ báo cáo ngắn gọn trong kết quả sửa code, không tạo file tài liệu mới.

---

## 9. Quy tắc với Git

Không push GitHub.

Không commit nếu tôi chưa yêu cầu.

Nếu tôi yêu cầu commit, commit message phải ngắn gọn, không nhắc đến prompt, Claude, ChatGPT hoặc AI agent.

Ví dụ commit message hợp lệ:

```text
fix: update dashboard date filter logic
fix: refresh finance kpi on channel change
fix: correct chart data mapping
```

Không commit các file sau:

```text
docs/
Report.docx
SRS.docx
CLAUDE.md
PROMPTS.md
.env
.venv/
node_modules/
appsettings.Development.json
```

---

## 10. Cách phản hồi khi làm việc

Khi tôi yêu cầu sửa lỗi, không được sửa ngay theo suy đoán.

Phải phản hồi hoặc thực hiện theo hướng:

```text
Tôi sẽ kiểm tra đúng phần frontend liên quan, xác định lỗi logic, liệt kê file cần sửa rồi mới chỉnh tối thiểu. Tôi sẽ không sửa backend nếu chưa chứng minh được lỗi gốc nằm ở backend/API. Tôi sẽ không sửa database, docs hoặc cấu trúc hệ thống.
```

Sau khi kiểm tra, phải nêu rõ:

```text
Nguyên nhân:
- ...

File cần sửa:
- ...

Phạm vi sửa:
- ...

Không sửa:
- Backend
- Database
- Docs
- Kiến trúc
```

Sau khi sửa xong, phải báo cáo:

```text
Đã sửa:
- ...

File đã sửa:
- ...

Kết quả:
- ...

Không đụng đến:
- Backend, trừ khi có ghi rõ lỗi gốc nằm ở backend/API và đã sửa tối thiểu
- Database/schema/migration
- Docs/Report/SRS/UML
- Kiến trúc hệ thống
```

---

## 11. Nguyên tắc cuối cùng

Dự án hiện tại ưu tiên ổn định hơn mở rộng.

Không cố làm hệ thống “tốt hơn” bằng cách thêm chức năng mới, đổi kiến trúc hoặc refactor lớn.

Chỉ làm đúng việc được yêu cầu:

```text
Fix logic frontend tối thiểu để hệ thống chạy đúng, hiển thị đúng và demo ổn định.
```

Nếu không chắc có nên sửa hay không, phải dừng lại và hỏi trước.

Nếu lỗi nằm ngoài frontend:
- Backend/API: chỉ được sửa tối thiểu khi có bằng chứng rõ ràng và không cần đổi schema.
- Database/schema/migration/AI service/ETL/docs: không tự sửa, phải báo cáo và hỏi tôi trước.