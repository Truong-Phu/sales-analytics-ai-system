import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ComposedChart, Area, Line, ReferenceLine, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getForecast, getTrend, getForecastMetrics, getModelComparison } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

const HORIZONS   = [7, 14, 30, 60, 90]
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok']

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '–'
  return `${Number(value).toFixed(1)}%`
}

function fmtCompactMoney(v) {
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `₫${(v / 1_000).toFixed(0)}K`
  return `₫${v}`
}

function getReliability(mape) {
  const value = Number(mape)
  if (!Number.isFinite(value)) {
    return {
      label: 'Chưa đánh giá',
      tone: 'neutral',
      color: 'var(--text-tertiary)',
      bg: 'var(--bg-elevated)',
      note: 'Chưa có đủ chỉ số kiểm định để kết luận độ tin cậy.',
    }
  }
  if (value <= 15) {
    return {
      label: 'Cao',
      tone: 'good',
      color: 'var(--accent-600)',
      bg: 'rgba(16,185,129,0.12)',
      note: 'Có thể dùng để lập kế hoạch doanh thu ngắn hạn.',
    }
  }
  if (value <= 35) {
    return {
      label: 'Trung bình',
      tone: 'warn',
      color: 'var(--color-warning)',
      bg: 'rgba(245,158,11,0.12)',
      note: 'Nên dùng kèm kiểm tra tồn kho, marketing và biến động đơn hàng.',
    }
  }
  return {
    label: 'Thấp',
    tone: 'risk',
    color: 'var(--color-error)',
    bg: 'rgba(239,68,68,0.12)',
    note: 'Chỉ nên xem như tín hiệu tham khảo, cần thêm dữ liệu hoặc retrain.',
  }
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const isForecast = p?.payload?.isForecast
  return (
    <div className="lcard p-3 text-sm" style={{ boxShadow: 'var(--shadow-md)', minWidth: 160 }}>
      <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
        {fmtMoneyExact(p?.value ?? 0)}
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      {isForecast && (
        <div className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--accent-500)' }}>
          <span className="icon" style={{ fontSize: 12 }}>auto_awesome</span>
          Dự báo AI
        </div>
      )}
    </div>
  )
}

