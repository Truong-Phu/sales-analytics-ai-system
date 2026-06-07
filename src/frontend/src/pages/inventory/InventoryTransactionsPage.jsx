import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'

const TYPE_STYLE = {
  POS_SALE:               { bg: 'rgba(239,68,68,0.10)',   text: '#EF4444' },
  SALE_OUT:               { bg: 'rgba(239,68,68,0.10)',   text: '#EF4444' },
  ORDER_CANCEL_REFUND:    { bg: 'rgba(16,185,129,0.10)',  text: '#10B981' },
  RETURN_REFUND:          { bg: 'rgba(139,92,246,0.10)',  text: '#7C3AED' },
  MARKETPLACE_IMPORT_SALE:{ bg: 'rgba(245,158,11,0.10)',  text: '#F59E0B' },
  IMPORT_STOCK:           { bg: 'rgba(59,130,246,0.10)',  text: '#3B82F6' },
  MANUAL_ADJUST_UP:       { bg: 'rgba(99,102,241,0.10)',  text: '#6366F1' },
  MANUAL_ADJUST_DOWN:     { bg: 'rgba(249,115,22,0.10)',  text: '#F97316' },
}

function TypeBadge({ type, label }) {
  const style = TYPE_STYLE[type] ?? { bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ background: style.bg, color: style.text }}>
      {label || type}
    </span>
  )
}

function QtyChange({ change }) {
  const isPos = change > 0
  return (
    <span className="font-semibold tabular-nums"
          style={{ color: isPos ? '#10B981' : '#EF4444' }}>
      {isPos ? '+' : ''}{change}
    </span>
  )
}

function resolveStockSnapshot(row) {
  const before = Number(row.beforeStock ?? 0)
  const after = Number(row.afterStock ?? before)
  const change = Number(row.quantityChange ?? 0)

  if (change !== 0 && before === after) {
    return { before: after - change, after }
  }

  return { before, after }
}

export default function InventoryTransactionsPage() {
  const { t } = useTranslation()
  const [rows,      setRows]      = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [totalPages,setTotalPages]= useState(1)
  const [loading,   setLoading]   = useState(true)

  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')

  const TYPE_LABELS = {
    POS_SALE:               t('invTx.typePosSale'),
    SALE_OUT:               t('invTx.typeOutSale'),
    ORDER_CANCEL_REFUND:    t('invTx.typeReturnStock'),
    RETURN_REFUND:          t('invTx.typeReturn'),
    MARKETPLACE_IMPORT_SALE:t('invTx.typePlatform'),
    IMPORT_STOCK:           t('invTx.typeStockIn'),
    MANUAL_ADJUST_UP:       t('invTx.typeAdjPlus'),
    MANUAL_ADJUST_DOWN:     t('invTx.typeAdjMinus'),
  }

  const COLS = [
    t('invTx.colTime'), t('invTx.colProduct'), t('invTx.colType'),
    t('invTx.colDelta'), t('invTx.colBeforeAfter'),
    t('invTx.colSource'), t('invTx.colUser'),
  ]

  const PAGE_SIZE = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, pageSize: PAGE_SIZE }
      if (filterType) params.type = filterType
      if (filterFrom) params.from = filterFrom
      if (filterTo)   params.to   = filterTo

      const res = await api.get('/api/inventory/transactions', { params })
      const d = res.data
      setRows(d.items ?? [])
      setTotal(d.total ?? 0)
      setTotalPages(d.totalPages ?? 1)
      setPage(p)
    } catch {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setPage(1)
    } finally {
      setLoading(false)
    }
  }, [filterType, filterFrom, filterTo])

  useEffect(() => { load(1) }, [load])

  const fmtDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('invTx.title')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('invTx.subtitle', { count: total.toLocaleString() })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {t('invTx.filterType')}
          </label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">{t('invTx.filterAll')}</option>
            {Object.entries(TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('invTx.filterFrom')}</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{t('invTx.filterTo')}</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <button onClick={() => load(1)} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--primary-500)' }}>
          {t('invTx.filterBtn')}
        </button>

        <button
          onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo('') }}
          className="px-4 py-1.5 rounded-lg text-sm border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          {t('invTx.clearFilter')}
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {t('invTx.emptyState')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {COLS.map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const stock = resolveStockSnapshot(r)
                return (
                <tr key={r.transactionId} className="transition-colors"
                    style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.productName ?? `#${r.productId}`}</span>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={r.transactionType} label={TYPE_LABELS[r.transactionType]} />
                  </td>
                  <td className="px-4 py-3">
                    <QtyChange change={r.quantityChange} />
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    <span>{stock.before}</span>
                    <span className="mx-1" style={{ color: 'var(--text-tertiary)' }}>→</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{stock.after}</span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {r.referenceType && r.referenceId
                      ? <span>{r.referenceType} #{r.referenceId}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {r.createdBy ?? <span style={{ color: 'var(--text-tertiary)' }}>ETL</span>}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>
            {t('invTx.pageLabel', { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {t('invTx.pagePrev')}
            </button>
            <button disabled={page >= totalPages} onClick={() => load(page + 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {t('invTx.pageNext')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
