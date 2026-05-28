import { useState } from 'react'
import api from '../../api/axios'

function fmtVND(v) {
  if (!v && v !== 0) return '–'
  return `₫${Number(v).toLocaleString('vi-VN')}`
}

export default function ManualConfirmModal({ transaction, onClose, onConfirmed }) {
  const [txCode,  setTxCode]  = useState('')
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const methodLabel = {
    CASH: 'Tiền mặt', VIETQR: 'VietQR', MOMO: 'MoMo', VNPAY: 'VNPAY',
  }[transaction?.paymentMethod] ?? transaction?.paymentMethod

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(`/api/payment/transaction/${transaction.id}/confirm`, {
        transactionCode: txCode || null,
        notes: notes || null,
      })
      onConfirmed()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Lỗi xác nhận thanh toán')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Xác nhận đã thanh toán
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <span className="icon text-xl">close</span>
          </button>
        </div>

        <div className="mb-4 p-3 rounded-xl space-y-1"
          style={{ background: 'var(--bg-elevated)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Mã GD</span>
            <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {transaction?.paymentCode}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Phương thức</span>
            <span style={{ color: 'var(--text-primary)' }}>{methodLabel}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Số tiền</span>
            <span className="font-bold" style={{ color: 'var(--primary-500)' }}>
              {fmtVND(transaction?.amount)}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Mã giao dịch <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(tuỳ chọn)</span>
            </label>
            <input type="text" className="linput text-sm"
              placeholder="VD: FT26152912345"
              value={txCode} onChange={e => setTxCode(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Ghi chú <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(tuỳ chọn)</span>
            </label>
            <input type="text" className="linput text-sm"
              placeholder="Ghi chú về thanh toán"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            Huỷ
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: '#10B981', color: 'white' }}>
            <span className="icon text-base">check_circle</span>
            {loading ? 'Đang xác nhận...' : 'Xác nhận đã thu tiền'}
          </button>
        </div>
      </div>
    </div>
  )
}
