import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getLeaderboard } from '../../api/aiApi'

const CATEGORIES = [
  { value: 'product',  label: 'Sản phẩm',   icon: '📦' },
  { value: 'customer', label: 'Khách hàng',  icon: '👑' },
  { value: 'channel',  label: 'Kênh bán',    icon: '🏪' },
  { value: 'staff',    label: 'Nhân viên',   icon: '🏆' },
]

const TREND_ICON = { UP: '↑', DOWN: '↓', STABLE: '→' }
const TREND_COLOR = { UP: 'text-green-400', DOWN: 'text-red-400', STABLE: 'text-gray-400' }

export default function LeaderboardPage() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [isMock,   setIsMock]   = useState(false)
  const [category, setCategory] = useState('product')
  const [days,     setDays]     = useState(30)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getLeaderboard({ category, days, top_n: 10 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      const mockData = {
        product: [
          { rank:1, name:'Áo thun nam cổ tròn',   value:45200000, value_label:'45.2 triệu VNĐ', orders:312, badge:'🥇', trend:'UP',   change_pct:12.3 },
          { rank:2, name:'Váy hoa mùa hè',          value:38700000, value_label:'38.7 triệu VNĐ', orders:265, badge:'🥈', trend:'UP',   change_pct:8.1 },
          { rank:3, name:'Giày sneaker trắng',       value:31500000, value_label:'31.5 triệu VNĐ', orders:198, badge:'🥉', trend:'STABLE',change_pct:0.5 },
          { rank:4, name:'Quần short nam',           value:25000000, value_label:'25.0 triệu VNĐ', orders:175, badge:'',   trend:'DOWN', change_pct:-5.2 },
          { rank:5, name:'Balo thời trang',          value:18300000, value_label:'18.3 triệu VNĐ', orders:92,  badge:'',   trend:'UP',   change_pct:22.0 },
        ],
      }[category] ?? []
      setData({ category, period_label:`${days} ngày gần nhất`, analysis_days:days, entries:mockData, total_revenue:mockData.reduce((s,e)=>s+e.value,0), is_mock:true })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [category, days])

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bảng Xếp hạng Hiệu suất</h1>
          <p className="text-sm text-gray-400 mt-1">Top performers – so sánh với kỳ trước</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
          {[7,14,30,90].map(d => <option key={d} value={d}>{d} ngày</option>)}
        </select>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2">
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all
              ${category === c.value ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-gray-400 hover:border-blue-500'}`}>
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Đang tải...</div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-400">{data?.period_label}</span>
            <span className="text-sm text-gray-300">Tổng: <strong className="text-white">{((data?.total_revenue ?? 0)/1e6).toFixed(1)}M VNĐ</strong></span>
          </div>

          {/* Entries */}
          <div className="divide-y divide-gray-700/50">
            {(data?.entries ?? []).map((entry, i) => (
              <div key={entry.rank} className={`p-4 flex items-center gap-4 hover:bg-gray-700/30 transition-colors
                ${i === 0 ? 'bg-yellow-900/10' : ''}`}>
                {/* Rank */}
                <div className="w-8 text-center">
                  {entry.badge ? (
                    <span className="text-2xl">{entry.badge}</span>
                  ) : (
                    <span className="text-gray-500 font-bold text-lg">#{entry.rank}</span>
                  )}
                </div>

                {/* Bar */}
                <div className="flex-1">
                  <div className="font-semibold text-white">{entry.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-700">
                      <div className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.round(entry.value / (data?.entries?.[0]?.value ?? 1) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{entry.orders} đơn</span>
                  </div>
                </div>

                {/* Value */}
                <div className="text-right">
                  <div className="font-bold text-white">{entry.value_label}</div>
                  <div className={`text-xs ${TREND_COLOR[entry.trend]}`}>
                    {TREND_ICON[entry.trend]} {Math.abs(entry.change_pct).toFixed(1)}%
                    {entry.trend === 'UP' ? ' tăng' : entry.trend === 'DOWN' ? ' giảm' : ' ổn định'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