export default function ForecastPage() {
  const { t }             = useTranslation()
  const [horizon, setHorizon] = useState(30)
  const [channel, setChannel] = useState('all')
  const [result,       setResult]       = useState(null)
  const [trend,        setTrend]        = useState(null)
  const [metrics,      setMetrics]      = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [metricsIsMock,   setMetricsIsMock]   = useState(false)
  const [comparison,      setComparison]      = useState(null)
  const [retraining,      setRetraining]      = useState(false)
  const [retrainMsg,      setRetrainMsg]      = useState(null)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  const handleRetrain = async () => {
    setRetraining(true)
    setRetrainMsg(null)
    try {
      await api.post('/api/ai/forecast/retrain')
      setRetrainMsg({ type: 'success', text: t('forecast.retraining') })
    } catch {
      setRetrainMsg({ type: 'error', text: t('forecast.retrainError') })
    } finally {
      setRetraining(false)
    }
  }

  const handleRun = async () => {
    setLoading(true)
    setMetricsIsMock(false)
    try {
      let metricsFallback = false
      const [fc, tr, mt, cmp] = await Promise.all([
        getForecast(horizon, channel),
        getTrend(horizon, channel),
        getForecastMetrics().catch(() => { metricsFallback = true; return null }),
        getModelComparison().catch(() => null),
      ])
      setResult(fc)
      setTrend(tr)
      setMetrics(mt)
      setMetricsIsMock(metricsFallback)
      setComparison(cmp)
      setShowTechnicalDetails(false)
    } catch {
      setResult(null)
      setTrend(null)
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }

  // Build chart data: merge history + forecast
  const chartData = result ? [
    ...(result.history ?? []).map(h => ({
      date:      h.date?.slice(5) ?? h.ds?.slice(5),
      revenue:   h.revenue ?? h.y,
      forecast:  null,
      isForecast: false,
    })),
    ...(result.forecast ?? []).map(f => ({
      date:      f.date?.slice(5),
      revenue:   null,
      forecast:  f.forecast ?? f.yhat,
      lower:     f.lower ?? f.yhat_lower,
      upper:     f.upper ?? f.yhat_upper,
      isForecast: true,
    })),
  ] : []

  const modelInfo = result?.modelInfo ?? {}
  const direction = trend?.direction ?? 'STABLE'
  const growthPct = ((trend?.growthRate ?? 0) * 100).toFixed(1)
  const isUp      = direction === 'UP' || parseFloat(growthPct) > 0
  const forecastRows = result?.forecast ?? []
  const forecastTotal = forecastRows.reduce((sum, f) => sum + Number(f.forecast ?? f.yhat ?? 0), 0)
  const forecastAverage = forecastRows.length ? forecastTotal / forecastRows.length : 0
  const lowerAverage = forecastRows.length
    ? forecastRows.reduce((sum, f) => sum + Number(f.lower ?? f.yhat_lower ?? f.forecast ?? f.yhat ?? 0), 0) / forecastRows.length
    : 0
  const upperAverage = forecastRows.length
    ? forecastRows.reduce((sum, f) => sum + Number(f.upper ?? f.yhat_upper ?? f.forecast ?? f.yhat ?? 0), 0) / forecastRows.length
    : 0
  const reliability = getReliability(metrics?.mape_pct ?? modelInfo.mape_pct)

  return (
    <div className="space-y-4">

      <div className="flex flex-col md:flex-row gap-5">

        {/* ── LEFT: Chart ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('forecast.title')}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t('forecast.subtitle')}</span>
              {(metrics?.mape_pct || modelInfo.mape_pct) && (
                <span className="lbadge text-xs" style={{ color: reliability.color, background: reliability.bg }}>
                  Độ tin cậy {reliability.label}
                </span>
              )}
              {modelInfo.trained_until && (
                <span className="lbadge lbadge-neutral text-xs">
                  {t('forecast.trainedUntil')} {modelInfo.trained_until}
                </span>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="lcard p-5">
            {!result ? (
              <div
                className="flex flex-col items-center justify-center py-20 gap-3"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <span className="icon" style={{ fontSize: 48, opacity: 0.3 }}>trending_up</span>
                <p className="text-sm">Nhấn "Chạy dự báo" để xem biểu đồ</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#6366F1" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#10B981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={fmtCompactMoney}
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false} tickLine={false} width={48}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    x={chartData.find(d => d.isForecast)?.date}
                    stroke="var(--color-warning)"
                    strokeDasharray="4 2"
                    label={{ value: 'Hôm nay', fill: 'var(--color-warning)', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Area
                    type="monotone" dataKey="revenue" name="Lịch sử"
                    stroke="#6366F1" strokeWidth={2} fill="url(#histGrad)"
                    dot={false} connectNulls={false}
                  />
                  <Area
                    type="monotone" dataKey="forecast" name="Dự báo"
                    stroke="#10B981" strokeWidth={2} strokeDasharray="6 3"
                    fill="url(#fcGrad)" dot={false} connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {result && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="lcard p-4">
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                  Tổng doanh thu dự báo
                </p>
                <p className="font-mono text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                  {fmtMoneyExact(forecastTotal)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Trong {forecastRows.length || horizon} ngày tới
                </p>
              </div>

              <div className="lcard p-4">
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                  Trung bình mỗi ngày
                </p>
                <p className="font-mono text-xl font-bold mt-1" style={{ color: 'var(--accent-600)' }}>
                  {fmtMoneyExact(forecastAverage)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Mức doanh thu kỳ vọng/ngày
                </p>
              </div>

              <div className="lcard p-4">
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                  Dải dao động/ngày
                </p>
                <p className="font-mono text-base font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                  {fmtMoneyExact(lowerAverage)} → {fmtMoneyExact(upperAverage)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Khoảng thấp/cao mô hình ước lượng
                </p>
              </div>

              <div className="lcard p-4" style={{ background: reliability.bg }}>
                <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                  Độ tin cậy dự báo
                </p>
                <p className="text-xl font-bold mt-1" style={{ color: reliability.color }}>
                  {reliability.label}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {metrics?.mae != null
                    ? `Sai số trung bình khoảng ${fmtMoneyExact(metrics.mae)}/ngày`
                    : reliability.note}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Controls + Insights ── */}
        <div className="w-full md:w-72 shrink-0 space-y-4">

          {/* Controls */}
          <div className="lcard p-4">
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              Số ngày dự báo
            </p>
            <div
              className="flex flex-wrap gap-1.5 p-1 rounded-xl"
              style={{ background: 'var(--bg-elevated)' }}
            >
              {HORIZONS.map(h => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: horizon === h ? 'var(--primary-500)' : 'transparent',
                    color:      horizon === h ? 'white' : 'var(--text-secondary)',
                    boxShadow:  horizon === h ? 'var(--shadow-primary)' : 'none',
                    minWidth:   40,
                  }}
                >
                  {h}
                </button>
              ))}
            </div>

            <p className="text-xs font-semibold mt-4 mb-2" style={{ color: 'var(--text-secondary)' }}>
              Kênh bán hàng
            </p>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value)}
              className="linput !h-9 text-sm"
            >
              {CHANNEL_KEYS.map(k => (
                <option key={k} value={k}>{t(`dashboard.channel.${k}`)}</option>
              ))}
            </select>

            <button
              onClick={handleRun}
              disabled={loading}
              className="lbtn lbtn-primary w-full justify-center mt-4"
              style={{ height: 40 }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                        style={{ animation: 'spin 0.7s linear infinite' }} />
                  {t('forecast.calculating')}
                </>
              ) : (
                <>
                  <span className="icon text-base">auto_awesome</span>
                  {t('forecast.runForecast')}
                </>
              )}
            </button>

            {/* Retrain button - Owner/DataIT only */}
            {/* <button
              onClick={handleRetrain}
              disabled={retraining}
              className="lbtn w-full justify-center mt-2"
              style={{ height: 36, fontSize: 12, opacity: retraining ? 0.6 : 1,
                       border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}
              title={t('forecast.retrainTitle')}
            >
              {retraining ? (
                <>
                  <span className="w-3 h-3 border-2 rounded-full border-current border-t-transparent"
                        style={{ animation: 'spin 0.7s linear infinite' }} />
                  {t('forecast.retraining')}
                </>
              ) : (
                <>
                  <span className="icon" style={{ fontSize: 14 }}>model_training</span>
                  {t('forecast.retrain')}
                </>
              )}
            </button> */}
            {retrainMsg && (
              <div className="mt-2 p-2 rounded-lg text-xs"
                   style={{
                     background: retrainMsg.type === 'success' ? 'var(--color-success-bg, #f0fdf4)' : 'var(--color-error-bg, #fef2f2)',
                     color: retrainMsg.type === 'success' ? 'var(--color-success, #16a34a)' : 'var(--color-error)',
                   }}>
                {retrainMsg.text}
              </div>
            )}
          </div>

          {/* Insight cards */}
          {trend && (
            <div className="space-y-3">
              {/* Trend */}
              <div className="lcard p-4">
                <p className="text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Xu hướng {horizon} ngày gần nhất
                </p>
                <div className="flex items-center gap-2">
                  <span className="icon" style={{ fontSize: 20, color: isUp ? 'var(--accent-500)' : 'var(--color-error)' }}>
                    {isUp ? 'trending_up' : 'trending_down'}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: isUp ? 'var(--accent-500)' : 'var(--color-error)' }}>
                    {direction === 'UP' ? 'Tăng trưởng' : direction === 'DOWN' ? 'Giảm dần' : 'Ổn định'}
                  </span>
                </div>
              </div>

              {/* Growth rate */}
              <div className="lcard p-4">
                <div className="flex items-center gap-0.5 mb-1">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tăng trưởng dự kiến</p>
                  <InfoTooltip {...MT.revenueGrowth} placement="top" />
                </div>
                <div
                  className="font-mono text-2xl font-bold"
                  style={{ color: isUp ? 'var(--accent-500)' : 'var(--color-error)' }}
                >
                  {isUp ? '+' : ''}{growthPct}%
                </div>
              </div>

              {/* MA7 */}
              {trend.ma7 > 0 && (
                <div className="lcard p-4">
                  <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
                    MA7 hiện tại
                  </p>
                  <div className="font-mono text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {fmtMoneyExact(trend.ma7)}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Trung bình doanh thu 7 ngày gần nhất
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Business confidence + technical details ── */}
      {metrics && (
        <div className="lcard p-5">
          <div className="flex items-start md:items-center gap-3 mb-4 flex-col md:flex-row">
            <div className="flex items-center gap-2">
              <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>verified</span>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Độ tin cậy dự báo
              </h2>
            </div>
            {metricsIsMock && (
              <span className="lbadge text-xs ml-1"
                style={{ background: 'rgba(234,179,8,0.12)', color: '#92400e', border: '1px solid rgba(234,179,8,0.3)' }}>
                Dữ liệu mẫu
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowTechnicalDetails(v => !v)}
              className="lbtn lbtn-ghost ml-auto text-xs"
              style={{ height: 32 }}
            >
              <span className="icon" style={{ fontSize: 15 }}>
                {showTechnicalDetails ? 'expand_less' : 'analytics'}
              </span>
              {showTechnicalDetails ? 'Ẩn chi tiết kỹ thuật' : 'Xem chi tiết kỹ thuật'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl" style={{ background: reliability.bg }}>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                Mức sử dụng
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: reliability.color }}>
                {reliability.label}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {reliability.note}
              </p>
            </div>

            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                Sai số trung bình
              </p>
              <p className="font-mono text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
                {metrics.mae != null ? fmtMoneyExact(metrics.mae) : '–'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Chênh lệch bình quân giữa dự báo và thực tế mỗi ngày
              </p>
            </div>

            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>
                Khuyến nghị sử dụng
              </p>
              <p className="text-sm font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
                {reliability.tone === 'good'
                  ? 'Dùng cho kế hoạch bán hàng'
                  : reliability.tone === 'warn'
                    ? 'Dùng kèm kiểm tra thủ công'
                    : 'Chỉ dùng để tham khảo'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Luôn đối chiếu với chiến dịch, ngày lễ và tình trạng tồn kho trước khi ra quyết định lớn.
              </p>
            </div>
          </div>

          {showTechnicalDetails && (
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>analytics</span>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Đánh giá độ chính xác mô hình Prophet
                </h3>
                <span className="lbadge lbadge-neutral text-xs ml-auto">{metrics.eval_method}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'MAE',  tooltip: MT.mae,  value: metrics.mae  != null ? fmtMoneyExact(metrics.mae) : '–', sub: 'Sai số tuyệt đối TB',   color: 'var(--accent-500)' },
                  { label: 'RMSE', tooltip: MT.rmse, value: metrics.rmse != null ? fmtMoneyExact(metrics.rmse) : '–', sub: 'Sai số có trọng số',    color: 'var(--color-warning)' },
                  { label: 'MAPE', tooltip: MT.mape, value: metrics.mape_pct != null ? formatPercent(metrics.mape_pct) : '–', sub: 'Sai số phần trăm', color: 'var(--color-error)' },
                  { label: 'Kiểm tra', tooltip: null, value: `${metrics.n_test ?? '–'} ngày`, sub: `${metrics.test_from ?? ''} → ${metrics.test_to ?? ''}`, color: 'var(--text-tertiary)' },
                ].map(({ label, tooltip, value, sub, color }) => (
                  <div key={label} className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-0.5 mb-1">
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                      {tooltip && <InfoTooltip {...tooltip} placement="top" />}
                    </div>
                    <p className="font-mono text-lg font-bold" style={{ color }}>{value}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>
                  </div>
                ))}
              </div>

              <div className="text-xs p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Phân chia đánh giá:</strong>{' '}
                {metrics.n_train} ngày huấn luyện / {metrics.n_test} ngày kiểm tra (tỷ lệ 80/20)
                {' · '}
                <strong style={{ color: 'var(--text-secondary)' }}>Dữ liệu kiểm tra:</strong>{' '}
                {metrics.test_from} → {metrics.test_to}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bảng so sánh + chart + feature importance ── */}
      {comparison?.models && showTechnicalDetails && (
        <div className="lcard p-5 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>compare_arrows</span>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Đánh giá và so sánh mô hình dự báo
              </h2>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Cùng tập dữ liệu · Train {comparison.train_period?.days} ngày
              ({comparison.train_period?.from} → {comparison.train_period?.to})
              · Test {comparison.test_period?.days} ngày
              ({comparison.test_period?.from} → {comparison.test_period?.to})
            </p>
          </div>

          {/* Bảng so sánh */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[
                    { h: t('forecast.colModel'),  tip: null        },
                    { h: t('forecast.colType'),   tip: null        },
                    { h: t('forecast.colMae'),    tip: MT.mae      },
                    { h: t('forecast.colRmse'),   tip: MT.rmse     },
                    { h: t('forecast.colMape'),   tip: MT.mape     },
                    { h: t('forecast.colSmape'),  tip: MT.smape    },
                  ].map(({ h, tip }) => (
                    <th key={h} className="pb-2 text-left font-semibold text-xs"
                        style={{ color: 'var(--text-secondary)' }}>
                      <span className="inline-flex items-center gap-0.5">
                        {h}{tip && <InfoTooltip {...tip} placement="bottom" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const models    = comparison.models
                  const bestSmape = Math.min(...Object.values(models).map(m => m.smape_pct))
                  const rows = [
                    { key: 'Naive',        label: 'Naive',        type: t('forecast.typeBaseline'),  dim: true },
                    { key: 'MA-7',         label: 'MA-7',         type: t('forecast.typeBaseline'),  dim: true },
                    { key: 'Holt-Winters', label: 'Holt-Winters', type: t('forecast.typeStatistic'),  dim: false },
                    { key: 'LightGBM',     label: 'LightGBM',     type: t('forecast.typeML'),        dim: false },
                    { key: 'Prophet',      label: 'Prophet',      type: t('forecast.typeTS'),         dim: false },
                  ]
                  return rows.filter(r => models[r.key]).map(({ key, label, type, dim }) => {
                    const m         = models[key]
                    const isBest    = m.smape_pct === bestSmape
                    const isProphet = key === 'Prophet'
                    return (
                      <tr key={key} style={{
                        borderBottom: '1px solid var(--border)',
                        background:   isProphet ? 'rgba(99,102,241,0.05)' : 'transparent',
                        opacity:      dim ? 0.6 : 1,
                      }}>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs" style={{ color: 'var(--text-primary)' }}>{label}</span>
                            {isProphet && <span className="lbadge lbadge-primary text-xs">{t('forecast.currentBadge')}</span>}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>{type}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {m.mae != null ? fmtMoneyExact(m.mae) : '–'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {m.rmse != null ? fmtMoneyExact(m.rmse) : '–'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {m.mape_pct != null ? m.mape_pct + '%' : '–'}
                        </td>
                        <td className="py-2.5">
                          <span className="font-mono text-sm font-bold" style={{
                            color: isBest ? 'var(--accent-500)' : 'var(--text-primary)',
                          }}>
                            {m.smape_pct}%
                          </span>
                          {isBest && <span className="ml-1 text-xs" style={{ color: 'var(--accent-500)' }}>↑</span>}
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>

          {/* Chart Actual vs Predicted */}
          {comparison.chart_data?.dates && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                Actual vs Predicted — tập test ({comparison.test_period?.days} ngày)
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  data={comparison.chart_data.dates.map((d, i) => ({
                    date:         d.slice(5),
                    actual:       comparison.chart_data.actual[i],
                    holtwinters:  comparison.chart_data.predictions['Holt-Winters']?.[i],
                    lightgbm:     comparison.chart_data.predictions['LightGBM']?.[i],
                    prophet:      comparison.chart_data.predictions['Prophet']?.[i],
                  }))}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                         axisLine={false} tickLine={false} interval={19} />
                  <YAxis tickFormatter={fmtCompactMoney}
                         tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                         axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v, n) => [fmtMoneyExact(v), n]} />
                  <Line type="monotone" dataKey="actual"      name="Actual"       stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="holtwinters" name="Holt-Winters" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="lightgbm"    name="LightGBM"     stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="prophet"     name="Prophet"      stroke="#6366f1" strokeWidth={2}   dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Feature importance LightGBM */}
          {comparison.lgbm_feature_importance && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                Feature Importance — LightGBM (top 6)
              </p>
              <div className="space-y-1.5">
                {Object.entries(comparison.lgbm_feature_importance).slice(0, 6).map(([feat, pct]) => (
                  <div key={feat} className="flex items-center gap-2">
                    <span className="text-xs w-24 shrink-0 font-mono" style={{ color: 'var(--text-secondary)' }}>{feat}</span>
                    <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)', height: 6 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary-500)', borderRadius: 9999 }} />
                    </div>
                    <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--text-tertiary)' }}>{pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  )
}
