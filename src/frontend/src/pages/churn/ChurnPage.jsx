import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getChurnPrediction } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

const CHANNEL_CFG = {
  'SHOPEE':      { icon: '🛒', label: 'Shopee',    color: '#EE4D2D' },
  'TIKTOK_SHOP': { icon: '🎵', label: 'TikTok',    color: '#555555' },
  'LAZADA':      { icon: '🛍️', label: 'Lazada',    color: '#0F146D' },
  'OFFLINE':     { icon: '🏪', label: 'Cửa hàng',  color: '#10B981' },
  'FACEBOOK':    { icon: '📘', label: 'Facebook',   color: '#1877F2' },
  'WEBSITE':     { icon: '🌐', label: 'Website',    color: '#6366F1' },
}

function fmt(v) {
  return fmtMoneyExact(v || 0)
}

const RISK_COLOR = {
  HIGH:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  text: '#EF4444', dot: '#EF4444' },
  MEDIUM: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', text: '#F59E0B', dot: '#F59E0B' },
  LOW:    { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  text: '#22C55E', dot: '#22C55E' },
}

function RiskBadge({ risk }) {
  const { t } = useTranslation()
  const c = RISK_COLOR[risk] ?? RISK_COLOR.LOW
  const label = t(`churn.risk.${risk.toLowerCase()}`, risk)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {label}
    </span>
  )
}

