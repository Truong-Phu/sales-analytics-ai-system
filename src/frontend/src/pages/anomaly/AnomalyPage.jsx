import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getAnomaly, getAnomalyRootCause } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'
import DetailDrawer from '../../components/ui/DetailDrawer'

const SEVERITY_COLOR = {
  high:   { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   text: '#EF4444',  dot: '#EF4444'  },
  medium: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#F59E0B',  dot: '#F59E0B'  },
  low:    { bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  text: 'var(--primary-500)', dot: 'var(--primary-500)' },
}
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok']

function SeverityBadge({ level }) {
  const { t } = useTranslation()
  const c = SEVERITY_COLOR[level] ?? SEVERITY_COLOR.low
  const label = t(`anomaly.severity.${level}`, level)
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {label}
    </span>
  )
}

function ZBar({ z }) {
  const abs = Math.abs(z)
  const pct = Math.min((abs / 5) * 100, 100)
  const color = abs >= 3 ? '#EF4444' : abs >= 2.5 ? '#F59E0B' : 'var(--primary-500)'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-xs w-12 text-right" style={{ color }}>
        {z > 0 ? '+' : ''}{z.toFixed(2)}σ
      </span>
    </div>
  )
}

function renderFormattedText(text) {
  if (!text) return null
  const parts = text.split('**')
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} className="font-semibold">{part}</strong>
    }
    return part
  })
}

function cleanChannelName(name) {
  if (!name) return ''
  return name.replace(/\s*Phú\s+Thịnh/gi, '')
}

