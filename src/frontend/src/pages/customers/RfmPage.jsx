import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { SkeletonCard } from '../../components/ui/Skeleton'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getRfmSegments } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

const SEGMENT_CONFIG = {
  VIP:       { color: '#6366F1', icon: 'workspace_premium', action: 'Upsell sản phẩm cao cấp, ưu đãi exclusive' },
  Loyal:     { color: '#10B981', icon: 'favorite',          action: 'Chương trình loyalty, giảm giá thành viên' },
  Returning: { color: '#3B82F6', icon: 'refresh',           action: 'Nhắc mua hàng định kỳ, cross-sell' },
  New:       { color: '#F59E0B', icon: 'new_releases',      action: 'Chào mừng + coupon đơn hàng đầu tiên' },
  'At Risk': { color: '#EF4444', icon: 'warning',           action: 'Gửi email win-back với giảm giá 20%' },
  Lost:      { color: '#6B7280', icon: 'person_off',        action: 'Chiến dịch re-engagement đặc biệt' },
  Other:     { color: '#A855F7', icon: 'category',          action: 'Phân tích thêm để xác định nhóm phù hợp' },
}

const SCATTER_COLORS = ['#6366F1','#10B981','#3B82F6','#F59E0B','#EF4444','#6B7280','#A855F7']

function fmtVND(v) {
  return fmtMoneyExact(v || 0)
}

function SegmentCard({ name, data, onCreateCampaign }) {
  const { t } = useTranslation()
  const cfg = SEGMENT_CONFIG[name] ?? SEGMENT_CONFIG.Other
  return (
    <div className="lcard p-4 flex flex-col gap-2" style={{ borderLeft: `3px solid ${cfg.color}` }}>
      <div className="flex items-center gap-2">
        <span className="icon" style={{ color: cfg.color, fontSize: 20 }}>{cfg.icon}</span>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{name}</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: `${cfg.color}18`, color: cfg.color }}>
          {data.count} KH ({data.pct_customers?.toFixed(1)}%)
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <div>
          <div style={{ color: 'var(--text-tertiary)' }}>{t('rfm.avgRevenue')}</div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {fmtVND(data.avg_monetary ?? 0)}
          </div>
        </div>
        <div>
          <div className="inline-flex items-center gap-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('rfm.frequency')}<InfoTooltip {...MT.frequency} placement="top" /></div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {(data.avg_frequency ?? 0).toFixed(1)}x
          </div>
        </div>
        <div>
          <div className="inline-flex items-center gap-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('rfm.recency')}<InfoTooltip {...MT.recency} placement="top" /></div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {Math.round(data.avg_recency ?? 0)}
          </div>
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 text-xs p-2 rounded-md" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <span className="icon icon-sm mr-1" style={{ color: cfg.color }}>lightbulb</span>
          {cfg.action}
        </div>
        {/* Nút tạo campaign cho segment này */}
        {(name === 'At Risk' || name === 'Lost' || name === 'Returning') && (
          <button
            onClick={() => onCreateCampaign(name, data.count)}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all"
            style={{ borderColor: `${cfg.color}60`, color: cfg.color, background: `${cfg.color}08` }}
            onMouseEnter={e => { e.currentTarget.style.background = cfg.color; e.currentTarget.style.color = 'white' }}
            onMouseLeave={e => { e.currentTarget.style.background = `${cfg.color}08`; e.currentTarget.style.color = cfg.color }}
            title={`${t('rfm.createCampaign')} — ${name}`}
          >
            <span className="icon" style={{ fontSize: 13 }}>campaign</span>
            {t('rfm.createCampaign')}
          </button>
        )}
      </div>
    </div>
  )
}

