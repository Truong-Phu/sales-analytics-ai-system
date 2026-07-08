import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../../i18n'
import { fmtMoneyExact, tickFmt, splitFmt } from '../../utils/format'
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
  return localDateKey(d)
}

function localDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfMonthKey() {
  const d = new Date()
  d.setDate(1)
  return localDateKey(d)
}

function startOfQuarterKey() {
  const d = new Date()
  d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1)
  return localDateKey(d)
}

function wrapChartLabel(value, maxChars = 18) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word
    if (next.length <= maxChars) {
      line = next
    } else {
      if (line) lines.push(line)
      line = word
    }
  })
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function WrappedProductTick({ x, y, payload }) {
  const lines = wrapChartLabel(payload?.value, 20)
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="var(--text-tertiary)" fontSize={10}>
        {lines.map((line, i) => (
          <tspan key={`${line}-${i}`} x={0} dy={i === 0 ? 12 : 12}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

function startOfYearKey() {
  return `${new Date().getFullYear()}-01-01`
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
          {i18n.t('common.viewDetails', 'Xem đầy đủ')}
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

const CHANNEL_KEYS  = ['all', 'shopee', 'lazada', 'tiktok', 'offline']
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
  if (key.includes('offline') || key.includes('pos') || key.includes('banquay') || key.includes('bántạiquầy')) return CHANNEL_COLOR.offline
  return CHANNEL_COLOR.other
}

function getChannelDisplayName(name = '') {
  const raw = String(name || '').trim()
  const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '')
  if (key.includes('shopee')) return 'Shopee'
  if (key.includes('lazada')) return 'Lazada'
  if (key.includes('tiktok')) return 'TikTok Shop'
  if (key.includes('offline') || key.includes('pos') || key.includes('banquay')) {
    return i18n.t('dashboard.channel.offline', 'Bán tại quầy')
  }
  return raw || i18n.t('common.other', 'Khác')
}

function resolvePreset(p) {
  return {
    from: typeof p.from === 'function' ? p.from() : p.from,
    to:   typeof p.to   === 'function' ? p.to()   : p.to,
  }
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function SectionTitle({ children, tooltip, className = '' }) {
  return (
    <h3 className={`text-[22px] font-bold mb-4 tracking-tight leading-snug text-foreground inline-flex items-center gap-1.5 ${className}`}>
      <span>{children}</span>
      {tooltip && <InfoTooltip {...tooltip} placement="bottom" />}
    </h3>
  )
}

const isEn = () => i18n.language === 'en'

const CHART_TOOLTIPS = {
  revenueTrend: {
    get title() { return isEn() ? 'Revenue and Profit Trend' : 'Xu hướng doanh thu và lợi nhuận' },
    get description() { return isEn() ? 'Track net revenue and profit over time within the current filter. Used to identify anomalous days and business trends.' : 'Theo dõi doanh thu thuần và lợi nhuận theo thời gian trong bộ lọc hiện tại. Dùng để nhận biết ngày tăng/giảm bất thường và xu hướng kinh doanh.' },
    get formula() { return isEn() ? 'Each point = total revenue/profit of the corresponding day' : 'Mỗi điểm = tổng doanh thu/lợi nhuận của ngày tương ứng' },
    get source() { return isEn() ? 'Dashboard API, by date and channel filter' : 'Dashboard API, theo filter ngày và kênh' },
  },
  channelShare: {
    get title() { return isEn() ? 'Revenue Share by Channel' : 'Tỷ trọng doanh thu theo kênh' },
    get description() { return isEn() ? 'Shows the percentage contribution of each channel to total revenue in the selected period. Click a channel to view related orders.' : 'Cho biết mỗi kênh đóng góp bao nhiêu phần trăm doanh thu trong kỳ đang chọn. Click vào kênh để xem danh sách đơn hàng liên quan.' },
    get formula() { return isEn() ? 'Proportion = channel revenue / total revenue' : 'Tỷ trọng = doanh thu kênh / tổng doanh thu các kênh' },
    get source() { return isEn() ? 'Dashboard API, channel revenue data' : 'Dashboard API, dữ liệu doanh thu theo kênh' },
  },
  paretoProducts: {
    get title() { return isEn() ? 'Pareto Chart of Top Products' : 'Biểu đồ Pareto top sản phẩm' },
    get description() { return isEn() ? 'Sorts products by revenue in descending order. The cumulative % line shows how much the top products contribute to total revenue.' : 'Xếp sản phẩm theo doanh thu giảm dần và đường % tích lũy cho biết nhóm sản phẩm đầu đang đóng góp bao nhiêu trong tổng doanh thu của các sản phẩm hiển thị.' },
    get formula() { return isEn() ? 'Cumulative % = sum of revenue from first to current product / total revenue of top products' : '% tích lũy = tổng doanh thu từ sản phẩm đầu đến sản phẩm hiện tại / tổng doanh thu top sản phẩm' },
    get source() { return isEn() ? 'Dashboard API, top products under current filter' : 'Dashboard API, top sản phẩm theo filter hiện tại' },
  },
  productsByChannel: {
    get title() { return isEn() ? 'Top Products by Channel' : 'Top sản phẩm theo kênh' },
    get description() { return isEn() ? 'Compares best-selling products in each channel. Bars show revenue, line shows gross profit to help identify high-revenue but low-margin products.' : 'So sánh các sản phẩm bán chạy nhất trong từng kênh. Cột thể hiện doanh thu, đường thể hiện lợi nhuận gộp để nhận ra sản phẩm doanh thu cao nhưng biên lợi nhuận thấp.' },
    get formula() { return isEn() ? 'Revenue = total sales value; Gross Profit = revenue - COGS' : 'Doanh thu = tổng giá trị bán; Lợi nhuận gộp = doanh thu - giá vốn' },
    get source() { return isEn() ? 'Dashboard API, product data by channel' : 'Dashboard API, dữ liệu sản phẩm theo kênh' },
  },
  orderFunnel: {
    get title() { return isEn() ? 'Order Processing Funnel' : 'Phễu xử lý đơn hàng' },
    get description() { return isEn() ? 'Track order counts at each stage to detect orders stuck in pending, shipping, or returned/cancelled.' : 'Theo dõi số đơn ở từng trạng thái xử lý để phát hiện đơn bị kẹt ở bước chờ xử lý, đang giao hoặc hoàn/hủy.' },
    get formula() { return isEn() ? 'Each bar = number of orders in the corresponding status in the period' : 'Mỗi cột = số đơn ở trạng thái tương ứng trong kỳ' },
    get source() { return isEn() ? 'Orders API, by date and channel filter' : 'Orders API, theo filter ngày và kênh' },
  },
  channelMonthly: {
    get title() { return isEn() ? 'Channel Revenue by Month' : 'Doanh thu kênh theo tháng' },
    get description() { return isEn() ? 'Compares channel revenue by month, showing the primary contributing channel in each phase.' : 'So sánh doanh thu các kênh theo từng tháng, giúp nhìn nhanh kênh nào đóng góp chính trong từng giai đoạn.' },
    get formula() { return isEn() ? 'Each column section = revenue of a channel in the month' : 'Mỗi phần cột = doanh thu của một kênh trong tháng' },
    get source() { return isEn() ? 'Dashboard API, monthly revenue by channel' : 'Dashboard API, doanh thu tháng theo kênh' },
  },
  channelTrend: {
    get title() { return isEn() ? 'Monthly Channel Revenue Trend' : 'Xu hướng doanh thu từng kênh theo tháng' },
    get description() { return isEn() ? 'Displays individual channel revenue lines over months to compare growth rates.' : 'Hiển thị đường doanh thu riêng của từng kênh qua các tháng để so sánh tốc độ tăng/giảm giữa các kênh.' },
    get formula() { return isEn() ? 'Each point = channel revenue in the month' : 'Mỗi điểm = doanh thu kênh trong tháng' },
    get source() { return isEn() ? 'Dashboard API, monthly revenue by channel' : 'Dashboard API, doanh thu tháng theo kênh' },
  },
  channelGrowth: {
    get title() { return isEn() ? 'Channel Share & Growth' : 'Tỷ trọng và tăng trưởng kênh' },
    get description() { return isEn() ? 'Summarizes revenue share, growth rate, order count, and ROAS for each channel to evaluate multi-channel performance.' : 'Tóm tắt tỷ trọng doanh thu, mức tăng trưởng, số đơn và ROAS của từng kênh để đánh giá hiệu quả đa kênh.' },
    get formula() { return isEn() ? 'Growth = current vs. previous period; ROAS = revenue / ad cost' : 'Tăng trưởng = kỳ này so với kỳ trước; ROAS = doanh thu / chi phí QC' },
    get source() { return isEn() ? 'Dashboard API and Ad Spend API' : 'Dashboard API và chi phí quảng cáo' },
  },
  customerClv: {
    get title() { return isEn() ? 'CLV by Customer Segment' : 'CLV theo phân khúc khách hàng' },
    get description() { return isEn() ? 'Estimates Customer Lifetime Value (CLV) by segment to prioritize retention and care for high-value groups.' : 'Ước tính giá trị vòng đời khách hàng theo từng phân khúc để ưu tiên chăm sóc và giữ chân nhóm có giá trị cao.' },
    get formula() { return isEn() ? 'CLV = average purchase value x purchase frequency x customer lifespan' : 'CLV = giá trị mua trung bình x tần suất mua x thời gian duy trì' },
    get source() { return isEn() ? 'Customers/Dashboard API' : 'Customers/Dashboard API' },
  },
  heatmap: {
    get title() { return isEn() ? 'Customer Activity Heatmap' : 'Heatmap hoạt động khách hàng' },
    get description() { return isEn() ? 'Shows customer purchase or interaction density by day/hour to support timing of sales and outreach.' : 'Cho biết thời điểm khách hàng phát sinh đơn hoặc tương tác nhiều nhất theo ngày/giờ, hỗ trợ chọn khung giờ bán hàng và chăm sóc.' },
    get formula() { return isEn() ? 'Each cell = number of orders or activities in the corresponding day/hour' : 'Mỗi ô = số đơn hoặc lượt hoạt động trong ngày/giờ tương ứng' },
    get source() { return isEn() ? 'Orders/Customers API' : 'Orders/Customers API' },
  },
  marketingCombo: {
    get title() { return isEn() ? 'Marketing Performance' : 'Hiệu quả Marketing' },
    get description() { return isEn() ? 'Compares revenue, ad spend, and efficiency over time to see if ad costs generate proportional revenue.' : 'So sánh doanh thu, chi phí quảng cáo và hiệu quả theo thời gian để xem chi phí QC có tạo ra doanh thu tương xứng không.' },
    get formula() { return isEn() ? 'ROAS = revenue / ad cost; ACOS = ad cost / revenue' : 'ROAS = doanh thu / chi phí QC; ACOS = chi phí QC / doanh thu' },
    get source() { return isEn() ? 'Dashboard API and Ad Spend API' : 'Dashboard API và Ad Spend API' },
  },
  roas: {
    get title() { return isEn() ? 'ROAS by Channel' : 'ROAS theo kênh' },
    get description() { return isEn() ? 'Evaluates how much revenue each advertising channel generates per unit cost.' : 'Đánh giá mỗi kênh quảng cáo tạo ra bao nhiêu doanh thu trên mỗi đồng chi phí.' },
    get formula() { return isEn() ? 'ROAS = revenue / ad spend' : 'ROAS = doanh thu / chi phí quảng cáo' },
    get source() { return isEn() ? 'Dashboard API and Ad Spend API' : 'Dashboard API và Ad Spend API' },
  },
  inventoryForecast: {
    get title() { return isEn() ? 'Stock vs. Forecast' : 'Tồn kho so với dự báo' },
    get description() { return isEn() ? 'Compares current stock with forecasted demand to identify understock or overstock risks.' : 'So sánh tồn kho hiện tại với nhu cầu dự báo để nhận biết sản phẩm có nguy cơ thiếu hàng hoặc tồn quá nhiều.' },
    get formula() { return isEn() ? 'Difference = current stock - demand forecast' : 'Chênh lệch = tồn kho hiện tại - nhu cầu dự báo' },
    get source() { return isEn() ? 'Inventory API and sales data' : 'Inventory API và dữ liệu bán hàng' },
  },
  returnRate: {
    get title() { return isEn() ? 'Return/Cancellation Rate by Channel' : 'Tỷ lệ hoàn/hủy theo kênh' },
    get description() { return isEn() ? 'Monitors return or cancellation rates across channels to detect operational or product quality issues.' : 'Theo dõi tỷ lệ đơn hoàn hoặc hủy ở từng kênh để phát hiện vấn đề về vận hành, chất lượng sản phẩm hoặc kỳ vọng khách hàng.' },
    get formula() { return isEn() ? 'Rate = returned/cancelled orders / total channel orders' : 'Tỷ lệ = số đơn hoàn/hủy / tổng số đơn của kênh' },
    get source() { return isEn() ? 'Orders API' : 'Orders API' },
  },
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
  const valueText = String(value ?? '')
  const valueClass = compact && valueText.length > 10 ? 'text-[15px] mb-0.5' : (compact ? 'text-xl mb-0.5' : 'text-3xl mb-1')
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
          <div className={`font-bold font-mono leading-none ${valueClass}`} style={{ color: valueColor || 'var(--foreground)' }}>
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
              ? fmtMoneyExact(p.value)
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
          Dịch vụ AI đang tạm thời chưa hoạt động. Một số tính năng phân tích thông minh có thể chưa hiển thị đầy đủ.
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
function TabOverview({ data, compareMode, prevData, canViewAnalytics = true, wd = {}, wl = {}, dateRange = {}, leaderboardKey = 'leaderboard' }) {
  const { t, i18n }  = useTranslation()
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
    { key: 'orderId',     label: t('common.orderId', 'Mã đơn') },
    { key: 'date',        label: t('common.date', 'Ngày') },
    { key: 'channel',     label: t('common.channel', 'Kênh') },
    { key: 'productName', label: t('common.product', 'Sản phẩm') },
    { key: 'qty',         label: t('common.qty', 'SL') },
    { key: 'revenue',     label: t('common.revenue', 'Doanh thu'), render: v => Number(v).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN') + ' ₫' },
  ]
  const sp     = data.sparklines || {}
  const lbData       = wd[leaderboardKey] ?? wd.leaderboard ?? null
  const lbLoading    = wl[leaderboardKey] ?? wl.leaderboard ?? false
  const insData      = wd.insights   ?? null
  const insLoading   = wl.insights   ?? false
  const autoRecs     = wd.autoRecs   ?? null
  const autoRecsLoading = wl.autoRecs ?? false
  // Finance KPI (Operating Profit, ACOS) từ FinanceController
  const financeKpi   = wd.financeKpi  ?? null
  const financeLoading = wl.financeKpi ?? false

  // ROAS & ACOS dùng cùng advertisingCost đã lọc theo ngày/kênh từ Finance API.
  const totalAdSpend  = financeKpi?.advertisingCost != null
    ? Number(financeKpi.advertisingCost)
    : (data.revenueByChannel ?? []).reduce((s, ch) => s + Number(ch.adSpend ?? 0), 0)
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

  const leaderboardSections = (() => {
    const firstEntry = entries => Array.isArray(entries) && entries.length > 0 ? entries[0] : null
    const asMoney = value => Number(value ?? 0)
    const currentLang = i18n.language || 'vi'
    const makeSection = (key, label, options = {}) => {
      const entry = firstEntry(lbData?.[key]?.entries)
      if (!entry) return null
      const value = asMoney(entry.value ?? entry.revenue ?? entry.total_revenue)
      const activity = entry.orders ?? entry.activity_count
      const fmtLang = currentLang === 'en' ? 'en-US' : 'vi-VN'
      return {
        label,
        name: key === 'channel'
          ? getChannelDisplayName(entry.name ?? entry.channel ?? '')
          : (entry.name ?? entry.product_name ?? entry.channel ?? '—'),
        value,
        valueLabel: options.valueLabel?.(entry, value) ?? fmtMoneyExact(value),
        meta: options.meta?.(entry) ?? (activity != null ? `${Number(activity).toLocaleString(fmtLang)} ${t('dashboard.leaderboard.ordersCount', 'đơn')}` : ''),
      }
    }

    const fmtLang = currentLang === 'en' ? 'en-US' : 'vi-VN'
    return [
      makeSection('product', t('dashboard.leaderboard.product', 'Sản phẩm')),
      makeSection('customer', t('dashboard.leaderboard.customer', 'Khách hàng')),
      makeSection('channel', t('dashboard.leaderboard.channel', 'Kênh bán')),
      makeSection('staff', t('dashboard.leaderboard.salesStaff', 'NV bán hàng')),
      makeSection('staff_warehouse', t('dashboard.leaderboard.warehouseStaff', 'NV kho'), {
        valueLabel: (_, value) => Number(value).toLocaleString(fmtLang),
        meta: entry => entry.orders != null ? `${Number(entry.orders).toLocaleString(fmtLang)} ${t('dashboard.leaderboard.actionsCount', 'thao tác')}` : '',
      }),
      makeSection('staff_marketing', t('dashboard.leaderboard.marketingStaff', 'NV marketing'), {
        meta: entry => entry.orders != null ? `${Number(entry.orders).toLocaleString(fmtLang)} ${t('dashboard.leaderboard.adsCount', 'dòng QC')}` : '',
      }),
    ].filter(Boolean)
  })()

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
          value={fmtMoneyExact(kpi.totalRevenue)}
          trend={kpi.revenueGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="payments"
          helpDef={KPI_DEFINITIONS.revenue}
        />
        <KpiCard compact
          label={t('dashboard.kpi.orders')}
          value={kpi.totalOrders.toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN')}
          trend={kpi.ordersGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="shopping_cart"
          color="#10B981"
          helpDef={KPI_DEFINITIONS.orders}
        />
        <KpiCard compact
          label={t('dashboard.kpi.aov')}
          value={fmtMoneyExact(kpi.avgOrderValue)}
          icon="receipt_long"
          color="var(--accent-500)"
          helpDef={KPI_DEFINITIONS.aov}
        />
        <KpiCard compact
          label={t('dashboard.kpi.newCustomers', 'Khách mới')}
          value={kpi.newCustomers.toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN')}
          trend={kpi.customersGrowthPct}
          trendLabel={t('dashboard.compare')}
          icon="person_add"
          color="#3B82F6"
          helpDef={KPI_DEFINITIONS.newCustomers}
        />
        <KpiCard compact
          label={t('dashboard.kpi.profit')}
          value={fmtMoneyExact(kpi.totalProfit)}
          trend={parseFloat(grossMarginPct)}
          trendLabel={t('dashboard.kpi.marginLabel', 'biên LN')}
          icon="percent"
          color="#8B5CF6"
          valueColor={kpi.totalProfit >= 0 ? 'var(--profit-positive)' : 'var(--profit-negative)'}
          helpDef={KPI_DEFINITIONS.grossProfit}
        />
        <KpiCard compact
          label={t('dashboard.kpi.operatingProfit', 'LN vận hành')}
          value={opProfit != null ? fmtMoneyExact(opProfit) : (financeLoading ? '...' : '—')}
          icon="account_balance_wallet"
          color="#6366F1"
          valueColor={opProfit != null ? (opProfit >= 0 ? 'var(--profit-positive)' : 'var(--profit-negative)') : undefined}
          helpDef={KPI_DEFINITIONS.operatingProfit}
          unavailable={opProfit == null && !financeLoading}
          placeholderText={opProfit == null && !financeLoading ? t('dashboard.kpi.placeholderFinance', 'Trang Tài chính') : undefined}
        />
        <KpiCard compact
          label={t('dashboard.kpi.roas', 'ROAS')}
          value={avgRoasVal != null ? `${avgRoasVal}×` : '—'}
          icon="ads_click"
          color="#10B981"
          valueColor={avgRoasVal != null
            ? (parseFloat(avgRoasVal) >= 4 ? 'var(--profit-positive)' : parseFloat(avgRoasVal) >= 2 ? '#F59E0B' : 'var(--color-error)')
            : undefined}
          helpDef={KPI_DEFINITIONS.roas}
          unavailable={avgRoasVal == null}
          placeholderText={avgRoasVal == null ? t('dashboard.kpi.placeholderAdSpend', 'Nhập chi phí QC') : undefined}
        />
        <KpiCard compact
          label={t('dashboard.kpi.acos', 'ACOS')}
          value={acosVal != null ? `${acosVal}%` : '—'}
          icon="savings"
          color="#EC4899"
          valueColor={acosVal != null
            ? (parseFloat(acosVal) <= 15 ? 'var(--profit-positive)' : parseFloat(acosVal) <= 25 ? '#F59E0B' : 'var(--color-error)')
            : undefined}
          helpDef={KPI_DEFINITIONS.acos}
          unavailable={acosVal == null}
          placeholderText={acosVal == null ? t('dashboard.kpi.placeholderAdSpend', 'Nhập chi phí QC') : undefined}
        />
      </div>

      {/* AI Insights — chỉ hiện cho Owner/Manager/DataIT/SuperAdmin */}
      {canViewAnalytics && <AiInsightsCard insights={insData} loading={insLoading || autoRecsLoading} autoRecs={autoRecs} />}

      {/* Revenue trend */}
      <div className="lcard p-5">
        <div>
          <div className="flex items-center justify-between mb-4">
            <SectionTitle tooltip={CHART_TOOLTIPS.revenueTrend}>{t('dashboard.chart.revenueTrend')}</SectionTitle>
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
          {/*<p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>*/}
          {/*  Click vào biểu đồ để xem đơn hàng của ngày đó*/}
          {/*</p>*/}
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
      </div>

      {/* Channel mix + leaderboard summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lcard p-4 h-full">
          <SectionTitle tooltip={CHART_TOOLTIPS.channelShare}>{t('dashboard.chart.channelShare')}</SectionTitle>
          <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
            Click vào kênh để xem đơn hàng
          </p>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="md:flex-[1.15] min-w-0">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.revenueByChannel} dataKey="revenue" nameKey="channelName"
                    cx="50%" cy="50%" outerRadius={104} innerRadius={62} paddingAngle={3}
                    onClick={(entry) => openDrill({ type: 'channel', key: entry.channelName, label: entry.channelName })}
                    style={{ cursor: 'pointer' }}
                  >
                    {data.revenueByChannel.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmtMoneyExact(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="md:flex-1 space-y-1">
              {data.revenueByChannel.map((ch, i) => (
                <div key={i}
                  className="flex items-center gap-2 text-caption cursor-pointer rounded-lg px-2 py-1 transition-colors"
                  onClick={() => openDrill({ type: 'channel', key: ch.channelName, label: ch.channelName })}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getChannelColor(ch.channelName) }} />
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{ch.channelName}</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{ch.revenuePct.toFixed(1)}%</span>
                  <span className="icon shrink-0" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>chevron_right</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      {/* ── Leaderboard mini-widget ── */}
      <MiniWidget title={t('dashboard.leaderboardTitle', 'Bảng xếp hạng hiệu suất')} icon="leaderboard" href="/leaderboard" loading={lbLoading}>
        {leaderboardSections.length > 0 ? (
          <div className="space-y-1.5">
            {leaderboardSections.map((p, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-[92px] shrink-0 text-[11px] font-semibold rounded-full px-1.5 py-0.5 text-center"
                      style={{ background: 'rgba(99,102,241,0.10)', color: 'var(--primary-600)' }}>
                  {p.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                    {p.name}
                  </div>
                  {p.meta && <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{p.meta}</div>}
                </div>
                <span className="text-[13px] font-semibold font-mono shrink-0" style={{ color: 'var(--text-primary)' }}>
                  {p.valueLabel}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>{t('common.noData', 'Chưa có dữ liệu')}</p>
        )}
      </MiniWidget>
      </div>

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
function TabSales({ data, compareMode = false, prevData = null, from, to }) {
  const { t } = useTranslation()
  const [channelTopLimit, setChannelTopLimit] = useState(3)
  const [channelTopSort, setChannelTopSort] = useState('revenue')
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
    { key: 'orderId',     label: t('common.orderId', 'Mã đơn') },
    { key: 'date',        label: t('common.date', 'Ngày') },
    { key: 'channel',     label: t('common.channel', 'Kênh') },
    { key: 'productName', label: t('common.product', 'Sản phẩm') },
    { key: 'qty',         label: t('common.qty', 'SL') },
    { key: 'revenue',     label: t('common.revenue', 'Doanh thu'), render: v => Number(v).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN') + ' ₫' },
  ]
  const funnelSummary = (() => {
    const stages = data.funnel ?? []
    const total = Number(stages[0]?.value ?? 0)
    const delivered = Number(stages.find(s => {
      const key = String(s.stage ?? '').toLowerCase()
      return key.includes('delivered') || key.includes('giao thành công')
    })?.value ?? 0)
    const lost = stages
      .filter(s => {
        const key = String(s.stage ?? '').toLowerCase()
        return key.includes('returned') || key.includes('cancelled') || key.includes('hoàn') || key.includes('hủy')
      })
      .reduce((sum, s) => sum + Number(s.value ?? 0), 0)
    const drops = stages.slice(1).map((stage, index) => {
      const prev = Number(stages[index]?.value ?? 0)
      const current = Number(stage.value ?? 0)
      return {
        stage: stage.stage,
        drop: Math.max(prev - current, 0),
        dropPct: prev > 0 ? ((Math.max(prev - current, 0) / prev) * 100) : 0,
      }
    })
    const biggestDrop = drops.sort((a, b) => b.dropPct - a.dropPct)[0]
    return {
      total,
      delivered,
      lost,
      deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
      lostRate: total > 0 ? (lost / total) * 100 : 0,
      biggestDrop,
    }
  })()

  // Tính Pareto: sắp xếp theo doanh thu giảm dần, thêm % tích lũy
  const totalRevenue = data.revenueByChannel.reduce((s, ch) => s + ch.revenue, 0)
  const paretoData = (() => {
    const sorted = [...(data.paretoProducts ?? data.topProducts)].sort((a, b) => b.revenue - a.revenue)
    const prevRevenueByProduct = new Map()
    if (compareMode && prevData) {
      ;[...(prevData.paretoProducts ?? prevData.topProducts ?? [])].forEach(p => {
        const key = p.productName
        prevRevenueByProduct.set(key, (prevRevenueByProduct.get(key) ?? 0) + Number(p.revenue ?? 0))
      })
    }
    let cum = 0
    const grandTotal = sorted.reduce((s, p) => s + p.revenue, 0)
    return sorted.map(p => {
      cum += p.revenue
      return {
        ...p,
        prevRevenue: compareMode && prevData ? (prevRevenueByProduct.get(p.productName) ?? 0) : null,
        cumulativePct: grandTotal > 0 ? parseFloat(((cum / grandTotal) * 100).toFixed(1)) : 0,
      }
    })
  })()
  const productsByChannelChart = (() => {
    const platformMap = new Map()
    ;(data.productsByChannel ?? [])
      .filter(ch => Array.isArray(ch.products) && ch.products.length > 0)
      .forEach(ch => {
        const displayName = getChannelDisplayName(ch.channelName)
        const platform = platformMap.get(displayName) ?? { channelName: displayName, products: new Map() }
        ch.products.forEach(p => {
          const productName = p.productName ?? 'Sản phẩm'
          const current = platform.products.get(productName) ?? {
            productName,
            revenue: 0,
            grossProfit: 0,
            orders: 0,
            quantitySold: 0,
          }
          current.revenue += Number(p.revenue ?? 0)
          current.grossProfit += Number(p.grossProfit ?? p.profit ?? 0)
          current.orders += Number(p.orders ?? 0)
          current.quantitySold += Number(p.quantitySold ?? p.QuantitySold ?? p.quantity_sold ?? p.qtySold ?? p.qty_sold ?? p.quantity ?? 0)
          platform.products.set(productName, current)
        })
        platformMap.set(displayName, platform)
      })

    const rows = [...platformMap.values()]
      .flatMap(ch => {
        const products = [...ch.products.values()]
          .sort((a, b) => {
            const getValue = (item) => {
              if (channelTopSort === 'quantitySold') return Number(item.quantitySold ?? 0)
              if (channelTopSort === 'orders') return Number(item.orders ?? 0)
              if (channelTopSort === 'grossProfit') return Number(item.grossProfit ?? 0)
              if (channelTopSort === 'marginPct') return Number(item.revenue ?? 0) > 0 ? (Number(item.grossProfit ?? 0) / Number(item.revenue ?? 0)) * 100 : 0
              return Number(item.revenue ?? 0)
            }
            return getValue(b) - getValue(a)
          })
          .slice(0, channelTopLimit)
        return products.map((p, index) => ({
          color: getChannelColor(ch.channelName),
          channelName: ch.channelName,
          rank: index + 1,
          productName: p.productName,
          label: `${ch.channelName}-${index + 1}-${p.productName}`,
          revenue: Number(p.revenue ?? 0),
          grossProfit: Number(p.grossProfit ?? p.profit ?? 0),
          marginPct: Number(p.revenue ?? 0) > 0 ? (Number(p.grossProfit ?? p.profit ?? 0) / Number(p.revenue ?? 0)) * 100 : 0,
          orders: Number(p.orders ?? 0),
          quantitySold: Number(p.quantitySold ?? p.QuantitySold ?? p.quantity_sold ?? p.qtySold ?? p.qty_sold ?? p.quantity ?? 0),
        }))
      })
    return { rows }
  })()
  const channelTopSortOptions = [
    { value: 'revenue', label: t('dashboard.colRevenue', 'Doanh thu') },
    { value: 'quantitySold', label: t('dashboard.sales.qtySold', 'SL bán') },
    { value: 'orders', label: t('dashboard.colOrders', 'Số đơn') },
    { value: 'grossProfit', label: t('dashboard.kpi.profit', 'LN gộp') },
    { value: 'marginPct', label: t('dashboard.kpi.marginLabel', 'Biên LN') },
  ]
  const channelTopSortLabel = channelTopSortOptions.find(opt => opt.value === channelTopSort)?.label ?? t('dashboard.colRevenue', 'Doanh thu')

  function ChannelTopTooltip({ active, payload }) {
    if (!active || !payload?.length) return null
    const row = payload[0].payload
    const fmtLang = i18n.language === 'en' ? 'en-US' : 'vi-VN'
    return (
      <div className="lcard px-3 py-2" style={{ boxShadow: 'var(--shadow-md)', minWidth: 240 }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          {row.channelName} · Top {row.rank} {t('dashboard.sales.by', 'theo')} {channelTopSortLabel}
        </p>
        <p className="text-[11px] mb-2 max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>
          {row.productName}
        </p>
        <div className="space-y-1 text-[11px] font-mono">
          <div className="flex justify-between gap-4">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.colRevenue', 'Doanh thu')}</span>
            <span style={{ color: 'var(--text-primary)' }}>{fmtMoneyExact(row.revenue)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.kpi.profit', 'LN gộp')}</span>
            <span style={{ color: row.grossProfit >= 0 ? 'var(--profit-positive)' : 'var(--profit-negative)' }}>
              {fmtMoneyExact(row.grossProfit)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.kpi.marginLabel', 'Biên LN')}</span>
            <span style={{ color: row.marginPct >= 0 ? 'var(--profit-positive)' : 'var(--profit-negative)' }}>
              {row.marginPct.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.colOrders', 'Số đơn')}</span>
            <span style={{ color: 'var(--text-primary)' }}>{row.orders.toLocaleString(fmtLang)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span style={{ color: 'var(--text-tertiary)' }}>{t('dashboard.sales.qtySold', 'SL bán')}</span>
            <span style={{ color: 'var(--text-primary)' }}>{row.quantitySold.toLocaleString(fmtLang)}</span>
          </div>
        </div>
      </div>
    )
  }

  function ChannelProductTick({ x, y, payload }) {
    const row = productsByChannelChart.rows[payload.index]
    if (!row) return null
    const name = row.productName.length > 32 ? `${row.productName.slice(0, 32)}...` : row.productName
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="end" fill="var(--text-secondary)" fontSize={10}>
          {row.rank === 1 && (
            <tspan x={0} dy={-8} fontWeight={700} fill="var(--text-primary)">{row.channelName}</tspan>
          )}
          <tspan x={0} dy={row.rank === 1 ? 13 : 3} fill="var(--text-tertiary)">#{row.rank} {name}</tspan>
        </text>
      </g>
    )
  }

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
    { key: 'orderId',     label: t('common.orderId', 'Mã đơn') },
    { key: 'date',        label: t('common.date', 'Ngày') },
    { key: 'channel',     label: t('common.channel', 'Kênh') },
    { key: 'productName', label: t('common.product', 'Sản phẩm') },
    { key: 'qty',         label: t('common.qty', 'SL') },
    { key: 'revenue',     label: t('common.revenue', 'Doanh thu'), render: v => Number(v).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN') + ' ₫' },
  ]

  return (
    <div className="space-y-5">
      {/* Pareto chart + bảng Top 5 */}
      <div className="lcard p-5">
        {/* Biểu đồ Pareto */}
        <div>
          <SectionTitle tooltip={CHART_TOOLTIPS.paretoProducts}>{t('dashboard.chart.paretoProducts', 'Biểu đồ Pareto — Top sản phẩm')}</SectionTitle>
          <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {t('dashboard.sales.clickBarToViewDetails', 'Click vào cột để xem chi tiết đơn hàng')}
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={paretoData} margin={{ top: 20, right: 40, left: 0, bottom: 66 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="productName" interval={0} height={66}
                tick={<WrappedProductTick />} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52} tickFormatter={tickFmt} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={36} tickFormatter={v => `${v}%`} domain={[0,100]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, top: 0 }} />
              {compareMode && prevData && (
                <Bar yAxisId="left" dataKey="prevRevenue" name="Doanh thu kỳ trước" fill="#A5B4FC" radius={[4,4,0,0]} barSize={28} />
              )}
              <Bar yAxisId="left" dataKey="revenue" name="Doanh thu" fill="#6366F1" radius={[4,4,0,0]} barSize={44}
                onClick={handleDrillProduct} cursor="pointer" />
              <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="% Tích lũy"
                stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Bảng Top 5 với cột % đóng góp */}
        <div className="hidden">
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
                    <td className="py-2 px-1 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoneyExact(p.revenue)}</td>
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

      {/* Top sản phẩm theo kênh */}
      <div className="lcard p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <SectionTitle tooltip={CHART_TOOLTIPS.productsByChannel} className="!mb-0">{t('dashboard.chart.productsByChannel', 'Top sản phẩm theo kênh')}</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={channelTopSort}
              onChange={(e) => setChannelTopSort(e.target.value)}
              className="linput text-xs !h-8 !py-0"
              style={{ minWidth: 132 }}
              title={t('dashboard.sales.rankCriteria', 'Chọn tiêu chí xếp hạng top sản phẩm')}
            >
              {channelTopSortOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{t('dashboard.sales.by', 'Theo')} {opt.label}</option>
              ))}
            </select>
            <div className="inline-flex rounded-lg p-1" style={{ background: 'var(--bg-elevated)' }}>
              {[3, 10].map(limit => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => setChannelTopLimit(limit)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${channelTopLimit === limit ? 'text-white' : ''}`}
                  style={{
                    background: channelTopLimit === limit ? 'var(--primary-500)' : 'transparent',
                    color: channelTopLimit === limit ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  Top {limit}
                </button>
              ))}
            </div>
          </div>
        </div>
        {productsByChannelChart.rows.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(360, productsByChannelChart.rows.length * 42)}>
            <ComposedChart
              data={productsByChannelChart.rows}
              layout="vertical"
              margin={{ top: 12, right: 32, left: 24, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={tickFmt} />
              <YAxis type="category" dataKey="label" width={250} interval={0}
                tick={<ChannelProductTick />} axisLine={false} tickLine={false} />
              <Tooltip content={<ChannelTopTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" name="Doanh thu" radius={[0, 4, 4, 0]} barSize={18}>
                {productsByChannelChart.rows.map((row, i) => <Cell key={i} fill={row.color} />)}
              </Bar>
              <Line type="monotone" dataKey="grossProfit" name="Lợi nhuận gộp"
                stroke="#10B981" strokeWidth={2.5} dot={{ fill: '#10B981', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <DevEmptyState title="Chưa có dữ liệu top sản phẩm theo kênh" desc="Hệ thống chưa có API tổng hợp top sản phẩm phân tách theo từng kênh bán." />
        )}
      </div>

      {/* Phễu xử lý đơn hàng (PENDING → DELIVERED) */}
      <div className="lcard p-5">
        <SectionTitle tooltip={CHART_TOOLTIPS.orderFunnel}>{t('dashboard.chart.orderFunnel', 'Phễu xử lý đơn hàng')}</SectionTitle>
        <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Theo dõi đơn rơi ở bước nào trong quy trình xử lý — click vào từng bước để xem danh sách đơn
        </p>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_360px] gap-6 items-start">
          <div className="space-y-2">
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
          <div className="rounded-lg p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Tóm tắt xử lý đơn</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Tổng đơn</p>
                <p className="font-mono text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{funnelSummary.total.toLocaleString('vi-VN')}</p>
              </div>
              <div>
                <p className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Giao thành công</p>
                <p className="font-mono text-lg font-bold" style={{ color: 'var(--profit-positive)' }}>{funnelSummary.deliveryRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Hoàn/Hủy</p>
                <p className="font-mono text-lg font-bold" style={{ color: funnelSummary.lost > 0 ? 'var(--color-error)' : 'var(--text-primary)' }}>
                  {funnelSummary.lost.toLocaleString('vi-VN')}
                </p>
              </div>
              <div>
                <p className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Tỷ lệ rơi</p>
                <p className="font-mono text-lg font-bold" style={{ color: funnelSummary.lostRate > 0 ? 'var(--color-error)' : 'var(--text-primary)' }}>
                  {funnelSummary.lostRate.toFixed(1)}%
                </p>
              </div>
            </div>
            {funnelSummary.biggestDrop && (
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-caption mb-1" style={{ color: 'var(--text-tertiary)' }}>Điểm cần chú ý</p>
                <p className="text-sm font-semibold" style={{ color: funnelSummary.biggestDrop.dropPct > 0 ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                  {funnelSummary.biggestDrop.stage}: giảm {funnelSummary.biggestDrop.dropPct.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
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
                `orders_${drillProduct.productName ?? 'product'}.csv`,
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
function TabMultiChannel({ data, compareMode = false, prevData = null, wd = {}, wl = {} }) {
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

  return (
    <div className="space-y-5">
      {/* Stacked revenue by channel */}
      <div className="lcard p-5">
        <SectionTitle tooltip={CHART_TOOLTIPS.channelMonthly}>{t('dashboard.chart.channelMonthly')}</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data.monthlyByChannel} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={52}
              tickFormatter={tickFmt} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {data.revenueByChannel.map((ch, i) => (
              <Bar key={ch.channelName} dataKey={ch.channelName} stackId="channel"
                fill={getChannelColor(ch.channelName)}
                radius={i === data.revenueByChannel.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
            ))}
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
            {/* Line chart: xu hướng riêng từng kênh theo tháng */}
            <div className="lcard p-5 col-span-12 lg:col-span-7">
              <SectionTitle tooltip={CHART_TOOLTIPS.channelTrend}>{t('dashboard.chart.channelTrend', 'Xu hướng doanh thu từng kênh theo tháng')}</SectionTitle>
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
              <SectionTitle tooltip={CHART_TOOLTIPS.channelGrowth}>{t('dashboard.chart.channelGrowth', 'Tỷ trọng & tăng trưởng kênh')}</SectionTitle>
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
        <SectionTitle>{t('dashboard.channelComparisonTable', 'Bảng so sánh chi tiết theo kênh')}</SectionTitle>
        <div className="overflow-x-auto">
            <table className="w-full text-caption border-collapse">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {[
                    t('common.channel', 'Kênh'),
                    t('common.revenue', 'Doanh thu'),
                    t('dashboard.growthPct', 'Tăng trưởng%'),
                    'ROAS',
                    t('dashboard.orders', 'Số đơn'),
                    t('dashboard.revenuePct', 'Tỷ trọng%')
                  ].map(h => (
                    <th key={h} className="text-right py-2 px-3 font-semibold first:text-left" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channelTableData.map((ch, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2 px-3 font-semibold" style={{ color: getChannelColor(ch.channelName) }}>{ch.channelName}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{fmtMoneyExact(ch.revenue)}</td>
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
              const rawName  = ch.channel ?? ch.channelName ?? ch.name ?? '—'
              const chName   = getChannelDisplayName(rawName)
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

function TabCustomer({ data, compareMode = false, prevData = null, wd = {}, wl = {} }) {
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
          <SectionTitle tooltip={CHART_TOOLTIPS.customerClv}>{t('dashboard.chart.clv')}</SectionTitle>
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
                tickFormatter={tickFmt}
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
          <SectionTitle tooltip={CHART_TOOLTIPS.heatmap}>{t('dashboard.chart.heatmap')}</SectionTitle>
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
                      <span className="font-mono">{fmtMoneyExact(rev)}</span>
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
function TabMarketing({ data, compareMode = false, prevData = null, wd = {}, wl = {} }) {
  const { t }       = useTranslation()
  const navigate    = useNavigate()
  const campData    = wd.campaign ?? null
  const campLoading = wl.campaign ?? false

  // Kiểm tra có kênh nào chưa nhập chi phí QC không
  const missingAdSpend = (data.revenueByChannel ?? [])
    .filter(ch => Number(ch.revenue ?? 0) > 0 && Number(ch.adSpend ?? 0) <= 0)

  const safeRoas = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
  const comboData = data.revenueByChannel.map(ch => ({
    name:       ch.channelName.split(' ')[0],
    fullName:   ch.channelName,
    adSpend:    Number(ch.adSpend ?? 0) / 1_000_000,
    revenue:    Number(ch.revenue ?? 0) / 1_000_000,
    adSpendRaw: Number(ch.adSpend ?? 0),
    revenueRaw: Number(ch.revenue ?? 0),
    roas:       safeRoas(ch.roas),
    roasTarget: ch.roasTarget || 4.0,
    cac:        ch.cac,
  }))

  const marketingTooltipFormatter = (value, name, item) => {
    if (item?.dataKey === 'roas') {
      const roas = Number(value)
      return [Number.isFinite(roas) ? `${roas.toFixed(2)}x` : '—', 'ROAS']
    }
    const raw = item?.dataKey === 'adSpend'
      ? item?.payload?.adSpendRaw
      : item?.payload?.revenueRaw
    return [fmtMoneyExact(raw ?? Number(value) * 1_000_000), name]
  }

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
          <SectionTitle tooltip={CHART_TOOLTIPS.marketingCombo}>{t('dashboard.chart.marketingCombo')}</SectionTitle>
          <p className="text-caption mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {t('dashboard.series.roasNote')}
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={comboData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={92} tickFormatter={v => fmtMoneyExact(Number(v) * 1_000_000)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${v}x`} />
              <Tooltip formatter={marketingTooltipFormatter} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="adSpend" name="Chi phí QC phân bổ"  fill="#EC4899" radius={[3,3,0,0]} />
              <Bar yAxisId="left" dataKey="revenue" name="Doanh thu" fill="#6366F1" radius={[3,3,0,0]}>
                {/* Label ROAS hiển thị trên đầu bar doanh thu */}
                <LabelList dataKey="roas" content={<RoasLabel />} />
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="roas" name="ROAS" stroke="#F59E0B" strokeWidth={2} dot={{ fill: '#F59E0B', r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ROAS ranking bars */}
        <div className="lcard p-5 col-span-12 lg:col-span-4">
          <SectionTitle tooltip={CHART_TOOLTIPS.roas}>{t('dashboard.chart.roas')}</SectionTitle>
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
                        {ch.cac ? fmtMoneyExact(ch.cac) : '—'}
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
      {/*{data?.adTypeCosts?.length > 0 ? (*/}
      {/*  <div className="grid grid-cols-12 gap-4">*/}
      {/*    <div className="lcard p-5 col-span-12 lg:col-span-5">*/}
      {/*      <SectionTitle>Chi phí theo loại quảng cáo</SectionTitle>*/}
      {/*      <ResponsiveContainer width="100%" height={220}>*/}
      {/*        <PieChart>*/}
      {/*          <Pie data={data.adTypeCosts} dataKey="value" nameKey="name"*/}
      {/*            cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3}>*/}
      {/*            {data.adTypeCosts.map((_, i) => <Cell key={i} fill={adPieColors[i % adPieColors.length]} />)}*/}
      {/*          </Pie>*/}
      {/*          <Tooltip formatter={v => fmtM(v)} />*/}
      {/*          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />*/}
      {/*        </PieChart>*/}
      {/*      </ResponsiveContainer>*/}
      {/*    </div>*/}
      {/*    <div className="lcard p-5 col-span-12 lg:col-span-7">*/}
      {/*      <SectionTitle>Chi phí quảng cáo — phân bổ ngang</SectionTitle>*/}
      {/*      <div className="space-y-3 mt-2">*/}
      {/*        {data.adTypeCosts.map((item, i) => {*/}
      {/*          const total = data.adTypeCosts.reduce((s, x) => s + x.value, 0)*/}
      {/*          const pct   = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0.0'*/}
      {/*          return (*/}
      {/*            <div key={i}>*/}
      {/*              <div className="flex justify-between text-caption mb-1" style={{ color: 'var(--text-secondary)' }}>*/}
      {/*                <span>{item.name}</span>*/}
      {/*                <span className="font-mono">{fmtM(item.value)} <span style={{ color: 'var(--text-tertiary)' }}>({pct}%)</span></span>*/}
      {/*              </div>*/}
      {/*              <div className="h-2.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>*/}
      {/*                <div className="h-full rounded-full transition-all duration-500"*/}
      {/*                  style={{ width: `${pct}%`, background: adPieColors[i % adPieColors.length] }} />*/}
      {/*              </div>*/}
      {/*            </div>*/}
      {/*          )*/}
      {/*        })}*/}
      {/*      </div>*/}
      {/*    </div>*/}
      {/*  </div>*/}
      {/*) : (*/}
      {/*  <div className="lcard p-5">*/}
      {/*    <SectionTitle>Chi phí theo loại quảng cáo</SectionTitle>*/}
      {/*    <DevEmptyState title="Chưa có dữ liệu chi phí quảng cáo theo loại" desc="Hệ thống chưa thu thập dữ liệu phân loại chi phí QC (Sponsored, Banner, Video...) từ các nền tảng." />*/}
      {/*  </div>*/}
      {/*)}*/}

      {/* ── Campaign mini-widget ── */}
      <MiniWidget title="Chiến dịch Marketing được đề xuất" icon="campaign" href="/campaign" loading={campLoading}>
        {campData ? (
          <div className="space-y-2">
            {(() => {
              const events = campData.upcoming_events ?? []
              const windows = campData.windows ?? []
              const items = [...events, ...windows].slice(0, 4)
              if (items.length === 0) {
                return (
                  <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>
                    Chưa có đề xuất
                  </p>
                )
              }
              return items.map((c, i) => {
                const isEvent = c.days_until != null
                const iconColor = ['#6366F1','#10B981','#F59E0B','#EC4899'][i % 4]
                const title = c.name ?? c.label ?? `Chiến dịch ${i + 1}`
                const eventTip = c.events?.length ? `Sự kiện: ${c.events.join(', ')}` : ''
                const defaultTip = () => {
                  switch (c.recommendation) {
                    case 'RUN_CAMPAIGN': return 'Mùa cao điểm bán hàng, nên đẩy mạnh quảng cáo'
                    case 'PREPARE':      return 'Thị trường tăng trưởng, nên chuẩn bị chạy chiến dịch'
                    case 'LOW_SEASON':   return 'Mùa thấp điểm bán hàng, nên chạy chương trình kích cầu'
                    case 'NORMAL':
                    default:             return 'Thị trường ổn định, duy trì hoạt động marketing'
                  }
                }
                const displayTip = c.tip || eventTip || defaultTip()

                return (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
                       style={{ background: 'var(--bg-elevated)' }}>
                    <span className="icon text-base shrink-0 mt-0.5"
                          style={{ color: iconColor }}>
                      {isEvent ? 'event' : 'campaign'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {title}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-tertiary)' }}>
                        {displayTip}
                        {isEvent && ` · còn ${c.days_until} ngày`}
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
                )
              })
            })()}
          </div>
        ) : (
          <p className="text-xs text-center py-2" style={{ color: 'var(--text-tertiary)' }}>Không tải được dữ liệu</p>
        )}
      </MiniWidget>
    </div>
  )
}

// ── Tab: 6 — Inventory Analytics ─────────────────────────────────────────────
function TabInventory({ data, compareMode = false, prevData = null, wd = {}, wl = {} }) {
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
        <SectionTitle tooltip={CHART_TOOLTIPS.inventoryForecast}>{t('dashboard.chart.stockVsForecast', 'Tồn kho vs Dự báo')}</SectionTitle>
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
          <SectionTitle tooltip={CHART_TOOLTIPS.returnRate}>{t('dashboard.chart.returnRate')}</SectionTitle>
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
  const [presetKey,   setPresetKey]   = useState('mtd')
  const [customFrom,  setCustomFrom]  = useState(() => startOfMonthKey())
  const [customTo,    setCustomTo]    = useState(() => relDate(0))
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
    { key: 'yesterday', label: t('dashboard.preset.yesterday'), from: () => relDate(-1),         to: () => relDate(-1) },
    { key: 'today',     label: t('dashboard.preset.today'),     from: () => relDate(0),          to: () => relDate(0)  },
    { key: 'last7days', label: t('dashboard.preset.last7days'), from: () => relDate(-6),         to: () => relDate(0)  },
    { key: 'mtd',       label: t('dashboard.preset.mtd'),       from: () => startOfMonthKey(),   to: () => relDate(0)  },
    { key: 'qtd',       label: t('dashboard.preset.qtd'),       from: () => startOfQuarterKey(), to: () => relDate(0)  },
    { key: 'ytd',       label: t('dashboard.preset.ytd'),       from: () => startOfYearKey(),    to: () => relDate(0)  },
    { key: 'custom',    label: t('dashboard.preset.custom'),    from: null,                      to: null              },
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
        getTopProductsByChannel(from, to, 10),
      ])
      const resData = res.status === 'fulfilled' ? res.value : null
      if (resData?.kpi == null) throw new Error('no_data')

      // Chỉ dùng dữ liệu thực — không fallback mock
      const opsData = opsReal.status === 'fulfilled' ? opsReal.value : null
      const invData = invReal.status === 'fulfilled' ? invReal.value : null

      // Top products: gộp trùng tên, tính % đóng góp
      const paretoProductsReal = (() => {
        const raw = resData.topProducts ?? []
        const byName = {}
        raw.forEach(p => {
          const key = p.productName
          if (!byName[key]) byName[key] = { ...p, revenue: 0, orders: 0 }
          byName[key].revenue += Number(p.revenue ?? 0)
          byName[key].orders  += Number(p.orders  ?? 0)
        })
        const sorted     = Object.values(byName).sort((a, b) => b.revenue - a.revenue)
        const grandTotal = sorted.reduce((s, p) => s + p.revenue, 0)
        return sorted
          .slice(0, 10)
          .map(p => ({ ...p, revContribPct: grandTotal > 0 ? ((p.revenue / grandTotal) * 100).toFixed(1) : '0.0' }))
      })()
      const topProductsReal = paretoProductsReal.slice(0, 5)

      const normalizedRevenueByChannel = (resData.revenueByChannel ?? []).map(ch => ({
        ...ch,
        channelName: getChannelDisplayName(ch.channelName)
      }))

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
        revenueByChannel: normalizedRevenueByChannel,
        paretoProducts:   paretoProductsReal,
        topProducts:      topProductsReal,
        // ── Monthly + Heatmap + Funnel từ OLTP ───────────────────────────────
        monthlyByChannel:  monthlyReal.status === 'fulfilled'
          ? (monthlyReal.value ?? []).map(row => {
              const norm = { month: row.month }
              Object.entries(row).forEach(([k, v]) => {
                if (k !== 'month') {
                  norm[getChannelDisplayName(k)] = v
                }
              })
              return norm
            })
          : [],
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
        returnByChannel: normalizedRevenueByChannel.map(ch => ({
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
      const { from, to } = getRange()
      const leaderboardParams = { topN: 3, start_date: from, end_date: to }
      loadWidget(`leaderboard:${from}:${to}:${channel}`,  () => Promise.allSettled([
        getLeaderboard({ ...leaderboardParams, category: 'product' }),
        getLeaderboard({ ...leaderboardParams, category: 'customer' }),
        getLeaderboard({ ...leaderboardParams, category: 'channel' }),
        getLeaderboard({ ...leaderboardParams, category: 'staff' }),
        getLeaderboard({ ...leaderboardParams, category: 'staff_warehouse' }),
        getLeaderboard({ ...leaderboardParams, category: 'staff_marketing' }),
      ]).then(([product, customer, channelResult, staff, staffWarehouse, staffMarketing]) => ({
        product:  product.status  === 'fulfilled' ? product.value  : null,
        customer: customer.status === 'fulfilled' ? customer.value : null,
        channel:  channelResult.status  === 'fulfilled' ? channelResult.value  : null,
        staff:    staff.status    === 'fulfilled' ? staff.value    : null,
        staff_warehouse: staffWarehouse.status === 'fulfilled' ? staffWarehouse.value : null,
        staff_marketing: staffMarketing.status === 'fulfilled' ? staffMarketing.value : null,
      })))
      loadWidget('insights',     () => getInsights())
      loadWidget('autoRecs',     () => getRecommendations())
      // Finance KPI phụ thuộc bộ lọc ngày/kênh nên phải refetch khi filter thay đổi.
      const ch = channel === 'all' ? null : channel
      setWidgetLoading(p => ({ ...p, financeKpi: true }))
      getProfitOverview({ from, to, channel: ch })
        .then(r => setWidgetData(p => ({ ...p, financeKpi: r })))
        .catch(() => setWidgetData(p => ({ ...p, financeKpi: null })))
        .finally(() => setWidgetLoading(p => ({ ...p, financeKpi: false })))
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
  }, [activeTab, loadWidget, presetKey, customFrom, customTo, channel])

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
              value:    fmtMoneyExact(tvy.today.revenue),
              prev:     fmtMoneyExact(tvy.yesterday.revenue),
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
              value:    fmtMoneyExact(tvy.today.profit),
              prev:     fmtMoneyExact(tvy.yesterday.profit),
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
          {activeTab === 'overview'     && <TabOverview     data={data} compareMode={compareMode} prevData={prevData} canViewAnalytics={canViewAnalytics} wd={widgetData} wl={widgetLoading} dateRange={getRange()} leaderboardKey={`leaderboard:${getRange().from}:${getRange().to}:${channel}`} />}
          {activeTab === 'sales'        && <TabSales        data={data} compareMode={compareMode} prevData={prevData} from={getRange().from} to={getRange().to} />}
          {activeTab === 'multichannel' && <TabMultiChannel data={data} compareMode={compareMode} prevData={prevData} wd={widgetData} wl={widgetLoading} />}
          {activeTab === 'customer'     && <TabCustomer     data={data} compareMode={compareMode} prevData={prevData} wd={widgetData} wl={widgetLoading} />}
          {activeTab === 'marketing'    && <TabMarketing    data={data} compareMode={compareMode} prevData={prevData} wd={widgetData} wl={widgetLoading} />}
          {activeTab === 'inventory'    && <TabInventory    data={data} compareMode={compareMode} prevData={prevData} wd={widgetData} wl={widgetLoading} />}
        </div>
      )}
    </div>
  )
}
