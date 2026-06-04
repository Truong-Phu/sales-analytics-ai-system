import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KPI_DEFINITIONS, KPI_GROUPS } from '../../utils/kpiDefinitions'

const GROUP_COLORS = {
  revenue:  { bg: 'rgba(99,102,241,0.06)',  border: 'rgba(99,102,241,0.2)',  accent: '#6366F1' },
  operating:{ bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.2)',  accent: '#10B981' },
  marketing:{ bg: 'rgba(236,72,153,0.06)',  border: 'rgba(236,72,153,0.2)',  accent: '#EC4899' },
  customer: { bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.2)',  accent: '#3B82F6' },
  pnl:      { bg: 'rgba(139,92,246,0.06)',  border: 'rgba(139,92,246,0.2)',  accent: '#8B5CF6' },
}

function KpiCard({ kpiKey, def }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const group  = def.group ?? 'revenue'
  const colors = GROUP_COLORS[group] ?? GROUP_COLORS.revenue

  return (
    <div
      className="rounded-xl border p-4 cursor-pointer transition-all"
      style={{ background: colors.bg, borderColor: colors.border }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                  style={{ background: colors.accent + '22', color: colors.accent }}>
              {KPI_GROUPS[group]?.label ?? group}
            </span>
          </div>
          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            {def.name}
          </h3>
          {/* Formula */}
          <div className="mt-1.5 flex items-start gap-1.5">
            <span className="text-xs font-semibold shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }}>f(x) =</span>
            <code className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: colors.accent + '18', color: colors.accent }}>
              {def.formula}
            </code>
          </div>
        </div>
        <span className="icon text-base shrink-0 mt-1" style={{ color: colors.accent }}>
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </div>

      {/* Description — always visible */}
      <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
        {def.description}
      </p>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 space-y-2.5 pt-3" style={{ borderTop: `1px solid ${colors.border}` }}>
          {def.businessMeaning && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>
                {t('kpiFormulas.businessMeaning')}
              </p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{def.businessMeaning}</p>
            </div>
          )}
          {def.example && (
            <div className="rounded-lg px-3 py-2"
                 style={{ background: colors.accent + '0F', border: `1px dashed ${colors.border}` }}>
              <p className="text-xs font-semibold mb-1" style={{ color: colors.accent }}>
                {t('kpiFormulas.example')}
              </p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{def.example}</p>
            </div>
          )}
          {def.sourceFields?.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>
                {t('kpiFormulas.dataSource')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {def.sourceFields.map(f => (
                  <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function KpiFormulasPage() {
  const { t } = useTranslation()
  const [searchQ, setSearchQ] = useState('')
  const [activeGroup, setActiveGroup] = useState('all')

  const filtered = Object.entries(KPI_DEFINITIONS).filter(([key, def]) => {
    const matchGroup = activeGroup === 'all' || def.group === activeGroup
    const q = searchQ.toLowerCase()
    const matchSearch = !q || def.name.toLowerCase().includes(q)
      || def.formula.toLowerCase().includes(q)
      || def.description.toLowerCase().includes(q)
    return matchGroup && matchSearch
  })

  // Nhóm lại theo group để hiển thị có tổ chức
  const grouped = {}
  filtered.forEach(([key, def]) => {
    const g = def.group ?? 'other'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push([key, def])
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('kpiFormulas.title')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('kpiFormulas.subtitle')}
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="icon icon-sm absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-tertiary)' }}>search</span>
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder={t('kpiFormulas.searchPlaceholder')}
              className="linput pl-8 text-sm"
              style={{ width: 200 }}
            />
          </div>
        </div>
      </div>

      {/* Group filter tabs */}
      <div className="flex items-center gap-1 flex-wrap p-1 rounded-xl"
           style={{ background: 'var(--bg-elevated)' }}>
        <button
          onClick={() => setActiveGroup('all')}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: activeGroup === 'all' ? 'var(--bg-surface)' : 'transparent',
            color: activeGroup === 'all' ? 'var(--primary-600)' : 'var(--text-secondary)',
            boxShadow: activeGroup === 'all' ? 'var(--shadow-sm)' : 'none',
          }}>
          {t('common.all')} ({Object.keys(KPI_DEFINITIONS).length})
        </button>
        {Object.entries(KPI_GROUPS).map(([key, grp]) => {
          const count = Object.values(KPI_DEFINITIONS).filter(d => d.group === key).length
          return (
            <button key={key}
              onClick={() => setActiveGroup(key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeGroup === key ? 'var(--bg-surface)' : 'transparent',
                color: activeGroup === key ? grp.color : 'var(--text-secondary)',
                boxShadow: activeGroup === key ? 'var(--shadow-sm)' : 'none',
              }}>
              <span className="icon text-sm">{grp.icon}</span>
              <span className="hidden sm:inline">{grp.label}</span>
              <span className="text-xs opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {/* KPI cards grouped */}
      {filtered.length === 0 ? (
        <div className="lcard p-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
          <span className="icon text-4xl mb-3 block">search_off</span>
          <p>{t('kpiFormulas.notFound', { query: searchQ })}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([grpKey, items]) => {
            const grpInfo = KPI_GROUPS[grpKey]
            if (!grpInfo) return null
            return (
              <div key={grpKey}>
                {activeGroup === 'all' && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="icon text-base" style={{ color: grpInfo.color }}>{grpInfo.icon}</span>
                    <h2 className="text-sm font-bold uppercase tracking-widest"
                        style={{ color: grpInfo.color }}>
                      {grpInfo.label}
                    </h2>
                    <div className="flex-1 h-px" style={{ background: grpInfo.color + '30' }} />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map(([key, def]) => (
                    <KpiCard key={key} kpiKey={key} def={def} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="lcard p-4 flex items-start gap-3"
           style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.15)' }}>
        <span className="icon text-base shrink-0 mt-0.5" style={{ color: 'var(--primary-500)' }}>info</span>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Tất cả công thức được định nghĩa trong{' '}
          <code className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
            src/frontend/src/utils/kpiDefinitions.js
          </code>{' '}
          — nguồn chân lý duy nhất, dùng chung cho Dashboard, Finance, và báo cáo. Không hardcode tooltip ở nhiều nơi.
        </div>
      </div>
    </div>
  )
}
