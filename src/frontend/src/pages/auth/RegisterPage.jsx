import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'

// ── Plan Comparison Table ─────────────────────────────────────────────────────
const PLAN_FEATURES = [
  { label: 'Kênh kết nối',   free: '2 kênh',      pro: 'Không giới hạn' },
  { label: 'Thành viên',     free: '3 người',      pro: 'Không giới hạn' },
  { label: 'AI Dự báo',      free: '—',            pro: '✓',              proBold: true },
  { label: 'Báo cáo nâng cao',free: '—',           pro: '✓',              proBold: true },
  { label: 'Xuất PDF',       free: '10/tháng',     pro: 'Không giới hạn' },
  { label: 'Hỗ trợ',        free: 'Email',         pro: 'Ưu tiên 24/7' },
]

function PlanTable() {
  return (
    <div className="mt-6 rounded-xl overflow-hidden border border-white/10">
      <div className="grid grid-cols-3 text-xs font-semibold bg-white/10 px-3 py-2">
        <div className="text-white/70">Tính năng</div>
        <div className="text-center text-white/70">Free</div>
        <div className="text-center text-emerald-300">Pro</div>
      </div>
      {PLAN_FEATURES.map((f, i) => (
        <div key={i} className={`grid grid-cols-3 px-3 py-2 text-xs border-t border-white/5
          ${i % 2 === 0 ? 'bg-white/5' : ''}`}>
          <div className="text-white/80">{f.label}</div>
          <div className="text-center text-white/60">{f.free}</div>
          <div className={`text-center ${f.proBold ? 'text-emerald-300 font-semibold' : 'text-white/80'}`}>
            {f.pro}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Password strength validator ───────────────────────────────────────────────
function validatePassword(pwd) {
  if (pwd.length < 8)           return 'weak'
  if (!/[A-Z]/.test(pwd))      return 'weak'
  if (!/[0-9]/.test(pwd))      return 'weak'
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'weak'
  return 'strong'
}

function validatePhone(phone) {
  return /^(0[3|5|7|8|9])[0-9]{8}$/.test(phone.replace(/\s/g, ''))
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, content, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
         onClick={onClose}>
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl
                      max-w-md w-full p-6 max-h-[80vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-on-surface">{title}</h3>
          <button onClick={onClose} className="text-outline hover:text-on-surface">
            <span className="icon text-xl">close</span>
          </button>
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed">{content}</p>
        <button onClick={onClose} className="mt-4 btn-primary w-full">Đã hiểu</button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const { t }      = useTranslation()
  const { register } = useAuth()
  const navigate   = useNavigate()

  const [form, setForm] = useState({
    companyName:   '',
    fullName:      '',
    email:         '',
    phone:         '',
    password:      '',
    confirmPassword: '',
    industry:      '',
    businessScale: '',
    shopName:      '',
    agreedToTerms: false,
  })
  const [errors,  setErrors]  = useState({})
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(null)   // 'terms' | 'privacy' | null

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: '' }))
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {}
    if (!form.companyName.trim())   errs.companyName   = 'Vui lòng nhập tên công ty'
    if (!form.fullName.trim())      errs.fullName      = 'Vui lòng nhập họ và tên'
    if (!form.email.trim())         errs.email         = 'Vui lòng nhập email'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Email không hợp lệ'
    if (!form.phone.trim())         errs.phone         = 'Vui lòng nhập số điện thoại'
    else if (!validatePhone(form.phone)) errs.phone = t('auth.phoneInvalid')
    if (validatePassword(form.password) === 'weak') errs.password = t('auth.passwordStrengthWeak')
    if (form.password !== form.confirmPassword)    errs.confirmPassword = t('auth.passwordMismatch')
    if (!form.industry)             errs.industry      = 'Vui lòng chọn ngành hàng'
    if (!form.businessScale)        errs.businessScale = 'Vui lòng chọn quy mô'
    if (!form.agreedToTerms)        errs.agreedToTerms = 'Bạn phải đồng ý điều khoản'
    return errs
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    try {
      await register({
        companyName:   form.companyName,
        fullName:      form.fullName,
        email:         form.email,
        phone:         form.phone,
        password:      form.password,
        confirmPassword: form.confirmPassword,
        industry:      form.industry,
        businessScale: form.businessScale,
        shopName:      form.shopName || null,
        agreedToTerms: true,
      })
      navigate('/onboarding', { replace: true })
    } catch (err) {
      const msg = err.response?.data?.message ?? t('common.error')
      setErrors({ _global: msg })
    } finally {
      setLoading(false)
    }
  }

  const industryOptions = [
    { value: 'fashion',     label: t('auth.industryFashion')     },
    { value: 'electronics', label: t('auth.industryElectronics') },
    { value: 'beauty',      label: t('auth.industryBeauty')      },
    { value: 'furniture',   label: t('auth.industryFurniture')   },
    { value: 'food',        label: t('auth.industryFood')        },
    { value: 'other',       label: t('auth.industryOther')       },
  ]
  const scaleOptions = [
    { value: 'under_500m', label: t('auth.scaleUnder500m') },
    { value: '500m_2b',    label: t('auth.scale500m2b')    },
    { value: 'over_2b',    label: t('auth.scaleOver2b')    },
  ]

  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel ───────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-5/12 xl:w-1/2 flex-col justify-center p-10
                      bg-gradient-to-br from-primary to-secondary text-white">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <span className="icon text-white text-2xl">analytics</span>
          </div>
          <span className="text-xl font-bold">SalesAnalytics</span>
        </div>

        <h2 className="text-3xl font-bold mb-3">
          Quản lý bán hàng<br />đa kênh thông minh
        </h2>
        <p className="text-white/70 text-sm mb-8">
          Hợp nhất dữ liệu Shopee, Lazada, TikTok vào một nơi.<br />
          Dự báo AI, báo cáo PDF chuyên nghiệp.
        </p>

        <div className="space-y-3 mb-8">
          {[
            { icon: 'trending_up',  text: 'Dự báo doanh thu với AI Prophet' },
            { icon: 'store',        text: 'Đa kênh: Shopee, Lazada, TikTok, Facebook' },
            { icon: 'picture_as_pdf', text: 'Báo cáo PDF chuyên nghiệp, tự động' },
            { icon: 'security',     text: 'Dữ liệu mã hóa AES-256, an toàn tuyệt đối' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <span className="icon text-sm">{f.icon}</span>
              </div>
              <span className="text-white/85">{f.text}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
            So sánh gói dịch vụ
          </p>
          <PlanTable />
        </div>
      </div>

      {/* ── Right Panel (Form) ────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-surface overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Logo (mobile) */}
          <div className="flex items-center justify-center gap-2 mb-6 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="icon text-surface text-lg">analytics</span>
            </div>
            <span className="font-bold text-on-surface">SalesAnalytics</span>
          </div>

          <h1 className="font-headline text-2xl font-bold text-on-surface mb-1">
            Tạo tài khoản miễn phí
          </h1>
          <p className="text-sm text-outline mb-6">Bắt đầu ngay, không cần thẻ tín dụng</p>

          {/* Global error */}
          {errors._global && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-error/10 border border-error/30
                            text-error text-sm flex items-center gap-2">
              <span className="icon text-base">error_outline</span>
              {errors._global}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Row: Company + Shop */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-outline mb-1">{t('auth.companyName')} *</label>
                <input
                  type="text" className={`form-input ${errors.companyName ? 'border-error' : ''}`}
                  placeholder="Công ty TNHH ABC"
                  value={form.companyName} onChange={e => set('companyName', e.target.value)}
                />
                {errors.companyName && <p className="text-error text-xs mt-1">{errors.companyName}</p>}
              </div>
            </div>

            {/* FullName + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.fullName')} *</label>
                <input
                  type="text" className={`form-input ${errors.fullName ? 'border-error' : ''}`}
                  placeholder="Nguyễn Văn A"
                  value={form.fullName} onChange={e => set('fullName', e.target.value)}
                />
                {errors.fullName && <p className="text-error text-xs mt-1">{errors.fullName}</p>}
              </div>
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.phone')} *</label>
                <input
                  type="tel" className={`form-input ${errors.phone ? 'border-error' : ''}`}
                  placeholder="0901234567"
                  value={form.phone} onChange={e => set('phone', e.target.value)}
                />
                {errors.phone && <p className="text-error text-xs mt-1">{errors.phone}</p>}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs text-outline mb-1">{t('auth.email')} *</label>
              <input
                type="email" className={`form-input ${errors.email ? 'border-error' : ''}`}
                placeholder="owner@company.com"
                value={form.email} onChange={e => set('email', e.target.value)}
              />
              {errors.email && <p className="text-error text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Password + Confirm */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.password')} *</label>
                <input
                  type="password" className={`form-input ${errors.password ? 'border-error' : ''}`}
                  placeholder="••••••••" minLength={8}
                  value={form.password} onChange={e => set('password', e.target.value)}
                />
                {errors.password && <p className="text-error text-xs mt-1">{errors.password}</p>}
              </div>
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.confirmPassword')} *</label>
                <input
                  type="password" className={`form-input ${errors.confirmPassword ? 'border-error' : ''}`}
                  placeholder="••••••••"
                  value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                />
                {errors.confirmPassword && <p className="text-error text-xs mt-1">{errors.confirmPassword}</p>}
              </div>
            </div>

            {/* Industry + Scale */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.industry')} *</label>
                <select
                  className={`form-input ${errors.industry ? 'border-error' : ''}`}
                  value={form.industry} onChange={e => set('industry', e.target.value)}
                >
                  <option value="">-- Chọn ngành --</option>
                  {industryOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.industry && <p className="text-error text-xs mt-1">{errors.industry}</p>}
              </div>
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.businessScale')} *</label>
                <select
                  className={`form-input ${errors.businessScale ? 'border-error' : ''}`}
                  value={form.businessScale} onChange={e => set('businessScale', e.target.value)}
                >
                  <option value="">-- Chọn quy mô --</option>
                  {scaleOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.businessScale && <p className="text-error text-xs mt-1">{errors.businessScale}</p>}
              </div>
            </div>

            {/* Shop name (optional) */}
            <div>
              <label className="block text-xs text-outline mb-1">{t('auth.shopName')}</label>
              <input
                type="text" className="form-input"
                placeholder="Tên shop Shopee / Facebook Page..."
                value={form.shopName} onChange={e => set('shopName', e.target.value)}
              />
            </div>

            {/* Terms */}
            <div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded border-outline text-primary"
                  checked={form.agreedToTerms}
                  onChange={e => set('agreedToTerms', e.target.checked)}
                />
                <span className="text-xs text-outline leading-relaxed">
                  {t('auth.agreedToTerms')}{' '}
                  <button type="button" onClick={() => setModal('terms')}
                          className="text-primary hover:underline">
                    {t('auth.termsLink')}
                  </button>
                  {' '}và{' '}
                  <button type="button" onClick={() => setModal('privacy')}
                          className="text-primary hover:underline">
                    {t('auth.privacyLink')}
                  </button>
                </span>
              </label>
              {errors.agreedToTerms && (
                <p className="text-error text-xs mt-1">{errors.agreedToTerms}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !form.agreedToTerms}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
                : <span className="icon text-base">rocket_launch</span>
              }
              {t('auth.createFreeAccount')}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-outline">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modal === 'terms' && (
        <Modal
          title={t('auth.termsTitle')}
          content={t('auth.termsContent')}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'privacy' && (
        <Modal
          title={t('auth.privacyTitle')}
          content={t('auth.privacyContent')}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
