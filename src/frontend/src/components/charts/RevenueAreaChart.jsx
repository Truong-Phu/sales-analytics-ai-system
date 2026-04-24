import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

// Custom tooltip card
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="lcard px-3 py-2 text-sm"
      style={{ boxShadow: 'var(--shadow-md)', minWidth: 160 }}
    >
      <p className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.name}:</span>
          <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
            ₫{((p.value ?? 0) / 1_000_000).toFixed(1)}M
          </span>
        </div>
      ))}
    </div>
  )
}

function fmt(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return v
}

export default function RevenueAreaChart({ labels = [], revenue = [], profit = [] }) {
  const data = labels.map((date, i) => ({
    date: date.slice(5), // MM-DD
    revenue: revenue[i] ?? 0,
    profit:  profit[i]  ?? 0,
  }))

  // Only show every Nth label to avoid crowding
  const step = Math.max(1, Math.floor(data.length / 8))
  const tickFormatter = (val, idx) => (idx % step === 0 ? val : '')

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#6366F1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#10B981" stopOpacity={0.20} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatter}
          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmt}
          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />

        <Area
          type="monotone"
          dataKey="revenue"
          name="Doanh thu"
          stroke="#6366F1"
          strokeWidth={2}
          fill="url(#revenueGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#6366F1', stroke: 'white', strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="profit"
          name="Lợi nhuận"
          stroke="#10B981"
          strokeWidth={2}
          fill="url(#profitGrad)"
          dot={false}
          activeDot={{ r: 4, fill: '#10B981', stroke: 'white', strokeWidth: 2 }}
          strokeDasharray="0"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
