import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import MockToast from '../../components/ui/MockToast'
import DetailDrawer from '../../components/ui/DetailDrawer'

const PLATFORMS = [
  { name: 'Shopee', rate: 0.040 },
  { name: 'TikTok', rate: 0.025 },
  { name: 'Lazada', rate: 0.040 },
]
const calcMin = (ip, rate) => ip > 0 ? Math.ceil(ip / (1 - rate) / 1000) * 1000 : 0

const STATUS_CFG = {
  DRAFT:               { label: 'Nháp',          bg: 'rgba(100,116,139,0.1)', text: '#64748B' },
  PENDING:             { label: 'Chờ duyệt',     bg: 'rgba(245,158,11,0.1)',  text: '#F59E0B' },
  APPROVED:            { label: 'Đã duyệt',      bg: 'rgba(59,130,246,0.1)',  text: '#3B82F6' },
  PARTIALLY_RECEIVED:  { label: 'Nhận một phần', bg: 'rgba(99,102,241,0.1)',  text: '#6366F1' },
  RECEIVED:            { label: 'Đã nhận đủ',    bg: 'rgba(34,197,94,0.1)',   text: '#22C55E' },
  CANCELLED:           { label: 'Đã hủy',        bg: 'rgba(239,68,68,0.1)',   text: '#EF4444' },
}

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] ?? { label: status, bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: c.bg, color: c.text }}>{c.label}</span>
  )
}

