import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getPriceIntelligence } from '../../api/aiApi'

function RecoBadge({ rec }) {
  const map = {
    INCREASE: { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.30)',   color: '#22C55E', label: '↑ Tăng giá'   },
    DECREASE: { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   color: '#EF4444', label: '↓ Giảm giá'   },
    HOLD:     { bg: 'var(--bg-elevated)',      border: 'var(--border)',           color: 'var(--text-tertiary)', label: '— Giữ nguyên' },
  }
  const s = map[rec] ?? map.HOLD
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
    </span>
  )
}

function GapBar({ gap }) {
  const abs   = Math.min(Math.abs(gap), 30)
  const pct   = (abs / 30) * 50
  const color = gap < -15 ? '#22C55E' : gap > 10 ? '#EF4444' : '#F59E0B'
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold w-14 text-right" style={{ color: gap < 0 ? '#22C55E' : '#EF4444' }}>
        {gap > 0 ? '+' : ''}{gap.toFixed(1)}%
      </span>
      <div className="relative w-24 h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="absolute top-0 left-1/2 w-px h-2" style={{ background: 'var(--border)' }} />
        <div className="absolute top-0 h-2 rounded-full"
          style={{ width: `${pct}%`, left: gap < 0 ? `${50 - pct}%` : '50%', background: color }} />
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
    <div className="space-y-5">
      {isMock && <MockToast />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Thông minh Giá</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>So sánh giá sản phẩm với mức thị trường – gợi ý điều chỉnh</p>
        </div>
        <div className="flex gap-2">
          <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 110 }}>
            {[7, 14, 30, 90].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
          <button onClick={load} className="lbtn lbtn-primary text-sm">Làm mới</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Nên Tăng giá',  value: counts.INCREASE, color: '#22C55E', sub: 'đang rẻ hơn thị trường >15%' },
          { label: 'Giữ nguyên',    value: counts.HOLD,     color: 'var(--text-secondary)', sub: 'giá phù hợp thị trường' },
          { label: 'Nên Giảm giá',  value: counts.DECREASE, color: '#EF4444', sub: 'đang đắt hơn thị trường >10%' },
        ].map(k => (
          <div key={k.label} className="lcard p-4">
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
            <div className="text-3xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL', 'INCREASE', 'HOLD', 'DECREASE'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
            style={filter === f
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {f === 'ALL' ? 'Tất cả' : f === 'INCREASE' ? '↑ Tăng giá' : f === 'HOLD' ? '— Giữ nguyên' : '↓ Giảm giá'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <div className="lcard overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {['Sản phẩm','Giá mình','Thị trường TB','Chênh lệch','Gợi ý','Nguồn'].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.product_name} style={{ borderBottom: '1px solid var(--border)' }}
                    className="transition-colors"
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-4">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{p.product_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.category}</div>
                    </td>
                    <td className="p-4 font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(p.our_price)}đ</td>
                    <td className="p-4">
                      <div style={{ color: 'var(--text-secondary)' }}>{fmt(p.market_avg)}đ</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{fmt(p.market_min)} – {fmt(p.market_max)}</div>
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
                          <span key={s} className="px-1.5 py-0.5 rounded text-xs"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
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
            <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Không có dữ liệu</div>
          )}
        </div>
      )}

      <div className="lcard p-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        💡 Giá thị trường được thu thập từ web scraping Shopee, Lazada, TikTok Shop. Cập nhật định kỳ hàng ngày.
        Khoảng giá min–max phản ánh biên độ thực tế trên thị trường trong kỳ phân tích.
      </div>
    </div>
  )
}
