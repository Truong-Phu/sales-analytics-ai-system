/**
 * Mock data cho RecommendationsPage khi AI service chưa kết nối.
 *
 * MOCK_RECOMMENDATIONS  – dữ liệu cho danh sách gợi ý tự động (GET)
 * MOCK_ASK_RESPONSES    – dữ liệu cho chatbot hỏi AI (POST)
 */

/** Mock cho GET /recommendation – danh sách gợi ý phân tích tự động */
export const MOCK_RECOMMENDATIONS = {
  generatedAt: new Date().toISOString(),
  recommendations: [
    {
      type:     'revenue',
      priority: 'high',
      message:  'Doanh thu kênh Shopee tăng 23% so với tháng trước. Nên tăng cường đầu tư vào kênh này.',
      detail:   'Đặc biệt hiệu quả vào cuối tuần và các ngày sale.',
    },
    {
      type:     'anomaly',
      priority: 'high',
      message:  'Phát hiện sụt giảm bất thường doanh thu kênh Lazada ngày 22/03 (Z-score: -2.87). Cần kiểm tra nguyên nhân.',
      detail:   'Có thể do lỗi đồng bộ dữ liệu hoặc sự cố kỹ thuật.',
    },
    {
      type:     'product',
      priority: 'medium',
      message:  'Áo thun Unisex Cotton (SP001) chiếm 12% doanh thu tổng. Nên bổ sung tồn kho để tránh hết hàng.',
      detail:   'Tốc độ bán: ~14 sản phẩm/ngày trong 30 ngày qua.',
    },
    {
      type:     'channel',
      priority: 'medium',
      message:  'TikTok Shop đang tăng trưởng 18% MoM. Đây là kênh tiềm năng cần đầu tư content marketing.',
      detail:   null,
    },
    {
      type:     'general',
      priority: 'low',
      message:  'Giá trị đơn hàng trung bình đã tăng từ 320K lên 380K (tháng qua). Chiến lược upsell đang phát huy hiệu quả.',
      detail:   null,
    },
  ],
}

/**
 * Mock cho POST /recommendation – trả lời câu hỏi tự nhiên từ AI.
 * Mảng các câu trả lời mẫu, sẽ được chọn ngẫu nhiên khi API lỗi.
 */
export const MOCK_ASK_RESPONSES = [
  {
    question:       'Sản phẩm nào đang bán chạy nhất?',
    recommendation: [
      '**Số liệu bán hàng (30 ngày qua):**',
      '- Tổng doanh thu: 128.500.000 VNĐ',
      '- Tổng đơn hàng: 342 đơn',
      '',
      '**Top sản phẩm bán chạy:**',
      '1. Áo thun Unisex Cotton – 420 sản phẩm (42.000.000 VNĐ)',
      '2. Quần jean Slim Fit – 180 sản phẩm (27.000.000 VNĐ)',
      '3. Túi canvas tote – 150 sản phẩm (15.000.000 VNĐ)',
      '',
      '**Xu hướng thị trường (Google Search):**',
      '- "Áo thun cotton oversize" – đang có lượng tìm kiếm cao',
      '- "Quần jean form đứng 2024" – xu hướng tăng mạnh',
      '',
      '⚠️ Lưu ý: Gợi ý dựa trên dữ liệu chưa kiểm chứng (Mức 1 – web scraping).',
    ].join('\n'),
    data_sources: ['Bán hàng', 'Google Search'],
    confidence:   'low',
    note:         'Gợi ý từ dữ liệu Mức 1 (web scraping) – chưa qua kiểm chứng',
  },
  {
    question:       'Doanh thu tuần này so với tuần trước?',
    recommendation: [
      '**Số liệu bán hàng:**',
      '- Tuần này (15–21/04): 32.500.000 VNĐ (87 đơn)',
      '- Tuần trước (08–14/04): 28.200.000 VNĐ (74 đơn)',
      '- Tăng trưởng: +15.2% về doanh thu, +17.6% về số đơn',
      '',
      '**Nhận xét:**',
      'Doanh thu đang có xu hướng tăng tốt. Kênh Shopee đóng góp',
      '~60% tổng doanh thu tuần này, tăng từ 52% tuần trước.',
      '',
      '**Đề xuất:**',
      'Duy trì chiến lược hiện tại. Xem xét tăng ngân sách quảng cáo',
      'trên Shopee để tận dụng đà tăng.',
      '',
      '⚠️ Lưu ý: Gợi ý dựa trên dữ liệu chưa kiểm chứng (Mức 1).',
    ].join('\n'),
    data_sources: ['Bán hàng'],
    confidence:   'low',
    note:         'Gợi ý từ dữ liệu Mức 1 – chưa qua kiểm chứng',
  },
  {
    question:       'Xu hướng thị trường hiện tại là gì?',
    recommendation: [
      '**Xu hướng từ Google Search (3 kết quả gần nhất):**',
      '- "Sản phẩm bán chạy shopee lazada 2024": Thời trang unisex và phụ kiện',
      '  đang dẫn đầu về lượt tìm kiếm.',
      '- "Top sản phẩm hot tiktok shop": Mỹ phẩm và đồ gia dụng thông minh',
      '  đang viral mạnh trên TikTok.',
      '- "Xu hướng bán hàng online 2024": Livestream bán hàng tăng 40%',
      '  so với 2023.',
      '',
      '**Thông tin từ Facebook page:**',
      '- Bài viết về flash sale nhận được nhiều tương tác nhất.',
      '- Khách hàng quan tâm nhiều đến chính sách đổi trả.',
      '',
      '⚠️ Lưu ý: Gợi ý dựa trên dữ liệu chưa kiểm chứng (Mức 1 – web scraping).',
    ].join('\n'),
    data_sources: ['Google Search', 'Facebook'],
    confidence:   'low',
    note:         'Gợi ý từ dữ liệu Mức 1 – chưa qua kiểm chứng',
  },
  {
    question:       'Khách hàng hay mua gì cùng nhau?',
    recommendation: [
      '**Phân tích kết hợp sản phẩm (từ dữ liệu đơn hàng):**',
      '',
      'Top 3 cặp sản phẩm hay mua cùng:',
      '1. Áo thun + Quần jean: 68 lần (21% tổng đơn)',
      '2. Túi canvas + Ví da: 34 lần (10% tổng đơn)',
      '3. Giày sneaker + Vớ cotton: 28 lần (8% tổng đơn)',
      '',
      '**Đề xuất bundle:**',
      'Tạo combo "Áo + Quần" với mức giảm giá 10–15%.',
      'Áp dụng upsell tự động khi khách thêm áo vào giỏ hàng.',
      '',
      '⚠️ Lưu ý: Gợi ý dựa trên dữ liệu mẫu – chưa phải dữ liệu thật.',
    ].join('\n'),
    data_sources: ['Bán hàng'],
    confidence:   'low',
    note:         'Gợi ý từ dữ liệu mẫu – cần kết nối database thật',
  },
]
