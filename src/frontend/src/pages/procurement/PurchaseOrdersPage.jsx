import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import MockToast from '../../components/ui/MockToast'

const STATUS_CFG = {
  DRAFT:               { label: 'Nháp',          bg: 'rgba(100,116,139,0.1)', text: '#64748B' },
  PENDING:             { label: 'Chờ duyệt',     bg: 'rgba(245,158,11,0.1)', text: '#F59E0B' },
  APPROVED:            { label: 'Đã duyệt',      bg: 'rgba(59,130,246,0.1)', text: '#3B82F6' },
  PARTIALLY_RECEIVED:  { label: 'Nhận một phần', bg: 'rgba(99,102,241,0.1)', text: '#6366F1' },
  RECEIVED:            { label: 'Đã nhận đủ',   bg: 'rgba(34,197,94,0.1)',  text: '#22C55E' },
  CANCELLED:           { label: 'Đã hủy',        bg: 'rgba(239,68,68,0.1)', text: '#EF4444' },
}

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] ?? { label: status, bg: 'rgba(100,116,139,0.1)', text: '#64748B' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: c.bg, color: c.text }}>{c.label}</span>
  )
}

function CreateModal({ onClose, onSaved }) {
  const [suppliers,    setSuppliers]    = useState([])
  const [allProducts,  setAllProducts]  = useState([])
  const [suppProducts, setSuppProducts] = useState(null)   // null = chưa lọc
  const [suppId,       setSuppId]       = useState('')
  const [note,         setNote]         = useState('')
  const [items,        setItems]        = useState([{ productId: '', quantity: 1, importPrice: 0 }])
  const [loading,      setLoading]      = useState(false)
  const [loadingProds, setLoadingProds] = useState(false)
  const [err,          setErr]          = useState('')

  const products = suppProducts ?? allProducts

  useEffect(() => {
    api.get('/api/suppliers', { params: { active: true, pageSize: 100 } })
       .then(r => setSuppliers(r.data.items ?? [])).catch(() => {})
    api.get('/api/products/oltp', { params: { pageSize: 200 } })
       .then(r => setAllProducts(r.data.items ?? [])).catch(() => {})
  }, [])

  // Khi chọn NCC → tải SP của NCC đó
  useEffect(() => {
    if (!suppId) { setSuppProducts(null); return }
    setLoadingProds(true)
    setSuppProducts(null)
    setItems([{ productId: '', quantity: 1, importPrice: 0 }])
    api.get(`/api/suppliers/${suppId}/products`)
       .then(r => setSuppProducts(r.data ?? []))
       .catch(() => setSuppProducts(null))
       .finally(() => setLoadingProds(false))
  }, [suppId])

  const addItem = () => setItems(it => [...it, { productId: '', quantity: 1, importPrice: 0 }])
  const removeItem = (i) => setItems(it => it.filter((_, j) => j !== i))
  const setItem = (i, k, v) => setItems(it => it.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.importPrice) || 0), 0)

  const save = async () => {
    if (!suppId) { setErr('Chọn nhà cung cấp.'); return }
    if (items.some(i => !i.productId || i.quantity <= 0)) { setErr('Kiểm tra lại sản phẩm và số lượng.'); return }
    setLoading(true); setErr('')
    try {
      await api.post('/api/purchase-orders', {
        supplierId: Number(suppId), note: note || null,
        items: items.map(i => ({ productId: Number(i.productId), quantity: Number(i.quantity), importPrice: Number(i.importPrice) })),
      })
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi tạo phiếu nhập.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
         style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-2xl rounded-xl shadow-xl p-6 space-y-4 my-8"
           style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tạo phiếu nhập hàng</h2>

        {err && <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Nhà cung cấp *</label>
            <select value={suppId} onChange={e => setSuppId(e.target.value)}
              className="w-full text-sm rounded-lg border px-3 py-1.5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">-- Chọn nhà cung cấp --</option>
              {suppliers.map(s => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Ghi chú</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full text-sm rounded-lg border px-3 py-1.5 resize-none"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          </div>

        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Sản phẩm</span>
            <div className="flex items-center gap-3">
              {suppId && (
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {loadingProds ? 'Đang tải...' : suppProducts ? `${suppProducts.length} SP của NCC này` : 'Hiện tất cả SP'}
                </span>
              )}
              <button onClick={addItem} className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>+ Thêm</button>
            </div>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select value={it.productId} onChange={e => setItem(i, 'productId', e.target.value)}
                  disabled={loadingProds}
                  className="flex-1 text-sm rounded-lg border px-2 py-1.5"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  <option value="">{loadingProds ? 'Đang tải...' : '-- Sản phẩm --'}</option>
                  {products.map(p => <option key={p.productId} value={p.productId}>{p.productName}</option>)}
                </select>
                <input type="number" min="1" value={it.quantity}
                  onChange={e => setItem(i, 'quantity', e.target.value)}
                  className="w-20 text-sm rounded-lg border px-2 py-1.5 text-center"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="SL" />
                <input type="number" min="0" value={it.importPrice}
                  onChange={e => setItem(i, 'importPrice', e.target.value)}
                  className="w-28 text-sm rounded-lg border px-2 py-1.5 text-right"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  placeholder="Giá nhập" />
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} className="text-xs" style={{ color: '#EF4444' }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="text-right text-sm mt-2 font-medium" style={{ color: 'var(--text-primary)' }}>
            Tổng: {total.toLocaleString('vi-VN')}đ
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Hủy</button>
          <button onClick={save} disabled={loading}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-medium disabled:opacity-60"
            style={{ background: 'var(--primary-500)' }}>
            {loading ? 'Đang lưu...' : 'Tạo phiếu'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PurchaseOrdersPage() {
  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [totalPages,   setTotalPages]   = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [isMock,       setIsMock]       = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate,   setShowCreate]   = useState(false)
  const [actionLoading,setActionLoading]= useState(null)
  const [expandedId,   setExpandedId]   = useState(null)
  const [detailCache,  setDetailCache]  = useState({})   // po_id → items[]
  const [detailLoading,setDetailLoading]= useState(null)

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
      const res = await api.get('/api/purchase-orders', { params })
      const d = res.data
      setRows(d.items ?? [])
      setTotal(d.total ?? 0)
      setTotalPages(d.totalPages ?? 1)
      setPage(p)
      setIsMock(false)
    } catch {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setIsMock(true)
    } finally { setLoading(false) }
  }, [filterStatus])

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
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(1) }} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Phiếu nhập hàng</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Quản lý đặt hàng nhà cung cấp ({total})</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm text-white font-medium"
          style={{ background: 'var(--primary-500)' }}>
          + Tạo phiếu
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['', 'DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map(s => (
          <button key={s}
            onClick={() => setFilterStatus(s)}
            className="px-3 py-1 rounded-lg text-xs border"
            style={{
              background: filterStatus === s ? 'var(--primary-500)' : 'var(--bg-elevated)',
              color:      filterStatus === s ? '#fff' : 'var(--text-secondary)',
              borderColor:'var(--border)',
            }}>
            {s ? STATUS_CFG[s]?.label : 'Tất cả'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>Không có phiếu nhập nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['', 'Mã phiếu', 'Nhà cung cấp', 'Tổng tiền', 'Trạng thái', 'Ngày tạo', 'Thao tác'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
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
                        style={{ borderBottom: (!isExpanded && !isLast) ? '1px solid var(--border)' : 'none',
                                 cursor: 'pointer' }}
                        onClick={() => toggleDetail(po.purchaseOrderId)}>
                      {/* Toggle icon */}
                      <td className="pl-4 pr-1 py-3 w-6">
                        <span className="icon text-sm" style={{ color: 'var(--text-tertiary)',
                          display: 'block', transition: 'transform 0.2s',
                          transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          chevron_right
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{po.purchaseCode}</td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{po.supplierName}</td>
                      <td className="px-4 py-3 tabular-nums text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {Number(po.totalAmount).toLocaleString('vi-VN')}đ
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{fmtDate(po.createdAt)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          {po.status === 'DRAFT' && (
                            <button onClick={() => action(po.purchaseOrderId, 'submit', null)}
                              disabled={actionLoading === po.purchaseOrderId + 'submit'}
                              className="text-xs px-2 py-1 rounded border"
                              style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#F59E0B' }}>
                              Gửi duyệt
                            </button>
                          )}
                          {po.status === 'PENDING' && (
                            <button onClick={() => action(po.purchaseOrderId, 'approve', 'Duyệt phiếu nhập này?')}
                              disabled={actionLoading === po.purchaseOrderId + 'approve'}
                              className="text-xs px-2 py-1 rounded border"
                              style={{ borderColor: 'rgba(59,130,246,0.4)', color: '#3B82F6' }}>
                              Duyệt
                            </button>
                          )}
                          {!['RECEIVED', 'CANCELLED', 'PARTIALLY_RECEIVED'].includes(po.status) && (
                            <button onClick={() => action(po.purchaseOrderId, 'cancel', 'Hủy phiếu nhập này?')}
                              disabled={actionLoading === po.purchaseOrderId + 'cancel'}
                              className="text-xs px-2 py-1 rounded border"
                              style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }}>
                              Hủy
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Detail row — danh sách sản phẩm ── */}
                    {isExpanded && (
                      <tr key={`${po.purchaseOrderId}-detail`}
                          style={{ borderBottom: !isLast ? '1px solid var(--border)' : 'none',
                                   background: 'var(--bg-elevated)' }}>
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
