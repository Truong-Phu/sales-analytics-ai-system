import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

const fmtVnd = n =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', notation: 'compact', maximumFractionDigits: 1 }).format(n)

function KpiCard({ icon, label, value, sub, color = '#6366F1' }) {
  return (
    <div className="rounded-xl p-5 flex items-start gap-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}>
        <span className="icon text-xl" style={{ color }}>{icon}</span>
      </div>
      <div>
        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</div>}
      </div>
    </div>
  )
}

const PLAN_COLORS = {
  pro:        { bg: '#EDE9FE', color: '#7C3AED' },
  free:       { bg: '#F1F5F9', color: '#475569' },
  enterprise: { bg: '#FEF9C3', color: '#92400E' },
}

export default function SaDashboard() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    axios.get('/api/admin/sa/dashboard')
      .then(r => setData(r.data.data))
      .catch(() => setError(t('common.cannotLoadData')))
      .finally(() => setLoading(false))
  }, [t])

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
        ))}
      </div>
    </div>
  )

  if (error) return <p className="text-red-500 text-sm">{error}</p>
  if (!data)  return null

  const kpis = [
    { icon: 'business',         label: t('sa.dashboard.kpiCompanies'),      value: data.totalCompanies,      color: '#6366F1' },
    { icon: 'check_circle',     label: t('sa.dashboard.kpiActiveCompanies'), value: data.activeCompanies,     color: '#10B981' },
    { icon: 'group',            label: t('sa.dashboard.kpiUsers'),          value: data.totalUsers,          color: '#3B82F6' },
    { icon: 'person_check',     label: t('sa.dashboard.kpiActiveUsers'),     value: data.activeUsers,         color: '#0EA5E9' },
    { icon: 'workspace_premium',label: t('sa.dashboard.kpiPro'),            value: data.proSubscriptions,    color: '#F59E0B' },
    { icon: 'payments',         label: t('sa.dashboard.kpiRevenue'),        value: fmtVnd(data.monthlyRevenue), color: '#EF4444' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('sa.dashboard.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('sa.dashboard.subtitle')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Registrations by month */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('sa.dashboard.registrationsChart')}
          </h2>
          {data.registrationsByMonth.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-tertiary)' }}>{t('common.noData')}</p>
          ) : (
            <div className="space-y-2">
              {data.registrationsByMonth.map(m => {
                const maxCount = Math.max(...data.registrationsByMonth.map(x => x.count), 1)
                const pct = Math.round((m.count / maxCount) * 100)
                return (
                  <div key={`${m.year}-${m.month}`} className="flex items-center gap-3">
                    <span className="text-xs w-16 shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                      {String(m.month).padStart(2,'0')}/{m.year}
                    </span>
                    <div className="flex-1 h-5 rounded-sm overflow-hidden"
                      style={{ background: 'var(--bg-elevated)' }}>
                      <div className="h-full rounded-sm transition-all"
                        style={{ width: `${pct}%`, background: '#6366F1', minWidth: 4 }} />
                    </div>
                    <span className="text-xs w-6 text-right font-medium"
                      style={{ color: 'var(--text-primary)' }}>{m.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top companies */}
        <div className="rounded-xl p-5"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {t('sa.dashboard.latestCompanies')}
          </h2>
          <div className="space-y-3">
            {data.topCompanies.map(c => {
              const planCfg = PLAN_COLORS[c.subscription?.plan ?? 'free'] ?? PLAN_COLORS.free
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {t('sa.dashboard.userCount', { count: c.userCount })}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: planCfg.bg, color: planCfg.color }}>
                    {c.subscription?.plan ?? 'free'}
                  </span>
                </div>
              )
            })}
            {data.topCompanies.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>{t('sa.dashboard.noCompanies')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
