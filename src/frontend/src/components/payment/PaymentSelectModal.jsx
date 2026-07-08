import { useState, useEffect } from 'react'
import api from '../../api/axios'
import DetailDrawer from '../ui/DetailDrawer'

const ALL_METHOD_OPTIONS = {
  CASH:   { icon: 'payments',     label: 'Tiền mặt',  desc: 'Nhận tiền trực tiếp, xác nhận thủ công'            },
  VIETQR: { icon: 'qr_code_2',   label: 'VietQR',    desc: 'Quét QR hoặc chuyển khoản theo thông tin hiển thị'  },
  MOMO:   { icon: 'phone_iphone', label: 'MoMo',      desc: 'Ví điện tử MoMo'                                    },
  VNPAY:  { icon: 'credit_card',  label: 'VNPAY',     desc: 'Cổng thanh toán VNPAY'                              },
}

const FALLBACK_METHODS = ['CASH', 'VIETQR']

function fmtVND(v) {
  if (!v && v !== 0) return '–'
  return `₫${Number(v).toLocaleString('vi-VN')}`
}

export default function PaymentSelectModal({ order, onClose, onSuccess }) {
  const [methods,  setMethods]  = useState([])
  const [selected, setSelected] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error,    setError]    = useState('')

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

  const footer = (
    <>
      <button
        onClick={onClose}
        style={{
          flex: 1,
          padding: '10px 0',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 500,
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
        }}
      >
        Huỷ
      </button>
      <button
        onClick={handleConfirm}
        disabled={loading || fetching || !selected}
        style={{
          flex: 2,
          padding: '10px 0',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          background: loading || fetching || !selected ? 'var(--bg-elevated)' : 'var(--primary-500)',
          color: loading || fetching || !selected ? 'var(--text-tertiary)' : '#fff',
          border: 'none',
          cursor: loading || fetching || !selected ? 'not-allowed' : 'pointer',
          opacity: loading || fetching || !selected ? 0.6 : 1,
          transition: 'all 0.15s',
        }}
      >
        {loading ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
      </button>
    </>
  )

  return (
    <DetailDrawer
      open={!!order}
      onClose={onClose}
      title="Chọn phương thức thanh toán"
      subtitle={order ? `Đơn #${order.orderCode} — ${fmtVND(order.totalAmount)}` : ''}
      width={420}
      footer={footer}
    >
      <div style={{ padding: '20px' }}>

        {/* Thông tin đơn hàng */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          marginBottom: 20,
        }}>
          <span className="icon text-2xl" style={{ color: 'var(--primary-500)' }}>receipt_long</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              #{order?.orderCode}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Tổng cộng: <strong style={{ color: 'var(--text-primary)' }}>{fmtVND(order?.totalAmount)}</strong>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            background: 'rgba(239,68,68,0.08)',
            color: '#EF4444',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
            {error}
          </div>
        )}

        {/* Danh sách phương thức */}
        {fetching ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--bg-elevated)' }}
                   className="skeleton" />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 4, letterSpacing: '0.05em' }}>
              PHƯƠNG THỨC
            </div>
            {methods.map(key => {
              const m = ALL_METHOD_OPTIONS[key]
              if (!m) return null
              const isSelected = selected === key
              return (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: `1.5px solid ${isSelected ? 'var(--primary-500)' : 'var(--border)'}`,
                    background: isSelected ? 'rgba(99,102,241,0.07)' : 'var(--bg-elevated)',
                    transition: 'all 0.15s',
                  }}
                >
                  <input type="radio" name="payMethod" value={key}
                    checked={isSelected}
                    onChange={() => setSelected(key)}
                    style={{ display: 'none' }} />
                  <span className="icon" style={{
                    fontSize: 26,
                    color: isSelected ? 'var(--primary-500)' : 'var(--text-tertiary)',
                    flexShrink: 0,
                  }}>{m.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{m.desc}</div>
                  </div>
                  {isSelected && (
                    <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)', flexShrink: 0 }}>
                      check_circle
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </div>
    </DetailDrawer>
  )
}
