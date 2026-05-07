import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtVnd = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const MONTHLY_PRICE = 490_000
const YEARLY_PRICE  = 4_704_000
const TAX_RATE      = 0.10

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, t }) {
  const map = {
    active:    { bg: '#D1FAE5', color: '#065F46' },
    trial:     { bg: '#E0F2FE', color: '#0369A1' },
    expired:   { bg: '#FEE2E2', color: '#991B1B' },
    cancelled: { bg: '#F3F4F6', color: '#6B7280' },
  }
  const s = map[status] ?? map.cancelled
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}>
      {t(`subscription.status.${status}`, status)}
    </span>
  )
}

// ── Plan comparison table ──────────────────────────────────────────────────────
function PlanCompare({ t }) {
  const rows = [
    { key: 'channels',   free: 'freeChannels', pro: 'proChannels' },
    { key: 'users',      free: 'freeUsers',    pro: 'proUsers' },
    { key: 'ai',         free: 'freeAi',       pro: 'proAi' },
    { key: 'reports',    free: 'freeReports',  pro: 'proReports' },
    { key: 'support',    free: 'freeSupport',  pro: 'proSupport' },
  ]
  return (
    <table className="w-full text-sm mt-4 border-collapse">
      <thead>
        <tr>
          <th className="text-left py-2 px-3 font-medium"
            style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
            {t('subscription.compare.feature')}
          </th>
          <th className="py-2 px-3 text-center font-medium"
            style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {t('subscription.compare.free')}
          </th>
          <th className="py-2 px-3 text-center font-semibold"
            style={{ borderBottom: '1px solid var(--border)', color: 'var(--primary-500)' }}>
            {t('subscription.compare.pro')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, free, pro }) => (
          <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
            <td className="py-2 px-3" style={{ color: 'var(--text-secondary)' }}>
              {t(`subscription.compare.${key}`)}
            </td>
            <td className="py-2 px-3 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t(`subscription.compare.${free}`)}
            </td>
            <td className="py-2 px-3 text-center text-xs font-medium"
              style={{ color: 'var(--primary-500)' }}>
              {t(`subscription.compare.${pro}`)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function UpgradeModal({ onClose, onSuccess, t }) {
  const [cycle,   setCycle]   = useState('monthly')
  const [method,  setMethod]  = useState('vnpay')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const basePrice = cycle === 'yearly' ? YEARLY_PRICE : MONTHLY_PRICE
  const tax       = Math.round(basePrice * TAX_RATE)
  const total     = basePrice + tax

  const handleConfirm = async () => {
    setLoading(true); setError('')
    try {
      const res = await axios.post('/api/subscription/upgrade', {
        plan: 'pro', billingCycle: cycle, paymentMethod: method,
      })
      onSuccess(res.data.data)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        style={{ background: 'var(--bg-surface)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            {t('subscription.upgrade.title')}
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Chu kỳ */}
          <div>
            <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('subscription.upgrade.cycle.monthly')} / {t('subscription.upgrade.cycle.yearly')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {['monthly', 'yearly'].map(c => (
                <button key={c}
                  onClick={() => setCycle(c)}
                  className="p-3 rounded-lg border-2 text-left transition-all"
                  style={{
                    borderColor: cycle === c ? 'var(--primary-500)' : 'var(--border)',
                    background:  cycle === c ? 'var(--primary-50, #EEF2FF)' : 'var(--bg-elevated)',
                  }}>
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t(`subscription.upgrade.cycle.${c}`)}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--primary-500)' }}>
                    {c === 'monthly'
                      ? t('subscription.upgrade.monthlyPrice')
                      : t('subscription.upgrade.yearlyPrice')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Phương thức thanh toán */}
          <div>
            <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('subscription.upgrade.paymentMethod')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'vnpay', label: 'VNPay', icon: '💳' },
                { key: 'momo',  label: 'Momo',  icon: '📱' },
                { key: 'bank_transfer', label: t('subscription.upgrade.bank'), icon: '🏦' },
              ].map(({ key, label, icon }) => (
                <button key={key}
                  onClick={() => setMethod(key)}
                  className="p-3 rounded-lg border-2 text-center transition-all text-sm"
                  style={{
                    borderColor: method === key ? 'var(--primary-500)' : 'var(--border)',
                    background:  method === key ? 'var(--primary-50, #EEF2FF)' : 'var(--bg-elevated)',
                    color:       'var(--text-primary)',
                  }}>
                  <div className="text-xl">{icon}</div>
                  <div className="text-xs mt-1">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview hóa đơn */}
          <div className="rounded-lg p-4 space-y-2"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              {t('subscription.upgrade.previewTitle')}
            </div>
            {[
              { label: t('subscription.upgrade.planLabel'), value: `Pro (${t(`subscription.upgrade.cycle.${cycle}`)})` },
              { label: t('subscription.upgrade.price'),     value: fmtVnd(basePrice) },
              { label: t('subscription.upgrade.tax'),       value: fmtVnd(tax) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ color: 'var(--text-primary)' }}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold pt-2"
              style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <span>{t('subscription.upgrade.total')}</span>
              <span style={{ color: 'var(--primary-500)' }}>{fmtVnd(total)}</span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="lbtn lbtn-secondary flex-1">
            {t('subscription.upgrade.cancelBtn')}
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="lbtn lbtn-primary flex-1 flex items-center justify-center gap-2">
            {loading && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {t('subscription.upgrade.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment result modal (sau khi tạo invoice thành công) ─────────────────────
function PaymentResultModal({ result, onClose, t }) {
  if (!result) return null
  const isBankTransfer = result.paymentMethod === 'bank_transfer'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ background: 'var(--bg-surface)' }}>
        <div className="p-6">
          {isBankTransfer ? (
            <>
              <h3 className="font-semibold text-base mb-4" style={{ color: 'var(--text-primary)' }}>
                {t('subscription.bankInfo.title')}
              </h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: t('subscription.bankInfo.bank'),    value: result.bankInfo?.bankName },
                  { label: t('subscription.bankInfo.account'), value: result.bankInfo?.accountNumber },
                  { label: t('subscription.bankInfo.name'),    value: result.bankInfo?.accountName },
                  { label: t('subscription.bankInfo.content'), value: result.bankInfo?.content },
                  { label: t('subscription.upgrade.total'),    value: fmtVnd(result.total) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
                {t('subscription.bankInfo.note')}
              </p>
            </>
          ) : (
            <>
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Hóa đơn #{result.invoiceCode} đã được tạo
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Bạn sẽ được chuyển đến cổng thanh toán {result.paymentMethod?.toUpperCase()}
                </p>
              </div>
              {result.paymentUrl && (
                <a href={result.paymentUrl} target="_blank" rel="noopener noreferrer"
                  className="lbtn lbtn-primary w-full text-center block">
                  Thanh toán ngay
                </a>
              )}
            </>
          )}
          <button onClick={onClose} className="lbtn lbtn-secondary w-full mt-3">
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab 1: Gói dịch vụ hiện tại ───────────────────────────────────────────────
function PlanTab({ sub, onUpgradeSuccess, t }) {
  const [showUpgrade,   setShowUpgrade]   = useState(false)
  const [payResult,     setPayResult]     = useState(null)
  const [togglingRenew, setTogglingRenew] = useState(false)

  const toggleAutoRenew = async () => {
    setTogglingRenew(true)
    try {
      await axios.patch('/api/subscription/auto-renew', { autoRenew: !sub?.autoRenew })
      onUpgradeSuccess()
    } catch {}
    finally { setTogglingRenew(false) }
  }

  return (
    <div className="space-y-6">
      {/* Card gói hiện tại */}
      <div className="rounded-xl p-5" style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
              {t('subscription.currentPlan')}
            </div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {t(`subscription.plan.${sub?.plan ?? 'free'}`)}
            </div>
            {sub?.expiresAt && (
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('subscription.expiresAt')}: {fmtDate(sub.expiresAt)}
              </div>
            )}
            {!sub?.expiresAt && sub?.plan === 'free' && (
              <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {t('subscription.neverExpires')}
              </div>
            )}
          </div>
          <StatusBadge status={sub?.status ?? 'active'} t={t} />
        </div>

        <div className="flex flex-wrap gap-3 mt-5">
          {sub?.plan !== 'pro' && sub?.plan !== 'enterprise' && (
            <button onClick={() => setShowUpgrade(true)} className="lbtn lbtn-primary">
              <span className="icon icon-sm">arrow_upward</span>
              {t('subscription.upgradeBtn')}
            </button>
          )}
          {(sub?.plan === 'pro' || sub?.plan === 'enterprise') && (
            <button onClick={toggleAutoRenew} disabled={togglingRenew}
              className="lbtn lbtn-secondary text-sm">
              {sub?.autoRenew
                ? t('subscription.cancelAutoRenew')
                : t('subscription.enableAutoRenew')}
            </button>
          )}
        </div>
      </div>

      {/* Bảng so sánh */}
      <div className="rounded-xl p-5" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
          So sánh các gói
        </h3>
        <PlanCompare t={t} />
      </div>

      {showUpgrade && (
        <UpgradeModal
          t={t}
          onClose={() => setShowUpgrade(false)}
          onSuccess={(result) => {
            setShowUpgrade(false)
            setPayResult(result)
            onUpgradeSuccess()
          }}
        />
      )}
      {payResult && (
        <PaymentResultModal
          result={payResult}
          t={t}
          onClose={() => setPayResult(null)}
        />
      )}
    </div>
  )
}

// ── Tab 2: Thanh toán nhanh ───────────────────────────────────────────────────
function PaymentTab({ onSuccess, t }) {
  const [cycle,   setCycle]   = useState('monthly')
  const [method,  setMethod]  = useState('vnpay')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')

  const basePrice = cycle === 'yearly' ? YEARLY_PRICE : MONTHLY_PRICE
  const tax       = Math.round(basePrice * TAX_RATE)
  const total     = basePrice + tax

  const handlePay = async () => {
    setLoading(true); setError('')
    try {
      const res = await axios.post('/api/subscription/upgrade', {
        plan: 'pro', billingCycle: cycle, paymentMethod: method,
      })
      setResult(res.data.data)
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Đã xảy ra lỗi')
    } finally { setLoading(false) }
  }

  if (result) {
    return <PaymentResultModal result={result} t={t} onClose={() => setResult(null)} />
  }

  return (
    <div className="max-w-lg space-y-5">
      {/* Chọn gói + chu kỳ */}
      <div>
        <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-primary)' }}>
          Chu kỳ thanh toán
        </label>
        <div className="grid grid-cols-2 gap-3">
          {['monthly', 'yearly'].map(c => (
            <button key={c} onClick={() => setCycle(c)}
              className="p-3 rounded-lg border-2 text-left transition-all"
              style={{
                borderColor: cycle === c ? 'var(--primary-500)' : 'var(--border)',
                background:  cycle === c ? 'var(--primary-50, #EEF2FF)' : 'var(--bg-elevated)',
              }}>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t(`subscription.upgrade.cycle.${c}`)}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--primary-500)' }}>
                {c === 'monthly'
                  ? t('subscription.upgrade.monthlyPrice')
                  : t('subscription.upgrade.yearlyPrice')}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Phương thức */}
      <div>
        <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-primary)' }}>
          {t('subscription.upgrade.paymentMethod')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'vnpay',         label: 'VNPay',    icon: '💳' },
            { key: 'momo',          label: 'Momo',     icon: '📱' },
            { key: 'bank_transfer', label: t('subscription.upgrade.bank'), icon: '🏦' },
          ].map(({ key, label, icon }) => (
            <button key={key} onClick={() => setMethod(key)}
              className="p-3 rounded-lg border-2 text-center text-sm transition-all"
              style={{
                borderColor: method === key ? 'var(--primary-500)' : 'var(--border)',
                background:  method === key ? 'var(--primary-50, #EEF2FF)' : 'var(--bg-elevated)',
                color:       'var(--text-primary)',
              }}>
              <div className="text-xl">{icon}</div>
              <div className="text-xs mt-1">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Preview hóa đơn */}
      <div className="rounded-lg p-4"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('subscription.upgrade.previewTitle')}
        </p>
        {[
          { label: t('subscription.upgrade.planLabel'), value: `Pro – ${t(`subscription.upgrade.cycle.${cycle}`)}` },
          { label: t('subscription.upgrade.price'),     value: fmtVnd(basePrice) },
          { label: t('subscription.upgrade.tax'),       value: fmtVnd(tax) },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm py-1">
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ color: 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-semibold pt-2 mt-1"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <span>{t('subscription.upgrade.total')}</span>
          <span style={{ color: 'var(--primary-500)' }}>{fmtVnd(total)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button onClick={handlePay} disabled={loading}
        className="lbtn lbtn-primary w-full flex items-center justify-center gap-2">
        {loading && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
        {t('subscription.upgrade.confirmBtn')}
      </button>
    </div>
  )
}

// ── Tab 3: Lịch sử thanh toán ─────────────────────────────────────────────────
function InvoiceTab({ t }) {
  const [invoices, setInvoices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    axios.get('/api/subscription/invoices')
      .then(r => setInvoices(r.data.data ?? []))
      .catch(() => setError('Không thể tải lịch sử thanh toán'))
      .finally(() => setLoading(false))
  }, [])

  const statusMap = {
    paid:     { bg: '#D1FAE5', color: '#065F46' },
    pending:  { bg: '#FEF9C3', color: '#854D0E' },
    failed:   { bg: '#FEE2E2', color: '#991B1B' },
    refunded: { bg: '#F3F4F6', color: '#374151' },
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full border-t-transparent animate-spin"
        style={{ borderColor: 'var(--primary-500)' }} />
    </div>
  )

  if (error) return (
    <p className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>{error}</p>
  )

  if (invoices.length === 0) return (
    <div className="text-center py-16">
      <span className="icon text-5xl" style={{ color: 'var(--text-tertiary)' }}>receipt_long</span>
      <p className="mt-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {t('subscription.invoices.empty')}
      </p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {[
              t('subscription.invoices.code'),
              t('subscription.invoices.plan'),
              t('subscription.invoices.amount'),
              t('subscription.invoices.method'),
              t('subscription.invoices.status'),
              t('subscription.invoices.date'),
              '',
            ].map((h, i) => (
              <th key={i} className="text-left py-3 px-3 font-medium"
                style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map(inv => {
            const st = statusMap[inv.paymentStatus] ?? statusMap.pending
            return (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-3 px-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                  {inv.invoiceCode}
                </td>
                <td className="py-3 px-3 capitalize" style={{ color: 'var(--text-primary)' }}>
                  {inv.plan}
                </td>
                <td className="py-3 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {fmtVnd(inv.amount)}
                </td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  {inv.paymentMethod?.toUpperCase() ?? '—'}
                </td>
                <td className="py-3 px-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: st.bg, color: st.color }}>
                    {t(`subscription.invoices.${inv.paymentStatus}`, inv.paymentStatus)}
                  </span>
                </td>
                <td className="py-3 px-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {fmtDate(inv.createdAt)}
                </td>
                <td className="py-3 px-3">
                  {inv.paymentStatus === 'paid' && (
                    <a href={`/api/subscription/invoices/${inv.id}/pdf`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--primary-500)' }}>
                      <span className="icon icon-sm">download</span>
                      {t('subscription.invoices.download')}
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('plan')
  const [sub,       setSub]       = useState(null)
  const [subLoad,   setSubLoad]   = useState(true)

  const loadSub = useCallback(() => {
    axios.get('/api/subscription')
      .then(r => setSub(r.data.data))
      .catch(() => {})
      .finally(() => setSubLoad(false))
  }, [])

  useEffect(() => { loadSub() }, [loadSub])

  const tabs = [
    { key: 'plan',    label: t('subscription.tabs.plan'),    icon: 'workspace_premium' },
    { key: 'payment', label: t('subscription.tabs.payment'), icon: 'credit_card' },
    { key: 'history', label: t('subscription.tabs.history'), icon: 'receipt_long' },
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
        {t('subscription.title')}
      </h2>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
        style={{ background: 'var(--bg-elevated)' }}>
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background:    activeTab === tab.key ? 'var(--bg-surface)' : 'transparent',
              color:         activeTab === tab.key ? 'var(--primary-500)' : 'var(--text-tertiary)',
              boxShadow:     activeTab === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
            <span className="icon icon-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'plan' && (
        subLoad
          ? <div className="animate-pulse space-y-3">
              <div className="h-24 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
              <div className="h-40 rounded-xl" style={{ background: 'var(--bg-elevated)' }} />
            </div>
          : <PlanTab sub={sub} onUpgradeSuccess={loadSub} t={t} />
      )}
      {activeTab === 'payment' && <PaymentTab onSuccess={loadSub} t={t} />}
      {activeTab === 'history' && <InvoiceTab t={t} />}
    </div>
  )
}
