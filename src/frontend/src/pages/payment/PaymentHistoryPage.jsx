import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import PaymentStatusBadge from '../../components/payment/PaymentStatusBadge'

const METHOD_LABEL = {
  CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', VIETQR: 'VietQR',
  MOMO: 'MoMo', VNPAY: 'VNPAY',
}

function fmtVND(v) {
  if (!v && v !== 0) return '–'
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}M`
  return `₫${Number(v).toLocaleString('vi-VN')}`
}
function fmtDate(d) {
  if (!d) return '–'
  return new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PaymentHistoryPage() {
  const [items,    setItems]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const pageSize = 20

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/payment/history?page=${page}&pageSize=${pageSize}`)
      setItems(res.data.data ?? [])
      setTotal(res.data.total ?? 0)
    } catch {
      setError('Không thể tải lịch sử thanh toán')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Lịch sử thanh toán
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {total} giao dịch
          </p>
        </div>
        <button onClick={load}
          className="lbtn lbtn-secondary text-sm" style={{ height: 36 }}>
          <span className="icon text-base">refresh</span>
          Làm mới
        </button>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              {['Mã GD', 'Phương thức', 'Số tiền', 'Trạng thái', 'Loại', 'Ngày tạo', 'Ngày TT'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded skeleton" style={{ width: j === 2 ? 80 : 120 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center"
                  style={{ color: 'var(--text-tertiary)' }}>
                  Chưa có giao dịch nào
                </td>
              </tr>
            ) : items.map(tx => (
              <tr key={tx.id}
                style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {tx.paymentCode}
                </td>
                <td className="px-4 py-3">
                  {METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}
                </td>
                <td className="px-4 py-3 font-bold" style={{ color: 'var(--primary-500)' }}>
                  {fmtVND(tx.amount)}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={tx.status} />
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {tx.orderId ? `Đơn #${tx.orderId}` : tx.invoiceId ? 'Gói dịch vụ' : '—'}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {fmtDate(tx.createdAt)}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: tx.paidAt ? '#10B981' : 'var(--text-tertiary)' }}>
                  {fmtDate(tx.paidAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm"
          style={{ color: 'var(--text-secondary)' }}>
          <span>Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)' }}>← Trước</button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)' }}>Tiếp →</button>
          </div>
        </div>
      )}
    </div>
  )
}
