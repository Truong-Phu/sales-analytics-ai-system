import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getSupplierPerformance } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const map = {
    GOOD:     { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  color: '#22C55E' },
    WARNING:  { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: '#F59E0B' },
    CRITICAL: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#EF4444' },
  }
  const labels = {
    GOOD: t('supplierPerf.statusGood'), WARNING: t('supplierPerf.statusWarning'), CRITICAL: t('supplierPerf.statusDanger'),
  }
  const s = map[status] ?? map.WARNING
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {labels[status] ?? status}
    </span>
  )
}

function QualityStars({ score }) {
  const full = Math.floor(score)
  const half = score - full >= 0.5
  return (
    <span className="text-sm" style={{ color: '#F59E0B' }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
      <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>{score.toFixed(1)}</span>
    </span>
  )
}

function OnTimeBar({ rate }) {
  const color = rate >= 0.85 ? '#22C55E' : rate >= 0.70 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-bold" style={{ color }}>{(rate * 100).toFixed(1)}%</span>
      <div className="w-20 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${rate * 100}%`, background: color }} />
      </div>
    </div>
  )
}

export default function SupplierPage() {
  const { t } = useTranslation()
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const [days,   setDays]   = useState(90)
  const [filter, setFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('on_time_rate')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getSupplierPerformance({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const suppliers = data?.suppliers ?? []
  const filtered  = filter === 'ALL' ? suppliers : suppliers.filter(s => s.status === filter)
  const sorted    = [...filtered].sort((a, b) => {
    if (sortBy === 'on_time_rate') return b.on_time_rate - a.on_time_rate
    if (sortBy === 'avg_lead_days') return a.avg_lead_days - b.avg_lead_days
    if (sortBy === 'total_value') return b.total_value - a.total_value
    return 0
  })

  const counts    = { GOOD: 0, WARNING: 0, CRITICAL: 0 }
  suppliers.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })
  const avgOnTime = suppliers.length ? suppliers.reduce((s, r) => s + r.on_time_rate, 0) / suppliers.length : 0
  const worst     = suppliers.reduce((w, s) => (!w || s.on_time_rate < w.on_time_rate) ? s : w, null)

  const fmt = v => fmtMoneyExact(v)

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('supplierPerf.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('supplierPerf.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="linput text-sm">
            <option value="on_time_rate">{t('supplierPerf.sortOnTime')}</option>
            <option value="avg_lead_days">{t('supplierPerf.sortLeadTime')}</option>
            <option value="total_value">{t('supplierPerf.sortValue')}</option>
          </select>
          <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 110 }}>
            {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} {t('common.days')}</option>)}
          </select>
          <button onClick={load} className="lbtn lbtn-primary text-sm">{t('common.refresh')}</button>
        </div>
      </div>

      {!data && !loading && <AiEmptyState title={t('supplierPerf.emptyState')} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('supplierPerf.kpiTotal'),          tip: null,          value: suppliers.length, color: 'var(--primary-500)' },
          { label: t('supplierPerf.kpiAvgOnTime'),       tip: MT.onTimeRate, value: `${(avgOnTime * 100).toFixed(1)}%`, color: avgOnTime >= 0.85 ? '#22C55E' : '#F59E0B' },
          { label: t('supplierPerf.kpiGood'),            tip: MT.onTimeRate, value: counts.GOOD,      color: '#22C55E' },
          { label: t('supplierPerf.kpiNeedAttention'),   tip: MT.onTimeRate, value: counts.WARNING + counts.CRITICAL, color: counts.WARNING + counts.CRITICAL > 0 ? '#EF4444' : 'var(--text-tertiary)' },
        ].map(k => (
          <div key={k.label} className="lcard p-4">
            <div className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {k.label}{k.tip && <InfoTooltip {...k.tip} placement="top" />}
            </div>
            <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'ALL',      label: t('supplierPerf.filterAll') },
          { key: 'GOOD',     label: t('supplierPerf.filterGood') },
          { key: 'WARNING',  label: t('supplierPerf.filterWarning') },
          { key: 'CRITICAL', label: t('supplierPerf.filterDanger') },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
            style={filter === f.key
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {f.label}
            {f.key !== 'ALL' && <span className="ml-1 text-xs opacity-70">({counts[f.key] ?? 0})</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <div className="lcard overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {[
                    { h: t('supplierPerf.colSupplier'), tip: null             },
                    { h: t('supplierPerf.colStatus'),   tip: null             },
                    { h: t('supplierPerf.colOnTime'),   tip: MT.onTimeRate    },
                    { h: t('supplierPerf.colLeadTime'), tip: MT.leadTime      },
                    { h: t('supplierPerf.colTotal'),    tip: MT.onTimeRate    },
                    { h: t('supplierPerf.colQuality'),  tip: MT.qualityScore  },
                    { h: t('supplierPerf.colValue'),    tip: MT.totalRevenue  },
                  ].map(({ h, tip }) => (
                    <th key={h} className="text-left p-4 text-xs font-semibold"
                      style={{ color: 'var(--text-tertiary)' }}>
                      <span className="inline-flex items-center gap-0.5">
                        {h}{tip && <InfoTooltip {...tip} placement="bottom" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.supplier_name} style={{ borderBottom: '1px solid var(--border)' }}
                    className="transition-colors"
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-4">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.supplier_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {s.late_deliveries} {t('supplierPerf.lateDelivery', { total: s.total_deliveries })}
                      </div>
                    </td>
                    <td className="p-4 text-center"><StatusBadge status={s.status} /></td>
                    <td className="p-4"><OnTimeBar rate={s.on_time_rate} /></td>
                    <td className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>{s.avg_lead_days.toFixed(1)} {t('supplierPerf.daysSuffix')}</td>
                    <td className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>{s.total_quantity.toLocaleString()}</td>
                    <td className="p-4 text-center"><QualityStars score={s.quality_score} /></td>
                    <td className="p-4 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(s.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>{t('supplierPerf.noData')}</div>
          )}
        </div>
      )}

      {/* Worst supplier alert */}
      {worst && worst.status === 'CRITICAL' && (
        <div className="rounded-xl p-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#991B1B' }}>
          {t('supplierPerf.warningAlert', { name: worst.supplier_name })} ({(worst.on_time_rate * 100).toFixed(1)}%)
        </div>
      )}
    </div>
  )
}
