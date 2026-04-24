import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import RevenueAreaChart from '../../components/charts/RevenueAreaChart'
import ChannelRings     from '../../components/charts/ChannelRings'
import LollipopChart    from '../../components/charts/LollipopChart'
import { SkeletonCard } from '../../components/ui/Skeleton'
import MockToast from '../../components/ui/MockToast'
import { getDashboard } from '../../api/dashboardApi'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function generateMockData(from, to) {
  const start = new Date(from)
  const end   = new Date(to)
  const days  = Math.round((end - start) / 86_400_000) + 1
  const revenueByDay = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000)
    const base = 8_000_000 + Math.sin(i / 10) * 3_000_000
    const netRevenue  = Math.round(base + Math.random() * 2_000_000)
    const grossProfit = Math.round(netRevenue * (0.28 + Math.random() * 0.08))
    return { date: d.toISOString().slice(0, 10), netRevenue, grossProfit, orderCount: Math.round(15 + Math.random() * 20) }
  })
  const totalRevenue = revenueByDay.reduce((s, d) => s + d.netRevenue, 0)
  const totalProfit  = revenueByDay.reduce((s, d) => s + d.grossProfit, 0)
  const totalOrders  = revenueByDay.reduce((s, d) => s + d.orderCount, 0)
  return {
    kpi: {
      totalRevenue, totalProfit, totalOrders,
      avgOrderValue:      Math.round(totalRevenue / totalOrders),
      newCustomers:       Math.round(totalOrders * 0.3),
      revenueGrowthPct:   12.5,
      ordersGrowthPct:    8.3,
      customersGrowthPct: 5.1,
      profitMarginPct:    Math.round(totalProfit / totalRevenue * 1000) / 10,
    },
    revenueByDay,
    revenueByChannel: [
      { channelName: 'Shopee',      revenue: totalRevenue * 0.35, orders: Math.round(totalOrders * 0.35), revenuePct: 35.0 },
      { channelName: 'Lazada',      revenue: totalRevenue * 0.25, orders: Math.round(totalOrders * 0.25), revenuePct: 25.0 },
      { channelName: 'TikTok Shop', revenue: totalRevenue * 0.20, orders: Math.round(totalOrders * 0.20), revenuePct: 20.0 },
      { channelName: 'Facebook',    revenue: totalRevenue * 0.12, orders: Math.round(totalOrders * 0.12), revenuePct: 12.0 },
      { channelName: 'Website',     revenue: totalRevenue * 0.08, orders: Math.round(totalOrders * 0.08), revenuePct: 8.0  },
    ],
    topProducts: [
      { productId: 1, productName: 'Áo thun Unisex Cotton', channel: 'Shopee',      totalOrders: 380, revenue: totalRevenue * 0.12 },
      { productId: 2, productName: 'Quần jeans Slim Fit',   channel: 'Lazada',      totalOrders: 295, revenue: totalRevenue * 0.09 },
      { productId: 3, productName: 'Giày thể thao Nam',     channel: 'TikTok Shop', totalOrders: 260, revenue: totalRevenue * 0.08 },
      { productId: 4, productName: 'Túi xách Nữ HQ',        channel: 'Shopee',      totalOrders: 225, revenue: totalRevenue * 0.07 },
      { productId: 5, productName: 'Đầm maxi Boho',         channel: 'Facebook',    totalOrders: 190, revenue: totalRevenue * 0.06 },
    ],
  }
}

// ── Quick presets ─────────────────────────────────────────────────────────────
const QUICK_PRESETS = [
  { key: 'year2025', label: '2025',        from: '2025-01-01', to: '2025-12-31' },
  { key: '30d',      label: '30 ngày',     from: () => relDate(-30), to: () => relDate(0) },
  { key: '90d',      label: '90 ngày',     from: () => relDate(-90), to: () => relDate(0) },
  { key: 'custom',   label: 'Tùy chọn',   from: null, to: null },
]
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok', 'facebook', 'website']

function resolvePreset(p) {
  return {
    from: typeof p.from === 'function' ? p.from() : p.from,
    to:   typeof p.to   === 'function' ? p.to()   : p.to,
  }
}

