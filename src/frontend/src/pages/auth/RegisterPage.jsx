import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import axios from '../../api/axios'

// ── Plan comparison shown on left panel ──────────────────────────────────────
const PLAN_FEATURES = [
  { label: 'Kênh kết nối',    free: '2 kênh',      pro: 'Không giới hạn' },
  { label: 'Thành viên',      free: '3 người',      pro: 'Không giới hạn' },
  { label: 'AI Dự báo',       free: '—',            pro: '✓', proBold: true },
  { label: 'Báo cáo nâng cao',free: '—',            pro: '✓', proBold: true },
  { label: 'Xuất PDF',        free: '10/tháng',     pro: 'Không giới hạn' },
  { label: 'Hỗ trợ',         free: 'Email',         pro: 'Ưu tiên 24/7' },
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function validatePassword(pwd) {
  if (pwd.length < 8)               return 'weak'
  if (!/[A-Z]/.test(pwd))          return 'weak'
  if (!/[0-9]/.test(pwd))          return 'weak'
  if (!/[^A-Za-z0-9]/.test(pwd))  return 'weak'
  return 'strong'
}

function validatePhone(phone) {
  return /^(0[3|5|7|8|9])[0-9]{8}$/.test(phone.replace(/\s/g, ''))
}

// ── Legal modal ───────────────────────────────────────────────────────────────
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

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step }) {
  const labels = ['Thông tin', 'Xác thực email', 'Hoàn tất']
  return (
    <div className="flex items-center gap-0 mb-7">
      {labels.map((label, i) => {
        const idx   = i + 1
        const done  = idx < step
        const active = idx === step
        return (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                transition-colors ${done ? 'bg-primary text-white' : active ? 'bg-primary text-white ring-2 ring-primary/30' : 'bg-outline/20 text-outline'}`}>
                {done ? <span className="icon text-sm">check</span> : idx}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${active ? 'text-primary font-semibold' : 'text-outline'}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={`h-0.5 w-12 mx-1 mb-5 transition-colors ${done ? 'bg-primary' : 'bg-outline/20'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 6-box OTP input ───────────────────────────────────────────────────────────
function OtpBoxes({ value, onChange, disabled }) {
  const digits = [...value.padEnd(6, ' ')].slice(0, 6)
  const refs   = useRef([])

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = value.split('')
      if (arr[i] && arr[i] !== ' ') {
        arr[i] = ''
        onChange(arr.join('').replace(/ /g, ''))
      } else if (i > 0) {
        arr[i - 1] = ''
        onChange(arr.join('').replace(/ /g, ''))
        refs.current[i - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  const handleInput = (i, e) => {
    const ch = e.target.value.replace(/\D/g, '').slice(-1)
    if (!ch) return
    const arr = value.split('').concat(Array(6).fill('')).slice(0, 6)
    arr[i] = ch
    const next = arr.join('').replace(/ /g, '')
    onChange(next)
    if (i < 5) refs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted)
    const focusIdx = Math.min(pasted.length, 5)
    refs.current[focusIdx]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center my-6">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => refs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={d.trim()}
          onChange={e => handleInput(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          className={`w-11 h-14 rounded-xl text-center text-xl font-bold border-2 outline-none transition-all
            focus:border-primary bg-surface-container-lowest text-on-surface
            ${d.trim() ? 'border-primary' : 'border-outline-variant'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const { t }        = useTranslation()
  const { register } = useAuth()
  const navigate     = useNavigate()

  // ── State ───────────────────────────────────────────────────────────────────
  const [step,    setStep]    = useState(1)  // 1 | 2 | 3
  const [form,    setForm]    = useState({
    companyName: '', fullName: '', email: '', phone: '',
    password: '', confirmPassword: '', industry: '', businessScale: '',
    shopName: '', agreedToTerms: false,
  })
  const [otp,     setOtp]     = useState('')
  const [errors,  setErrors]  = useState({})
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(null)
  const [countdown, setCountdown] = useState(0)  // resend cooldown seconds
  const [showPassword,  setShowPassword]  = useState(false)
  const [showConfirm,   setShowConfirm]   = useState(false)

  // ── Countdown timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) return
    const id = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(id)
  }, [countdown])

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }))
    setErrors(e => ({ ...e, [key]: '' }))
  }

  // ── Step 1 validation ────────────────────────────────────────────────────────
  const validateStep1 = () => {
    const errs = {}
    if (!form.companyName.trim())  errs.companyName   = 'Vui lòng nhập tên công ty'
    if (!form.fullName.trim())     errs.fullName      = 'Vui lòng nhập họ và tên'
    if (!form.email.trim())        errs.email         = 'Vui lòng nhập email'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Email không hợp lệ'
    if (!form.phone.trim())        errs.phone         = 'Vui lòng nhập số điện thoại'
    else if (!validatePhone(form.phone)) errs.phone   = t('auth.phoneInvalid')
    if (validatePassword(form.password) === 'weak')         errs.password        = t('auth.passwordStrengthWeak')
    if (form.password !== form.confirmPassword)             errs.confirmPassword = t('auth.passwordMismatch')
    if (!form.industry)            errs.industry      = 'Vui lòng chọn ngành hàng'
    if (!form.businessScale)       errs.businessScale = 'Vui lòng chọn quy mô'
    if (!form.agreedToTerms)       errs.agreedToTerms = 'Bạn phải đồng ý điều khoản'
    return errs
  }

  // ── Step 1 submit → send OTP ─────────────────────────────────────────────────
  const handleSendOtp = async e => {
    e.preventDefault()
    const errs = validateStep1()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setLoading(true)
    setErrors({})
    try {
      await axios.post('/api/auth/send-otp', { email: form.email })
      setOtp('')
      setCountdown(60)
      setStep(2)
    } catch (err) {
      const serverMsg = typeof err.response?.data === 'object'
        ? err.response.data.message
        : null
      const msg = serverMsg
        ?? (err.response ? `Lỗi ${err.response.status}: Không thể xử lý yêu cầu` : 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối.')
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('tồn tại') || msg.toLowerCase().includes('đã được')) {
        setErrors({ email: t('auth.emailAlreadyExists') })
      } else if (msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('giây') || msg.toLowerCase().includes('chờ')) {
        setErrors({ _global: t('auth.otpRateLimit') })
      } else {
        setErrors({ _global: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Resend OTP ───────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (countdown > 0) return
    setLoading(true)
    setErrors({})
    setOtp('')
    try {
      await axios.post('/api/auth/send-otp', { email: form.email })
      setCountdown(60)
    } catch (err) {
      setErrors({ _global: err.response?.data?.message ?? t('common.error') })
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2 submit → verify OTP then register ──────────────────────────────────
  const handleVerifyAndRegister = async e => {
    e.preventDefault()
    if (otp.length < 6) { setErrors({ otp: 'Vui lòng nhập đủ 6 chữ số' }); return }

    setLoading(true)
    setErrors({})
    try {
      // 1. Verify OTP
      await axios.post('/api/auth/verify-otp', {
        email:   form.email,
        otp:     otp,
        purpose: 'register',
      })
      // 2. Register (OTP verified, pass it along)
      setStep(3)
      await register({
        companyName:     form.companyName,
        fullName:        form.fullName,
        email:           form.email,
        phone:           form.phone,
        password:        form.password,
        confirmPassword: form.confirmPassword,
        industry:        form.industry,
        businessScale:   form.businessScale,
        shopName:        form.shopName || null,
        agreedToTerms:   true,
        otpCode:         otp,
      })
      navigate('/onboarding', { replace: true })
    } catch (err) {
      setStep(2)
      const msg = err.response?.data?.message ?? t('common.error')
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('không đúng')
          || msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('hết hạn')) {
        setErrors({ otp: t('auth.otpInvalid') })
      } else if (msg.toLowerCase().includes('attempts') || msg.toLowerCase().includes('lần')) {
        setErrors({ otp: t('auth.otpMaxAttempts') })
        setOtp('')
      } else {
        setErrors({ _global: msg })
      }
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
            { icon: 'trending_up',    text: 'Dự báo doanh thu với AI Prophet' },
            { icon: 'store',          text: 'Đa kênh: Shopee, Lazada, TikTok, Facebook' },
            { icon: 'picture_as_pdf', text: 'Báo cáo PDF chuyên nghiệp, tự động' },
            { icon: 'security',       text: 'Dữ liệu mã hóa AES-256, an toàn tuyệt đối' },
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

      {/* ── Right Panel ───────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-surface overflow-y-auto">
        <div className="w-full max-w-md py-8">
          {/* Logo (mobile only) */}
          <div className="flex items-center justify-center gap-2 mb-6 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="icon text-surface text-lg">analytics</span>
            </div>
            <span className="font-bold text-on-surface">SalesAnalytics</span>
          </div>

          <h1 className="font-headline text-2xl font-bold text-on-surface mb-1">
            {step === 1 && 'Tạo tài khoản miễn phí'}
            {step === 2 && 'Xác thực email'}
            {step === 3 && 'Đang tạo tài khoản...'}
          </h1>
          <p className="text-sm text-outline mb-6">
            {step === 1 && 'Bắt đầu ngay, không cần thẻ tín dụng'}
            {step === 2 && `Mã xác thực đã gửi đến ${form.email}`}
            {step === 3 && 'Vui lòng chờ trong giây lát'}
          </p>

          <StepDots step={step} />

          {/* Global error */}
          {errors._global && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-error/10 border border-error/30
                            text-error text-sm flex items-center gap-2">
              <span className="icon text-base">error_outline</span>
              {errors._global}
            </div>
          )}

          {/* ── STEP 1: Form ──────────────────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-4" noValidate>
              {/* Company name */}
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.companyName')} *</label>
                <input type="text" className={`form-input ${errors.companyName ? 'border-error' : ''}`}
                  placeholder="Công ty TNHH ABC"
                  value={form.companyName} onChange={e => set('companyName', e.target.value)} />
                {errors.companyName && <p className="text-error text-xs mt-1">{errors.companyName}</p>}
              </div>

              {/* FullName + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-outline mb-1">{t('auth.fullName')} *</label>
                  <input type="text" className={`form-input ${errors.fullName ? 'border-error' : ''}`}
                    placeholder="Nguyễn Văn A"
                    value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                  {errors.fullName && <p className="text-error text-xs mt-1">{errors.fullName}</p>}
                </div>
                <div>
                  <label className="block text-xs text-outline mb-1">{t('auth.phone')} *</label>
                  <input type="tel" className={`form-input ${errors.phone ? 'border-error' : ''}`}
                    placeholder="0901234567"
                    value={form.phone} onChange={e => set('phone', e.target.value)} />
                  {errors.phone && <p className="text-error text-xs mt-1">{errors.phone}</p>}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.email')} *</label>
                <input type="email" className={`form-input ${errors.email ? 'border-error' : ''}`}
                  placeholder="owner@company.com"
                  value={form.email} onChange={e => set('email', e.target.value)} />
                {errors.email && <p className="text-error text-xs mt-1">{errors.email}</p>}
              </div>

              {/* Password + Confirm */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-outline mb-1">{t('auth.password')} *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'}
                      className={`form-input pr-10 ${errors.password ? 'border-error' : ''}`}
                      placeholder="••••••••" minLength={8}
                      value={form.password} onChange={e => set('password', e.target.value)} />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                      <span className="icon text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  {errors.password && <p className="text-error text-xs mt-1">{errors.password}</p>}
                </div>
                <div>
                  <label className="block text-xs text-outline mb-1">{t('auth.confirmPassword')} *</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'}
                      className={`form-input pr-10 ${errors.confirmPassword ? 'border-error' : ''}`}
                      placeholder="••••••••"
                      value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface">
                      <span className="icon text-lg">{showConfirm ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-error text-xs mt-1">{errors.confirmPassword}</p>}
                </div>
              </div>

              {/* Industry + Scale */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-outline mb-1">{t('auth.industry')} *</label>
                  <select className={`form-input ${errors.industry ? 'border-error' : ''}`}
                    value={form.industry} onChange={e => set('industry', e.target.value)}>
                    <option value="">-- Chọn ngành --</option>
                    {industryOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {errors.industry && <p className="text-error text-xs mt-1">{errors.industry}</p>}
                </div>
                <div>
                  <label className="block text-xs text-outline mb-1">{t('auth.businessScale')} *</label>
                  <select className={`form-input ${errors.businessScale ? 'border-error' : ''}`}
                    value={form.businessScale} onChange={e => set('businessScale', e.target.value)}>
                    <option value="">-- Chọn quy mô --</option>
                    {scaleOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {errors.businessScale && <p className="text-error text-xs mt-1">{errors.businessScale}</p>}
                </div>
              </div>

              {/* Shop name */}
              <div>
                <label className="block text-xs text-outline mb-1">{t('auth.shopName')}</label>
                <input type="text" className="form-input"
                  placeholder="Tên shop Shopee / Facebook Page..."
                  value={form.shopName} onChange={e => set('shopName', e.target.value)} />
              </div>

              {/* Terms */}
              <div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 rounded border-outline text-primary"
                    checked={form.agreedToTerms}
                    onChange={e => set('agreedToTerms', e.target.checked)} />
                  <span className="text-xs text-outline leading-relaxed">
                    {t('auth.agreedToTerms')}{' '}
                    <button type="button" onClick={() => setModal('terms')}
                            className="text-primary hover:underline">{t('auth.termsLink')}</button>
                    {' '}và{' '}
                    <button type="button" onClick={() => setModal('privacy')}
                            className="text-primary hover:underline">{t('auth.privacyLink')}</button>
                  </span>
                </label>
                {errors.agreedToTerms && <p className="text-error text-xs mt-1">{errors.agreedToTerms}</p>}
              </div>

              <button type="submit" disabled={loading || !form.agreedToTerms}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                {loading
                  ? <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
                  : <span className="icon text-base">mark_email_read</span>
                }
                {loading ? t('auth.sendingOtp') : t('auth.sendOtp')}
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP ───────────────────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={handleVerifyAndRegister} className="space-y-2" noValidate>
              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                     style={{ background: 'rgba(99,102,241,0.1)' }}>
                  <span className="icon text-3xl" style={{ color: 'var(--primary-500)' }}>mail</span>
                </div>
                <p className="text-sm text-outline">
                  Mã xác thực 6 chữ số đã gửi đến
                </p>
                <p className="text-sm font-semibold text-on-surface mt-0.5">{form.email}</p>
              </div>

              <OtpBoxes value={otp} onChange={setOtp} disabled={loading} />

              {errors.otp && (
                <p className="text-error text-xs text-center">{errors.otp}</p>
              )}

              <p className="text-xs text-center text-outline">
                Mã có hiệu lực trong 10 phút
              </p>

              <button type="submit" disabled={loading || otp.length < 6}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 mt-4">
                {loading
                  ? <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
                  : <span className="icon text-base">verified_user</span>
                }
                {loading ? t('auth.verifying') : t('auth.completeRegistration')}
              </button>

              {/* Resend + back */}
              <div className="flex items-center justify-between pt-2">
                <button type="button"
                  onClick={() => { setStep(1); setErrors({}) }}
                  className="text-xs text-outline hover:text-on-surface flex items-center gap-1">
                  <span className="icon text-sm">arrow_back</span>
                  Đổi email
                </button>
                <button type="button"
                  disabled={countdown > 0 || loading}
                  onClick={handleResend}
                  className="text-xs text-primary hover:underline disabled:text-outline disabled:no-underline">
                  {countdown > 0 ? t('auth.resendIn', { s: countdown }) : t('auth.resendOtp')}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 3: Loading ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-4 py-8">
              <span className="w-12 h-12 border-4 rounded-full animate-spin"
                    style={{ borderColor: 'var(--outline-variant)', borderTopColor: 'var(--primary-500)' }} />
              <p className="text-sm text-outline">Đang tạo tài khoản và thiết lập workspace...</p>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-outline">
            {t('auth.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {modal === 'terms'   && <Modal title={t('auth.termsTitle')}   content={t('auth.termsContent')}   onClose={() => setModal(null)} />}
      {modal === 'privacy' && <Modal title={t('auth.privacyTitle')} content={t('auth.privacyContent')} onClose={() => setModal(null)} />}
    </div>
  )
}
