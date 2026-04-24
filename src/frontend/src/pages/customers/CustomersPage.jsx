import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getCustomers } from '../../api/dashboardApi'
import { MOCK_CUSTOMERS } from '../../mockData/customers'

const SEGMENT_CFG = {
  VIP:      { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', color: '#D97706', dot: '#F59E0B', icon: 'star' },
  REGULAR:  { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', color: 'var(--primary-500)', dot: 'var(--primary-500)', icon: 'person' },
  NEW:      { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', color: 'var(--accent-500)', dot: 'var(--accent-500)', icon: 'person_add' },
  INACTIVE: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', color: '#EF4444', dot: '#EF4444', icon: 'person_off' },
}
const SEGMENTS = ['all', 'VIP', 'REGULAR', 'NEW', 'INACTIVE']
const PAGE_SIZE = 10

function SegmentBadge({ seg, label }) {
  const c = SEGMENT_CFG[seg] ?? SEGMENT_CFG.REGULAR
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      <span className="icon" style={{ fontSize: 11 }}>{c.icon}</span>
      {label}
    </span>
  )
}

function Avatar({ name }) {
  const initials = (name ?? '?').split(' ').slice(-2).map(s => s[0]).join('').toUpperCase()
  const hue = (name ?? '').charCodeAt(0) * 37 % 360
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
         style={{ background: `hsl(${hue},50%,50%)` }}>
      {initials}
    </div>
  )
}

export default function CustomersPage() {
  const { t } = useTranslation()
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [isMock,   setIsMock]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [segment,  setSegment]  = useState('all')
  const [page,     setPage]     = useState(1)
  const [selected, setSelected] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setIsMock(false)
    try {
      setData(await getCustomers({ search, segment: segment === 'all' ? '' : segment, page, limit: PAGE_SIZE }))
    } catch {
      const filtered = MOCK_CUSTOMERS.filter(c =>
        (!search  || (c.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
                     (c.customer_code ?? '').toLowerCase().includes(search.toLowerCase())) &&
        (segment === 'all' || c.segment_label === segment)
      )
      const start = (page - 1) * PAGE_SIZE
      setData({ items: filtered.slice(start, start + PAGE_SIZE), total: filtered.length, page,
                totalPages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) })
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [search, segment, page])

  useEffect(() => { fetchData() }, [fetchData])

  const items      = data?.items ?? []
  const totalPages = data?.totalPages ?? 1
  const fmt = n => Number(n ?? 0).toLocaleString('vi-VN')

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('customers.title')}</h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('customers.totalCount', { count: data.total })}
            </p>
          )}
        </div>
        <button onClick={fetchData} className="lbtn lbtn-secondary !h-9" disabled={loading}>
          <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
        </button>
      </div>

      {/* Segment tab filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input type="text" className="linput !pl-9 text-sm"
                 placeholder={t('customers.searchPlaceholder')}
                 value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--bg-elevated)' }}>
          {SEGMENTS.map(s => {
            const cfg = SEGMENT_CFG[s]
            return (
              <button
                key={s}
                onClick={() => { setSegment(s); setPage(1) }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
                style={{
                  background: segment === s ? (cfg ? cfg.bg : 'var(--bg-surface)') : 'transparent',
                  color: segment === s ? (cfg ? cfg.color : 'var(--text-primary)') : 'var(--text-secondary)',
                  border: segment === s ? `1px solid ${cfg ? cfg.border : 'var(--border)'}` : '1px solid transparent',
                }}
              >
                {cfg && <span className="icon" style={{ fontSize: 12 }}>{cfg.icon}</span>}
                {s === 'all' ? t('common.all') : t(`customers.segment.${s}`, s)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="lcard overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <span className="w-7 h-7 border-2 rounded-full"
                  style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>people</span>
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {[t('customers.fullName'), t('customers.email'), t('customers.province'),
                    t('customers.totalOrders'), t('customers.totalRevenue'),
                    t('customers.lastOrder'), t('customers.segment'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold tracking-wide"
                        style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.customer_id ?? c.id ?? i}
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onClick={() => setSelected(c)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.full_name} />
                        <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{c.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.province ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmt(c.total_orders)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmt(c.total_revenue)}₫
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                      {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <SegmentBadge seg={c.segment_label} label={t(`customers.segment.${c.segment_label}`, c.segment_label)} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="icon text-base" style={{ color: 'var(--text-tertiary)' }}>chevron_right</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && !loading && (
          <div className="flex items-center justify-center gap-2 px-5 py-3"
               style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
              <span className="icon text-base">chevron_left</span>
            </button>
            <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
              {t('common.pageInfo', { page, total: totalPages })}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
              <span className="icon text-base">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}
             onClick={() => setSelected(null)}>
          <div className="lcard w-full max-w-md p-6 space-y-4 scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={selected.full_name} />
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{selected.full_name}</div>
                  <SegmentBadge seg={selected.segment_label}
                                label={t(`customers.segment.${selected.segment_label}`, selected.segment_label)} />
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span className="icon">close</span>
              </button>
            </div>

            <div className="space-y-2 text-sm">
              {[
                [t('customers.email'),       selected.email ?? '—'],
                [t('customers.province'),    selected.province ?? '—'],
                [t('customers.totalOrders'), fmt(selected.total_orders)],
                [t('customers.totalRevenue'),`${fmt(selected.total_revenue)}₫`],
                [t('customers.avgOrder'),    `${fmt(selected.avg_order_value)}₫`],
                [t('customers.lastOrder'),   selected.last_order_date
                  ? new Date(selected.last_order_date).toLocaleDateString('vi-VN') : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2"
                     style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                  <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('customers.historyNote')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
