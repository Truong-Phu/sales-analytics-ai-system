import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
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



// ── Tìm kiếm sản phẩm với dropdown ──────────────────────────────────────────
function ProductSearch({ onAdd }) {
  const [q,       setQ]       = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)
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
      const vars = await api.get(`/api/products/${p.id}/variations`).then(r => r.data?.data ?? [])
      if (vars.length > 0) {
        // Tìm biến thể còn hàng đầu tiên, nếu không có thì lấy biến thể đầu tiên
        const defaultVar = vars.find(v => (v.stockQuantity ?? 0) > 0) ?? vars[0]
        onAdd({
          ...p,
          salePrice:     defaultVar.salePrice ?? p.salePrice ?? p.price ?? 0,
          variationId:   defaultVar.variationId,
          variationName: defaultVar.variationName,
          color:         defaultVar.color,
          size:          defaultVar.size,
          variations:    vars,
          _cartKey:      `${p.id}-${defaultVar.variationId}`,
        })
        setQ('')
        setResults([])
        return
      }
    } catch { /* không có variations -> thêm thẳng */ }
    onAdd(p)
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
  )
}

// ── Giỏ hàng ─────────────────────────────────────────────────────────────────
function CartItem({ item, onQty, onRemove, onVariationChange }) {
  const hasVariations = item.variations && item.variations.length > 0
  return (
    <div className="flex items-center gap-3 py-2.5"
         style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
        <div className="text-xs mt-1.5 flex items-center gap-2 flex-wrap">
          {hasVariations ? (
            <select
              value={item.variationId || ''}
              onChange={(e) => onVariationChange(item._cartKey, Number(e.target.value))}
              className="px-2 py-0.5 rounded border text-xs"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border)', outline: 'none' }}
            >
              {item.variations.map(v => (
                <option key={v.variationId} value={v.variationId} disabled={v.stockQuantity <= 0}>
                  {[v.color, v.size].filter(Boolean).join(' · ') || v.variationName} {v.stockQuantity <= 0 ? '(Hết hàng)' : `(Còn ${v.stockQuantity})`}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>Không có biến thể</span>
          )}
          <span style={{ color: 'var(--text-tertiary)' }}>
            {fmtVND(item.price)} × {item.qty}
          </span>
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
  const [newCusName,     setNewCusName]     = useState('')
  const [newCusPhone,    setNewCusPhone]    = useState('')
  const [newCusProvince, setNewCusProvince] = useState('')
  const [newCusDistrict, setNewCusDistrict] = useState('')
  const [showNewCus,     setShowNewCus]     = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherInfo, setVoucherInfo] = useState(null)
  const [voucherErr,  setVoucherErr]  = useState('')
  const [payMethod,   setPayMethod]   = useState('CASH')
  const [payMethods,  setPayMethods]  = useState([])
  const [note,        setNote]        = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [lastOrder,   setLastOrder]   = useState(null)
  const [bankModal,   setBankModal]   = useState(null) // { bankName, accountNumber, accountName, qrImage, total }
  const navigate     = useNavigate()
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
        variations:    product.variations    ?? null,
      }]
    })
  }

  const handleVariationChange = (cartKey, newVarId) => {
    setCart(prev => {
      const updated = prev.map(item => {
        if (item._cartKey !== cartKey) return item
        const newVar = item.variations?.find(v => v.variationId === newVarId)
        if (!newVar) return item
        const newCartKey = `${item.id}-${newVarId}`

        const duplicate = prev.find(i => i._cartKey === newCartKey)
        if (duplicate && duplicate._cartKey !== cartKey) {
          return { ...item, _mergeWith: newCartKey }
        }

        return {
          ...item,
          _cartKey:      newCartKey,
          price:         newVar.salePrice ?? item.price,
          variationId:   newVarId,
          variationName: newVar.variationName,
          color:         newVar.color,
          size:          newVar.size,
        }
      })

      return updated.map((item, _, arr) => {
        if (item._mergeWith) {
          const target = arr.find(i => i._cartKey === item._mergeWith)
          if (target) {
            target.qty += item.qty
          }
          return null
        }
        return item
      })
      .filter(Boolean)
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
    setNewCusName(''); setNewCusPhone(''); setNewCusProvince(''); setNewCusDistrict(''); setShowNewCus(false)
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
  const executeSubmitOrder = async () => {
    setSubmitting(true)
    setBankModal(null)
    try {
      const dto = {
        customerId:        customer?.id ?? null,
        customerName:      customer ? (customer.name ?? null)     : (newCusName.trim()     || null),
        customerPhone:     customer ? (customer.phone ?? null)    : (newCusPhone.trim()    || null),
        customerProvince:  customer ? (customer.province ?? null) : (newCusProvince.trim() || null),
        customerDistrict:  customer ? (customer.district ?? null) : (newCusDistrict.trim() || null),
        items: cart.map(i => ({ productId: i.id, variationId: i.variationId ?? null, qty: i.qty, price: i.price })),
        paymentMethod: payMethod,
        voucherCode:   voucherInfo ? voucherCode.trim() : null,
        usePoints:     customer ? usePoints : 0,
        note,
      }
      const res = await createOrder(dto)
      setLastOrder(res)

      // Nếu là VietQR → khởi tạo payment transaction rồi điều hướng sang trang QR
      if (res.requiresQR) {
        try {
          const payRes = await api.post(`/api/payment/order/${res.orderId}/initiate`, {
            method: 'VIETQR',
          })
          const txId = payRes.data?.data?.transactionId
          clearCart()
          if (txId) {
            navigate(`/payment/vietqr?txId=${txId}`)
          } else {
            showToast('Đơn tạo thành công! Vui lòng vào trang VietQR để thanh toán.', 'success')
          }
        } catch {
          clearCart()
          showToast('Đơn tạo thành công! Không thể tạo mã QR, vui lòng thanh toán thủ công.', 'warning')
        }
      } else {
        showToast('Tạo đơn hàng thành công!', 'success')
        clearCart()
      }
    } catch (e) {
      showToast(e?.response?.data?.message ?? 'Lỗi tạo đơn hàng', 'error')
    } finally { setSubmitting(false) }
  }

  const handleSubmit = async () => {
    if (cart.length === 0) { showToast('Giỏ hàng trống', 'error'); return }

    if (payMethod === 'BANK_TRANSFER') {
      setSubmitting(true)
      try {
        const res = await api.get('/api/payment/bank-info')
        const bankData = res.data?.data ?? {}
        setBankModal({
          bankName:      bankData.bank_name ?? '—',
          accountNumber: bankData.account_number ?? '—',
          accountName:   bankData.account_name ?? '—',
          qrImage:       bankData.qr_image ?? null,
          total:         total,
        })
        return
      } catch (e) {
        showToast('Không thể lấy thông tin tài khoản chuyển khoản.', 'error')
        setSubmitting(false)
        return
      }
    }

    await executeSubmitOrder()
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
                <CartItem
                  key={item._cartKey}
                  item={item}
                  onQty={setQty}
                  onRemove={removeFromCart}
                  onVariationChange={handleVariationChange}
                />
              ))}
            </div>
          )}
        </div>

        {/* Thông báo đơn cuối (Success Modal) */}
        {lastOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
               style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div className="lcard w-full max-w-md p-6 text-center space-y-4"
                 onClick={e => e.stopPropagation()}>
              <div className="py-4">
                <span className="icon text-6xl block mb-3 animate-bounce" style={{ color: '#10B981' }}>check_circle</span>
                <h3 className="font-extrabold text-lg" style={{ color: '#10B981' }}>
                  Thanh toán thành công!
                </h3>
                <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                  Đơn hàng <strong style={{ color: 'var(--text-primary)' }}>#{lastOrder.orderCode ?? lastOrder.id}</strong> đã được ghi nhận thanh toán và hoàn tất giao hàng.
                </p>
                <p className="text-lg font-bold mt-2" style={{ color: 'var(--primary-500)' }}>
                  {fmtVND(lastOrder.totalAmount ?? lastOrder.total ?? 0)}
                </p>
              </div>

              <div className="flex gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => { setLastOrder(null); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                  style={{ background: 'var(--primary-500)' }}
                >
                  Tiếp tục bán hàng
                </button>
                <button
                  onClick={() => { setLastOrder(null); navigate('/orders'); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
                >
                  Xem danh sách đơn
                </button>
              </div>
            </div>
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
                  onClick={() => { setShowNewCus(true); setNewCusName(cusSearch.trim()); setCusResults([]); }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium"
                  style={{ color: 'var(--primary-500)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  + Thêm khách hàng mới
                </button>
                {cusResults.map(c => (
                  <button key={c.id} onClick={() => { pickCustomer(c); setShowNewCus(false); setNewCusName(''); setNewCusPhone('') }}
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
          {/* Form nhập nhanh khách mới */}
          {showNewCus && !customer && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--primary-500)' }}>Khách hàng mới</span>
                <button onClick={() => { setShowNewCus(false); setNewCusName(''); setNewCusPhone(''); setNewCusProvince(''); setNewCusDistrict(''); setCusSearch('') }}
                  className="text-sm leading-none" style={{ color: 'var(--text-tertiary)' }}>×</button>
              </div>
              <input
                value={newCusName}
                onChange={e => setNewCusName(e.target.value)}
                placeholder="Họ tên khách..."
                className="linput text-sm w-full !h-8"
              />
              <input
                value={newCusPhone}
                onChange={e => setNewCusPhone(e.target.value)}
                placeholder="Số điện thoại *"
                className="linput text-sm w-full !h-8"
                type="tel"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newCusProvince}
                  onChange={e => setNewCusProvince(e.target.value)}
                  placeholder="Tỉnh/Thành phố"
                  className="linput text-sm !h-8"
                />
                <input
                  value={newCusDistrict}
                  onChange={e => setNewCusDistrict(e.target.value)}
                  placeholder="Quận/Huyện"
                  className="linput text-sm !h-8"
                />
              </div>
            </div>
          )}
          {customer && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>person</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{customer.name}</div>
                {customer.phone && <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{customer.phone}</div>}
                {loyalty && (
                  <div className="text-xs mt-0.5" style={{ color: '#F59E0B' }}>
                    ⭐ {loyalty.balance?.toLocaleString() ?? 0} điểm
                  </div>
                )}
              </div>
              <button onClick={() => { setCustomer(null); setCusSearch(''); setLoyalty(null); setUsePoints(0) }}
                      className="text-lg leading-none shrink-0" style={{ color: 'var(--text-tertiary)' }}>×</button>
            </div>
          )}
          {/* Dùng điểm */}
          {loyalty && loyalty.balance > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                Đổi điểm (tối đa {loyalty.balance})
              </span>
              <input type="number" min={0} max={loyalty.balance}
                     value={usePoints}
                     onChange={e => setUsePoints(Math.min(loyalty.balance, Math.max(0, Number(e.target.value))))}
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

      {/* ── Modal xác nhận chuyển khoản ngân hàng ─────────────────────────── */}
      {bankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div className="lcard w-full max-w-md p-6 space-y-4"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                Thông tin chuyển khoản ngân hàng
              </h3>
              <button onClick={() => { setBankModal(null); setSubmitting(false); }} className="w-7 h-7 flex items-center justify-center rounded-lg"
                      style={{ color: 'var(--text-tertiary)' }}>
                <span className="icon text-base">close</span>
              </button>
            </div>

            <div className="space-y-3 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-tertiary)' }}>Ngân hàng:</span>
                <span className="font-medium">{bankModal.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-tertiary)' }}>Số tài khoản:</span>
                <span className="font-bold text-base" style={{ color: 'var(--primary-500)' }}>{bankModal.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-tertiary)' }}>Tên chủ tài khoản:</span>
                <span className="font-medium uppercase">{bankModal.accountName}</span>
              </div>
              <div className="flex justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <span className="font-semibold">Số tiền cần chuyển:</span>
                <span className="font-extrabold text-lg" style={{ color: 'var(--primary-500)' }}>{fmtVND(bankModal.total)}</span>
              </div>

              {bankModal.qrImage && (
                <div className="flex flex-col items-center justify-center pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Quét mã QR dưới đây để chuyển khoản nhanh</p>
                  <img
                    src={bankModal.qrImage.startsWith('data:') ? bankModal.qrImage : `data:image/png;base64,${bankModal.qrImage}`}
                    alt="Static Bank QR"
                    className="w-48 h-48 object-contain border rounded-xl p-2 bg-white"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => { setBankModal(null); setSubmitting(false); }}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
              >
                Hủy
              </button>
              <button
                onClick={executeSubmitOrder}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: 'var(--primary-500)' }}
              >
                Xác nhận đã nhận đủ tiền
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
