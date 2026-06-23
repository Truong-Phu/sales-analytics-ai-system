import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { showToast } from '../../utils/toast'

// ── API helpers ───────────────────────────────────────────────────────────────
const searchProducts   = q   => api.get(`/api/pos/products/search?q=${encodeURIComponent(q)}`).then(r => r.data.products ?? r.data ?? [])
const searchCustomers  = q   => api.get(`/api/pos/customers/search?q=${encodeURIComponent(q)}`).then(r => r.data.customers ?? [])
const getLoyalty       = id  => api.get(`/api/pos/customers/${id}/loyalty`).then(r => r.data)
const validateVoucher  = (code, orderValue, customerId) =>
  api.post('/api/pos/vouchers/validate', { code, orderValue, customerId }).then(r => r.data)
const createOrder = dto => api.post('/api/pos/orders', dto).then(r => r.data)

const fmtVND = n => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ'

// ── Modal chọn biến thể ───────────────────────────────────────────────────────
function VariationModal({ product, variations, onSelect, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="lcard w-full max-w-sm p-5 space-y-4"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('pos.selectVariation')}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{product.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon text-base">close</span>
          </button>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {variations.map(v => {
            const oos = (v.stockQuantity ?? 0) <= 0
            return (
              <button
                key={v.variationId}
                onClick={() => !oos && onSelect(v)}
                disabled={oos}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--bg-elevated)',
                  opacity: oos ? 0.5 : 1,
                  cursor: oos ? 'default' : 'pointer',
                }}
                onMouseEnter={e => !oos && (e.currentTarget.style.borderColor = 'var(--primary-500)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div className="text-left">
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {v.variationName}
                    {v.color ? ` · ${v.color}` : ''}
                    {v.size  ? ` · ${v.size}`  : ''}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: oos ? '#EF4444' : 'var(--text-tertiary)' }}>
                    {oos ? 'Hết hàng' : `Còn ${v.stockQuantity}`}
                    {v.sku ? ` · SKU: ${v.sku}` : ''}
                  </div>
                </div>
                <div className="font-bold shrink-0 ml-3" style={{ color: 'var(--primary-500)' }}>
                  {fmtVND(v.salePrice ?? 0)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Tìm kiếm sản phẩm với dropdown ──────────────────────────────────────────
function ProductSearch({ onAdd }) {
  const [q,          setQ]          = useState('')
  const [results,    setResults]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [open,       setOpen]       = useState(false)
  const [varModal,   setVarModal]   = useState(null) // { product, variations }
  const timer  = useRef(null)
  const wrapRef = useRef(null)

  const doSearch = useCallback(async (val) => {
    if (!val.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await searchProducts(val)
      setResults(res.slice(0, 8))
      setOpen(true)
    } catch {
      // fallback: tìm qua /api/products
      try {
        const fb = await api.get(`/api/products?search=${encodeURIComponent(val)}&pageSize=8`)
        const items = (fb.data?.items ?? fb.data ?? []).map(x => ({
          ...x, salePrice: x.salePrice ?? x.price ?? 0, stockQty: x.stockQty ?? x.stock ?? 0,
        }))
        setResults(items)
        setOpen(items.length > 0)
      } catch { setResults([]) }
    } finally { setLoading(false) }
  }, [])

  const handleChange = e => {
    const val = e.target.value
    setQ(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => doSearch(val), 280)
  }

  const pick = async (p) => {
    setOpen(false)
    try {
      const vars = await api.get(`/api/products/${p.id}/variations`).then(r => r.data ?? [])
      if (vars.length > 0) {
        setVarModal({ product: p, variations: vars })
        return
      }
    } catch { /* không có variations → thêm thẳng */ }
    onAdd(p)
    setQ('')
    setResults([])
  }

  const handleVariationSelect = (variation) => {
    const p = varModal.product
    onAdd({
      ...p,
      price:         variation.salePrice ?? p.salePrice ?? p.price ?? 0,
      variationId:   variation.variationId,
      variationName: variation.variationName,
      color:         variation.color,
      size:          variation.size,
      // key duy nhất = productId + variationId để phân biệt các biến thể khác nhau trong giỏ
      _cartKey: `${p.id}-${variation.variationId}`,
    })
    setVarModal(null)
    setQ('')
    setResults([])
  }

  // Đóng dropdown khi click ngoài
  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
    {varModal && (
      <VariationModal
        product={varModal.product}
        variations={varModal.variations}
        onSelect={handleVariationSelect}
        onClose={() => setVarModal(null)}
      />
    )}
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
           style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
        <span className="icon text-lg shrink-0" style={{ color: 'var(--text-tertiary)' }}>search</span>
        <input
          value={q}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Tìm theo tên, SKU hoặc mã vạch..."
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        {loading && (
          <span className="w-4 h-4 border-2 rounded-full shrink-0 animate-spin"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        )}
        {q && !loading && (
          <button onClick={() => { setQ(''); setResults([]); setOpen(false) }}
                  className="shrink-0 text-sm" style={{ color: 'var(--text-tertiary)' }}>×</button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-30 w-full mt-1 rounded-xl shadow-lg overflow-hidden"
             style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: 320, overflowY: 'auto' }}>
          {results.map(p => {
            const oos = (p.stockQty ?? 0) <= 0
            return (
              <button
                key={p.id}
                onClick={() => !oos && pick(p)}
                disabled={oos}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ opacity: oos ? 0.5 : 1 }}
                onMouseEnter={e => !oos && (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {p.imageUrl
                  ? <img src={p.imageUrl} className="w-9 h-9 rounded object-cover shrink-0" alt="" />
                  : <div className="w-9 h-9 rounded shrink-0 flex items-center justify-center"
                         style={{ background: 'var(--bg-elevated)' }}>
                      <span className="icon text-base" style={{ color: 'var(--text-tertiary)' }}>inventory_2</span>
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {p.sku && <span className="mr-2">{p.sku}</span>}
                    <span style={{ color: oos ? '#EF4444' : 'var(--text-tertiary)' }}>
                      {oos ? 'Hết hàng' : `Còn ${p.stockQty}`}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-sm font-bold" style={{ color: 'var(--primary-500)' }}>
                  {fmtVND(p.salePrice ?? p.price ?? 0)}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
    </>
  )
}

// ── Giỏ hàng ─────────────────────────────────────────────────────────────────
function CartItem({ item, onQty, onRemove }) {
  const variationLabel = [item.color, item.size].filter(Boolean).join(' · ') || item.variationName
  return (
    <div className="flex items-center gap-3 py-2.5"
         style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {variationLabel && (
            <span className="mr-1.5 px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              {variationLabel}
            </span>
          )}
          {fmtVND(item.price)} × {item.qty}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onQty(item._cartKey, item.qty - 1)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>−</button>
        <span className="w-7 text-center text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.qty}</span>
        <button onClick={() => onQty(item._cartKey, item.qty + 1)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>+</button>
      </div>
      <div className="w-20 text-right text-sm font-bold shrink-0" style={{ color: 'var(--text-primary)' }}>
        {fmtVND(item.price * item.qty)}
      </div>
      <button onClick={() => onRemove(item._cartKey)}
              className="w-6 h-6 flex items-center justify-center rounded shrink-0"
              style={{ color: '#EF4444' }}>
        <span className="icon" style={{ fontSize: 16 }}>close</span>
      </button>
    </div>
  )
}

const ALL_PAY_META = {
  CASH:   { icon: 'payments',     label: 'Tiền mặt' },
  VIETQR: { icon: 'qr_code_2',   label: 'VietQR'   },
  MOMO:   { icon: 'phone_iphone', label: 'MoMo'     },
  VNPAY:  { icon: 'credit_card',  label: 'VNPay'    },
}

// ── Main POS ─────────────────────────────────────────────────────────────────
export default function PosPage() {
  const { t } = useTranslation()
  const [cart,        setCart]        = useState([])
  const [customer,    setCustomer]    = useState(null)
  const [cusSearch,   setCusSearch]   = useState('')
  const [cusResults,  setCusResults]  = useState([])
  const [loyalty,     setLoyalty]     = useState(null)
  const [usePoints,   setUsePoints]   = useState(0)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherInfo, setVoucherInfo] = useState(null)
  const [voucherErr,  setVoucherErr]  = useState('')
  const [payMethod,   setPayMethod]   = useState('CASH')
  const [payMethods,  setPayMethods]  = useState([])
  const [note,        setNote]        = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [lastOrder,   setLastOrder]   = useState(null)
  const cusTimer = useRef(null)
  const lastAutoAppliedCodeRef = useRef('')
  const lastValidatedSubtotalRef = useRef(0)

  // Tự động áp dụng voucher nếu giỏ hàng khớp với một chiến dịch mua kèm (bundle) đã thực thi
  useEffect(() => {
    try {
      const campaigns = JSON.parse(localStorage.getItem('executed_campaigns') ?? '[]')
      const bundleCampaigns = campaigns.filter(c => c.action === 'bundle' || (c.target && c.target.includes(' + ')))

      let matchedAutoCode = null

      if (cart.length >= 2) {
        for (const campaign of bundleCampaigns) {
          if (!campaign.target || !campaign.discount) continue
          
          const targetProducts = campaign.target.split(' + ').map(p => p.trim())
          if (targetProducts.length === 0) continue

          const allPresent = targetProducts.every(tp => 
            cart.some(item => item.name?.toLowerCase().includes(tp.toLowerCase()) || tp.toLowerCase().includes(item.name?.toLowerCase()))
          )

          if (allPresent) {
            const match = campaign.discount.match(/\[(.*?)\]/)
            if (match && match[1]) {
              matchedAutoCode = match[1].trim()
              break
            }
          }
        }
      }

      if (matchedAutoCode) {
        const currentSubtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
        if (lastAutoAppliedCodeRef.current !== matchedAutoCode || lastValidatedSubtotalRef.current !== currentSubtotal) {
          const isCodeChange = lastAutoAppliedCodeRef.current !== matchedAutoCode
          lastAutoAppliedCodeRef.current = matchedAutoCode
          lastValidatedSubtotalRef.current = currentSubtotal
          setVoucherCode(matchedAutoCode)
          validateVoucher(matchedAutoCode, currentSubtotal, customer?.id)
            .then(res => {
              if (res.valid) {
                setVoucherInfo(res)
                setVoucherErr('')
                if (isCodeChange) {
                  showToast(`Tự động áp dụng voucher combo: ${matchedAutoCode}`, 'success')
                }
              } else {
                setVoucherErr(res.message ?? 'Voucher combo tự động không hợp lệ')
              }
            })
            .catch(err => {
              setVoucherErr(err?.response?.data?.message ?? 'Lỗi áp dụng voucher tự động')
            })
        }
      } else {
        // Không còn khớp combo nào, nếu trước đó có tự động áp dụng thì hủy bỏ
        if (lastAutoAppliedCodeRef.current) {
          lastAutoAppliedCodeRef.current = ''
          lastValidatedSubtotalRef.current = 0
          setVoucherCode('')
          setVoucherInfo(null)
          setVoucherErr('')
        }
      }
    } catch (e) {
      console.error('Error auto applying bundle voucher:', e)
    }
  }, [cart, customer?.id])

  useEffect(() => {
    api.get('/api/payment/methods')
      .then(r => {
        const list = r.data?.data ?? ['CASH', 'VIETQR']
        setPayMethods(list)
        if (!list.includes(payMethod)) setPayMethod(list[0] ?? 'CASH')
      })
      .catch(() => setPayMethods(['CASH', 'VIETQR']))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Giỏ hàng ──────────────────────────────────────────────────────────────
  const addToCart = (product) => {
    const cartKey = product._cartKey ?? String(product.id)
    setCart(prev => {
      const existing = prev.find(i => i._cartKey === cartKey)
      if (existing) return prev.map(i => i._cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, {
        id:            product.id,
        _cartKey:      cartKey,
        name:          product.name,
        price:         product.salePrice ?? product.price ?? 0,
        qty:           1,
        imageUrl:      product.imageUrl,
        variationId:   product.variationId   ?? null,
        variationName: product.variationName ?? null,
        color:         product.color         ?? null,
        size:          product.size          ?? null,
      }]
    })
  }

  const setQty = (cartKey, qty) => {
    if (qty <= 0) setCart(prev => prev.filter(i => i._cartKey !== cartKey))
    else setCart(prev => prev.map(i => i._cartKey === cartKey ? { ...i, qty } : i))
  }

  const removeFromCart = cartKey => setCart(prev => prev.filter(i => i._cartKey !== cartKey))

  const clearCart = () => {
    setCart([]); setCustomer(null); setCusSearch(''); setLoyalty(null)
    setUsePoints(0); setVoucherCode(''); setVoucherInfo(null); setVoucherErr('')
    setNote(''); setPayMethod('CASH')
  }

  // ── Khách hàng ────────────────────────────────────────────────────────────
  const handleCusSearch = e => {
    const v = e.target.value
    setCusSearch(v)
    clearTimeout(cusTimer.current)
    if (!v.trim()) { setCusResults([]); return }
    cusTimer.current = setTimeout(async () => {
      try { setCusResults(await searchCustomers(v)) } catch { setCusResults([]) }
    }, 300)
  }

  const pickCustomer = async (c) => {
    setCustomer(c)
    setCusSearch(c.name ?? c.phone ?? '')
    setCusResults([])
    try { setLoyalty(await getLoyalty(c.id)) } catch { setLoyalty(null) }
  }

  // ── Voucher ───────────────────────────────────────────────────────────────
  const applyVoucher = async () => {
    if (!voucherCode.trim()) return
    setVoucherErr(''); setVoucherInfo(null)
    try {
      const res = await validateVoucher(voucherCode.trim(), subtotal, customer?.id)
      if (!res.valid) { setVoucherErr(res.message ?? 'Voucher không hợp lệ'); return }
      setVoucherInfo(res)
    } catch (e) {
      setVoucherErr(e?.response?.data?.message ?? 'Voucher không hợp lệ')
    }
  }

  // ── Tính toán ─────────────────────────────────────────────────────────────
  const subtotal      = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const pointsDiscount = usePoints * (loyalty?.vndPerPoint ?? 0)
  // Backend trả về field "discount" (không phải discountAmount)
  const voucherDiscount = Number(voucherInfo?.discount) || 0
  const total         = Math.max(0, subtotal - pointsDiscount - voucherDiscount)

  // ── Đặt hàng ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cart.length === 0) { showToast('Giỏ hàng trống', 'error'); return }
    setSubmitting(true)
    try {
      const dto = {
        customerId:    customer?.id ?? null,
        customerName:  customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        items: cart.map(i => ({ productId: i.id, variationId: i.variationId ?? null, qty: i.qty, price: i.price })),
        paymentMethod: payMethod,
        voucherCode:   voucherInfo ? voucherCode.trim() : null,
        usePoints:     customer ? usePoints : 0,
        note,
      }
      const res = await createOrder(dto)
      setLastOrder(res)
      showToast('Tạo đơn hàng thành công!', 'success')
      clearCart()
    } catch (e) {
      showToast(e?.response?.data?.message ?? 'Lỗi tạo đơn hàng', 'error')
    } finally { setSubmitting(false) }
  }

  const PAYMENT_METHODS = payMethods.map(id => ({ id, ...(ALL_PAY_META[id] ?? { icon: 'payments', label: id }) }))

  return (
    <div className="flex gap-4" style={{ height: 'calc(100vh - 80px)' }}>

      {/* ── Cột trái: Tìm sản phẩm + Giỏ hàng ────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">

        {/* Search sản phẩm */}
        <div className="lcard p-4">
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
            THÊM SẢN PHẨM
          </div>
          <ProductSearch onAdd={addToCart} />
        </div>

        {/* Giỏ hàng */}
        <div className="lcard flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>shopping_cart</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Giỏ hàng
              </span>
              {cart.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: 'var(--primary-500)', color: '#fff' }}>
                  {cart.reduce((s, i) => s + i.qty, 0)}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-xs" style={{ color: '#EF4444' }}>Xóa tất cả</button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 pb-4">
              <span className="icon text-5xl" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>shopping_cart</span>
              <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                Tìm và thêm sản phẩm vào giỏ hàng
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {cart.map(item => (
                <CartItem key={item._cartKey} item={item} onQty={setQty} onRemove={removeFromCart} />
              ))}
            </div>
          )}
        </div>

        {/* Thông báo đơn cuối */}
        {lastOrder && (
          <div className="rounded-xl p-3 text-sm"
               style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#059669' }}>
            ✓ Đơn <strong>#{lastOrder.orderCode ?? lastOrder.id}</strong> đã tạo thành công —{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>{fmtVND(lastOrder.totalAmount ?? 0)}</span>
          </div>
        )}
      </div>

      {/* ── Cột phải: Khách hàng + Thanh toán ────────────────────────────── */}
      <div className="w-80 xl:w-96 shrink-0 flex flex-col gap-3 overflow-y-auto">

        {/* Khách hàng */}
        <div className="lcard p-4 space-y-3">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>KHÁCH HÀNG</div>
          <div className="relative">
            <input
              value={cusSearch}
              onChange={handleCusSearch}
              placeholder="Tên hoặc số điện thoại..."
              className="linput text-sm w-full"
            />
            {cusResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 rounded-xl shadow-lg overflow-hidden"
                   style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: 200, overflowY: 'auto' }}>
                <button
                  onClick={() => { setCustomer(null); setCusSearch(''); setCusResults([]); setLoyalty(null) }}
                  className="w-full text-left px-4 py-2.5 text-sm"
                  style={{ color: 'var(--text-tertiary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  Khách vãng lai
                </button>
                {cusResults.map(c => (
                  <button key={c.id} onClick={() => pickCustomer(c)}
                          className="w-full text-left px-4 py-2.5"
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.phone}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {customer && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>person</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{customer.name}</div>
                {customer.phone && <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{customer.phone}</div>}
                {loyalty && (
                  <div className="text-xs mt-0.5" style={{ color: '#F59E0B' }}>
                    ⭐ {loyalty.currentPoints?.toLocaleString() ?? 0} điểm
                  </div>
                )}
              </div>
              <button onClick={() => { setCustomer(null); setCusSearch(''); setLoyalty(null); setUsePoints(0) }}
                      className="text-lg leading-none shrink-0" style={{ color: 'var(--text-tertiary)' }}>×</button>
            </div>
          )}
          {/* Dùng điểm */}
          {loyalty && loyalty.currentPoints > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                Đổi điểm (tối đa {loyalty.currentPoints})
              </span>
              <input type="number" min={0} max={loyalty.currentPoints}
                     value={usePoints}
                     onChange={e => setUsePoints(Math.min(loyalty.currentPoints, Math.max(0, Number(e.target.value))))}
                     className="linput !h-8 w-28 text-sm text-right" />
            </div>
          )}
        </div>

        {/* Voucher */}
        <div className="lcard p-4 space-y-2">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>VOUCHER</div>
          <div className="flex gap-2">
            <input
              value={voucherCode}
              onChange={e => { setVoucherCode(e.target.value.toUpperCase()); setVoucherInfo(null); setVoucherErr('') }}
              placeholder="Nhập mã voucher..."
              className="linput text-sm flex-1"
            />
            <button onClick={applyVoucher} className="lbtn lbtn-secondary !h-9 !px-3 text-xs shrink-0">Áp dụng</button>
          </div>
          {voucherErr  && <p className="text-xs" style={{ color: '#EF4444' }}>{voucherErr}</p>}
          {voucherInfo && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#059669' }}>
              <span className="icon text-base">check_circle</span>
              {voucherInfo.message ?? `Giảm ${fmtVND(voucherDiscount)}`}
            </div>
          )}
        </div>

        {/* Tổng kết */}
        <div className="lcard p-4 space-y-2.5">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>TỔNG KẾT</div>
          {[
            { label: 'Tạm tính',       value: subtotal,        color: 'var(--text-primary)' },
            ...(pointsDiscount > 0 ? [{ label: `Trừ điểm (${usePoints} điểm)`, value: -pointsDiscount, color: '#059669' }] : []),
            ...(voucherDiscount > 0 ? [{ label: 'Giảm voucher',                value: -voucherDiscount, color: '#059669' }] : []),
          ].map(r => (
            <div key={r.label} className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
              <span style={{ color: r.color }}>{r.value < 0 ? '-' : ''}{fmtVND(Math.abs(r.value))}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2"
               style={{ borderTop: '2px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tổng cộng</span>
            <span className="text-xl font-bold" style={{ color: 'var(--primary-500)' }}>{fmtVND(total)}</span>
          </div>
        </div>

        {/* Phương thức thanh toán */}
        <div className="lcard p-4 space-y-3">
          <div className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>THANH TOÁN</div>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map(m => (
              <button key={m.id} onClick={() => setPayMethod(m.id)}
                      className="flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-all"
                      style={{
                        background:   payMethod === m.id ? 'rgba(99,102,241,0.1)' : 'var(--bg-elevated)',
                        borderColor:  payMethod === m.id ? 'var(--primary-500)'   : 'var(--border)',
                        color:        payMethod === m.id ? 'var(--primary-500)'   : 'var(--text-secondary)',
                      }}>
                <span className="icon text-xl">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ghi chú đơn hàng..."
            rows={2}
            className="linput text-sm w-full resize-none"
            style={{ height: 'auto' }}
          />

          <button
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0}
            className="lbtn lbtn-primary w-full !h-12 text-base font-bold gap-2"
            style={{ opacity: cart.length === 0 ? 0.5 : 1 }}
          >
            <span className="icon">receipt_long</span>
            {submitting ? 'Đang xử lý...' : `Tạo đơn — ${fmtVND(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
