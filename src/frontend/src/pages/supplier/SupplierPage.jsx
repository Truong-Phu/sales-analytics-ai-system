import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getSupplierPerformance } from '../../api/aiApi'

function StatusBadge({ status }) {
  const map = {
    GOOD:     'bg-green-500/20 text-green-400 border border-green-500/30',
    WARNING:  'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  }
  const label = { GOOD: 'Tốt', WARNING: 'Cảnh báo', CRITICAL: 'Nguy hiểm' }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.WARNING}`}>
      {label[status] ?? status}
    </span>
  )
}

function QualityStars({ score }) {
  const full = Math.floor(score)
  const half = score - full >= 0.5
  return (
    <span className="text-yellow-400 text-sm">
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
      <span className="text-gray-400 text-xs ml-1">{score.toFixed(1)}</span>
    </span>
  )
}

export default function SupplierPage() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [isMock,   setIsMock]   = useState(false)
  const [days,     setDays]     = useState(90)
  const [filter,   setFilter]   = useState('ALL')
  const [sortBy,   setSortBy]   = useState('on_time_rate')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getSupplierPerformance({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        is_mock: true, days_analyzed: days,
        suppliers: [
          { supplier_name: 'Nhà máy Dệt may Phong Phú',    total_deliveries: 48, on_time_deliveries: 44, on_time_rate: 0.917, avg_lead_days: 3.2, late_deliveries: 4,  total_quantity: 2400, total_value: 182_000_000, quality_score: 4.5, status: 'GOOD'     },
          { supplier_name: 'Công ty TNHH Thời Trang Việt', total_deliveries: 35, on_time_deliveries: 28, on_time_rate: 0.800, avg_lead_days: 5.1, late_deliveries: 7,  total_quantity: 1750, total_value: 124_000_000, quality_score: 3.8, status: 'WARNING'  },
          { supplier_name: 'XNK Hoàng Gia Fashion',        total_deliveries: 22, on_time_deliveries: 14, on_time_rate: 0.636, avg_lead_days: 8.4, late_deliveries: 8,  total_quantity: 880,  total_value: 67_000_000,  quality_score: 2.9, status: 'CRITICAL' },
          { supplier_name: 'Dệt may Thành Công',           total_deliveries: 31, on_time_deliveries: 30, on_time_rate: 0.968, avg_lead_days: 2.8, late_deliveries: 1,  total_quantity: 1550, total_value: 98_000_000,  quality_score: 4.8, status: 'GOOD'     },
          { supplier_name: 'Công ty CP May Sơn Nam',       total_deliveries: 18, on_time_deliveries: 15, on_time_rate: 0.833, avg_lead_days: 4.7, late_deliveries: 3,  total_quantity: 720,  total_value: 51_000_000,  quality_score: 4.1, status: 'GOOD'     },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const suppliers = data?.suppliers ?? []
  const filtered  = filter === 'ALL' ? suppliers : suppliers.filter(s => s.status === filter)
  const sorted    = [...filtered].sort((a, b) => {
    if (sortBy === 'on_time_rate') return b.on_time_rate - a.on_time_rate
    if (sortBy === 'avg_lead_days') return a.avg_lead_days - b.avg_lead_days
    if (sortBy === 'total_value') return b.total_value - a.total_value
    return 0
  })

  const counts = { GOOD: 0, WARNING: 0, CRITICAL: 0 }
  suppliers.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })
  const avgOnTime = suppliers.length ? suppliers.reduce((s, r) => s + r.on_time_rate, 0) / suppliers.length : 0
  const worst = suppliers.reduce((w, s) => (!w || s.on_time_rate < w.on_time_rate) ? s : w, null)

  const fmt = v => v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toLocaleString()

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Hiệu suất Nhà cung cấp</h1>
          <p className="text-sm text-gray-400 mt-1">Tỷ lệ giao đúng hạn, thời gian lead time và chất lượng</p>
        </div>
        <div className="flex gap-2">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
            <option value="on_time_rate">Sắp xếp: Đúng hạn</option>
            <option value="avg_lead_days">Sắp xếp: Lead time</option>
            <option value="total_value">Sắp xếp: Giá trị</option>
          </select>
          <select value={days} onChange={e => setDays(+e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
            {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
          <button onClick={load} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Làm mới
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Tổng NCC',          value: suppliers.length,           color: 'text-blue-400' },
          { label: 'TB Đúng hạn',       value: `${(avgOnTime * 100).toFixed(1)}%`, color: avgOnTime >= 0.85 ? 'text-green-400' : 'text-yellow-400' },
          { label: 'NCC Tốt',           value: counts.GOOD,                color: 'text-green-400' },
          { label: 'Cần chú ý',         value: counts.WARNING + counts.CRITICAL, color: counts.WARNING + counts.CRITICAL > 0 ? 'text-red-400' : 'text-gray-400' },
        ].map(k => (
          <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['ALL', 'GOOD', 'WARNING', 'CRITICAL'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors
              ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
            {f === 'ALL' ? 'Tất cả' : f === 'GOOD' ? 'Tốt' : f === 'WARNING' ? 'Cảnh báo' : 'Nguy hiểm'}
            {f !== 'ALL' && <span className="ml-1 text-xs opacity-70">({counts[f] ?? 0})</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-750 border-b border-gray-700">
                <tr className="text-gray-400 text-xs uppercase">
                  <th className="text-left p-4">Nhà cung cấp</th>
                  <th className="text-center p-4">Trạng thái</th>
                  <th className="text-center p-4">Đúng hạn</th>
                  <th className="text-center p-4">Lead time</th>
                  <th className="text-center p-4">Tổng giao</th>
                  <th className="text-center p-4">Chất lượng</th>
                  <th className="text-right p-4">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {sorted.map(s => (
                  <tr key={s.supplier_name} className="hover:bg-gray-700/30 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-white">{s.supplier_name}</div>
                      <div className="text-xs text-gray-400">{s.late_deliveries} lần trễ / {s.total_deliveries} lần giao</div>
                    </td>
                    <td className="p-4 text-center"><StatusBadge status={s.status} /></td>
                    <td className="p-4">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`font-bold ${s.on_time_rate >= 0.85 ? 'text-green-400' : s.on_time_rate >= 0.70 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {(s.on_time_rate * 100).toFixed(1)}%
                        </span>
                        <div className="w-20 h-1.5 bg-gray-700 rounded-full">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${s.on_time_rate * 100}%`, background: s.on_time_rate >= 0.85 ? '#22C55E' : s.on_time_rate >= 0.70 ? '#F59E0B' : '#EF4444' }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center text-gray-300">{s.avg_lead_days.toFixed(1)} ngày</td>
                    <td className="p-4 text-center text-gray-300">{s.total_quantity.toLocaleString()}</td>
                    <td className="p-4 text-center"><QualityStars score={s.quality_score} /></td>
                    <td className="p-4 text-right font-medium text-white">{fmt(s.total_value)} VNĐ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <div className="text-center py-8 text-gray-400">Không có dữ liệu</div>
          )}
        </div>
      )}

      {/* Worst supplier alert */}
      {worst && worst.status === 'CRITICAL' && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-sm text-red-200">
          ⚠️ <strong>{worst.supplier_name}</strong> có tỷ lệ đúng hạn thấp ({(worst.on_time_rate * 100).toFixed(0)}%) —
          cân nhắc đánh giá lại hợp đồng hoặc tìm nhà cung cấp thay thế.
        </div>
      )}
    </div>
  )
}
