import api from './axios'

// FastAPI categories → frontend type keys (used for icons and filters)
const CATEGORY_TO_TYPE = {
  REVENUE:   'revenue',
  CHANNEL:   'channel',
  INVENTORY: 'product',
  MARKETING: 'general',
  ANOMALY:   'anomaly',
}

// 'all' → không truyền param channel (FastAPI hiểu null = tất cả kênh)
const channelParam = (ch) => ch && ch !== 'all' ? ch : undefined

/**
 * Dự báo doanh thu – gọi qua ASP.NET proxy → FastAPI.
 * FastAPI trả về { data: [{date, forecast, lower, upper}], actual: [{date, actual}], model_info }
 * ForecastPage cần { forecast, history: [{date, revenue}], modelInfo }
 */
export const getForecast = async (horizon = 30, channel = 'all') => {
  const res = await api.get('/api/ai/forecast', {
    params: { horizon, channel: channelParam(channel) },
  }).then(r => r.data)
  return {
    forecast:    res.data   ?? [],
    history:     (res.actual ?? []).map(p => ({ date: p.date, revenue: p.actual })),
    modelInfo:   res.model_info ?? {},
    horizonDays: res.horizon_days ?? horizon,
  }
}

/**
 * Phát hiện bất thường – normalize từ FastAPI format sang AnomalyPage format.
 * FastAPI: { data: [{date, actual, z_score, severity:"WARNING"|"CRITICAL", message}] }
 * Page cần: { anomalies: [{date, channel, value, zScore, severity:'high'|'medium'|'low'}] }
 */
const SEVERITY_MAP = { CRITICAL: 'high', WARNING: 'medium', NOTICE: 'low' }

export const getAnomaly = async (days = 90, channel = 'all') => {
  const res = await api.get('/api/ai/anomaly', {
    params: { days, channel: channelParam(channel) },
  }).then(r => r.data)
  return {
    days_analyzed: res.days_analyzed,
    channel:       res.channel,
    anomalies: (res.data ?? []).map(a => ({
      date:      a.date,
      channel:   res.channel ?? 'ALL',
      value:     a.actual,
      expected:  a.expected,
      zScore:    a.z_score,
      direction: a.direction,
      severity:  SEVERITY_MAP[a.severity] ?? 'low',
      message:   a.message,
    })),
  }
}

/**
 * Phân tích xu hướng.
 * FastAPI trả về { trend_direction, growth_rate_pct, ma7_latest, summary, ... }
 * ForecastPage cần { direction, growthRate, ma7, summary }
 */
export const getTrend = async (days = 30, channel = 'all') => {
  const res = await api.get('/api/ai/trend', {
    params: { days, channel: channelParam(channel) },
  }).then(r => r.data)
  return {
    direction:   res.trend_direction  ?? 'STABLE',
    growthRate:  (res.growth_rate_pct ?? 0) / 100,  // page hiển thị growthRate * 100 = %
    ma7:         res.ma7_latest       ?? 0,
    summary:     res.summary          ?? '',
    peakDate:    res.peak_date        ?? '',
    peakRevenue: res.peak_revenue     ?? 0,
  }
}

/**
 * Đề xuất tự động từ AI.
 * FastAPI trả về { generated_at, total, recommendations: [{priority:"HIGH", category:"REVENUE", title, detail}] }
 * RecommendationsPage cần { generatedAt, recommendations: [{type, priority (lowercase), message, detail}] }
 */
export const getRecommendations = async () => {
  const res = await api.get('/api/ai/recommendation').then(r => r.data)
  return {
    generatedAt:     res.generated_at ?? new Date().toISOString(),
    total:           res.total ?? 0,
    recommendations: (res.recommendations ?? []).map(r => ({
      type:     CATEGORY_TO_TYPE[r.category] ?? 'general',
      priority: (r.priority ?? 'LOW').toLowerCase(),
      message:  r.title  ?? '',
      detail:   r.detail ?? '',
      action:   r.action ?? '',
    })),
  }
}

