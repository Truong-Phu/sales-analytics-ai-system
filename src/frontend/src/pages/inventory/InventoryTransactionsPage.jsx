import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'

const TYPE_CFG = {
  POS_SALE:               { label: 'Bán POS',        bg: 'rgba(239,68,68,0.10)',   text: '#EF4444' },
  ORDER_CANCEL_REFUND:    { label: 'Hoàn kho',        bg: 'rgba(16,185,129,0.10)',  text: '#10B981' },
  MARKETPLACE_IMPORT_SALE:{ label: 'Sàn thương mại', bg: 'rgba(245,158,11,0.10)',  text: '#F59E0B' },
  IMPORT_STOCK:           { label: 'Nhập kho',        bg: 'rgba(59,130,246,0.10)',  text: '#3B82F6' },
  MANUAL_ADJUST_UP:       { label: 'Điều chỉnh +',   bg: 'rgba(99,102,241,0.10)',  text: '#6366F1' },
  MANUAL_ADJUST_DOWN:     { label: 'Điều chỉnh -',   bg: 'rgba(249,115,22,0.10)',  text: '#F97316' },
  RETURN_REFUND:          { label: 'Hoàn trả',        bg: 'rgba(139,92,246,0.10)', text: '#7C3AED' },
}

function TypeBadge({ type }) {
  const cfg = TYPE_CFG[type] ?? { label: type, bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.label}
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

export default function InventoryTransactionsPage() {
  const [rows,      setRows]      = useState([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [totalPages,setTotalPages]= useState(1)
  const [loading,   setLoading]   = useState(true)

  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')

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

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Lịch sử tồn kho
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Audit trail mọi thay đổi tồn kho ({total.toLocaleString()} bản ghi)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Loại giao dịch
          </label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">Tất cả</option>
            {Object.entries(TYPE_CFG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Từ ngày</label>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Đến ngày</label>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <button
          onClick={() => load(1)}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--primary-500)' }}
        >
          Lọc
        </button>

        <button
          onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo('') }}
          className="px-4 py-1.5 rounded-lg text-sm border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Xóa bộ lọc
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Không có dữ liệu
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Thời gian', 'Sản phẩm', 'Loại', '+/- Số lượng', 'Trước → Sau', 'Nguồn', 'Người thực hiện'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.transactionId}
                    className="transition-colors"
                    style={{
                      borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                  <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.productName ?? `#${r.productId}`}</span>
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={r.transactionType} />
                  </td>
                  <td className="px-4 py-3">
                    <QtyChange change={r.quantityChange} />
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    <span>{r.beforeStock}</span>
                    <span className="mx-1" style={{ color: 'var(--text-tertiary)' }}>→</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{r.afterStock}</span>
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>
            Trang {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              ← Trước
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Tiếp →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
