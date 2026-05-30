import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ComposedChart, Area, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import MockToast from '../../components/ui/MockToast'
import MockDataButton from '../../components/ui/MockDataButton'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getForecast, getTrend, getForecastMetrics } from '../../api/aiApi'
import { getMockForecast, MOCK_TREND } from '../../mockData/forecast'

const MOCK_METRICS = {
  mae: 357188, rmse: 357188, mape_pct: 39.69,
  train_from: '2025-10-02', train_to: '2025-12-01',
  test_from: '2025-12-05', test_to: '2025-12-22',
  n_train: 19, n_test: 5, eval_method: 'hold-out 80/20',
}

const HORIZONS   = [7, 14, 30, 60, 90]
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok']

function fmtM(v) {
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `₫${(v / 1_000).toFixed(0)}K`
  return `₫${v}`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const isForecast = p?.payload?.isForecast
  return (
    <div className="lcard p-3 text-sm" style={{ boxShadow: 'var(--shadow-md)', minWidth: 160 }}>
      <div className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
        {fmtM(p?.value ?? 0)}
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
  const [isMock,        setIsMock]        = useState(false)
  const [metricsIsMock, setMetricsIsMock] = useState(false)
  const [showMockBtn,   setShowMockBtn]   = useState(false)

  const handleRun = async () => {
    setLoading(true)
    setIsMock(false)
    setMetricsIsMock(false)
    setShowMockBtn(false)
    try {
      let metricsFallback = false
      const [fc, tr, mt] = await Promise.all([
        getForecast(horizon, channel),
        getTrend(30, channel),
        getForecastMetrics().catch(() => { metricsFallback = true; return MOCK_METRICS }),
      ])
      setResult(fc)
      setTrend(tr)
      setMetrics(mt)
      setMetricsIsMock(metricsFallback)
    } catch {
      setResult(null)
      setTrend(null)
      setMetrics(null)
      setShowMockBtn(true)
    } finally {
      setLoading(false)
    }
  }

  const loadMock = () => {
    setResult(getMockForecast(horizon))
    setTrend(MOCK_TREND)
    setMetrics(MOCK_METRICS)
    setIsMock(true)
    setMetricsIsMock(true)
    setShowMockBtn(false)
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

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />
      <MockDataButton show={showMockBtn} onClick={loadMock} />

      {!result && !loading && <AiEmptyState title="Chưa có dữ liệu dự báo" />}

      <div className="flex flex-col md:flex-row gap-5">

        {/* ── LEFT: Chart ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t('forecast.title')}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Mô hình Prophet</span>
              {modelInfo.mape_pct && (
                <span className="lbadge lbadge-primary text-xs">
                  MAPE {modelInfo.mape_pct}%
                </span>
              )}
              {modelInfo.trained_until && (
                <span className="lbadge lbadge-neutral text-xs">
                  Train đến {modelInfo.trained_until}
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
                    tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v}
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
                  Đang tính toán...
                </>
              ) : (
                <>
                  <span className="icon text-base">auto_awesome</span>
                  Chạy dự báo
                </>
              )}
            </button>
          </div>

          {/* Insight cards */}
          {trend && (
            <div className="space-y-3">
              {/* Trend */}
              <div className="lcard p-4">
                <p className="text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>Xu hướng</p>
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
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Tăng trưởng dự kiến</p>
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
                    Trung bình 7 ngày (MA7)
                  </p>
                  <div className="font-mono text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {fmtM(trend.ma7)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Metrics bảng đánh giá độ chính xác ── */}
      {metrics && (
        <div className="lcard p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>analytics</span>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Đánh giá độ chính xác mô hình Prophet
            </h2>
            {metricsIsMock && (
              <span className="lbadge text-xs ml-1"
                style={{ background: 'rgba(234,179,8,0.12)', color: '#92400e', border: '1px solid rgba(234,179,8,0.3)' }}>
                Dữ liệu mẫu
              </span>
            )}
            <span className="lbadge lbadge-neutral text-xs ml-auto">{metrics.eval_method}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'MAE',  value: metrics.mae  != null ? `${(metrics.mae/1000).toFixed(1)}K ₫` : '–', sub: 'Mean Absolute Error',      color: 'var(--accent-500)' },
              { label: 'RMSE', value: metrics.rmse != null ? `${(metrics.rmse/1000).toFixed(1)}K ₫` : '–', sub: 'Root Mean Squared Error', color: 'var(--color-warning)' },
              { label: 'MAPE', value: metrics.mape_pct != null ? `${metrics.mape_pct}%` : '–',             sub: 'Mean Abs. % Error',        color: 'var(--color-error)' },
              { label: 'Tập test', value: `${metrics.n_test ?? '–'} ngày`, sub: `${metrics.test_from ?? ''} → ${metrics.test_to ?? ''}`, color: 'var(--text-tertiary)' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                <p className="font-mono text-lg font-bold" style={{ color }}>{value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>
              </div>
            ))}
          </div>

          <div className="text-xs p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Dữ liệu train:</strong>{' '}
            {metrics.n_train} ngày ({metrics.train_from} → {metrics.train_to})
            {' · '}
            <strong style={{ color: 'var(--text-secondary)' }}>Nguồn:</strong>{' '}
            {metrics.source === 'local_sample_data' ? 'Sample data nội bộ' : 'Google Colab'}
            {' · '}
            <strong style={{ color: 'var(--text-secondary)' }}>Prophet</strong> {metrics.prophet_version ?? '1.3.0'}
          </div>
        </div>
      )}
    </div>
  )
}
