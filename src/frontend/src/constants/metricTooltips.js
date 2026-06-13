// Nguồn chân lý duy nhất cho tất cả tooltip chỉ số/thuật ngữ trong hệ thống MSAS.
// Import: import { MT } from '../../constants/metricTooltips'
// Dùng:   <InfoTooltip {...MT.mae} />

export const MT = {

  // ── DOANH THU / BÁN HÀNG ─────────────────────────────────────────────────
  netRevenue: {
    title: 'Doanh thu thuần',
    description: 'Số tiền thực tế thu được sau khi trừ chiết khấu và mã giảm giá.',
    formula: 'Tổng tiền đơn hàng − Giảm giá & Mã khuyến mãi',
    source: 'Đơn hàng đã giao thành công',
  },
  todayRevenue: {
    title: 'Doanh thu hôm nay',
    description: 'Tổng doanh thu thuần của các đơn hàng phát sinh trong ngày hiện tại.',
    formula: 'Cộng dồn toàn bộ tiền hàng đã bán trong ngày hôm nay',
    source: 'Đơn hàng phát sinh trong ngày',
  },
  totalRevenue: {
    title: 'Tổng doanh thu',
    description: 'Tổng doanh thu thuần tích lũy trong khoảng thời gian đang xem.',
    formula: 'Cộng dồn doanh thu thuần tất cả đơn hàng trong kỳ đã chọn',
    source: 'Đơn hàng trong kỳ đã chọn',
  },
  revenueGrowth: {
    title: 'Tăng trưởng doanh thu',
    description: 'Phần trăm thay đổi doanh thu so với kỳ trước cùng độ dài.',
    formula: '(Doanh thu kỳ này − Kỳ trước) ÷ Kỳ trước × 100%',
    source: 'So sánh doanh thu 2 kỳ liên tiếp',
  },
  channelRevenue: {
    title: 'Doanh thu theo kênh',
    description: 'Phân bổ doanh thu thuần theo từng kênh bán hàng (Shopee, Lazada, TikTok, POS...).',
    formula: 'Cộng dồn doanh thu riêng cho từng kênh bán hàng',
    source: 'Đơn hàng phân loại theo kênh',
  },

  // ── ĐƠN HÀNG ─────────────────────────────────────────────────────────────
  orderCount: {
    title: 'Số đơn hàng',
    description: 'Tổng số đơn hàng phát sinh trong kỳ đang xem, bao gồm mọi trạng thái hợp lệ.',
    formula: 'Đếm tất cả đơn hàng phát sinh trong kỳ đã chọn',
    source: 'Đơn hàng trong hệ thống',
  },
  todayOrders: {
    title: 'Đơn hàng hôm nay',
    description: 'Tổng số đơn hàng phát sinh trong ngày hiện tại.',
    formula: 'Đếm tất cả đơn hàng tạo ra trong ngày hôm nay',
    source: 'Đơn hàng phát sinh trong ngày',
  },
  aov: {
    title: 'Giá trị đơn trung bình (AOV)',
    description: 'Mỗi đơn hàng mang lại trung bình bao nhiêu doanh thu. AOV cao đồng nghĩa khách mua nhiều hơn hoặc mua hàng giá trị cao hơn.',
    formula: 'Doanh thu thuần ÷ Số đơn hàng',
    source: 'Đơn hàng đã giao thành công',
  },
  cancelRate: {
    title: 'Tỷ lệ hủy / hoàn đơn',
    description: 'Phần trăm đơn hàng bị hủy hoặc hoàn trả so với tổng số đơn. Tỷ lệ cao cần xem lại chất lượng sản phẩm hoặc quy trình giao hàng.',
    formula: 'Số đơn bị hủy hoặc hoàn ÷ Tổng số đơn × 100%',
    source: 'Trạng thái đơn hàng trong hệ thống',
  },
  conversionRate: {
    title: 'Tỷ lệ chuyển đổi',
    description: 'Phần trăm lượt xem sản phẩm dẫn đến đơn hàng thực sự. Cần dữ liệu traffic từ sàn TMĐT.',
    formula: 'Số đơn ÷ Số lượt xem sản phẩm × 100%',
    source: 'Dữ liệu lượt xem từ Shopee, Lazada, TikTok (chưa tích hợp tự động)',
  },

  // ── LỢI NHUẬN / TÀI CHÍNH ────────────────────────────────────────────────
  grossProfit: {
    title: 'Lợi nhuận gộp',
    description: 'Lợi nhuận sau khi trừ giá vốn hàng bán. Chưa bao gồm phí sàn, vận chuyển hay chi phí vận hành.',
    formula: 'Doanh thu thuần − Giá vốn hàng bán',
    source: 'Đơn hàng + giá nhập từ phiếu mua hàng',
  },
  grossMargin: {
    title: 'Biên lợi nhuận gộp',
    description: 'Cứ 100 đồng doanh thu thì còn lại bao nhiêu đồng sau khi trừ giá vốn. Ngành thời trang thường đạt 40–60%.',
    formula: 'Lợi nhuận gộp ÷ Doanh thu × 100%',
    source: 'Đơn hàng + giá nhập từ phiếu mua hàng',
  },
  cogs: {
    title: 'Giá vốn hàng bán',
    description: 'Tổng chi phí nhập hàng tương ứng với số lượng sản phẩm đã bán ra trong kỳ.',
    formula: 'Giá nhập × Số lượng bán (tính riêng cho từng sản phẩm)',
    source: 'Giá nhập từ phiếu mua hàng × số lượng bán',
  },
  platformFee: {
    title: 'Phí sàn TMĐT',
    description: 'Tổng các khoản phí khi bán hàng trên sàn: hoa hồng, phí thanh toán, đóng gói, vận chuyển.',
    formula: 'Phí hoa hồng sàn + Phí thanh toán + Chi phí đóng gói + Phí giao hàng (ước tính theo % doanh thu)',
    source: 'Cấu hình phí sàn trong mục Tài chính',
  },
  operatingProfit: {
    title: 'Lợi nhuận vận hành',
    description: 'Lợi nhuận sau tất cả chi phí bán hàng trực tiếp và quảng cáo. KPI quan trọng nhất với shop online.',
    formula: 'Lợi nhuận gộp − Phí sàn − Chi phí quảng cáo − Chi phí khác',
    source: 'Đơn hàng + phí sàn + chi phí quảng cáo nhập tay',
  },
  businessNetProfit: {
    title: 'Lợi nhuận doanh nghiệp ròng',
    description: 'Lợi nhuận cuối cùng sau khi trừ toàn bộ chi phí doanh nghiệp: lương, kho bãi, điện nước...',
    formula: 'Lợi nhuận vận hành − Lương − Chi phí kho & vận hành',
    source: 'Đơn hàng + chi phí quảng cáo + chi phí vận hành nhập tay',
  },
  netAfterFees: {
    title: 'Lợi nhuận sau phí sàn',
    description: 'Lợi nhuận sau khi trừ phí sàn và phí vận chuyển — trước khi trừ chi phí quảng cáo. Nếu âm: shop đã lỗ trước khi chạy quảng cáo.',
    formula: 'Lợi nhuận gộp − Phí hoa hồng sàn − Phí giao hàng',
    source: 'Đơn hàng + cấu hình phí sàn',
  },
  roas: {
    title: 'ROAS — Hiệu quả quảng cáo',
    description: 'Cứ 1 đồng chi cho quảng cáo thì thu về bao nhiêu đồng doanh thu. ROAS từ 4× trở lên là hiệu quả cho thời trang online.',
    formula: 'Doanh thu ÷ Chi phí quảng cáo',
    source: 'Doanh thu đơn hàng + chi phí quảng cáo nhập tay theo tháng',
  },
  acos: {
    title: 'ACOS — Tỷ lệ chi phí quảng cáo',
    description: 'Cứ 100 đồng doanh thu thì phải chi bao nhiêu đồng cho quảng cáo. Càng thấp càng hiệu quả.',
    formula: 'Chi phí quảng cáo ÷ Doanh thu × 100%',
    source: 'Chi phí quảng cáo nhập tay theo tháng + doanh thu đơn hàng',
  },

  // ── KHÁCH HÀNG ────────────────────────────────────────────────────────────
  newCustomers: {
    title: 'Khách hàng mới',
    description: 'Số khách hàng đặt đơn lần đầu tiên trong kỳ. Phản ánh tốc độ mở rộng tệp khách.',
    formula: 'Đếm khách hàng có đơn hàng đầu tiên trong kỳ đang xem',
    source: 'Hồ sơ khách hàng + đơn hàng',
  },
  returningCustomers: {
    title: 'Khách hàng quay lại',
    description: 'Số khách hàng đã từng mua và tiếp tục mua trong kỳ hiện tại. Dấu hiệu của sự hài lòng.',
    formula: 'Đếm khách hàng có từ 2 đơn trở lên, đơn gần nhất nằm trong kỳ đang xem',
    source: 'Hồ sơ khách hàng + đơn hàng',
  },
  retentionRate: {
    title: 'Tỷ lệ khách quay lại',
    description: 'Phần trăm khách hàng quay lại mua ít nhất một lần nữa. Tăng tỷ lệ này 5% có thể tăng lợi nhuận đến 95%.',
    formula: 'Số khách mua từ 2 lần trở lên ÷ Tổng khách hàng × 100%',
    source: 'Hồ sơ khách hàng + đơn hàng',
  },
  rfm: {
    title: 'RFM — Phân khúc khách hàng',
    description: 'Phương pháp phân loại khách hàng dựa trên 3 yếu tố: mua gần đây chưa, mua bao nhiêu lần, và đã chi bao nhiêu tiền.',
    formula: 'Chấm điểm 1–5 cho từng tiêu chí, ghép lại thành nhóm khách hàng',
    source: 'Hồ sơ khách hàng + lịch sử đơn hàng (phân tích AI)',
  },
  recency: {
    title: 'Mức độ mua gần đây',
    description: 'Số ngày kể từ lần mua hàng gần nhất. Điểm cao = mua gần đây → khách còn đang hoạt động.',
    formula: 'Ngày hiện tại − Ngày đặt đơn gần nhất',
    source: 'Lịch sử đơn hàng của khách',
  },
  frequency: {
    title: 'Tần suất mua hàng',
    description: 'Tổng số lần đặt hàng của khách hàng. Tần suất cao = khách hàng trung thành.',
    formula: 'Đếm tổng số đơn hàng của từng khách',
    source: 'Lịch sử đơn hàng của khách',
  },
  monetary: {
    title: 'Tổng giá trị chi tiêu',
    description: 'Tổng số tiền khách hàng đã chi. Giá trị cao = khách hàng VIP, đóng góp doanh thu lớn.',
    formula: 'Cộng dồn toàn bộ tiền hàng khách đã mua từ trước đến nay',
    source: 'Lịch sử đơn hàng của khách',
  },
  customerSegment: {
    title: 'Phân khúc khách hàng',
    description: 'Nhóm khách hàng được phân loại theo hành vi mua: VIP, Trung thành, Thường xuyên, Mới, Nguy cơ rời, Đã mất.',
    formula: 'Xếp nhóm dựa trên điểm mua gần đây + tần suất + giá trị chi tiêu',
    source: 'Lịch sử đơn hàng (phân tích AI)',
  },
  vipCustomer: {
    title: 'Khách hàng VIP',
    description: 'Khách hàng đạt cả 3 tiêu chí ở mức cao nhất: mua gần đây, mua nhiều lần, chi tiêu lớn. Đây là tệp khách cần ưu tiên chăm sóc nhất.',
    formula: 'Mua gần đây + mua nhiều lần + chi tiêu cao — đạt đủ 3 tiêu chí ở ngưỡng cao nhất',
    source: 'Lịch sử đơn hàng (phân tích AI)',
  },
  churnRisk: {
    title: 'Nguy cơ rời bỏ',
    description: 'Khách hàng từng mua nhưng đã lâu không quay lại. Cần có chiến lược win-back.',
    formula: 'Khách có đơn cuối cách đây hơn 60–90 ngày mà không có đơn mới',
    source: 'Lịch sử đơn hàng (phân tích AI)',
  },

  // ── TỒN KHO ───────────────────────────────────────────────────────────────
  currentStock: {
    title: 'Tồn kho hiện tại',
    description: 'Số lượng sản phẩm còn trong kho tại thời điểm hiện tại.',
    formula: 'Số lượng đã nhập kho − Số lượng đã bán − Điều chỉnh kho',
    source: 'Nhật ký nhập/xuất kho trong hệ thống',
  },
  daysOfStock: {
    title: 'Số ngày còn hàng',
    description: 'Ước tính số ngày nữa hàng sẽ hết nếu tiếp tục bán với tốc độ hiện tại.',
    formula: 'Tồn kho hiện tại ÷ Số lượng bán trung bình mỗi ngày (30 ngày qua)',
    source: 'Tồn kho + lịch sử bán hàng 30 ngày gần nhất',
  },
  reorderPoint: {
    title: 'Số lượng cần đặt thêm',
    description: 'Số lượng nên nhập thêm để đưa tồn kho của biến thể lên mức tồn an toàn trong kỳ mục tiêu.',
    formula: 'Cần đặt = max(0, Tồn an toàn − Tồn kho hiện tại)',
    source: 'Tồn kho biến thể + mức tồn an toàn theo tốc độ bán',
  },
  safeStock: {
    title: 'Tồn an toàn',
    description: 'Mức tồn mục tiêu để biến thể đủ bán trong kỳ kế hoạch hiện tại. Biến thể chưa có tốc độ bán dùng mức tối thiểu để vẫn có hàng demo/bán thử.',
    formula: 'Có tốc độ bán: làm tròn lên (Bán/ngày × 30 ngày). Chưa có tốc độ bán: 30 sản phẩm.',
    source: 'Tốc độ bán 30 ngày gần nhất + tồn kho biến thể hiện tại',
  },
  stockCritical: {
    title: 'Tồn kho KHẨN CẤP',
    description: 'Sản phẩm đã hết hàng hoặc chỉ còn đủ bán dưới 7 ngày — cần nhập gấp ngay lập tức.',
    formula: 'Hết hàng HOẶC số ngày còn hàng ≤ 7 ngày',
    source: 'Tồn kho + tốc độ bán 30 ngày qua',
  },
  stockWarning: {
    title: 'Tồn kho SẮP HẾT',
    description: 'Sản phẩm còn đủ bán khoảng 8–14 ngày — cần lên đơn đặt hàng trong tuần này.',
    formula: 'Số ngày còn hàng từ 8 đến 14 ngày',
    source: 'Tồn kho + tốc độ bán 30 ngày qua',
  },
  stockOk: {
    title: 'Tồn kho BÌNH THƯỜNG',
    description: 'Sản phẩm có đủ hàng cho 15–60 ngày bán — trạng thái ổn định, theo dõi định kỳ.',
    formula: 'Số ngày còn hàng từ 15 đến 60 ngày',
    source: 'Tồn kho + tốc độ bán 30 ngày qua',
  },
  stockOverstock: {
    title: 'Tồn kho DƯ HÀNG',
    description: 'Sản phẩm có hàng cho trên 60 ngày bán — nguy cơ tồn kho lâu, đọng vốn. Cân nhắc khuyến mãi để giải phóng hàng.',
    formula: 'Số ngày còn hàng vượt quá 60 ngày',
    source: 'Tồn kho + tốc độ bán 30 ngày qua',
  },
  avgDailySales: {
    title: 'Tốc độ bán (sản phẩm/ngày)',
    description: 'Số lượng sản phẩm bán ra trung bình mỗi ngày trong 30 ngày gần nhất.',
    formula: 'Tổng số lượng bán 30 ngày qua ÷ 30 ngày',
    source: 'Lịch sử bán hàng 30 ngày gần nhất',
  },

  // ── AI / DỰ BÁO ───────────────────────────────────────────────────────────
  forecast: {
    title: 'Dự báo doanh thu',
    description: 'Dự đoán doanh thu trong tương lai dựa trên dữ liệu lịch sử, xu hướng và tính mùa vụ.',
    formula: 'Mô hình AI học từ lịch sử bán hàng, nhận diện xu hướng và tính mùa vụ để dự đoán',
    source: 'Lịch sử doanh thu + mô hình AI đã huấn luyện',
  },
  confidenceInterval: {
    title: 'Khoảng tin cậy',
    description: 'Khoảng giá trị mà doanh thu thực tế có khả năng rơi vào (90% khả năng đúng). Khoảng rộng = độ không chắc cao hơn.',
    formula: 'Dự báo ± biên dao động (dựa trên mức biến động trong quá khứ)',
    source: 'Kết quả từ mô hình dự báo AI',
  },
  mae: {
    title: 'MAE — Sai số trung bình',
    description: 'Trung bình khoảng cách giữa giá trị dự báo và thực tế. MAE thấp = dự báo sát hơn. Đơn vị là VNĐ.',
    formula: 'Trung bình của |Dự báo − Thực tế| trên toàn bộ tập kiểm tra',
    source: 'Kết quả kiểm tra độ chính xác mô hình',
  },
  rmse: {
    title: 'RMSE — Sai số có trọng số',
    description: 'Tương tự sai số trung bình nhưng phạt nặng hơn những ngày sai lệch lớn. Thường cao hơn MAE.',
    formula: 'Căn bậc 2 của trung bình bình phương sai số',
    source: 'Kết quả kiểm tra độ chính xác mô hình',
  },
  mape: {
    title: 'MAPE — Sai số phần trăm',
    description: 'Phần trăm trung bình sai lệch của dự báo so với thực tế. MAPE dưới 15% là tốt.',
    formula: 'Trung bình của |Sai lệch| ÷ |Doanh thu thực tế| × 100%',
    source: 'Kết quả kiểm tra độ chính xác mô hình',
  },
  smape: {
    title: 'SMAPE — Sai số phần trăm cân bằng',
    description: 'Phiên bản cải tiến của MAPE, tránh sai lệch khi doanh thu ngày gần bằng 0 (sau Tết, ngày thường ít đơn). Thang đo 0–200%, càng thấp càng tốt.',
    formula: 'Trung bình của 2×|Sai lệch| ÷ (|Dự báo| + |Thực tế|) × 100%',
    source: 'Kết quả kiểm tra độ chính xác mô hình',
  },
  anomaly: {
    title: 'Bất thường (Anomaly)',
    description: 'Ngày có doanh thu lệch đáng kể so với xu hướng bình thường. Có thể là cơ hội (đột biến tốt) hoặc sự cố (đột biến xấu).',
    formula: 'Doanh thu hôm nay lệch quá xa so với trung bình 14 ngày gần nhất',
    source: 'Dữ liệu doanh thu ngày (phân tích AI tự động)',
  },
  zScore: {
    title: 'Mức độ lệch chuẩn',
    description: 'Đo mức độ lệch của một ngày so với xu hướng bình thường. Lệch trên 2.5 là bất thường đáng chú ý, trên 3.0 là rất bất thường.',
    formula: '(Doanh thu hôm nay − Trung bình 14 ngày gần nhất) ÷ Độ biến động thường ngày',
    source: 'Dữ liệu doanh thu ngày (phân tích AI)',
  },

  // ── ĐA KÊNH / PHÂN BỔ ────────────────────────────────────────────────────
  salesChannel: {
    title: 'Kênh bán hàng',
    description: 'Nơi phát sinh đơn hàng: Shopee, Lazada, TikTok Shop, Facebook Shop, POS (bán trực tiếp), Website...',
    formula: 'Mỗi đơn hàng được gắn với kênh bán hàng tương ứng khi tạo đơn',
    source: 'Đơn hàng phân loại theo kênh',
  },
  roi: {
    title: 'ROI — Tỷ suất hoàn vốn',
    description: 'Lợi nhuận thu được so với chi phí đầu tư vào kênh (quảng cáo, phí sàn). ROI dương = có lãi, âm = đang lỗ.',
    formula: '(Lợi nhuận − Chi phí đầu tư) ÷ Chi phí đầu tư × 100%',
    source: 'Doanh thu + chi phí quảng cáo theo kênh',
  },
  lastSync: {
    title: 'Lần đồng bộ cuối',
    description: 'Thời điểm gần nhất dữ liệu từ kênh bán hàng hoặc nguồn ngoài được cập nhật vào hệ thống.',
    formula: 'Thời điểm pipeline dữ liệu chạy thành công gần nhất',
    source: 'Nhật ký đồng bộ dữ liệu hệ thống',
  },
  etl: {
    title: 'Thu thập & xử lý dữ liệu tự động',
    description: 'Quy trình tự động lấy dữ liệu từ nhiều nguồn, chuẩn hóa rồi nạp vào kho dữ liệu trung tâm để phân tích.',
    formula: 'Lấy dữ liệu → Làm sạch & chuẩn hóa → Nạp vào kho dữ liệu (chạy tự động mỗi 30 phút)',
    source: 'Pipeline dữ liệu hệ thống',
  },
  dataWarehouse: {
    title: 'Kho dữ liệu phân tích',
    description: 'Kho dữ liệu trung tâm lưu trữ dữ liệu đã được chuẩn hóa từ tất cả kênh bán hàng, dùng cho Dashboard và báo cáo.',
    formula: 'Dữ liệu từ tất cả kênh được hợp nhất theo cấu trúc chuẩn để phân tích nhanh',
    source: 'Dữ liệu tổng hợp từ tất cả kênh bán hàng',
  },

  // ── BASKET ANALYSIS ───────────────────────────────────────────────────────
  support: {
    title: 'Tần suất xuất hiện cùng nhau',
    description: 'Tỷ lệ đơn hàng có chứa đồng thời các sản phẩm trong cặp gợi ý. Tỷ lệ cao = cặp sản phẩm thường xuyên được mua cùng nhau.',
    formula: 'Số đơn có cả 2 sản phẩm ÷ Tổng số đơn',
    source: 'Phân tích giỏ hàng từ lịch sử đơn hàng',
  },
  confidence: {
    title: 'Xác suất mua kèm',
    description: 'Khi khách mua sản phẩm A, xác suất họ cũng mua sản phẩm B. Càng cao càng nên gợi ý bán kèm.',
    formula: 'Số đơn mua cả A lẫn B ÷ Số đơn chỉ mua A',
    source: 'Phân tích giỏ hàng từ lịch sử đơn hàng',
  },
  lift: {
    title: 'Mức tăng tương quan',
    description: 'Mức độ A và B được mua cùng nhau so với ngẫu nhiên. Trên 1 = có mối liên hệ thực sự. Bằng 1 = ngẫu nhiên. Dưới 1 = ít xảy ra cùng nhau.',
    formula: 'Xác suất mua kèm ÷ Xác suất mua B độc lập',
    source: 'Phân tích giỏ hàng từ lịch sử đơn hàng',
  },

  // ── NHÀ CUNG CẤP ─────────────────────────────────────────────────────────
  onTimeRate: {
    title: 'Tỷ lệ giao hàng đúng hạn',
    description: 'Phần trăm lô hàng được nhà cung cấp giao đúng hoặc trước ngày cam kết. Tỷ lệ cao = nhà cung cấp đáng tin cậy.',
    formula: 'Số lô hàng giao đúng hạn ÷ Tổng số lô hàng × 100%',
    source: 'Phiếu nhập kho trong hệ thống',
  },
  leadTime: {
    title: 'Thời gian giao hàng trung bình',
    description: 'Số ngày trung bình từ khi đặt hàng đến khi nhận được hàng. Thời gian ngắn = linh hoạt hơn trong quản lý tồn kho.',
    formula: 'Trung bình số ngày (Ngày nhận hàng − Ngày đặt hàng) theo từng nhà cung cấp',
    source: 'Đơn đặt hàng + phiếu nhập kho',
  },
  qualityScore: {
    title: 'Điểm chất lượng nhà cung cấp',
    description: 'Đánh giá tổng hợp về chất lượng hàng hóa nhận được từ nhà cung cấp (1–5 sao). Dựa trên số lô hàng lỗi, thiếu hàng, sai quy cách.',
    formula: 'Trung bình điểm đánh giá qua các lần nhập hàng',
    source: 'Đánh giá ghi nhận khi xác nhận phiếu nhập kho',
  },

  // ── WHAT-IF / MÔ PHỎNG ───────────────────────────────────────────────────
  whatIfBaseline: {
    title: 'Kịch bản không thay đổi',
    description: 'Kết quả dự kiến nếu giữ nguyên chiến lược hiện tại, không áp dụng thay đổi nào.',
    formula: 'Dự báo doanh thu với thông số vận hành hiện tại',
    source: 'Mô hình dự báo + dữ liệu lịch sử',
  },
  whatIfSimulated: {
    title: 'Kịch bản mô phỏng thay đổi',
    description: 'Kết quả ước tính khi áp dụng kịch bản thay đổi (điều chỉnh giá, khuyến mãi, thêm kênh mới, tăng ngân sách QC).',
    formula: 'Dự báo cơ sở × (1 + mức tác động ước tính theo kịch bản)',
    source: 'Mô hình dự báo + hệ số tác động kinh doanh',
  },

  // ── CHIẾN DỊCH / MÙA VỤ ─────────────────────────────────────────────────
  highSeason: {
    title: 'Tháng cao điểm',
    description: 'Tháng có doanh thu trung bình cao nhất trong năm dựa trên lịch sử. Nên tăng tồn kho và ngân sách quảng cáo.',
    formula: 'Tháng có doanh thu trung bình cao nhất qua các năm trong lịch sử',
    source: 'Dữ liệu doanh thu lịch sử',
  },
  lowSeason: {
    title: 'Tháng thấp điểm',
    description: 'Tháng có doanh thu trung bình thấp nhất. Nên giảm tồn kho và điều chỉnh chi phí.',
    formula: 'Tháng có doanh thu trung bình thấp nhất qua các năm trong lịch sử',
    source: 'Dữ liệu doanh thu lịch sử',
  },
}
