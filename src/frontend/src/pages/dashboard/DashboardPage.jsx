import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ScatterChart, Scatter, ZAxis, ComposedChart, LabelList,
} from 'recharts'
import { SkeletonCard } from '../../components/ui/Skeleton'
import MockToast from '../../components/ui/MockToast'
import { getDashboard, getTodayVsYesterday } from '../../api/dashboardApi'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function fmtM(v) {
  if (v >= 1_000_000_000) return `₫${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `₫${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `₫${(v / 1_000).toFixed(0)}K`
  return `₫${v}`
}

// Xuất CSV đơn giản từ array of objects
function exportCsv(filename, rows) {
  if (!rows || !rows.length) return
  const headers = Object.keys(rows[0])
  const lines   = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))]
  const blob    = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url     = URL.createObjectURL(blob)
  const a       = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
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
    return { date: d.toISOString().slice(0, 10), netRevenue, grossProfit, orderCount: Math.round(15 + Math.random() * 20) }
  })
  const totalRevenue = revenueByDay.reduce((s, d) => s + d.netRevenue, 0)
  const totalProfit  = revenueByDay.reduce((s, d) => s + d.grossProfit, 0)
  const totalOrders  = revenueByDay.reduce((s, d) => s + d.orderCount, 0)

  const channels = [
    { channelName: 'Shopee',      pct: 0.35, adSpend: 12_000_000 },
    { channelName: 'Lazada',      pct: 0.25, adSpend:  9_000_000 },
    { channelName: 'TikTok Shop', pct: 0.20, adSpend: 15_000_000 },
    { channelName: 'Facebook',    pct: 0.12, adSpend:  8_000_000 },
    { channelName: 'Website',     pct: 0.08, adSpend:  3_000_000 },
  ]

  const monthlyByChannel = ['T1','T2','T3','T4','T5','T6'].map(month => {
    const base = totalRevenue / 6
    const row  = { month }
    channels.forEach(ch => { row[ch.channelName] = Math.round(base * ch.pct * (0.85 + Math.random() * 0.3)) })
    // Tổng tất cả kênh
    row['Total'] = channels.reduce((s, ch) => s + (row[ch.channelName] || 0), 0)
    return row
  })

  // Sparkline 7 điểm mock cho KPI cards
  const SPARKLINE_BASE = [0.5, 0.8, 0.6, 0.9, 0.7, 1.0, 0.85]

  // Tổng KH mua ≥2 lần giả định 35% tổng KH
  const totalCustomers   = 1250
  const returningCustomers = Math.round(totalCustomers * 0.35)
  const retentionRate    = ((returningCustomers / totalCustomers) * 100).toFixed(1)

  // Phân khúc KH: New / Returning / VIP / At Risk
  const newCustomers  = Math.round(totalOrders * 0.3)
  const vipCustomers  = Math.round(totalCustomers * 0.08)
  const atRiskCustomers = Math.round(totalCustomers * 0.12)
  const returningSeg  = totalCustomers - newCustomers - vipCustomers - atRiskCustomers

  const topProductsRaw = [
    { productName: 'Áo thun Unisex Cotton', channel: 'Shopee',      orders: 380, revenue: totalRevenue * 0.12 },
    { productName: 'Quần jeans Slim Fit',   channel: 'Lazada',      orders: 295, revenue: totalRevenue * 0.09 },
    { productName: 'Giày thể thao Nam',     channel: 'TikTok Shop', orders: 260, revenue: totalRevenue * 0.08 },
    { productName: 'Túi xách Nữ HQ',        channel: 'Shopee',      orders: 225, revenue: totalRevenue * 0.07 },
    { productName: 'Đầm maxi Boho',         channel: 'Facebook',    orders: 190, revenue: totalRevenue * 0.06 },
  ]
  const totalTopRevenue = topProductsRaw.reduce((s, p) => s + p.revenue, 0)
  const topProducts = topProductsRaw.map(p => ({
    ...p,
    revContribPct: ((p.revenue / totalRevenue) * 100).toFixed(1),
  }))

  // Bảng top sản phẩm theo kênh (top 3 mỗi kênh)
  const productsByChannel = channels.map(ch => ({
    channelName: ch.channelName,
    products: [
      { productName: `SP A - ${ch.channelName.split(' ')[0]}`, orders: Math.round(200 + Math.random() * 150), revenue: Math.round(totalRevenue * ch.pct * 0.30) },
      { productName: `SP B - ${ch.channelName.split(' ')[0]}`, orders: Math.round(130 + Math.random() * 100), revenue: Math.round(totalRevenue * ch.pct * 0.22) },
      { productName: `SP C - ${ch.channelName.split(' ')[0]}`, orders: Math.round(80  + Math.random() * 70),  revenue: Math.round(totalRevenue * ch.pct * 0.15) },
    ],
  }))

  // Tồn kho mở rộng
  const inventoryRaw = [
    { product: 'Áo thun',    stock: 320, forecast: 280, returnRate: 2.1, dailySales: 18 },
    { product: 'Quần jeans', stock: 180, forecast: 220, returnRate: 3.5, dailySales: 22 },
    { product: 'Giày',       stock:  95, forecast: 150, returnRate: 5.2, dailySales: 12 },
    { product: 'Túi xách',   stock: 240, forecast: 200, returnRate: 1.8, dailySales: 10 },
    { product: 'Đầm maxi',   stock: 160, forecast: 130, returnRate: 4.0, dailySales: 14 },
    { product: 'Áo khoác',   stock: 410, forecast: 200, returnRate: 1.2, dailySales:  8 },
    { product: 'Quần short',  stock:  42, forecast:  90, returnRate: 3.0, dailySales: 16 },
  ]
  const inventory = inventoryRaw.map(item => ({
    ...item,
    stockDiffPct: (((item.stock - item.forecast) / item.forecast) * 100).toFixed(1),
    daysOfStock:  item.dailySales > 0 ? Math.round(item.stock / item.dailySales) : 999,
  }))

  // KPI tồn kho
  const avgDIO         = Math.round(inventory.reduce((s, i) => s + i.daysOfStock, 0) / inventory.length)
  const overstockItems = inventory.filter(i => i.stock > i.forecast * 1.3).length
  const stockoutItems  = inventory.filter(i => i.stock < i.dailySales * 7).length
  const overstockRate  = ((overstockItems / inventory.length) * 100).toFixed(1)
  const stockoutRate   = ((stockoutItems  / inventory.length) * 100).toFixed(1)

  // Top 5 tồn cao nhất và sắp hết
  const top5Overstock = [...inventory].sort((a, b) => b.stock - a.stock).slice(0, 5)
  const top5LowStock  = [...inventory].filter(i => i.stock < i.dailySales * 14).sort((a, b) => (a.stock / a.dailySales) - (b.stock / b.dailySales)).slice(0, 5)

  // Tỷ lệ hoàn trả theo kênh
  const returnByChannel = channels.map(ch => ({
    channelName: ch.channelName,
    returnRate:  (1.5 + Math.random() * 4).toFixed(1),
  }))

  return {
    kpi: {
      totalRevenue, totalProfit, totalOrders,
      avgOrderValue:      Math.round(totalRevenue / totalOrders),
      conversionRate:     3.8 + Math.random() * 1.2,
      newCustomers,
      retentionRate,
      roi:                ((totalProfit / (totalRevenue * 0.25)) * 100).toFixed(1),
      revenueGrowthPct:   12.5,
      ordersGrowthPct:    8.3,
      customersGrowthPct: 5.1,
      profitMarginPct:    Math.round(totalProfit / totalRevenue * 1000) / 10,
    },
    sparklines: {
      revenue:     SPARKLINE_BASE.map(v => ({ v: v * totalRevenue / days * 7 })),
      orders:      SPARKLINE_BASE.map(v => ({ v: Math.round(v * 30) })),
      newCustomers:SPARKLINE_BASE.map(v => ({ v: Math.round(v * 20) })),
      retention:   [0.32, 0.34, 0.33, 0.36, 0.35, 0.37, 0.35].map(v => ({ v: Math.round(v * 100) })),
      profit:      SPARKLINE_BASE.map(v => ({ v: v * totalProfit / days * 7 })),
      conversion:  [3.2, 3.5, 3.8, 3.4, 3.9, 4.1, 3.8].map(v => ({ v })),
    },
    revenueByDay,
    revenueByChannel: channels.map(ch => ({
      channelName:  ch.channelName,
      revenue:      totalRevenue * ch.pct,
      orders:       Math.round(totalOrders * ch.pct),
      revenuePct:   ch.pct * 100,
      adSpend:      ch.adSpend,
      roas:         ((totalRevenue * ch.pct) / ch.adSpend).toFixed(1),
      cac:          Math.round(ch.adSpend / (totalOrders * ch.pct * 0.3)),
      growth:       ((-5 + Math.random() * 25)).toFixed(1),
      roasTarget:   4.0,
    })),
    topProducts,
    productsByChannel,
    monthlyByChannel,
    customerSegments: [
      { name: 'VIP (>10tr)',      value: vipCustomers,   clv: 25_000_000, freq: 8   },
      { name: 'Thân thiết',       value: returningSeg,   clv:  8_000_000, freq: 4   },
      { name: 'Mới',              value: newCustomers,   clv:  2_000_000, freq: 1   },
      { name: 'Không hoạt động',  value: atRiskCustomers,clv:    500_000, freq: 0.5 },
    ],
    customerSegmentCards: [
      { key: 'new',       label: 'Mới',         count: newCustomers,    total: totalCustomers, color: '#6366F1', icon: 'person_add' },
      { key: 'returning', label: 'Quay lại',     count: returningSeg,    total: totalCustomers, color: '#10B981', icon: 'replay' },
      { key: 'vip',       label: 'VIP',          count: vipCustomers,    total: totalCustomers, color: '#F59E0B', icon: 'workspace_premium' },
      { key: 'atrisk',    label: 'Nguy cơ rời',  count: atRiskCustomers, total: totalCustomers, color: '#EF4444', icon: 'warning' },
    ],
    funnel: [
      { stage: 'Lượt truy cập', value: 45000 },
      { stage: 'Xem sản phẩm',  value: 18000 },
      { stage: 'Thêm giỏ hàng', value:  6200 },
      { stage: 'Đặt hàng',      value:  2800 },
      { stage: 'Thanh toán',    value:  2450 },
    ],
    heatmap: (() => {
      const rows = []
      for (let h = 0; h < 24; h += 2)
        ['T2','T3','T4','T5','T6','T7','CN'].forEach(day =>
          rows.push({ hour: `${h}:00`, day, orders: Math.round(Math.random() * 60 + (h >= 8 && h <= 20 ? 30 : 5)) }))
      return rows
    })(),
    radarData: channels.map(ch => ({
      channel:    ch.channelName.split(' ')[0],
      adCost:     Math.round(ch.adSpend / 1_000_000 * 10),
      engagement: Math.round(70 + Math.random() * 30),
      conversion: Math.round(ch.pct * 300 + Math.random() * 20),
      revenue:    Math.round(ch.pct * 100),
    })),
    inventory,
    inventoryKpi: { avgDIO, overstockRate, stockoutRate },
    top5Overstock,
    top5LowStock,
    returnByChannel,
    // Chi phí quảng cáo theo loại
    adTypeCosts: [
      { name: 'Sponsored Ads',    value: 18_500_000 },
      { name: 'Display Banner',   value:  9_200_000 },
      { name: 'Video / Reels',    value: 12_800_000 },
      { name: 'Influencer',       value:  7_500_000 },
      { name: 'Google Search',    value:  5_000_000 },
    ],
    totalCustomers,
  }
}

