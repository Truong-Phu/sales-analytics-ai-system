import api from './axios'

/** Dự báo doanh thu – gọi qua ASP.NET proxy → FastAPI */
export const getForecast = (horizon = 30, channel = 'all') =>
  api.get('/api/ai/forecast', { params: { horizon, channel } }).then(r => r.data)

/** Phát hiện bất thường */
export const getAnomaly = (days = 90, channel = 'all') =>
  api.get('/api/ai/anomaly', { params: { days, channel } }).then(r => r.data)

/** Phân tích xu hướng */
export const getTrend = (days = 30, channel = 'all') =>
  api.get('/api/ai/trend', { params: { days, channel } }).then(r => r.data)

/** Đề xuất từ AI */
export const getRecommendations = () =>
  api.get('/api/ai/recommendation').then(r => r.data)
