import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { fmtM, tickFmt, tickFmtPreM, splitFmt } from '../../utils/format'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ScatterChart, Scatter, ZAxis, ComposedChart, LabelList,
} from 'recharts'
import { SkeletonCard } from '../../components/ui/Skeleton'
import DetailDrawer from '../../components/ui/DetailDrawer'
import AiEmptyState from '../../components/ui/AiEmptyState'
import DevEmptyState from '../../components/ui/DevEmptyState'
import { getDashboard, getTodayVsYesterday, getDrillDownOrders, getDrillDownCustomers,
         getDrillDownByChannel, getDrillDownByStatus, getDrillDownByDate,
         getOrderHeatmap, getOrderFunnel, getMonthlyByChannel,
         getOpsKpi, getInventoryReal, getTopProductsByChannel } from '../../api/dashboardApi'
import { getInsights, getRecommendations, getLeaderboard, getGeoDistribution, getChannelAttribution,
         getCampaignPlan, getFeedbackSummary,
         getRfmSegments } from '../../api/aiApi'
import { getProfitOverview } from '../../api/financeApi'
import { KPI_DEFINITIONS } from '../../utils/kpiDefinitions'
import InfoTooltip from '../../components/ui/InfoTooltip'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

// fmtM — imported from utils/format (language-aware: vi=triệu, en=M)

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

// ── MiniWidget: card nhỏ tích hợp AI vào tab Dashboard ───────────────────────
function MiniWidget({ title, icon, href, loading, children }) {
  const navigate = useNavigate()
  return (
    <div className="lcard p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <button onClick={() => navigate(href)}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--primary-600)', background: 'rgba(99,102,241,0.08)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.16)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}>
          Xem đầy đủ
          <span className="icon text-sm">arrow_forward</span>
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <span className="w-5 h-5 border-2 rounded-full"
                style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : children}
    </div>
  )
}

// generateMockData đã bị xóa — hệ thống chỉ dùng dữ liệu thực từ API/DB

const CHANNEL_KEYS  = ['all', 'shopee', 'lazada', 'tiktok', 'facebook']
const CHART_COLORS  = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316']

// Màu brand chuẩn theo từng kênh — dùng nhất quán cho badge, chart, table
const CHANNEL_COLOR = {
  shopee:   '#EE4D2D', // Shopee cam-đỏ chính thức
  lazada:   '#0F3DD1', // Lazada xanh dương chính thức
  tiktok:   '#2DD4BF', // TikTok teal (đảm bảo dark mode)
  offline:  '#6B7280', // Offline / POS xám
  other:    '#94A3B8', // Fallback
}
function getChannelColor(name = '') {
  const key = name.toLowerCase().replace(/\s+/g, '')
  if (key.includes('shopee'))  return CHANNEL_COLOR.shopee
  if (key.includes('lazada'))  return CHANNEL_COLOR.lazada
  if (key.includes('tiktok'))  return CHANNEL_COLOR.tiktok
  if (key.includes('offline') || key.includes('pos')) return CHANNEL_COLOR.offline
  return CHANNEL_COLOR.other
}

