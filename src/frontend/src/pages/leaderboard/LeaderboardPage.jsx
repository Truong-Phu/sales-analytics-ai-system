import { useState, useEffect } from 'react'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getLeaderboard } from '../../api/aiApi'

const CATEGORIES = [
  { value: 'product',  label: 'Sản phẩm',  icon: '📦' },
  { value: 'customer', label: 'Khách hàng', icon: '👑' },
  { value: 'channel',  label: 'Kênh bán',   icon: '🏪' },
  { value: 'staff',    label: 'Nhân viên',  icon: '🏆' },
]

// Sub-tabs chỉ hiện khi category = 'staff'
const STAFF_SUBTABS = [
  { value: 'staff',           label: 'Bán hàng', icon: 'storefront',   unit: 'đơn offline' },
  { value: 'staff_warehouse', label: 'Kho',       icon: 'warehouse',    unit: 'phiếu nhập'  },
  { value: 'staff_marketing', label: 'Marketing', icon: 'campaign',     unit: 'tháng chi phí' },
]

const TIME_FILTERS = [
  { value: 'all',        label: 'Tất cả' },
  { value: 'this_month', label: 'Tháng này' },
  { value: 'last_month', label: 'Tháng trước' },
  { value: 'days_30',    label: '30 ngày' },
  { value: 'days_90',    label: '90 ngày' },
  { value: 'custom',     label: 'Tùy chỉnh' },
]

const TREND_ICON  = { UP: '↑', DOWN: '↓', STABLE: '→' }
const TREND_COLOR = { UP: '#22C55E', DOWN: '#EF4444', STABLE: 'var(--text-tertiary)' }

function buildApiParams(mode, customStart, customEnd, category) {
  const today    = new Date()
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().split('T')[0]
  const base     = { category, top_n: 10 }
  switch (mode) {
    case 'all':
      return { ...base, start_date: '2020-01-01', end_date: tomorrow }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      return { ...base, start_date: start, end_date: tomorrow }
    }
    case 'last_month': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1)
      const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return { ...base, start_date: firstLast.toISOString().split('T')[0], end_date: firstThis.toISOString().split('T')[0] }
    }
    case 'days_90':
      return { ...base, days: 90 }
    case 'custom': {
      if (!customStart || !customEnd) return { ...base, days: 30 }
      const endExcl = new Date(new Date(customEnd).getTime() + 86400000).toISOString().split('T')[0]
      return { ...base, start_date: customStart, end_date: endExcl }
    }
    default: // days_30
      return { ...base, days: 30 }
  }
}

export default function LeaderboardPage() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [category,    setCategory]    = useState('product')
  const [staffTab,    setStaffTab]    = useState('staff')   // sub-tab khi category=staff
  const [timeMode,    setTimeMode]    = useState('days_30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd,   setCustomEnd]   = useState('')

  // Category thực sự gửi lên API
  const apiCategory = category === 'staff' ? staffTab : category

  const activeSubtab = STAFF_SUBTABS.find(t => t.value === staffTab) ?? STAFF_SUBTABS[0]

  const load = async () => {
    if (timeMode === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    try {
      const params = buildApiParams(timeMode, customStart, customEnd, apiCategory)
      const res = await getLeaderboard(params)
      setData(res)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [apiCategory, timeMode, customStart, customEnd])

  const hasData = data && (data.entries ?? []).length > 0

  // Label đơn vị đếm theo loại leaderboard
  const orderUnit = category !== 'staff' ? 'đơn'
    : activeSubtab.unit

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Bảng Xếp hạng Hiệu suất</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Top performers – so sánh với kỳ trước</p>
        </div>
        {/* Time filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {TIME_FILTERS.map(f => (
            <button key={f.value} onClick={() => setTimeMode(f.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={timeMode === f.value
                ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
                : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {timeMode === 'custom' && (
        <div className="lcard p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Từ</span>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="linput text-sm" style={{ width: 150 }} />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>đến</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="linput text-sm" style={{ width: 150 }} />
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.value}
            onClick={() => { setCategory(c.value); if (c.value !== 'staff') setStaffTab('staff') }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
            style={category === c.value
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {/* Staff sub-tabs — chỉ hiện khi category = staff */}
      {category === 'staff' && (
        <div className="flex gap-0 px-1"
             style={{ borderBottom: '1px solid var(--border)' }}>
          {STAFF_SUBTABS.map(t => (
            <button key={t.value}
              onClick={() => setStaffTab(t.value)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                borderBottom: `2px solid ${staffTab === t.value ? 'var(--primary-500)' : 'transparent'}`,
                color: staffTab === t.value ? 'var(--primary-500)' : 'var(--text-secondary)',
                marginBottom: -1,
              }}>
              <span className="icon" style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="lcard p-12 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : hasData ? (
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
                  {entry.badge
                    ? <span className="text-2xl">{entry.badge}</span>
                    : <span className="font-bold text-lg" style={{ color: 'var(--text-tertiary)' }}>#{entry.rank}</span>
                  }
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
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {entry.orders} {orderUnit}
                    </span>
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
      ) : (
        <AiEmptyState
          title="Chưa đủ dữ liệu bảng xếp hạng"
          desc={
            category === 'staff' && staffTab === 'staff'
              ? 'Chưa có đơn bán tại quầy trong kỳ này. Thử chọn khoảng thời gian rộng hơn.'
              : category === 'staff' && staffTab === 'staff_warehouse'
              ? 'Chưa có phiếu nhập kho trong kỳ này. Thử chọn khoảng thời gian rộng hơn.'
              : category === 'staff' && staffTab === 'staff_marketing'
              ? 'Chưa có chi phí quảng cáo được ghi nhận trong kỳ này.'
              : `Không có dữ liệu trong kỳ đã chọn. Thử chọn khoảng thời gian khác.`
          }
        />
      )}
    </div>
  )
}
