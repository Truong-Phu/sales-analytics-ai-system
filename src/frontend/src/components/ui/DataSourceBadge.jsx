const CONF = {
  high:   { dot: '#10B981', label: 'Dữ liệu đầy đủ' },
  medium: { dot: '#F59E0B', label: 'Dữ liệu một phần' },
  low:    { dot: '#EF4444', label: 'Ước tính' },
}

export default function DataSourceBadge({ confidence = 'low', level }) {
  const cfg = CONF[confidence] ?? CONF.low
  return (
    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
      {level && <span className="ml-1 opacity-60">· {level}</span>}
    </div>
  )
}