// ── MetricChip ────────────────────────────────────────────────────────────────
function MetricChip({ label, value, trend, icon }) {
  const up = trend > 0
  return (
    <div
      className="lcard lcard-hover flex-shrink-0 px-4 py-3 cursor-default"
      style={{ minWidth: 148 }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="icon icon-sm" style={{ color: 'var(--primary-500)', fontSize: 16 }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      </div>
      <div className="font-mono text-xl font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-1 text-xs">
          <span className="icon" style={{ fontSize: 12, color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
            {up ? 'arrow_upward' : 'arrow_downward'}
          </span>
          <span style={{ color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
            {Math.abs(trend)}%
          </span>
          <span style={{ color: 'var(--text-tertiary)' }}>so sánh</span>
        </div>
      )}
    </div>
  )
}

// ── ActivityChip ──────────────────────────────────────────────────────────────
function ActivityChip({ channel, revenue, orders }) {
  return (
    <div className="lcard flex-shrink-0 px-4 py-3" style={{ minWidth: 180 }}>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{channel}</div>
      <div className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
        ₫{(revenue / 1_000_000).toFixed(1)}M
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
        {orders.toLocaleString('vi-VN')} đơn
      </div>
    </div>
  )
}

// ── DashboardPage ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t } = useTranslation()

  // Default 2025 vì DW có data 2025
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
      const hasData = res?.kpi?.totalRevenue > 0 || res?.kpi?.totalOrders > 0
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('dashboard.title')}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('common.lastUpdated')}: {new Date().toLocaleString('vi-VN')}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset buttons */}
          <div
            className="flex items-center p-1 gap-1 rounded-lg"
            style={{ background: 'var(--bg-elevated)' }}
          >
            {QUICK_PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => setPresetKey(p.key)}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                style={{
                  background: presetKey === p.key ? 'var(--bg-surface)' : 'transparent',
                  color: presetKey === p.key ? 'var(--primary-600)' : 'var(--text-secondary)',
                  boxShadow: presetKey === p.key ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {presetKey === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date" value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="linput !h-9 !px-3 text-sm" style={{ width: 140 }}
              />
              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
              <input
                type="date" value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="linput !h-9 !px-3 text-sm" style={{ width: 140 }}
              />
            </div>
          )}

          {/* Channel select */}
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="linput !h-9 !px-3 text-sm"
            style={{ width: 140 }}
          >
            {CHANNEL_KEYS.map(k => (
              <option key={k} value={k}>{t(`dashboard.channel.${k}`)}</option>
            ))}
          </select>

          <button
            onClick={fetchData}
            className="lbtn lbtn-secondary !py-0 !h-9"
            title={t('common.refresh')}
          >
            <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>refresh</span>
          </button>
        </div>
      </div>

      <MockToast show={isMock} />

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
          </div>
          <SkeletonCard />
        </div>
      ) : data && (
        <>
          {/* Zone 1 — Metric Strip */}
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
            <MetricChip
              label={t('dashboard.kpi.revenue')}
              value={`₫${(data.kpi.totalRevenue / 1_000_000).toFixed(1)}M`}
              trend={data.kpi.revenueGrowthPct}
              icon="payments"
            />
            <MetricChip
              label={t('dashboard.kpi.orders')}
              value={data.kpi.totalOrders.toLocaleString('vi-VN')}
              trend={data.kpi.ordersGrowthPct}
              icon="shopping_cart"
            />
            <MetricChip
              label={t('dashboard.kpi.aov')}
              value={`₫${(data.kpi.avgOrderValue / 1_000).toFixed(0)}K`}
              icon="receipt_long"
            />
            <MetricChip
              label={t('dashboard.kpi.newCustomers')}
              value={data.kpi.newCustomers.toLocaleString('vi-VN')}
              trend={data.kpi.customersGrowthPct}
              icon="person_add"
            />
            <MetricChip
              label="Biên lợi nhuận"
              value={`${data.kpi.profitMarginPct}%`}
              icon="percent"
            />
          </div>

          {/* Zone 2 — Mosaic Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: '16px',
            }}
          >
            {/* Revenue Area Chart — col 1-8 */}
            <div
              className="lcard p-5"
              style={{ gridColumn: 'span 12 / span 12' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {t('dashboard.revenueChart')}
                </h3>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#6366F1' }} />
                    Doanh thu
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded" style={{ background: '#10B981' }} />
                    Lợi nhuận
                  </span>
                </div>
              </div>
              <RevenueAreaChart
                labels={data.revenueByDay.map(d => d.date)}
                revenue={data.revenueByDay.map(d => d.netRevenue)}
                profit={data.revenueByDay.map(d => d.grossProfit)}
              />
            </div>

            {/* Channel Rings — col 9-12 */}
            <div
              className="lcard p-5"
              style={{ gridColumn: 'span 12 / span 12' }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                {t('dashboard.channelChart')}
              </h3>
              <ChannelRings channels={data.revenueByChannel} />
            </div>

            {/* Top Products Lollipop — full row */}
            <div
              className="lcard p-5"
              style={{ gridColumn: 'span 12 / span 12' }}
            >
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                {t('dashboard.topProducts')}
              </h3>
              <LollipopChart products={data.topProducts} />
            </div>
          </div>

          {/* Zone 3 — Activity Feed (channel performance) */}
          <div>
            <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              Kênh bán hàng
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {data.revenueByChannel.map((ch, i) => (
                <ActivityChip
                  key={i}
                  channel={ch.channelName ?? ch.channel}
                  revenue={ch.revenue ?? 0}
                  orders={ch.orders ?? 0}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
