import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import MockDataButton from '../../components/ui/MockDataButton'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getLeaderboard } from '../../api/aiApi'

const MOCK_ENTRIES = {
  product: [
    { rank:1, name:'Áo thun nam cổ tròn', value:45200000, value_label:'45.2 triệu VNĐ', orders:312, badge:'🥇', trend:'UP',     change_pct:12.3 },
    { rank:2, name:'Váy hoa mùa hè',       value:38700000, value_label:'38.7 triệu VNĐ', orders:265, badge:'🥈', trend:'UP',     change_pct:8.1  },
    { rank:3, name:'Giày sneaker trắng',    value:31500000, value_label:'31.5 triệu VNĐ', orders:198, badge:'🥉', trend:'STABLE', change_pct:0.5  },
    { rank:4, name:'Quần short nam',        value:25000000, value_label:'25.0 triệu VNĐ', orders:175, badge:'',   trend:'DOWN',   change_pct:-5.2 },
    { rank:5, name:'Balo thời trang',       value:18300000, value_label:'18.3 triệu VNĐ', orders:92,  badge:'',   trend:'UP',     change_pct:22.0 },
  ],
}

const CATEGORIES = [
  { value: 'product',  label: 'Sản phẩm',   icon: '📦' },
  { value: 'customer', label: 'Khách hàng',  icon: '👑' },
  { value: 'channel',  label: 'Kênh bán',    icon: '🏪' },
  { value: 'staff',    label: 'Nhân viên',   icon: '🏆' },
]

const TREND_ICON  = { UP: '↑', DOWN: '↓', STABLE: '→' }
const TREND_COLOR = { UP: '#22C55E', DOWN: '#EF4444', STABLE: 'var(--text-tertiary)' }

export default function LeaderboardPage() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [isMock,      setIsMock]      = useState(false)
  const [showMockBtn, setShowMockBtn] = useState(false)
  const [category,    setCategory]    = useState('product')
  const [days,        setDays]        = useState(30)

  const load = async () => {
    setLoading(true)
    setShowMockBtn(false)
    try {
      const res = await getLeaderboard({ category, days, top_n: 10 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
      setShowMockBtn(true)
    } finally { setLoading(false) }
  }

  const loadMock = () => {
    const entries = MOCK_ENTRIES[category] ?? []
    setData({ category, period_label:`${days} ngày gần nhất`, analysis_days:days, entries, total_revenue:entries.reduce((s,e)=>s+e.value,0), is_mock:true })
    setIsMock(true)
    setShowMockBtn(false)
  }

  useEffect(() => { load() }, [category, days])

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <MockDataButton show={showMockBtn} onClick={loadMock} />
      {!data && !loading && <AiEmptyState title="Chưa đủ dữ liệu bảng xếp hạng" />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Bảng Xếp hạng Hiệu suất</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Top performers – so sánh với kỳ trước</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 120 }}>
          {[7,14,30,90].map(d => <option key={d} value={d}>{d} ngày</option>)}
        </select>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
            style={category === c.value
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="lcard p-12 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <div className="lcard overflow-hidden">
          {/* Sub-header */}
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{data?.period_label}</span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Tổng: <strong style={{ color: 'var(--text-primary)' }}>{((data?.total_revenue ?? 0)/1e6).toFixed(1)}M VNĐ</strong>
            </span>
          </div>

          {/* Entries */}
          <div>
            {(data?.entries ?? []).map((entry, i) => (
              <div key={entry.rank}
                className="px-5 py-4 flex items-center gap-4 transition-colors"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent'}>

                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {entry.badge ? (
                    <span className="text-2xl">{entry.badge}</span>
                  ) : (
                    <span className="font-bold text-lg" style={{ color: 'var(--text-tertiary)' }}>#{entry.rank}</span>
                  )}
                </div>

                {/* Bar */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.name}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)', maxWidth: 200 }}>
                      <div className="h-full rounded-full" style={{
                        width: `${Math.round(entry.value / (data?.entries?.[0]?.value ?? 1) * 100)}%`,
                        background: 'var(--primary-500)',
                      }} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{entry.orders} đơn</span>
                  </div>
                </div>

                {/* Value + Trend */}
                <div className="text-right shrink-0">
                  <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{entry.value_label}</div>
                  <div className="text-xs" style={{ color: TREND_COLOR[entry.trend] }}>
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
