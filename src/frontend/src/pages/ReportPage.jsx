import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportPdf } from '../api/reportApi'

function defaultRange() {
  const to   = new Date()
  const from = new Date(Date.now() - 30 * 86_400_000)
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}

export default function ReportPage() {
  const { t } = useTranslation()
  const range = defaultRange()
  const [form, setForm] = useState({
    from:          range.from,
    to:            range.to,
    channel:       'all',
    includeCharts: true,
    includeAI:     true,
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState(null)

  const handleExport = async () => {
    setLoading(true)
    setSuccess(false)
    setError(null)
    try {
      await exportPdf(form)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch {
      setError('Không thể tạo báo cáo. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('report.title')}</h1>
        <p className="text-outline text-sm mt-0.5">{t('report.subtitle')}</p>
      </div>

      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 space-y-5">
        {/* Time range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-outline mb-1.5">{t('common.from')}</label>
            <input
              type="date"
              className="form-input"
              value={form.from}
              onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-outline mb-1.5">{t('common.to')}</label>
            <input
              type="date"
              className="form-input"
              value={form.to}
              onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
            />
          </div>
        </div>

        {/* Channel */}
        <div>
          <label className="block text-sm text-outline mb-1.5">Kênh bán hàng</label>
          <select
            className="form-input"
            value={form.channel}
            onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
          >
            <option value="all">Tất cả kênh</option>
            <option value="shopee">Shopee</option>
            <option value="lazada">Lazada</option>
            <option value="tiktok">TikTok Shop</option>
            <option value="facebook">Facebook</option>
            <option value="website">Website</option>
          </select>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <label className="block text-sm text-outline">Nội dung báo cáo</label>
          {[
            { key: 'includeCharts', label: t('report.includeCharts'), icon: 'bar_chart'  },
            { key: 'includeAI',    label: t('report.includeAI'),     icon: 'smart_toy'  },
          ].map(opt => (
            <label key={opt.key} className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
                              transition-all ${
                form[opt.key]
                  ? 'bg-primary border-primary'
                  : 'border-outline-variant group-hover:border-outline'
              }`}>
                {form[opt.key] && <span className="icon text-surface text-sm">check</span>}
              </div>
              <input
                type="checkbox"
                hidden
                checked={form[opt.key]}
                onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))}
              />
              <span className="icon text-outline">{opt.icon}</span>
              <span className="text-on-surface text-sm">{opt.label}</span>
            </label>
          ))}
        </div>

        {/* Preview info */}
        <div className="bg-surface-container rounded-xl p-4 text-sm space-y-1">
          <p className="text-outline font-medium mb-2">Báo cáo sẽ bao gồm:</p>
          <p className="text-on-surface flex items-center gap-2">
            <span className="icon text-primary text-base">check</span>
            KPI tổng hợp (doanh thu, đơn hàng, khách hàng)
          </p>
          <p className="text-on-surface flex items-center gap-2">
            <span className="icon text-primary text-base">check</span>
            Bảng doanh thu theo kênh bán hàng
          </p>
          <p className="text-on-surface flex items-center gap-2">
            <span className="icon text-primary text-base">check</span>
            Top sản phẩm bán chạy
          </p>
          {form.includeCharts && (
            <p className="text-on-surface flex items-center gap-2">
              <span className="icon text-primary text-base">check</span>
              Biểu đồ doanh thu và kênh bán hàng
            </p>
          )}
          {form.includeAI && (
            <p className="text-on-surface flex items-center gap-2">
              <span className="icon text-primary text-base">check</span>
              Nhận xét & Insight từ AI
            </p>
          )}
        </div>

        {success && (
          <div className="px-4 py-3 rounded-xl bg-tertiary/10 border border-tertiary/30
                          text-tertiary text-sm flex items-center gap-2">
            <span className="icon">check_circle</span>
            {t('report.success')}
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30
                          text-error text-sm flex items-center gap-2">
            <span className="icon">error_outline</span>
            {error}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
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
    </div>
  )
}
