import { useState, useEffect } from 'react'

/**
 * DateRangeFilter — bộ lọc ngày chuẩn dùng chung toàn hệ thống.
 *
 * Props:
 *   from      — string YYYY-MM-DD (controlled)
 *   to        — string YYYY-MM-DD (controlled)
 *   onChange  — (from, to) => void  — gọi ngay khi chọn preset; gọi khi Apply với custom
 *   presets   — array of preset keys (default: tất cả)
 *   className — extra className cho wrapper
 *
 * Preset keys: 'all' | 'today' | 'days_7' | 'days_30' | 'days_90' | 'custom'
 */

const today    = () => new Date().toISOString().split('T')[0]
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().split('T')[0]
const daysAgo  = (n) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0]

const PRESETS = [
  { key: 'all',     label: 'Tất cả'    },
  { key: 'today',   label: 'Hôm nay'   },
  { key: 'days_7',  label: '7 ngày'    },
  { key: 'days_30', label: '30 ngày'   },
  { key: 'days_90', label: '90 ngày'   },
  { key: 'custom',  label: 'Tùy chỉnh' },
]

function resolvePreset(key) {
  const t = today()
  const tm = tomorrow()
  switch (key) {
    case 'all':     return { from: '2020-01-01', to: tm }
    case 'today':   return { from: t, to: tm }
    case 'days_7':  return { from: daysAgo(7),  to: tm }
    case 'days_30': return { from: daysAgo(30), to: tm }
    case 'days_90': return { from: daysAgo(90), to: tm }
    default:        return null   // custom — caller provides
  }
}

function detectPreset(from, to) {
  const t  = today()
  const tm = tomorrow()
  if (from === '2020-01-01' && to === tm)        return 'all'
  if (from === t && to === tm)                   return 'today'
  if (from === daysAgo(7)  && to === tm)         return 'days_7'
  if (from === daysAgo(30) && to === tm)         return 'days_30'
  if (from === daysAgo(90) && to === tm)         return 'days_90'
  return 'custom'
}

export default function DateRangeFilter({
  from,
  to,
  onChange,
  presets = ['all', 'today', 'days_7', 'days_30', 'days_90', 'custom'],
  className = '',
}) {
  const [active,      setActive]      = useState(() => detectPreset(from, to))
  const [customFrom,  setCustomFrom]  = useState(from)
  const [customTo,    setCustomTo]    = useState(to)

  // Sync khi from/to thay đổi từ ngoài
  useEffect(() => {
    setActive(detectPreset(from, to))
    setCustomFrom(from)
    setCustomTo(to)
  }, [from, to])

  const handlePreset = (key) => {
    setActive(key)
    if (key !== 'custom') {
      const range = resolvePreset(key)
      onChange(range.from, range.to)
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      onChange(customFrom, customTo)
    }
  }

  const shownPresets = PRESETS.filter(p => presets.includes(p.key))

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* Preset buttons */}
      {shownPresets.map(p => (
        <button
          key={p.key}
          onClick={() => handlePreset(p.key)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
          style={active === p.key
            ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
            : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
          {p.label}
        </button>
      ))}

      {/* Custom date inputs — chỉ hiện khi chọn Tùy chỉnh */}
      {active === 'custom' && presets.includes('custom') && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Từ</span>
          <input
            type="date"
            value={customFrom}
            max={customTo || today()}
            onChange={e => setCustomFrom(e.target.value)}
            className="linput text-xs"
            style={{ width: 130, height: 30 }}
          />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>đến</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            max={tomorrow()}
            onChange={e => setCustomTo(e.target.value)}
            className="linput text-xs"
            style={{ width: 130, height: 30 }}
          />
          <button
            onClick={handleCustomApply}
            disabled={!customFrom || !customTo || customFrom > customTo}
            className="lbtn lbtn-primary text-xs disabled:opacity-40"
            style={{ height: 30, padding: '0 10px' }}>
            Áp dụng
          </button>
        </div>
      )}
    </div>
  )
}
