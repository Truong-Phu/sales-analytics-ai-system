import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getInventoryIntelligence } from '../../api/aiApi'

const STATUS_CONFIG = {
  CRITICAL:    { color: 'text-red-400',    bg: 'bg-red-900/20',    border: 'border-red-500/30',    icon: '🔴', label: 'Khẩn cấp' },
  WARNING:     { color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-500/30', icon: '🟡', label: 'Sắp hết' },
  OUT_OF_STOCK:{ color: 'text-red-500',    bg: 'bg-red-900/30',    border: 'border-red-600/40',    icon: '⛔', label: 'Hết hàng' },
  OK:          { color: 'text-green-400',  bg: 'bg-green-900/20',  border: 'border-green-500/30',  icon: '🟢', label: 'Bình thường' },
  OVERSTOCK:   { color: 'text-blue-400',   bg: 'bg-blue-900/20',   border: 'border-blue-500/30',   icon: '🔵', label: 'Dư hàng' },
  NO_SALES:    { color: 'text-gray-400',   bg: 'bg-gray-800',      border: 'border-gray-600',      icon: '⚪', label: 'Không có đơn' },
}

export default function InventoryPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [filter,  setFilter]  = useState('ALL')
  const [days,    setDays]    = useState(30)

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

  const filtered = (data?.items ?? []).filter(i => filter === 'ALL' || i.status === filter)

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Thông minh Tồn kho</h1>
          <p className="text-sm text-gray-400 mt-1">Dự báo ngày hết hàng và gợi ý đặt thêm</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={30}>30 ngày</option>
          <option value={60}>60 ngày</option>
          <option value={90}>90 ngày</option>
        </select>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: '⛔ Hết / Sắp hết', value: data.critical_count + data.warning_count, color: 'text-red-400' },
            { label: '🔴 Khẩn cấp',       value: data.critical_count,  color: 'text-red-400' },
            { label: '🟡 Sắp hết',         value: data.warning_count,   color: 'text-yellow-400' },
            { label: '🔵 Dư hàng',         value: data.overstock_count, color: 'text-blue-400' },
          ].map(k => (
            <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-xs text-gray-400">{k.label}</div>
              <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL','CRITICAL','WARNING','OK','OVERSTOCK'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
              ${filter === f ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-400 hover:border-blue-500'}`}>
            {f === 'ALL' ? 'Tất cả' : STATUS_CONFIG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="p-8 text-center text-gray-400">Đang phân tích...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.OK
            return (
              <div key={item.product_id}
                className={`rounded-xl p-4 border ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{cfg.icon}</span>
                      <span className="font-semibold text-white">{item.product_name}</span>
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{item.message}</p>
                  </div>
                  <div className="flex gap-4 text-right text-sm flex-shrink-0">
                    <div>
                      <div className="text-xs text-gray-400">Tồn kho</div>
                      <div className={`font-bold ${cfg.color}`}>{item.current_stock}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Bán/ngày</div>
                      <div className="font-bold text-white">{item.avg_daily_sales}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Còn lại</div>
                      <div className={`font-bold ${cfg.color}`}>
                        {item.days_until_stockout >= 999 ? '∞' : `${item.days_until_stockout}d`}
                      </div>
                    </div>
                    {item.reorder_qty > 0 && (
                      <div>
                        <div className="text-xs text-gray-400">Cần đặt</div>
                        <div className="font-bold text-orange-400">{item.reorder_qty}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {data && <div className="text-xs text-gray-500">{data.note}</div>}
    </div>
  )
}
