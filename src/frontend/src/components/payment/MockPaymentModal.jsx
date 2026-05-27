import { useState } from 'react'
import api from '../../api/axios'

/**
 * Modal giả lập thanh toán MoMo / VNPAY — chỉ hiện cho Admin/SuperAdmin trong dev/demo mode.
 * Cho phép simulate: success | failed | cancelled
 */
export default function MockPaymentModal({ transaction, provider, onClose, onResult }) {
  const [loading, setLoading]   = useState(false)
  const [error,   setError]     = useState('')

  const providerLabel = { MOMO: 'MoMo', VNPAY: 'VNPAY' }[provider] ?? provider

  const simulate = async result => {
    setLoading(true)
    setError('')
    try {
      const endpoint = provider === 'MOMO' ? '/api/payment/mock/momo' : '/api/payment/mock/vnpay'
      await api.post(endpoint, { paymentCode: transaction.paymentCode, result })
      onResult(result)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Lỗi giả lập thanh toán')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        {/* Dev mode banner */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-4 text-xs font-medium"
          style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          <span className="icon text-sm">science</span>
          Chế độ Demo / Development
        </div>

        <div className="text-center mb-5">
          <div className="text-3xl mb-2">{provider === 'MOMO' ? '🟣' : '💳'}</div>
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Giả lập {providerLabel}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Mã GD: <span className="font-mono">{transaction?.paymentCode}</span>
          </p>
          <p className="text-sm font-bold mt-1" style={{ color: 'var(--primary-500)' }}>
            ₫{Number(transaction?.amount).toLocaleString('vi-VN')}
          </p>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <div className="space-y-2">
          <button onClick={() => simulate('success')} disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: '#10B981', color: 'white' }}>
            <span className="icon text-base">check_circle</span>
            Giả lập thanh toán thành công
          </button>
          <button onClick={() => simulate('failed')} disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="icon text-base">cancel</span>
            Giả lập thanh toán thất bại
          </button>
          <button onClick={() => simulate('cancelled')} disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            <span className="icon text-base">block</span>
            Giả lập người dùng huỷ
          </button>
        </div>

        <button onClick={onClose} disabled={loading}
          className="w-full mt-3 py-2 rounded-xl text-sm text-center"
          style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Đóng
        </button>
      </div>
    </div>
  )
}
