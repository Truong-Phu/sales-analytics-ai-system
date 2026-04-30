import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportPdf } from '../../api/reportApi'

const CHANNEL_KEYS = ['all', 'shopee', 'lazada', 'tiktok', 'facebook', 'website']

const QUICK_RANGES = [
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
]

const SECTIONS = [
  { key: 'includeOverview',    icon: 'dashboard',       label: 'Tổng quan (KPI, doanh thu, kênh)',           always: true  },
  { key: 'includeSales',       icon: 'bar_chart',       label: 'Phân tích bán hàng (top sản phẩm, tăng trưởng)', always: true  },
  { key: 'includeMultichannel',icon: 'hub',             label: 'Phân tích đa kênh (so sánh kênh)',           always: false },
  { key: 'includeCustomer',    icon: 'people',          label: 'Phân tích khách hàng (CLV, funnel)',         always: false },
  { key: 'includeMarketing',   icon: 'campaign',        label: 'Marketing & ROI (chi phí vs doanh thu)',     always: false },
  { key: 'includeInventory',   icon: 'inventory_2',     label: 'Tồn kho & Vận hành (tồn kho, hoàn đơn)',    always: false },
  { key: 'includeAI',          icon: 'auto_awesome',    label: 'Nhận xét & Insight từ AI',                  always: false },
]

function toISO(d) { return d.toISOString().slice(0, 10) }

function defaultForm() {
  const to   = new Date()
  const from = new Date(Date.now() - 30 * 86_400_000)
  return {
    from: toISO(from), to: toISO(to), channel: 'all',
    includeOverview: true, includeSales: true,
    includeMultichannel: false, includeCustomer: false,
    includeMarketing: false, includeInventory: false, includeAI: true,
  }
}

function PreviewSection({ icon, label, enabled = true }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
      style={{
        background: enabled ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'transparent',
        opacity: enabled ? 1 : 0.4,
      }}
    >
      <span
        className="icon w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
        style={{
          fontSize: 18,
          background: enabled ? 'var(--primary-100, rgba(99,102,241,0.12))' : 'var(--bg-elevated)',
          color: enabled ? 'var(--primary-500)' : 'var(--text-tertiary)',
        }}
      >
        {icon}
      </span>
      <span className="text-sm flex-1" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
        {label}
      </span>
      {enabled
        ? <span className="icon" style={{ fontSize: 18, color: 'var(--accent-500)' }}>check_circle</span>
        : <span className="icon" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>remove_circle_outline</span>
      }
    </div>
  )
}

export default function ReportPage() {
  const { t } = useTranslation()
  const [form, setForm]       = useState(defaultForm())
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState(null) // null | 'success' | 'error'

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const applyQuickRange = days => {
    const to   = new Date()
    const from = new Date(Date.now() - days * 86_400_000)
    setForm(f => ({ ...f, from: toISO(from), to: toISO(to) })  )
  }

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

  const includedCount = SECTIONS.filter(s => s.always || form[s.key]).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('report.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {t('report.subtitle')}
        </p>
      </div>

      {/* 2-panel split */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── PANEL TRÁI: Form ── */}
        <div className="flex-1 min-w-0 lcard p-5 space-y-5">

          {/* Quick range */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
              Khoảng thời gian nhanh
            </p>
            <div className="flex gap-2 flex-wrap">
              {QUICK_RANGES.map(r => (
                <button
                  key={r.days}
                  onClick={() => applyQuickRange(r.days)}
                  className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('common.from')}
              </label>
              <input
                type="date"
                className="linput text-sm"
                value={form.from}
                onChange={e => set('from', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('common.to')}
              </label>
              <input
                type="date"
                className="linput text-sm"
                value={form.to}
                onChange={e => set('to', e.target.value)}
              />
            </div>
          </div>

          {/* Channel */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {t('report.channel')}
            </label>
            <select
              className="linput text-sm"
              value={form.channel}
              onChange={e => set('channel', e.target.value)}
            >
              {CHANNEL_KEYS.map(k => (
                <option key={k} value={k}>
                  {k === 'all' ? t('report.allChannels') : t(`dashboard.channel.${k}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Section toggles */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              {t('report.content')}
            </label>
            <div className="space-y-2">
              {SECTIONS.filter(s => !s.always).map(opt => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer group py-1">
                  <button
                    type="button"
                    onClick={() => set(opt.key, !form[opt.key])}
                    className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: form[opt.key] ? 'var(--primary-500)' : 'transparent',
                      borderColor: form[opt.key] ? 'var(--primary-500)' : 'var(--border-strong)',
                    }}
                  >
                    {form[opt.key] && <span className="icon text-white" style={{ fontSize: 13 }}>check</span>}
                  </button>
                  <span className="icon" style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>{opt.icon}</span>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Status feedback */}
          {status === 'success' && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--accent-500)' }}
            >
              <span className="icon" style={{ fontSize: 18 }}>check_circle</span>
              {t('report.success')}
            </div>
          )}
          {status === 'error' && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--color-error)' }}
            >
              <span className="icon" style={{ fontSize: 18 }}>error_outline</span>
              {t('report.error')}
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="lbtn lbtn-primary w-full justify-center"
            style={{ height: 44 }}
          >
            {loading ? (
              <>
                <span
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  style={{ animation: 'spin 0.7s linear infinite' }}
                />
                {t('report.generating')}
              </>
            ) : (
              <>
                <span className="icon text-base">picture_as_pdf</span>
                {t('report.exportPdf')}
              </>
            )}
          </button>
        </div>

        {/* ── PANEL PHẢI: Preview ── */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">

          {/* Report preview card */}
          <div className="lcard p-5">
            {/* Mini report header */}
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: 'linear-gradient(135deg, var(--primary-500) 0%, var(--accent-500) 100%)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="icon text-white" style={{ fontSize: 20 }}>description</span>
                <span className="text-sm font-bold text-white">Báo cáo Bán hàng</span>
              </div>
              <div className="text-xs text-white/80">
                {form.from} → {form.to}
              </div>
              <div className="text-xs text-white/70 mt-0.5">
                {form.channel === 'all' ? 'Tất cả kênh' : form.channel.charAt(0).toUpperCase() + form.channel.slice(1)}
              </div>
            </div>

            {/* Sections preview */}
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
              NỘI DUNG BÁO CÁO ({includedCount}/{SECTIONS.length} mục)
            </p>
            <div className="space-y-1">
              {SECTIONS.map(s => (
                <PreviewSection
                  key={s.key}
                  icon={s.icon}
                  label={s.label}
                  enabled={s.always || form[s.key]}
                />
              ))}
            </div>
          </div>

          {/* Format info */}
          <div className="lcard p-4 space-y-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              ĐỊNH DẠNG XUẤT
            </p>
            {[
              { icon: 'picture_as_pdf', label: 'PDF chuyên nghiệp', sub: 'A4, có header/footer, logo' },
              { icon: 'schedule',       label: 'Thời gian tạo',     sub: '~5–15 giây' },
              { icon: 'translate',      label: 'Ngôn ngữ',          sub: 'Tiếng Việt' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <span className="icon shrink-0 mt-0.5" style={{ fontSize: 18, color: 'var(--primary-500)' }}>
                  {item.icon}
                </span>
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
