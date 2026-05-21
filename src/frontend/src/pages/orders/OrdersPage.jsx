import { useState, useEffect, useCallback, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import FilterPill from '../../components/ui/FilterPill'
import { getOrders, updateOrderStatus, cancelOrder, getOrderNotes, addOrderNote, deleteOrderNote } from '../../api/dashboardApi'
import api from '../../api/axios'
import { useAuth } from '../../hooks/useAuth'
import { MOCK_ORDERS } from '../../mockData/orders'

const STATUS_COLOR = {
  pending:    { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', text: '#64748B',              dot: '#64748B'  },
  confirmed:  { bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  text: 'var(--primary-500)',  dot: 'var(--primary-500)' },
  processing: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#F59E0B',              dot: '#F59E0B'  },
  shipping:   { bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.25)',  text: '#3B82F6',              dot: '#3B82F6'  },
  delivered:  { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  text: 'var(--accent-500)',   dot: 'var(--accent-500)'  },
  cancelled:  { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   text: '#EF4444',              dot: '#EF4444'  },
  returned:   { bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.30)',  text: '#F97316',              dot: '#F97316'  },
}

const CHANNEL_CFG = {
  shopee:  { bg: 'rgba(238,77,45,0.12)',    text: '#EE4D2D', label: 'Shopee'   },
  tiktok:  { bg: 'rgba(45,212,191,0.15)',   text: '#0D9488', label: 'TikTok'   }, // teal — hoạt động cả light+dark
  lazada:  { bg: 'rgba(15,61,209,0.12)',    text: '#0F3DD1', label: 'Lazada'   },
  offline: { bg: 'rgba(139,92,246,0.12)',   text: '#7C3AED', label: 'Offline'  },
  facebook:{ bg: 'rgba(24,119,242,0.12)',   text: '#1877F2', label: 'Facebook' },
  website: { bg: 'rgba(99,102,241,0.12)',   text: '#6366F1', label: 'Website'  }, // brand indigo
}

function ChannelBadge({ name }) {
  const key = (name ?? '').toLowerCase().replace(' shop', '').replace(' ', '')
  const cfg = CHANNEL_CFG[key] ?? { bg: 'rgba(100,116,139,0.1)', text: '#64748B', label: name ?? '—' }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  )
}

const STATUSES = ['pending', 'processing', 'shipping', 'delivered', 'cancelled', 'returned']
const CHANNELS = ['shopee', 'tiktok', 'lazada', 'offline', 'facebook', 'website']

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

// Modal cập nhật trạng thái đơn hàng
function UpdateOrderModal({ order, onClose, onSaved }) {
  const [form, setForm] = useState({
    status:        order.status?.toUpperCase() ?? 'PENDING',
    paymentStatus: order.paymentStatus ?? 'UNPAID',
    shippingStatus:order.shippingStatus ?? 'NOT_SHIPPED',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const handleSave = async () => {
    setSaving(true)
    setErr('')
    try {
      await updateOrderStatus(order.orderId, form)
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.message ?? 'Lỗi cập nhật đơn hàng')
    } finally {
      setSaving(false)
    }
  }

  const sel = (label, field, options) => (
    <div key={field}>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <select className="linput text-sm"
              value={form[field]}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="lcard w-full max-w-sm p-6 space-y-4 scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
            Cập nhật đơn hàng #{order.externalOrderId}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span className="icon">close</span>
          </button>
        </div>

        {err && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</p>}

        {sel('Trạng thái đơn', 'status', [
          { value:'PENDING',   label:'Chờ xác nhận' },
          { value:'CONFIRMED', label:'Đã xác nhận' },
          { value:'SHIPPING',  label:'Đang giao' },
          { value:'DELIVERED', label:'Đã giao' },
          { value:'CANCELLED', label:'Đã hủy' },
          { value:'RETURNED',  label:'Hoàn trả' },
        ])}
        {sel('Trạng thái thanh toán', 'paymentStatus', [
          { value:'UNPAID', label:'Chưa thanh toán' },
          { value:'PAID',   label:'Đã thanh toán' },
          { value:'REFUNDED',label:'Đã hoàn tiền' },
        ])}
        {sel('Trạng thái vận chuyển', 'shippingStatus', [
          { value:'NOT_SHIPPED', label:'Chưa giao' },
          { value:'PICKED_UP',   label:'Đã lấy hàng' },
          { value:'IN_TRANSIT',  label:'Đang vận chuyển' },
          { value:'DELIVERED',   label:'Đã giao' },
          { value:'RETURNED',    label:'Hoàn hàng' },
        ])}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="lbtn lbtn-secondary flex-1 justify-center">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="lbtn lbtn-primary flex-1 justify-center">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ghi chú nội bộ đơn hàng ──────────────────────────────────────────────────
function OrderNotes({ orderId, canDelete }) {
  const [notes,    setNotes]    = useState([])
  const [text,     setText]     = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    setLoading(true)
    getOrderNotes(orderId)
      .then(res => setNotes(res.data ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false))
  }, [orderId])

  const handleAdd = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const res = await addOrderNote(orderId, text.trim())
      setNotes(prev => [res.data, ...prev])
      setText('')
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  const handleDelete = async (noteId) => {
    if (!window.confirm('Xóa ghi chú này?')) return
    try {
      await deleteOrderNote(orderId, noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch { /* silent */ }
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="icon text-sm" style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>note_alt</span>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Ghi chú nội bộ</span>
      </div>

      {/* Danh sách ghi chú */}
      {loading ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Đang tải...</p>
      ) : notes.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Chưa có ghi chú nào</p>
      ) : (
        <div className="space-y-2 mb-3">
          {notes.map(n => (
            <div key={n.id} className="flex items-start gap-2 p-2 rounded-lg"
                 style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{n.userName}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(n.createdAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{n.note}</p>
              </div>
              {canDelete && (
                <button onClick={() => handleDelete(n.id)}
                        className="w-6 h-6 flex items-center justify-center rounded shrink-0"
                        style={{ color: '#EF4444' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="icon" style={{ fontSize: 14 }}>delete_outline</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form thêm ghi chú */}
      <div className="flex items-center gap-2">
        <input
          className="linput flex-1 text-xs !h-8"
          placeholder="Thêm ghi chú nội bộ..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !saving && handleAdd()}
          maxLength={500}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="lbtn lbtn-primary !h-8 !px-3 text-xs shrink-0"
        >
          {saving ? '...' : 'Thêm'}
        </button>
      </div>
    </div>
  )
}

// ─── Order detail panel (fetches details on mount) ───────────────────────────
function OrderDetailPanel({ order }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/orders/oltp/${order.orderId}`)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [order.orderId])

  const items = detail?.details ?? order.details ?? []

  // Đọc đúng field: ưu tiên camelCase từ API mới, fallback sang snake_case cũ
  const orderCode     = order.orderCode     ?? order.externalOrderId ?? order.order_code   ?? '—'
  const custName      = order.customerName  ?? order.customer_name   ?? order.recipientName ?? '—'
  const custPhone     = order.customerPhone ?? order.customer_phone  ?? order.phone ?? '—'
  const shipProv      = order.shippingProvince ?? order.shipping_province ?? order.province ?? ''
  const shipDist      = order.shippingDistrict ?? order.shipping_district ?? order.district ?? ''
  const shipFull      = order.shippingFullAddress ?? order.shipping_full_address ?? ([shipDist, shipProv].filter(Boolean).join(', ') || '—')
  const trackNum      = order.trackingNumber ?? order.tracking_number ?? '—'
  const ghnCode       = order.ghnOrderCode  ?? order.ghn_order_code  ?? ''
  const platStatus    = order.platformStatus ?? order.platform_status ?? ''
  const paidAt        = order.paidAt        ?? order.paid_at
  const deliveredAt   = order.deliveredAt   ?? order.delivered_at

  return (
    <div className="space-y-4 mb-3">
      {/* Thông tin khách & địa chỉ */}
      <div className="p-3 rounded-lg space-y-1.5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>Khách hàng & Giao hàng</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {[
            ['Mã đơn hàng',   orderCode],
            ['Tên khách',     custName],
            ['Số điện thoại', custPhone],
            ['Địa chỉ giao',  shipFull],
          ].map(([label, val]) => (
            <div key={label} className="flex items-start gap-1">
              <span className="shrink-0 min-w-[90px]" style={{ color: 'var(--text-secondary)' }}>{label}:</span>
              <span className="font-medium break-all" style={{ color: 'var(--text-primary)' }}>{val || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Phí vận chuyển', value: fmtVND(order.shippingFee ?? order.shipping_fee) },
          { label: 'Thanh toán',     value: order.paymentMethod ?? order.payment_method ?? '—' },
          { label: 'Mã vận đơn',     value: trackNum },
          { label: 'Mã GHN',         value: ghnCode || '—' },
          { label: 'TT sàn',         value: platStatus || '—' },
          { label: 'TT giao hàng',   value: (order.shippingStatus ?? order.shipping_status ?? '—').replace(/_/g,' ') },
          { label: 'Ngày thanh toán',value: paidAt ? new Date(paidAt).toLocaleDateString('vi-VN') : '—' },
          { label: 'Ngày giao',      value: deliveredAt ? new Date(deliveredAt).toLocaleDateString('vi-VN') : '—' },
        ].map(item => (
          <div key={item.label} className="p-2 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-secondary)' }}>{item.label}</div>
            <div className="font-mono font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Items table */}
      {loading ? (
        <div className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Đang tải sản phẩm...</div>
      ) : items.length > 0 ? (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                {['Ảnh', 'Sản phẩm', 'SKU', 'Giá gốc', 'Giá bán', 'SL', 'Thành tiền'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const imageUrl   = item.imageUrl ?? item.image_url
                const salePrice  = item.salePrice  ?? item.sale_price  ?? item.unitPrice ?? item.unit_price ?? 0
                const origPrice  = item.originalPrice ?? item.original_price ?? salePrice
                const subtotal   = item.subtotal ?? (salePrice * (item.quantity ?? 1))
                const variation  = item.variationName ?? item.variation_name ?? item.variation
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-3 py-2 w-10">
                      {imageUrl
                        ? <img src={imageUrl} alt="" className="w-9 h-9 rounded object-cover" onError={e => e.target.style.display='none'} />
                        : <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
                            <span className="icon text-base" style={{ color: 'var(--text-tertiary)' }}>image</span>
                          </div>
                      }
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div>{item.productName ?? item.product_name}</div>
                      {variation && <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{variation}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{item.sku || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-tertiary)', textDecoration: origPrice > salePrice ? 'line-through' : 'none' }}>{fmtVND(origPrice)}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{fmtVND(salePrice)}</td>
                    <td className="px-3 py-2 text-center font-mono" style={{ color: 'var(--text-primary)' }}>{item.quantity}</td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtVND(subtotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export default function OrdersPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canDelete = ['Owner', 'Manager'].includes(user?.role)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState('all')
  const [channel, setChannel] = useState('all')
  const [page,    setPage]    = useState(1)
  const [expanded, setExpanded] = useState(null)
  const [editOrder, setEditOrder] = useState(null)  // order đang cập nhật
  const [toast,    setToast]  = useState('')         // toast message

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

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

  const handleCancel = async (order, e) => {
    e.stopPropagation()
    if (!window.confirm(`Hủy đơn hàng #${order.externalOrderId}?`)) return
    try {
      await cancelOrder(order.orderId)
      showToast('Đã hủy đơn hàng thành công')
      fetchData()
    } catch (err) {
      showToast(err.response?.data?.message ?? 'Lỗi hủy đơn hàng')
    }
  }

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

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
             style={{ background: 'var(--primary-500)', color: 'white' }}>
          {toast}
        </div>
      )}

      {/* Update status modal */}
      {editOrder && (
        <UpdateOrderModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); showToast('Cập nhật thành công'); fetchData() }}
        />
      )}

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
                  {[t('orders.orderId'), 'Kênh', t('orders.customer'),
                    t('orders.amount'), 'Vận chuyển', t('common.status'), t('orders.date'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-sm font-semibold tracking-wide"
                        style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <Fragment key={order.orderId}>
                    <tr
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onClick={() => setExpanded(expanded === order.orderId ? null : order.orderId)}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td className="px-4 py-3 font-mono text-sm" style={{ color: 'var(--primary-500)' }}>
                        {order.orderCode ?? order.externalOrderId ?? order.order_code ?? order.orderId}
                      </td>
                      <td className="px-4 py-3">
                        <ChannelBadge name={order.channelLabel ?? order.channel} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                          {order.customerName ?? order.customer_name ?? order.recipientName ?? '—'}
                        </div>
                        {(order.customerPhone ?? order.customer_phone) && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {order.customerPhone ?? order.customer_phone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {fmtVND(order.totalAmount ?? order.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {(order.trackingNumber ?? order.tracking_number) && (
                          <div className="font-mono" style={{ color: 'var(--primary-500)' }}>
                            {order.trackingNumber ?? order.tracking_number}
                          </div>
                        )}
                        {(order.ghnOrderCode ?? order.ghn_order_code) && (
                          <div className="font-mono" style={{ color: 'var(--text-tertiary)' }}>
                            GHN: {order.ghnOrderCode ?? order.ghn_order_code}
                          </div>
                        )}
                        {!(order.trackingNumber ?? order.ghnOrderCode) && (
                          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={order.status} label={t(`orders.status.${order.status}`, order.status)} />
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(order.platformCreatedAt ?? order.platform_created_at ?? order.orderDate ?? order.createdAt ?? 0).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {!isMock && (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); setEditOrder(order) }}
                                title="Cập nhật trạng thái"
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                style={{ color: 'var(--primary-500)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <span className="icon" style={{ fontSize: 16 }}>edit</span>
                              </button>
                              {order.status !== 'delivered' && (
                                <button
                                  onClick={e => handleCancel(order, e)}
                                  title="Hủy đơn hàng"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                  style={{ color: '#EF4444' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                  <span className="icon" style={{ fontSize: 16 }}>cancel</span>
                                </button>
                              )}
                            </>
                          )}
                          <span className="icon text-base" style={{ color: 'var(--text-tertiary)', transition: 'transform 0.2s',
                            transform: expanded === order.orderId ? 'rotate(180deg)' : '' }}>
                            expand_more
                          </span>
                        </div>
                      </td>
                    </tr>
                    {expanded === order.orderId && (
                      <tr key={`${order.orderId}-detail`}>
                        <td colSpan={8} className="px-4 py-4" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                          <OrderDetailPanel order={order} />
                          <OrderNotes orderId={order.orderId} canDelete={canDelete} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
