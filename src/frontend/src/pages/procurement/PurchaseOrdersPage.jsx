import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import MockToast from '../../components/ui/MockToast'
import DetailDrawer from '../../components/ui/DetailDrawer'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { fmtMoneyExact } from '../../utils/format'

const PLATFORMS = [
  { name: 'Shopee', rate: 0.040 },
  { name: 'TikTok Shop', rate: 0.025 },
  { name: 'Lazada', rate: 0.040 },
]

const parsePrefillItems = (raw) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(it => ({
        productId:   it.productId ? String(it.productId) : '',
        variationId: it.variationId ? String(it.variationId) : '',
        quantity:    Number(it.quantity ?? it.reorderQty),
        importPrice: Number(it.importPrice ?? 0) || 0,
      }))
      .filter(it => it.productId && it.quantity > 0)
  } catch {
    return []
  }
}
const calcMin = (ip, rate) => ip > 0 ? Math.ceil(ip / (1 - rate) / 1000) * 1000 : 0

const STATUS_CFG = {
  DRAFT:               { label: 'Nháp',          bg: 'rgba(100,116,139,0.1)', text: '#64748B' },
  PENDING:             { label: 'Chờ duyệt',     bg: 'rgba(245,158,11,0.1)',  text: '#F59E0B' },
  APPROVED:            { label: 'Đã duyệt',      bg: 'rgba(59,130,246,0.1)',  text: '#3B82F6' },
  PARTIALLY_RECEIVED:  { label: 'Nhận một phần', bg: 'rgba(99,102,241,0.1)',  text: '#6366F1' },
  RECEIVED:            { label: 'Đã nhận đủ',    bg: 'rgba(34,197,94,0.1)',   text: '#22C55E' },
  CANCELLED:           { label: 'Đã hủy',        bg: 'rgba(239,68,68,0.1)',   text: '#EF4444' },
}

const STATUS_MAP = {
  DRAFT: 'statusDraft',
  PENDING: 'statusPending',
  APPROVED: 'statusApproved',
  PARTIALLY_RECEIVED: 'statusPartial',
  RECEIVED: 'statusReceived',
  CANCELLED: 'statusCancelled',
}
 
function StatusBadge({ status }) {
  const { t } = useTranslation()
  const c = STATUS_CFG[status] ?? { label: status, bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
  const key = STATUS_MAP[status] ?? 'statusDraft'
  const label = t('purchaseOrders.' + key, c.label)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
          style={{ background: c.bg, color: c.text }}>{label}</span>
  )
}