function ProbBar({ pct }) {
  const color = pct >= 70 ? '#EF4444' : pct >= 40 ? '#F59E0B' : '#22C55E'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

export default function ChurnPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)
  const [filter,  setFilter]  = useState('ALL')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getChurnPrediction({ top_n: 100 })
      setData(res)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const filtered = (data?.customers ?? []).filter(c => filter === 'ALL' || c.risk === filter)

  const flatRows = filtered.flatMap(c => {
    const chList = c.channels?.length > 0
      ? c.channels
      : [{ channel: null, orders: 0, revenue: 0, recency_days: null }]
    return chList.map((ch, ci) => ({ c, ch, ci, span: chList.length }))
  })

  const FILTERS = [
    { key: 'ALL',    label: t('churn.filterAll') },
    { key: 'HIGH',   label: t('churn.risk.high') },
    { key: 'MEDIUM', label: t('churn.risk.medium') },
    { key: 'LOW',    label: t('churn.risk.low') },
  ]

  const COLS = [
    { label: t('churn.colCustomer'),   cls: 'p-3 text-left' },
    { label: t('churn.colChannel'),    cls: 'p-3 text-left' },
    { label: t('churn.colRecency'),    cls: 'p-3 text-right' },
    { label: t('churn.colOrders'),     cls: 'p-3 text-right' },
    { label: t('churn.colRevenue'),    cls: 'p-3 text-right' },
    { label: t('churn.colChurnProb'),  cls: 'p-3 text-left' },
    { label: t('churn.colRisk'),       cls: 'p-3 text-center' },
    { label: t('churn.colAction'),     cls: 'p-3 text-left' },
    { label: '',                       cls: 'p-3' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('churn.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('churn.subtitle')}</p>
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">{t('common.refresh')}</button>
      </div>

      {!data && !loading && <AiEmptyState title={t('churn.emptyState')} />}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('churn.totalCustomers'), value: data.total_customers,      color: 'var(--primary-500)' },
            { label: t('churn.highRisk'),        value: data.high_risk_count,      color: '#EF4444' },
            { label: t('churn.mediumRisk'),      value: data.medium_risk_count,    color: '#F59E0B' },
            { label: t('churn.churnRate'),       value: `${data.churn_rate_pct}%`, color: '#EF4444' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {t('churn.thresholdBefore')} <strong>{data.churn_threshold_days} {t('churn.daysSuffix')}</strong> {t('churn.thresholdAfter')}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={filter === f.key
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="lcard overflow-x-auto">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {COLS.map(h => (
                  <th key={h.label} className={`${h.cls} text-xs font-semibold tracking-wide`}
                    style={{ color: 'var(--text-tertiary)', borderBottom: '2px solid var(--border)' }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flatRows.map(({ c, ch, ci, span }) => {
                const cfg = ch.channel
                  ? (CHANNEL_CFG[ch.channel] ?? { icon: '📦', label: ch.channel, color: '#6B7280' })
                  : null
                const isTop = ci === 0
                const recencyColor = ch.recency_days == null ? 'var(--text-tertiary)'
                  : ch.recency_days > 60 ? '#EF4444'
                  : ch.recency_days > 30 ? '#F59E0B'
                  : '#22C55E'
                const rowBorderTop = ci === 0
                  ? '2px solid var(--border)'
                  : '1px dashed color-mix(in srgb, var(--border) 50%, transparent)'

                return (
                  <tr key={`${c.customer_id}-${ci}`} style={{ borderTop: rowBorderTop }}>

                    {ci === 0 && (
                      <td rowSpan={span} className="p-3"
                        style={{ verticalAlign: 'middle', borderRight: '1px solid var(--border)' }}>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.full_name}</div>
                        {c.email && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{c.email}</div>
                        )}
                        {c.phone && (
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.phone}</div>
                        )}
                      </td>
                    )}

                    <td className="px-3 py-2" style={{ verticalAlign: 'middle' }}>
                      {cfg ? (
                        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <span>{cfg.icon}</span>
                          <span className="font-medium" style={{ color: isTop ? cfg.color : 'var(--text-secondary)' }}>
                            {cfg.label}
                          </span>
                          {isTop && (
                            <span className="text-[9px] px-1 rounded"
                              style={{ background: `${cfg.color}20`, color: cfg.color }}>
                              {t('churn.primaryBadge')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap"
                      style={{ verticalAlign: 'middle', color: recencyColor }}>
                      {ch.recency_days != null ? `${ch.recency_days} ${t('churn.daysSuffix')}` : '—'}
                    </td>

                    <td className="px-3 py-2 text-right text-sm"
                      style={{ verticalAlign: 'middle', color: 'var(--text-secondary)' }}>
                      {ch.orders}
                    </td>

                    <td className="px-3 py-2 text-right text-sm font-medium whitespace-nowrap"
                      style={{ verticalAlign: 'middle', color: cfg && isTop ? cfg.color : 'var(--text-secondary)' }}>
                      {fmt(ch.revenue)}₫
                    </td>

                    <td className="px-3 py-2 w-36"
                      style={{ verticalAlign: 'middle', borderLeft: '1px solid var(--border)' }}>
                      <ProbBar pct={c.churn_prob} />
                    </td>

                    <td className="px-3 py-2 text-center" style={{ verticalAlign: 'middle' }}>
                      <RiskBadge risk={c.risk} />
                    </td>

                    <td className="px-3 py-2 text-xs"
                      style={{ verticalAlign: 'middle', color: 'var(--text-tertiary)', maxWidth: 220 }}>
                      {ch.action ?? c.action}
                    </td>

                    {ci === 0 && (
                      <td rowSpan={span} className="px-3 py-2"
                        style={{ verticalAlign: 'middle', borderLeft: '1px solid var(--border)' }}>
                        {c.risk !== 'LOW' && (
                          <button
                            onClick={() => {
                              const params = new URLSearchParams({
                                action:   'retain',
                                customer:  c.full_name,
                                prob:      String(c.churn_prob),
                                risk:      c.risk,
                                channel:   c.channels?.[0]?.channel ?? '',
                              })
                              navigate(`/campaign?${params}`)
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap"
                            style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#EF4444', background: 'rgba(239,68,68,0.06)' }}
                            onMouseEnter={e => { e.currentTarget.style.background='#EF4444'; e.currentTarget.style.color='white' }}
                            onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; e.currentTarget.style.color='#EF4444' }}
                            title={`${t('churn.retainBtn')} ${c.full_name} (churn ${c.churn_prob}%)`}
                          >
                            <span className="icon" style={{ fontSize: 13 }}>campaign</span>
                            {t('churn.retainBtn')}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
