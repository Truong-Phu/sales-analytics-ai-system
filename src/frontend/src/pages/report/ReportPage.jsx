import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportPdf } from '../../api/reportApi'
import i18n from '../../i18n'

// ─── Kênh bán hàng ────────────────────────────────────────────────────────────
const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok', 'facebook', 'website']

// ─── 8 Section Groups — khớp 1:1 với 7 tab Dashboard + AI Insights ──────────
const SECTION_GROUPS = [
  {
    key: 'includeOverview',
    icon: 'dashboard',
    color: '#6366F1',
    bg: 'rgba(99,102,241,0.08)',
    defaultOn: true,
    labelVi: 'Tổng quan',       labelEn: 'Overview',
    descVi:  'KPI, xu hướng doanh thu & phân bổ kênh',
    descEn:  'KPIs, revenue trend & channel distribution',
    subs: [
      { icon: 'trending_up',    vi: 'KPI tổng quan (Doanh thu, Lợi nhuận, Đơn hàng, Khách mới)', en: 'Overview KPIs (Revenue, Profit, Orders, New Customers)' },
      { icon: 'show_chart',     vi: 'Biểu đồ xu hướng doanh thu & lợi nhuận theo ngày',          en: 'Revenue & profit trend chart (daily)' },
      { icon: 'donut_large',    vi: 'Phân bổ doanh thu theo kênh bán hàng',                       en: 'Revenue share by sales channel' },
      { icon: 'compare_arrows', vi: 'So sánh kỳ này vs kỳ trước (% tăng/giảm)',                  en: 'Period-over-period comparison (% change)' },
    ],
  },
  {
    key: 'includeSales',
    icon: 'bar_chart',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.08)',
    defaultOn: true,
    labelVi: 'Bán hàng',        labelEn: 'Sales',
    descVi:  'Top sản phẩm, biểu đồ ngày & phễu đơn hàng',
    descEn:  'Top products, daily chart & order funnel',
    subs: [
      { icon: 'emoji_events',  vi: 'Top 5 sản phẩm bán chạy nhất (doanh thu & số lượng)', en: 'Top 5 best-selling products (revenue & qty)' },
      { icon: 'receipt_long',  vi: 'Biểu đồ Pareto doanh thu theo sản phẩm',              en: 'Revenue Pareto chart by product' },
      { icon: 'filter_alt',    vi: 'Phễu trạng thái đơn hàng (xác nhận → giao thành công)', en: 'Order status funnel (confirmed → delivered)' },
      { icon: 'leaderboard',   vi: 'Tăng trưởng doanh thu & biên lợi nhuận gộp',          en: 'Revenue growth & gross profit margin' },
    ],
  },
  {
    key: 'includeMultichannel',
    icon: 'hub',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.08)',
    defaultOn: false,
    labelVi: 'Đa kênh',         labelEn: 'Multi-channel',
    descVi:  'So sánh kênh, doanh thu theo tháng & ROI',
    descEn:  'Channel comparison, monthly revenue & ROI',
    subs: [
      { icon: 'stacked_bar_chart', vi: 'Doanh thu theo từng kênh qua các tháng (stacked bar)', en: 'Monthly revenue by channel (stacked bar)' },
      { icon: 'compare',           vi: 'So sánh hiệu suất giữa các kênh bán hàng',             en: 'Cross-channel performance comparison' },
      { icon: 'account_balance',   vi: 'ROI & doanh thu thuần từng kênh',                      en: 'ROI & net revenue per channel' },
    ],
  },
  {
    key: 'includeCustomer',
    icon: 'people',
    color: '#EC4899',
    bg: 'rgba(236,72,153,0.08)',
    defaultOn: false,
    labelVi: 'Khách hàng',      labelEn: 'Customers',
    descVi:  'Phân khúc RFM, giữ chân & giá trị vòng đời',
    descEn:  'RFM segments, retention & customer lifetime value',
    subs: [
      { icon: 'pie_chart',   vi: 'Phân khúc khách hàng theo mô hình RFM',          en: 'Customer segmentation by RFM model' },
      { icon: 'person_add',  vi: 'Khách mới vs khách quay lại (số lượng & tỷ lệ)', en: 'New vs returning customers (count & rate)' },
      { icon: 'loyalty',     vi: 'Tỷ lệ giữ chân khách hàng (Retention Rate)',     en: 'Customer retention rate' },
      { icon: 'savings',     vi: 'Giá trị trung bình mỗi đơn & ước tính CLV',      en: 'Average order value & estimated CLV' },
    ],
  },
  {
    key: 'includeMarketing',
    icon: 'campaign',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    defaultOn: false,
    labelVi: 'Marketing & ROI', labelEn: 'Marketing & ROI',
    descVi:  'Chi phí quảng cáo, ROAS & CPA theo kênh',
    descEn:  'Ad spend, ROAS & CPA by channel',
    subs: [
      { icon: 'payments',      vi: 'Chi phí quảng cáo ước tính so với doanh thu',   en: 'Estimated ad spend vs revenue' },
      { icon: 'percent',       vi: 'ROAS (Return on Ad Spend) theo kênh quảng cáo', en: 'ROAS (Return on Ad Spend) by channel' },
      { icon: 'person_search', vi: 'Chi phí mỗi khách hàng mới (CPA ước tính)',     en: 'Cost per new customer (estimated CPA)' },
    ],
  },
  {
    key: 'includeInventory',
    icon: 'inventory_2',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    defaultOn: false,
    labelVi: 'Tồn kho & Vận hành', labelEn: 'Inventory & Operations',
    descVi:  'Mức tồn kho, cảnh báo & tỷ lệ hoàn đơn',
    descEn:  'Stock levels, alerts & return rates',
    subs: [
      { icon: 'warehouse',          vi: 'Mức tồn kho hiện tại theo sản phẩm (30 SP top)',   en: 'Current stock levels by product (top 30)' },
      { icon: 'warning',            vi: 'Cảnh báo tồn kho: sắp hết & tồn thừa',            en: 'Stock alerts: low stock & overstock items' },
      { icon: 'assignment_return',  vi: 'Tỷ lệ hoàn đơn theo từng kênh bán hàng',          en: 'Return rate by sales channel' },
      { icon: 'speed',              vi: 'KPI vận hành: giao thành công, hủy, hoàn đơn',    en: 'Ops KPI: delivery success, cancel & return rates' },
    ],
  },
  {
    key: 'includeAI',
    icon: 'auto_awesome',
    color: '#6366F1',
    bg: 'rgba(99,102,241,0.08)',
    defaultOn: true,
    labelVi: 'AI Insights',     labelEn: 'AI Insights',
    descVi:  'Nhận xét tự động, bất thường & gợi ý hành động',
    descEn:  'Auto narrative, anomalies & action recommendations',
    subs: [
      { icon: 'comment',          vi: 'Nhận xét tự động từ AI (Natural Language Generation)', en: 'Auto AI narrative (Natural Language Generation)' },
      { icon: 'crisis_alert',     vi: 'Phát hiện bất thường & điểm cảnh báo đáng chú ý',    en: 'Anomaly detection & notable warning points' },
      { icon: 'tips_and_updates', vi: 'Gợi ý hành động cụ thể dựa trên dữ liệu',            en: 'Data-driven action recommendations' },
    ],
  },
]