// ── Drawer tạo phiếu nhập hàng ────────────────────────────────────────────────
// Flow mới: chọn sản phẩm trước → NCC tự lọc theo sản phẩm đã chọn
function ProductSearch({ allProducts, value, onSelect, style = {} }) {
  const [q, setQ]       = useState('')
  const [open, setOpen] = useState(false)
  const ref             = React.useRef(null)

  // Đồng bộ tên sản phẩm đã chọn vào input
  const selectedName = value
    ? (allProducts.find(p => String(p.productId) === String(value))?.productName ?? '')
    : ''

  const filtered = (() => {
    const term = q.trim().toLowerCase()
    const list = term
      ? allProducts.filter(p =>
          (p.productName ?? '').toLowerCase().includes(term) ||
          (p.sku ?? '').toLowerCase().includes(term)
        )
      : allProducts
    return list.slice(0, 20)
  })()

  // Click ngoài → đóng
  React.useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        placeholder="Tìm sản phẩm theo tên hoặc SKU..."
        value={open ? q : selectedName}
        onFocus={() => { setQ(''); setOpen(true) }}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        style={{ width: '100%', fontSize: 13, borderRadius: 7,
                 border: `1px solid ${value ? '#6366f1' : '#e5e7eb'}`,
                 padding: '7px 10px 7px 32px', background: '#ffffff', color: '#0f172a',
                 boxSizing: 'border-box' }}
      />
      {/* Icon search */}
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                     fontSize: 14, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                      maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>Không tìm thấy sản phẩm</div>
          ) : filtered.map(p => (
            <div
              key={p.productId}
              onMouseDown={() => {
                onSelect(String(p.productId))
                setQ('')
                setOpen(false)
              }}
              style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                       background: String(p.productId) === String(value) ? '#eff6ff' : '#fff' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background =
                String(p.productId) === String(value) ? '#eff6ff' : '#fff'}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{p.productName}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>SKU: {p.sku}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateDrawer({ open, onClose, onSaved, defaultProductId = '', defaultProductName = '', defaultItems = [] }) {
  const [allProducts,   setAllProducts]   = useState([])
  const [allSuppliers,  setAllSuppliers]  = useState([])
  const [prodSuppliersMap, setProdSuppliersMap] = useState({}) // { productId: [suppliers] }
  const [variationsMap, setVariationsMap] = useState({}) // { productId: [variations] }
  const [note,          setNote]          = useState('')
  const [items,         setItems]         = useState([{ productId: '', variationId: '', quantity: 1, importPrice: 0, supplierId: '' }])
  const [loading,       setLoading]       = useState(false)
  const [loadingSupps,  setLoadingSupps]  = useState(false)
  const [err,           setErr]           = useState('')

  // Load danh sách NCC + tất cả sản phẩm một lần khi mount
  useEffect(() => {
    api.get('/api/suppliers', { params: { active: true, pageSize: 100 } })
       .then(r => setAllSuppliers(r.data.items ?? [])).catch(() => {})
    api.get('/api/products/oltp', { params: { pageSize: 200, isActive: true } })
       .then(r => setAllProducts(r.data.data ?? [])).catch(() => {})
  }, [])

  // Reset / pre-fill khi drawer mở
  useEffect(() => {
    if (!open) return
    const pid = defaultProductId ? String(defaultProductId) : ''
    setItems(defaultItems.length > 0
      ? defaultItems.map(it => ({ ...it, supplierId: it.supplierId ? String(it.supplierId) : '' }))
      : [{ productId: pid, variationId: '', quantity: 1, importPrice: 0, supplierId: '' }])
    setNote('')
    setErr('')
    setProdSuppliersMap({})
  }, [open, defaultProductId, defaultItems])

  // Sau khi allProducts load, auto-fill giá cho defaultProductId hoặc defaultProductName
  useEffect(() => {
    if (!allProducts.length) return
    let targetPid = defaultProductId
    let matchedProd = null

    if (targetPid) {
      matchedProd = allProducts.find(p => String(p.productId) === String(targetPid))
    } else if (defaultProductName) {
      // Tìm sản phẩm có tên khớp nhất (không phân biệt hoa thường)
      matchedProd = allProducts.find(p => 
        p.productName.toLowerCase().includes(defaultProductName.toLowerCase()) || 
        defaultProductName.toLowerCase().includes(p.productName.toLowerCase())
      )
      if (matchedProd) {
        targetPid = String(matchedProd.productId)
      }
    }

    if (!matchedProd) return

    const autoPrice = matchedProd.importPrice > 0 ? matchedProd.importPrice : matchedProd.costPrice > 0 ? matchedProd.costPrice : 0
    
    setItems(its => its.map((it, i) => {
      if (i === 0) {
        return {
          ...it,
          productId: targetPid,
          importPrice: it.importPrice === 0 ? autoPrice : it.importPrice
        }
      }
      return it
    }))
  }, [allProducts, defaultProductId, defaultProductName])

  useEffect(() => {
    if (!open || defaultItems.length === 0) return
    const productIds = [...new Set(defaultItems.map(it => it.productId).filter(Boolean))]
    productIds.forEach(pid => {
      if (variationsMap[pid]) return
      api.get(`/api/products/${pid}/variations`)
         .then(r => setVariationsMap(m => ({ ...m, [pid]: r.data.data ?? [] })))
         .catch(() => setVariationsMap(m => ({ ...m, [pid]: [] })))
    })
  }, [open, defaultItems, variationsMap])

  // Fetch nhà cung cấp đề xuất cho từng sản phẩm trong danh sách
  useEffect(() => {
    if (!open) return
    const productIds = [...new Set(items.map(it => it.productId).filter(Boolean))]
    const missingIds = productIds.filter(pid => !prodSuppliersMap[pid])
    if (missingIds.length === 0) return

    setLoadingSupps(true)
    Promise.all(
      missingIds.map(pid =>
        api.get(`/api/suppliers/by-product/${pid}`)
           .then(r => {
             const sups = r.data ?? []
             setProdSuppliersMap(m => ({ ...m, [pid]: sups }))
             
             // Auto-fill supplierId & importPrice cho các items có pid này nếu chưa có supplierId
             setItems(its => its.map(it => {
               if (String(it.productId) === String(pid) && !it.supplierId) {
                 const bestSup = sups[0]
                 return {
                   ...it,
                   supplierId: bestSup ? String(bestSup.supplierId) : '',
                   importPrice: bestSup && it.importPrice === 0 ? bestSup.importPrice : it.importPrice
                 }
               }
               return it
             }))
           })
           .catch(() => {
             setProdSuppliersMap(m => ({ ...m, [pid]: [] }))
           })
      )
    ).finally(() => setLoadingSupps(false))
  }, [open, items, prodSuppliersMap])

  // Lọc danh sách NCC: gom toàn bộ các NCC của các SP đã chọn (không trùng lặp)
  const filteredSupps = useMemo(() => {
    const activeProductIds = items.map(it => it.productId).filter(Boolean)
    if (activeProductIds.length === 0) return null
    const list = []
    const seen = new Set()
    activeProductIds.forEach(pid => {
      const suppliers = prodSuppliersMap[pid] ?? []
      suppliers.forEach(s => {
        if (!seen.has(s.supplierId)) {
          seen.add(s.supplierId)
          list.push(s)
        }
      })
    })
    return list.length > 0 ? list : null
  }, [items, prodSuppliersMap])

  const addItem    = () => setItems(it => [...it, { productId: '', variationId: '', quantity: 1, importPrice: 0, supplierId: '' }])
  const removeItem = (i) => setItems(it => it.filter((_, j) => j !== i))
  const setItem    = (i, k, v) => setItems(it => it.map((x, j) => j === i ? { ...x, [k]: v } : x))

  // Khi chọn sản phẩm → auto-fill giá, reset variation, fetch variations
  const handleProductChange = (i, productId) => {
    const prod = allProducts.find(p => String(p.productId) === String(productId))
    
    // Tìm nhà cung cấp đầu tiên cung cấp SP này và tự động set NCC & giá tương ứng
    const sups = prodSuppliersMap[productId] ?? []
    const bestSup = sups[0]
    
    let autoPrice = 0
    let autoSuppId = ''
    if (bestSup) {
      autoPrice = bestSup.importPrice
      autoSuppId = String(bestSup.supplierId)
    } else {
      autoPrice = prod?.importPrice > 0 ? prod.importPrice
                : prod?.costPrice   > 0 ? prod.costPrice : 0
    }

    setItems(it => it.map((x, j) => j !== i ? x : { ...x, productId, variationId: '', importPrice: autoPrice, supplierId: autoSuppId }))

    // Fetch variations nếu chưa có
    if (productId && !variationsMap[productId]) {
      api.get(`/api/products/${productId}/variations`)
         .then(r => setVariationsMap(m => ({ ...m, [productId]: r.data.data ?? [] })))
         .catch(() => setVariationsMap(m => ({ ...m, [productId]: [] })))
    }
  }

  // Khi chọn NCC cụ thể cho một dòng sản phẩm
  const handleSuppItemChange = async (i, newSuppId) => {
    const item = items[i]
    if (!item) return
    
    setItems(its => its.map((it, idx) => idx === i ? { ...it, supplierId: newSuppId } : it))
    
    if (!newSuppId) return
    
    try {
      const res = await api.get(`/api/suppliers/${newSuppId}/products`)
      const productsList = res.data ?? []
      const match = productsList.find(p => String(p.productId) === String(item.productId))
      if (match && match.importPrice > 0) {
        setItems(its => its.map((it, idx) => idx === i ? { ...it, importPrice: match.importPrice } : it))
      }
    } catch {
      // Giữ nguyên giá
    }
  }

  // NCC hiển thị: ưu tiên danh sách đã lọc; fallback toàn bộ NCC
  const displaySuppliers = (filteredSupps && filteredSupps.length > 0) ? filteredSupps : allSuppliers

  // Hint text bên cạnh label NCC
  const hasProducts = items.some(it => it.productId)
  const suppHint = !hasProducts
    ? 'Chọn sản phẩm trước để lọc NCC'
    : loadingSupps
      ? 'Đang tải...'
      : filteredSupps === null || filteredSupps.length === 0
        ? 'Hiển thị tất cả NCC'
        : `${filteredSupps.length} NCC cung cấp các SP này`

  const suppHintColor = filteredSupps?.length > 0 ? '#22C55E' : '#94a3b8'

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.importPrice) || 0), 0)

  const save = async () => {
    if (items.some(it => !it.productId || it.quantity <= 0)) {
      setErr('Kiểm tra lại sản phẩm và số lượng.')
      return
    }
    if (items.some(it => !it.supplierId)) {
      setErr('Vui lòng chọn nhà cung cấp cho tất cả sản phẩm.')
      return
    }

    setLoading(true)
    setErr('')

    try {
      // Nhóm items theo supplierId
      const groups = {}
      items.forEach(it => {
        const sId = it.supplierId
        if (!groups[sId]) groups[sId] = []
        groups[sId].push(it)
      })

      // Gửi request tạo PO cho từng NCC song song
      await Promise.all(
        Object.entries(groups).map(([sId, groupItems]) =>
          api.post('/api/purchase-orders', {
            supplierId: Number(sId),
            note: note ? `${note} (Tách phiếu tự động)` : 'Tách phiếu nhập tự động theo nhà cung cấp',
            items: groupItems.map(it => ({
              productId:   Number(it.productId),
              variationId: it.variationId ? Number(it.variationId) : null,
              quantity:    Number(it.quantity),
              importPrice: Number(it.importPrice),
            })),
          })
        )
      )
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi tạo phiếu nhập.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', fontSize: 13, borderRadius: 8, border: '1px solid #e5e7eb',
    padding: '8px 12px', background: '#f8fafc', color: '#0f172a', boxSizing: 'border-box',
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b' }

  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={defaultProductName ? `Nhập hàng: ${defaultProductName}` : 'Tạo phiếu nhập hàng'}
      width={640}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            Tổng:{' '}
            <span style={{ color: '#6366f1' }}>{fmtMoneyExact(total)}</span>
          </span>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: '1px solid #e5e7eb',
                     background: 'transparent', color: '#64748b', cursor: 'pointer' }}>
            Hủy
          </button>
          <button onClick={save} disabled={loading}
            style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                     color: '#fff', background: '#6366f1', border: 'none',
                     cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Đang gửi...' : 'Tạo & Gửi NCC'}
          </button>
        </div>
      }
    >
      <div style={{ padding: '20px 20px 24px' }}>
        {err && (
          <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.1)', color: '#EF4444', fontSize: 13 }}>
            {err}
          </div>
        )}

        {/* ① Sản phẩm nhập — chọn TRƯỚC để lọc NCC */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              ① Sản phẩm nhập <span style={{ color: '#EF4444' }}>*</span>
            </span>
            <button onClick={addItem}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb',
                       background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 500 }}>
              + Thêm sản phẩm
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it, i) => (
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 10, background: '#f8fafc' }}>
                {/* Chọn sản phẩm — tìm kiếm */}
                <div style={{ marginBottom: 8 }}>
                  <ProductSearch
                    allProducts={allProducts}
                    value={it.productId}
                    onSelect={pid => handleProductChange(i, pid)}
                  />
                </div>

                {/* Chọn biến thể (size/màu) — chỉ hiện khi sản phẩm có variation */}
                {it.productId && (variationsMap[it.productId]?.length > 0) && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Biến thể (size / màu)</div>
                    <select value={it.variationId || ''} onChange={e => setItem(i, 'variationId', e.target.value)}
                      style={{ width: '100%', fontSize: 13, borderRadius: 7,
                               border: `1px solid ${it.variationId ? '#6366f1' : '#fbbf24'}`,
                               padding: '7px 10px', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}>
                      <option value="">-- Chọn size / màu sắc --</option>
                      {variationsMap[it.productId].map(v => {
                        const parts = [v.color, v.size].filter(Boolean)
                        const label = parts.length > 0
                          ? parts.join(' / ')
                          : (v.variationName || v.sku)
                        return (
                          <option key={v.variationId} value={v.variationId}>
                            {label}  •  Tồn: {v.stockQuantity ?? 0}
                          </option>
                        )
                      })}
                    </select>
                    {!it.variationId && (
                      <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 3 }}>
                        ⚠ Sản phẩm này có biến thể — vui lòng chọn size / màu
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}>
                  {/* Chọn nhà cung cấp cho từng dòng sản phẩm */}
                  <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Nhà cung cấp *</div>
                    <select
                      value={it.supplierId || ''}
                      onChange={e => handleSuppItemChange(i, e.target.value)}
                      style={{ width: '100%', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb',
                               padding: '7px 8px', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                    >
                      <option value="">-- Chọn nhà cung cấp --</option>
                      {(prodSuppliersMap[it.productId] ?? []).map(s => (
                        <option key={s.supplierId} value={s.supplierId}>
                          {s.supplierName} ({fmtMoneyExact(s.importPrice)})
                        </option>
                      ))}
                      {(prodSuppliersMap[it.productId] ?? []).length === 0 && allSuppliers.map(s => (
                        <option key={s.supplierId} value={s.supplierId}>
                          {s.supplierName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ flex: '0 0 70px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Số lượng</div>
                    <input type="number" min="1" value={it.quantity}
                      onChange={e => setItem(i, 'quantity', e.target.value)}
                      style={{ width: '100%', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb',
                               padding: '7px 8px', background: '#ffffff', color: '#0f172a', textAlign: 'center', boxSizing: 'border-box' }} />
                  </div>

                  <div style={{ flex: '1 1 110px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Giá nhập (đ)</div>
                    <input type="number" min="0" step="1000" value={it.importPrice}
                      onChange={e => setItem(i, 'importPrice', e.target.value)}
                      style={{ width: '100%', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb',
                               padding: '7px 10px', background: '#ffffff', color: '#0f172a', textAlign: 'right', boxSizing: 'border-box' }} />
                    {(() => {
                      const matched = it.supplierId ? (prodSuppliersMap[it.productId] ?? []).find(sp => String(sp.supplierId) === String(it.supplierId)) : null
                      if (matched && matched.importPrice > 0 && Number(it.importPrice) !== Number(matched.importPrice)) {
                        return (
                          <div style={{ fontSize: 10, color: '#16a34a', marginTop: 3, cursor: 'pointer', textAlign: 'right' }}
                               onClick={() => setItem(i, 'importPrice', matched.importPrice)}>
                            💡 NCC gợi ý: <span style={{ textDecoration: 'underline' }}>{fmtMoneyExact(matched.importPrice)}</span>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>

                  <div style={{ flex: '0 0 100px', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Thành tiền</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', height: 33, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {fmtMoneyExact((Number(it.quantity) || 0) * (Number(it.importPrice) || 0))}
                    </div>
                  </div>

                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)}
                      style={{ flex: '0 0 30px', width: 30, height: 33, borderRadius: 7, border: '1px solid #fecaca',
                               background: 'rgba(239,68,68,0.05)', color: '#EF4444', cursor: 'pointer',
                               display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, alignSelf: 'flex-end' }}>
                      ✕
                    </button>
                  )}
                </div>

                {Number(it.importPrice) > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    {PLATFORMS.map(pf => (
                      <span key={pf.name} style={{ fontSize: 11, color: '#94a3b8' }}>
                        {pf.name} ≥{' '}
                        <span style={{ color: '#3B82F6', fontWeight: 600 }}>
                          {fmtMoneyExact(calcMin(Number(it.importPrice), pf.rate))}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ② Danh sách phiếu nhập hàng dự kiến sẽ tạo */}
        {hasProducts && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>② Danh sách phiếu nhập dự kiến (Tự động tách theo NCC)</label>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(() => {
                const groups = {}
                items.forEach(it => {
                  if (!it.productId) return
                  const sId = it.supplierId || 'unknown'
                  if (!groups[sId]) groups[sId] = []
                  groups[sId].push(it)
                })

                return Object.entries(groups).map(([sId, groupItems]) => {
                  const supplierName = sId === 'unknown'
                    ? 'Chưa chọn nhà cung cấp'
                    : (allSuppliers.find(s => String(s.supplierId) === String(sId))?.supplierName ?? `Nhà cung cấp #${sId}`)
                  const subtotal = groupItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.importPrice) || 0), 0)
                  return (
                    <div key={sId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                           padding: '8px 12px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>
                        {supplierName} ({groupItems.length} sản phẩm)
                      </span>
                      <span style={{ fontWeight: 700, color: '#6366f1' }}>
                        {fmtMoneyExact(subtotal)}
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}

        {/* ③ Ghi chú */}
        <div>
          <label style={{ ...labelStyle, marginBottom: 6 }}>③ Ghi chú</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            style={{ ...inputStyle, resize: 'none' }} />
        </div>
      </div>
    </DetailDrawer>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const { t } = useTranslation()
  // Đọc URL params để pre-fill drawer khi navigate từ trang thông báo / tồn kho
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const urlProductId   = searchParams.get('productId')   || ''
  const urlProductName = searchParams.get('productName') || ''
  const rawItems       = searchParams.get('items') || ''
  const urlItems       = useMemo(() => parsePrefillItems(rawItems), [rawItems])
  const returnUrl      = searchParams.get('returnUrl')   || ''

  const [rows,          setRows]          = useState([])
  const [total,         setTotal]         = useState(0)
  const [page,          setPage]          = useState(1)
  const [totalPages,    setTotalPages]    = useState(1)
  const [loading,       setLoading]       = useState(true)
  const [isMock,        setIsMock]        = useState(false)
  const [filterStatus,  setFilterStatus]  = useState('')
  const [search,        setSearch]        = useState('')
  // Tự mở drawer nếu URL có productId (navigate từ nút "Nhập hàng")
  const [showCreate,    setShowCreate]    = useState(!!urlProductId || urlItems.length > 0)
  const [actionLoading, setActionLoading] = useState(null)
  const [confirmDlg, setConfirmDlg] = useState(null)
  const [expandedId,    setExpandedId]    = useState(null)
  const [detailCache,   setDetailCache]   = useState({})
  const [detailLoading, setDetailLoading] = useState(null)

  const toggleDetail = async (poId) => {
    if (expandedId === poId) { setExpandedId(null); return }
    setExpandedId(poId)
    if (detailCache[poId]) return
    setDetailLoading(poId)
    try {
      const res = await api.get(`/api/purchase-orders/${poId}`)
      setDetailCache(c => ({ ...c, [poId]: res.data.items ?? [] }))
    } catch { setDetailCache(c => ({ ...c, [poId]: [] })) }
    finally { setDetailLoading(null) }
  }

  const PAGE_SIZE = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, pageSize: PAGE_SIZE }
      if (filterStatus) params.status = filterStatus
      if (search.trim()) params.search = search.trim()
      const res = await api.get('/api/purchase-orders', { params })
      const d = res.data
      setRows(d.items ?? [])
      setTotal(d.total ?? 0)
      setTotalPages(d.totalPages ?? 1)
      setPage(p)
      setIsMock(false)
    } catch {
      setRows([]); setTotal(0); setTotalPages(1); setIsMock(true)
    } finally { setLoading(false) }
  }, [filterStatus, search])

  useEffect(() => { load(1) }, [load])

  const action = (id, endpoint, confirm_msg) => {
    if (confirm_msg) {
      setConfirmDlg({ msg: confirm_msg, id, endpoint })
    } else {
      doAction(id, endpoint)
    }
  }

  const doAction = async (id, endpoint) => {
    setActionLoading(id + endpoint)
    try {
      await api.post(`/api/purchase-orders/${id}/${endpoint}`)
      load(page)
    } catch (e) {
      // Hiển thị lỗi trong alert toast nhỏ - dùng confirmDlg tạm để show err
      console.error(e?.response?.data?.message ?? 'Lỗi thao tác.')
    } finally { setActionLoading(null) }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN') : '—'

  return (
    <>
    <ConfirmDialog
      open={!!confirmDlg}
      title="Xác nhận thao tác"
      message={confirmDlg?.msg}
      icon="warning"
      danger={false}
      onClose={() => setConfirmDlg(null)}
      onConfirm={() => { const {id, endpoint} = confirmDlg ?? {}; setConfirmDlg(null); if (id && endpoint) doAction(id, endpoint) }}
    />
    <div className="p-4 md:p-6 space-y-4">
      {isMock && <MockToast />}

      <CreateDrawer
        open={showCreate}
        onClose={() => returnUrl ? navigate(returnUrl) : setShowCreate(false)}
        onSaved={() => { setShowCreate(false); load(1); if (returnUrl) navigate(returnUrl) }}
        defaultProductId={urlProductId}
        defaultProductName={urlProductName}
        defaultItems={urlItems}
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('purchaseOrders.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('purchaseOrders.subtitle', { count: total })}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm text-white font-medium"
          style={{ background: 'var(--primary-500)' }}>
          {t('purchaseOrders.createBtn')}
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input
            type="text"
            className="linput !pl-9 text-sm"
            placeholder={t('purchaseOrders.searchPlaceholder', 'Tìm mã phiếu, nhà cung cấp...')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="linput text-sm"
          style={{ width: 180 }}
        >
          <option value="">{t('purchaseOrders.filterAll', 'Tất cả trạng thái')}</option>
          {['DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map(s => (
            <option key={s} value={s}>{t('purchaseOrders.' + STATUS_MAP[s], STATUS_CFG[s]?.label ?? s)}</option>
          ))}
        </select>
        {(search || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterStatus(''); setPage(1) }}
            className="lbtn lbtn-secondary !h-9">
            <span className="icon text-base">refresh</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto"
           style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Không có phiếu nhập nào
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['', 'Mã phiếu', 'Nhà cung cấp', 'Tổng tiền', 'Trạng thái', 'Ngày tạo', 'Thao tác'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((po, i) => {
                const isExpanded = expandedId === po.purchaseOrderId
                const isLast     = i === rows.length - 1
                const items      = detailCache[po.purchaseOrderId] ?? []
                return (
                  <>
                    <tr key={po.purchaseOrderId}
                        style={{
                          borderBottom: (!isExpanded && !isLast) ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleDetail(po.purchaseOrderId)}>
                      <td className="pl-4 pr-1 py-3 w-6">
                        <span className="icon text-sm"
                              style={{ color: 'var(--text-tertiary)', display: 'block',
                                       transition: 'transform 0.2s',
                                       transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          chevron_right
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                        {po.purchaseCode}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {po.supplierName}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {fmtMoneyExact(po.totalAmount)}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {fmtDate(po.createdAt)}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          {/* Hủy — khi chưa nhận hàng */}
                          {!['RECEIVED', 'CANCELLED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                            <button
                              onClick={() => action(po.purchaseOrderId, 'cancel', 'Hủy phiếu nhập này?')}
                              disabled={actionLoading === po.purchaseOrderId + 'cancel'}
                              className="text-xs px-2 py-1 rounded border"
                              style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }}>
                              {actionLoading === po.purchaseOrderId + 'cancel' ? '...' : 'Hủy'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Detail row — danh sách sản phẩm */}
                    {isExpanded && (
                      <tr key={`${po.purchaseOrderId}-detail`}
                          style={{
                            borderBottom: !isLast ? '1px solid var(--border)' : 'none',
                            background: 'var(--bg-elevated)',
                          }}>
                        <td colSpan={7} className="px-8 py-3">
                          {detailLoading === po.purchaseOrderId ? (
                            <div className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Đang tải...</div>
                          ) : items.length === 0 ? (
                            <div className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Không có sản phẩm.</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  {['Sản phẩm', 'Số lượng đặt', 'Đã nhận', 'Còn lại', 'Giá nhập', 'Thành tiền'].map(h => (
                                    <th key={h} className="pb-2 pr-4 text-left font-medium"
                                        style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {items.map(it => {
                                  const remaining = it.remainingQuantity ?? (it.quantity - it.receivedQuantity)
                                  const varLabel = it.variationId
                                    ? [it.color, it.size].filter(Boolean).join(' · ') || it.variationName
                                    : null
                                  return (
                                    <tr key={it.purchaseOrderItemId}>
                                      <td className="py-1.5 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {it.productName}
                                        {varLabel && (
                                          <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded"
                                                style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.2)' }}>
                                            {varLabel}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-4 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                        {it.quantity}
                                      </td>
                                      <td className="py-1.5 pr-4 tabular-nums" style={{ color: '#22C55E' }}>
                                        {it.receivedQuantity}
                                      </td>
                                      <td className="py-1.5 pr-4 tabular-nums font-semibold"
                                          style={{ color: remaining > 0 ? '#F59E0B' : 'var(--text-tertiary)' }}>
                                        {remaining}
                                      </td>
                                      <td className="py-1.5 pr-4 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                        {fmtMoneyExact(it.importPrice)}
                                      </td>
                                      <td className="py-1.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                        {fmtMoneyExact(it.totalPrice)}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>Trang {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>← Trước</button>
            <button disabled={page >= totalPages} onClick={() => load(page + 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Tiếp →</button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