/**
 * Metrics đánh giá độ chính xác model Prophet.
 * FastAPI: { mae, rmse, mape_pct, cv_mape_pct, train_from, train_to, train_rows, data_source }
 * ForecastPage cần: { mae, rmse, mape_pct, n_train, train_from, train_to, eval_method, source }
 */
export const getForecastMetrics = async () => {
  const res = await api.get('/api/ai/forecast/metrics').then(r => r.data)
  return {
    mae:             res.mae,
    rmse:            res.rmse,
    mape_pct:        res.cv_mape_pct ?? res.mape_pct,   // ưu tiên CV MAPE
    n_train:         res.train_rows,
    n_test:          res.test_rows   ?? null,
    train_from:      res.train_from,
    train_to:        res.train_to,
    test_from:       null,
    test_to:         null,
    eval_method:     'hold-out 80/20',
    source:          res.data_source,
    prophet_version: '1.3.0',
  }
}

/**
 * AI Insights tổng hợp từ forecast + anomaly + RFM.
 * FastAPI trả về { generated_at, count, insights: [string] }
 * Cache 1 giờ ở phía server.
 */
export const getInsights = () =>
  api.get('/api/ai/insights').then(r => r.data)

/**
 * Phân khúc khách hàng RFM từ notebook 04.
 * Trả về { computed_at, total_customers, segment_summary, customers[] }
 */
export const getRfmSegments = () =>
  api.get('/api/ai/customers/segments').then(r => r.data)

/**
 * Hỏi AI theo câu hỏi tự nhiên.
 * FastAPI trả về { question, recommendation, data_sources, confidence, note }
 * RecommendationsPage dùng trực tiếp – không cần normalize.
 * @param {{ question: string, language: string }} body
 */
export const askRecommendation = (body) =>
  api.post('/api/ai/recommend', body).then(r => r.data)

// ── Chức năng sáng tạo mới ────────────────────────────────────────────────────

/** Dự báo churn khách hàng (RandomForest + RFM) */
export const getChurnPrediction = (params = {}) =>
  api.get('/api/ai/churn', { params }).then(r => r.data)

/** Phân tích sản phẩm hay mua chung (Apriori) */
export const getBasketAnalysis = (params = {}) =>
  api.get('/api/ai/basket', { params }).then(r => r.data)

/** Thông minh dự báo tồn kho */
export const getInventoryIntelligence = (params = {}) =>
  api.get('/api/ai/inventory', { params }).then(r => r.data)

/** Mô phỏng kịch bản What-If */
export const simulateWhatIf = (body) =>
  api.post('/api/ai/whatif', body).then(r => r.data)

/** Phân bổ doanh thu theo kênh */
export const getChannelAttribution = (params = {}) =>
  api.get('/api/ai/attribution', { params }).then(r => r.data)

/** Lên lịch chiến dịch thông minh */
export const getCampaignPlan = (params = {}) =>
  api.get('/api/ai/campaign', { params }).then(r => r.data)

/** Phân bổ địa lý khách hàng (Heatmap) */
export const getGeoDistribution = (params = {}) =>
  api.get('/api/ai/geo', { params }).then(r => r.data)

/** Bảng xếp hạng hiệu suất */
export const getLeaderboard = (params = {}) =>
  api.get('/api/ai/leaderboard', { params }).then(r => r.data)

/** Sinh nhận xét tự động bằng ngôn ngữ tự nhiên */
export const getNarrative = (params = {}) =>
  api.get('/api/ai/narrative', { params }).then(r => r.data)

/** Hiệu suất nhà cung cấp – tỷ lệ đúng hạn, thời gian giao hàng */
export const getSupplierPerformance = (params = {}) =>
  api.get('/api/ai/supplier', { params }).then(r => r.data)

/** Thông minh giá – so sánh giá sản phẩm với thị trường */
export const getPriceIntelligence = (params = {}) =>
  api.get('/api/ai/price', { params }).then(r => r.data)

/** Tổng hợp phản hồi cảm xúc từ mạng xã hội */
export const getFeedbackSummary = (params = {}) =>
  api.get('/api/ai/feedback-summary', { params }).then(r => r.data)
