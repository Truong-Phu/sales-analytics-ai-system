import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import FilterPill from '../../components/ui/FilterPill'
import { getOrders } from '../../api/dashboardApi'
import { MOCK_ORDERS } from '../../mockData/orders'

const STATUS_COLOR = {
  pending:   { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#F59E0B',              dot: '#F59E0B'  },
  confirmed: { bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  text: 'var(--primary-500)',  dot: 'var(--primary-500)' },
  shipping:  { bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.25)',  text: '#3B82F6',              dot: '#3B82F6'  },
  delivered: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  text: 'var(--accent-500)',   dot: 'var(--accent-500)'  },
  cancelled: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   text: '#EF4444',              dot: '#EF4444'  },
  returned:  { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   text: '#EF4444',              dot: '#EF4444'  },
}

const STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'returned']
const CHANNELS = ['shopee', 'lazada', 'tiktok', 'facebook', 'website']

function StatusBadge({ status, label }) {
  const c = STATUS_COLOR[status] ?? STATUS_COLOR.confirmed
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {label}
    </span>
  )
}

function fmtVND(v) {
  if (!v && v !== 0) return '–'
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}M`
  return `₫${v.toLocaleString('vi-VN')}`
}

export default function OrdersPage() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('all')
  const [channel, setChannel] = useState('all')
  const [page,    setPage]    = useState(1)
  const [expanded, setExpanded] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setIsMock(false)
    try {
      const res = await getOrders({ search, status: status === 'all' ? '' : status, page, limit: 20 })
      setData(res)
    } catch {
      setData(MOCK_ORDERS)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [search, status, page])

  useEffect(() => { fetchData() }, [fetchData])

  const statusOpts = [{ value: 'all', label: t('orders.allStatuses') },
    ...STATUSES.map(s => ({ value: s, label: t(`orders.status.${s}`) }))]
  const channelOpts = [{ value: 'all', label: 'Tất cả kênh' },
    ...CHANNELS.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))]

  const items = data?.items ?? []
  const filtered = channel === 'all' ? items : items.filter(o => o.channel === channel)

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('orders.title')}
          </h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('orders.totalCount', { count: data.total?.toLocaleString('vi-VN') })}
            </p>
          )}
        </div>
        <button onClick={fetchData} className="lbtn lbtn-secondary !h-9" disabled={loading}>
          <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
        </button>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input
            type="text"
            className="linput !pl-9 text-sm"
            placeholder={t('orders.searchPlaceholder')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <FilterPill label="Trạng thái" options={statusOpts}  value={status}  onChange={v => { setStatus(v);  setPage(1) }} icon="local_shipping" />
        <FilterPill label="Kênh"       options={channelOpts} value={channel} onChange={v => { setChannel(v); setPage(1) }} icon="store" />
      </div>

      {/* Table */}
      <div className="lcard overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <span className="w-7 h-7 border-2 rounded-full"
                  style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>receipt_long</span>
            <p className="text-sm">Không tìm thấy đơn hàng</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {[t('orders.orderId'), t('orders.customer'), t('orders.channel'),
                    t('orders.amount'), t('orders.paymentMethod'), t('common.status'), t('orders.date'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold tracking-wide"
                        style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <>
                    <tr
                      key={order.orderId}
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onClick={() => setExpanded(expanded === order.orderId ? null : order.orderId)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--primary-500)' }}>
                        {order.externalOrderId ?? order.orderId}
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {order.customerName}
                      </td>
                      <td className="px-4 py-3">
                        <span className="lbadge lbadge-neutral text-xs capitalize">{order.channel}</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {fmtVND(order.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {order.paymentMethod}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} label={t(`orders.status.${order.status}`)} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="icon text-base" style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s',
                          transform: expanded === order.orderId ? 'rotate(180deg)' : '' }}>
                          expand_more
                        </span>
                      </td>
                    </tr>
                    {expanded === order.orderId && (
                      <tr key={`${order.orderId}-detail`}>
                        <td colSpan={8} className="px-4 py-4" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            {[
                              { label: 'Mã đơn ngoài',  value: order.externalOrderId ?? '–' },
                              { label: 'Phí vận chuyển', value: fmtVND(order.shippingFee) },
                              { label: 'Giảm giá',       value: fmtVND(order.discount) },
                              { label: 'Hoa hồng',       value: order.commissionFee != null ? fmtVND(order.commissionFee) : '–' },
                            ].map(item => (
                              <div key={item.label}>
                                <div className="mb-1" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
                                <div className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(data?.totalPages ?? 0) > 1 && (
          <div className="flex items-center justify-center gap-2 px-5 py-3"
               style={{ borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40"
            >
              <span className="icon text-base">chevron_left</span>
            </button>
            <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
              {t('common.pageInfo', { page, total: data.totalPages })}
            </span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40"
            >
              <span className="icon text-base">chevron_right</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
