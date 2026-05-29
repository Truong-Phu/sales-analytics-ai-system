import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import MockToast from '../../components/ui/MockToast'

// ── Modal tạo phiếu nhập kho ──────────────────────────────────────────────────
function CreateReceiptModal({ onClose, onSaved, initialPoId = '' }) {
  const [approvedPOs, setApprovedPOs] = useState([])
  const [poId,        setPoId]        = useState(String(initialPoId))
  const [selectedPO,  setSelectedPO]  = useState(null)
  const [poItems,     setPoItems]     = useState([])
  const [note,        setNote]        = useState('')
  const [receiveQtys, setReceiveQtys] = useState({})
  const [loading,     setLoading]     = useState(false)
  const [err,         setErr]         = useState('')

  useEffect(() => {
    api.get('/api/purchase-orders', { params: { pageSize: 100 } })
       .then(r => setApprovedPOs(
         (r.data.items ?? []).filter(p => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status))
       ))
       .catch(() => {})
  }, [])

  // Tự load PO khi có initialPoId
  useEffect(() => {
    if (initialPoId) loadPODetails(String(initialPoId))
  }, [initialPoId]) // eslint-disable-line

  const loadPODetails = async (id) => {
    if (!id) { setSelectedPO(null); setPoItems([]); return }
    try {
      const res = await api.get(`/api/purchase-orders/${id}`)
      setSelectedPO(res.data.order)
      const its = res.data.items ?? []
      // Chỉ hiện item còn hàng chưa nhận đủ
      const pending = its.filter(i => (i.remainingQuantity ?? i.quantity - i.receivedQuantity) > 0)
      setPoItems(pending)
      const initQtys = {}
      pending.forEach(i => { initQtys[i.purchaseOrderItemId] = i.remainingQuantity ?? (i.quantity - i.receivedQuantity) })
      setReceiveQtys(initQtys)
    } catch { setErr('Không tải được chi tiết phiếu nhập.') }
  }

  const handlePoChange = (id) => {
    setPoId(id)
    setErr('')
    loadPODetails(id)
  }

  const save = async () => {
    if (!poId) { setErr('Chọn phiếu nhập hàng.'); return }
    const items = poItems
      .map(i => ({
        productId:        i.productId,
        receivedQuantity: Number(receiveQtys[i.purchaseOrderItemId] ?? 0),
        importPrice:      Number(i.importPrice),
      }))
      .filter(i => i.receivedQuantity > 0)
    if (items.length === 0) { setErr('Cần nhập ít nhất 1 sản phẩm với số lượng > 0.'); return }
    setLoading(true); setErr('')
    try {
      await api.post('/api/goods-receipts', { purchaseOrderId: Number(poId), note: note || null, items })
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi tạo phiếu nhập kho.')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
         style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-2xl rounded-xl shadow-xl p-6 space-y-4 my-8"
           style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {selectedPO?.status === 'PARTIALLY_RECEIVED' ? 'Nhập kho đợt tiếp theo' : 'Tạo phiếu nhập kho'}
        </h2>

        {err && (
          <div className="text-sm px-3 py-2 rounded-lg"
               style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</div>
        )}

        {/* Chọn PO */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Phiếu nhập hàng đã duyệt *
          </label>
          <select value={poId} onChange={e => handlePoChange(e.target.value)}
            className="w-full text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <option value="">-- Chọn phiếu nhập --</option>
            {approvedPOs.map(p => (
              <option key={p.purchaseOrderId} value={p.purchaseOrderId}>
                {p.purchaseCode} — {p.supplierName}
                {p.status === 'PARTIALLY_RECEIVED' ? ' (còn thiếu hàng)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Danh sách sản phẩm còn thiếu */}
        {poItems.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Sản phẩm còn thiếu — nhập số lượng thực nhận đợt này
            </p>
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    {['Sản phẩm', 'Còn thiếu', 'Nhận đợt này'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium"
                          style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((item, idx) => {
                    const remaining = item.remainingQuantity ?? (item.quantity - item.receivedQuantity)
                    return (
                      <tr key={item.purchaseOrderItemId}
                          style={{ borderBottom: idx < poItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                          {item.productName}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold" style={{ color: '#F59E0B' }}>
                          {remaining}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min="0" max={remaining}
                            value={receiveQtys[item.purchaseOrderItemId] ?? 0}
                            onChange={e => setReceiveQtys(q => ({ ...q, [item.purchaseOrderItemId]: e.target.value }))}
                            className="w-20 text-sm rounded-lg border px-2 py-1 text-center"
                            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ghi chú */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Ghi chú</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            className="w-full text-sm rounded-lg border px-3 py-1.5 resize-none"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Hủy</button>
          <button onClick={save} disabled={loading || !poId}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-medium disabled:opacity-60"
            style={{ background: 'var(--primary-500)' }}>
            {loading ? 'Đang lưu...' : 'Xác nhận nhập kho'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GoodsReceiptsPage() {
  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [totalPages,   setTotalPages]   = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [isMock,       setIsMock]       = useState(false)
  const [showCreate,   setShowCreate]   = useState(false)
  const [initialPoId,  setInitialPoId]  = useState('')
  // Expandable detail
  const [expandedId,   setExpandedId]   = useState(null)
  const [detailCache,  setDetailCache]  = useState({})
  const [detailLoading,setDetailLoading]= useState(null)
  // POs chờ nhập
  const [pendingPOs,   setPendingPOs]   = useState([])

  const PAGE_SIZE = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await api.get('/api/goods-receipts', { params: { page: p, pageSize: PAGE_SIZE } })
      const d = res.data
      setRows(d.items ?? [])
      setTotal(d.total ?? 0)
      setTotalPages(d.totalPages ?? 1)
      setPage(p)
      setIsMock(false)
    } catch {
      setRows([]); setTotal(0); setTotalPages(1); setIsMock(true)
    } finally { setLoading(false) }
  }, [])

  const loadPendingPOs = useCallback(async () => {
    try {
      const res = await api.get('/api/purchase-orders', {
        params: { pageSize: 50 }
      })
      const pending = (res.data.items ?? []).filter(
        p => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status)
      )
      setPendingPOs(pending)
    } catch { setPendingPOs([]) }
  }, [])

  useEffect(() => { load(1); loadPendingPOs() }, [load, loadPendingPOs])

  const toggleDetail = async (grId) => {
    if (expandedId === grId) { setExpandedId(null); return }
    setExpandedId(grId)
    if (detailCache[grId]) return
    setDetailLoading(grId)
    try {
      const res = await api.get(`/api/goods-receipts/${grId}`)
      setDetailCache(c => ({ ...c, [grId]: res.data.items ?? [] }))
    } catch { setDetailCache(c => ({ ...c, [grId]: [] })) }
    finally { setDetailLoading(null) }
  }

  const openCreate = (poId = '') => {
    setInitialPoId(poId)
    setShowCreate(true)
  }

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div className="p-4 md:p-6 space-y-4">
      {isMock && <MockToast />}
      {showCreate && (
        <CreateReceiptModal
          initialPoId={initialPoId}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(1); loadPendingPOs() }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Phiếu nhập kho</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Lịch sử nhận hàng thực tế ({total} phiếu)
          </p>
        </div>
        <button onClick={() => openCreate()}
          className="px-4 py-2 rounded-lg text-sm text-white font-medium"
          style={{ background: 'var(--primary-500)' }}>
          + Nhập kho
        </button>
      </div>

      {/* ── Phiếu đặt hàng đang chờ nhập ── */}
      {pendingPOs.length > 0 && (
        <div className="rounded-xl border p-4 space-y-2"
             style={{ borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.04)' }}>
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
            <span className="icon text-sm">pending_actions</span>
            {pendingPOs.length} phiếu đặt hàng đang chờ nhập kho
          </p>
          <div className="space-y-1.5">
            {pendingPOs.map(po => (
              <div key={po.purchaseOrderId}
                   className="flex items-center justify-between rounded-lg px-3 py-2"
                   style={{ background: 'var(--bg-card)' }}>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {po.purchaseCode}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {po.supplierName}
                  </span>
                  {po.status === 'PARTIALLY_RECEIVED' && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>
                      Nhận một phần
                    </span>
                  )}
                  {po.status === 'APPROVED' && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6' }}>
                      Chờ nhận lần đầu
                    </span>
                  )}
                </div>
                <button
                  onClick={() => openCreate(po.purchaseOrderId)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ background: 'var(--primary-500)' }}>
                  <span className="icon text-sm">add_box</span>
                  Nhập hàng
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Danh sách phiếu nhập kho ── */}
      <div className="rounded-xl border overflow-x-auto"
           style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Chưa có phiếu nhập kho nào
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['', 'Mã phiếu NK', 'Phiếu nhập hàng', 'Nhà cung cấp', 'Tổng SL', 'Tổng tiền', 'Thời gian'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((gr, i) => {
                const isExpanded = expandedId === gr.goodsReceiptId
                const isLast     = i === rows.length - 1
                const items      = detailCache[gr.goodsReceiptId] ?? []
                return (
                  <>
                    <tr key={gr.goodsReceiptId}
                        style={{
                          borderBottom: (!isExpanded && !isLast) ? '1px solid var(--border)' : 'none',
                          cursor: 'pointer',
                        }}
                        onClick={() => toggleDetail(gr.goodsReceiptId)}>
                      <td className="pl-4 pr-1 py-3 w-6">
                        <span className="icon text-sm"
                              style={{ color: 'var(--text-tertiary)', display: 'block',
                                       transition: 'transform 0.2s',
                                       transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          chevron_right
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                        {gr.receiptCode}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {gr.purchaseCode}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                        {gr.supplierName}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm font-medium"
                          style={{ color: 'var(--text-primary)' }}>
                        {gr.totalQuantity}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {Number(gr.totalAmount).toLocaleString('vi-VN')}đ
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {fmtDate(gr.createdAt)}
                      </td>
                    </tr>

                    {/* Detail row — sản phẩm đã nhận */}
                    {isExpanded && (
                      <tr key={`${gr.goodsReceiptId}-detail`}
                          style={{ borderBottom: !isLast ? '1px solid var(--border)' : 'none',
                                   background: 'var(--bg-elevated)' }}>
                        <td colSpan={7} className="px-8 py-3">
                          {detailLoading === gr.goodsReceiptId ? (
                            <div className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>Đang tải...</div>
                          ) : items.length === 0 ? (
                            <div className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>
                              Không có chi tiết.
                            </div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  {['Sản phẩm', 'Số lượng nhận', 'Giá nhập', 'Thành tiền'].map(h => (
                                    <th key={h} className="pb-2 pr-4 text-left font-medium"
                                        style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {items.map(it => (
                                  <tr key={it.goodsReceiptItemId}>
                                    <td className="py-1.5 pr-4 font-medium" style={{ color: 'var(--text-primary)' }}>
                                      {it.productName}
                                    </td>
                                    <td className="py-1.5 pr-4 tabular-nums font-semibold"
                                        style={{ color: '#22C55E' }}>
                                      +{it.receivedQuantity}
                                    </td>
                                    <td className="py-1.5 pr-4 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                      {Number(it.importPrice).toLocaleString('vi-VN')}đ
                                    </td>
                                    <td className="py-1.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                      {Number(it.totalPrice).toLocaleString('vi-VN')}đ
                                    </td>
                                  </tr>
                                ))}
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