export default function AnomalyPage() {
  const { t } = useTranslation()
  const [days,    setDays]    = useState(90)
  const [channel, setChannel] = useState('all')
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)

  const [selectedDate, setSelectedDate] = useState(null)
  const [rcaData,      setRcaData]      = useState(null)
  const [rcaLoading,   setRcaLoading]   = useState(false)

  // Tải dữ liệu RCA tự động khi chọn ngày
  useEffect(() => {
    if (!selectedDate) {
      setRcaData(null)
      return
    }
    setRcaLoading(true)
    getAnomalyRootCause(selectedDate)
      .then(res => setRcaData(res))
      .catch(() => setRcaData(null))
      .finally(() => setRcaLoading(false))
  }, [selectedDate])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await getAnomaly(days, channel)
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [days, channel])

  const anomalies = data?.anomalies ?? []
  const highCount = anomalies.filter(a => a.severity === 'high').length
  const maxZ      = anomalies.length > 0 ? Math.max(...anomalies.map(a => Math.abs(a.zScore ?? 0))) : 0

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('anomaly.title')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('anomaly.subtitle')}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex p-1 rounded-xl gap-1"
            style={{ background: 'var(--bg-elevated)' }}
          >
            {[30, 60, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: days === d ? 'var(--primary-500)' : 'transparent',
                  color: days === d ? 'white' : 'var(--text-secondary)',
                  boxShadow: days === d ? 'var(--shadow-primary)' : 'none',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="linput !h-9 text-sm"
            style={{ minWidth: 120 }}
          >
            {CHANNEL_KEYS.map(k => (
              <option key={k} value={k}>{t(`dashboard.channel.${k}`)}</option>
            ))}
          </select>
          <button
            onClick={fetchData}
            className="lbtn lbtn-secondary !h-9"
            disabled={loading}
          >
            <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>
              refresh
            </span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="lcard p-16 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <span
              className="w-8 h-8 border-2 rounded-full"
              style={{
                borderColor: 'var(--border-strong)',
                borderTopColor: 'var(--primary-500)',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <span className="text-sm">{t('common.loading')}</span>
          </div>
        </div>
      ) : !data ? (
        <AiEmptyState title="Chưa đủ dữ liệu phát hiện bất thường" />
      ) : (
        <>
          {/* Summary KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: t('anomaly.total'),       tooltip: MT.anomaly,  value: anomalies.length, color: 'var(--text-primary)', icon: 'warning_amber' },
              { label: t('anomaly.highSeverity'), tooltip: null,         value: highCount,        color: '#EF4444',             icon: 'error_outline'  },
              { label: t('anomaly.maxZScore'),    tooltip: MT.zScore,   value: maxZ > 0 ? `${maxZ.toFixed(2)}σ` : '–', color: 'var(--primary-500)', icon: 'show_chart' },
            ].map(card => (
              <div key={card.label} className="lcard p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    {card.label}
                    {card.tooltip && <InfoTooltip {...card.tooltip} placement="top" />}
                  </span>
                  <span
                    className="icon w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ fontSize: 18, background: `${card.color}18`, color: card.color }}
                  >
                    {card.icon}
                  </span>
                </div>
                <div className="font-mono text-2xl font-bold" style={{ color: card.color }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* Anomaly table */}
          {anomalies.length === 0 ? (
            <div className="lcard p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <span className="icon" style={{ fontSize: 48, color: 'var(--accent-500)', opacity: 0.6 }}>check_circle</span>
              <p className="text-sm">{t('anomaly.noAnomaly')}</p>
            </div>
          ) : (
            <div className="lcard overflow-hidden">
              <div
                className="px-5 py-4 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--border)' }}
              >
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {t('anomaly.list')}
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {t('anomaly.detected')}: {anomalies.length}
                  </p>
                </div>
                <span
                  className="lbadge text-xs"
                  style={{
                    background: highCount > 0 ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)',
                    color: highCount > 0 ? '#EF4444' : 'var(--accent-500)',
                    border: `1px solid ${highCount > 0 ? 'rgba(239,68,68,0.30)' : 'rgba(16,185,129,0.30)'}`,
                  }}
                >
                  {highCount > 0 ? t('anomaly.highSeverityBadge', { count: highCount }) : t('anomaly.noHighSeverity')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      {[
                        { h: t('anomaly.date'),     tip: null         },
                        { h: t('common.channel'),   tip: MT.salesChannel },
                        { h: t('anomaly.value'),    tip: MT.netRevenue },
                        { h: t('anomaly.zscore'),   tip: MT.zScore    },
                        { h: t('common.severity'),  tip: MT.anomaly   },
                        { h: 'Thao tác',            tip: null         },
                      ].map(({ h, tip }) => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold tracking-wide"
                            style={{ color: 'var(--text-tertiary)' }}>
                          <span className="inline-flex items-center gap-0.5">
                            {h}{tip && <InfoTooltip {...tip} placement="bottom" />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((a, i) => (
                      <tr
                        key={i}
                        className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => setSelectedDate(a.date)}
                      >
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {a.date}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          >
                            {cleanChannelName(a.channel)}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {fmtMoneyExact(a.value ?? 0)}
                        </td>
                        <td className="px-5 py-3" style={{ minWidth: 140 }}>
                          <ZBar z={a.zScore ?? 0} />
                        </td>
                        <td className="px-5 py-3">
                          <SeverityBadge level={a.severity} />
                        </td>
                        <td className="px-5 py-3">
                          <button
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                            style={{ borderColor: 'rgba(99,102,241,0.35)', color: 'var(--primary-600)', background: 'rgba(99,102,241,0.06)', cursor: 'pointer' }}
                            onMouseEnter={e => { e.currentTarget.style.background='var(--primary-500)'; e.currentTarget.style.color='white' }}
                            onMouseLeave={e => { e.currentTarget.style.background='rgba(99,102,241,0.06)'; e.currentTarget.style.color='var(--primary-600)' }}
                            onClick={(e) => { e.stopPropagation(); setSelectedDate(a.date) }}
                          >
                            <span className="icon" style={{ fontSize: 13 }}>analytics</span>
                            Phân tích
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Drawer trượt phân tích nguyên nhân gốc rễ */}
      <DetailDrawer
        open={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        title="Phân tích nguyên nhân gốc rễ"
        subtitle={`Ngày phát hiện bất thường: ${selectedDate}`}
        width={560}
      >
        {rcaLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <span className="w-7 h-7 border-2 rounded-full"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.7s linear infinite' }} />
            <span>Đang truy vấn dữ liệu & phân tích...</span>
          </div>
        ) : !rcaData ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Không thể tải dữ liệu phân tích nguyên nhân cho ngày {selectedDate}.
          </div>
        ) : (
          <div className="p-5 space-y-6 overflow-y-auto flex-1">
            {/* Tóm tắt AI */}
            <div className="p-4 rounded-xl space-y-2" style={{ background: rcaData.direction === 'HIGH' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${rcaData.direction === 'HIGH' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              <div className="flex items-center gap-1.5 font-bold text-sm" style={{ color: rcaData.direction === 'HIGH' ? '#10B981' : '#EF4444' }}>
                <span className="icon" style={{ fontSize: 16 }}>{rcaData.direction === 'HIGH' ? 'trending_up' : 'trending_down'}</span>
                AI Phân Tích
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                {renderFormattedText(rcaData.root_cause_summary)}
              </p>
            </div>

            {/* Nguyên nhân khả nghi */}
            {rcaData.possible_causes?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Nguyên nhân có thể xảy ra</h4>
                <ul className="space-y-1.5">
                  {rcaData.possible_causes.map((c, idx) => (
                    <li key={idx} className="text-sm flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="icon text-amber-500 shrink-0 mt-0.5" style={{ fontSize: 14 }}>info</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Đóng góp theo Kênh */}
            {rcaData.channel_breakdown?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Biến động theo Kênh bán hàng</h4>
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Kênh</th>
                        <th className="text-right px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Doanh thu</th>
                        <th className="text-right px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Biến động</th>
                        <th className="text-right px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Đóng góp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rcaData.channel_breakdown.map((ch, idx) => (
                        <tr key={idx} style={{ borderBottom: idx < rcaData.channel_breakdown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{cleanChannelName(ch.channel)}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtMoneyExact(ch.revenue)}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: ch.vs_avg > 0 ? '#10B981' : ch.vs_avg < 0 ? '#EF4444' : 'var(--text-tertiary)' }}>
                            {ch.vs_avg > 0 ? '+' : ''}{ch.vs_avg}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{ch.contribution}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Biến động theo Sản phẩm */}
            {rcaData.product_breakdown?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Top sản phẩm biến động doanh số</h4>
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Sản phẩm</th>
                        <th className="text-right px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Doanh thu</th>
                        <th className="text-right px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>Số lượng</th>
                        <th className="text-right px-3 py-2" style={{ color: 'var(--text-tertiary)' }}>So với TB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rcaData.product_breakdown.map((prod, idx) => (
                        <tr key={idx} style={{ borderBottom: idx < rcaData.product_breakdown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td className="px-3 py-2 font-medium truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }} title={prod.product_name}>{prod.product_name}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtMoneyExact(prod.revenue)}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{prod.qty_sold}</td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: prod.vs_avg > 0 ? '#10B981' : prod.vs_avg < 0 ? '#EF4444' : 'var(--text-tertiary)' }}>
                            {prod.vs_avg > 0 ? '+' : ''}{prod.vs_avg}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Khuyến nghị hành động */}
            {rcaData.actions?.length > 0 && (
              <div className="space-y-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Hành động khuyến nghị</h4>
                <div className="flex flex-col gap-2">
                  {rcaData.actions.map((act, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 p-3 rounded-lg border text-sm" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                      <span className="icon text-indigo-500 shrink-0 mt-0.5" style={{ fontSize: 16 }}>lightbulb</span>
                      <div className="flex-1 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {act}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
