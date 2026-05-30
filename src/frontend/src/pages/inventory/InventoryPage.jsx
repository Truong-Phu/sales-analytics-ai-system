import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MockToast from '../../components/ui/MockToast'
import { getInventoryIntelligence } from '../../api/aiApi'
import api from '../../api/axios'

const STATUS_CONFIG = {
  CRITICAL:    { textColor: '#EF4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: '🔴', label: 'Khẩn cấp' },
  WARNING:     { textColor: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '🟡', label: 'Sắp hết' },
  OUT_OF_STOCK:{ textColor: '#EF4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.30)',  icon: '⛔', label: 'Hết hàng' },
  OK:          { textColor: '#22C55E', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  icon: '🟢', label: 'Bình thường' },
  OVERSTOCK:   { textColor: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', icon: '🔵', label: 'Dư hàng' },
  NO_SALES:    { textColor: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', border: 'var(--border)', icon: '⚪', label: 'Không có đơn' },
}

export default function InventoryPage() {
  const navigate = useNavigate()
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [isMock,       setIsMock]       = useState(false)
  const [filter,       setFilter]       = useState('ALL')
  const [days,         setDays]         = useState(30)
  const [expandedIds,  setExpandedIds]  = useState(new Set())
  const [varCache,     setVarCache]     = useState({})
  const [varLoading,   setVarLoading]   = useState(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const res = await getInventoryIntelligence({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        total_products: 4, critical_count: 1, warning_count: 1, ok_count: 1, overstock_count: 1,
        analysis_days: 30, is_mock: true, note: 'Đang dùng dữ liệu mẫu',
        items: [
          { product_id:'P001', product_name:'Áo thun nam cổ tròn',  current_stock:12, avg_daily_sales:3.2, days_until_stockout:3.8,   status:'CRITICAL',  reorder_qty:86,  reorder_urgency:'IMMEDIATE', message:'Còn 4 ngày hết hàng – Đặt ngay 86 đơn vị!' },
          { product_id:'P002', product_name:'Váy hoa mùa hè',       current_stock:28, avg_daily_sales:2.1, days_until_stockout:13.3,  status:'WARNING',   reorder_qty:35,  reorder_urgency:'SOON',      message:'Sắp hết trong 13 ngày – Lên kế hoạch đặt thêm 35 đơn vị' },
          { product_id:'P003', product_name:'Giày sneaker trắng',   current_stock:85, avg_daily_sales:1.5, days_until_stockout:56.7,  status:'OK',        reorder_qty:0,   reorder_urgency:'LATER',     message:'Tình trạng bình thường (57 ngày còn hàng)' },
          { product_id:'P004', product_name:'Khẩu trang vải',       current_stock:340,avg_daily_sales:0.8, days_until_stockout:425.0, status:'OVERSTOCK', reorder_qty:0,   reorder_urgency:'NONE',      message:'Tồn kho nhiều – Xem xét khuyến mãi để giải phóng hàng' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const toggleVariations = async (productId) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) { next.delete(productId); return next }
      next.add(productId)
      return next
    })
    if (varCache[productId] !== undefined) return
    setVarLoading(prev => new Set(prev).add(productId))
    try {
      const r = await api.get(`/api/products/${productId}/variations`)
      setVarCache(c => ({ ...c, [productId]: r.data ?? [] }))
    } catch {
      setVarCache(c => ({ ...c, [productId]: [] }))
    } finally {
      setVarLoading(prev => { const s = new Set(prev); s.delete(productId); return s })
    }
  }

  const filtered = (data?.items ?? []).filter(i => filter === 'ALL' || i.status === filter)

  return (
    <div className="space-y-5">
      {isMock && <MockToast />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Thông minh Tồn kho</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Dự báo ngày hết hàng và gợi ý đặt thêm</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/inventory/dashboard"
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Dashboard vận hành →
          </Link>
          <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 120 }}>
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={30}>30 ngày</option>
          <option value={60}>60 ngày</option>
          <option value={90}>90 ngày</option>
        </select>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '⛔ Hết / Sắp hết', value: data.critical_count + data.warning_count, color: '#EF4444' },
            { label: '🔴 Khẩn cấp',       value: data.critical_count,  color: '#EF4444' },
            { label: '🟡 Sắp hết',         value: data.warning_count,   color: '#F59E0B' },
            { label: '🔵 Dư hàng',         value: data.overstock_count, color: '#3B82F6' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL','CRITICAL','WARNING','OK','OVERSTOCK'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={filter === f
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}>
            {f === 'ALL' ? 'Tất cả' : STATUS_CONFIG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cfg        = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.OK
            const isExpanded = expandedIds.has(item.product_id)
            const vars       = varCache[item.product_id]
            const isVarLoading = varLoading.has(item.product_id)
            return (
              <div key={item.product_id} className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${cfg.border}` }}>
                <div className="p-4" style={{ background: cfg.bg }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{cfg.icon}</span>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.product_name}</span>
                        <span className="text-xs font-medium" style={{ color: cfg.textColor }}>{cfg.label}</span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.message}</p>
                    </div>
                    <div className="flex items-center gap-4 text-right text-sm shrink-0">
                      {[
                        { label: 'Tồn kho', value: item.current_stock, colored: true },
                        { label: 'Bán/ngày', value: item.avg_daily_sales },
                        { label: 'Còn lại', value: item.days_until_stockout >= 999 ? '∞' : `${item.days_until_stockout}d`, colored: true },
                        ...(item.reorder_qty > 0 ? [{ label: 'Cần đặt', value: item.reorder_qty, special: '#F97316' }] : []),
                      ].map((col, ci) => (
                        <div key={ci}>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{col.label}</div>
                          <div className="font-bold" style={{ color: col.special ?? (col.colored ? cfg.textColor : 'var(--text-primary)') }}>
                            {col.value}
                          </div>
                        </div>
                      ))}
                      {item.reorder_qty > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => navigate(`/stock-adjustments?productId=${item.product_id}`)}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap flex items-center gap-1"
                            style={{ background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)' }}>
                            <span style={{ fontSize: 12 }}>↑</span> Nhập kho
                          </button>
                          <button
                            onClick={() => navigate(`/purchase-orders?productId=${item.product_id}&productName=${encodeURIComponent(item.product_name)}`)}
                            className="text-xs px-2 py-1.5 rounded-lg whitespace-nowrap"
                            style={{ background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}
                            title="Tạo phiếu đặt hàng nhà cung cấp">
                            Đặt hàng NCC
                          </button>
                        </div>
                      )}
                      {!isMock && (
                        <button
                          onClick={() => toggleVariations(item.product_id)}
                          className="text-xs px-2 py-1.5 rounded-lg font-medium"
                          style={{ background: 'rgba(100,116,139,0.12)', color: 'var(--text-secondary)', border: '1px solid rgba(100,116,139,0.2)' }}>
                          <span className="icon text-sm" style={{ display: 'block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                            chevron_right
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-rows biến thể */}
                {isExpanded && (
                  <div style={{ background: 'var(--bg-elevated)', borderTop: `1px solid ${cfg.border}` }}>
                    {isVarLoading ? (
                      <div className="px-6 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>Đang tải biến thể...</div>
                    ) : !vars || vars.length === 0 ? (
                      <div className="px-6 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>Sản phẩm không có biến thể</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {['SKU', 'Màu', 'Size', 'Tồn kho'].map(h => (
                              <th key={h} className="px-6 py-2 text-left font-medium"
                                  style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vars.map(v => (
                            <tr key={v.variationId} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="px-6 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{v.sku ?? '—'}</td>
                              <td className="px-6 py-2" style={{ color: 'var(--text-primary)' }}>{v.color ?? '—'}</td>
                              <td className="px-6 py-2" style={{ color: 'var(--text-primary)' }}>{v.size ?? '—'}</td>
                              <td className="px-6 py-2 font-semibold"
                                  style={{ color: (v.stockQuantity ?? 0) === 0 ? '#EF4444' : 'var(--text-primary)' }}>
                                {v.stockQuantity ?? 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {data && <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{data.note}</div>}
    </div>
  )
}
