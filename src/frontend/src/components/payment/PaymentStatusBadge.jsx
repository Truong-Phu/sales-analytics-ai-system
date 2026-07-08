const STATUS_CONFIG = {
  PENDING:   { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#F59E0B', dot: '#F59E0B',  label: 'Chờ thanh toán' },
  PAID:      { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  text: '#10B981', dot: '#10B981',  label: 'Đã thanh toán'  },
  FAILED:    { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   text: '#EF4444', dot: '#EF4444',  label: 'Thất bại'       },
  CANCELLED: { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', text: '#64748B', dot: '#64748B',  label: 'Đã huỷ'         },
  EXPIRED:   { bg: 'rgba(156,163,175,0.10)', border: 'rgba(156,163,175,0.25)', text: '#9CA3AF', dot: '#9CA3AF',  label: 'Hết hạn'        },
  UNPAID:    { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#F59E0B', dot: '#F59E0B',  label: 'Chưa thanh toán' },
  REFUNDED:  { bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  text: '#6366F1', dot: '#6366F1',  label: 'Hoàn tiền'       },
}

export default function PaymentStatusBadge({ status, size = 'sm' }) {
  const normKey = String(status || '').toUpperCase()
  const cfg = STATUS_CONFIG[normKey] ?? STATUS_CONFIG.PENDING
  const textSize = size === 'xs' ? '10px' : '11px'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap"
      style={{
        background  : cfg.bg,
        border      : `1px solid ${cfg.border}`,
        color       : cfg.text,
        fontSize    : textSize,
        padding     : size === 'xs' ? '1px 6px' : '2px 8px',
      }}>
      <span className="rounded-full" style={{ width: 5, height: 5, background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}
