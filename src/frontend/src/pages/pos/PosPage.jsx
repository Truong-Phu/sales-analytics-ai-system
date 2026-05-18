import { useState, useRef, useCallback } from 'react'
import api from '../../api/axios'
import { showToast } from '../../utils/toast'

// ── API helpers ───────────────────────────────────────────────────────────────
const searchCustomers = q => api.get(`/api/pos/customers/search?q=${encodeURIComponent(q)}`).then(r => r.data.customers)
const searchProducts  = q => api.get(`/api/pos/products/search?q=${encodeURIComponent(q)}`).then(r => r.data.products)
const getLoyalty      = id => api.get(`/api/pos/customers/${id}/loyalty`).then(r => r.data)
const validateVoucher = (code, orderValue, customerId) =>
  api.post('/api/pos/vouchers/validate', { code, orderValue, customerId }).then(r => r.data)
const createOrder = dto => api.post('/api/pos/orders', dto).then(r => r.data)

function formatVND(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ'
}

// ── Product Search ────────────────────────────────────────────────────────────
function ProductSearch({ onAdd }) {
  const [q,        setQ]        = useState('')
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const timer = useRef(null)

  const handleChange = e => {
    const v = e.target.value
    setQ(v)
    clearTimeout(timer.current)
    if (!v.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try { setResults(await searchProducts(v)) }
      catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
  }

  const handleAdd = p => {
    onAdd(p)
    setQ('')
    setResults([])
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
           style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
        <span className="icon text-lg" style={{ color: 'var(--text-tertiary)' }}>search</span>
        <input
          value={q}
          onChange={handleChange}
          placeholder="Tìm sản phẩm theo tên hoặc SKU..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                style={{ color: 'var(--accent-500)', animation: 'spin 0.7s linear infinite' }} />
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-xl z-20 overflow-hidden"
             style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          {results.map(p => (
            <button
              key={p.id}
              onClick={() => handleAdd(p)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-opacity-50 transition-colors"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {p.imageUrl
                ? <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                : <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                       style={{ background: 'var(--bg-elevated)' }}>
                    <span className="icon text-xl" style={{ color: 'var(--text-tertiary)' }}>inventory_2</span>
                  </div>
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {p.sku} · Còn {p.stockQty}
                </p>
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--accent-500)' }}>
                {formatVND(p.salePrice)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Customer Search ────────────────────────────────────────────────────────────
function CustomerSearch({ selectedCustomer, onSelect, onClear }) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  const handleChange = e => {
    const v = e.target.value
    setQ(v)
    clearTimeout(timer.current)
    if (!v.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try { setResults(await searchCustomers(v)) }
      catch { setResults([]) }
      finally { setLoading(false) }
    }, 300)
  }

  if (selectedCustomer) {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl"
           style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent-500)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {selectedCustomer.name}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {selectedCustomer.phone} · {selectedCustomer.totalOrders} đơn
          </p>
        </div>
        <button onClick={onClear} className="text-xs px-2 py-1 rounded"
                style={{ color: 'var(--text-tertiary)', background: 'var(--border)' }}>
          Đổi KH
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl border"
           style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
        <span className="icon text-lg" style={{ color: 'var(--text-tertiary)' }}>person_search</span>
        <input
          value={q}
          onChange={handleChange}
          placeholder="Tìm khách theo tên hoặc SĐT..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                style={{ color: 'var(--accent-500)', animation: 'spin 0.7s linear infinite' }} />
        )}
      </div>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-xl z-20 overflow-hidden"
             style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          {results.map(c => (
            <button key={c.id} onClick={() => { onSelect(c); setQ(''); setResults([]) }}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="icon text-2xl mt-0.5" style={{ color: 'var(--text-tertiary)' }}>person</span>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {c.phone} · {c.totalOrders} đơn · {formatVND(c.totalSpent)}
                </p>
                {c.loyaltyPoints > 0 && (
                  <p className="text-xs" style={{ color: '#F59E0B' }}>
                    ★ {c.loyaltyPoints} điểm loyalty
                  </p>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={() => { onSelect({ id: null, name: 'Khách lẻ', phone: '' }); setQ(''); setResults([]) }}
            className="w-full px-4 py-3 text-sm text-left"
            style={{ color: 'var(--accent-500)' }}
          >
            + Tạo khách mới / Khách lẻ
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main POS Page ─────────────────────────────────────────────────────────────
export default function PosPage() {
  const [cart,           setCart]           = useState([])     // [{ product, qty }]
  const [customer,       setCustomer]       = useState(null)
  const [loyalty,        setLoyalty]        = useState(null)
  const [voucherCode,    setVoucherCode]    = useState('')
  const [voucherResult,  setVoucherResult]  = useState(null)   // { valid, discount, message }
  const [usePoints,      setUsePoints]      = useState(0)
  const [payMethod,      setPayMethod]      = useState('CASH')
  const [note,           setNote]           = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [receipt,        setReceipt]        = useState(null)   // kết quả sau khi tạo đơn

  // Tải loyalty khi chọn KH
  const handleSelectCustomer = async c => {
    setCustomer(c)
    setLoyalty(null)
    setUsePoints(0)
    if (c.id) {
      try { setLoyalty(await getLoyalty(c.id)) }
      catch { /* ignore */ }
    }
  }

  const addToCart = p => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.product.id === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { product: p, qty: 1 }]
    })
  }

  const updateQty = (id, delta) => {
    setCart(prev => prev
      .map(i => i.product.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
      .filter(i => i.qty > 0)
    )
  }

  const subtotal = cart.reduce((s, i) => s + i.product.salePrice * i.qty, 0)
  const voucherDiscount = voucherResult?.valid ? voucherResult.discount : 0
  const pointsDiscount  = loyalty && usePoints > 0 ? usePoints * (loyalty.vndPerPoint ?? 1000) : 0
  const totalDiscount   = voucherDiscount + pointsDiscount
  const total           = Math.max(0, subtotal - totalDiscount)

  const handleValidateVoucher = async () => {
    if (!voucherCode.trim()) return
    try {
      const r = await validateVoucher(voucherCode, subtotal, customer?.id)
      setVoucherResult(r)
      if (!r.valid) showToast(r.message, 'error')
      else showToast(r.message, 'success')
    } catch { showToast('Không kiểm tra được voucher', 'error') }
  }

  const handleSubmit = async () => {
    if (cart.length === 0) { showToast('Giỏ hàng trống', 'error'); return }
    setSubmitting(true)
    try {
      const dto = {
        customerId:    customer?.id ?? null,
        customerName:  customer?.name,
        customerPhone: customer?.phone,
        items: cart.map(i => ({ productId: i.product.id, qty: i.qty, price: i.product.salePrice })),
        paymentMethod: payMethod,
        voucherCode:   voucherResult?.valid ? voucherCode : null,
        usePoints:     usePoints,
        note,
      }
      const result = await createOrder(dto)
      setReceipt(result)
      setCart([])
      setCustomer(null)
      setLoyalty(null)
      setVoucherCode('')
      setVoucherResult(null)
      setUsePoints(0)
      setNote('')
    } catch (e) {
      showToast(e.response?.data?.message ?? 'Lỗi tạo đơn hàng', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Màn hình biên lai (receipt) ──────────────────────────────────────────
  if (receipt) {
    return (
      <div className="max-w-md mx-auto mt-10 lcard p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
             style={{ background: 'rgba(16,185,129,0.15)' }}>
          <span className="icon text-4xl" style={{ color: '#10B981' }}>check_circle</span>
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Đơn hàng thành công!
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{receipt.orderCode}</p>
        <div className="text-left space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-tertiary)' }}>Tạm tính</span>
            <span>{formatVND(receipt.subtotal)}</span>
          </div>
          {receipt.discount > 0 && (
            <div className="flex justify-between" style={{ color: '#10B981' }}>
              <span>Giảm giá</span>
              <span>-{formatVND(receipt.discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t"
               style={{ borderColor: 'var(--border)' }}>
            <span>Tổng cộng</span>
            <span style={{ color: 'var(--accent-500)' }}>{formatVND(receipt.total)}</span>
          </div>
        </div>
        {receipt.pointsEarned > 0 && (
          <p className="text-sm py-2 px-3 rounded-lg"
             style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
            ★ KH được tích {receipt.pointsEarned} điểm · Tổng: {receipt.remainingPoints} điểm
          </p>
        )}
        <button
          onClick={() => setReceipt(null)}
          className="lbtn lbtn-primary w-full justify-center"
        >
          Tạo đơn mới
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col md:flex-row gap-4 p-4">
      {/* ── Cột trái: Sản phẩm + Giỏ hàng ─────────────────────────────── */}
      <div className="flex-1 space-y-4 overflow-y-auto">
        <div className="lcard p-4 space-y-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            TÌM SẢN PHẨM
          </p>
          <ProductSearch onAdd={addToCart} />
        </div>

        {/* Giỏ hàng */}
        {cart.length > 0 && (
          <div className="lcard p-4 space-y-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              GIỎ HÀNG ({cart.length} SP)
            </p>
            {cart.map(({ product: p, qty }) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b"
                   style={{ borderColor: 'var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {p.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {formatVND(p.salePrice)} / cái
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQty(p.id, -1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  >-</button>
                  <span className="text-sm font-semibold w-6 text-center"
                        style={{ color: 'var(--text-primary)' }}>{qty}</span>
                  <button
                    onClick={() => updateQty(p.id, 1)}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  >+</button>
                </div>
                <p className="text-sm font-semibold w-20 text-right"
                   style={{ color: 'var(--accent-500)' }}>
                  {formatVND(p.salePrice * qty)}
                </p>
                <button onClick={() => updateQty(p.id, -qty)}
                        className="icon text-lg" style={{ color: 'var(--text-tertiary)' }}>
                  delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cột phải: KH + Voucher + Thanh toán ────────────────────────── */}
      <div className="w-full md:w-96 space-y-4">
        {/* Thông tin KH */}
        <div className="lcard p-4 space-y-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            KHÁCH HÀNG
          </p>
          <CustomerSearch
            selectedCustomer={customer}
            onSelect={handleSelectCustomer}
            onClear={() => { setCustomer(null); setLoyalty(null); setUsePoints(0) }}
          />
          {loyalty && (
            <div className="p-3 rounded-lg text-sm"
                 style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <p style={{ color: '#F59E0B' }}>
                ★ Điểm loyalty: <strong>{loyalty.balance}</strong> điểm
                ({formatVND(loyalty.balance * loyalty.vndPerPoint)})
              </p>
              {loyalty.canRedeem && (
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Dùng điểm:
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={loyalty.balance}
                    step={loyalty.minRedeem}
                    value={usePoints}
                    onChange={e => setUsePoints(Math.min(Number(e.target.value), loyalty.balance))}
                    className="w-24 px-2 py-1 rounded border text-xs"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                  />
                  {usePoints > 0 && (
                    <span className="text-xs" style={{ color: '#10B981' }}>
                      −{formatVND(usePoints * loyalty.vndPerPoint)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Voucher */}
        <div className="lcard p-4 space-y-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>VOUCHER</p>
          <div className="flex gap-2">
            <input
              value={voucherCode}
              onChange={e => { setVoucherCode(e.target.value); setVoucherResult(null) }}
              placeholder="Nhập mã voucher..."
              className="flex-1 px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={handleValidateVoucher}
              disabled={!voucherCode.trim()}
              className="lbtn px-3 py-2 text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              Áp dụng
            </button>
          </div>
          {voucherResult && (
            <p className="text-xs" style={{ color: voucherResult.valid ? '#10B981' : '#EF4444' }}>
              {voucherResult.message}
            </p>
          )}
        </div>

        {/* Tóm tắt */}
        <div className="lcard p-4 space-y-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>TÓM TẮT</p>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-tertiary)' }}>Tạm tính</span>
            <span>{formatVND(subtotal)}</span>
          </div>
          {voucherDiscount > 0 && (
            <div className="flex justify-between text-sm" style={{ color: '#10B981' }}>
              <span>Voucher</span>
              <span>-{formatVND(voucherDiscount)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="flex justify-between text-sm" style={{ color: '#F59E0B' }}>
              <span>Dùng điểm</span>
              <span>-{formatVND(pointsDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2 border-t"
               style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-primary)' }}>Tổng cộng</span>
            <span style={{ color: 'var(--accent-500)' }}>{formatVND(total)}</span>
          </div>
        </div>

        {/* Phương thức thanh toán */}
        <div className="lcard p-4 space-y-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>THANH TOÁN</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'CASH',         label: 'Tiền mặt',       icon: 'payments' },
              { key: 'BANK_TRANSFER',label: 'Chuyển khoản',   icon: 'account_balance' },
              { key: 'MOMO',         label: 'Momo',           icon: 'smartphone' },
              { key: 'VNPAY',        label: 'VNPay',          icon: 'credit_card' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setPayMethod(m.key)}
                className="flex items-center gap-2 p-2 rounded-lg border text-sm font-medium transition-all"
                style={{
                  borderColor: payMethod === m.key ? 'var(--accent-500)' : 'var(--border)',
                  background:  payMethod === m.key ? 'rgba(99,102,241,0.1)' : 'var(--bg-elevated)',
                  color:       payMethod === m.key ? 'var(--accent-500)' : 'var(--text-secondary)',
                }}
              >
                <span className="icon text-base">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ghi chú đơn hàng..."
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0}
            className="lbtn lbtn-primary w-full justify-center disabled:opacity-50"
            style={{ height: 48 }}
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
                Đang xử lý...
              </>
            ) : (
              <>
                <span className="icon text-xl">point_of_sale</span>
                Hoàn tất đơn hàng — {formatVND(total)}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
