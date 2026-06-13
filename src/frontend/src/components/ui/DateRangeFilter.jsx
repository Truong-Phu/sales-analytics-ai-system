import { useState, useEffect } from 'react'

/**
 * DateRangeFilter - bo loc ngay chuan dung chung cho cac man BI.
 *
 * Props:
 *   from      - string YYYY-MM-DD (controlled)
 *   to        - string YYYY-MM-DD (controlled, inclusive)
 *   onChange  - (from, to) => void
 *   presets   - array preset keys
 *   className - extra className cho wrapper
 *
 * Preset keys: 'yesterday' | 'today' | 'last7days' | 'mtd' | 'qtd' | 'ytd' | 'custom'
 * Backward-compatible aliases: 'all' -> 'ytd', 'days_7' -> 'last7days',
 * 'days_30' -> 'mtd', 'days_90' -> 'qtd'.
 */

const toDateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const addDays = (date, n) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

const today = () => toDateKey(new Date())
const daysAgo = (n) => toDateKey(addDays(new Date(), -n))

const startOfMonth = () => {
  const d = new Date()
  d.setDate(1)
  return toDateKey(d)
}

const startOfQuarter = () => {
  const d = new Date()
  d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1)
  return toDateKey(d)
}

const startOfYear = () => `${new Date().getFullYear()}-01-01`

const PRESET_ALIASES = {
  all: 'ytd',
  week: 'last7days',
  month: 'mtd',
  '90d': 'qtd',
  days_7: 'last7days',
  days_30: 'mtd',
  days_90: 'qtd',
}

const normalizePresetKey = (key) => PRESET_ALIASES[key] ?? key

const PRESETS = [
  { key: 'yesterday', label: 'Hôm qua' },
  { key: 'today',     label: 'Hôm nay' },
  { key: 'last7days', label: '7 ngày' },
  { key: 'mtd',       label: 'Tháng này' },
  { key: 'qtd',       label: 'Quý này' },
  { key: 'ytd',       label: 'Năm nay' },
  { key: 'custom',    label: 'Tùy chọn' },
]

function resolvePreset(key) {
  const normalized = normalizePresetKey(key)
  const t = today()

  switch (normalized) {
    case 'yesterday': return { from: daysAgo(1), to: daysAgo(1) }
    case 'today':     return { from: t, to: t }
    case 'last7days': return { from: daysAgo(6), to: t }
    case 'mtd':       return { from: startOfMonth(), to: t }
    case 'qtd':       return { from: startOfQuarter(), to: t }
    case 'ytd':       return { from: startOfYear(), to: t }
    default:          return null
  }
}

function detectPreset(from, to) {
  for (const preset of PRESETS.filter(p => p.key !== 'custom')) {
    const range = resolvePreset(preset.key)
    if (range?.from === from && range?.to === to) return preset.key
  }
  return 'custom'
}

export default function DateRangeFilter({
  from,
  to,
  onChange,
  presets = ['yesterday', 'today', 'last7days', 'mtd', 'qtd', 'ytd', 'custom'],
  className = '',
}) {
  const [active, setActive] = useState(() => detectPreset(from, to))
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)

  useEffect(() => {
    setActive(detectPreset(from, to))
    setCustomFrom(from)
    setCustomTo(to)
  }, [from, to])

  const handlePreset = (key) => {
    const normalized = normalizePresetKey(key)
    setActive(normalized)
    if (normalized !== 'custom') {
      const range = resolvePreset(normalized)
      onChange(range.from, range.to)
    }
  }

  const handleCustomApply = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      onChange(customFrom, customTo)
    }
  }

  const normalizedPresets = [...new Set(presets.map(normalizePresetKey))]
  const shownPresets = PRESETS.filter(p => normalizedPresets.includes(p.key))

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
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

      {active === 'custom' && normalizedPresets.includes('custom') && (
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
            max={today()}
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