export default function RfmPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [searchKH,  setSearchKH]  = useState('')
  const [filterSeg, setFilterSeg] = useState('all')

  useEffect(() => {
    setLoading(true)
    getRfmSegments()
      .then(d => { setData(d) })
      .catch(() => { setData(null) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-4">
      <SkeletonCard /><SkeletonCard /><SkeletonCard />
    </div>
  )

  if (!data) return (
    <div className="space-y-4">
      <AiEmptyState title={t('rfm.emptyState')} />
    </div>
  )

  const summary = data?.segment_summary ?? {}
  const customers = data?.customers ?? []

  // Pie chart data
  const pieData = Object.entries(summary).map(([name, s]) => ({
    name, value: s.count, color: SEGMENT_CONFIG[name]?.color ?? '#999',
  }))

  // Scatter chart: Recency vs Frequency (size = Monetary)
  const scatterBySeg = Object.entries(summary).map(([seg, s]) => ({
    seg,
    color: SEGMENT_CONFIG[seg]?.color ?? '#999',
    // Dùng avg values để plot centroid
    data: [{ x: s.avg_recency ?? 0, y: s.avg_frequency ?? 0, z: s.avg_monetary ?? 0, seg }],
  }))

  // Scatter từ customers list (nếu có)
  const scatterCustomers = customers.length > 0
    ? Object.entries(
        customers.reduce((acc, c) => {
          if (!acc[c.segment]) acc[c.segment] = []
          acc[c.segment].push({ x: c.recency_days, y: c.frequency, z: c.monetary, name: c.full_name })
          return acc
        }, {})
      ).map(([seg, pts], i) => ({ seg, color: SCATTER_COLORS[i % SCATTER_COLORS.length], data: pts }))
    : scatterBySeg

  // Bảng khách hàng filter
  const filtered = customers
    .filter(c => filterSeg === 'all' || c.segment === filterSeg)
    .filter(c => !searchKH || c.full_name?.toLowerCase().includes(searchKH.toLowerCase()))

  const totalRevenue = Object.values(summary).reduce((s, v) => s + (v.total_revenue ?? 0), 0)

  const handleCreateCampaign = (segment, count) => {
    const params = new URLSearchParams({ action: 'winback', segment, count: String(count) })
    navigate(`/campaign?${params}`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            <span className="inline-flex items-center gap-1">{t('rfm.title')}<InfoTooltip {...MT.rfm} placement="bottom" /></span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('rfm.subtitle', { count: data?.total_customers ?? 0 })}
            {data?.computed_at && ` · ${new Date(data.computed_at).toLocaleDateString('vi-VN')}`}
          </p>
        </div>
      </div>

      {/* KPI tổng quan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('rfm.kpiTotal'),   value: data?.total_customers ?? 0, icon: 'people',          color: '#6366F1' },
          { label: t('rfm.kpiRevenue'),value: fmtVND(totalRevenue),        icon: 'payments',        color: '#10B981' },
          { label: t('rfm.kpiVip'),    value: summary.VIP?.count ?? 0,     icon: 'workspace_premium', color: '#F59E0B' },
          { label: t('rfm.kpiAtRisk'), value: (summary['At Risk']?.count ?? 0) + (summary.Lost?.count ?? 0), icon: 'warning', color: '#EF4444' },
        ].map(kpi => (
          <div key={kpi.label} className="lcard p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="icon icon-sm" style={{ color: kpi.color }}>{kpi.icon}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{kpi.label}</span>
            </div>
            <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {[
          { key: 'overview', label: t('rfm.tabOverview'), icon: 'dashboard' },
          { key: 'chart',    label: t('rfm.tabChart'),    icon: 'scatter_plot' },
          { key: 'table',    label: t('rfm.tabList'),     icon: 'table_chart' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all"
            style={{
              borderColor: activeTab === tab.key ? 'var(--primary-500)' : 'transparent',
              color:       activeTab === tab.key ? 'var(--primary-600)' : 'var(--text-secondary)',
              marginBottom: '-1px',
            }}>
            <span className="icon icon-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview — Segment Cards + Pie */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Segment Cards */}
            <div className="space-y-3">
              {Object.entries(summary).map(([name, s]) => (
                <SegmentCard key={name} name={name} data={s} onCreateCampaign={handleCreateCampaign} />
              ))}
            </div>
            {/* Pie Chart */}
            <div className="lcard p-5 flex flex-col gap-3">
              <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {t('rfm.pieTitle')}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                       outerRadius={110} label={({ name, pct_customers }) => `${name}`}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${v} KH`, name]} />
                  <Legend iconType="circle" iconSize={8}
                          wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Chart — Scatter Recency vs Frequency */}
      {activeTab === 'chart' && (
        <div className="lcard p-5 space-y-3">
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('rfm.scatterTitle')}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('rfm.scatterAxisX')} · {t('rfm.scatterAxisY')} · {t('rfm.scatterBubble')}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="x" name="Recency (ngày)" type="number"
                     tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                     label={{ value: 'Recency (ngày)', position: 'insideBottom', offset: -8, fontSize: 11, fill: 'var(--text-tertiary)' }} />
              <YAxis dataKey="y" name="Tần suất mua" type="number"
                     tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                     label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fontSize: 11, fill: 'var(--text-tertiary)' }} />
              <ZAxis dataKey="z" name="Monetary" range={[40, 400]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload ?? {}
                  return (
                    <div className="lcard p-3 text-xs" style={{ boxShadow: 'var(--shadow-md)' }}>
                      {d.name && <div className="font-semibold mb-1">{d.name}</div>}
                      <div>Phân khúc: <strong>{d.seg}</strong></div>
                      <div>Recency: {d.x} ngày</div>
                      <div>Tần suất: {d.y} lần</div>
                      <div>Doanh thu: {fmtVND(d.z)}</div>
                    </div>
                  )
                }}
              />
              <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
              {scatterCustomers.map(s => (
                <Scatter key={s.seg} name={s.seg} data={s.data} fill={s.color} fillOpacity={0.7} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tab: Table — Danh sách khách hàng */}
      {activeTab === 'table' && (
        <div className="lcard p-5 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              placeholder={t('rfm.searchPlaceholder')}
              value={searchKH}
              onChange={e => setSearchKH(e.target.value)}
              className="linput !h-9 !px-3 text-sm flex-1"
              style={{ minWidth: 180, maxWidth: 280 }}
            />
            <select value={filterSeg} onChange={e => setFilterSeg(e.target.value)}
                    className="linput !h-9 !px-3 text-sm" style={{ width: 160 }}>
              <option value="all">{t('rfm.filterAll')}</option>
              {Object.keys(summary).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('rfm.showing', { shown: filtered.length, total: customers.length })}
            </span>
          </div>
          {customers.length === 0 ? (
            <div className="py-12 text-center" style={{ color: 'var(--text-tertiary)' }}>
              <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>people</span>
              <p className="text-sm mt-2">{t('rfm.emptyList')}</p>
              <p className="text-xs mt-1">{t('rfm.emptyListHint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {[
                      { h: t('rfm.colCustomer'),  tip: null               },
                      { h: t('rfm.colSegment'),   tip: MT.customerSegment },
                      { h: t('rfm.colRecency'),   tip: MT.recency         },
                      { h: t('rfm.colFrequency'), tip: MT.frequency       },
                      { h: t('rfm.colRevenue'),   tip: MT.monetary        },
                      { h: t('rfm.colRfmScore'),  tip: MT.rfm             },
                      { h: t('rfm.colLastOrder'), tip: null               },
                    ].map(({ h, tip }) => (
                      <th key={h} className="text-left py-2 px-3 font-semibold text-xs"
                          style={{ color: 'var(--text-tertiary)' }}>
                        <span className="inline-flex items-center gap-0.5">
                          {h}{tip && <InfoTooltip {...tip} placement="bottom" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((c, i) => {
                    const cfg = SEGMENT_CONFIG[c.segment] ?? SEGMENT_CONFIG.Other
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.full_name}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ background: `${cfg.color}18`, color: cfg.color }}>
                            {c.segment}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.recency_days}{t('rfm.daySuffix')}</td>
                        <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{c.frequency}{t('rfm.orderSuffix')}</td>
                        <td className="py-2 px-3 text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{fmtVND(c.monetary)}</td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                            {c.rfm_score}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.last_order}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="text-xs text-center mt-3" style={{ color: 'var(--text-tertiary)' }}>
                  {t('rfm.showing', { shown: 100, total: filtered.length })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
