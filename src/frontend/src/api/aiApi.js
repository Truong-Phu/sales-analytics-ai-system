import api from './axios'

// FastAPI categories → frontend type keys (used for icons and filters)
const CATEGORY_TO_TYPE = {
  REVENUE:   'revenue',
  CHANNEL:   'channel',
  INVENTORY: 'product',
  MARKETING: 'general',
  ANOMALY:   'anomaly',
}

/**
 * Dự báo doanh thu – gọi qua ASP.NET proxy → FastAPI.
 * FastAPI trả về { data: [{date, forecast, lower, upper}], horizon_days, model_info }
 * ForecastPage cần { forecast: [...], history: [] }
 */
export const getForecast = async (horizon = 30, channel = 'all') => {
  const res = await api.get('/api/ai/forecast', { params: { horizon, channel } }).then(r => r.data)
  return {
    forecast:    res.data        ?? [],
    history:     [],                      // FastAPI không trả lịch sử thực tế
    modelInfo:   res.model_info  ?? {},
    horizonDays: res.horizon_days ?? horizon,
  }
}

/** Phát hiện bất thường – format AnomalyPage dùng trực tiếp, không cần normalize */
export const getAnomaly = (days = 90, channel = 'all') =>
  api.get('/api/ai/anomaly', { params: { days, channel } }).then(r => r.data)

/**
 * Phân tích xu hướng.
 * FastAPI trả về { trend_direction, growth_rate_pct, ma7_latest, summary, ... }
 * ForecastPage cần { direction, growthRate, ma7, summary }
 */
export const getTrend = async (days = 30, channel = 'all') => {
  const res = await api.get('/api/ai/trend', { params: { days, channel } }).then(r => r.data)
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

/** Metrics đánh giá độ chính xác model Prophet (MAE, RMSE, MAPE). */
export const getForecastMetrics = () =>
  api.get('/api/ai/forecast/metrics').then(r => r.data)

/**
 * Hỏi AI theo câu hỏi tự nhiên.
 * FastAPI trả về { question, recommendation, data_sources, confidence, note }
 * RecommendationsPage dùng trực tiếp – không cần normalize.
 * @param {{ question: string, language: string }} body
 */
export const askRecommendation = (body) =>
  api.post('/api/ai/recommend', body).then(r => r.data)
