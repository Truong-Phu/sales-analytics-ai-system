import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'

const DIFF_COLOR = (d) => d > 0 ? '#22C55E' : d < 0 ? '#EF4444' : 'var(--text-tertiary)'

function ErrorState({ message }) {
  return (
    <div className="lcard p-6 text-center text-sm" style={{ color: 'var(--text-tertiary)', border: '1px dashed var(--border)' }}>
      {message}
    </div>
  )
}

// ── Tạo phiếu chỉnh kho ──────────────────────────────────────────────────────
function CreateAdjustmentForm({ onCreated }) {
  const [products,    setProducts]    = useState([])
  const [productId,   setProductId]   = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [reason,      setReason]      = useState('')
  const [note,        setNote]        = useState('')
  const [preview,     setPreview]     = useState(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    api.get('/api/products', { params: { pageSize: 200 } })
      .then(r => setProducts(r.data?.data ?? r.data?.items ?? []))
      .catch(() => setProducts([]))
  }, [])

  const selectedProduct = products.find(p => p.productId == productId || p.product_id == productId)
  const currentStock = selectedProduct?.stockQuantity ?? selectedProduct?.stock_quantity ?? null

  const handleQtyChange = (v) => {
    setNewQuantity(v)
    if (currentStock !== null && v !== '') {
      const diff = +v - currentStock
      setPreview({ old: currentStock, new: +v, diff })
    } else {
      setPreview(null)
    }
  }

  const handleProductChange = (pid) => {
    setProductId(pid)
    setNewQuantity('')
    setPreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!productId || newQuantity === '') return
    setSubmitting(true)
    try {
      const r = await api.post('/api/stock-adjustments', {
        productId:   +productId,
        newQuantity: +newQuantity,
        reason:      reason.trim(),
        note:        note.trim() || null,
      })
      onCreated(r.data)
      setProductId('')
      setNewQuantity('')
      setReason('')
      setNote('')
      setPreview(null)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Tạo phiếu chỉnh kho thất bại.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="lcard p-5 space-y-4">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Tạo phiếu chỉnh kho mới</h2>

      {/* Product select */}
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Sản phẩm</label>
        <select value={productId} onChange={e => handleProductChange(e.target.value)}
          required className="linput w-full text-sm">
          <option value="">-- Chọn sản phẩm --</option>
          {products.map(p => (
            <option key={p.productId ?? p.product_id} value={p.productId ?? p.product_id}>
              {p.productName ?? p.product_name}
              {(p.sku) ? ` (${p.sku})` : ''}
              {' '}— Tồn: {p.stockQuantity ?? p.stock_quantity ?? '?'}
            </option>
          ))}
        </select>
      </div>

      {/* New quantity */}
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Số lượng thực tế mới</label>
        <input
          type="number" min="0" value={newQuantity}
          onChange={e => handleQtyChange(e.target.value)}
          required className="linput w-full text-sm"
          placeholder="Nhập số lượng thực tế sau kiểm kê"
        />
      </div>

      {/* Preview old → new */}
      {preview && (
        <div className="rounded-lg p-3 text-sm flex items-center gap-3 flex-wrap"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            <strong>{preview.old}</strong> → <strong>{preview.new}</strong>
          </span>
          <span className="font-bold text-base" style={{ color: DIFF_COLOR(preview.diff) }}>
            {preview.diff > 0 ? `+${preview.diff}` : preview.diff}
          </span>
          {preview.diff === 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(không thay đổi)</span>
          )}
        </div>
      )}

      {/* Reason */}
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Lý do <span style={{ color: '#EF4444' }}>*</span></label>
        <input
          type="text" value={reason}
          onChange={e => setReason(e.target.value)}
          required maxLength={255} className="linput w-full text-sm"
          placeholder="VD: Kiểm kê thực tế, hàng hỏng/mất..."
        />
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Ghi chú</label>
        <textarea
          value={note} onChange={e => setNote(e.target.value)}
          rows={2} className="linput w-full text-sm resize-none"
          placeholder="Mô tả chi tiết (tùy chọn)"
        />
      </div>

      {error && (
        <div className="text-xs p-2 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting || !productId || newQuantity === '' || !reason.trim()}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        style={{ background: 'var(--primary-500)', color: '#fff' }}>
        {submitting ? 'Đang lưu...' : 'Lưu phiếu chỉnh kho'}
      </button>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StockAdjustmentsPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [page,    setPage]    = useState(1)
  const [refresh, setRefresh] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const r = await api.get('/api/stock-adjustments', { params: { page, pageSize: 20 } })
      setData(r.data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page, refresh])

  useEffect(() => { load() }, [load])

  const handleCreated = () => {
    setPage(1)
    setRefresh(r => r + 1)
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1
  const fmt = (n) => n?.toLocaleString('vi-VN') ?? '—'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Chỉnh kho thủ công</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Điều chỉnh tồn kho sau kiểm kê thực tế — mọi thay đổi đều được ghi nhật ký
        </p>
      </div>

      {/* Form tạo mới */}
      <CreateAdjustmentForm onCreated={handleCreated} />

      {/* Danh sách phiếu */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Lịch sử chỉnh kho {data ? `(${fmt(data.total)})` : ''}
        </h2>

        {loading ? (
          <div className="lcard p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : error ? (
          <ErrorState message="Không tải được lịch sử chỉnh kho — vui lòng kiểm tra kết nối." />
        ) : !data?.items?.length ? (
          <div className="lcard p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Chưa có phiếu chỉnh kho nào.
          </div>
        ) : (
          <>
            <div className="lcard overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Thời gian','Sản phẩm','SKU','Trước','Sau','Chênh lệch','Lý do','Người thực hiện'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium whitespace-nowrap"
                        style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <tr key={item.stockAdjustmentId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(item.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                        {item.productName}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {item.sku ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>
                        {fmt(item.oldQuantity)}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {fmt(item.newQuantity)}
                      </td>
                      <td className="px-3 py-2 text-center font-bold"
                        style={{ color: DIFF_COLOR(item.difference) }}>
                        {item.difference > 0 ? `+${item.difference}` : item.difference}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }}
                        title={item.reason + (item.note ? ` — ${item.note}` : '')}>
                        {item.reason}
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {item.createdByName ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Trang {page}/{totalPages}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1 text-xs rounded border disabled:opacity-40"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    ‹ Trước
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3 py-1 text-xs rounded border disabled:opacity-40"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    Sau ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
