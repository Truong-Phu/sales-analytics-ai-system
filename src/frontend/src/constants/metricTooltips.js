// Nguồn chân lý duy nhất cho tất cả tooltip chỉ số/thuật ngữ trong hệ thống MSAS.
// Import: import { MT } from '../../constants/metricTooltips'
// Dùng:   <InfoTooltip {...MT.mae} />
import i18n from '../i18n'

const isEn = () => i18n.language === 'en'

export const MT = {

  // ── DOANH THU / BÁN HÀNG ─────────────────────────────────────────────────
  netRevenue: {
    get title() { return isEn() ? 'Net Revenue' : 'Doanh thu thuần' },
    get description() { return isEn() ? 'Actual money earned after subtracting discounts and vouchers.' : 'Số tiền thực tế thu được sau khi trừ chiết khấu và mã giảm giá.' },
    get formula() { return isEn() ? 'Total order value − Discounts & Promos' : 'Tổng tiền đơn hàng − Giảm giá & Mã khuyến mãi' },
    get source() { return isEn() ? 'Successfully delivered orders' : 'Đơn hàng đã giao thành công' },
  },
  todayRevenue: {
    get title() { return isEn() ? "Today's Revenue" : 'Doanh thu hôm nay' },
    get description() { return isEn() ? 'Total net revenue of orders placed on the current day.' : 'Tổng doanh thu thuần của các đơn hàng phát sinh trong ngày hiện tại.' },
    get formula() { return isEn() ? 'Sum of all sales today' : 'Cộng dồn toàn bộ tiền hàng đã bán trong ngày hôm nay' },
    get source() { return isEn() ? 'Orders placed today' : 'Đơn hàng phát sinh trong ngày' },
  },
  totalRevenue: {
    get title() { return isEn() ? 'Total Revenue' : 'Tổng doanh thu' },
    get description() { return isEn() ? 'Total accumulated net revenue during the selected period.' : 'Tổng doanh thu thuần tích lũy trong khoảng thời gian đang xem.' },
    get formula() { return isEn() ? 'Sum of net revenue of all orders in selected period' : 'Cộng dồn doanh thu thuần tất cả đơn hàng trong kỳ đã chọn' },
    get source() { return isEn() ? 'Orders in selected period' : 'Đơn hàng trong kỳ đã chọn' },
  },
  revenueGrowth: {
    get title() { return isEn() ? 'Revenue Growth' : 'Tăng trưởng doanh thu' },
    get description() { return isEn() ? 'Percentage change in revenue compared to previous period of same length.' : 'Phần trăm thay đổi doanh thu so với kỳ trước cùng độ dài.' },
    get formula() { return isEn() ? '(Current Period Revenue − Previous Period) ÷ Previous Period × 100%' : '(Doanh thu kỳ này − Kỳ trước) ÷ Kỳ trước × 100%' },
    get source() { return isEn() ? 'Comparison between two consecutive periods' : 'So sánh doanh thu 2 kỳ liên tiếp' },
  },
  channelRevenue: {
    get title() { return isEn() ? 'Revenue by Channel' : 'Doanh thu theo kênh' },
    get description() { return isEn() ? 'Distribution of net revenue across sales channels (Shopee, Lazada, TikTok, POS...).' : 'Phân bổ doanh thu thuần theo từng kênh bán hàng (Shopee, Lazada, TikTok, POS...).' },
    get formula() { return isEn() ? 'Sum of revenue specific to each channel' : 'Cộng dồn doanh thu riêng cho từng kênh bán hàng' },
    get source() { return isEn() ? 'Orders categorized by channel' : 'Đơn hàng phân loại theo kênh' },
  },

  // ── ĐƠN HÀNG ─────────────────────────────────────────────────────────────
  orderCount: {
    get title() { return isEn() ? 'Total Orders' : 'Số đơn hàng' },
    get description() { return isEn() ? 'Total orders placed in the selected period, including all valid statuses.' : 'Tổng số đơn hàng phát sinh trong kỳ đang xem, bao gồm mọi trạng thái hợp lệ.' },
    get formula() { return isEn() ? 'Count of all orders in the selected period' : 'Đếm tất cả đơn hàng phát sinh trong kỳ đã chọn' },
    get source() { return isEn() ? 'Orders in system' : 'Đơn hàng trong hệ thống' },
  },
  todayOrders: {
    get title() { return isEn() ? "Today's Orders" : 'Đơn hàng hôm nay' },
    get description() { return isEn() ? 'Total orders placed on the current day.' : 'Tổng số đơn hàng phát sinh trong ngày hiện tại.' },
    get formula() { return isEn() ? 'Count of all orders created today' : 'Đếm tất cả đơn hàng tạo ra trong ngày hôm nay' },
    get source() { return isEn() ? 'Orders placed today' : 'Đơn hàng phát sinh trong ngày' },
  },
  aov: {
    get title() { return isEn() ? 'Average Order Value (AOV)' : 'Giá trị đơn trung bình (AOV)' },
    get description() { return isEn() ? 'Average revenue generated per order. High AOV means customers purchase more items or higher value items.' : 'Mỗi đơn hàng mang lại trung bình bao nhiêu doanh thu. AOV cao đồng nghĩa khách mua nhiều hơn hoặc mua hàng giá trị cao hơn.' },
    get formula() { return isEn() ? 'Net Revenue ÷ Total Orders' : 'Doanh thu thuần ÷ Số đơn hàng' },
    get source() { return isEn() ? 'Successfully delivered orders' : 'Đơn hàng đã giao thành công' },
  },
  cancelRate: {
    get title() { return isEn() ? 'Cancellation / Return Rate' : 'Tỷ lệ hủy / hoàn đơn' },
    get description() { return isEn() ? 'Percentage of cancelled or returned orders. High rate indicates issues in product quality or delivery.' : 'Phần trăm đơn hàng bị hủy hoặc hoàn trả so với tổng số đơn. Tỷ lệ cao cần xem lại chất lượng sản phẩm hoặc quy trình giao hàng.' },
    get formula() { return isEn() ? 'Cancelled or returned orders ÷ Total orders × 100%' : 'Số đơn bị hủy hoặc hoàn ÷ Tổng số đơn × 100%' },
    get source() { return isEn() ? 'Order status in the system' : 'Trạng thái đơn hàng trong hệ thống' },
  },
  conversionRate: {
    get title() { return isEn() ? 'Conversion Rate' : 'Tỷ lệ chuyển đổi' },
    get description() { return isEn() ? 'Percentage of product views leading to an order. Requires traffic data from e-commerce platforms.' : 'Phần trăm lượt xem sản phẩm dẫn đến đơn hàng thực sự. Cần dữ liệu traffic từ sàn TMĐT.' },
    get formula() { return isEn() ? 'Total Orders ÷ Product Views × 100%' : 'Số đơn ÷ Số lượt xem sản phẩm × 100%' },
    get source() { return isEn() ? 'View data from Shopee, Lazada, TikTok (not yet auto-integrated)' : 'Dữ liệu lượt xem từ Shopee, Lazada, TikTok (chưa tích hợp tự động)' },
  },

  // ── LỢI NHUẬN / TÀI CHÍNH ────────────────────────────────────────────────
  grossProfit: {
    get title() { return isEn() ? 'Gross Profit' : 'Lợi nhuận gộp' },
    get description() { return isEn() ? 'Profit after subtracting Cost of Goods Sold. Excludes platform fees, shipping, or operations.' : 'Lợi nhuận sau khi trừ giá vốn hàng bán. Chưa bao gồm phí sàn, vận chuyển hay chi phí vận hành.' },
    get formula() { return isEn() ? 'Net Revenue − Cost of Goods Sold' : 'Doanh thu thuần − Giá vốn hàng bán' },
    get source() { return isEn() ? 'Orders + Cost price from purchase orders' : 'Đơn hàng + giá nhập từ phiếu mua hàng' },
  },
  grossMargin: {
    get title() { return isEn() ? 'Gross Profit Margin' : 'Biên lợi nhuận gộp' },
    get description() { return isEn() ? 'Percentage of revenue remaining after subtracting COGS. Fashion industry typical range is 40–60%.' : 'Cứ 100 đồng doanh thu thì còn lại bao nhiêu đồng sau khi trừ giá vốn. Ngành thời trang thường đạt 40–60%.' },
    get formula() { return isEn() ? 'Gross Profit ÷ Revenue × 100%' : 'Lợi nhuận gộp ÷ Doanh thu × 100%' },
    get source() { return isEn() ? 'Orders + Cost price from purchase orders' : 'Đơn hàng + giá nhập từ phiếu mua hàng' },
  },
  cogs: {
    get title() { return isEn() ? 'Cost of Goods Sold (COGS)' : 'Giá vốn hàng bán' },
    get description() { return isEn() ? 'Total purchase cost corresponding to the quantity of products sold in the period.' : 'Tổng chi phí nhập hàng tương ứng với số lượng sản phẩm đã bán ra trong kỳ.' },
    get formula() { return isEn() ? 'Cost Price × Quantity Sold (calculated for each product)' : 'Giá nhập × Số lượng bán (tính riêng cho từng sản phẩm)' },
    get source() { return isEn() ? 'Cost price from purchase orders × quantity sold' : 'Giá nhập từ phiếu mua hàng × số lượng bán' },
  },
  platformFee: {
    get title() { return isEn() ? 'Platform Fees' : 'Phí sàn TMĐT' },
    get description() { return isEn() ? 'Total selling fees on platforms: commission, payment fee, packaging, shipping.' : 'Tổng các khoản phí khi bán hàng trên sàn: hoa hồng, phí thanh toán, đóng gói, vận chuyển.' },
    get formula() { return isEn() ? 'Commission + Payment fee + Packaging + Shipping (estimated as % of revenue)' : 'Phí hoa hồng sàn + Phí thanh toán + Chi phí đóng gói + Phí giao hàng (ước tính theo % doanh thu)' },
    get source() { return isEn() ? 'Platform fee configuration in Finance' : 'Cấu hình phí sàn trong mục Tài chính' },
  },
  operatingProfit: {
    get title() { return isEn() ? 'Operating Profit' : 'Lợi nhuận vận hành' },
    get description() { return isEn() ? 'Profit after all direct selling costs and ads. Most important KPI for online shops.' : 'Lợi nhuận sau tất cả chi phí bán hàng trực tiếp và quảng cáo. KPI quan trọng nhất với shop online.' },
    get formula() { return isEn() ? 'Gross Profit − Platform Fees − Ad Spend − Other direct costs' : 'Lợi nhuận gộp − Phí sàn − Chi phí quảng cáo − Chi phí khác' },
    get source() { return isEn() ? 'Orders + Platform fees + Manual ad spend input' : 'Đơn hàng + phí sàn + chi phí quảng cáo nhập tay' },
  },
  businessNetProfit: {
    get title() { return isEn() ? 'Business Net Profit' : 'Lợi nhuận doanh nghiệp ròng' },
    get description() { return isEn() ? 'Final profit after subtracting all business expenses: salaries, warehouse, utilities...' : 'Lợi nhuận cuối cùng sau khi trừ toàn bộ chi phí doanh nghiệp: lương, kho bãi, điện nước...' },
    get formula() { return isEn() ? 'Operating Profit − Salary − Rent & Operations Cost' : 'Lợi nhuận vận hành − Lương − Chi phí kho & vận hành' },
    get source() { return isEn() ? 'Orders + Ad spend + Manual operating expenses input' : 'Đơn hàng + chi phí quảng cáo + chi phí vận hành nhập tay' },
  },
  netAfterFees: {
    get title() { return isEn() ? 'Net After Fees' : 'Lợi nhuận sau phí sàn' },
    get description() { return isEn() ? 'Profit after platform and shipping fees — before advertising cost. If negative, shop is losing money before ads.' : 'Lợi nhuận sau khi trừ phí sàn và phí vận chuyển — trước khi trừ chi phí quảng cáo. Nếu âm: shop đã lỗ trước khi chạy quảng cáo.' },
    get formula() { return isEn() ? 'Gross Profit − Platform Commission − Shipping Fee' : 'Lợi nhuận gộp − Phí hoa hồng sàn − Phí giao hàng' },
    get source() { return isEn() ? 'Orders + Platform fee configuration' : 'Đơn hàng + cấu hình phí sàn' },
  },
  roas: {
    get title() { return isEn() ? 'ROAS — Return on Ad Spend' : 'ROAS — Hiệu quả quảng cáo' },
    get description() { return isEn() ? 'Revenue generated per unit spent on advertising. ROAS >= 4x is considered efficient.' : 'Cử 1 đồng chi cho quảng cáo thì thu về bao nhiêu đồng doanh thu. ROAS từ 4× trở lên là hiệu quả cho thời trang online.' },
    get formula() { return isEn() ? 'Revenue ÷ Ad Spend' : 'Doanh thu ÷ Chi phí quảng cáo' },
    get source() { return isEn() ? 'Revenue from orders + Manual monthly ad spend input' : 'Doanh thu đơn hàng + chi phí quảng cáo nhập tay theo tháng' },
  },
  acos: {
    get title() { return isEn() ? 'ACOS — Advertising Cost of Sales' : 'ACOS — Tỷ lệ chi phí quảng cáo' },
    get description() { return isEn() ? 'Advertising cost as a percentage of generated revenue. Lower is more efficient.' : 'Cử 100 đồng doanh thu thì phải chi bao nhiêu đồng cho quảng cáo. Càng thấp càng hiệu quả.' },
    get formula() { return isEn() ? 'Ad Spend ÷ Revenue × 100%' : 'Chi phí quảng cáo ÷ Doanh thu × 100%' },
    get source() { return isEn() ? 'Manual monthly ad spend + revenue from orders' : 'Chi phí quảng cáo nhập tay theo tháng + doanh thu đơn hàng' },
  },

  // ── KHÁCH HÀNG ────────────────────────────────────────────────────────────
  newCustomers: {
    get title() { return isEn() ? 'New Customers' : 'Khách hàng mới' },
    get description() { return isEn() ? 'Number of customers making their first purchase. Reflects database growth.' : 'Số khách hàng đặt đơn lần đầu tiên trong kỳ. Phản ánh tốc độ mở rộng tệp khách.' },
    get formula() { return isEn() ? 'Count of customers with their first order in the period' : 'Đếm khách hàng có đơn hàng đầu tiên trong kỳ đang xem' },
    get source() { return isEn() ? 'Customer profiles + Orders' : 'Hồ sơ khách hàng + đơn hàng' },
  },
  returningCustomers: {
    get title() { return isEn() ? 'Returning Customers' : 'Khách hàng quay lại' },
    get description() { return isEn() ? 'Number of returning customers purchasing in the period. Signal of customer satisfaction.' : 'Số khách hàng đã từng mua và tiếp tục mua trong kỳ hiện tại. Dấu hiệu của sự hài lòng.' },
    get formula() { return isEn() ? 'Count of customers with >= 2 orders, with latest in selected period' : 'Đếm khách hàng có từ 2 đơn trở lên, đơn gần nhất nằm trong kỳ đang xem' },
    get source() { return isEn() ? 'Customer profiles + Orders' : 'Hồ sơ khách hàng + đơn hàng' },
  },
  retentionRate: {
    get title() { return isEn() ? 'Retention Rate' : 'Tỷ lệ khách quay lại' },
    get description() { return isEn() ? 'Percentage of customers making repeat purchases. A 5% increase in retention can boost profit by 95%.' : 'Phần trăm khách hàng quay lại mua ít nhất một lần nữa. Tăng tỷ lệ này 5% có thể tăng lợi nhuận đến 95%.' },
    get formula() { return isEn() ? 'Repeat Customers ÷ Total Customers × 100%' : 'Số khách mua từ 2 lần trở lên ÷ Tổng khách hàng × 100%' },
    get source() { return isEn() ? 'Customer profiles + Orders' : 'Hồ sơ khách hàng + đơn hàng' },
  },
  rfm: {
    get title() { return isEn() ? 'RFM Analysis' : 'RFM — Phân khúc khách hàng' },
    get description() { return isEn() ? 'Customer segmentation based on Recency, Frequency, and Monetary values.' : 'Phương pháp phân loại khách hàng dựa trên 3 yếu tố: mua gần đây chưa, mua bao nhiêu lần, và đã chi bao nhiêu tiền.' },
    get formula() { return isEn() ? 'Score 1-5 for each metric, combine into segment profiles' : 'Chấm điểm 1–5 cho từng tiêu chí, ghép lại thành nhóm khách hàng' },
    get source() { return isEn() ? 'Customer profiles + order history (AI analyzed)' : 'Hồ sơ khách hàng + lịch sử đơn hàng (phân tích AI)' },
  },
  recency: {
    get title() { return isEn() ? 'Recency' : 'Mức độ mua gần đây' },
    get description() { return isEn() ? 'Days since the last purchase. Lower is better (actively engaged customer).' : 'Số ngày kể từ lần mua hàng gần nhất. Điểm cao = mua gần đây → khách còn đang hoạt động.' },
    get formula() { return isEn() ? 'Current Date − Last Order Date' : 'Ngày hiện tại − Ngày đặt đơn gần nhất' },
    get source() { return isEn() ? 'Order history of the customer' : 'Lịch sử đơn hàng của khách' },
  },
  frequency: {
    get title() { return isEn() ? 'Frequency' : 'Tần suất mua hàng' },
    get description() { return isEn() ? 'Total orders placed by the customer. High frequency = loyal customer.' : 'Tổng số lần đặt hàng của khách hàng. Tần suất cao = khách hàng trung thành.' },
    get formula() { return isEn() ? 'Count of total orders of each customer' : 'Đếm tổng số đơn hàng của từng khách' },
    get source() { return isEn() ? 'Order history of the customer' : 'Lịch sử đơn hàng của khách' },
  },
  monetary: {
    get title() { return isEn() ? 'Monetary Value' : 'Tổng giá trị chi tiêu' },
    get description() { return isEn() ? 'Total revenue spent by the customer. High value = VIP customer.' : 'Tổng số tiền khách hàng đã chi. Giá trị cao = khách hàng VIP, đóng góp doanh thu lớn.' },
    get formula() { return isEn() ? 'Sum of all purchase values of each customer' : 'Cộng dồn toàn bộ tiền hàng khách đã mua từ trước đến nay' },
    get source() { return isEn() ? 'Order history of the customer' : 'Lịch sử đơn hàng của khách' },
  },
  customerSegment: {
    get title() { return isEn() ? 'Customer Segment' : 'Phân khúc khách hàng' },
    get description() { return isEn() ? 'Customer group based on purchase behavior: VIP, Loyal, Active, New, At Risk, Lost.' : 'Nhóm khách hàng được phân loại theo hành vi mua: VIP, Trung thành, Thường xuyên, Mới, Nguy cơ rời, Đã mất.' },
    get formula() { return isEn() ? 'Categorize based on Recency + Frequency + Monetary scores' : 'Xếp nhóm dựa trên điểm mua gần đây + tần suất + giá trị chi tiêu' },
    get source() { return isEn() ? 'Order history (AI analyzed)' : 'Lịch sử đơn hàng (phân tích AI)' },
  },
  vipCustomer: {
    get title() { return isEn() ? 'VIP Customer' : 'Khách hàng VIP' },
    get description() { return isEn() ? 'Customers scoring highest on all 3 metrics: purchase recently, buy frequently, spend big.' : 'Khách hàng đạt cả 3 tiêu chí ở mức cao nhất: mua gần đây, mua nhiều lần, chi tiêu lớn. Đây là tệp khách cần ưu tiên chăm sóc nhất.' },
    get formula() { return isEn() ? 'High Recency + High Frequency + High Monetary (top thresholds)' : 'Mua gần đây + mua nhiều lần + chi tiêu cao — đạt đủ 3 tiêu chí ở ngưỡng cao nhất' },
    get source() { return isEn() ? 'Order history (AI analyzed)' : 'Lịch sử đơn hàng (phân tích AI)' },
  },
  churnRisk: {
    get title() { return isEn() ? 'Churn Risk' : 'Nguy cơ rời bỏ' },
    get description() { return isEn() ? 'Customers who used to buy but have not returned for a long time. Needs win-back strategies.' : 'Khách hàng từng mua nhưng đã lâu không quay lại. Cần có chiến lược win-back.' },
    get formula() { return isEn() ? 'Last order date was > 60-90 days ago with no subsequent purchases' : 'Khách có đơn cuối cách đây hơn 60–90 ngày mà không có đơn mới' },
    get source() { return isEn() ? 'Order history (AI analyzed)' : 'Lịch sử đơn hàng (phân tích AI)' },
  },

  // ── TỒN KHO ───────────────────────────────────────────────────────────────
  currentStock: {
    get title() { return isEn() ? 'Current Stock' : 'Tồn kho hiện tại' },
    get description() { return isEn() ? 'Quantity of products available in warehouse at the current moment.' : 'Số lượng sản phẩm còn trong kho tại thời điểm hiện tại.' },
    get formula() { return isEn() ? 'Received stock − Sold quantity − Stock adjustments' : 'Số lượng đã nhập kho − Số lượng đã bán − Điều chỉnh kho' },
    get source() { return isEn() ? 'Warehouse transaction logs' : 'Nhật ký nhập/xuất kho trong hệ thống' },
  },
  daysOfStock: {
    get title() { return isEn() ? 'Days of Stock' : 'Số ngày còn hàng' },
    get description() { return isEn() ? 'Estimated days before product goes out of stock based on current sales speed.' : 'Ước tính số ngày nữa hàng sẽ hết nếu tiếp tục bán với tốc độ hiện tại.' },
    get formula() { return isEn() ? 'Current Stock ÷ Avg. daily sales quantity (last 30 days)' : 'Tồn kho hiện tại ÷ Số lượng bán trung bình mỗi ngày (30 ngày qua)' },
    get source() { return isEn() ? 'Inventory levels + sales history of last 30 days' : 'Tồn kho + lịch sử bán hàng 30 ngày gần nhất' },
  },
  reorderPoint: {
    get title() { return isEn() ? 'Quantity to Reorder' : 'Số lượng cần đặt thêm' },
    get description() { return isEn() ? 'Quantity that should be purchased to restore variant stock to safety levels.' : 'Số lượng nên nhập thêm để đưa tồn kho của biến thể lên mức tồn an toàn trong kỳ mục tiêu.' },
    get formula() { return isEn() ? 'Required = max(0, Safety Stock − Current Stock)' : 'Cần đặt = max(0, Tồn an toàn − Tồn kho hiện tại)' },
    get source() { return isEn() ? 'Variant stock + safety stock target' : 'Tồn kho biến thể + mức tồn an toàn theo tốc độ bán' },
  },
  safeStock: {
    get title() { return isEn() ? 'Safety Stock' : 'Tồn an toàn' },
    get description() { return isEn() ? 'Target inventory level to meet demand during planning period. Default minimum applied for testing.' : 'Mức tồn mục tiêu để biến thể đủ bán trong kỳ kế hoạch hiện tại. Biến thể chưa có tốc độ bán dùng mức tối thiểu để vẫn có hàng demo/bán thử.' },
    get formula() { return isEn() ? 'With sales speed: ceil(Sales/day × 30 days). Without sales speed: 30 items.' : 'Có tốc độ bán: làm tròn lên (Bán/ngày × 30 ngày). Chưa có tốc độ bán: 30 sản phẩm.' },
    get source() { return isEn() ? 'Sales speed of last 30 days + current variant stock' : 'Tốc độ bán 30 ngày gần nhất + tồn kho biến thể hiện tại' },
  },
  stockCritical: {
    get title() { return isEn() ? 'CRITICAL Out of Stock' : 'Tồn kho KHẨN CẤP' },
    get description() { return isEn() ? 'Out of stock or less than 7 days of supply left — urgent replenishment needed.' : 'Sản phẩm đã hết hàng hoặc chỉ còn đủ bán dưới 7 ngày — cần nhập gấp ngay lập tức.' },
    get formula() { return isEn() ? 'Out of Stock OR Days of Stock <= 7' : 'Hết hàng HOẶC số ngày còn hàng ≤ 7 ngày' },
    get source() { return isEn() ? 'Inventory + 30-day sales speed' : 'Tồn kho + tốc độ bán 30 ngày qua' },
  },
  stockWarning: {
    get title() { return isEn() ? 'Low Stock Warning' : 'Tồn kho SẮP HẾT' },
    get description() { return isEn() ? 'Sufficient for 8–14 days of sales — plan a purchase order this week.' : 'Sản phẩm còn đủ bán khoảng 8–14 ngày — cần lên đơn đặt hàng trong tuần này.' },
    get formula() { return isEn() ? 'Days of Stock between 8 and 14 days' : 'Số ngày còn hàng từ 8 đến 14 ngày' },
    get source() { return isEn() ? 'Inventory + 30-day sales speed' : 'Tồn kho + tốc độ bán 30 ngày qua' },
  },
  stockOk: {
    get title() { return isEn() ? 'Normal Stock' : 'Tồn kho BÌNH THƯỜNG' },
    get description() { return isEn() ? 'Sufficient for 15–60 days of sales — stable status, monitor periodically.' : 'Sản phẩm có đủ hàng cho 15–60 ngày bán — trạng thái ổn định, theo dõi định kỳ.' },
    get formula() { return isEn() ? 'Days of Stock between 15 and 60 days' : 'Số ngày còn hàng từ 15 đến 60 ngày' },
    get source() { return isEn() ? 'Inventory + 30-day sales speed' : 'Tồn kho + tốc độ bán 30 ngày qua' },
  },
  stockOverstock: {
    get title() { return isEn() ? 'Overstocked' : 'Tồn kho DƯ HÀNG' },
    get description() { return isEn() ? 'Sufficient for > 60 days of sales — capital tied up. Consider promotion to liquidate.' : 'Sản phẩm có hàng cho trên 60 ngày bán — nguy cơ tồn kho lâu, đọng vốn. Cân nhắc khuyến mãi để giải phóng hàng.' },
    get formula() { return isEn() ? 'Days of Stock exceeds 60 days' : 'Số ngày còn hàng vượt quá 60 ngày' },
    get source() { return isEn() ? 'Inventory + 30-day sales speed' : 'Tồn kho + tốc độ bán 30 ngày qua' },
  },
  avgDailySales: {
    get title() { return isEn() ? 'Sales Speed (units/day)' : 'Tốc độ bán (sản phẩm/ngày)' },
    get description() { return isEn() ? 'Average quantity of products sold per day in the last 30 days.' : 'Số lượng sản phẩm bán ra trung bình mỗi ngày trong 30 ngày gần nhất.' },
    get formula() { return isEn() ? 'Total sold quantity in last 30 days ÷ 30 days' : 'Tổng số lượng bán 30 ngày qua ÷ 30 ngày' },
    get source() { return isEn() ? 'Sales history of last 30 days' : 'Lịch sử bán hàng 30 ngày gần nhất' },
  },

  // ── AI / DỰ BÁO ───────────────────────────────────────────────────────────
  forecast: {
    get title() { return isEn() ? 'Revenue Forecast' : 'Dự báo doanh thu' },
    get description() { return isEn() ? 'Future revenue estimation based on historical data, trends, and seasonal components.' : 'Dự đoán doanh thu trong tương lai dựa trên dữ liệu lịch sử, xu hướng và tính mùa vụ.' },
    get formula() { return isEn() ? 'AI model learns from sales history, identifying trends and seasonalities' : 'Mô hình AI học từ lịch sử bán hàng, nhận diện xu hướng và tính mùa vụ để dự đoán' },
    get source() { return isEn() ? 'Historical revenue + trained AI model' : 'Lịch sử doanh thu + mô hình AI đã huấn luyện' },
  },
  confidenceInterval: {
    get title() { return isEn() ? 'Confidence Interval' : 'Khoảng tin cậy' },
    get description() { return isEn() ? 'Range of values within which actual revenue is likely to fall (95% confidence).' : 'Khoảng giá trị mà doanh thu thực tế có khả năng rơi vào (90% khả năng đúng). Khoảng rộng = độ không chắc cao hơn.' },
    get formula() { return isEn() ? 'Forecast ± error margin (based on historical variance)' : 'Dự báo ± biên dao động (dựa trên mức biến động trong quá khứ)' },
    get source() { return isEn() ? 'Deduced from AI forecasting model' : 'Kết quả từ mô hình dự báo AI' },
  },
  mae: {
    get title() { return isEn() ? 'MAE — Mean Absolute Error' : 'MAE — Sai số trung bình' },
    get description() { return isEn() ? 'Average absolute distance between forecast and actual values. Lower MAE means better forecasts.' : 'Trung bình khoảng cách giữa giá trị dự báo và thực tế. MAE thấp = dự báo sát hơn. Đơn vị là VNĐ.' },
    get formula() { return isEn() ? 'Average of |Forecast − Actual| across the test set' : 'Trung bình của |Dự báo − Thực tế| trên toàn bộ tập kiểm tra' },
    get source() { return isEn() ? 'Model validation metrics' : 'Kết quả kiểm tra độ chính xác mô hình' },
  },
  rmse: {
    get title() { return isEn() ? 'RMSE — Root Mean Squared Error' : 'RMSE — Sai số có trọng số' },
    get description() { return isEn() ? 'Similar to MAE but penalizes larger deviations more heavily. Usually higher than MAE.' : 'Tương tự sai số trung bình nhưng phạt nặng hơn những ngày sai lệch lớn. Thường cao hơn MAE.' },
    get formula() { return isEn() ? 'Square root of the average of squared errors' : 'Căn bậc 2 của trung bình bình phương sai số' },
    get source() { return isEn() ? 'Model validation metrics' : 'Kết quả kiểm tra độ chính xác mô hình' },
  },
  mape: {
    get title() { return isEn() ? 'MAPE — Mean Absolute Percentage Error' : 'MAPE — Sai số phần trăm' },
    get description() { return isEn() ? 'Average percentage deviation of forecast from actual values. MAPE < 15% is good.' : 'Phần trăm trung bình sai lệch của dự báo so với thực tế. MAPE dưới 15% là tốt.' },
    get formula() { return isEn() ? 'Average of |Deviation| ÷ |Actual Revenue| × 100%' : 'Trung bình của |Sai lệch| ÷ |Doanh thu thực tế| × 100%' },
    get source() { return isEn() ? 'Model validation metrics' : 'Kết quả kiểm tra độ chính xác mô hình' },
  },
  smape: {
    get title() { return isEn() ? 'SMAPE — Symmetric Mean Absolute Percentage Error' : 'SMAPE — Sai số phần trăm cân bằng' },
    get description() { return isEn() ? 'Improved MAPE version that avoids inflation when actual values are close to 0. Scale is 0–200%, lower is better.' : 'Phiên bản cải tiến của MAPE, tránh sai lệch khi doanh thu ngày gần bằng 0 (sau Tết, ngày thường ít đơn). Thang đo 0–200%, càng thấp càng tốt.' },
    get formula() { return isEn() ? 'Average of 2×|Deviation| ÷ (|Forecast| + |Actual|) × 100%' : 'Trung bình của 2×|Sai lệch| ÷ (|Dự báo| + |Thực tế|) × 100%' },
    get source() { return isEn() ? 'Model validation metrics' : 'Kết quả kiểm tra độ chính xác mô hình' },
  },
  anomaly: {
    get title() { return isEn() ? 'Anomaly Detection' : 'Bất thường (Anomaly)' },
    get description() { return isEn() ? 'Day with revenue significantly deviating from normal trend. Can be a positive surge or negative issue.' : 'Ngày có doanh thu lệch đáng kể so với xu hướng bình thường. Có thể là cơ hội (đột biến tốt) hoặc sự cố (đột biến xấu).' },
    get formula() { return isEn() ? 'Revenue today deviates excessively from the 14-day moving average' : 'Doanh thu hôm nay lệch quá xa so với trung bình 14 ngày gần nhất' },
    get source() { return isEn() ? 'Daily revenue timeline (automated AI analysis)' : 'Dữ liệu doanh thu ngày (phân tích AI tự động)' },
  },
  zScore: {
    get title() { return isEn() ? 'Z-Score' : 'Mức độ lệch chuẩn' },
    get description() { return isEn() ? 'Measures deviation in standard deviations. Absolute value > 2.5 is notable, > 3.0 is highly anomalous.' : 'Đo mức độ lệch của một ngày so với xu hướng bình thường. Lệch trên 2.5 là bất thường đáng chú ý, trên 3.0 là rất bất thường.' },
    get formula() { return isEn() ? '(Revenue Today − 14-day MA) ÷ Standard Deviation of revenue' : '(Doanh thu hôm nay − Trung bình 14 ngày gần nhất) ÷ Độ biến động thường ngày' },
    get source() { return isEn() ? 'Daily revenue timeline (AI analysis)' : 'Dữ liệu doanh thu ngày (phân tích AI)' },
  },

  // ── ĐA KÊNH / PHÂN BỔ ────────────────────────────────────────────────────
  salesChannel: {
    get title() { return isEn() ? 'Sales Channel' : 'Kênh bán hàng' },
    get description() { return isEn() ? 'Origin of order: Shopee, Lazada, TikTok Shop, POS (direct), Website...' : 'Nơi phát sinh đơn hàng: Shopee, Lazada, TikTok Shop, Facebook Shop, POS (bán trực tiếp), Website...' },
    get formula() { return isEn() ? 'Each order is assigned to its respective sales channel upon creation' : 'Mỗi đơn hàng được gắn với kênh bán hàng tương ứng khi tạo đơn' },
    get source() { return isEn() ? 'Orders classified by channel' : 'Đơn hàng phân loại theo kênh' },
  },
  roi: {
    get title() { return isEn() ? 'ROI — Return on Investment' : 'ROI — Tỷ suất hoàn vốn' },
    get description() { return isEn() ? 'Profit generated relative to ad spend or platform fees. Positive = profit, negative = loss.' : 'Lợi nhuận thu được so với chi phí đầu tư vào kênh (quảng cáo, phí sàn). ROI dương = có lãi, âm = đang lỗ.' },
    get formula() { return isEn() ? '(Profit − Direct Cost) ÷ Direct Cost × 100%' : '(Lợi nhuận − Chi phí đầu tư) ÷ Chi phí đầu tư × 100%' },
    get source() { return isEn() ? 'Revenue + ad spend/platform fees by channel' : 'Doanh thu + chi phí quảng cáo theo kênh' },
  },
  lastSync: {
    get title() { return isEn() ? 'Last Synced' : 'Lần đồng bộ cuối' },
    get description() { return isEn() ? 'Most recent time external channel data was synced to our data warehouse.' : 'Thời điểm gần nhất dữ liệu từ kênh bán hàng hoặc nguồn ngoài được cập nhật vào hệ thống.' },
    get formula() { return isEn() ? 'Timestamp of the latest successful data pipeline execution' : 'Thời điểm pipeline dữ liệu chạy thành công gần nhất' },
    get source() { return isEn() ? 'System sync activity logs' : 'Nhật ký đồng bộ dữ liệu hệ thống' },
  },
  etl: {
    get title() { return isEn() ? 'ETL Pipeline' : 'Thu thập & xử lý dữ liệu tự động' },
    get description() { return isEn() ? 'Automated extract, transform, load process to normalize multi-channel data into warehouse.' : 'Quy trình tự động lấy dữ liệu từ nhiều nguồn, chuẩn hóa rồi nạp vào kho dữ liệu trung tâm để phân tích.' },
    get formula() { return isEn() ? 'Extract → Normalize & Clean → Load into DWH (runs every 30 minutes)' : 'Lấy dữ liệu → Làm sạch & chuẩn hóa → Nạp vào kho dữ liệu (chạy tự động mỗi 30 phút)' },
    get source() { return isEn() ? 'System data pipelines' : 'Pipeline dữ liệu hệ thống' },
  },
  dataWarehouse: {
    get title() { return isEn() ? 'Data Warehouse (DWH)' : 'Kho dữ liệu phân tích' },
    get description() { return isEn() ? 'Central repository storing cleaned, unified data from all sales channels for dashboard and reporting.' : 'Kho dữ liệu trung tâm lưu trữ dữ liệu đã được chuẩn hóa từ tất cả kênh bán hàng, dùng cho Dashboard và báo cáo.' },
    get formula() { return isEn() ? 'All channel inputs consolidated under a unified schema for analytical query performance' : 'Dữ liệu từ tất cả kênh được hợp nhất theo cấu trúc chuẩn để phân tích nhanh' },
    get source() { return isEn() ? 'Consolidated data from all channels' : 'Dữ liệu tổng hợp từ tất cả kênh bán hàng' },
  },

  // ── BASKET ANALYSIS ───────────────────────────────────────────────────────
  support: {
    get title() { return isEn() ? 'Support' : 'Tần suất xuất hiện cùng nhau' },
    get description() { return isEn() ? 'Ratio of orders containing both items in the suggestion pair. High support = frequently bought together.' : 'Tỷ lệ đơn hàng có chứa đồng thời các sản phẩm trong cặp gợi ý. Tỷ lệ cao = cặp sản phẩm thường xuyên được mua cùng nhau.' },
    get formula() { return isEn() ? 'Orders containing both A and B ÷ Total orders' : 'Số đơn có cả 2 sản phẩm ÷ Tổng số đơn' },
    get source() { return isEn() ? 'Market basket analysis from order history' : 'Phân tích giỏ hàng từ lịch sử đơn hàng' },
  },
  confidence: {
    get title() { return isEn() ? 'Confidence' : 'Xác suất mua kèm' },
    get description() { return isEn() ? 'Conditional probability that customer buys B given they purchased A. Higher means strong cross-sell potential.' : 'Khi khách mua sản phẩm A, xác suất họ cũng mua sản phẩm B. Càng cao càng nên gợi ý bán kèm.' },
    get formula() { return isEn() ? 'Orders with A and B ÷ Orders with A' : 'Số đơn mua cả A lẫn B ÷ Số đơn chỉ mua A' },
    get source() { return isEn() ? 'Market basket analysis from order history' : 'Phân tích giỏ hàng từ lịch sử đơn hàng' },
  },
  lift: {
    get title() { return isEn() ? 'Lift' : 'Mức tăng tương quan' },
    get description() { return isEn() ? 'Strength of rule compared to random chance. > 1 means positive correlation. = 1 means independent. < 1 means negative.' : 'Mức độ A và B được mua cùng nhau so với ngẫu nhiên. Trên 1 = có mối liên hệ thực sự. Bằng 1 = ngẫu nhiên. Dưới 1 = ít xảy ra cùng nhau.' },
    get formula() { return isEn() ? 'Confidence ÷ Probability of B occurring independently' : 'Xác suất mua kèm ÷ Xác suất mua B độc lập' },
    get source() { return isEn() ? 'Market basket analysis from order history' : 'Phân tích giỏ hàng từ lịch sử đơn hàng' },
  },

  // ── NHÀ CUNG CẤP ─────────────────────────────────────────────────────────
  onTimeRate: {
    get title() { return isEn() ? 'On-Time Delivery Rate' : 'Tỷ lệ giao hàng đúng hạn' },
    get description() { return isEn() ? 'Percentage of shipments delivered on or before the committed delivery date. High = reliable supplier.' : 'Phần trăm lô hàng được nhà cung cấp giao đúng hoặc trước ngày cam kết. Tỷ lệ cao = nhà cung cấp đáng tin cậy.' },
    get formula() { return isEn() ? 'On-time delivered shipments ÷ Total shipments × 100%' : 'Số lô hàng giao đúng hạn ÷ Tổng số lô hàng × 100%' },
    get source() { return isEn() ? 'Goods Receipts in system' : 'Phiếu nhập kho trong hệ thống' },
  },
  leadTime: {
    get title() { return isEn() ? 'Average Lead Time' : 'Thời gian giao hàng trung bình' },
    get description() { return isEn() ? 'Average days from placing a Purchase Order to receiving the goods. Shorter = higher agility.' : 'Số ngày trung bình từ khi đặt hàng đến khi nhận được hàng. Thời gian ngắn = linh hoạt hơn trong quản lý tồn kho.' },
    get formula() { return isEn() ? 'Average days between receipt date and order placement date per supplier' : 'Trung bình số ngày (Ngày nhận hàng − Ngày đặt hàng) theo từng nhà cung cấp' },
    get source() { return isEn() ? 'Purchase Orders + Goods Receipts' : 'Đơn đặt hàng + phiếu nhập kho' },
  },
  qualityScore: {
    get title() { return isEn() ? 'Supplier Quality Score' : 'Điểm chất lượng nhà cung cấp' },
    get description() { return isEn() ? 'Composite assessment of received goods quality (1-5 stars) based on defect rates.' : 'Đánh giá tổng hợp về chất lượng hàng hóa nhận được từ nhà cung cấp (1–5 sao). Dựa trên số lô hàng lỗi, thiếu hàng, sai quy cách.' },
    get formula() { return isEn() ? 'Average quality rating across all completed receipts' : 'Trung bình điểm đánh giá qua các lần nhập hàng' },
    get source() { return isEn() ? 'Quality assessment noted upon goods receipt confirmation' : 'Đánh giá ghi nhận khi xác nhận phiếu nhập kho' },
  },

  // ── WHAT-IF / MÔ PHỎNG ───────────────────────────────────────────────────
  whatIfBaseline: {
    get title() { return isEn() ? 'Baseline Scenario' : 'Kịch bản không thay đổi' },
    get description() { return isEn() ? 'Expected performance forecast if current strategy is maintained without change.' : 'Kết quả dự kiến nếu giữ nguyên chiến lược hiện tại, không áp dụng thay đổi nào.' },
    get formula() { return isEn() ? 'Revenue forecast modeled under baseline operational parameters' : 'Dự báo doanh thu với thông số vận hành hiện tại' },
    get source() { return isEn() ? 'Forecast model + historical benchmarks' : 'Mô hình dự báo + dữ liệu lịch sử' },
  },
  whatIfSimulated: {
    get title() { return isEn() ? 'Simulated Scenario' : 'Kịch bản mô phỏng thay đổi' },
    get description() { return isEn() ? 'Estimated performance forecast incorporating adjusted variables (price, promotions, ads...).' : 'Kết quả ước tính khi áp dụng kịch bản thay đổi (điều chỉnh giá, khuyến mãi, thêm kênh mới, tăng ngân sách QC).' },
    get formula() { return isEn() ? 'Baseline Forecast × (1 + business impact coefficient)' : 'Dự báo cơ sở × (1 + mức tác động ước tính theo kịch bản)' },
    get source() { return isEn() ? 'Forecast model + business impact assumptions' : 'Mô hình dự báo + hệ số tác động kinh doanh' },
  },

  // ── CHIẾN DỊCH / MÙA VỤ ─────────────────────────────────────────────────
  highSeason: {
    get title() { return isEn() ? 'Peak Months' : 'Tháng cao điểm' },
    get description() { return isEn() ? 'Months with historically highest average revenue. Recommended to secure stock and increase ad budgets.' : 'Tháng có doanh thu trung bình cao nhất trong năm dựa trên lịch sử. Nên tăng tồn kho và ngân sách quảng cáo.' },
    get formula() { return isEn() ? 'Months scoring highest average historical revenue' : 'Tháng có doanh thu trung bình cao nhất qua các năm trong lịch sử' },
    get source() { return isEn() ? 'Historical sales data' : 'Dữ liệu doanh thu lịch sử' },
  },
  lowSeason: {
    get title() { return isEn() ? 'Off-peak Months' : 'Tháng thấp điểm' },
    get description() { return isEn() ? 'Months with historically lowest average revenue. Recommended to minimize stock levels and overheads.' : 'Tháng có doanh thu trung bình thấp nhất. Nên giảm tồn kho và điều chỉnh chi phí.' },
    get formula() { return isEn() ? 'Months scoring lowest average historical revenue' : 'Tháng có doanh thu trung bình thấp nhất qua các năm trong lịch sử' },
    get source() { return isEn() ? 'Historical sales data' : 'Dữ liệu doanh thu lịch sử' },
  },
}
