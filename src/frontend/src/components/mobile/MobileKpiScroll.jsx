export default function MobileKpiScroll({ kpis = [] }) {
  return (
    <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-4 px-4 md:hidden">
      {kpis.map((k, i) => (
        <div
          key={i}
          className="snap-start shrink-0 lcard p-3"
          style={{ width: 160 }}
        >
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {k.label}
          </div>
          <div className="font-mono font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            {k.value}
          </div>
          {k.trend !== undefined && (
            <div className="flex items-center gap-1 text-xs mt-0.5">
              <span
                className="icon"
                style={{
                  fontSize: 11,
                  color: k.trend > 0 ? 'var(--accent-500)' : 'var(--color-error)',
                }}
              >
                {k.trend > 0 ? 'arrow_upward' : 'arrow_downward'}
              </span>
              <span style={{ color: k.trend > 0 ? 'var(--accent-500)' : 'var(--color-error)' }}>
                {Math.abs(k.trend)}%
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
