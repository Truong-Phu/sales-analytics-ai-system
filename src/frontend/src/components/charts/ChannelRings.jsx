import { useEffect, useRef } from 'react'

const RING_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6']

function fmtM(v) { return `₫${(v / 1_000_000).toFixed(0)}M` }

export default function ChannelRings({ channels = [] }) {
  const top5 = channels.slice(0, 5)
  const total = top5.reduce((s, c) => s + (c.revenue ?? 0), 0)

  // SVG concentric ring params
  const cx = 100, cy = 100
  const radii = [82, 65, 50, 37, 26]
  const circumferences = radii.map(r => 2 * Math.PI * r)

  const svgRef = useRef(null)

  useEffect(() => {
    // Animate strokes from 0 → value
    if (!svgRef.current) return
    const circles = svgRef.current.querySelectorAll('.ring-arc')
    circles.forEach((c, i) => {
      const fullLen = circumferences[i]
      const pct = total > 0 ? ((top5[i]?.revenue ?? 0) / total) : 0
      const dash = fullLen * pct * 0.85 // 85% max to leave gap
      c.style.strokeDasharray = `0 ${fullLen}`
      requestAnimationFrame(() => {
        c.style.transition = `stroke-dasharray ${500 + i * 80}ms ease`
        c.style.strokeDasharray = `${dash} ${fullLen}`
      })
    })
  }, [channels]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        width="100%"
        style={{ maxHeight: 200 }}
      >
        {/* Background rings (track) */}
        {top5.map((_, i) => (
          <circle
            key={`track-${i}`}
            cx={cx} cy={cy} r={radii[i]}
            fill="none"
            stroke="var(--border)"
            strokeWidth={i === 0 ? 10 : i === 1 ? 8 : i === 2 ? 7 : i === 3 ? 6 : 5}
          />
        ))}

        {/* Animated arcs */}
        {top5.map((ch, i) => (
          <circle
            key={`arc-${i}`}
            className="ring-arc"
            cx={cx} cy={cy} r={radii[i]}
            fill="none"
            stroke={RING_COLORS[i]}
            strokeWidth={i === 0 ? 10 : i === 1 ? 8 : i === 2 ? 7 : i === 3 ? 6 : 5}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}

        {/* Center total */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">
          Tổng
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="700"
              fill="var(--text-primary)" fontFamily="var(--font-mono)">
          {fmtM(total)}
        </text>
      </svg>

      {/* Legend */}
      <div className="space-y-1.5">
        {top5.map((ch, i) => {
          const pct = total > 0 ? ((ch.revenue ?? 0) / total * 100).toFixed(1) : '0.0'
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RING_COLORS[i] }} />
              <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                {ch.channelName ?? ch.channel ?? '—'}
              </span>
              <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
