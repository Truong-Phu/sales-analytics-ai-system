import { useState, useEffect } from 'react'
import api from '../../api/axios'

const ALL_METHOD_OPTIONS = {
  CASH:   { icon: '💵', label: 'Tiền mặt', desc: 'Nhận tiền trực tiếp, xác nhận thủ công'       },
  VIETQR: { icon: '📱', label: 'VietQR',   desc: 'Quét QR hoặc chuyển khoản theo thông tin hiển thị' },
  MOMO:   { icon: '🟣', label: 'MoMo',     desc: 'Ví điện tử MoMo'                               },
  VNPAY:  { icon: '💳', label: 'VNPAY',    desc: 'Cổng thanh toán VNPAY'                          },
}

const FALLBACK_METHODS = ['CASH', 'VIETQR']

function fmtVND(v) {
  if (!v && v !== 0) return '–'
  return `₫${Number(v).toLocaleString('vi-VN')}`
}

export default function PaymentSelectModal({ order, onClose, onSuccess }) {
  const [methods,   setMethods]  = useState([])
  const [selected,  setSelected] = useState('')
  const [loading,   setLoading]  = useState(false)
  const [fetching,  setFetching] = useState(true)
  const [error,     setError]    = useState('')

  // Fetch danh sách method được SA bật
  useEffect(() => {
    api.get('/api/payment/methods')
      .then(res => {
        const list = res.data?.data ?? FALLBACK_METHODS
        setMethods(list)
        setSelected(list[0] ?? 'CASH')
      })
      .catch(() => {
        setMethods(FALLBACK_METHODS)
        setSelected('CASH')
      })
      .finally(() => setFetching(false))
  }, [])

  const handleConfirm = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post(`/api/payment/order/${order.orderId}/initiate`, {
        method: selected,
      })
      onSuccess(res.data.data, selected)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Không thể khởi tạo thanh toán')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Chọn phương thức thanh toán
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <span className="icon text-xl">close</span>
          </button>
        </div>

        <div className="mb-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <span className="icon text-base">receipt_long</span>
          <span>Đơn <strong style={{ color: 'var(--text-primary)' }}>#{order.orderCode}</strong> — {fmtVND(order.totalAmount)}</span>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {fetching ? (
          <div className="space-y-2 mb-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 rounded-xl skeleton" />
            ))}
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {methods.map(key => {
              const m = ALL_METHOD_OPTIONS[key]
              if (!m) return null
              return (
                <label key={key}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    border    : `1.5px solid ${selected === key ? 'var(--primary-500)' : 'var(--border)'}`,
                    background: selected === key ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
                  }}>
                  <input type="radio" name="method" value={key}
                    checked={selected === key}
                    onChange={() => setSelected(key)}
                    className="sr-only" />
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.label}</div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{m.desc}</div>
                  </div>
                  {selected === key && (
                    <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>check_circle</span>
                  )}
                </label>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            Huỷ
          </button>
          <button onClick={handleConfirm} disabled={loading || fetching || !selected}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--primary-500)', color: 'white' }}>
            {loading ? 'Đang xử lý...' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  )
}
