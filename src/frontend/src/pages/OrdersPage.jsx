import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '../components/ui/Spinner'
import { getOrders } from '../api/dashboardApi'

const STATUS_STYLE = {
  pending:   'badge-warning',
  confirmed: 'badge-info',
  shipping:  'badge-info',
  delivered: 'badge-success',
  cancelled: 'badge-error',
  returned:  'badge-error',
}

export default function OrdersPage() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('all')
  const [page,    setPage]    = useState(1)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getOrders({ search, status: status === 'all' ? '' : status, page, limit: 20 })
      setData(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [search, status, page, t])

  useEffect(() => { fetchData() }, [fetchData])

  const STATUSES = ['all', 'pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'returned']

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('orders.title')}</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-outline text-base">
            search
          </span>
          <input
            type="text"
            className="form-input !pl-9"
            placeholder="Tìm theo mã đơn, tên khách hàng..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="form-input !py-2 !px-3 text-sm"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>
              {s === 'all' ? 'Tất cả trạng thái' : t(`orders.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : data && (
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-outline text-sm">Tổng: {data.total?.toLocaleString('vi-VN')} đơn</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left text-outline font-medium pb-3 pr-4">{t('orders.orderId')}</th>
                  <th className="text-left text-outline font-medium pb-3 pr-4">{t('orders.customer')}</th>
                  <th className="text-left text-outline font-medium pb-3 pr-4">{t('orders.channel')}</th>
                  <th className="text-right text-outline font-medium pb-3 pr-4">{t('orders.amount')}</th>
                  <th className="text-left text-outline font-medium pb-3 pr-4">{t('orders.paymentMethod')}</th>
                  <th className="text-center text-outline font-medium pb-3 pr-4">{t('common.status')}</th>
                  <th className="text-left text-outline font-medium pb-3">{t('common.createdAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {data.items?.map(order => (
                  <tr key={order.orderId} className="hover:bg-surface-container/50 transition-colors">
                    <td className="py-3 pr-4 text-primary font-mono text-xs">{order.externalOrderId}</td>
                    <td className="py-3 pr-4 text-on-surface">{order.customerName}</td>
                    <td className="py-3 pr-4">
                      <span className="badge-info capitalize">{order.channel}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-on-surface font-medium">
                      ₫{order.totalAmount?.toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 pr-4 text-outline">{order.paymentMethod}</td>
                    <td className="py-3 pr-4 text-center">
                      <span className={STATUS_STYLE[order.status] ?? 'badge-info'}>
                        {t(`orders.status.${order.status}`)}
                      </span>
                    </td>
                    <td className="py-3 text-outline text-xs">
                      {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-outline-variant">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary !py-1.5 !px-3 disabled:opacity-40"
              >
                <span className="icon text-base">chevron_left</span>
              </button>
              <span className="text-outline text-sm">Trang {page} / {data.totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="btn-secondary !py-1.5 !px-3 disabled:opacity-40"
              >
                <span className="icon text-base">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
