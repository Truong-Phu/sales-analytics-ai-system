import { useState, useEffect } from 'react'

function easeOut(t) { return 1 - Math.pow(1 - t, 3) }

export default function StatCard({ label, value, trend, trendLabel, icon, color = 'var(--primary-500)' }) {
  const numericValue = typeof value === 'number' ? value : null
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (numericValue === null) return
    const duration = 800
    const start = performance.now()
    const frame = (now) => {
      const t = Math.min((now - start) / duration, 1)
      setDisplayed(Math.round(easeOut(t) * numericValue))
      if (t < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }, [numericValue])

  const displayValue = numericValue !== null ? displayed : value
  const up = trend > 0

  return (
    <div className="lcard p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        {icon && (
          <span
            className="icon icon-sm w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: `${color}18`, color, fontSize: 18 }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="font-mono text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {displayValue}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-1.5 text-xs">
          <span className="icon" style={{ fontSize: 12, color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
            {up ? 'arrow_upward' : 'arrow_downward'}
          </span>
          <span style={{ color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
            {Math.abs(trend)}%
          </span>
          {trendLabel && <span style={{ color: 'var(--text-tertiary)' }}>{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}