// ─── Quick Presets ────────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: 'full',        icon: 'file_copy',
    vi: 'Báo cáo đầy đủ',       en: 'Full Report',
    keys: { includeOverview: true,  includeSales: true,  includeMultichannel: true,
            includeCustomer: true,  includeMarketing: true, includeInventory: true,
            includeAI: true },
  },
  {
    id: 'quick',       icon: 'bolt',
    vi: 'Tổng quan nhanh',       en: 'Quick Overview',
    keys: { includeOverview: true,  includeSales: true,  includeMultichannel: false,
            includeCustomer: false, includeMarketing: false, includeInventory: false,
            includeAI: true },
  },
  {
    id: 'multichannel', icon: 'hub',
    vi: 'Đa kênh & Marketing',   en: 'Multichannel & Marketing',
    keys: { includeOverview: true,  includeSales: false, includeMultichannel: true,
            includeCustomer: false, includeMarketing: true, includeInventory: false,
            includeAI: true },
  },
  {
    id: 'operations',  icon: 'inventory_2',
    vi: 'Bán hàng & Vận hành',   en: 'Sales & Operations',
    keys: { includeOverview: true,  includeSales: true,  includeMultichannel: false,
            includeCustomer: false, includeMarketing: false, includeInventory: true,
            includeAI: true },
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d) { return d.toISOString().slice(0, 10) }