// ── Drawer tạo phiếu nhập hàng ────────────────────────────────────────────────
// Flow mới: chọn sản phẩm trước → NCC tự lọc theo sản phẩm đã chọn
function CreateDrawer({ open, onClose, onSaved, defaultProductId = '', defaultProductName = '' }) {
  const [allProducts,   setAllProducts]   = useState([])
  const [allSuppliers,  setAllSuppliers]  = useState([])
  const [filteredSupps, setFilteredSupps] = useState(null)
  const [variationsMap, setVariationsMap] = useState({}) // { productId: [variations] }
  const [suppId,        setSuppId]        = useState('')
  const [note,          setNote]          = useState('')
  const [items,         setItems]         = useState([{ productId: '', variationId: '', quantity: 1, importPrice: 0 }])
  const [loading,       setLoading]       = useState(false)
  const [loadingSupps,  setLoadingSupps]  = useState(false)
  const [err,           setErr]           = useState('')

  // Load danh sách NCC + tất cả sản phẩm một lần khi mount
  useEffect(() => {
    api.get('/api/suppliers', { params: { active: true, pageSize: 100 } })
       .then(r => setAllSuppliers(r.data.items ?? [])).catch(() => {})
    api.get('/api/products/oltp', { params: { pageSize: 200 } })
       .then(r => setAllProducts(r.data.data ?? [])).catch(() => {})
  }, [])

  // Reset / pre-fill khi drawer mở
  useEffect(() => {
    if (!open) return
    const pid = defaultProductId ? String(defaultProductId) : ''
    setItems([{ productId: pid, quantity: 1, importPrice: 0 }])
    setSuppId('')
    setNote('')
    setErr('')
    setFilteredSupps(null)
  }, [open, defaultProductId])

  // Sau khi allProducts load, auto-fill giá cho defaultProductId
  useEffect(() => {
    if (!defaultProductId || !allProducts.length) return
    const prod = allProducts.find(p => String(p.productId) === String(defaultProductId))
    if (!prod) return
    const autoPrice = prod.importPrice > 0 ? prod.importPrice : prod.costPrice > 0 ? prod.costPrice : 0
    if (!autoPrice) return
    setItems(its => its.map((it, i) =>
      i === 0 && String(it.productId) === String(defaultProductId) && it.importPrice === 0
        ? { ...it, importPrice: autoPrice } : it
    ))
  }, [allProducts, defaultProductId])

  // Khi sản phẩm đầu tiên thay đổi → fetch NCC cung cấp sản phẩm đó
  const leadProductId = items[0]?.productId || ''
  useEffect(() => {
    if (!leadProductId) { setFilteredSupps(null); return }
    setLoadingSupps(true)
    api.get(`/api/suppliers/by-product/${leadProductId}`)
       .then(r => setFilteredSupps(r.data ?? []))
       .catch(() => setFilteredSupps(null))
       .finally(() => setLoadingSupps(false))
  }, [leadProductId])

  const addItem    = () => setItems(it => [...it, { productId: '', variationId: '', quantity: 1, importPrice: 0 }])
  const removeItem = (i) => setItems(it => it.filter((_, j) => j !== i))
  const setItem    = (i, k, v) => setItems(it => it.map((x, j) => j === i ? { ...x, [k]: v } : x))

  // Khi chọn sản phẩm → auto-fill giá, reset variation, fetch variations
  const handleProductChange = (i, productId) => {
    const prod = allProducts.find(p => String(p.productId) === String(productId))
    const autoPrice = prod?.importPrice > 0 ? prod.importPrice
                    : prod?.costPrice   > 0 ? prod.costPrice : 0
    setItems(it => it.map((x, j) => j !== i ? x : { ...x, productId, variationId: '', importPrice: autoPrice }))

    // Fetch variations nếu chưa có
    if (productId && !variationsMap[productId]) {
      api.get(`/api/products/${productId}/variations`)
         .then(r => setVariationsMap(m => ({ ...m, [productId]: r.data.data ?? [] })))
         .catch(() => setVariationsMap(m => ({ ...m, [productId]: [] })))
    }
  }

  // Khi chọn NCC → nếu NCC có giá nhập riêng cho sản phẩm đầu → auto-fill giá
  const handleSuppChange = (newSuppId) => {
    setSuppId(newSuppId)
    if (!newSuppId || !filteredSupps?.length) return
    const suppData = filteredSupps.find(s => String(s.supplierId) === String(newSuppId))
    if (suppData?.importPrice > 0)
      setItems(its => its.map((it, idx) => idx === 0 ? { ...it, importPrice: suppData.importPrice } : it))
  }

  // NCC hiển thị: ưu tiên danh sách đã lọc; fallback toàn bộ NCC
  const displaySuppliers = (filteredSupps && filteredSupps.length > 0) ? filteredSupps : allSuppliers

  // Hint text bên cạnh label NCC
  const suppHint = !leadProductId
    ? 'Chọn sản phẩm trước để lọc NCC'
    : loadingSupps
      ? 'Đang tải...'
      : filteredSupps === null || filteredSupps.length === 0
        ? 'Hiển thị tất cả NCC'
        : `${filteredSupps.length} NCC cung cấp SP này`

  const suppHintColor = filteredSupps?.length > 0 ? '#22C55E' : '#94a3b8'

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.importPrice) || 0), 0)

  const save = async () => {
    if (!suppId) { setErr('Chọn nhà cung cấp.'); return }
    if (items.some(it => !it.productId || it.quantity <= 0)) { setErr('Kiểm tra lại sản phẩm và số lượng.'); return }
    setLoading(true); setErr('')
    try {
      await api.post('/api/purchase-orders', {
        supplierId: Number(suppId), note: note || null,
        items: items.map(it => ({
          productId:   Number(it.productId),
          variationId: it.variationId ? Number(it.variationId) : null,
          quantity:    Number(it.quantity),
          importPrice: Number(it.importPrice),
        })),
      })
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi tạo phiếu nhập.')
    } finally { setLoading(false) }
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
            <span style={{ color: '#6366f1' }}>{total.toLocaleString('vi-VN')}đ</span>
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
              <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', background: '#f8fafc' }}>
                {/* Chọn sản phẩm */}
                <div style={{ marginBottom: 8 }}>
                  <select value={it.productId} onChange={e => handleProductChange(i, e.target.value)}
                    style={{ width: '100%', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb',
                             padding: '7px 10px', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}>
                    <option value="">-- Chọn sản phẩm --</option>
                    {allProducts.map(p => <option key={p.productId} value={p.productId}>{p.productName}</option>)}
                  </select>
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
                        const label = [v.size, v.color, v.variationName].filter(Boolean).join(' / ') || v.sku
                        return (
                          <option key={v.variationId} value={v.variationId}>
                            {label} — SKU: {v.sku} (tồn: {v.stockQuantity ?? 0})
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

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: '0 0 90px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Số lượng</div>
                    <input type="number" min="1" value={it.quantity}
                      onChange={e => setItem(i, 'quantity', e.target.value)}
                      style={{ width: '100%', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb',
                               padding: '7px 8px', background: '#ffffff', color: '#0f172a', textAlign: 'center', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Giá nhập (đ)</div>
                    <input type="number" min="0" step="1000" value={it.importPrice}
                      onChange={e => setItem(i, 'importPrice', e.target.value)}
                      style={{ width: '100%', fontSize: 13, borderRadius: 7, border: '1px solid #e5e7eb',
                               padding: '7px 10px', background: '#ffffff', color: '#0f172a', textAlign: 'right', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: '0 0 120px', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Thành tiền</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', height: 33, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {((Number(it.quantity) || 0) * (Number(it.importPrice) || 0)).toLocaleString('vi-VN')}đ
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)}
                      style={{ flex: '0 0 30px', width: 30, height: 33, borderRadius: 7, border: '1px solid #fecaca',
                               background: 'rgba(239,68,68,0.05)', color: '#EF4444', cursor: 'pointer',
                               display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
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
                          {calcMin(Number(it.importPrice), pf.rate).toLocaleString('vi-VN')}đ
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ② Nhà cung cấp — lọc theo sản phẩm đã chọn */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={labelStyle}>
              ② Nhà cung cấp <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <span style={{ fontSize: 11, color: suppHintColor,
                           background: filteredSupps?.length > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.06)',
                           padding: '2px 8px', borderRadius: 99 }}>
              {suppHint}
            </span>
          </div>
          <select value={suppId} onChange={e => handleSuppChange(e.target.value)}
            disabled={loadingSupps}
            style={{ ...inputStyle, opacity: loadingSupps ? 0.6 : 1 }}>
            <option value="">{loadingSupps ? 'Đang tải NCC...' : '-- Chọn nhà cung cấp --'}</option>
            {displaySuppliers.map(s => (
              <option key={s.supplierId} value={s.supplierId}>
                {s.supplierName}{s.importPrice > 0 ? ` — ${s.importPrice.toLocaleString('vi-VN')}đ` : ''}
              </option>
            ))}
          </select>
        </div>

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
  // Đọc URL params để pre-fill drawer khi navigate từ trang thông báo / tồn kho
  const [searchParams] = useSearchParams()
  const urlProductId   = searchParams.get('productId')   || ''
  const urlProductName = searchParams.get('productName') || ''

  const [rows,          setRows]          = useState([])
  const [total,         setTotal]         = useState(0)
  const [page,          setPage]          = useState(1)
  const [totalPages,    setTotalPages]    = useState(1)
  const [loading,       setLoading]       = useState(true)
  const [isMock,        setIsMock]        = useState(false)
  const [filterStatus,  setFilterStatus]  = useState('')
  const [search,        setSearch]        = useState('')
  // Tự mở drawer nếu URL có productId (navigate từ nút "Nhập hàng")
  const [showCreate,    setShowCreate]    = useState(!!urlProductId)
  const [actionLoading, setActionLoading] = useState(null)
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

  const action = async (id, endpoint, confirm_msg) => {
    if (confirm_msg && !window.confirm(confirm_msg)) return
    setActionLoading(id + endpoint)
    try {
      await api.post(`/api/purchase-orders/${id}/${endpoint}`)
      load(page)
    } catch (e) {
      alert(e?.response?.data?.message ?? 'Lỗi thao tác.')
    } finally { setActionLoading(null) }
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN') : '—'

  return (
    <div className="p-4 md:p-6 space-y-4">
      {isMock && <MockToast />}

      <CreateDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={() => { setShowCreate(false); load(1) }}
        defaultProductId={urlProductId}
        defaultProductName={urlProductName}
      />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Phiếu nhập hàng</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Quản lý đặt hàng nhà cung cấp ({total})
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm text-white font-medium"
          style={{ background: 'var(--primary-500)' }}>
          + Tạo phiếu
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
            placeholder="Tìm mã phiếu, nhà cung cấp..."
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
          <option value="">Tất cả trạng thái</option>
          {['DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map(s => (
            <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>
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
                        {Number(po.totalAmount).toLocaleString('vi-VN')}đ
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
                                  return (
                                    <tr key={it.purchaseOrderItemId}>
                                      <td className="py-1.5 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {it.productName}
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
                                        {Number(it.importPrice).toLocaleString('vi-VN')}đ
                                      </td>
                                      <td className="py-1.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                        {Number(it.totalPrice).toLocaleString('vi-VN')}đ
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
  )
}
