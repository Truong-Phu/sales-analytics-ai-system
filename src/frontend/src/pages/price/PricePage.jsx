import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getPriceIntelligence } from '../../api/aiApi'

function RecoBadge({ rec }) {
  const map = {
    INCREASE: { cls: 'bg-green-500/20 text-green-400 border border-green-500/30', label: '↑ Tăng giá' },
    DECREASE: { cls: 'bg-red-500/20 text-red-400 border border-red-500/30',       label: '↓ Giảm giá' },
    HOLD:     { cls: 'bg-gray-500/20 text-gray-400 border border-gray-600',        label: '— Giữ nguyên' },
  }
  const { cls, label } = map[rec] ?? map.HOLD
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function GapBar({ gap }) {
  const abs  = Math.min(Math.abs(gap), 30)
  const pct  = (abs / 30) * 50
  const color = gap < -15 ? '#22C55E' : gap > 10 ? '#EF4444' : '#F59E0B'
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm font-bold w-14 text-right ${gap < 0 ? 'text-green-400' : 'text-red-400'}`}>
        {gap > 0 ? '+' : ''}{gap.toFixed(1)}%
      </span>
      <div className="relative w-24 h-2 bg-gray-700 rounded-full">
        <div className="absolute top-0 left-1/2 w-px h-2 bg-gray-500" />
        <div className="absolute top-0 h-2 rounded-full"
          style={{
            width:  `${pct}%`,
            left:   gap < 0 ? `${50 - pct}%` : '50%',
            background: color,
          }}
        />
      </div>
    </div>
  )
}

const fmt = v => v >= 1e6
  ? `${(v / 1e6).toFixed(1)}M`
  : new Intl.NumberFormat('vi-VN').format(Math.round(v))

export default function PricePage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [days,    setDays]    = useState(30)
  const [filter,  setFilter]  = useState('ALL')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getPriceIntelligence({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        is_mock: true, category_filter: null, analysis_date: new Date().toISOString().slice(0, 10),
        products: [
          { product_name: 'Áo thun nam cổ tròn',  category: 'Áo nam',    our_price: 250000, market_avg: 285000, market_min: 220000, market_max: 320000, gap_pct: -12.3, recommendation: 'INCREASE', sources: ['shopee_scrape'] },
          { product_name: 'Quần jeans slim fit',   category: 'Quần nam',  our_price: 420000, market_avg: 395000, market_min: 350000, market_max: 480000, gap_pct: 6.3,   recommendation: 'HOLD',     sources: ['lazada_scrape'] },
          { product_name: 'Váy hoa mùa hè',        category: 'Váy nữ',   our_price: 380000, market_avg: 340000, market_min: 290000, market_max: 420000, gap_pct: 11.8,  recommendation: 'DECREASE', sources: ['shopee_scrape', 'lazada_scrape'] },
          { product_name: 'Áo sơ mi công sở nữ',  category: 'Áo nữ',    our_price: 310000, market_avg: 325000, market_min: 280000, market_max: 390000, gap_pct: -4.6,  recommendation: 'HOLD',     sources: ['tiktok_scrape'] },
          { product_name: 'Áo khoác denim',        category: 'Áo khoác', our_price: 680000, market_avg: 820000, market_min: 650000, market_max: 950000, gap_pct: -17.1, recommendation: 'INCREASE', sources: ['shopee_scrape'] },
          { product_name: 'Quần short thể thao',   category: 'Quần nam',  our_price: 195000, market_avg: 180000, market_min: 150000, market_max: 230000, gap_pct: 8.3,   recommendation: 'HOLD',     sources: ['lazada_scrape'] },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const products = data?.products ?? []
  const filtered = filter === 'ALL' ? products : products.filter(p => p.recommendation === filter)
  const counts   = { INCREASE: 0, DECREASE: 0, HOLD: 0 }
  products.forEach(p => { counts[p.recommendation] = (counts[p.recommendation] || 0) + 1 })

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Thông minh Giá</h1>
          <p className="text-sm text-gray-400 mt-1">So sánh giá sản phẩm với mức thị trường – gợi ý điều chỉnh</p>
        </div>
        <div className="flex gap-2">
          <select value={days} onChange={e => setDays(+e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
            {[7, 14, 30, 90].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
          <button onClick={load} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Làm mới
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Nên Tăng giá',    value: counts.INCREASE, color: 'text-green-400', sub: 'đang rẻ hơn thị trường >15%' },
          { label: 'Giữ nguyên',      value: counts.HOLD,     color: 'text-gray-300',  sub: 'giá phù hợp thị trường'     },
          { label: 'Nên Giảm giá',    value: counts.DECREASE, color: 'text-red-400',   sub: 'đang đắt hơn thị trường >10%'},
        ].map(k => (
          <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-xs text-gray-400">{k.label}</div>
            <div className={`text-3xl font-bold mt-1 ${k.color}`}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['ALL', 'INCREASE', 'HOLD', 'DECREASE'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors
              ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
            {f === 'ALL' ? 'Tất cả' : f === 'INCREASE' ? '↑ Tăng giá' : f === 'HOLD' ? '— Giữ nguyên' : '↓ Giảm giá'}
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
              <thead className="border-b border-gray-700">
                <tr className="text-gray-400 text-xs uppercase">
                  <th className="text-left p-4">Sản phẩm</th>
                  <th className="text-right p-4">Giá mình</th>
                  <th className="text-right p-4">Thị trường TB</th>
                  <th className="text-center p-4">Chênh lệch</th>
                  <th className="text-center p-4">Gợi ý</th>
                  <th className="text-left p-4">Nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filtered.map(p => (
                  <tr key={p.product_name} className="hover:bg-gray-700/30 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-white">{p.product_name}</div>
                      <div className="text-xs text-gray-400">{p.category}</div>
                    </td>
                    <td className="p-4 text-right font-semibold text-white">{fmt(p.our_price)}đ</td>
                    <td className="p-4 text-right">
                      <div className="text-gray-300">{fmt(p.market_avg)}đ</div>
                      <div className="text-xs text-gray-500">{fmt(p.market_min)} – {fmt(p.market_max)}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center">
                        <GapBar gap={p.gap_pct} />
                      </div>
                    </td>
                    <td className="p-4 text-center"><RecoBadge rec={p.recommendation} /></td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {p.sources.map(s => (
                          <span key={s} className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                            {s.replace('_scrape', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400">Không có dữ liệu</div>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3 border border-gray-700">
        💡 Giá thị trường được thu thập từ web scraping Shopee, Lazada, TikTok Shop. Cập nhật định kỳ hàng ngày.
        Khoảng giá min–max phản ánh biên độ thực tế trên thị trường trong kỳ phân tích.
      </div>
    </div>
  )
}
