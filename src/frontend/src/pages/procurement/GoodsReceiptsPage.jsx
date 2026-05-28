import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import MockToast from '../../components/ui/MockToast'

function CreateReceiptModal({ onClose, onSaved }) {
  const [approvedPOs, setApprovedPOs] = useState([])
  const [selectedPO,  setSelectedPO]  = useState(null)
  const [poId,        setPoId]         = useState('')
  const [poItems,     setPoItems]      = useState([])
  const [note,        setNote]         = useState('')
  const [receiveQtys, setReceiveQtys]  = useState({}) // poiId → qty
  const [loading,     setLoading]      = useState(false)
  const [err,         setErr]          = useState('')

  useEffect(() => {
    api.get('/api/purchase-orders', { params: { pageSize: 100 } })
       .then(r => setApprovedPOs((r.data.items ?? []).filter(p => ['APPROVED','PARTIALLY_RECEIVED'].includes(p.status))))
       .catch(() => {})
  }, [])

  const loadPODetails = async (id) => {
    if (!id) { setSelectedPO(null); setPoItems([]); return }
    try {
      const res = await api.get(`/api/purchase-orders/${id}`)
      setSelectedPO(res.data.order)
      const its = res.data.items ?? []
      setPoItems(its)
      const initQtys = {}
      its.forEach(i => { initQtys[i.purchaseOrderItemId] = i.remainingQuantity })
      setReceiveQtys(initQtys)
    } catch { setErr('Không tải được chi tiết phiếu nhập.') }
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
      await api.post('/api/goods-receipts', {
        purchaseOrderId: Number(poId),
        note: note || null,
        items,
      })
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
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Tạo phiếu nhập kho</h2>

        {err && <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</div>}

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Phiếu nhập hàng đã duyệt *</label>
          <select value={poId}
            onChange={e => { setPoId(e.target.value); loadPODetails(e.target.value) }}
            className="w-full text-sm rounded-lg border px-3 py-1.5"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <option value="">-- Chọn phiếu nhập --</option>
            {approvedPOs.map(p => (
              <option key={p.purchaseOrderId} value={p.purchaseOrderId}>
                {p.purchaseCode} — {p.supplierName}
              </option>
            ))}
          </select>
        </div>

        {poItems.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Số lượng thực nhận (còn lại)
            </p>
            <div className="space-y-2">
              {poItems.map(item => (
                <div key={item.purchaseOrderItemId} className="flex items-center gap-3">
                  <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{item.productName}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Còn {item.remainingQuantity}
                  </span>
                  <input
                    type="number" min="0" max={item.remainingQuantity}
                    value={receiveQtys[item.purchaseOrderItemId] ?? 0}
                    onChange={e => setReceiveQtys(q => ({ ...q, [item.purchaseOrderItemId]: e.target.value }))}
                    className="w-20 text-sm rounded-lg border px-2 py-1.5 text-center"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

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

export default function GoodsReceiptsPage() {
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [isMock,     setIsMock]     = useState(false)
  const [showCreate, setShowCreate] = useState(false)

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
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setIsMock(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(1) }, [load])

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <div className="p-4 md:p-6 space-y-4">
      {isMock && <MockToast />}
      {showCreate && <CreateReceiptModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(1) }} />}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Phiếu nhập kho</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Lịch sử nhận hàng thực tế ({total} phiếu)
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg text-sm text-white font-medium"
          style={{ background: 'var(--primary-500)' }}>
          + Nhập kho
        </button>
      </div>

      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>Chưa có phiếu nhập kho nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Mã phiếu NK', 'Phiếu nhập hàng', 'Nhà cung cấp', 'Tổng SL', 'Tổng tiền', 'Thời gian', 'Người tạo'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((gr, i) => (
                <tr key={gr.goodsReceiptId}
                    style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{gr.receiptCode}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{gr.purchaseCode}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{gr.supplierName}</td>
                  <td className="px-4 py-3 tabular-nums text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {gr.totalQuantity}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {Number(gr.totalAmount).toLocaleString('vi-VN')}đ
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{fmtDate(gr.createdAt)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{gr.createdByName ?? '—'}</td>
                </tr>
              ))}
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