function defaultForm() {
  const to   = new Date()
  const from = new Date(Date.now() - 30 * 86_400_000)
  return {
    from: toISO(from), to: toISO(to), channel: 'all',
    includeOverview: true,  includeSales: true,
    includeMultichannel: false, includeCustomer: false,
    includeMarketing: false,    includeInventory: false,
    includeAI: true,
  }
}

function isVi() { return !(i18n.language ?? 'vi').startsWith('en') }

// ─── SectionCard ──────────────────────────────────────────────────────────────
function SectionCard({ group, enabled, onToggle }) {
  const vi = isVi()
  const label = vi ? group.labelVi : group.labelEn
  const desc  = vi ? group.descVi  : group.descEn

  return (
    <div
      className="rounded-xl border transition-all"
      style={{
        borderColor:  enabled ? group.color + '40' : 'var(--border)',
        background:   enabled ? group.bg            : 'var(--bg-surface)',
        opacity:      1,
      }}
    >
      {/* Header row — click anywhere to toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        {/* Custom checkbox */}
        <span
          className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all"
          style={{
            background:  enabled ? group.color : 'transparent',
            borderColor: enabled ? group.color : 'var(--border-strong)',
          }}
        >
          {enabled && <span className="icon text-white" style={{ fontSize: 13, lineHeight: 1 }}>check</span>}
        </span>

        {/* Icon circle */}
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 icon"
          style={{
            fontSize:   18,
            background: enabled ? group.color + '20' : 'var(--bg-elevated)',
            color:      enabled ? group.color         : 'var(--text-tertiary)',
          }}
        >
          {group.icon}
        </span>

        {/* Title + desc */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {label}
          </div>
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
            {desc}
          </div>
        </div>

        {/* Status badge */}
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{
            background: enabled ? group.color + '18' : 'var(--bg-elevated)',
            color:      enabled ? group.color         : 'var(--text-tertiary)',
          }}
        >
          {enabled ? (vi ? 'Bao gồm' : 'Included') : (vi ? 'Bỏ qua' : 'Excluded')}
        </span>
      </button>

      {/* Sub-items — chỉ hiện khi enabled */}
      {enabled && (
        <div className="px-4 pb-3.5 pt-0 space-y-1.5 border-t" style={{ borderColor: group.color + '25' }}>
          {group.subs.map((sub, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span className="icon shrink-0 mt-0.5" style={{ fontSize: 14, color: group.color + 'cc' }}>{sub.icon}</span>
              <span>{vi ? sub.vi : sub.en}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Preview outline panel ────────────────────────────────────────────────────
function PreviewOutline({ form }) {
  const vi      = isVi()
  const enabled = SECTION_GROUPS.filter(g => form[g.key])
  const total   = SECTION_GROUPS.length

  return (
    <div className="space-y-1">
      {SECTION_GROUPS.map((g, idx) => {
        const on = form[g.key]
        return (
          <div
            key={g.key}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all"
            style={{
              background: on ? g.bg : 'transparent',
              opacity:    on ? 1 : 0.4,
            }}
          >
            <span className="icon shrink-0" style={{ fontSize: 16, color: on ? g.color : 'var(--text-tertiary)' }}>{g.icon}</span>
            <span className="text-xs flex-1" style={{ color: on ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: on ? 500 : 400 }}>
              {vi ? g.labelVi : g.labelEn}
            </span>
            <span className="icon" style={{ fontSize: 16, color: on ? '#10B981' : 'var(--text-tertiary)' }}>
              {on ? 'check_circle' : 'remove_circle_outline'}
            </span>
          </div>
        )
      })}
      <div className="pt-2 text-xs text-center font-medium" style={{ color: 'var(--text-tertiary)' }}>
        {enabled.length}/{total} {vi ? 'tab được chọn' : 'tabs selected'}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const { t }              = useTranslation()
  const [form, setForm]    = useState(defaultForm())
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState(null)  // null | 'success' | 'error'
  const [activePreset, setActivePreset] = useState('quick')

  const vi = isVi()

  const set    = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const toggle = (key)     => { set(key, !form[key]); setActivePreset(null) }

  const QUICK_RANGES = [
    { label: t('dashboard.period.7d'),  days: 7  },
    { label: t('dashboard.period.30d'), days: 30 },
    { label: t('dashboard.period.90d'), days: 90 },
  ]

  const applyQuickRange = days => {
    const to   = new Date()
    const from = new Date(Date.now() - days * 86_400_000)
    setForm(f => ({ ...f, from: toISO(from), to: toISO(to) }))
  }

  const applyPreset = preset => {
    setForm(f => ({ ...f, ...preset.keys }))
    setActivePreset(preset.id)
  }

  const selectAll   = () => { setForm(f => { const n = { ...f }; SECTION_GROUPS.forEach(g => { n[g.key] = true }); return n }); setActivePreset(null) }
  const deselectAll = () => { setForm(f => { const n = { ...f }; SECTION_GROUPS.forEach(g => { n[g.key] = false }); return n }); setActivePreset(null) }

  const handleExport = async () => {
    setLoading(true)
    setStatus(null)
    try {
      await exportPdf(form)
      setStatus('success')
      setTimeout(() => setStatus(null), 5000)
    } catch {
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  const includedCount = SECTION_GROUPS.filter(g => form[g.key]).length
  const channelLabel  = form.channel === 'all'
    ? t('report.allChannels')
    : form.channel.charAt(0).toUpperCase() + form.channel.slice(1)

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('report.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {vi
            ? 'Xuất báo cáo PDF phản ánh đầy đủ cấu trúc phân tích trên Dashboard'
            : 'Export PDF reports matching the full Dashboard analytics structure'}
        </p>
      </div>

      {/* ── Quick Presets ── */}
      <div className="lcard p-4">
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
          {vi ? 'BỘ MẪU NHANH' : 'QUICK PRESETS'}
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(preset => {
            const isActive = activePreset === preset.id
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all"
                style={{
                  borderColor: isActive ? 'var(--primary-500)' : 'var(--border)',
                  background:  isActive ? 'var(--primary-50, rgba(99,102,241,0.08))' : 'var(--bg-elevated)',
                  color:       isActive ? 'var(--primary-600)' : 'var(--text-secondary)',
                  boxShadow:   isActive ? '0 0 0 2px rgba(99,102,241,0.2)' : 'none',
                }}
              >
                <span className="icon" style={{ fontSize: 16 }}>{preset.icon}</span>
                {vi ? preset.vi : preset.en}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main 2-panel layout ── */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">

        {/* ── PANEL TRÁI: Cấu hình ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Date + Channel */}
          <div className="lcard p-4 space-y-4">
            {/* Quick range */}
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                {t('report.quickRangeTitle')}
              </p>
              <div className="flex gap-2 flex-wrap">
                {QUICK_RANGES.map(r => (
                  <button
                    key={r.days}
                    onClick={() => applyQuickRange(r.days)}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('common.from')}
                </label>
                <input type="date" className="linput text-sm" value={form.from} onChange={e => set('from', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('common.to')}
                </label>
                <input type="date" className="linput text-sm" value={form.to} onChange={e => set('to', e.target.value)} />
              </div>
            </div>

            {/* Channel */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('report.channel')}
              </label>
              <select className="linput text-sm" value={form.channel} onChange={e => set('channel', e.target.value)}>
                {CHANNEL_KEYS.map(k => (
                  <option key={k} value={k}>
                    {k === 'all' ? t('report.allChannels') : (k.charAt(0).toUpperCase() + k.slice(1))}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section Groups */}
          <div className="lcard p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
                {vi ? 'NỘI DUNG BÁO CÁO' : 'REPORT CONTENTS'} —&nbsp;
                <span style={{ color: 'var(--primary-500)' }}>{includedCount}/{SECTION_GROUPS.length}</span>
                &nbsp;{vi ? 'tab' : 'tabs'}
              </p>
              <div className="flex gap-1.5">
                <button onClick={selectAll} className="text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-[--bg-elevated]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {vi ? 'Chọn tất cả' : 'Select all'}
                </button>
                <button onClick={deselectAll} className="text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-[--bg-elevated]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {vi ? 'Bỏ chọn' : 'Clear all'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {SECTION_GROUPS.map(group => (
                <SectionCard
                  key={group.key}
                  group={group}
                  enabled={!!form[group.key]}
                  onToggle={() => toggle(group.key)}
                />
              ))}
            </div>
          </div>

          {/* Status + Export button */}
          <div className="lcard p-4 space-y-3">
            {status === 'success' && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
                style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--accent-500)' }}>
                <span className="icon" style={{ fontSize: 18 }}>check_circle</span>
                {t('report.success')}
              </div>
            )}
            {status === 'error' && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--color-error)' }}>
                <span className="icon" style={{ fontSize: 18 }}>error_outline</span>
                {t('report.error')}
              </div>
            )}

            {includedCount === 0 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#D97706' }}>
                <span className="icon" style={{ fontSize: 18 }}>warning</span>
                {vi ? 'Chọn ít nhất 1 tab để xuất báo cáo.' : 'Select at least 1 tab to export.'}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={loading || includedCount === 0}
              className="lbtn lbtn-primary w-full justify-center"
              style={{ height: 46 }}
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    style={{ animation: 'spin 0.7s linear infinite' }} />
                  {t('report.generating')}
                </>
              ) : (
                <>
                  <span className="icon text-base">picture_as_pdf</span>
                  {t('report.exportPdf')}
                  {includedCount > 0 && (
                    <span className="ml-1 text-xs opacity-75">
                      ({includedCount} {vi ? 'tab' : 'tabs'})
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── PANEL PHẢI: Preview ── */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4">

          {/* Mini cover preview */}
          <div className="lcard p-4">
            <div
              className="rounded-xl p-4 mb-4"
              style={{ background: 'linear-gradient(135deg, #4338CA 0%, #6366F1 50%, #10B981 100%)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="icon text-white" style={{ fontSize: 20 }}>description</span>
                <span className="text-sm font-bold text-white">{t('report.reportTitle')}</span>
              </div>
              <div className="text-xs text-white/80 mt-1">{form.from} → {form.to}</div>
              <div className="text-xs text-white/65 mt-0.5">{channelLabel}</div>
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-xs font-bold text-white/90 bg-white/15 px-2 py-0.5 rounded-full">PDF</span>
                <span className="text-xs text-white/70">A4 · {vi ? 'Tiếng Việt' : 'English'}</span>
              </div>
            </div>

            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              {vi ? 'MỤC LỤC' : 'TABLE OF CONTENTS'}
            </p>
            <PreviewOutline form={form} />
          </div>

          {/* Format info */}
          <div className="lcard p-4 space-y-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              {vi ? 'ĐỊNH DẠNG XUẤT' : 'EXPORT FORMAT'}
            </p>
            {[
              { icon: 'picture_as_pdf', label: vi ? 'PDF chuyên nghiệp' : 'Professional PDF',       sub: vi ? 'A4, header/footer, logo MSAS' : 'A4, header/footer, MSAS logo' },
              { icon: 'auto_awesome',   label: vi ? 'Biểu đồ nhúng trực tiếp' : 'Embedded charts',  sub: vi ? 'SkiaSharp render, chất lượng cao' : 'SkiaSharp rendering, high quality' },
              { icon: 'schedule',       label: vi ? 'Thời gian tạo' : 'Generation time',             sub: vi ? '~5–20 giây (tùy số tab)' : '~5–20 sec (depends on tabs)' },
              { icon: 'translate',      label: vi ? 'Ngôn ngữ' : 'Language',                         sub: vi ? 'Tiếng Việt (chuyển EN trong header)' : 'English (switch in header)' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="icon shrink-0 mt-0.5" style={{ fontSize: 18, color: 'var(--primary-500)' }}>{item.icon}</span>
                <div>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
