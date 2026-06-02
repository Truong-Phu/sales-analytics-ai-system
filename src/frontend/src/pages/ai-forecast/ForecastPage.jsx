import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ComposedChart, Area, Line, ReferenceLine, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getForecast, getTrend, getForecastMetrics, getModelComparison } from '../../api/aiApi'

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
  const [metricsIsMock,   setMetricsIsMock]   = useState(false)
  const [comparison,      setComparison]      = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setMetricsIsMock(false)
    try {
      let metricsFallback = false
      const [fc, tr, mt, cmp] = await Promise.all([
        getForecast(horizon, channel),
        getTrend(30, channel),
        getForecastMetrics().catch(() => { metricsFallback = true; return null }),
        getModelComparison().catch(() => null),
      ])
      setResult(fc)
      setTrend(tr)
      setMetrics(mt)
      setMetricsIsMock(metricsFallback)
      setComparison(cmp)
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

      {/* ── Bảng so sánh + chart + feature importance ── */}
      {comparison?.models && (
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
                  {['Mô hình', 'Loại', 'MAE (VNĐ)', 'RMSE (VNĐ)', 'MAPE', 'SMAPE'].map(h => (
                    <th key={h} className="pb-2 text-left font-semibold text-xs"
                        style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const models    = comparison.models
                  const bestSmape = Math.min(...Object.values(models).map(m => m.smape_pct))
                  const rows = [
                    { key: 'Naive',        label: 'Naive',        type: 'Baseline',          dim: true },
                    { key: 'MA-7',         label: 'MA-7',         type: 'Baseline',          dim: true },
                    { key: 'Holt-Winters', label: 'Holt-Winters', type: 'Thống kê cổ điển',  dim: false },
                    { key: 'LightGBM',     label: 'LightGBM',     type: 'Machine Learning',  dim: false },
                    { key: 'Prophet',      label: 'Prophet',      type: 'Time-series AI',    dim: false },
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
                            {isProphet && <span className="lbadge lbadge-primary text-xs">Đang dùng</span>}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>{type}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {m.mae != null ? (m.mae / 1_000_000).toFixed(2) + 'M' : '–'}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {m.rmse != null ? (m.rmse / 1_000_000).toFixed(2) + 'M' : '–'}
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
                  <YAxis tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v}
                         tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                         axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v, n) => [fmtM(v), n]} />
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

          {/* Lý do chọn Prophet */}
          <p className="text-xs p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Lý do chọn Prophet:</strong>{' '}
            {comparison.selection_reason}
          </p>
        </div>
      )}

    </div>
  )
}
