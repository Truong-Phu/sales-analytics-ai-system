import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { SkeletonCard } from '../../components/ui/Skeleton'
import MockToast from '../../components/ui/MockToast'
import { getDashboard } from '../../api/dashboardApi'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function fmtM(v) {
  if (v >= 1_000_000_000) return `₫${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `₫${(v / 1_000).toFixed(0)}K`
  return `₫${v}`
}

function generateMockData(from, to) {
  const start = new Date(from)
  const end   = new Date(to)
  const days  = Math.round((end - start) / 86_400_000) + 1
  const revenueByDay = Array.from({ length: days }, (_, i) => {
    const d    = new Date(start.getTime() + i * 86_400_000)
    const base = 8_000_000 + Math.sin(i / 10) * 3_000_000
    const netRevenue  = Math.round(base + Math.random() * 2_000_000)
    const grossProfit = Math.round(netRevenue * (0.28 + Math.random() * 0.08))
    return {
      date: d.toISOString().slice(0, 10),
      netRevenue, grossProfit,
      orderCount: Math.round(15 + Math.random() * 20),
    }
  })
  const totalRevenue = revenueByDay.reduce((s, d) => s + d.netRevenue, 0)
  const totalProfit  = revenueByDay.reduce((s, d) => s + d.grossProfit, 0)
  const totalOrders  = revenueByDay.reduce((s, d) => s + d.orderCount, 0)

  const channels = [
    { channelName: 'Shopee',      pct: 0.35, adSpend: 12_000_000 },
    { channelName: 'Lazada',      pct: 0.25, adSpend: 9_000_000  },
    { channelName: 'TikTok Shop', pct: 0.20, adSpend: 15_000_000 },
    { channelName: 'Facebook',    pct: 0.12, adSpend: 8_000_000  },
    { channelName: 'Website',     pct: 0.08, adSpend: 3_000_000  },
  ]

  // Monthly grouped data for multi-channel
  const monthlyByChannel = ['T1','T2','T3','T4','T5','T6'].map((month, mi) => {
    const base = totalRevenue / 6
    const row = { month }
    channels.forEach(ch => {
      row[ch.channelName] = Math.round(base * ch.pct * (0.85 + Math.random() * 0.3))
    })
    return row
  })

  return {
    kpi: {
      totalRevenue, totalProfit, totalOrders,
      avgOrderValue:      Math.round(totalRevenue / totalOrders),
      conversionRate:     3.8 + Math.random() * 1.2,
      newCustomers:       Math.round(totalOrders * 0.3),
      roi:                ((totalProfit / (totalRevenue * 0.25)) * 100).toFixed(1),
      revenueGrowthPct:   12.5,
      ordersGrowthPct:    8.3,
      customersGrowthPct: 5.1,
      profitMarginPct:    Math.round(totalProfit / totalRevenue * 1000) / 10,
    },
    revenueByDay,
    revenueByChannel: channels.map(ch => ({
      channelName: ch.channelName,
      revenue: totalRevenue * ch.pct,
      orders:  Math.round(totalOrders * ch.pct),
      revenuePct: ch.pct * 100,
      adSpend: ch.adSpend,
      roas: ((totalRevenue * ch.pct) / ch.adSpend).toFixed(1),
      cac:  Math.round(ch.adSpend / (totalOrders * ch.pct * 0.3)),
    })),
    topProducts: [
      { productName: 'Áo thun Unisex Cotton', channel: 'Shopee',      orders: 380, revenue: totalRevenue * 0.12 },
      { productName: 'Quần jeans Slim Fit',   channel: 'Lazada',      orders: 295, revenue: totalRevenue * 0.09 },
      { productName: 'Giày thể thao Nam',     channel: 'TikTok Shop', orders: 260, revenue: totalRevenue * 0.08 },
      { productName: 'Túi xách Nữ HQ',        channel: 'Shopee',      orders: 225, revenue: totalRevenue * 0.07 },
      { productName: 'Đầm maxi Boho',         channel: 'Facebook',    orders: 190, revenue: totalRevenue * 0.06 },
    ],
    monthlyByChannel,
    customerSegments: [
      { name: 'VIP (>10tr)',     value: 120, clv: 25_000_000, freq: 8  },
      { name: 'Thân thiết',      value: 340, clv: 8_000_000,  freq: 4  },
      { name: 'Mới',             value: 580, clv: 2_000_000,  freq: 1  },
      { name: 'Không hoạt động', value: 210, clv: 500_000,    freq: 0.5 },
    ],
    funnel: [
      { stage: 'Lượt truy cập', value: 45000 },
      { stage: 'Xem sản phẩm',  value: 18000 },
      { stage: 'Thêm giỏ hàng', value: 6200  },
      { stage: 'Đặt hàng',      value: 2800  },
      { stage: 'Thanh toán',    value: 2450  },
    ],
    heatmap: (() => {
      const rows = []
      for (let h = 0; h < 24; h += 2) {
        ['T2','T3','T4','T5','T6','T7','CN'].forEach(day => {
          rows.push({
            hour: `${h}:00`, day,
            orders: Math.round(Math.random() * 60 + (h >= 8 && h <= 20 ? 30 : 5)),
          })
        })
      }
      return rows
    })(),
    radarData: channels.map(ch => ({
      channel: ch.channelName.split(' ')[0],
      'Chi phí': Math.round(ch.adSpend / 1_000_000 * 10),
      'Tương tác': Math.round(70 + Math.random() * 30),
      'Tỷ lệ chuyển đổi': Math.round(ch.pct * 300 + Math.random() * 20),
      'Doanh thu': Math.round(ch.pct * 100),
    })),
    inventory: [
      { product: 'Áo thun',   stock: 320, forecast: 280, returnRate: 2.1 },
      { product: 'Quần jeans', stock: 180, forecast: 220, returnRate: 3.5 },
      { product: 'Giày',       stock: 95,  forecast: 150, returnRate: 5.2 },
      { product: 'Túi xách',   stock: 240, forecast: 200, returnRate: 1.8 },
      { product: 'Đầm maxi',   stock: 160, forecast: 130, returnRate: 4.0 },
    ],
  }
}

// ── Presets & constants ───────────────────────────────────────────────────────
const QUICK_PRESETS = [
  { key: 'year2025', label: '2025',    from: '2025-01-01', to: '2025-12-31' },
  { key: '30d',      label: '30 ngày', from: () => relDate(-30), to: () => relDate(0) },
  { key: '90d',      label: '90 ngày', from: () => relDate(-90), to: () => relDate(0) },
  { key: 'custom',   label: 'Tùy chọn', from: null, to: null },
]
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok', 'facebook', 'website']
const CHART_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316']

function resolvePreset(p) {
  return {
    from: typeof p.from === 'function' ? p.from() : p.from,
    to:   typeof p.to   === 'function' ? p.to()   : p.to,
  }
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h3 className="text-subtitle font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
      {children}
    </h3>
  )
}

function KpiCard({ label, value, trend, icon, color = 'var(--primary-500)' }) {
  const up = trend > 0
  return (
    <div className="lcard lcard-hover px-4 py-3 cursor-default flex-shrink-0" style={{ minWidth: 160 }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="icon icon-sm" style={{ color, fontSize: 16 }}>{icon}</span>
        <span className="text-caption font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="text-title font-bold font-mono mb-0.5" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 text-caption">
          <span className="icon" style={{ fontSize: 12, color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
            {up ? 'arrow_upward' : 'arrow_downward'}
          </span>
          <span style={{ color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>{Math.abs(trend)}%</span>
          <span style={{ color: 'var(--text-tertiary)' }}>so sánh</span>
        </div>
      )}
    </div>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="lcard px-3 py-2" style={{ boxShadow: 'var(--shadow-md)', minWidth: 140 }}>
      <p className="text-caption mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-caption" style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span className="font-mono text-caption font-medium" style={{ color: 'var(--text-primary)' }}>
            {typeof p.value === 'number' && p.value > 100_000
              ? fmtM(p.value)
              : p.value?.toLocaleString('vi-VN') ?? '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Tab: 1 — Overview ─────────────────────────────────────────────────────────
function TabOverview({ data }) {
  const kpi = data.kpi
  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        <KpiCard label="Doanh thu thuần" value={fmtM(kpi.totalRevenue)} trend={kpi.revenueGrowthPct} icon="payments" />
        <KpiCard label="Số đơn hàng"     value={kpi.totalOrders.toLocaleString('vi-VN')} trend={kpi.ordersGrowthPct} icon="shopping_cart" />
        <KpiCard label="Giá trị TB đơn"  value={fmtM(kpi.avgOrderValue)} icon="receipt_long" color="var(--accent-500)" />
        <KpiCard label="Tỷ lệ chuyển đổi" value={`${kpi.conversionRate.toFixed(1)}%`} icon="conversion_path" color="#F59E0B" />
        <KpiCard label="Lợi nhuận gộp"   value={fmtM(kpi.totalProfit)} trend={kpi.profitMarginPct} icon="percent" color="#8B5CF6" />
        <KpiCard label="ROI tổng"         value={`${kpi.roi}%`} icon="trending_up" color="#EC4899" />
      </div>

      {/* Hero 2/3 + Donut 1/3 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Xu hướng doanh thu & lợi nhuận</SectionTitle>
            <div className="flex items-center gap-3 text-caption" style={{ color: 'var(--text-tertiary)' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#6366F1' }} />Doanh thu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#10B981' }} />Lợi nhuận
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.revenueByDay.map(d => ({ ...d, date: d.date.slice(5) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="proGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                tickFormatter={(v, i) => i % Math.max(1, Math.floor(data.revenueByDay.length / 8)) === 0 ? v : ''} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
                tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="netRevenue"  name="Doanh thu" stroke="#6366F1" strokeWidth={2} fill="url(#revGrad)" dot={false} />
              <Area type="monotone" dataKey="grossProfit" name="Lợi nhuận" stroke="#10B981" strokeWidth={2} fill="url(#proGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle>Tỷ trọng doanh thu theo kênh</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.revenueByChannel} dataKey="revenue" nameKey="channelName"
                cx="50%" cy="50%" outerRadius={80} innerRadius={48}
                paddingAngle={3}
              >
                {data.revenueByChannel.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={v => fmtM(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {data.revenueByChannel.map((ch, i) => (
              <div key={i} className="flex items-center gap-2 text-caption">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{ch.channelName}</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{ch.revenuePct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: 2 — Sales Performance ────────────────────────────────────────────────
function TabSales({ data }) {
  return (
    <div className="space-y-5">
      {/* Stacked Bar: doanh thu kênh theo tháng — full */}
      <div className="lcard p-5">
        <SectionTitle>Doanh thu theo kênh & tháng (Stacked Bar)</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.monthlyByChannel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
              tickFormatter={v => `${(v/1_000_000).toFixed(0)}M`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
            {data.revenueByChannel.map((ch, i) => (
              <Bar key={ch.channelName} dataKey={ch.channelName} stackId="a"
                fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === data.revenueByChannel.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bar ngang top products + Area tăng trưởng */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>Top 5 sản phẩm bán chạy</SectionTitle>
          <div className="space-y-3">
            {data.topProducts.map((p, i) => {
              const maxRev = data.topProducts[0].revenue
              const pct = (p.revenue / maxRev) * 100
              return (
                <div key={i}>
                  <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span className="truncate max-w-[60%]">{p.productName}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{fmtM(p.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>Tăng trưởng doanh thu (Area)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.revenueByDay.filter((_, i) => i % Math.max(1, Math.floor(data.revenueByDay.length / 30)) === 0).map(d => ({ ...d, date: d.date.slice(5) }))}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="growGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                tickFormatter={(v, i) => i % 5 === 0 ? v : ''} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={44}
                tickFormatter={v => `${(v/1_000_000).toFixed(0)}M`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="netRevenue" name="Doanh thu" stroke="#8B5CF6" strokeWidth={2} fill="url(#growGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Tab: 3 — Multi-channel ────────────────────────────────────────────────────
function TabMultiChannel({ data }) {
  return (
    <div className="space-y-5">
      {/* Stacked 3/4 + Donut 1/4 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-8">
          <SectionTitle>So sánh doanh thu kênh theo tháng</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.monthlyByChannel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
                tickFormatter={v => `${(v/1_000_000).toFixed(0)}M`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {data.revenueByChannel.map((ch, i) => (
                <Bar key={ch.channelName} dataKey={ch.channelName} fill={CHART_COLORS[i]} radius={[3,3,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle>Tỷ trọng kênh</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.revenueByChannel} dataKey="orders" nameKey="channelName"
                cx="50%" cy="50%" outerRadius={75} paddingAngle={4}>
                {data.revenueByChannel.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={v => `${v.toLocaleString('vi-VN')} đơn`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Radar: hiệu suất kênh */}
      <div className="lcard p-5">
        <SectionTitle>Hiệu suất đa chiều theo kênh (Radar)</SectionTitle>
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data.radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis dataKey="channel" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
            <Radar name="Chi phí" dataKey="Chi phí" stroke="#6366F1" fill="#6366F1" fillOpacity={0.2} />
            <Radar name="Tương tác" dataKey="Tương tác" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
            <Radar name="Doanh thu" dataKey="Doanh thu" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Tab: 4 — Customer Analytics ───────────────────────────────────────────────
function TabCustomer({ data }) {
  const maxFunnel = data.funnel[0].value
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-12 gap-4">
        {/* Funnel */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>Phễu chuyển đổi khách hàng</SectionTitle>
          <div className="space-y-2 mt-2">
            {data.funnel.map((stage, i) => {
              const pct = (stage.value / maxFunnel) * 100
              const convRate = i === 0 ? 100 : (stage.value / data.funnel[i - 1].value * 100).toFixed(1)
              return (
                <div key={i}>
                  <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span>{stage.stage}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {stage.value.toLocaleString('vi-VN')}
                      {i > 0 && <span style={{ color: 'var(--text-tertiary)' }}> ({convRate}%)</span>}
                    </span>
                  </div>
                  <div className="h-6 rounded-lg flex items-center" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-700"
                      style={{ width: `${pct}%`, background: CHART_COLORS[i], minWidth: 40 }}>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* CLV Scatter */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>CLV vs Tần suất mua (phân khúc)</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="freq" name="Tần suất" unit="lần" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="clv" name="CLV" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
                tickFormatter={v => fmtM(v)} />
              <ZAxis dataKey="value" range={[40, 280]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, name) =>
                name === 'CLV' ? fmtM(v) : v
              } />
              {data.customerSegments.map((seg, i) => (
                <Scatter key={i} name={seg.name} data={[seg]} fill={CHART_COLORS[i]} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap giờ mua hàng */}
      <div className="lcard p-5">
        <SectionTitle>Thời gian mua hàng (Giờ × Ngày trong tuần)</SectionTitle>
        <div className="overflow-x-auto">
          <HeatmapGrid data={data.heatmap} />
        </div>
      </div>
    </div>
  )
}

function HeatmapGrid({ data }) {
  const days  = ['T2','T3','T4','T5','T6','T7','CN']
  const hours = [...new Set(data.map(d => d.hour))].sort()
  const maxOrders = Math.max(...data.map(d => d.orders))

  return (
    <div>
      {/* Header */}
      <div className="flex gap-1 mb-1 pl-12">
        {days.map(d => (
          <div key={d} className="w-8 text-center text-caption font-medium" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
        ))}
      </div>
      {hours.map(h => (
        <div key={h} className="flex items-center gap-1 mb-1">
          <div className="w-11 text-caption text-right pr-1 shrink-0" style={{ color: 'var(--text-tertiary)' }}>{h}</div>
          {days.map(day => {
            const cell = data.find(d => d.hour === h && d.day === day)
            const orders = cell?.orders ?? 0
            const intensity = maxOrders > 0 ? orders / maxOrders : 0
            const bg = `rgba(99,102,241,${(intensity * 0.8 + 0.05).toFixed(2)})`
            return (
              <div key={day} title={`${day} ${h}: ${orders} đơn`}
                className="w-8 h-6 rounded cursor-default transition-all hover:scale-110"
                style={{ background: bg }} />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Ít</span>
        {[0.1,0.3,0.5,0.7,0.9].map(v => (
          <div key={v} className="w-4 h-3 rounded" style={{ background: `rgba(99,102,241,${v})` }} />
        ))}
        <span className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Nhiều</span>
      </div>
    </div>
  )
}

// ── Tab: 5 — Marketing & ROI ──────────────────────────────────────────────────
function TabMarketing({ data }) {
  const comboData = data.revenueByChannel.map(ch => ({
    name: ch.channelName.split(' ')[0],
    adSpend: ch.adSpend / 1_000_000,
    revenue: ch.revenue / 1_000_000,
    roas: parseFloat(ch.roas),
  }))

  return (
    <div className="space-y-5">
      {/* Combo: chi phí vs doanh thu */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-8">
          <SectionTitle>Chi phí quảng cáo vs Doanh thu (Combo)</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comboData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={44}
                tickFormatter={v => `${v.toFixed(0)}M`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={40}
                tickFormatter={v => `${v}x`} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="adSpend" name="Chi phí QC (M₫)" fill="#EC4899" radius={[3,3,0,0]} />
              <Bar yAxisId="left" dataKey="revenue" name="Doanh thu (M₫)" fill="#6366F1" radius={[3,3,0,0]} />
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#F59E0B" strokeWidth={2}
                dot={{ fill: '#F59E0B', r: 4 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle>ROAS theo kênh</SectionTitle>
          <div className="space-y-3 mt-2">
            {comboData.sort((a,b) => b.roas - a.roas).map((ch, i) => (
              <div key={ch.name}>
                <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span>{ch.name}</span>
                  <span className="font-mono font-bold" style={{ color: ch.roas >= 4 ? 'var(--accent-500)' : ch.roas >= 2 ? '#F59E0B' : 'var(--color-error)' }}>
                    {ch.roas}x
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.min(ch.roas / 8 * 100, 100)}%`, background: CHART_COLORS[i] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CAC vs ROAS bubble */}
      <div className="lcard p-5">
        <SectionTitle>CAC vs ROAS theo kênh (Bubble Size = Doanh thu)</SectionTitle>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="cac" name="CAC (₫)" unit="K" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <YAxis dataKey="roas" name="ROAS" unit="x" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <ZAxis dataKey="revenue" range={[60, 400]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, name) =>
              name === 'CAC (₫)' ? `${(v/1000).toFixed(0)}K₫` : name === 'ROAS' ? `${v}x` : fmtM(v)
            } />
            {data.revenueByChannel.map((ch, i) => (
              <Scatter key={i} name={ch.channelName} data={[{ cac: ch.cac, roas: parseFloat(ch.roas), revenue: ch.revenue }]}
                fill={CHART_COLORS[i]} />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Tab: 6 — Inventory & Operations ──────────────────────────────────────────
function TabInventory({ data }) {
  const invKpis = [
    { label: 'Tỷ lệ hoàn đơn TB', value: '3.1%', icon: 'assignment_return', color: '#EC4899' },
    { label: 'Tỷ lệ hủy đơn',     value: '2.4%', icon: 'cancel',            color: 'var(--color-error)' },
    { label: 'Tỷ lệ giao thành công', value: '94.5%', icon: 'local_shipping', color: 'var(--accent-500)' },
    { label: 'Tốc độ xử lý đơn',  value: '2.3 giờ', icon: 'timer',          color: '#F59E0B' },
  ]
  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {invKpis.map(k => (
          <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} color={k.color} />
        ))}
      </div>

      {/* Column chart: tồn kho vs dự báo */}
      <div className="lcard p-5">
        <SectionTitle>Tồn kho hiện tại vs Dự báo nhu cầu</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.inventory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="product" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="stock"    name="Tồn kho hiện tại" fill="#6366F1" radius={[3,3,0,0]} />
            <Bar dataKey="forecast" name="Dự báo nhu cầu"   fill="#10B981" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tỷ lệ hoàn đơn */}
      <div className="lcard p-5">
        <SectionTitle>Tỷ lệ hoàn trả theo sản phẩm (%)</SectionTitle>
        <div className="space-y-3">
          {data.inventory.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                <span>{item.product}</span>
                <span className="font-mono font-bold"
                  style={{ color: item.returnRate > 4 ? 'var(--color-error)' : item.returnRate > 2.5 ? '#F59E0B' : 'var(--accent-500)' }}>
                  {item.returnRate}%
                </span>
              </div>
              <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                <div className="h-full rounded-full"
                  style={{ width: `${item.returnRate / 6 * 100}%`, background: item.returnRate > 4 ? 'var(--color-error)' : item.returnRate > 2.5 ? '#F59E0B' : 'var(--accent-500)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TABS CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview',    label: 'Tổng quan',          icon: 'dashboard' },
  { key: 'sales',       label: 'Bán hàng',           icon: 'bar_chart' },
  { key: 'multichannel',label: 'Đa kênh',            icon: 'hub' },
  { key: 'customer',    label: 'Khách hàng',         icon: 'people' },
  { key: 'marketing',   label: 'Marketing & ROI',    icon: 'campaign' },
  { key: 'inventory',   label: 'Tồn kho & Vận hành',icon: 'inventory_2' },
]

// ── DashboardPage ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t } = useTranslation()
  const [activeTab,  setActiveTab]  = useState('overview')
  const [presetKey,  setPresetKey]  = useState('year2025')
  const [customFrom, setCustomFrom] = useState('2025-01-01')
  const [customTo,   setCustomTo]   = useState('2025-12-31')
  const [channel,    setChannel]    = useState('all')
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [isMock,     setIsMock]     = useState(false)

  function getRange() {
    if (presetKey === 'custom') return { from: customFrom, to: customTo }
    const preset = QUICK_PRESETS.find(p => p.key === presetKey)
    return resolvePreset(preset)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange()
    try {
      const ch  = channel === 'all' ? null : channel
      const res = await getDashboard(from, to, ch)
      const hasData = res?.kpi?.totalRevenue > 0
      if (!hasData) throw new Error('no_data')
      setData(res)
      setIsMock(false)
    } catch {
      setData(generateMockData(from, to))
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, customFrom, customTo, channel])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-4">

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('dashboard.title')}
          </h1>
          <p className="text-caption mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('common.lastUpdated')}: {new Date().toLocaleString('vi-VN')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset buttons */}
          <div className="flex items-center p-1 gap-1 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
            {QUICK_PRESETS.map(p => (
              <button key={p.key} onClick={() => setPresetKey(p.key)}
                className="px-3 py-1.5 rounded-md text-body font-medium transition-all"
                style={{
                  background: presetKey === p.key ? 'var(--bg-surface)' : 'transparent',
                  color: presetKey === p.key ? 'var(--primary-600)' : 'var(--text-secondary)',
                  boxShadow: presetKey === p.key ? 'var(--shadow-sm)' : 'none',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          {presetKey === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="linput !h-9 !px-3 text-body" style={{ width: 140 }} />
              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="linput !h-9 !px-3 text-body" style={{ width: 140 }} />
            </div>
          )}
          <select value={channel} onChange={e => setChannel(e.target.value)} className="linput !h-9 !px-3 text-body" style={{ width: 140 }}>
            {CHANNEL_KEYS.map(k => <option key={k} value={k}>{t(`dashboard.channel.${k}`)}</option>)}
          </select>
          <button onClick={fetchData} className="lbtn lbtn-secondary !py-0 !h-9" title={t('common.refresh')}>
            <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>refresh</span>
          </button>
        </div>
      </div>

      <MockToast show={isMock} />

      {/* ── 6 Tab navigation ── */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b pb-0" style={{ borderColor: 'var(--border)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-body font-medium whitespace-nowrap border-b-2 transition-all shrink-0"
            style={{
              borderColor:  activeTab === tab.key ? 'var(--primary-500)' : 'transparent',
              color:        activeTab === tab.key ? 'var(--primary-600)' : 'var(--text-secondary)',
              background:   'transparent',
              marginBottom: '-1px',
            }}
          >
            <span className="icon icon-sm" style={{ color: activeTab === tab.key ? 'var(--primary-500)' : 'var(--text-tertiary)' }}>
              {tab.icon}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-3 overflow-x-auto pb-1">{[1,2,3,4].map(i => <SkeletonCard key={i} />)}</div>
          <SkeletonCard /><SkeletonCard />
        </div>
      ) : data && (
        <div className="page-enter">
          {activeTab === 'overview'     && <TabOverview      data={data} />}
          {activeTab === 'sales'        && <TabSales         data={data} />}
          {activeTab === 'multichannel' && <TabMultiChannel  data={data} />}
          {activeTab === 'customer'     && <TabCustomer      data={data} />}
          {activeTab === 'marketing'    && <TabMarketing     data={data} />}
          {activeTab === 'inventory'    && <TabInventory     data={data} />}
        </div>
      )}
    </div>
  )
}
