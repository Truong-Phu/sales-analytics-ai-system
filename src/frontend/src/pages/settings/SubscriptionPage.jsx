import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

// ── Countdown hook: cập nhật mỗi phút ────────────────────────────────────────
function useCountdown(expiresAt) {
  const calc = () => {
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, totalMs: 0 }
    const days    = Math.floor(diff / 86_400_000)
    const hours   = Math.floor((diff % 86_400_000) / 3_600_000)
    const minutes = Math.floor((diff % 3_600_000) / 60_000)
    return { expired: false, days, hours, minutes, totalMs: diff }
  }
  const [countdown, setCountdown] = useState(calc)
  useEffect(() => {
    if (!expiresAt) return
    setCountdown(calc())
    const id = setInterval(() => setCountdown(calc()), 60_000)
    return () => clearInterval(id)
  }, [expiresAt])
  return countdown
}

// ── Countdown badge với màu theo mức độ khẩn cấp ─────────────────────────────
function CountdownBadge({ expiresAt }) {
  const cd = useCountdown(expiresAt)
  if (!cd) return null

  if (cd.expired) {
    return (
      <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-sm font-medium"
        style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}>
        <span className="icon icon-sm">error</span>
        Gói đã hết hạn — tính năng Pro bị tạm khóa
      </div>
    )
  }

  // Chọn màu theo số ngày còn lại
  const isUrgent  = cd.days < 3
  const isWarning = cd.days >= 3 && cd.days < 7

  const styles = isUrgent
    ? { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', iconColor: '#EF4444', icon: 'timer' }
    : isWarning
    ? { bg: '#FFFBEB', border: '#FDE68A', color: '#854D0E', iconColor: '#F59E0B', icon: 'hourglass_bottom' }
    : { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534', iconColor: '#22C55E', icon: 'verified' }

  // Hiển thị chi tiết giờ/phút nếu còn ít ngày
  const timeStr = cd.days > 0
    ? `${cd.days} ngày${cd.hours > 0 ? ` ${cd.hours} giờ` : ''}`
    : cd.hours > 0
    ? `${cd.hours} giờ ${cd.minutes} phút`
    : `${cd.minutes} phút`

  // Progress bar: tỷ lệ thời gian còn lại / 30 ngày (1 tháng = chu kỳ ngắn nhất)
  const totalDays = 30
  const pct = Math.min(100, Math.round((cd.days / totalDays) * 100))

  return (
    <div className="mt-3 rounded-xl overflow-hidden"
      style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="icon icon-sm" style={{ color: styles.iconColor }}>{styles.icon}</span>
        <span className="text-sm font-medium" style={{ color: styles.color }}>
          {isUrgent ? 'Sắp hết hạn! Còn ' : 'Còn '}
          <strong>{timeStr}</strong>
        </span>
        <span className="ml-auto text-xs font-mono" style={{ color: styles.color }}>
          {new Date(expiresAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 w-full" style={{ background: `${styles.border}` }}>
        <div className="h-full transition-all duration-500 rounded-full"
          style={{ width: `${pct}%`, background: styles.iconColor }} />
      </div>
    </div>
  )
}

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
    { key: 'channels',   free: 'freeChannels', pro: 'proChannels', ent: 'entChannels' },
    { key: 'users',      free: 'freeUsers',    pro: 'proUsers',    ent: 'entUsers' },
    { key: 'ai',         free: 'freeAi',       pro: 'proAi',       ent: 'entAi' },
    { key: 'reports',    free: 'freeReports',  pro: 'proReports',  ent: 'entReports' },
    { key: 'support',    free: 'freeSupport',  pro: 'proSupport',  ent: 'entSupport' },
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
          <th className="py-2 px-3 text-center font-semibold"
            style={{ borderBottom: '1px solid var(--border)', color: '#D97706' }}>
            {t('subscription.compare.enterprise')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, free, pro, ent }) => (
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
            <td className="py-2 px-3 text-center text-xs font-medium"
              style={{ color: '#D97706' }}>
              {t(`subscription.compare.${ent}`)}
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
      const res = await axios.post('/api/payment/subscription/initiate', {
        plan: 'pro', billingCycle: cycle, method: method.toUpperCase(),
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
                { key: 'vnpay',   label: 'VNPay',  icon: '💳' },
                { key: 'momo',    label: 'Momo',   icon: '📱' },
                { key: 'vietqr',  label: 'VietQR', icon: '📲' },
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
  const method = (result.paymentMethod ?? '').toUpperCase()
  const isVietQR = method === 'VIETQR'
  const qr = result.vietQRInfo  // { qrDataUrl, bankName, accountNumber, accountHolder, transferContent, amount }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ background: 'var(--bg-surface)' }}>
        <div className="p-6">
          {isVietQR ? (
            <>
              <h3 className="font-semibold text-base mb-4 text-center" style={{ color: 'var(--text-primary)' }}>
                Thanh toán qua VietQR
              </h3>

              {/* QR code */}
              {qr?.qrDataUrl ? (
                <div className="flex justify-center mb-4">
                  <img src={qr.qrDataUrl} alt="VietQR" className="rounded-xl border"
                    style={{ width: 200, height: 200, objectFit: 'contain', border: '1px solid var(--border)' }} />
                </div>
              ) : (
                <div className="flex justify-center items-center mb-4 rounded-xl"
                  style={{ width: 200, height: 200, margin: '0 auto', background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
                  <span className="text-xs text-center px-4" style={{ color: 'var(--text-tertiary)' }}>
                    QR chưa sẵn sàng — dùng thông tin bên dưới để chuyển khoản
                  </span>
                </div>
              )}

              {/* Thông tin chuyển khoản */}
              <div className="rounded-xl p-4 space-y-2 text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                {[
                  { label: 'Ngân hàng',     value: qr?.bankName },
                  { label: 'Số tài khoản',  value: qr?.accountNumber },
                  { label: 'Chủ tài khoản', value: qr?.accountHolder },
                  { label: 'Nội dung CK',   value: qr?.transferContent },
                  { label: 'Số tiền',       value: qr?.amount != null ? fmtVnd(qr.amount) : null },
                ].filter(r => r.value).map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{label}</span>
                    <span className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs mt-3 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Gói Pro sẽ được kích hoạt tự động sau khi thanh toán được xác nhận.
              </p>
            </>
          ) : (
            <>
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">✅</div>
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Hóa đơn đã được tạo
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Bạn sẽ được chuyển đến cổng thanh toán {method}
                </p>
              </div>
              {result.mockPaymentUrl && (
                <a href={result.mockPaymentUrl} target="_blank" rel="noopener noreferrer"
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
  const [showUpgrade,    setShowUpgrade]    = useState(false)
  const [payResult,      setPayResult]      = useState(null)
  const [togglingRenew,  setTogglingRenew]  = useState(false)
  const [cancelRenewDlg, setCancelRenewDlg] = useState(false)

  const toggleAutoRenew = async () => {
    setTogglingRenew(true)
    try {
      await axios.patch('/api/subscription/auto-renew', { autoRenew: !sub?.autoRenew })
      onUpgradeSuccess()
    } catch {}
    finally { setTogglingRenew(false) }
  }

  const expiryLabel = sub?.expiresAt
    ? new Date(sub.expiresAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const isPro  = sub?.plan === 'pro' || sub?.plan === 'enterprise'
  const isFree = !isPro

  return (
    <div className="space-y-5">
      {/* Dialog xác nhận hủy gia hạn */}
      <ConfirmDialog
        open={cancelRenewDlg}
        onClose={() => setCancelRenewDlg(false)}
        onConfirm={() => { setCancelRenewDlg(false); toggleAutoRenew() }}
        title="Hủy gia hạn tự động"
        icon="event_busy"
        message={
          expiryLabel
            ? `Gói Pro của bạn vẫn tiếp tục hoạt động đến hết ngày ${expiryLabel}. Sau ngày này, tài khoản sẽ tự động chuyển về gói Free — bạn có thể đăng ký lại bất kỳ lúc nào.`
            : 'Gói Pro sẽ không được gia hạn sau kỳ hiện tại. Bạn có thể kích hoạt lại gia hạn tự động bất kỳ lúc nào.'
        }
        confirmText="Hủy gia hạn"
        cancelText="Giữ nguyên"
      />

      {/* 2 cột: trạng thái gói (trái) + so sánh (phải) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        {/* ── Cột trái: Gói hiện tại ── */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ border: `1px solid ${isPro ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                   background: isPro ? 'var(--primary-50, rgba(99,102,241,0.04))' : 'var(--bg-elevated)' }}>

          {/* Badge gói + tên */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                {t('subscription.currentPlan')}
              </div>
              <div className="flex items-center gap-2">
                {isPro && <span className="icon" style={{ color: 'var(--primary-500)', fontSize: 24 }}>workspace_premium</span>}
                <span className="text-2xl font-bold" style={{ color: isPro ? 'var(--primary-500)' : 'var(--text-primary)' }}>
                  {t(`subscription.plan.${sub?.plan ?? 'free'}`)}
                </span>
              </div>
              {isFree && (
                <div className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {t('subscription.neverExpires')}
                </div>
              )}
            </div>
            <StatusBadge status={sub?.status ?? 'active'} t={t} />
          </div>

          {/* Countdown / cảnh báo chưa kích hoạt */}
          {isPro && (
            sub?.expiresAt
              ? <CountdownBadge expiresAt={sub.expiresAt} />
              : <div className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#854D0E' }}>
                  Gói Pro chưa được kích hoạt — hoàn tất thanh toán để kích hoạt.
                </div>
          )}

          {/* Thông tin gia hạn (chỉ khi Pro) */}
          {isPro && sub?.autoRenew !== undefined && (
            <div className="flex items-center gap-2 text-sm"
              style={{ color: sub.autoRenew ? '#16A34A' : 'var(--text-tertiary)' }}>
              <span className="icon" style={{ fontSize: 16 }}>
                {sub.autoRenew ? 'autorenew' : 'sync_disabled'}
              </span>
              {sub.autoRenew ? 'Gia hạn tự động đang bật' : 'Gia hạn tự động đã tắt'}
            </div>
          )}

          {/* Nút hành động */}
          <div className="flex flex-col gap-2 pt-1">
            {isFree && (
              <button onClick={() => setShowUpgrade(true)} className="lbtn lbtn-primary w-full">
                <span className="icon icon-sm">arrow_upward</span>
                {t('subscription.upgradeBtn')}
              </button>
            )}
            {isPro && (
              <button
                onClick={() => sub?.autoRenew ? setCancelRenewDlg(true) : toggleAutoRenew()}
                disabled={togglingRenew}
                className="lbtn lbtn-secondary w-full text-sm">
                {togglingRenew
                  ? <span className="icon animate-spin icon-sm">refresh</span>
                  : <span className="icon icon-sm">{sub?.autoRenew ? 'cancel' : 'autorenew'}</span>}
                {sub?.autoRenew
                  ? t('subscription.cancelAutoRenew')
                  : t('subscription.enableAutoRenew')}
              </button>
            )}
          </div>
        </div>

        {/* ── Cột phải: So sánh gói ── */}
        <div className="rounded-2xl p-5"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="icon" style={{ color: 'var(--text-tertiary)', fontSize: 18 }}>compare</span>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              So sánh các gói
            </h3>
          </div>
          <PlanCompare t={t} />
        </div>
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
function PaymentTab({ onSuccess, t, pendingInvoice }) {
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
      const res = await axios.post('/api/payment/subscription/initiate', {
        plan: 'pro', billingCycle: cycle, method: method.toUpperCase(),
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
    <div className="space-y-4">
      {/* Banner hóa đơn pending */}
      {pendingInvoice && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#854D0E' }}>
          <span className="icon shrink-0 mt-0.5" style={{ fontSize: 18, color: '#F59E0B' }}>info</span>
          <div>
            <p className="font-semibold">Bạn có hóa đơn chưa thanh toán</p>
            <p className="text-xs mt-0.5">
              Mã: <strong>{pendingInvoice.invoiceCode}</strong> — Số tiền: <strong>{fmtVnd(pendingInvoice.amount)}</strong>
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#92400E' }}>
              Chọn phương thức bên dưới và xác nhận để hoàn tất.
            </p>
          </div>
        </div>
      )}

      {/* 2 cột: cấu hình (trái) + tóm tắt hóa đơn (phải) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        {/* ── Cột trái: Chu kỳ + Phương thức ── */}
        <div className="space-y-5">
          {/* Chu kỳ */}
          <div>
            <label className="text-sm font-semibold block mb-3" style={{ color: 'var(--text-primary)' }}>
              Chu kỳ thanh toán
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'monthly', priceKey: 'monthlyPrice', badge: null },
                { key: 'yearly',  priceKey: 'yearlyPrice',  badge: 'Tiết kiệm 20%' },
              ].map(({ key, priceKey, badge }) => (
                <button key={key} onClick={() => setCycle(key)}
                  className="p-4 rounded-xl border-2 text-left transition-all relative"
                  style={{
                    borderColor: cycle === key ? 'var(--primary-500)' : 'var(--border)',
                    background:  cycle === key ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'var(--bg-elevated)',
                  }}>
                  {badge && (
                    <span className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#16A34A' }}>
                      {badge}
                    </span>
                  )}
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t(`subscription.upgrade.cycle.${key}`)}
                  </div>
                  <div className="text-xs mt-1 font-semibold" style={{ color: 'var(--primary-500)' }}>
                    {t(`subscription.upgrade.${priceKey}`)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Phương thức thanh toán */}
          <div>
            <label className="text-sm font-semibold block mb-3" style={{ color: 'var(--text-primary)' }}>
              {t('subscription.upgrade.paymentMethod')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'vnpay',  label: 'VNPay',  icon: '💳' },
                { key: 'momo',   label: 'Momo',   icon: '📱' },
                { key: 'vietqr', label: 'VietQR', icon: '📲' },
              ].map(({ key, label, icon }) => (
                <button key={key} onClick={() => setMethod(key)}
                  className="py-3 rounded-xl border-2 text-center transition-all"
                  style={{
                    borderColor: method === key ? 'var(--primary-500)' : 'var(--border)',
                    background:  method === key ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                  }}>
                  <div className="text-2xl">{icon}</div>
                  <div className="text-xs mt-1.5 font-medium">{label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Cột phải: Tóm tắt + CTA ── */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="icon" style={{ color: 'var(--primary-500)', fontSize: 20 }}>receipt_long</span>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('subscription.upgrade.previewTitle')}
            </p>
          </div>

          {/* Dòng mục */}
          <div className="space-y-2">
            {[
              { label: 'Gói',       value: 'Pro' },
              { label: 'Chu kỳ',    value: t(`subscription.upgrade.cycle.${cycle}`) },
              { label: 'Phương thức', value: method === 'vietqr' ? 'VietQR' : method === 'momo' ? 'Momo' : 'VNPay' },
              { label: t('subscription.upgrade.price'), value: fmtVnd(basePrice) },
              { label: t('subscription.upgrade.tax'),   value: fmtVnd(tax) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Tổng */}
          <div className="flex justify-between items-center pt-3"
            style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('subscription.upgrade.total')}
            </span>
            <span className="text-xl font-bold" style={{ color: 'var(--primary-500)' }}>
              {fmtVnd(total)}
            </span>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <span className="icon" style={{ fontSize: 14 }}>error_outline</span>
              {error}
            </p>
          )}

          {/* Nút thanh toán */}
          <button onClick={handlePay} disabled={loading}
            className="lbtn lbtn-primary w-full flex items-center justify-center gap-2 mt-1">
            {loading
              ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <span className="icon" style={{ fontSize: 18 }}>lock</span>}
            {t('subscription.upgrade.confirmBtn')}
          </button>

          <p className="text-[11px] text-center" style={{ color: 'var(--text-tertiary)' }}>
            Giao dịch được mã hóa và bảo mật
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Tab 3: Lịch sử thanh toán ─────────────────────────────────────────────────
function InvoiceTab({ t, onPayPending }) {
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

  const pendingCount = invoices.filter(inv => inv.paymentStatus === 'pending').length

  return (
    <div>
      {/* Banner thông báo có hóa đơn chưa thanh toán */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#854D0E' }}>
          <span className="icon" style={{ fontSize: 20, color: '#F59E0B' }}>warning</span>
          <span>Bạn có <strong>{pendingCount}</strong> hóa đơn chưa thanh toán.</span>
          <button
            onClick={() => onPayPending(invoices.find(inv => inv.paymentStatus === 'pending'))}
            className="ml-auto text-xs font-semibold underline underline-offset-2"
            style={{ color: '#854D0E', whiteSpace: 'nowrap' }}>
            Thanh toán ngay
          </button>
        </div>
      )}
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
                    {inv.paymentStatus === 'pending' && (
                      <button
                        onClick={() => onPayPending(inv)}
                        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors"
                        style={{ background: 'rgba(245,158,11,0.10)', color: '#854D0E' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.20)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.10)'}>
                        <span className="icon icon-sm">credit_card</span>
                        Thanh toán
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SubscriptionPage() {
  const { t } = useTranslation()
  const [activeTab,      setActiveTab]      = useState('plan')
  const [sub,            setSub]            = useState(null)
  const [subLoad,        setSubLoad]        = useState(true)
  const [pendingInvoice, setPendingInvoice] = useState(null)  // hóa đơn pending đang chờ xử lý

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
            onClick={() => { setActiveTab(tab.key); if (tab.key !== 'payment') setPendingInvoice(null) }}
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
      {activeTab === 'payment' && <PaymentTab onSuccess={loadSub} t={t} pendingInvoice={pendingInvoice} />}
      {activeTab === 'history' && (
        <InvoiceTab
          t={t}
          onPayPending={inv => { setPendingInvoice(inv); setActiveTab('payment') }}
        />
      )}
    </div>
  )
}