const CHANNEL_KEYS  = ['all', 'shopee', 'lazada', 'tiktok', 'facebook', 'website']
const CHART_COLORS  = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316']

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

// Sparkline mini — không có axes/legend/tooltip, width=120 height=40
function Sparkline({ data, color = '#6366F1' }) {
  return (
    <LineChart width={120} height={40} data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
    </LineChart>
  )
}

function KpiCard({ label, value, trend, trendLabel, icon, color = 'var(--primary-500)', sparkData, sparkColor }) {
  const up = trend > 0
  return (
    <div className="lcard lcard-hover px-4 py-3 cursor-default flex-shrink-0" style={{ minWidth: 160 }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="icon icon-sm" style={{ color, fontSize: 16 }}>{icon}</span>
        <span className="text-caption font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="text-title font-bold font-mono mb-0.5" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 text-caption mb-1">
          <span className="icon" style={{ fontSize: 12, color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
            {up ? 'arrow_upward' : 'arrow_downward'}
          </span>
          <span style={{ color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>{Math.abs(trend)}%</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{trendLabel}</span>
        </div>
      )}
      {/* Sparkline mini bên dưới số liệu */}
      {sparkData && (
        <div className="mt-1" style={{ opacity: 0.75 }}>
          <Sparkline data={sparkData} color={sparkColor || color} />
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

// ── DrillDownModal — component chung dùng cho nhiều tab ──────────────────────
const PAGE_SIZE = 20

function DrillDownModal({ title, subtitle, columns, data, onClose, onExport }) {
  const [page, setPage] = useState(0)

  // Đóng modal khi nhấn phím Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const maxPage     = Math.max(0, Math.ceil(data.length / PAGE_SIZE) - 1)
  const start       = page * PAGE_SIZE
  const pagedData   = data.slice(start, start + PAGE_SIZE)
  const pageNumbers = Array.from({ length: maxPage + 1 }, (_, i) => i)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Modal container — dừng click bubble */}
      <div
        className="w-full max-w-4xl rounded-xl shadow-2xl flex flex-col"
        style={{ maxHeight: '90vh', background: 'var(--bg-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onExport && (
              <button
                onClick={onExport}
                className="lbtn lbtn-secondary text-xs"
                style={{ height: 32 }}
              >
                <span className="icon icon-sm">download</span>
                Xuất CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[--bg-elevated]"
            >
              <span className="icon" style={{ color: 'var(--text-secondary)' }}>close</span>
            </button>
          </div>
        </div>

        {/* Body — bảng cuộn dọc */}
        <div className="overflow-auto flex-1" style={{ maxHeight: '60vh' }}>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0" style={{ background: 'var(--bg-elevated)' }}>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide"
                    style={{ color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)' }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedData.length > 0 ? pagedData.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)' }}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className="px-4 py-2.5"
                      style={{
                        borderBottom: '1px solid var(--border)',
                        textAlign: col.align ?? 'left',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {col.render ? col.render(row[col.key], row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={columns.length} className="py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer — pagination */}
        <div
          className="flex items-center justify-between px-6 py-3 border-t text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
        >
          <span>
            Hiển thị {data.length > 0 ? start + 1 : 0}–{Math.min(start + PAGE_SIZE, data.length)} / {data.length} kết quả
          </span>
          {maxPage > 0 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg disabled:opacity-40 hover:bg-[--bg-elevated]"
              >←</button>
              {pageNumbers.map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className="w-8 h-8 rounded-lg text-xs font-medium"
                  style={{
                    background: page === n ? 'var(--primary-500)' : 'transparent',
                    color: page === n ? 'white' : 'inherit',
                  }}
                >
                  {n + 1}
                </button>
              ))}
              <button
                disabled={page >= maxPage}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg disabled:opacity-40 hover:bg-[--bg-elevated]"
              >→</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab: 1 — Overview ─────────────────────────────────────────────────────────
function TabOverview({ data, compareMode, prevData }) {
  const { t }  = useTranslation()
  const kpi    = data.kpi
  const sp     = data.sparklines || {}

  // Dữ liệu chart gộp kỳ này + kỳ trước (index-based)
  const trendData = data.revenueByDay.map((d, i) => {
    const prev = prevData?.revenueByDay?.[i]
    return {
      date:           d.date.slice(5),
      netRevenue:     d.netRevenue,
      grossProfit:    d.grossProfit,
      prevRevenue:    prev?.netRevenue   ?? null,
      prevProfit:     prev?.grossProfit  ?? null,
    }
  })

  return (
    <div className="space-y-5">
      {/* KPI strip — thêm Khách hàng mới + Tỷ lệ giữ chân, mỗi card có sparkline */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        <KpiCard
          label={t('dashboard.kpi.revenue')}
          value={fmtM(kpi.totalRevenue)}
          trend={kpi.revenueGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="payments"
          sparkData={sp.revenue}
          sparkColor="#6366F1"
        />
        <KpiCard
          label={t('dashboard.kpi.orders')}
          value={kpi.totalOrders.toLocaleString('vi-VN')}
          trend={kpi.ordersGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="shopping_cart"
          sparkData={sp.orders}
          sparkColor="#10B981"
        />
        <KpiCard
          label="Khách hàng mới"
          value={kpi.newCustomers.toLocaleString('vi-VN')}
          trend={kpi.customersGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="person_add"
          color="#3B82F6"
          sparkData={sp.newCustomers}
          sparkColor="#3B82F6"
        />
        <KpiCard
          label="Tỷ lệ giữ chân"
          value={`${kpi.retentionRate}%`}
          icon="replay"
          color="#14B8A6"
          sparkData={sp.retention}
          sparkColor="#14B8A6"
        />
        <KpiCard
          label={t('dashboard.kpi.aov')}
          value={fmtM(kpi.avgOrderValue)}
          icon="receipt_long"
          color="var(--accent-500)"
        />
        <KpiCard
          label={t('dashboard.kpi.conversionRate')}
          value={`${kpi.conversionRate.toFixed(1)}%`}
          icon="conversion_path"
          color="#F59E0B"
          sparkData={sp.conversion}
          sparkColor="#F59E0B"
        />
        <KpiCard
          label={t('dashboard.kpi.profit')}
          value={fmtM(kpi.totalProfit)}
          trend={kpi.profitMarginPct}
          trendLabel={t('dashboard.compare')}
          icon="percent"
          color="#8B5CF6"
          sparkData={sp.profit}
          sparkColor="#8B5CF6"
        />
        <KpiCard
          label={t('dashboard.kpi.roi')}
          value={`${kpi.roi}%`}
          icon="trending_up"
          color="#EC4899"
        />
      </div>

      {/* Hero 2/3 + Donut 1/3 */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>{t('dashboard.chart.revenueTrend')}</SectionTitle>
            <div className="flex items-center gap-3 text-caption flex-wrap" style={{ color: 'var(--text-tertiary)' }}>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#6366F1' }} />{t('dashboard.series.revenue')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#10B981' }} />{t('dashboard.series.profit')}
              </span>
              {compareMode && prevData && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded border-t-2 border-dashed" style={{ background: 'transparent', borderColor: '#A5B4FC' }} />
                    DT kỳ trước
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded border-t-2 border-dashed" style={{ background: 'transparent', borderColor: '#6EE7B7' }} />
                    LN kỳ trước
                  </span>
                </>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                tickFormatter={(v, i) => i % Math.max(1, Math.floor(trendData.length / 8)) === 0 ? v : ''} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
                tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(0)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="netRevenue"  name={t('dashboard.series.revenue')} stroke="#6366F1" strokeWidth={2} fill="url(#revGrad)" dot={false} />
              <Area type="monotone" dataKey="grossProfit" name={t('dashboard.series.profit')}  stroke="#10B981" strokeWidth={2} fill="url(#proGrad)" dot={false} />
              {compareMode && prevData && (
                <>
                  <Area type="monotone" dataKey="prevRevenue" name="DT kỳ trước" stroke="#A5B4FC" strokeWidth={1.5} strokeDasharray="5 4" fill="none" dot={false} connectNulls />
                  <Area type="monotone" dataKey="prevProfit"  name="LN kỳ trước" stroke="#6EE7B7" strokeWidth={1.5} strokeDasharray="5 4" fill="none" dot={false} connectNulls />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle>{t('dashboard.chart.channelShare')}</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.revenueByChannel} dataKey="revenue" nameKey="channelName"
                cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={3}>
                {data.revenueByChannel.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
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
function TabSales({ data, compareMode, prevData }) {
  const { t } = useTranslation()
  const [drillProduct,        setDrillProduct]        = useState(null)
  // Toggle ẩn/hiện bảng raw data — mặc định ẩn
  const [showChannelTopTable, setShowChannelTopTable] = useState(false)

  // Dữ liệu theo tháng gộp kỳ này + kỳ trước (cho tab Sales)
  const monthlyCompare = compareMode && prevData
    ? data.monthlyByChannel.map((row, i) => {
        const prev = prevData.monthlyByChannel?.[i]
        if (!prev) return row
        const combined = { ...row }
        Object.keys(prev).forEach(k => {
          if (k !== 'month') combined[`prev_${k}`] = prev[k]
        })
        return combined
      })
    : null

  // Tính Pareto: sắp xếp theo doanh thu giảm dần, thêm % tích lũy
  const totalRevenue = data.revenueByChannel.reduce((s, ch) => s + ch.revenue, 0)
  const paretoData = (() => {
    const sorted = [...data.topProducts].sort((a, b) => b.revenue - a.revenue)
    let cum = 0
    const grandTotal = sorted.reduce((s, p) => s + p.revenue, 0)
    return sorted.map(p => {
      cum += p.revenue
      return {
        ...p,
        shortName:    p.productName.length > 14 ? p.productName.slice(0, 13) + '…' : p.productName,
        revM:         p.revenue / 1_000_000,
        cumulativePct: grandTotal > 0 ? parseFloat(((cum / grandTotal) * 100).toFixed(1)) : 0,
      }
    })
  })()

  // Mock dữ liệu drill-down đơn hàng của sản phẩm (TODO: gọi API thật)
  function getMockOrders(productName) {
    return Array.from({ length: 8 }, (_, i) => ({
      orderId:   `ORD-${10000 + i}`,
      date:      `2025-${String(Math.ceil((i+1)/3)).padStart(2,'0')}-${String(10 + i * 3).padStart(2,'0')}`,
      channel:   ['Shopee','Lazada','TikTok Shop','Facebook'][i % 4],
      qty:       Math.round(1 + Math.random() * 4),
      revenue:   Math.round(200_000 + Math.random() * 800_000),
      status:    ['Hoàn thành','Hoàn thành','Đang giao','Hoàn trả'][i % 4],
    }))
  }

  const drillColumns = [
    { key: 'orderId',  label: 'Mã đơn' },
    { key: 'date',     label: 'Ngày' },
    { key: 'channel',  label: 'Kênh' },
    { key: 'qty',      label: 'SL' },
    { key: 'revenue',  label: 'Doanh thu', render: v => v.toLocaleString('vi-VN') + ' VND' },
    { key: 'status',   label: 'Trạng thái' },
  ]

  return (
    <div className="space-y-5">
      {/* Grouped bar doanh thu kênh theo tháng (tab Sales) */}
      <div className="lcard p-5">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>{t('dashboard.chart.channelMonthly')}</SectionTitle>
          {compareMode && prevData && (
            <span className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary-600)' }}>
              So sánh kỳ trước (gạch ngang = kỳ trước)
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthlyCompare ?? data.monthlyByChannel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
              tickFormatter={v => `${(v/1_000_000).toFixed(0)}M`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
            {data.revenueByChannel.map((ch, i) => (
              <Bar key={ch.channelName} dataKey={ch.channelName} stackId="a"
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                radius={i === data.revenueByChannel.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
            ))}
            {compareMode && prevData && data.revenueByChannel.map((ch, i) => (
              <Line key={`prev_${ch.channelName}`} dataKey={`prev_${ch.channelName}`}
                name={`${ch.channelName} (kỳ trước)`}
                stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.5}
                strokeDasharray="4 3" dot={false} connectNulls />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Pareto chart + bảng Top 5 */}
      <div className="grid grid-cols-12 gap-4">
        {/* Biểu đồ Pareto */}
        <div className="lcard p-5 col-span-12 lg:col-span-7">
          <SectionTitle>Biểu đồ Pareto — Top sản phẩm</SectionTitle>
          <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Click vào cột để xem chi tiết đơn hàng
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={paretoData} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="shortName" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={44} tickFormatter={v => `${v.toFixed(0)}M`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="revM" name="Doanh thu (M₫)" fill="#6366F1" radius={[4,4,0,0]}
                onClick={entry => setDrillProduct(entry)} cursor="pointer" />
              <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="% Tích lũy"
                stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Bảng Top 5 với cột % đóng góp */}
        <div className="lcard p-5 col-span-12 lg:col-span-5">
          <SectionTitle>{t('dashboard.chart.top5Products')}</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-2 px-1 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Sản phẩm</th>
                  <th className="text-right py-2 px-1 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Doanh thu</th>
                  <th className="text-right py-2 px-1 font-semibold" style={{ color: 'var(--text-tertiary)' }}>% Đóng góp</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2 px-1 max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }}
                      title={p.productName}>{p.productName}</td>
                    <td className="py-2 px-1 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtM(p.revenue)}</td>
                    <td className="py-2 px-1 text-right font-mono font-bold"
                      style={{ color: parseFloat(p.revContribPct) >= 10 ? 'var(--accent-500)' : 'var(--text-primary)' }}>
                      {p.revContribPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bảng Top sản phẩm theo kênh — ẩn mặc định, toggle khi nhấn */}
      <div className="lcard p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Top sản phẩm theo kênh</SectionTitle>
          <button
            onClick={() => setShowChannelTopTable(v => !v)}
            className="lbtn lbtn-secondary text-xs"
            style={{ height: 30, marginBottom: 16 }}
          >
            {showChannelTopTable ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
          </button>
        </div>
        {/* Animation collapse/expand */}
        <div style={{ maxHeight: showChannelTopTable ? '2000px' : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Kênh</th>
                  <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Sản phẩm</th>
                  <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Số đơn</th>
                  <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {(data.productsByChannel || []).flatMap((ch, ci) =>
                  ch.products.map((p, pi) => (
                    <tr key={`${ci}-${pi}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      {pi === 0 && (
                        <td className="py-2 px-2 font-semibold" rowSpan={ch.products.length}
                          style={{ color: CHART_COLORS[ci % CHART_COLORS.length], verticalAlign: 'top', paddingTop: 10 }}>
                          {ch.channelName}
                        </td>
                      )}
                      <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{p.productName}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{p.orders.toLocaleString('vi-VN')}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtM(p.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* DrillDownModal khi click bar Pareto */}
      {drillProduct && (() => {
        const mockOrders = getMockOrders(drillProduct.productName)
        return (
          <DrillDownModal
            title={`Chi tiết đơn hàng — ${drillProduct.productName || drillProduct.shortName}`}
            columns={drillColumns}
            data={mockOrders}
            onClose={() => setDrillProduct(null)}
            onExport={() => exportCsv(`orders_${drillProduct.shortName}.csv`, mockOrders)}
          />
        )
      })()}
    </div>
  )
}

// ── Tab: 3 — Multi-channel ────────────────────────────────────────────────────
function TabMultiChannel({ data }) {
  const { t } = useTranslation()
  // Toggle ẩn/hiện bảng so sánh chi tiết — mặc định ẩn
  const [showChannelDetailTable, setShowChannelDetailTable] = useState(false)

  // Bảng so sánh chi tiết kênh
  const channelTableData = data.revenueByChannel.map(ch => ({
    channelName: ch.channelName,
    revenue:     ch.revenue,
    growth:      ch.growth,
    roas:        ch.roas,
    orders:      ch.orders,
    revPct:      ch.revenuePct.toFixed(1),
  }))

  // Ranking table theo từng chỉ số radar
  const radarMetrics = [
    { key: 'adCost',     label: 'Chi phí QC' },
    { key: 'engagement', label: 'Tương tác' },
    { key: 'conversion', label: 'Chuyển đổi' },
    { key: 'revenue',    label: 'Doanh thu (chỉ số)' },
  ]

  return (
    <div className="space-y-5">
      {/* Grouped bar + đường Total */}
      <div className="lcard p-5">
        <SectionTitle>{t('dashboard.chart.channelCompare')} — theo tháng</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data.monthlyByChannel} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
              tickFormatter={v => `${(v/1_000_000).toFixed(0)}M`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {data.revenueByChannel.map((ch, i) => (
              <Bar key={ch.channelName} dataKey={ch.channelName} fill={CHART_COLORS[i]} radius={[3,3,0,0]} />
            ))}
            {/* Đường Total tổng tất cả kênh */}
            <Line type="monotone" dataKey="Total" name="Tổng"
              stroke="#374151" strokeWidth={2.5} strokeDasharray="6 3"
              dot={{ fill: '#374151', r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Radar + Ranking table */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>{t('dashboard.chart.radar')}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={data.radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="channel" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <Radar name={t('dashboard.series.radarCost')}    dataKey="adCost"     stroke="#6366F1" fill="#6366F1" fillOpacity={0.2} />
              <Radar name={t('dashboard.series.radarEngage')}  dataKey="engagement" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
              <Radar name={t('dashboard.series.radarRevenue')} dataKey="revenue"    stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Ranking table theo chỉ số radar */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>Xếp hạng kênh theo chỉ số</SectionTitle>
          <div className="space-y-4">
            {radarMetrics.map(metric => {
              const ranked = [...data.radarData].sort((a, b) => b[metric.key] - a[metric.key])
              return (
                <div key={metric.key}>
                  <p className="text-caption font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{metric.label}</p>
                  <div className="space-y-1">
                    {ranked.map((ch, idx) => (
                      <div key={ch.channel} className="flex items-center gap-2 text-caption">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: idx === 0 ? '#F59E0B' : idx === 1 ? '#9CA3AF' : idx === 2 ? '#B45309' : 'var(--bg-elevated)', color: idx < 3 ? '#fff' : 'var(--text-tertiary)' }}>
                          {idx + 1}
                        </span>
                        <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{ch.channel}</span>
                        <span className="font-mono font-medium" style={{ color: CHART_COLORS[idx % CHART_COLORS.length] }}>{ch[metric.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bảng so sánh chi tiết — ẩn mặc định, toggle khi nhấn */}
      <div className="lcard p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Bảng so sánh chi tiết theo kênh</SectionTitle>
          <button
            onClick={() => setShowChannelDetailTable(v => !v)}
            className="lbtn lbtn-secondary text-xs"
            style={{ height: 30, marginBottom: 16 }}
          >
            {showChannelDetailTable ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
          </button>
        </div>
        {/* Animation collapse/expand */}
        <div style={{ maxHeight: showChannelDetailTable ? '2000px' : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Kênh','Doanh thu','Tăng trưởng%','ROAS','Số đơn','Tỷ trọng%'].map(h => (
                    <th key={h} className="text-right py-2 px-3 font-semibold first:text-left" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channelTableData.map((ch, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2 px-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{ch.channelName}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtM(ch.revenue)}</td>
                    <td className="py-2 px-3 text-right font-mono"
                      style={{ color: parseFloat(ch.growth) >= 0 ? 'var(--accent-500)' : 'var(--color-error)' }}>
                      {parseFloat(ch.growth) >= 0 ? '+' : ''}{ch.growth}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold"
                      style={{ color: parseFloat(ch.roas) >= 4 ? 'var(--accent-500)' : parseFloat(ch.roas) >= 2 ? '#F59E0B' : 'var(--color-error)' }}>
                      {ch.roas}x
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{ch.orders.toLocaleString('vi-VN')}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{ch.revPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: 4 — Customer Analytics ───────────────────────────────────────────────
function TabCustomer({ data }) {
  const { t }        = useTranslation()
  const maxFunnel    = data.funnel[0].value
  const [drillSeg, setDrillSeg] = useState(null)

  // Mock danh sách KH theo phân khúc
  function getMockCustomers(segKey) {
    const names = ['Nguyễn Văn A','Trần Thị B','Lê Văn C','Phạm Thị D','Hoàng Văn E','Đỗ Thị F','Ngô Văn G','Bùi Thị H']
    return names.map((name, i) => ({
      customerId: `KH-${2000 + i}`,
      name,
      phone:      `09${String(Math.floor(10000000 + Math.random()*89999999))}`,
      orders:     segKey === 'vip' ? 8 + i : segKey === 'returning' ? 2 + i : 1,
      totalSpent: segKey === 'vip' ? (15_000_000 + i * 2_000_000) : segKey === 'returning' ? (3_000_000 + i * 500_000) : 800_000,
      lastOrder:  `2025-${String(Math.ceil((i+1)/3)).padStart(2,'0')}-15`,
    }))
  }

  const custCols = [
    { key: 'customerId', label: 'Mã KH' },
    { key: 'name',       label: 'Tên' },
    { key: 'phone',      label: 'SĐT' },
    { key: 'orders',     label: 'Số đơn' },
    { key: 'totalSpent', label: 'Tổng chi', render: v => v.toLocaleString('vi-VN') + ' VND' },
    { key: 'lastOrder',  label: 'Đơn gần nhất' },
  ]

  return (
    <div className="space-y-5">
      {/* 4 Cards phân khúc KH */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(data.customerSegmentCards || []).map(seg => {
          const pct = ((seg.count / (data.totalCustomers || 1)) * 100).toFixed(1)
          return (
            <div key={seg.key}
              className="lcard lcard-hover px-4 py-3 cursor-pointer"
              onClick={() => setDrillSeg(seg)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="icon icon-sm" style={{ color: seg.color, fontSize: 18 }}>{seg.icon}</span>
                <span className="text-caption font-semibold" style={{ color: 'var(--text-secondary)' }}>{seg.label}</span>
              </div>
              <div className="text-xl font-bold font-mono" style={{ color: seg.color }}>
                {seg.count.toLocaleString('vi-VN')}
              </div>
              <div className="text-caption mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{pct}% tổng KH</div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Phễu chuyển đổi với drop-off */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>{t('dashboard.chart.funnel')}</SectionTitle>
          <div className="space-y-2 mt-2">
            {data.funnel.map((stage, i) => {
              const pct      = (stage.value / maxFunnel) * 100
              const convRate = i === 0 ? 100 : (stage.value / data.funnel[i - 1].value * 100).toFixed(1)
              const dropPct  = i === 0 ? null : (100 - parseFloat(convRate)).toFixed(1)
              return (
                <div key={i}>
                  {/* Drop-off text giữa các bước */}
                  {dropPct !== null && (
                    <div className="text-center text-caption py-0.5" style={{ color: '#FCA5A5' }}>
                      ↓ {dropPct}% bỏ qua
                    </div>
                  )}
                  <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span>{stage.stage}</span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                      {stage.value.toLocaleString('vi-VN')}
                      {i > 0 && <span style={{ color: 'var(--text-tertiary)' }}> ({convRate}%)</span>}
                    </span>
                  </div>
                  <div className="h-6 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-lg transition-all duration-700"
                      style={{ width: `${pct}%`, background: CHART_COLORS[i], minWidth: 40 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <SectionTitle>{t('dashboard.chart.clv')}</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="freq" name={t('dashboard.kpi.orders')} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="clv" name="CLV" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
                tickFormatter={v => fmtM(v)} />
              <ZAxis dataKey="value" range={[40, 280]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v, name) => name === 'CLV' ? fmtM(v) : v} />
              {data.customerSegments.map((seg, i) => (
                <Scatter key={i} name={seg.name} data={[seg]} fill={CHART_COLORS[i]} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="lcard p-5">
        <SectionTitle>{t('dashboard.chart.heatmap')}</SectionTitle>
        <div className="overflow-x-auto">
          <HeatmapGrid data={data.heatmap} />
        </div>
      </div>

      {/* DrillDown danh sách KH theo phân khúc */}
      {drillSeg && (() => {
        const customers = getMockCustomers(drillSeg.key)
        return (
          <DrillDownModal
            title={`Danh sách khách hàng — phân khúc "${drillSeg.label}"`}
            columns={custCols}
            data={customers}
            onClose={() => setDrillSeg(null)}
            onExport={() => exportCsv(`customers_${drillSeg.key}.csv`, customers)}
          />
        )
      })()}
    </div>
  )
}

function HeatmapGrid({ data }) {
  const { t }   = useTranslation()
  const days    = ['T2','T3','T4','T5','T6','T7','CN']
  const hours   = [...new Set(data.map(d => d.hour))].sort()
  const maxOrders = Math.max(...data.map(d => d.orders))

  return (
    <div>
      <div className="flex gap-1 mb-1 pl-12">
        {days.map(d => (
          <div key={d} className="w-8 text-center text-caption font-medium" style={{ color: 'var(--text-tertiary)' }}>{d}</div>
        ))}
      </div>
      {hours.map(h => (
        <div key={h} className="flex items-center gap-1 mb-1">
          <div className="w-11 text-caption text-right pr-1 shrink-0" style={{ color: 'var(--text-tertiary)' }}>{h}</div>
          {days.map(day => {
            const cell      = data.find(d => d.hour === h && d.day === day)
            const orders    = cell?.orders ?? 0
            const intensity = maxOrders > 0 ? orders / maxOrders : 0
            const bg        = `rgba(99,102,241,${(intensity * 0.8 + 0.05).toFixed(2)})`
            return (
              <div key={day} title={`${day} ${h}: ${orders}`}
                className="w-8 h-6 rounded cursor-default transition-all hover:scale-110"
                style={{ background: bg }} />
            )
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.heatmap.low')}</span>
        {[0.1,0.3,0.5,0.7,0.9].map(v => (
          <div key={v} className="w-4 h-3 rounded" style={{ background: `rgba(99,102,241,${v})` }} />
        ))}
        <span className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.heatmap.high')}</span>
      </div>
    </div>
  )
}

// ── Tab: 5 — Marketing & ROI ──────────────────────────────────────────────────
function TabMarketing({ data }) {
  const { t } = useTranslation()
  // Toggle ẩn/hiện bảng hiệu quả Marketing — mặc định ẩn
  const [showMarketingTable, setShowMarketingTable] = useState(false)

  const comboData = data.revenueByChannel.map(ch => ({
    name:       ch.channelName.split(' ')[0],
    adSpend:    ch.adSpend / 1_000_000,
    revenue:    ch.revenue / 1_000_000,
    roas:       parseFloat(ch.roas),
    roasTarget: ch.roasTarget || 4.0,
    cac:        ch.cac,
  }))

  // Label ROAS tùy chỉnh hiển thị trực tiếp trên bar
  const RoasLabel = ({ x, y, width, value }) => {
    if (!value) return null
    return (
      <text x={x + width / 2} y={y - 5} fill="#F59E0B" fontSize={10} textAnchor="middle" fontWeight="bold">
        {value}x
      </text>
    )
  }

  // Pie chart chi phí theo loại quảng cáo
  const adPieColors = ['#6366F1','#10B981','#F59E0B','#EC4899','#3B82F6']

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-12 gap-4">
        {/* ComboChart chi phí vs doanh thu + ROAS label */}
        <div className="lcard p-5 col-span-12 lg:col-span-8">
          <SectionTitle>{t('dashboard.chart.marketingCombo')}</SectionTitle>
          <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
            Số ROAS hiển thị trực tiếp trên cột doanh thu
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={comboData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={44} tickFormatter={v => `${v.toFixed(0)}M`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${v}x`} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="adSpend" name={t('dashboard.series.adCostM')}  fill="#EC4899" radius={[3,3,0,0]} />
              <Bar yAxisId="left" dataKey="revenue" name={t('dashboard.series.revenueM')} fill="#6366F1" radius={[3,3,0,0]}>
                {/* Label ROAS hiển thị trên đầu bar doanh thu */}
                <LabelList dataKey="roas" content={<RoasLabel />} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ROAS ranking bars */}
        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle>{t('dashboard.chart.roas')}</SectionTitle>
          <div className="space-y-3 mt-2">
            {[...comboData].sort((a,b) => b.roas - a.roas).map((ch, i) => (
              <div key={ch.name}>
                <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span>{ch.name}</span>
                  <span className="font-mono font-bold"
                    style={{ color: ch.roas >= 4 ? 'var(--accent-500)' : ch.roas >= 2 ? '#F59E0B' : 'var(--color-error)' }}>
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

      {/* Bảng CAC | ROAS | ROAS mục tiêu | Đánh giá — ẩn mặc định */}
      <div className="lcard p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>Bảng hiệu quả Marketing — CAC · ROAS · Mục tiêu</SectionTitle>
          <button
            onClick={() => setShowMarketingTable(v => !v)}
            className="lbtn lbtn-secondary text-xs"
            style={{ height: 30, marginBottom: 16 }}
          >
            {showMarketingTable ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
          </button>
        </div>
        <div style={{ maxHeight: showMarketingTable ? '2000px' : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Kênh','CAC','ROAS thực tế','ROAS mục tiêu','Đánh giá'].map(h => (
                    <th key={h} className="text-right py-2 px-3 font-semibold first:text-left" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comboData.map((ch, i) => {
                  const met = ch.roas >= ch.roasTarget
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 px-3 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{ch.name}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                        {ch.cac ? ch.cac.toLocaleString('vi-VN') + ' VND' : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold"
                        style={{ color: met ? 'var(--accent-500)' : 'var(--color-error)' }}>
                        {ch.roas}x
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-tertiary)' }}>{ch.roasTarget}x</td>
                      <td className="py-2 px-3 text-right">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: met ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: met ? 'var(--accent-500)' : 'var(--color-error)' }}>
                          {met ? '✓ Đạt' : '✗ Chưa đạt'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Chi phí theo loại quảng cáo */}
      <div className="grid grid-cols-12 gap-4">
        <div className="lcard p-5 col-span-12 lg:col-span-5">
          <SectionTitle>Chi phí theo loại quảng cáo</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.adTypeCosts || []} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3}>
                {(data.adTypeCosts || []).map((_, i) => <Cell key={i} fill={adPieColors[i % adPieColors.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmtM(v)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-7">
          <SectionTitle>Chi phí quảng cáo — phân bổ ngang</SectionTitle>
          <div className="space-y-3 mt-2">
            {(data.adTypeCosts || []).map((item, i) => {
              const total = (data.adTypeCosts || []).reduce((s, x) => s + x.value, 0)
              const pct   = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'
              return (
                <div key={i}>
                  <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <span>{item.name}</span>
                    <span className="font-mono">{fmtM(item.value)} <span style={{ color: 'var(--text-tertiary)' }}>({pct}%)</span></span>
                  </div>
                  <div className="h-2.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: adPieColors[i % adPieColors.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tab: 6 — Inventory & Operations ──────────────────────────────────────────
function TabInventory({ data }) {
  const { t } = useTranslation()
  const invKpi = data.inventoryKpi || { avgDIO: 0, overstockRate: '0.0', stockoutRate: '0.0' }

  const invKpis = [
    { label: 'Số ngày tồn kho (DIO)',    value: `${invKpi.avgDIO} ngày`, icon: 'hourglass_empty',   color: '#6366F1' },
    { label: 'Tỷ lệ tồn kho dư',         value: `${invKpi.overstockRate}%`, icon: 'inventory',      color: '#F59E0B' },
    { label: 'Tỷ lệ hết hàng',           value: `${invKpi.stockoutRate}%`,  icon: 'remove_shopping_cart', color: 'var(--color-error)' },
    { labelKey: 'invKpi.returnRate',      value: '3.1%',    icon: 'assignment_return', color: '#EC4899' },
    { labelKey: 'invKpi.cancelRate',      value: '2.4%',    icon: 'cancel',            color: 'var(--color-error)' },
    { labelKey: 'invKpi.deliverySuccess', value: '94.5%',   icon: 'local_shipping',    color: 'var(--accent-500)' },
    { labelKey: 'invKpi.processingTime',  value: '2.3h',    icon: 'timer',             color: '#F59E0B' },
  ]

  // Label % chênh lệch tồn kho
  const StockDiffLabel = ({ x, y, width, value }) => {
    if (!value) return null
    const num = parseFloat(value)
    const color = num > 0 ? '#10B981' : '#EF4444'
    return (
      <text x={x + width / 2} y={y - 5} fill={color} fontSize={10} textAnchor="middle" fontWeight="bold">
        {num > 0 ? '+' : ''}{value}%
      </text>
    )
  }

  const [returnTab,        setReturnTab]        = useState('product')
  // Toggle ẩn/hiện bảng Top 5 tồn cao nhất và sắp hết — mặc định ẩn
  const [showOverstockTable, setShowOverstockTable] = useState(false)
  const [showLowStockTable,  setShowLowStockTable]  = useState(false)

  return (
    <div className="space-y-5">
      {/* KPI strip mở rộng */}
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {invKpis.map((k, i) => (
          <KpiCard
            key={i}
            label={k.label || t(`dashboard.${k.labelKey}`)}
            value={k.value}
            icon={k.icon}
            color={k.color}
          />
        ))}
      </div>

      {/* Biểu đồ tồn kho vs Dự báo với nhãn % chênh lệch */}
      <div className="lcard p-5">
        <SectionTitle>{t('dashboard.chart.inventory')} — Tồn kho vs Dự báo</SectionTitle>
        <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Nhãn trên cột thể hiện % chênh lệch thực tế so với dự báo
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data.inventory} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="product" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="stock"    name={t('dashboard.series.stock')}    fill="#6366F1" radius={[3,3,0,0]}>
              <LabelList dataKey="stockDiffPct" content={<StockDiffLabel />} />
            </Bar>
            <Bar dataKey="forecast" name={t('dashboard.series.forecast')} fill="#10B981" radius={[3,3,0,0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Top 5 tồn cao nhất và sắp hết hàng */}
      <div className="grid grid-cols-12 gap-4">
        {/* Bảng Top 5 tồn cao nhất — ẩn mặc định */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <div className="flex items-center justify-between">
            <SectionTitle>Top 5 tồn kho cao nhất (nguy cơ ứ đọng)</SectionTitle>
            <button
              onClick={() => setShowOverstockTable(v => !v)}
              className="lbtn lbtn-secondary text-xs"
              style={{ height: 30, marginBottom: 16 }}
            >
              {showOverstockTable ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
            </button>
          </div>
          <div style={{ maxHeight: showOverstockTable ? '2000px' : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-caption border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Sản phẩm','Tồn kho','Dự báo','% Chênh','DIO'].map(h => (
                      <th key={h} className="text-right py-2 px-2 font-semibold first:text-left" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.top5Overstock || []).map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{item.product}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{item.stock.toLocaleString('vi-VN')}</td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-tertiary)' }}>{item.forecast.toLocaleString('vi-VN')}</td>
                      <td className="py-2 px-2 text-right font-mono"
                        style={{ color: parseFloat(item.stockDiffPct) > 0 ? '#F59E0B' : 'var(--accent-500)' }}>
                        {parseFloat(item.stockDiffPct) > 0 ? '+' : ''}{item.stockDiffPct}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{item.daysOfStock}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bảng Top 5 sắp hết hàng — ẩn mặc định */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <div className="flex items-center justify-between">
            <SectionTitle>Top 5 sắp hết hàng (tồn &lt; 14 ngày bán)</SectionTitle>
            <button
              onClick={() => setShowLowStockTable(v => !v)}
              className="lbtn lbtn-secondary text-xs"
              style={{ height: 30, marginBottom: 16 }}
            >
              {showLowStockTable ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
            </button>
          </div>
          <div style={{ maxHeight: showLowStockTable ? '2000px' : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
            {data.top5LowStock && data.top5LowStock.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-caption border-collapse">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Sản phẩm','Tồn kho','Bán/ngày','Còn (ngày)'].map(h => (
                        <th key={h} className="text-right py-2 px-2 font-semibold first:text-left" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.top5LowStock.map((item, i) => {
                      const daysLeft = item.dailySales > 0 ? Math.round(item.stock / item.dailySales) : 999
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="py-2 px-2" style={{ color: 'var(--text-secondary)' }}>{item.product}</td>
                          <td className="py-2 px-2 text-right font-mono font-bold" style={{ color: 'var(--color-error)' }}>{item.stock}</td>
                          <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-tertiary)' }}>{item.dailySales}</td>
                          <td className="py-2 px-2 text-right font-mono font-bold"
                            style={{ color: daysLeft <= 7 ? 'var(--color-error)' : '#F59E0B' }}>
                            {daysLeft}d
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-caption mt-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Tất cả sản phẩm đều còn tồn kho đủ
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Section hoàn đơn — tab nhỏ: Theo sản phẩm / Theo kênh */}
      <div className="lcard p-5">
        {/* Tab nhỏ */}
        <div className="flex items-center gap-1 mb-4">
          <SectionTitle>{t('dashboard.chart.returnRate')}</SectionTitle>
          <div className="ml-auto flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
            {[{ key: 'product', label: 'Theo sản phẩm' }, { key: 'channel', label: 'Theo kênh' }].map(tab => (
              <button key={tab.key} onClick={() => setReturnTab(tab.key)}
                className="px-3 py-1 rounded-md text-caption font-medium transition-all"
                style={{
                  background: returnTab === tab.key ? 'var(--bg-surface)' : 'transparent',
                  color:      returnTab === tab.key ? 'var(--primary-600)' : 'var(--text-secondary)',
                  boxShadow:  returnTab === tab.key ? 'var(--shadow-sm)' : 'none',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {returnTab === 'product' ? (
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
                    style={{ width: `${item.returnRate / 6 * 100}%`,
                      background: item.returnRate > 4 ? 'var(--color-error)' : item.returnRate > 2.5 ? '#F59E0B' : 'var(--accent-500)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(data.returnByChannel || []).map((ch, i) => (
              <div key={i}>
                <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span>{ch.channelName}</span>
                  <span className="font-mono font-bold"
                    style={{ color: parseFloat(ch.returnRate) > 4 ? 'var(--color-error)' : parseFloat(ch.returnRate) > 2.5 ? '#F59E0B' : 'var(--accent-500)' }}>
                    {ch.returnRate}%
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${parseFloat(ch.returnRate) / 6 * 100}%`,
                      background: parseFloat(ch.returnRate) > 4 ? 'var(--color-error)' : parseFloat(ch.returnRate) > 2.5 ? '#F59E0B' : 'var(--accent-500)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── DashboardPage ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t }      = useTranslation()
  const [activeTab,   setActiveTab]   = useState('overview')
  const [presetKey,   setPresetKey]   = useState('year2025')
  const [customFrom,  setCustomFrom]  = useState('2025-01-01')
  const [customTo,    setCustomTo]    = useState('2025-12-31')
  const [channel,     setChannel]     = useState('all')
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [isMock,      setIsMock]      = useState(false)
  const [tvy,         setTvy]         = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [prevData,    setPrevData]    = useState(null)

  // Định nghĩa bên trong component để t() được gọi đúng context
  const QUICK_PRESETS = [
    { key: 'year2025', label: t('dashboard.preset.year2025'), from: '2025-01-01',    to: '2025-12-31' },
    { key: '30d',      label: t('dashboard.preset.30d'),      from: () => relDate(-30), to: () => relDate(0) },
    { key: '90d',      label: t('dashboard.preset.90d'),      from: () => relDate(-90), to: () => relDate(0) },
    { key: 'custom',   label: t('dashboard.preset.custom'),   from: null,            to: null },
  ]

  const TABS = [
    { key: 'overview',     label: t('dashboard.tab.overview'),     icon: 'dashboard'   },
    { key: 'sales',        label: t('dashboard.tab.sales'),        icon: 'bar_chart'   },
    { key: 'multichannel', label: t('dashboard.tab.multichannel'), icon: 'hub'         },
    { key: 'customer',     label: t('dashboard.tab.customer'),     icon: 'people'      },
    { key: 'marketing',    label: t('dashboard.tab.marketing'),    icon: 'campaign'    },
    { key: 'inventory',    label: t('dashboard.tab.inventory'),    icon: 'inventory_2' },
  ]

  function getRange() {
    if (presetKey === 'custom') return { from: customFrom, to: customTo }
    const preset = QUICK_PRESETS.find(p => p.key === presetKey)
    return resolvePreset(preset)
  }

  // Tính kỳ trước có cùng độ dài với kỳ hiện tại
  function getPrevRange(from, to) {
    const msFrom = new Date(from).getTime()
    const msTo   = new Date(to).getTime()
    const days   = Math.round((msTo - msFrom) / 86_400_000) + 1
    const prevTo   = new Date(msFrom - 86_400_000).toISOString().slice(0, 10)
    const prevFrom = new Date(msFrom - days * 86_400_000).toISOString().slice(0, 10)
    return { from: prevFrom, to: prevTo }
  }

  // fetchData phụ thuộc filter state → re-fetch khi filter thay đổi
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { from, to } = getRange()
    try {
      // Truyền from, to, channel vào API call để filter đúng
      const ch  = channel === 'all' ? null : channel
      const res = await getDashboard(from, to, ch)
      const hasFullData =
        res?.kpi?.totalRevenue > 0 &&
        typeof res?.kpi?.conversionRate === 'number' &&
        Array.isArray(res?.monthlyByChannel) &&
        Array.isArray(res?.customerSegments) &&
        Array.isArray(res?.funnel)
      if (!hasFullData) throw new Error('incomplete_data')
      setData(res)
      setIsMock(false)
    } catch {
      // Fallback mock data với params filter đã được áp dụng vào generateMockData
      setData(generateMockData(from, to))
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, customFrom, customTo, channel])

  // Fetch dữ liệu kỳ trước khi compareMode bật
  useEffect(() => {
    if (!compareMode) { setPrevData(null); return }
    const { from, to } = getRange()
    const prev = getPrevRange(from, to)
    const ch = channel === 'all' ? null : channel
    getDashboard(prev.from, prev.to, ch)
      .catch(() => generateMockData(prev.from, prev.to))
      .then(setPrevData)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, presetKey, customFrom, customTo, channel])

  // Re-render/re-fetch khi bất kỳ filter nào thay đổi
  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    getTodayVsYesterday()
      .then(setTvy)
      .catch(() => setTvy({
        today:     { revenue: 12_500_000, orders: 43, profit: 3_800_000 },
        yesterday: { revenue: 10_200_000, orders: 38, profit: 3_100_000 },
        revenuePct: 22.5, ordersPct: 13.2,
      }))
  }, [])

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
                  color:      presetKey === p.key ? 'var(--primary-600)' : 'var(--text-secondary)',
                  boxShadow:  presetKey === p.key ? 'var(--shadow-sm)' : 'none',
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
          {/* Filter kênh — kết nối với fetchData qua channel state */}
          <select value={channel} onChange={e => setChannel(e.target.value)} className="linput !h-9 !px-3 text-body" style={{ width: 140 }}>
            {CHANNEL_KEYS.map(k => <option key={k} value={k}>{t(`dashboard.channel.${k}`)}</option>)}
          </select>
          {/* Toggle so sánh kỳ trước */}
          <button
            onClick={() => setCompareMode(m => !m)}
            className="lbtn !py-0 !h-9 gap-1.5 text-xs font-medium"
            style={{
              background: compareMode ? 'rgba(99,102,241,0.12)' : 'var(--bg-elevated)',
              color:      compareMode ? 'var(--primary-600)'     : 'var(--text-secondary)',
              border:     compareMode ? '1.5px solid var(--primary-400)' : '1.5px solid transparent',
            }}
            title="So sánh với kỳ trước cùng độ dài"
          >
            <span className="icon text-base">compare_arrows</span>
            <span className="hidden sm:inline">So sánh kỳ trước</span>
          </button>
          <button onClick={fetchData} className="lbtn lbtn-secondary !py-0 !h-9" title={t('common.refresh')}>
            <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>refresh</span>
          </button>
        </div>
      </div>

      <MockToast show={isMock} />

      {/* ── Today vs Yesterday widget ── */}
      {tvy && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            {
              label: 'Doanh thu hôm nay',
              value: fmtM(tvy.today.revenue),
              prev:  fmtM(tvy.yesterday.revenue),
              pct:   tvy.revenuePct,
              icon:  'payments',
            },
            {
              label: 'Đơn hàng hôm nay',
              value: tvy.today.orders.toLocaleString(),
              prev:  tvy.yesterday.orders.toLocaleString(),
              pct:   tvy.ordersPct,
              icon:  'shopping_bag',
            },
            {
              label: 'Lợi nhuận hôm nay',
              value: fmtM(tvy.today.profit),
              prev:  fmtM(tvy.yesterday.profit),
              pct:   tvy.today.revenue > 0 ? +((tvy.today.profit / tvy.today.revenue) * 100).toFixed(1) : 0,
              icon:  'trending_up',
              pctLabel: 'Biên LN',
            },
          ].map(card => {
            const isUp = card.pct >= 0
            return (
              <div key={card.label} className="lcard p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{card.label}</span>
                  <span className="icon text-base" style={{ color: isUp ? 'var(--accent-500)' : '#EF4444', fontSize: 18 }}>
                    {card.icon}
                  </span>
                </div>
                <div className="font-mono text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {card.value}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color:      isUp ? 'var(--accent-500)'    : '#EF4444',
                        }}>
                    {isUp ? '+' : ''}{card.pct}%
                  </span>
                  <span className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {card.pctLabel ?? 'vs hôm qua'} ({card.prev})
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab navigation ── */}
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
          {activeTab === 'overview'     && <TabOverview     data={data} compareMode={compareMode} prevData={prevData} />}
          {activeTab === 'sales'        && <TabSales        data={data} compareMode={compareMode} prevData={prevData} />}
          {activeTab === 'multichannel' && <TabMultiChannel data={data} />}
          {activeTab === 'customer'     && <TabCustomer     data={data} />}
          {activeTab === 'marketing'    && <TabMarketing    data={data} />}
          {activeTab === 'inventory'    && <TabInventory    data={data} />}
        </div>
      )}
    </div>
  )
}
