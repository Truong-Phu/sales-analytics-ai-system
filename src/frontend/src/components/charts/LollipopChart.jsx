import { useState } from 'react'

const COLORS = ['#6366F1', '#818CF8', '#10B981', '#9CA3AF', '#9CA3AF']

function truncate(str, n) {
  return str?.length > n ? str.slice(0, n) + '…' : (str ?? '—')
}

export default function LollipopChart({ products = [] }) {
  const [hovered, setHovered] = useState(null)
  if (!products.length) return null

  const maxRev = Math.max(...products.map(p => p.revenue ?? 0))
  const W = 100 // percentage width of bar area
  const ROW_H = 44
  const LABEL_W = 38 // % of width for label
  const BAR_W   = 52 // % of width for bar

  return (
    <div className="space-y-1.5">
      {products.map((p, i) => {
        const pct = maxRev > 0 ? (p.revenue ?? 0) / maxRev : 0
        const color = COLORS[Math.min(i, COLORS.length - 1)]
        const r = 6 + pct * 6 // dot radius: 6–12px

        return (
          <div
            key={p.productId ?? i}
            className="flex items-center gap-2 cursor-pointer transition-opacity"
            style={{ opacity: hovered !== null && hovered !== i ? 0.5 : 1, height: ROW_H }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Rank */}
            <span
              className="text-xs font-mono font-bold w-4 shrink-0 text-center"
              style={{ color: i < 3 ? color : 'var(--text-tertiary)' }}
            >
              {i + 1}
            </span>

            {/* Label */}
            <span
              className="text-xs shrink-0 truncate"
              style={{ width: '38%', color: 'var(--text-secondary)' }}
              title={p.productName ?? p.name}
            >
              {truncate(p.productName ?? p.name, 16)}
            </span>

            {/* Bar + dot */}
            <div className="flex-1 flex items-center gap-1.5 relative">
              {/* Stem */}
              <div
                className="h-0.5 rounded-full transition-all duration-500"
                style={{
                  width: `${pct * 100}%`,
                  background: `linear-gradient(to right, ${color}33, ${color})`,
                  minWidth: 4,
                }}
              />
              {/* Dot */}
              <div
                className="rounded-full shrink-0 transition-transform duration-200"
                style={{
                  width:  `${r * 2}px`,
                  height: `${r * 2}px`,
                  background: color,
                  transform: hovered === i ? 'scale(1.3)' : 'scale(1)',
                  boxShadow: hovered === i ? `0 0 8px ${color}66` : 'none',
                }}
              />
            </div>

            {/* Value */}
            <span
              className="text-xs font-mono font-medium shrink-0 text-right"
              style={{ width: 52, color: 'var(--text-primary)' }}
            >
              ₫{((p.revenue ?? 0) / 1_000_000).toFixed(1)}M
            </span>
          </div>
        )
      })}
    </div>
  )
}
