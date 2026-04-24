import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getAnomaly } from '../../api/aiApi'
import { MOCK_ANOMALY } from '../../mockData/anomaly'

const SEVERITY_COLOR = {
  high:   { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   text: '#EF4444',  dot: '#EF4444'  },
  medium: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#F59E0B',  dot: '#F59E0B'  },
  low:    { bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  text: 'var(--primary-500)', dot: 'var(--primary-500)' },
}
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok']

function SeverityBadge({ level }) {
  const c = SEVERITY_COLOR[level] ?? SEVERITY_COLOR.low
  const labels = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {labels[level] ?? level}
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

export default function AnomalyPage() {
  const { t } = useTranslation()
  const [days,    setDays]    = useState(90)
  const [channel, setChannel] = useState('all')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setIsMock(false)
    try {
      const res = await getAnomaly(days, channel)
      setData(res)
    } catch {
      setData(MOCK_ANOMALY)
      setIsMock(true)
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
      <MockToast show={isMock} />

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
            <span className="text-sm">Đang phân tích...</span>
          </div>
        </div>
      ) : data && (
        <>
          {/* Summary KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: t('anomaly.total'),       value: anomalies.length, color: 'var(--text-primary)', icon: 'warning_amber' },
              { label: t('anomaly.highSeverity'), value: highCount,        color: '#EF4444',             icon: 'error_outline'  },
              { label: t('anomaly.maxZScore'),    value: maxZ > 0 ? `${maxZ.toFixed(2)}σ` : '–', color: 'var(--primary-500)', icon: 'show_chart' },
            ].map(card => (
              <div key={card.label} className="lcard p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{card.label}</span>
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
                    {anomalies.length} điểm bất thường được phát hiện
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
                  {highCount > 0 ? `${highCount} nghiêm trọng` : 'Không có mức cao'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      {[t('anomaly.date'), t('common.channel'), t('anomaly.value'), 'Z-Score', t('common.severity')].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-semibold tracking-wide"
                            style={{ color: 'var(--text-tertiary)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((a, i) => (
                      <tr
                        key={i}
                        className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {a.date}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                          >
                            {a.channel}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          ₫{((a.value ?? 0) / 1_000_000).toFixed(2)}M
                        </td>
                        <td className="px-5 py-3" style={{ minWidth: 140 }}>
                          <ZBar z={a.zScore ?? 0} />
                        </td>
                        <td className="px-5 py-3">
                          <SeverityBadge level={a.severity} />
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
    </div>
  )
}