function resolvePreset(p) {
  return {
    from: typeof p.from === 'function' ? p.from() : p.from,
    to:   typeof p.to   === 'function' ? p.to()   : p.to,
  }
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h3 className="text-[22px] font-bold mb-4 tracking-tight leading-snug text-foreground">
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

// KpiTooltip — alias cho InfoTooltip, giữ backward-compat với prop `def`
const KpiTooltip = ({ def }) => <InfoTooltip def={def} />

// compact=true khi dùng trong grid 8 cột — giảm padding, font-size, ẩn sparkline
function KpiCard({ label, value, trend, trendLabel, icon, color = 'var(--primary-500)', valueColor, sparkData, sparkColor, helpDef, unavailable = false, placeholderText, compact = false }) {
  const up = trend > 0
  return (
    <div className={`lcard lcard-hover cursor-default w-full ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="icon shrink-0" style={{ color, fontSize: compact ? 15 : 18 }}>{icon}</span>
        <span className={`font-semibold uppercase tracking-wide truncate ${compact ? 'text-[10px]' : 'text-xs'}`} style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{label}</span>
        {helpDef && <KpiTooltip def={helpDef} />}
      </div>

      {unavailable ? (
        <div className="space-y-1 py-0.5">
          <div className={`font-bold font-mono ${compact ? 'text-lg' : 'text-2xl'}`} style={{ color: 'var(--text-tertiary)' }}>—</div>
          {!compact && (
            <div className="text-[10px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
              {placeholderText ?? 'Chưa có dữ liệu thật'}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={`font-bold font-mono leading-none ${compact ? 'text-xl mb-0.5' : 'text-3xl mb-1'}`} style={{ color: valueColor || 'var(--foreground)' }}>
            {(() => {
              const { sym, num, unit } = splitFmt(value)
              return unit
                ? <>{sym}{num}<span style={{ fontSize: compact ? '0.6em' : '0.55em', fontWeight: 500, opacity: 0.7, marginLeft: 2 }}>{unit}</span></>
                : value
            })()}
          </div>
          {trend !== undefined && (
            <div className="flex items-center gap-1">
              <span className="icon" style={{ fontSize: compact ? 10 : 12, color: up ? 'var(--accent-500)' : 'var(--color-error)' }}>
                {up ? 'arrow_upward' : 'arrow_downward'}
              </span>
              <span className={`font-medium ${compact ? 'text-[10px]' : 'text-sm'} ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {Math.abs(trend)}%
              </span>
              {!compact && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
            </div>
          )}
          {placeholderText && !compact && (
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              {placeholderText}
            </div>
          )}
          {sparkData && !compact && (
            <div className="mt-1" style={{ opacity: 0.75 }}>
              <Sparkline data={sparkData} color={sparkColor || color} />
            </div>
          )}
        </>
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

// ── DrillTable — component tái sử dụng cho bảng drill-down bên trong DetailDrawer ──
// Props: columns, result={items,total,page,totalPages,error?}, loading, onLoadMore, loadingMore
function DrillTable({ columns, result = {}, loading = false, onLoadMore, loadingMore = false }) {
  const { items = [], total = 0, page = 1, totalPages = 1, error = false } = result
  const hasMock    = items.some(r => r.is_mock)
  const hasMore    = page < totalPages
  const displayEnd = Math.min(items.length, page * 20)

  if (loading) return (
    <div className="flex items-center justify-center p-10">
      <span className="w-6 h-6 border-2 rounded-full"
        style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center gap-3 py-12">
      <span className="icon text-4xl" style={{ color: 'var(--color-error)', opacity: 0.6 }}>error_outline</span>
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        Không tải được dữ liệu chi tiết. Vui lòng thử lại.
      </p>
    </div>
  )

  return (
    <div>
      {hasMock && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs"
          style={{ background: 'rgba(245,158,11,0.1)', color: '#92400e', borderBottom: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="icon" style={{ fontSize: 14, color: '#f59e0b' }}>warning</span>
          Đang dùng dữ liệu mẫu — kiểm tra lại kết nối backend
        </div>
      )}
      {total > 0 && (
        <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
          Hiển thị {items.length} / {total} bản ghi
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0" style={{ background: 'var(--bg-elevated)' }}>
          <tr>
            {columns.map(col => (
              <th key={col.key} className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide"
                style={{ color: 'var(--text-secondary)', borderBottom: '2px solid var(--border)' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length > 0 ? items.filter(r => !r.is_mock || r.orderId !== '—').map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2.5"
                  style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', textAlign: col.align ?? 'left' }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center"
                style={{ color: 'var(--text-tertiary)' }}>Không có dữ liệu</td>
            </tr>
          )}
        </tbody>
      </table>
      {hasMore && onLoadMore && (
        <div className="flex justify-center py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="lbtn lbtn-secondary text-xs !h-8 !px-4"
            style={{ opacity: loadingMore ? 0.6 : 1 }}
          >
            {loadingMore
              ? <><span className="icon animate-spin text-sm">refresh</span> Đang tải...</>
              : <>Tải thêm ({total - items.length} còn lại)</>}
          </button>
        </div>
      )}
    </div>
  )
}

// ── AI Insights Card — hiện preview gợi ý tự động (cùng nguồn với Gợi ý AI tab) ───
const PRIORITY_DOT_DASH = { high: '#EF4444', medium: '#F59E0B', low: '#6366F1' }

function AiInsightsCard({ insights = null, loading = false, autoRecs = null }) {
  const navigate = useNavigate()
  const MAX_PREVIEW = 3

  // Dùng autoRecs (đồng nhất với Gợi ý AI tab) nếu có; fallback về insights string[]
  const useRecs     = autoRecs?.recommendations?.length > 0
  const allRecs     = autoRecs?.recommendations ?? []
  const allInsights = insights?.insights ?? []
  const preview     = useRecs ? allRecs.slice(0, MAX_PREVIEW) : allInsights.slice(0, MAX_PREVIEW)
  const totalCount  = useRecs ? allRecs.length : allInsights.length
  const hasMore     = totalCount > MAX_PREVIEW
  const hasData     = totalCount > 0
  const updatedAt   = autoRecs?.generatedAt ?? insights?.generated_at

  return (
    <div className="lcard p-5" style={{ borderLeft: '3px solid var(--primary-500)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="icon" style={{ color: 'var(--primary-500)', fontSize: 20 }}>auto_awesome</span>
        <span className="text-[22px] font-bold text-foreground">AI Insights</span>
        <span className="lbadge lbadge-primary ml-1">Tự động</span>
        {updatedAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            Cập nhật: {new Date(updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="icon animate-spin" style={{ fontSize: 16 }}>refresh</span>
          Đang tải insights từ AI...
        </div>
      ) : !hasData ? (
        <div className="text-xs text-muted-foreground">
          AI Service chưa khởi động — chạy start_all.bat để bật đầy đủ tính năng AI.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {useRecs ? preview.map((rec, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
                      style={{ background: PRIORITY_DOT_DASH[rec.priority] ?? '#6366F1' }} />
                <span className="text-foreground">{rec.message}</span>
              </li>
            )) : preview.map((text, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className="icon shrink-0 mt-0.5"
                      style={{ fontSize: 16, color: ['#6366F1','#F59E0B','#10B981'][i % 3] }}>
                  lightbulb
                </span>
                <span className="text-foreground">{text}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              + {totalCount - MAX_PREVIEW} gợi ý khác
            </p>
          )}
          <button
            onClick={() => navigate('/recommendations?tab=auto')}
            className="mt-3 flex items-center gap-1 text-xs font-medium transition-colors"
            style={{ color: 'var(--primary-500)' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <span className="icon" style={{ fontSize: 13 }}>open_in_new</span>
            Xem tất cả gợi ý AI
          </button>
        </>
      )}
    </div>
  )
}

// ── Tab: 1 — Overview ─────────────────────────────────────────────────────────
function TabOverview({ data, compareMode, prevData, canViewAnalytics = true, wd = {}, wl = {}, dateRange = {} }) {
  const { t }  = useTranslation()
  const kpi    = data.kpi

  // Drill-down state (click biểu đồ doanh thu theo ngày / click kênh)
  const [drillCtx,        setDrillCtx]        = useState(null)
  const [drillItems,      setDrillItems]      = useState({ items: [], total: 0, page: 1, totalPages: 1 })
  const [drillLoading,    setDrillLoading]    = useState(false)
  const [drillLoadMore,   setDrillLoadMore]   = useState(false)

  const openDrill = async (ctx) => {
    setDrillCtx(ctx)
    setDrillLoading(true)
    try {
      let res
      if (ctx.type === 'date') {
        res = await getDrillDownByDate(ctx.key)
      } else {
        res = await getDrillDownByChannel(ctx.key, dateRange.from, dateRange.to)
      }
      setDrillItems(res)
    } catch {
      setDrillItems({ items: [], total: 0, page: 1, totalPages: 1 })
    } finally {
      setDrillLoading(false)
    }
  }

  const loadMoreDrill = async () => {
    if (!drillCtx || drillItems.page >= drillItems.totalPages) return
    setDrillLoadMore(true)
    try {
      let res
      const nextPage = { page: drillItems.page + 1 }
      if (drillCtx.type === 'date') {
        res = await getDrillDownByDate(drillCtx.key, nextPage)
      } else {
        res = await getDrillDownByChannel(drillCtx.key, dateRange.from, dateRange.to, nextPage)
      }
      setDrillItems(prev => ({ ...res, items: [...prev.items, ...res.items] }))
    } catch {} finally { setDrillLoadMore(false) }
  }

  const drillCols = [
    { key: 'orderId',     label: 'Mã đơn' },
    { key: 'date',        label: 'Ngày' },
    { key: 'channel',     label: 'Kênh' },
    { key: 'productName', label: 'Sản phẩm' },
    { key: 'qty',         label: 'SL' },
    { key: 'revenue',     label: 'Doanh thu', render: v => Number(v).toLocaleString('vi-VN') + ' ₫' },
  ]
  const sp     = data.sparklines || {}
  const lbData       = wd.leaderboard ?? null
  const lbLoading    = wl.leaderboard ?? false
  const insData      = wd.insights   ?? null
  const insLoading   = wl.insights   ?? false
  const autoRecs     = wd.autoRecs   ?? null
  const autoRecsLoading = wl.autoRecs ?? false
  // Finance KPI (Operating Profit, ACOS) từ FinanceController
  const financeKpi   = wd.financeKpi  ?? null
  const financeLoading = wl.financeKpi ?? false

  // ROAS & ACOS tính từ dữ liệu channel thực (khi đã nhập chi phí QC)
  const totalAdSpend  = (data.revenueByChannel ?? []).reduce((s, ch) => s + Number(ch.adSpend ?? 0), 0)
  const hasAdSpend    = totalAdSpend > 0
  const avgRoasVal    = hasAdSpend && kpi.totalRevenue > 0
    ? (kpi.totalRevenue / totalAdSpend).toFixed(1) : null
  const acosVal       = financeKpi?.acos != null
    ? Number(financeKpi.acos).toFixed(1)
    : (hasAdSpend && kpi.totalRevenue > 0
        ? ((totalAdSpend / kpi.totalRevenue) * 100).toFixed(1) : null)
  // Operating Profit từ Finance API (fetch theo widget)
  const opProfit      = financeKpi?.operatingProfit ?? financeKpi?.operating_profit ?? null

  // Biên lợi nhuận gộp (thực từ DB)
  const grossMarginPct = kpi.totalRevenue > 0
    ? ((kpi.totalProfit / kpi.totalRevenue) * 100).toFixed(1) : '0.0'

  // Dữ liệu chart gộp kỳ này + kỳ trước (index-based)
  const trendData = data.revenueByDay.map((d, i) => {
    const prev = prevData?.revenueByDay?.[i]
    return {
      date:           d.date.slice(5),  // MM-DD để hiển thị trục X
      fullDate:       d.date,           // YYYY-MM-DD để drill-down
      netRevenue:     d.netRevenue,
      grossProfit:    d.grossProfit,
      prevRevenue:    prev?.netRevenue   ?? null,
      prevProfit:     prev?.grossProfit  ?? null,
    }
  })

  // Label nhóm KPI — subtle separator
  const GroupLabel = ({ children }) => (
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-2 mt-1" style={{ color: 'var(--text-tertiary)' }}>
      {children}
    </p>
  )

  return (
    <div className="space-y-5">
      {/* ── Cảnh báo missing cost_price ─────────────────────────────────── */}
      {financeKpi?.missingCostOrders > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#92400e' }}>
          <span className="icon shrink-0" style={{ fontSize: 18, color: '#f59e0b' }}>warning</span>
          <span>
            <strong>{financeKpi.missingCostOrders.toLocaleString('vi-VN')} đơn hàng</strong> chưa có giá vốn (cost_price) — COGS và lợi nhuận chưa chính xác.{' '}
            Vào <strong>Quản lý sản phẩm</strong> để bổ sung giá vốn.
          </span>
        </div>
      )}

      {/* ── KPI 8 card — 1 hàng trên desktop rộng (xl:), 4 cột trên laptop, 2 cột mobile ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        <KpiCard compact
          label={t('dashboard.kpi.revenue')}
          value={fmtM(kpi.totalRevenue)}
          trend={kpi.revenueGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="payments"
          helpDef={KPI_DEFINITIONS.revenue}
        />
        <KpiCard compact
          label={t('dashboard.kpi.orders')}
          value={kpi.totalOrders.toLocaleString('vi-VN')}
          trend={kpi.ordersGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="shopping_cart"
          color="#10B981"
          helpDef={KPI_DEFINITIONS.orders}
        />
        <KpiCard compact
          label={t('dashboard.kpi.aov')}
          value={fmtM(kpi.avgOrderValue)}
          icon="receipt_long"
          color="var(--accent-500)"
          helpDef={KPI_DEFINITIONS.aov}
        />
        <KpiCard compact
          label="Khách mới"
          value={kpi.newCustomers.toLocaleString('vi-VN')}
          trend={kpi.customersGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="person_add"
          color="#3B82F6"
          helpDef={KPI_DEFINITIONS.newCustomers}
        />
        <KpiCard compact
          label={t('dashboard.kpi.profit')}
          value={fmtM(kpi.totalProfit)}
          trend={parseFloat(grossMarginPct)}
          trendLabel="biên LN"
          icon="percent"
          color="#8B5CF6"
          valueColor={kpi.totalProfit >= 0 ? 'var(--profit-positive)' : 'var(--profit-negative)'}
          helpDef={KPI_DEFINITIONS.grossProfit}
        />
        <KpiCard compact
          label="LN vận hành"
          value={opProfit != null ? fmtM(opProfit) : (financeLoading ? '...' : '—')}
          icon="account_balance_wallet"
          color="#6366F1"
          valueColor={opProfit != null ? (opProfit >= 0 ? 'var(--profit-positive)' : 'var(--profit-negative)') : undefined}
          helpDef={KPI_DEFINITIONS.operatingProfit}
          unavailable={opProfit == null && !financeLoading}
          placeholderText={opProfit == null && !financeLoading ? 'Trang Tài chính' : undefined}
        />
        <KpiCard compact
          label="ROAS"
          value={avgRoasVal != null ? `${avgRoasVal}×` : '—'}
          icon="ads_click"
          color="#10B981"
          valueColor={avgRoasVal != null
            ? (parseFloat(avgRoasVal) >= 4 ? 'var(--profit-positive)' : parseFloat(avgRoasVal) >= 2 ? '#F59E0B' : 'var(--color-error)')
            : undefined}
          helpDef={KPI_DEFINITIONS.roas}
          unavailable={avgRoasVal == null}
          placeholderText={avgRoasVal == null ? 'Nhập chi phí QC' : undefined}
        />
        <KpiCard compact
          label="ACOS"
          value={acosVal != null ? `${acosVal}%` : '—'}
          icon="savings"
          color="#EC4899"
          valueColor={acosVal != null
            ? (parseFloat(acosVal) <= 15 ? 'var(--profit-positive)' : parseFloat(acosVal) <= 25 ? '#F59E0B' : 'var(--color-error)')
            : undefined}
          helpDef={KPI_DEFINITIONS.acos}
          unavailable={acosVal == null}
          placeholderText={acosVal == null ? 'Nhập chi phí QC' : undefined}
        />
      </div>

      {/* AI Insights — chỉ hiện cho Owner/Manager/DataIT/SuperAdmin */}
      {canViewAnalytics && <AiInsightsCard insights={insData} loading={insLoading || autoRecsLoading} autoRecs={autoRecs} />}

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
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Click vào biểu đồ để xem đơn hàng của ngày đó
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={trendData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(chartData) => {
                const pt = chartData?.activePayload?.[0]?.payload
                if (pt?.fullDate) openDrill({ type: 'date', key: pt.fullDate, label: pt.date })
              }}
            >
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
                tickFormatter={tickFmt} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="netRevenue"  name={t('dashboard.series.revenue')} stroke="#6366F1" strokeWidth={2} fill="url(#revGrad)" dot={false} />
              <Area type="monotone" dataKey="grossProfit" name={t('dashboard.series.profit')}  stroke="#10B981" strokeWidth={2} fill="url(#proGrad)" dot={false} />
              {compareMode && prevData && (
                <>
                  <Area type="monotone" dataKey="prevRevenue" name={t('dashboard.series.prevRevenue')} stroke="#A5B4FC" strokeWidth={1.5} strokeDasharray="5 4" fill="none" dot={false} connectNulls />
                  <Area type="monotone" dataKey="prevProfit"  name={t('dashboard.series.prevProfit')}  stroke="#6EE7B7" strokeWidth={1.5} strokeDasharray="5 4" fill="none" dot={false} connectNulls />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle>{t('dashboard.chart.channelShare')}</SectionTitle>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Click vào kênh để xem đơn hàng
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data.revenueByChannel} dataKey="revenue" nameKey="channelName"
                cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={3}
                onClick={(entry) => openDrill({ type: 'channel', key: entry.channelName, label: entry.channelName })}
                style={{ cursor: 'pointer' }}
              >
                {data.revenueByChannel.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmtM(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {data.revenueByChannel.map((ch, i) => (
              <div key={i}
                className="flex items-center gap-2 text-caption cursor-pointer rounded-lg px-1 py-0.5 transition-colors"
                onClick={() => openDrill({ type: 'channel', key: ch.channelName, label: ch.channelName })}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getChannelColor(ch.channelName) }} />
                <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{ch.channelName}</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{ch.revenuePct.toFixed(0)}%</span>
                <span className="icon shrink-0" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>chevron_right</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Leaderboard mini-widget ── */}
      <MiniWidget title="Bảng xếp hạng hiệu suất" icon="leaderboard" href="/leaderboard" loading={lbLoading}>
        {lbData ? (
          <div className="space-y-2">
            {(lbData.top_products ?? lbData.products ?? []).slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: i < 3 ? ['rgba(251,191,36,0.15)','rgba(148,163,184,0.15)','rgba(180,83,9,0.12)'][i] : 'var(--bg-elevated)',
                               color:      i < 3 ? ['#D97706','#64748B','#92400E'][i] : 'var(--text-tertiary)' }}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                  {p.product_name ?? p.name ?? p.channel ?? '—'}
                </span>
                <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {fmtM(p.revenue ?? p.total_revenue ?? 0)}
                </span>
              </div>
            ))}
            {!(lbData.top_products ?? lbData.products)?.length && (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Chưa có dữ liệu</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Không tải được dữ liệu</p>
        )}
      </MiniWidget>

      {/* DetailDrawer — drill-down khi click biểu đồ doanh thu hoặc kênh */}
      <DetailDrawer
        open={!!drillCtx}
        onClose={() => { setDrillCtx(null); setDrillItems({ items: [], total: 0, page: 1, totalPages: 1 }) }}
        title={drillLoading ? 'Đang tải...' :
          drillCtx?.type === 'date'    ? `Đơn hàng ngày ${drillCtx.label}` :
          drillCtx?.type === 'channel' ? `Đơn hàng kênh ${drillCtx.label}` : ''}
        subtitle={!drillLoading && drillItems.total > 0 ? `${drillItems.total} đơn` : undefined}
        width={780}
        footer={
          drillItems.items.length > 0 && (
            <button className="lbtn lbtn-secondary text-xs" style={{ height: 32 }}
              onClick={() => drillCtx && exportCsv(`orders_${drillCtx.key}.csv`, drillItems.items.map(({ is_mock, ...r }) => r))}>
              <span className="icon icon-sm">download</span>
              Xuất CSV
            </button>
          )
        }
      >
        <DrillTable
          columns={drillCols}
          result={drillItems}
          loading={drillLoading}
          onLoadMore={loadMoreDrill}
          loadingMore={drillLoadMore}
        />
      </DetailDrawer>
    </div>
  )
}

// ── Tab: 2 — Sales Performance ────────────────────────────────────────────────
function TabSales({ data, compareMode, prevData, from, to }) {
  const { t } = useTranslation()
  const [drillProduct,        setDrillProduct]        = useState(null)
  const [drillOrders,         setDrillOrders]         = useState({ items: [], total: 0, page: 1, totalPages: 1 })
  const [drillLoading,        setDrillLoading]        = useState(false)
  const [drillLoadingMore,    setDrillLoadingMore]    = useState(false)
  // Funnel drill-down state
  const [drillFunnel,       setDrillFunnel]       = useState(null)
  const [funnelOrders,      setFunnelOrders]      = useState({ items: [], total: 0, page: 1, totalPages: 1 })
  const [funnelLoading,     setFunnelLoading]     = useState(false)
  const [funnelLoadingMore, setFunnelLoadingMore] = useState(false)
  const maxFunnel = data?.funnel?.[0]?.value ?? 1

  // Map nhãn phễu → status OLTP
  const FUNNEL_STATUS = {
    'PENDING':   'PENDING',
    'PAID':      'PAID',
    'SHIPPED':   'SHIPPED',
    'DELIVERED': 'DELIVERED',
    'RETURNED':  'RETURNED',
    'CANCELLED': 'CANCELLED',
  }

  const handleFunnelClick = async (stage) => {
    const apiStatus = FUNNEL_STATUS[stage.stage?.toUpperCase()] ?? stage.stage
    setDrillFunnel({ stage: stage.stage, status: apiStatus })
    setFunnelLoading(true)
    try {
      const res = await getDrillDownByStatus(apiStatus, from, to)
      setFunnelOrders(res)
    } catch {
      setFunnelOrders({ items: [], total: 0, page: 1, totalPages: 1 })
    } finally {
      setFunnelLoading(false)
    }
  }

  const loadMoreFunnel = async () => {
    if (!drillFunnel || funnelOrders.page >= funnelOrders.totalPages) return
    setFunnelLoadingMore(true)
    try {
      const res = await getDrillDownByStatus(drillFunnel.status, from, to, { page: funnelOrders.page + 1 })
      setFunnelOrders(prev => ({ ...res, items: [...prev.items, ...res.items] }))
    } catch {} finally { setFunnelLoadingMore(false) }
  }

  const funnelCols = [
    { key: 'orderId',     label: 'Mã đơn' },
    { key: 'date',        label: 'Ngày' },
    { key: 'channel',     label: 'Kênh' },
    { key: 'productName', label: 'Sản phẩm' },
    { key: 'qty',         label: 'SL' },
    { key: 'revenue',     label: 'Doanh thu', render: v => Number(v).toLocaleString('vi-VN') + ' ₫' },
  ]

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

  // Khi click bar Pareto: load đơn hàng thật từ DW
  const handleDrillProduct = async (entry) => {
    setDrillProduct(entry)
    setDrillLoading(true)
    try {
      // Fix: dùng entry.productId (camelCase từ API JSON) thay vì entry.ProductId (PascalCase)
      const productKey = entry.productKey ?? entry.productId ?? entry.ProductId
      const res = await getDrillDownOrders(productKey, from, to)
      setDrillOrders(res)
    } catch {
      // API lỗi → empty state với error flag (không dùng row trống gây hiểu lầm)
      setDrillOrders({
        items: [], total: 0, page: 1, totalPages: 1,
        error: true,
      })
    } finally {
      setDrillLoading(false)
    }
  }

  const loadMoreDrill = async () => {
    if (!drillProduct || drillOrders.page >= drillOrders.totalPages) return
    setDrillLoadingMore(true)
    try {
      const productKey = drillProduct.productKey ?? drillProduct.productId ?? drillProduct.ProductId
      const res = await getDrillDownOrders(productKey, from, to, { page: drillOrders.page + 1 })
      setDrillOrders(prev => ({ ...res, items: [...prev.items, ...res.items] }))
    } catch {} finally { setDrillLoadingMore(false) }
  }

  const drillColumns = [
    { key: 'orderId',     label: 'Mã đơn' },
    { key: 'date',        label: 'Ngày' },
    { key: 'channel',     label: 'Kênh' },
    { key: 'productName', label: 'Sản phẩm' },
    { key: 'qty',         label: 'SL' },
    { key: 'revenue',     label: 'Doanh thu', render: v => Number(v).toLocaleString('vi-VN') + ' ₫' },
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
              {t('dashboard.today.comparePrev')} ({t('dashboard.today.compareNote')})
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthlyCompare ?? data.monthlyByChannel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
              tickFormatter={tickFmt} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
            {data.revenueByChannel.map((ch, i) => (
              <Bar key={ch.channelName} dataKey={ch.channelName} stackId="a"
                fill={getChannelColor(ch.channelName)}
                radius={i === data.revenueByChannel.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
            ))}
            {compareMode && prevData && data.revenueByChannel.map((ch, i) => (
              <Line key={`prev_${ch.channelName}`} dataKey={`prev_${ch.channelName}`}
                name={`${ch.channelName} (${t('dashboard.series.prevPeriod')})`}
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
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={44} tickFormatter={tickFmtPreM} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="revM" name="Doanh thu (M₫)" fill="#6366F1" radius={[4,4,0,0]}
                onClick={handleDrillProduct} cursor="pointer" />
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
                {data.topProducts.slice(0, 5).map((p, i) => (
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

      {/* Bảng Top sản phẩm theo kênh */}
      <div className="lcard p-5">
        <SectionTitle>Top sản phẩm theo kênh</SectionTitle>
        {data?.productsByChannel?.length > 0 ? (
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
                {data.productsByChannel.flatMap((ch, ci) =>
                  ch.products.map((p, pi) => (
                    <tr key={`${ci}-${pi}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      {pi === 0 && (
                        <td className="py-2 px-2 font-semibold" rowSpan={ch.products.length}
                          style={{ color: getChannelColor(ch.channelName), verticalAlign: 'top', paddingTop: 10 }}>
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
        ) : (
          <DevEmptyState title="Chưa có dữ liệu top sản phẩm theo kênh" desc="Hệ thống chưa có API tổng hợp top sản phẩm phân tách theo từng kênh bán." />
        )}
      </div>

      {/* Phễu trạng thái đơn hàng (PENDING → DELIVERED) */}
      <div className="lcard p-5">
        <SectionTitle>{t('dashboard.chart.funnel')}</SectionTitle>
        <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Luồng xử lý đơn hàng — click vào từng bước để xem danh sách đơn
        </p>
        <div className="space-y-2 max-w-xl">
          {(data.funnel ?? []).map((stage, i) => {
            const pct      = (stage.value / maxFunnel) * 100
            const convRate = i === 0 ? 100 : (stage.value / (data.funnel[i - 1]?.value || 1) * 100).toFixed(1)
            const dropPct  = i === 0 ? null : (100 - parseFloat(convRate)).toFixed(1)
            return (
              <div key={i}>
                {dropPct !== null && (
                  <div className="text-center text-caption py-0.5" style={{ color: 'var(--color-error)' }}>
                    ↓ {dropPct}% rơi rụng
                  </div>
                )}
                <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span>{stage.stage}</span>
                  <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                    {stage.value.toLocaleString('vi-VN')}
                    {i > 0 && <span style={{ color: 'var(--text-tertiary)' }}> ({convRate}%)</span>}
                  </span>
                </div>
                <div
                  className="h-6 rounded-lg cursor-pointer transition-opacity"
                  style={{ background: 'var(--bg-elevated)' }}
                  onClick={() => stage.value > 0 && handleFunnelClick(stage)}
                  title={`Click để xem đơn hàng ${stage.stage}`}
                >
                  <div className="h-full rounded-lg transition-all duration-700"
                    style={{ width: `${pct}%`, background: CHART_COLORS[i], minWidth: 40 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* DetailDrawer — drill-down funnel stage */}
      <DetailDrawer
        open={!!drillFunnel}
        onClose={() => { setDrillFunnel(null); setFunnelOrders({ items: [], total: 0, page: 1, totalPages: 1 }) }}
        title={funnelLoading ? 'Đang tải...' : `Đơn hàng trạng thái — ${drillFunnel?.stage ?? ''}`}
        subtitle={!funnelLoading && funnelOrders.total > 0 ? `${funnelOrders.total} đơn` : undefined}
        width={780}
        footer={
          funnelOrders.items.length > 0 && (
            <button className="lbtn lbtn-secondary text-xs" style={{ height: 32 }}
              onClick={() => drillFunnel && exportCsv(`orders_${drillFunnel.status}.csv`, funnelOrders.items)}>
              <span className="icon icon-sm">download</span>
              Xuất CSV
            </button>
          )
        }
      >
        <DrillTable
          columns={funnelCols}
          result={funnelOrders}
          loading={funnelLoading}
          onLoadMore={loadMoreFunnel}
          loadingMore={funnelLoadingMore}
        />
      </DetailDrawer>

      {/* DetailDrawer khi click bar Pareto */}
      <DetailDrawer
        open={!!drillProduct}
        onClose={() => { setDrillProduct(null); setDrillOrders({ items: [], total: 0, page: 1, totalPages: 1 }) }}
        title={drillLoading ? 'Đang tải...' : `Chi tiết đơn hàng — ${drillProduct?.productName || drillProduct?.shortName || ''}`}
        subtitle={!drillLoading && drillOrders.total > 0 ? `${drillOrders.total} đơn hàng` : undefined}
        width={780}
        footer={
          drillOrders.items.length > 0 && (
            <button className="lbtn lbtn-secondary text-xs" style={{ height: 32 }}
              onClick={() => drillProduct && exportCsv(
                `orders_${drillProduct.shortName ?? 'product'}.csv`,
                drillOrders.items.map(({ is_mock, ...r }) => r)
              )}>
              <span className="icon icon-sm">download</span>
              Xuất CSV
            </button>
          )
        }
      >
        <DrillTable
          columns={drillColumns}
          result={drillOrders}
          loading={drillLoading}
          onLoadMore={loadMoreDrill}
          loadingMore={drillLoadingMore}
        />
      </DetailDrawer>
    </div>
  )
}

// ── Tab: 3 — Multi-channel ────────────────────────────────────────────────────
function TabMultiChannel({ data, wd = {}, wl = {} }) {
  const { t } = useTranslation()
  const attrData    = wd.attribution ?? null
  const attrLoading = wl.attribution ?? false

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
              tickFormatter={tickFmt} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {data.revenueByChannel.map((ch, i) => (
              <Bar key={ch.channelName} dataKey={ch.channelName} fill={getChannelColor(ch.channelName)} radius={[3,3,0,0]} />
            ))}
            {/* Đường Total tổng tất cả kênh */}
            <Line type="monotone" dataKey="Total" name={t('common.total')}
              stroke="var(--text-secondary)" strokeWidth={2.5} strokeDasharray="6 3"
              dot={{ fill: 'var(--text-secondary)', r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Xu hướng kênh theo tháng (Line Chart) + Tỷ trọng kênh (Scorecard) */}
      {(data.revenueByChannel ?? []).length > 0 && (() => {
        const chNames = (data.revenueByChannel ?? []).map(ch => ch.channelName)
        const chData  = (data.revenueByChannel ?? []).map(ch => ({
          name:       ch.channelName,
          revenue:    Math.round((ch.revenue ?? 0) / 1_000_000),
          orders:     ch.orders ?? 0,
          growth:     parseFloat(ch.growth ?? 0),
          revenuePct: parseFloat(ch.revenuePct ?? 0),
        }))
        const maxRev = Math.max(...chData.map(c => c.revenue), 1)

        // Chuẩn hóa monthlyByChannel về triệu đ
        const monthlyM = (data.monthlyByChannel ?? []).map(row => {
          const norm = { month: row.month }
          chNames.forEach(n => { norm[n] = Math.round((row[n] ?? 0) / 1_000_000) })
          return norm
        })

        const LINE_COLORS = ['#6366F1','#EE4D2D','#2DD4BF','#0F3DD1','#1877F2','#6B7280']

        return (
          <div className="grid grid-cols-12 gap-4">
            {/* Line Chart: xu hướng từng kênh theo tháng (KHÁC stacked bar của Tab Sales) */}
            <div className="lcard p-5 col-span-12 lg:col-span-7">
              <SectionTitle>Xu hướng doanh thu từng kênh theo tháng</SectionTitle>
              <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
                Mỗi đường = 1 kênh · Theo dõi tốc độ tăng trưởng riêng từng kênh
              </p>
              {monthlyM.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={monthlyM} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <YAxis tickFormatter={v => `${v}M`} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <Tooltip formatter={(val, name) => [`₫${val}M`, name]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {chNames.map((name, i) => (
                      <Line key={name} type="monotone" dataKey={name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <DevEmptyState title="Chưa có dữ liệu xu hướng theo tháng" />
              )}
            </div>

            {/* Scorecard tỷ trọng kênh — không có ROAS (thuộc Marketing tab) */}
            <div className="lcard p-5 col-span-12 lg:col-span-5">
              <SectionTitle>Tỷ trọng & tăng trưởng kênh</SectionTitle>
              <div className="space-y-3 mt-2">
                {[...chData].sort((a, b) => b.revenue - a.revenue).map((ch, idx) => {
                  const growthUp = ch.growth >= 0
                  return (
                    <div key={ch.name} className="rounded-xl p-3"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: idx === 0 ? '#F59E0B' : idx === 1 ? '#9CA3AF' : idx === 2 ? '#B45309' : 'var(--bg-card)',
                                     color: idx < 3 ? '#fff' : 'var(--text-tertiary)' }}>
                            {idx + 1}
                          </span>
                          <span className="text-sm font-semibold" style={{ color: getChannelColor(ch.name) }}>
                            {ch.name}
                          </span>
                        </div>
                        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          ₫{ch.revenue}M
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full mb-2" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${(ch.revenue / maxRev) * 100}%`, background: getChannelColor(ch.name) }} />
                      </div>
                      <div className="flex gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <span className="font-medium">{ch.revenuePct.toFixed(1)}% tỷ trọng</span>
                        <span style={{ color: growthUp ? 'var(--accent-500)' : 'var(--color-error)' }}>
                          {growthUp ? '▲' : '▼'} {Math.abs(ch.growth)}%
                        </span>
                        <span>{ch.orders.toLocaleString('vi-VN')} đơn</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Bảng so sánh chi tiết theo kênh */}
      <div className="lcard p-5">
        <SectionTitle>Bảng so sánh chi tiết theo kênh</SectionTitle>
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
                    <td className="py-2 px-3 font-semibold" style={{ color: getChannelColor(ch.channelName) }}>{ch.channelName}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtM(ch.revenue)}</td>
                    <td className="py-2 px-3 text-right font-mono"
                      style={{ color: parseFloat(ch.growth) >= 0 ? 'var(--accent-500)' : 'var(--color-error)' }}>
                      {parseFloat(ch.growth) >= 0 ? '+' : ''}{ch.growth}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold"
                      style={{ color: parseFloat(ch.roas) >= 4 ? 'var(--accent-500)' : parseFloat(ch.roas) >= 2 ? '#F59E0B' : (parseFloat(ch.roas) > 0 ? 'var(--color-error)' : 'var(--text-tertiary)') }}>
                      {Number.isFinite(parseFloat(ch.roas)) && parseFloat(ch.roas) > 0 ? `${parseFloat(ch.roas).toFixed(1)}x` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{ch.orders.toLocaleString('vi-VN')}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{ch.revPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      {/* ── Attribution mini-widget ── */}
      <MiniWidget title="Phân bổ doanh thu theo kênh (Attribution)" icon="hub" href="/attribution" loading={attrLoading}>
        {attrData ? (
          <div className="space-y-2">
            {(attrData.channels ?? attrData.attribution ?? []).slice(0, 5).map((ch, i) => {
              const pct      = Number(ch.pct ?? ch.contribution_pct ?? ch.attribution_pct ?? 0)
              const chName   = ch.channel ?? ch.channelName ?? ch.name ?? '—'
              const chColor  = getChannelColor(chName)
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: chColor }}>{chName}</span>
                    <span className="font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: chColor }} />
                  </div>
                </div>
              )
            })}
            {!(attrData.channels ?? attrData.attribution)?.length && (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Chưa có dữ liệu</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Không tải được dữ liệu</p>
        )}
      </MiniWidget>
    </div>
  )
}

// ── Tab: 4 — Customer Analytics ───────────────────────────────────────────────
// Tính segment cards từ RFM data thật (AI /customers/segments)
function buildSegmentCardsFromRfm(rfm) {
  if (!rfm?.segment_summary) return null
  const s = rfm.segment_summary
  const total = rfm.total_customers || 1
  return [
    { key: 'new',       label: 'Mới',         count: s.New?.count ?? 0,                               total, color: '#6366F1', icon: 'person_add'        },
    { key: 'returning', label: 'Quay lại',     count: (s.Loyal?.count ?? 0) + (s.Returning?.count ?? 0), total, color: '#10B981', icon: 'replay'         },
    { key: 'vip',       label: 'VIP',          count: s.VIP?.count ?? 0,                               total, color: '#F59E0B', icon: 'workspace_premium'  },
    { key: 'atrisk',    label: 'Nguy cơ rời',  count: (s['At Risk']?.count ?? 0) + (s.Lost?.count ?? 0), total, color: '#EF4444', icon: 'warning'         },
  ]
}

// Map màu cố định cho từng phân khúc RFM
const RFM_SEG_COLORS = {
  'VIP':        '#F59E0B',
  'Champions':  '#8B5CF6',
  'Loyal':      '#10B981',
  'Returning':  '#6366F1',
  'New':        '#3B82F6',
  'At Risk':    '#F97316',
  'Lost':       '#EF4444',
  'Potential':  '#06B6D4',
}

// Xây dữ liệu CLV Scatter từ RFM segment_summary thật
function buildClvScatterFromRfm(rfm) {
  if (!rfm?.segment_summary) return null
  const s = rfm.segment_summary
  return Object.entries(s)
    .filter(([, v]) => v?.count > 0)
    .map(([name, v]) => ({
      name,
      freq:  Number(v.avg_frequency ?? 0),
      clv:   Number(v.avg_monetary  ?? 0),
      value: Number(v.count         ?? 1),
      color: RFM_SEG_COLORS[name] ?? '#94A3B8',
    }))
    .sort((a, b) => b.clv - a.clv)
}

function TabCustomer({ data, wd = {}, wl = {} }) {
  const { t }        = useTranslation()
  const [drillSeg,        setDrillSeg]        = useState(null)
  const [drillCusts,      setDrillCusts]      = useState({ items: [], total: 0, page: 1, totalPages: 1 })
  const [drillCustLoad,   setDrillCustLoad]   = useState(false)
  const [drillCustMore,   setDrillCustMore]   = useState(false)
  const geoData    = wd.geo       ?? null
  const geoLoading = wl.geo       ?? false
  const sentData   = wd.sentiment ?? null
  const sentLoading = wl.sentiment ?? false
  // Segment cards + CLV scatter: ưu tiên RFM thật, fallback mock
  const rfmData      = wd.rfm ?? null
  const segCards     = buildSegmentCardsFromRfm(rfmData) ?? data.customerSegmentCards ?? []
  const totalCusts   = rfmData?.total_customers ?? data.totalCustomers ?? 1
  const clvScatter   = buildClvScatterFromRfm(rfmData) ?? data.customerSegments ?? []

  const handleDrillSeg = async (seg) => {
    setDrillSeg(seg)
    setDrillCustLoad(true)
    try {
      const res = await getDrillDownCustomers(seg.key)
      setDrillCusts(res)
    } catch {
      setDrillCusts({ items: [], total: 0, page: 1, totalPages: 1 })
    } finally {
      setDrillCustLoad(false)
    }
  }

  const loadMoreCust = async () => {
    if (!drillSeg || drillCusts.page >= drillCusts.totalPages) return
    setDrillCustMore(true)
    try {
      const res = await getDrillDownCustomers(drillSeg.key, { page: drillCusts.page + 1 })
      setDrillCusts(prev => ({ ...res, items: [...prev.items, ...res.items] }))
    } catch {} finally { setDrillCustMore(false) }
  }

  const custCols = [
    { key: 'customerId',   label: 'Mã KH' },
    { key: 'name',         label: 'Tên' },
    { key: 'totalOrders',  label: 'Số đơn' },
    { key: 'totalRevenue', label: 'Tổng chi', render: v => Number(v).toLocaleString('vi-VN') + ' ₫' },
    { key: 'lastOrderDate',label: 'Đơn gần nhất' },
  ]

  return (
    <div className="space-y-5">
      {/* 4 Cards phân khúc KH */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {segCards.map(seg => {
          const pct = totalCusts > 0 ? ((seg.count / totalCusts) * 100).toFixed(1) : '0.0'
          return (
            <div key={seg.key}
              className="lcard lcard-hover px-4 py-3 cursor-pointer"
              onClick={() => handleDrillSeg(seg)}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="icon icon-sm" style={{ color: seg.color, fontSize: 18 }}>{seg.icon}</span>
                <span className="text-caption font-semibold" style={{ color: 'var(--text-secondary)' }}>{seg.label}</span>
              </div>
              <div className="text-2xl font-bold font-mono" style={{ color: seg.color }}>
                {seg.count.toLocaleString('vi-VN')}
              </div>
              <div className="text-caption mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{pct}% tổng KH</div>
            </div>
          )
        })}
      </div>

      {/* CLV + Heatmap — 2 cột trên desktop, 1 cột mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lcard p-5">
          <SectionTitle>{t('dashboard.chart.clv')}</SectionTitle>
          <p className="text-caption mb-2" style={{ color: 'var(--text-tertiary)' }}>
            X: tần suất mua · Y: CLV trung bình · Kích thước: số khách
            {rfmData && <span className="ml-2 font-semibold" style={{ color: 'var(--accent-500)' }}>● Dữ liệu thật</span>}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="freq" name="Tần suất"
                label={{ value: 'Số đơn TB', position: 'insideBottom', offset: -12, fontSize: 10, fill: 'var(--text-tertiary)' }}
                tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false}
                domain={clvScatter.length > 0 ? ['auto', 'auto'] : [0, 5]}
              />
              <YAxis dataKey="clv" name="CLV" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={56}
                tickFormatter={v => fmtM(v)}
                domain={clvScatter.length > 0 ? ['auto', 'auto'] : [0, 1000000]}
              />
              <ZAxis dataKey="value" range={[40, 280]} name="Số KH" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const d = payload[0].payload
                  return (
                    <div className="lcard p-2 text-xs space-y-0.5" style={{ minWidth: 150 }}>
                      <p className="font-semibold" style={{ color: d.color ?? 'var(--text-primary)' }}>{d.name}</p>
                      <p>CLV TB: <span className="font-mono">{Number(d.clv).toLocaleString('vi-VN')} ₫</span></p>
                      <p>Tần suất TB: <span className="font-mono">{Number(d.freq).toFixed(1)} đơn</span></p>
                      <p>Số KH: <span className="font-mono">{Number(d.value).toLocaleString('vi-VN')}</span></p>
                    </div>
                  )
                }}
              />
              {clvScatter.map((seg, i) => (
                <Scatter key={seg.name ?? i} name={seg.name} data={[seg]} fill={seg.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ScatterChart>
          </ResponsiveContainer>
          {clvScatter.length === 0 && (
            <p className="text-caption text-center mt-2" style={{ color: 'var(--text-tertiary)' }}>Chưa có dữ liệu RFM</p>
          )}
        </div>

        <div className="lcard p-5">
          <SectionTitle>{t('dashboard.chart.heatmap')}</SectionTitle>
          <p className="text-caption mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Mật độ đơn hàng theo giờ × ngày trong tuần
          </p>
          <div className="overflow-x-auto" style={{ minHeight: 200 }}>
            <HeatmapGrid data={data.heatmap ?? []} />
          </div>
        </div>
      </div>

      {/* DetailDrawer — danh sách KH theo phân khúc RFM */}
      <DetailDrawer
        open={!!drillSeg}
        onClose={() => { setDrillSeg(null); setDrillCusts({ items: [], total: 0, page: 1, totalPages: 1 }) }}
        title={drillCustLoad ? 'Đang tải...' : `Khách hàng phân khúc "${drillSeg?.label ?? ''}"`}
        subtitle={!drillCustLoad && drillCusts.total > 0 ? `${drillCusts.total} khách hàng` : undefined}
        width={680}
        footer={
          drillCusts.items.length > 0 && (
            <button className="lbtn lbtn-secondary text-xs" style={{ height: 32 }}
              onClick={() => drillSeg && exportCsv(`customers_${drillSeg.key}.csv`, drillCusts.items)}>
              <span className="icon icon-sm">download</span>
              Xuất CSV
            </button>
          )
        }
      >
        <DrillTable
          columns={custCols}
          result={drillCusts}
          loading={drillCustLoad}
          onLoadMore={loadMoreCust}
          loadingMore={drillCustMore}
        />
      </DetailDrawer>

      {/* Phản hồi mạng xã hội (Facebook) */}
      <SocialFeedbackSection data={sentData} loading={sentLoading} />

      {/* ── Geo + Sentiment mini-widgets ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniWidget title="Phân bổ địa lý khách hàng" icon="location_on" href="/geo" loading={geoLoading}>
          {geoData ? (
            <div className="space-y-2">
              {(geoData.points ?? []).slice(0, 5).map((p, i) => {
                const maxRev = geoData.points?.[0]
                const rev    = Number(p.revenue ?? 0)
                const maxR   = Number(maxRev?.revenue ?? 1)
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                      <span>{p.province ?? '—'}</span>
                      <span className="font-mono">{fmtM(rev)}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="h-full rounded-full" style={{ width: `${maxR > 0 ? Math.min(rev / maxR * 100, 100) : 0}%`, background: '#6366F1' }} />
                    </div>
                  </div>
                )
              })}
              {!(geoData.points?.length) && (
                <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Chưa có dữ liệu</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Không tải được dữ liệu</p>
          )}
        </MiniWidget>

        <MiniWidget title="Cảm xúc khách hàng (Sentiment)" icon="sentiment_satisfied" href="/sentiment" loading={sentLoading}>
          {sentData ? (() => {
            const pos = sentData.positive ?? 0
            const neg = sentData.negative ?? 0
            const neu = sentData.neutral  ?? 0
            const tot = pos + neg + neu || 1
            return (
              <div className="space-y-2">
                {[
                  { label: 'Tích cực', count: pos, pct: ((pos / tot) * 100).toFixed(1), color: '#10B981' },
                  { label: 'Tiêu cực', count: neg, pct: ((neg / tot) * 100).toFixed(1), color: '#EF4444' },
                  { label: 'Trung lập', count: neu, pct: ((neu / tot) * 100).toFixed(1), color: '#94A3B8' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                      <span>{s.label}</span>
                      <span className="font-mono font-semibold" style={{ color: s.color }}>{s.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-right mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {tot} bình luận đã phân tích
                </p>
              </div>
            )
          })() : (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Không tải được dữ liệu</p>
          )}
        </MiniWidget>
      </div>
    </div>
  )
}

// ── Social Feedback Section ───────────────────────────────────────────────────
const SENTIMENT_COLORS = { positive: '#10B981', negative: '#EF4444', neutral: '#64748B' }
const SENTIMENT_BG     = { positive: 'rgba(16,185,129,0.10)', negative: 'rgba(239,68,68,0.10)', neutral: 'rgba(100,116,139,0.10)' }

function SocialFeedbackSection({ data = null, loading = false }) {

  if (loading) return (
    <div className="lcard p-5 flex justify-center py-10">
      <span className="w-5 h-5 border-2 rounded-full"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: '#1877F2', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!data || data.total_comments === 0) return (
    <div className="lcard p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="icon" style={{ fontSize: 20, color: '#1877F2' }}>thumb_up</span>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Phản hồi mạng xã hội</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Chưa có dữ liệu phản hồi. Kết nối Facebook Page và chạy scrape để xem phân tích.
      </p>
    </div>
  )

  const pieData = [
    { name: 'Tích cực', value: data.positive, color: SENTIMENT_COLORS.positive },
    { name: 'Tiêu cực', value: data.negative, color: SENTIMENT_COLORS.negative },
    { name: 'Trung tính', value: data.neutral, color: SENTIMENT_COLORS.neutral },
  ].filter(d => d.value > 0)

  return (
    <div className="lcard p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="icon" style={{ fontSize: 20, color: '#1877F2' }}>thumb_up</span>
        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Phản hồi mạng xã hội</span>
        <span className="text-xs px-2 py-0.5 rounded-full ml-1"
              style={{ background: 'rgba(24,119,242,0.10)', color: '#1877F2' }}>
          {data.total_comments} bình luận
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Pie chart sentiment */}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Phân tích cảm xúc</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={52}
                     dataKey="value" stroke="none">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} (${((v/data.total_comments)*100).toFixed(1)}%)`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{d.name}:</span>
                  <span className="font-semibold" style={{ color: d.color }}>
                    {d.value} ({((d.value/data.total_comments)*100).toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top issues & praises */}
        <div className="space-y-3">
          {data.top_issues?.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#EF4444' }}>
                Top phàn nàn nhiều nhất
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.top_issues.map((issue, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.20)' }}>
                    {issue}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.top_praises?.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#10B981' }}>
                Top điều khách hay khen
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.top_praises.map((praise, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(16,185,129,0.10)', color: '#10B981', border: '1px solid rgba(16,185,129,0.20)' }}>
                    {praise}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5 comment gần nhất */}
      {data.recent_comments?.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Bình luận gần nhất</p>
          <div className="space-y-2">
            {data.recent_comments.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg text-xs"
                   style={{ background: 'var(--bg-elevated)' }}>
                <span className="icon shrink-0 mt-0.5" style={{ fontSize: 14, color: SENTIMENT_COLORS[c.sentiment] }}>
                  {c.sentiment === 'positive' ? 'sentiment_satisfied' : c.sentiment === 'negative' ? 'sentiment_dissatisfied' : 'sentiment_neutral'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.author_name}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{ background: SENTIMENT_BG[c.sentiment], color: SENTIMENT_COLORS[c.sentiment] }}>
                      {c.sentiment === 'positive' ? 'Tích cực' : c.sentiment === 'negative' ? 'Tiêu cực' : 'Trung tính'}
                    </span>
                  </div>
                  <p className="line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{c.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function HeatmapGrid({ data = [] }) {
  const { t }   = useTranslation()
  const days    = ['T2','T3','T4','T5','T6','T7','CN']
  const hours   = [...new Set(data.map(d => d.hour))].sort()
  const maxOrders = data.length ? Math.max(...data.map(d => d.orders)) : 0

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
function TabMarketing({ data, wd = {}, wl = {} }) {
  const { t }       = useTranslation()
  const navigate    = useNavigate()
  const campData    = wd.campaign ?? null
  const campLoading = wl.campaign ?? false

  // Kiểm tra có kênh nào chưa nhập chi phí QC không
  const missingAdSpend = (data.revenueByChannel ?? []).filter(ch => (ch.adSpend ?? 0) === 0)

  const safeRoas = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
  const comboData = data.revenueByChannel.map(ch => ({
    name:       ch.channelName.split(' ')[0],
    adSpend:    ch.adSpend / 1_000_000,
    revenue:    ch.revenue / 1_000_000,
    roas:       safeRoas(ch.roas),
    roasTarget: ch.roasTarget || 4.0,
    cac:        ch.cac,
  }))

  // Label ROAS tùy chỉnh hiển thị trực tiếp trên bar
  const RoasLabel = ({ x, y, width, value }) => {
    if (!value || !Number.isFinite(value) || value <= 0) return null
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
      {/* Banner nhắc nhập chi phí QC nếu chưa đủ */}
      {missingAdSpend.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#D97706' }}>
              ⚠ Chưa nhập chi phí QC cho {missingAdSpend.length} kênh — ROAS hiển thị chưa chính xác
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {missingAdSpend.map(c => c.channelName).join(', ')}
            </p>
          </div>
          <button
            onClick={() => navigate('/finance/ad-spend')}
            className="lbtn lbtn-secondary text-xs !h-8 !px-3 shrink-0">
            Nhập chi phí QC
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* ComboChart chi phí vs doanh thu + ROAS label */}
        <div className="lcard p-5 col-span-12 lg:col-span-8">
          <SectionTitle>{t('dashboard.chart.marketingCombo')}</SectionTitle>
          <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {t('dashboard.series.roasNote')}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={comboData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={44} tickFormatter={tickFmtPreM} />
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
                    style={{ color: ch.roas >= 4 ? 'var(--accent-500)' : ch.roas >= 2 ? '#F59E0B' : (ch.roas > 0 ? 'var(--color-error)' : 'var(--text-tertiary)') }}>
                    {ch.roas > 0 ? `${ch.roas}x` : '—'}
                  </span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.min((ch.roas || 0) / 8 * 100, 100)}%`, background: CHART_COLORS[i] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bảng CAC | ROAS | ROAS mục tiêu | Đánh giá */}
      <div className="lcard p-5">
        <SectionTitle>Bảng hiệu quả Marketing — CAC · ROAS · Mục tiêu</SectionTitle>
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

      {/* Chi phí theo loại quảng cáo */}
      {data?.adTypeCosts?.length > 0 ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="lcard p-5 col-span-12 lg:col-span-5">
            <SectionTitle>Chi phí theo loại quảng cáo</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.adTypeCosts} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3}>
                  {data.adTypeCosts.map((_, i) => <Cell key={i} fill={adPieColors[i % adPieColors.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtM(v)} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="lcard p-5 col-span-12 lg:col-span-7">
            <SectionTitle>Chi phí quảng cáo — phân bổ ngang</SectionTitle>
            <div className="space-y-3 mt-2">
              {data.adTypeCosts.map((item, i) => {
                const total = data.adTypeCosts.reduce((s, x) => s + x.value, 0)
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
      ) : (
        <div className="lcard p-5">
          <SectionTitle>Chi phí theo loại quảng cáo</SectionTitle>
          <DevEmptyState title="Chưa có dữ liệu chi phí quảng cáo theo loại" desc="Hệ thống chưa thu thập dữ liệu phân loại chi phí QC (Sponsored, Banner, Video...) từ các nền tảng." />
        </div>
      )}

      {/* ── Campaign mini-widget ── */}
      <MiniWidget title="Chiến dịch Marketing được đề xuất" icon="campaign" href="/campaign" loading={campLoading}>
        {campData ? (
          <div className="space-y-2">
            {(campData.upcoming_events ?? campData.windows ?? []).slice(0, 4).map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
                   style={{ background: 'var(--bg-elevated)' }}>
                <span className="icon text-base shrink-0 mt-0.5"
                      style={{ color: ['#6366F1','#10B981','#F59E0B','#EC4899'][i % 4] }}>
                  {c.days_until != null ? 'event' : 'campaign'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    {c.name ?? c.label ?? `Chiến dịch ${i + 1}`}
                  </p>
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-tertiary)' }}>
                    {c.tip ?? (c.events?.length ? c.events.join(', ') : '')}
                    {c.days_until != null && ` · còn ${c.days_until} ngày`}
                  </p>
                </div>
                {c.boost_expected != null && (
                  <span className="text-xs font-bold shrink-0" style={{ color: '#10B981' }}>
                    +{Math.round((c.boost_expected - 1) * 100)}%
                  </span>
                )}
                {c.vs_overall_pct != null && c.boost_expected == null && (
                  <span className="text-xs font-bold shrink-0"
                        style={{ color: c.vs_overall_pct > 0 ? '#10B981' : '#F59E0B' }}>
                    {c.vs_overall_pct > 0 ? '+' : ''}{c.vs_overall_pct}%
                  </span>
                )}
              </div>
            ))}
            {!(campData.upcoming_events ?? campData.windows)?.length && (
              <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Chưa có đề xuất</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Không tải được dữ liệu</p>
        )}
      </MiniWidget>
    </div>
  )
}

// ── Tab: 6 — Inventory Analytics ─────────────────────────────────────────────
function TabInventory({ data, wd = {}, wl = {} }) {
  const { t }      = useTranslation()
  const navigate   = useNavigate()
  const [showAllLowStock,  setShowAllLowStock]  = useState(false)
  const [showAllOverstock, setShowAllOverstock] = useState(false)
  // Drawer xem chi tiết tồn kho sản phẩm (click vào sản phẩm sắp hết hoặc ứ đọng)
  const [invDrawerItem, setInvDrawerItem] = useState(null)
  const invKpi = data.inventoryKpi || { avgDIO: 0, overstockRate: '0.0', stockoutRate: '0.0' }
  const fmtPct = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—' }
  const invKpis = [
    { label: 'Số ngày tồn kho (DIO)',    value: `${invKpi.avgDIO ?? '—'} ngày`, icon: 'hourglass_empty',      color: '#6366F1' },
    { label: 'Tỷ lệ tồn kho dư',         value: fmtPct(invKpi.overstockRate),   icon: 'inventory',             color: '#F59E0B' },
    { label: 'Tỷ lệ hết hàng',           value: fmtPct(invKpi.stockoutRate),    icon: 'remove_shopping_cart',  color: 'var(--color-error)' },
    { label: 'Tỷ lệ hoàn hàng',          value: fmtPct(invKpi.returnRate),      icon: 'assignment_return',     color: '#EC4899' },
    { label: 'Tỷ lệ huỷ đơn',           value: fmtPct(invKpi.cancelRate),      icon: 'cancel',                color: 'var(--color-error)' },
    { label: 'Giao hàng thành công',      value: fmtPct(invKpi.deliverySuccess), icon: 'local_shipping',       color: 'var(--accent-500)' },
    { label: 'Thời gian xử lý đơn',       value: invKpi.processingTime ?? '—',   icon: 'timer',                color: '#F59E0B' },
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

  // Gộp data.inventory theo tên sản phẩm, tính avg returnRate, top 10
  const returnByProduct = (() => {
    const map = {}
    ;(data.inventory || []).forEach(item => {
      const name = item.productName ?? item.product ?? '—'
      const rate = parseFloat(item.returnRate ?? 0)
      if (!map[name]) map[name] = { count: 0, total: 0 }
      map[name].count += 1
      map[name].total += Number.isFinite(rate) ? rate : 0
    })
    return Object.entries(map)
      .map(([name, v]) => ({ product: name, returnRate: v.count > 0 ? v.total / v.count : 0 }))
      .filter(p => p.returnRate > 0)
      .sort((a, b) => b.returnRate - a.returnRate)
      .slice(0, 10)
  })()

  const [returnTab, setReturnTab] = useState('product')
  return (
    <div className="space-y-5">
      {/* Header row — phân biệt analytics view vs. quản lý vận hành */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Phân tích tổng quan tồn kho & vận hành — dữ liệu từ đơn hàng thực tế
          </p>
        </div>
        <button
          onClick={() => navigate('/inventory/dashboard')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--primary-600)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.16)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
        >
          <span className="icon icon-sm">warehouse</span>
          Quản lý Kho
          <span className="icon text-sm">arrow_forward</span>
        </button>
      </div>

      {/* KPI strip mở rộng — 7 cards trải đều màn hình */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
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

      {/* Top 5 tồn cao nhất và sắp hết hàng — dạng ranking bar visual */}
      <div className="grid grid-cols-12 gap-4">
        {/* ── Tồn kho ứ đọng (OVERSTOCK) ── */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Tồn kho ứ đọng (Top 5)</SectionTitle>
            {(data.top5Overstock?.length ?? 0) > 5 && (
              <button onClick={() => setShowAllOverstock(v => !v)}
                className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--primary-600)', background: 'rgba(99,102,241,0.08)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.16)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}>
                {showAllOverstock ? 'Thu gọn' : `Hiện tất cả (${data.top5Overstock.length})`}
              </button>
            )}
          </div>
          {(data.top5Overstock?.length ?? 0) === 0 ? (
            <p className="text-caption text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Không có sản phẩm ứ đọng</p>
          ) : (
            <div className="space-y-3">
              {(showAllOverstock ? data.top5Overstock : (data.top5Overstock || []).slice(0, 5)).map((item, i) => {
                const diff = parseFloat(item.stockDiffPct)
                const barPct = Math.min(100, Math.max(5, diff > 0 ? diff : 0))
                return (
                  <div key={i} className="cursor-pointer rounded-lg px-3 py-2.5 transition-colors"
                    style={{ background: 'var(--bg-elevated)' }}
                    onClick={() => setInvDrawerItem({ ...item, type: 'overstock' })}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium truncate max-w-[65%]" style={{ color: 'var(--text-primary)' }}>{item.product}</span>
                      <span className="font-mono font-bold text-xs" style={{ color: '#F59E0B' }}>+{item.stockDiffPct}% vượt dự báo</span>
                    </div>
                    <div className="h-2 rounded-full mb-1.5" style={{ background: 'rgba(245,158,11,0.15)' }}>
                      <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: '#F59E0B' }} />
                    </div>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span>Tồn: <b style={{ color: 'var(--text-primary)' }}>{item.stock.toLocaleString('vi-VN')}</b></span>
                      <span>Dự báo: {item.forecast.toLocaleString('vi-VN')}</span>
                      <span>DIO: {item.daysOfStock}d</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Sắp hết hàng (LOW STOCK RISK < 14 ngày bán) ── */}
        <div className="lcard p-5 col-span-12 lg:col-span-6">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Top 5 sắp hết hàng (tồn &lt; 14 ngày bán)</SectionTitle>
            {(data.top5LowStock?.length ?? 0) > 5 && (
              <button onClick={() => setShowAllLowStock(v => !v)}
                className="text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--primary-600)', background: 'rgba(99,102,241,0.08)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.16)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}>
                {showAllLowStock ? 'Thu gọn' : `Hiện tất cả (${data.top5LowStock.length})`}
              </button>
            )}
          </div>
          {!data.top5LowStock?.length ? (
            <p className="text-caption text-center py-4" style={{ color: 'var(--accent-500)' }}>
              <span className="icon" style={{ fontSize: 16 }}>check_circle</span> Tất cả sản phẩm đủ tồn kho
            </p>
          ) : (
            <div className="space-y-3">
              {(showAllLowStock ? data.top5LowStock : data.top5LowStock.slice(0, 5)).map((item, i) => {
                const daysLeft = item.dailySales > 0 ? Math.round(item.stock / item.dailySales) : 999
                const isOut    = item.stock === 0
                const isCrit   = daysLeft <= 7
                const barColor = isOut ? 'var(--color-error)' : isCrit ? '#EF4444' : '#F59E0B'
                // bar width: 0d=100%, 14d=0% (ngược: càng ít ngày càng đỏ nhiều)
                const barPct   = isOut ? 100 : Math.min(100, Math.max(8, ((14 - daysLeft) / 14) * 100))
                return (
                  <div key={i} className="cursor-pointer rounded-lg px-3 py-2.5 transition-colors"
                    style={{ background: 'var(--bg-elevated)' }}
                    onClick={() => setInvDrawerItem({ ...item, type: 'lowstock', daysLeft })}
                    onMouseEnter={e => e.currentTarget.style.background = isOut ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium truncate max-w-[65%]" style={{ color: 'var(--text-primary)' }}>{item.product}</span>
                      <span className="font-mono font-bold text-xs" style={{ color: barColor }}>
                        {isOut ? 'Hết hàng' : `${daysLeft} ngày`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full mb-1.5" style={{ background: `rgba(239,68,68,0.12)` }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: barColor }} />
                    </div>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span>Tồn: <b style={{ color: barColor }}>{item.stock.toLocaleString('vi-VN')}</b></span>
                      <span>{item.dailySales > 0 ? `${Number(item.dailySales).toFixed(1)} đv/ngày` : 'Chưa bán'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
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
            {returnByProduct.length === 0 ? (
              <p className="text-caption text-center py-4" style={{ color: 'var(--text-tertiary)' }}>Không có sản phẩm hoàn trả</p>
            ) : returnByProduct.map((item, i) => {
              const rate = parseFloat(item.returnRate.toFixed(1))
              const barColor = rate > 20 ? 'var(--color-error)' : rate > 10 ? '#F59E0B' : 'var(--accent-500)'
              return (
              <div key={i}>
                <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>
                  <span className="truncate max-w-[70%]" title={item.product}>{item.product}</span>
                  <span className="font-mono font-bold" style={{ color: barColor }}>{rate}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.min(rate, 100)}%`, background: barColor }} />
                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className="space-y-3">
            {(data.returnByChannel || []).map((ch, i) => {
              const rate = parseFloat(ch.returnRate) || 0
              const barColor = rate > 20 ? 'var(--color-error)' : rate > 10 ? '#F59E0B' : 'var(--accent-500)'
              return (
              <div key={i}>
                <div className="flex justify-between text-caption mb-1">
                  <span className="font-medium" style={{ color: getChannelColor(ch.channelName) }}>{ch.channelName}</span>
                  <span className="font-mono font-bold" style={{ color: barColor }}>{rate.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.min(rate, 100)}%`, background: barColor }} />
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* DetailDrawer — chi tiết tồn kho sản phẩm */}
      <DetailDrawer
        open={!!invDrawerItem}
        onClose={() => setInvDrawerItem(null)}
        title={invDrawerItem?.product ?? ''}
        subtitle={invDrawerItem?.type === 'lowstock' ? 'Sản phẩm sắp hết hàng' : 'Tồn kho ứ đọng'}
        width={480}
      >
        {invDrawerItem && (
          <div className="p-5 space-y-4">
            {invDrawerItem.type === 'lowstock' ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: invDrawerItem.stock === 0 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${invDrawerItem.stock === 0 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                  <span className="icon text-2xl" style={{ color: invDrawerItem.stock === 0 ? 'var(--color-error)' : '#F59E0B' }}>
                    {invDrawerItem.stock === 0 ? 'error' : 'warning'}
                  </span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: invDrawerItem.stock === 0 ? 'var(--color-error)' : '#D97706' }}>
                      {invDrawerItem.stock === 0 ? 'Đã hết hàng' : `Còn khoảng ${invDrawerItem.daysLeft} ngày bán`}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {invDrawerItem.stock === 0 ? 'Cần nhập hàng ngay lập tức' : 'Nên đặt hàng bổ sung sớm'}
                    </p>
                  </div>
                </div>
                {[
                  { label: 'Tồn kho hiện tại', value: invDrawerItem.stock.toLocaleString('vi-VN') + ' đơn vị', icon: 'inventory' },
                  { label: 'Tốc độ bán TB/ngày', value: invDrawerItem.dailySales > 0 ? Number(invDrawerItem.dailySales).toFixed(1) + ' đv/ngày' : 'Chưa có dữ liệu', icon: 'trending_up' },
                  { label: 'Số ngày còn có thể bán', value: invDrawerItem.daysLeft >= 999 ? '—' : `${invDrawerItem.daysLeft} ngày`, icon: 'schedule' },
                  { label: 'Mức độ rủi ro', value: invDrawerItem.stock === 0 ? 'Hết hàng' : invDrawerItem.daysLeft <= 7 ? 'RỦI RO CAO' : 'CẢNH BÁO', icon: 'flag', valueColor: invDrawerItem.stock === 0 || invDrawerItem.daysLeft <= 7 ? 'var(--color-error)' : '#F59E0B' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <span className="icon" style={{ fontSize: 16 }}>{row.icon}</span>
                      {row.label}
                    </div>
                    <span className="font-semibold text-sm font-mono" style={{ color: row.valueColor ?? 'var(--text-primary)' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  <span className="icon text-2xl" style={{ color: '#F59E0B' }}>inventory_2</span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#D97706' }}>Tồn kho vượt dự báo {invDrawerItem.stockDiffPct}%</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Cân nhắc chạy khuyến mãi để giảm tồn</p>
                  </div>
                </div>
                {[
                  { label: 'Tồn kho thực tế', value: invDrawerItem.stock.toLocaleString('vi-VN') + ' đv' },
                  { label: 'Tồn kho dự báo 30 ngày', value: (invDrawerItem.forecast ?? 0).toLocaleString('vi-VN') + ' đv' },
                  { label: 'Chênh lệch', value: (parseFloat(invDrawerItem.stockDiffPct) > 0 ? '+' : '') + invDrawerItem.stockDiffPct + '%', valueColor: '#F59E0B' },
                  { label: 'Số ngày tồn kho (DIO)', value: `${invDrawerItem.daysOfStock} ngày` },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                    <span className="font-semibold text-sm font-mono" style={{ color: row.valueColor ?? 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </DetailDrawer>

    </div>
  )
}

// ── DashboardPage ─────────────────────────────────────────────────────────────
// Roles có thể xem các tab nâng cao (FB Ads, AI Insights)
const ANALYST_ROLES = ['Owner', 'Manager', 'DataIT', 'SuperAdmin']

export default function DashboardPage() {
  const { t }      = useTranslation()
  const { user }   = useAuth()
  const canViewAnalytics = ANALYST_ROLES.includes(user?.role ?? '')
  const [activeTab,   setActiveTab]   = useState('overview')
  const [presetKey,   setPresetKey]   = useState('month')
  const [customFrom,  setCustomFrom]  = useState(() => `${new Date().getFullYear()}-01-01`)
  const [customTo,    setCustomTo]    = useState(() => new Date().toISOString().slice(0, 10))
  const [channel,     setChannel]     = useState('all')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [tvy,     setTvy]     = useState(null)
  const [compareMode, setCompareMode] = useState(false)
  const [prevData,    setPrevData]    = useState(null)
  // ── Mini-widget state (lifted từ tab components để tránh loop khi tab unmount/remount) ──
  const [widgetData,    setWidgetData]    = useState({})
  const [widgetLoading, setWidgetLoading] = useState({})
  const widgetGuard = useRef({}) // ngăn double-fetch kể cả trong StrictMode

  // Định nghĩa bên trong component để t() được gọi đúng context
  const QUICK_PRESETS = [
    { key: 'today',  label: t('dashboard.preset.today'),  from: () => relDate(0),      to: () => relDate(0)  },
    { key: 'week',   label: t('dashboard.preset.week'),   from: () => relDate(-6),     to: () => relDate(0)  },
    { key: 'month',  label: t('dashboard.preset.month'),  from: () => relDate(-29),    to: () => relDate(0)  },
    { key: '90d',    label: t('dashboard.preset.90d'),    from: () => relDate(-90),    to: () => relDate(0)  },
    { key: 'all',    label: t('dashboard.preset.all'),    from: () => '2020-01-01',    to: () => relDate(0)  },
    { key: 'custom', label: t('dashboard.preset.custom'), from: null,                  to: null              },
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
      // Fetch song song: dashboard KPI + monthly-by-channel + heatmap + order-funnel + ops KPI + inventory
      const [res, monthlyReal, heatmapReal, funnelReal, opsReal, invReal, topByChannelReal] = await Promise.allSettled([
        getDashboard(from, to, ch),
        getMonthlyByChannel(from, to),
        getOrderHeatmap(from, to, ch),
        getOrderFunnel(from, to, ch),
        getOpsKpi(from, to, ch),
        getInventoryReal(from, to),
        getTopProductsByChannel(from, to, 3),
      ])
      const resData = res.status === 'fulfilled' ? res.value : null
      if (resData?.kpi == null) throw new Error('no_data')

      // Chỉ dùng dữ liệu thực — không fallback mock
      const opsData = opsReal.status === 'fulfilled' ? opsReal.value : null
      const invData = invReal.status === 'fulfilled' ? invReal.value : null

      // Top products: gộp trùng tên, tính % đóng góp
      const topProductsReal = (() => {
        const raw = resData.topProducts ?? []
        const byName = {}
        raw.forEach(p => {
          const key = p.productName
          if (!byName[key]) byName[key] = { ...p, revenue: 0, orders: 0 }
          byName[key].revenue += Number(p.revenue ?? 0)
          byName[key].orders  += Number(p.orders  ?? 0)
        })
        const sorted     = Object.values(byName).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
        const grandTotal = sorted.reduce((s, p) => s + p.revenue, 0)
        return sorted.map(p => ({ ...p, revContribPct: grandTotal > 0 ? ((p.revenue / grandTotal) * 100).toFixed(1) : '0.0' }))
      })()

      const merged = {
        // ── KPI từ DW (DashboardService) ──────────────────────────────────────
        kpi: {
          totalRevenue:     Number(resData.kpi.totalRevenue    ?? 0),
          totalProfit:      Number(resData.kpi.totalProfit     ?? 0),
          totalOrders:      Number(resData.kpi.totalOrders     ?? 0),
          avgOrderValue:    Number(resData.kpi.avgOrderValue   ?? 0),
          newCustomers:     Number(resData.kpi.newCustomers    ?? 0),
          revenueGrowthPct: Number(resData.kpi.revenueGrowthPct ?? 0),
          ordersGrowthPct:  Number(resData.kpi.ordersGrowthPct  ?? 0),
          profitMarginPct:  Number(resData.kpi.profitMarginPct  ?? 0),
        },
        // ── Xu hướng và kênh từ DW ─────────────────────────────────────────
        revenueByDay:     resData.revenueByDay     ?? [],
        revenueByChannel: resData.revenueByChannel ?? [],
        topProducts:      topProductsReal,
        // ── Monthly + Heatmap + Funnel từ OLTP ───────────────────────────────
        monthlyByChannel:  monthlyReal.status === 'fulfilled' ? (monthlyReal.value ?? []) : [],
        heatmap:           heatmapReal.status === 'fulfilled'  ? (heatmapReal.value  ?? []) : [],
        funnel:            funnelReal.status === 'fulfilled'   ? (funnelReal.value   ?? []) : [],
        productsByChannel: topByChannelReal.status === 'fulfilled' ? (topByChannelReal.value ?? []) : [],
        // ── Inventory từ OLTP ─────────────────────────────────────────────────
        inventory:     invData?.inventory     ?? [],
        top5Overstock: invData?.top5Overstock ?? [],
        top5LowStock:  invData?.top5LowStock  ?? [],
        inventoryKpi: {
          ...(invData?.inventoryKpi ?? {}),
          overstockRate:   (() => { const n = parseFloat(invData?.inventoryKpi?.overstockRate); return Number.isFinite(n) ? n : 0 })(),
          stockoutRate:    (() => { const n = parseFloat(invData?.inventoryKpi?.stockoutRate);  return Number.isFinite(n) ? n : 0 })(),
          returnRate:      Number(opsData?.returnRate      ?? 0),
          cancelRate:      Number(opsData?.cancelRate      ?? 0),
          deliverySuccess: Number(opsData?.deliverySuccess ?? 0),
        },
        // Return/cancel theo kênh từ revenueByChannel (backend tính từ OLTP)
        returnByChannel: (resData.revenueByChannel ?? []).map(ch => ({
          channelName: ch.channelName,
          returnRate:  Number(ch.returnRate ?? 0).toFixed(1),
          cancelRate:  Number(ch.cancelRate ?? 0).toFixed(1),
        })),
        // ── Sections chưa có real API → hiện "Không có dữ liệu" ──────────────
        customerSegments:     [],   // chờ RFM API trả segment data
        customerSegmentCards: [],
        radarData:            [],
        adTypeCosts:          [],
        sparklines:           {},
      }

      // Sparklines từ revenueByDay thực (7 điểm cuối) — hình dạng thực, không random
      const last7 = merged.revenueByDay.slice(-7)
      if (last7.length > 0) {
        merged.sparklines = {
          revenue: last7.map(d => ({ v: Number(d.netRevenue)  })),
          orders:  last7.map(d => ({ v: Number(d.orderCount)  })),
          profit:  last7.map(d => ({ v: Number(d.grossProfit) })),
        }
      }
      setData(merged)
    } catch {
      setData(null)
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
      .catch(() => null)
      .then(setPrevData)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, presetKey, customFrom, customTo, channel])

  // Re-render/re-fetch khi bất kỳ filter nào thay đổi
  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    getTodayVsYesterday()
      .then(setTvy)
      .catch(() => setTvy({
        today:     { revenue: 0, orders: 0, profit: 0 },
        yesterday: { revenue: 0, orders: 0, profit: 0 },
        revenuePct: 0, ordersPct: 0,
      }))
  }, [])


  // ── Load mini-widget data khi tab được kích hoạt (mỗi key chỉ fetch 1 lần/session) ──
  const loadWidget = useCallback((key, fetchFn) => {
    if (widgetGuard.current[key]) return  // đã fetch hoặc đang fetch
    widgetGuard.current[key] = true
    setWidgetLoading(p => ({ ...p, [key]: true }))
    fetchFn()
      .then(r  => setWidgetData(p => ({ ...p, [key]: r    })))
      .catch(() => setWidgetData(p => ({ ...p, [key]: null })))
      .finally(() => setWidgetLoading(p => ({ ...p, [key]: false })))
  }, [])

  useEffect(() => {
    if (activeTab === 'overview') {
      loadWidget('leaderboard',  () => getLeaderboard({ limit: 5 }))
      loadWidget('insights',     () => getInsights())
      loadWidget('autoRecs',     () => getRecommendations())
      // Fetch Operating Profit & ACOS từ FinanceController (Phase 1 đã xong)
      const { from, to } = getRange()
      loadWidget('financeKpi',  () => getProfitOverview({ from, to }))
    }
    if (activeTab === 'multichannel')
      loadWidget('attribution', () => getChannelAttribution())
    if (activeTab === 'customer') {
      loadWidget('geo',       () => getGeoDistribution({ limit: 5 }))
      loadWidget('sentiment', () => getFeedbackSummary())
      loadWidget('rfm',       () => getRfmSegments())
    }
    if (activeTab === 'marketing')
      loadWidget('campaign',  () => getCampaignPlan())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loadWidget])

  return (
    <div className="space-y-4">

      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
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
            <span className="hidden sm:inline">{t('dashboard.today.comparePrev')}</span>
          </button>
          <button onClick={fetchData} className="lbtn lbtn-secondary !py-0 !h-9" title={t('common.refresh')}>
            <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>refresh</span>
          </button>
        </div>
      </div>

      {/* Khi API fail — empty state toàn bộ dashboard */}
      {!data && !loading && (
        <AiEmptyState title="Không kết nối được backend — không có dữ liệu để hiển thị" />
      )}

      {/* ── Today vs Yesterday widget ── */}
      {tvy && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            {
              label:    t('dashboard.today.revenue'),
              type:     'revenue',
              value:    fmtM(tvy.today.revenue),
              prev:     fmtM(tvy.yesterday.revenue),
              pct:      tvy.revenuePct,
              pctLabel: t('dashboard.today.vsYesterday'),
              icon:     'payments',
              helpDef:  KPI_DEFINITIONS.revenue,
            },
            {
              label:    t('dashboard.today.orders'),
              type:     'orders',
              value:    tvy.today.orders.toLocaleString(),
              prev:     tvy.yesterday.orders.toLocaleString(),
              pct:      tvy.ordersPct,
              pctLabel: t('dashboard.today.vsYesterday'),
              icon:     'shopping_bag',
              helpDef:  KPI_DEFINITIONS.orders,
            },
            {
              label:    t('dashboard.today.profit'),
              type:     'profit',
              value:    fmtM(tvy.today.profit),
              prev:     fmtM(tvy.yesterday.profit),
              // profitPct vs hôm qua (từ backend); fallback sang gross margin % nếu API cũ
              pct:      tvy.profitPct != null
                          ? tvy.profitPct
                          : (tvy.today.revenue > 0 ? +((tvy.today.profit / tvy.today.revenue) * 100).toFixed(1) : 0),
              pctLabel: tvy.profitPct != null ? t('dashboard.today.vsYesterday') : t('dashboard.today.margin'),
              icon:     'trending_up',
              rawValue: tvy.today.profit,
              helpDef:  KPI_DEFINITIONS.grossProfit,
            },
          ].map(card => {
            const isUp = card.pct >= 0
            // Chỉ lợi nhuận có màu semantic; doanh thu & đơn dùng neutral
            const valueColor =
              card.type === 'profit' && card.rawValue >= 0 ? 'var(--profit-positive)' :
              card.type === 'profit' && card.rawValue <  0 ? 'var(--profit-negative)' :
              'var(--text-primary)'
            return (
              <div key={card.label} className="lcard p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{card.label}</span>
                    {card.helpDef && <InfoTooltip def={card.helpDef} placement="bottom" />}
                  </div>
                  <span className="icon text-base" style={{ color: card.type === 'revenue' ? 'var(--primary-400)' : isUp ? 'var(--accent-500)' : '#EF4444', fontSize: 18 }}>
                    {card.icon}
                  </span>
                </div>
                <div className="font-mono text-2xl font-bold" style={{ color: valueColor }}>
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
                    {card.pctLabel} ({card.prev})
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab navigation — ẩn tab marketing với Staff/Viewer ── */}
      <div className="flex items-center w-full border-b pb-0" style={{ borderColor: 'var(--border)' }}>
        {TABS.filter(tab => canViewAnalytics || !['marketing'].includes(tab.key)).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-body font-medium whitespace-nowrap border-b-2 transition-all"
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
          {activeTab === 'overview'     && <TabOverview     data={data} compareMode={compareMode} prevData={prevData} canViewAnalytics={canViewAnalytics} wd={widgetData} wl={widgetLoading} dateRange={getRange()} />}
          {activeTab === 'sales'        && <TabSales        data={data} compareMode={compareMode} prevData={prevData} from={getRange().from} to={getRange().to} />}
          {activeTab === 'multichannel' && <TabMultiChannel data={data} wd={widgetData} wl={widgetLoading} />}
          {activeTab === 'customer'     && <TabCustomer     data={data} wd={widgetData} wl={widgetLoading} />}
          {activeTab === 'marketing'    && <TabMarketing    data={data} wd={widgetData} wl={widgetLoading} />}
          {activeTab === 'inventory'    && <TabInventory    data={data} wd={widgetData} wl={widgetLoading} />}
        </div>
      )}
    </div>
  )
}
