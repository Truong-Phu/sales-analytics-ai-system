import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'

// ── Logo SVG ──────────────────────────────────────────────────────────────────
function LuminaLogoSm({ size = 28, white = false }) {
  const stroke = white ? 'white' : 'url(#lgSmGrad)'
  const fill   = white ? 'rgba(255,255,255,0.15)' : 'url(#lgSmGrad)'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="lgSmGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill={fill} opacity="0.9" />
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="none" stroke={stroke} strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4" fill={stroke === 'white' ? 'white' : 'url(#lgSmGrad)'} />
    </svg>
  )
}

// ── Mesh gradient background blob ─────────────────────────────────────────────
function MeshBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
          animation: 'slow-drift 8s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute -bottom-1/4 -right-1/4 w-2/3 h-2/3 rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 70%)',
          animation: 'slow-drift 10s ease-in-out infinite alternate-reverse',
        }}
      />
      <style>{`
        @keyframes slow-drift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(30px, 20px) scale(1.08); }
        }
      `}</style>
    </div>
  )
}

export default function LoginPage() {
  const { t }      = useTranslation()
  const { login }  = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [form,    setForm]    = useState({ username: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname ?? '/dashboard'

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate(from, { replace: true })
    } catch (err) {
      const msg = err.response?.data?.message
      setError(
        msg === 'PENDING_APPROVAL'
          ? t('auth.pendingApproval')
          : t('auth.loginFailed')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`min-h-screen flex ${isDark ? 'dark' : ''}`}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* ── LEFT PANEL (desktop only) ── */}
      <div
        className="hidden md:flex flex-col items-center justify-center flex-none
                   relative overflow-hidden"
        style={{
          width: '55%',
          background: 'linear-gradient(135deg, #4338CA 0%, #6366F1 50%, #10B981 100%)',
        }}
      >
        <MeshBg />

        <div className="relative z-10 text-center px-12 max-w-md">
          <LuminaLogoSm size={64} white />
          <h1 className="text-white text-3xl font-bold mt-4">MSAS Analytics</h1>
          <p className="text-white/75 text-base mt-2">
            Phân tích dữ liệu bán hàng thông minh
          </p>

          <div className="mt-8 flex flex-col gap-3">
            {[
              'Dự báo AI với Prophet',
              'Đa kênh: Shopee, Lazada, TikTok...',
              'Báo cáo chuyên nghiệp PDF',
            ].map(f => (
              <div key={f} className="flex items-center gap-2.5 text-white/85 text-sm">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.2)' }}
                >
                  <span className="icon" style={{ fontSize: 14, color: 'white' }}>check</span>
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div
        className="flex-1 flex items-center justify-center p-8 relative"
        style={{ background: 'var(--bg-base)' }}
      >
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center
                     rounded-xl border transition-colors hover:bg-[--bg-elevated]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>
            {isDark ? 'light_mode' : 'dark_mode'}
          </span>
        </button>

        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <LuminaLogoSm size={28} />
            <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              MSAS Analytics
            </span>
          </div>

          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('auth.login')}
          </h2>
          <p className="text-sm mt-1 mb-8" style={{ color: 'var(--text-tertiary)' }}>
            Chào mừng trở lại
          </p>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 mb-5 px-4 py-3 rounded-xl text-sm fade-in"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: 'var(--color-error)',
              }}
            >
              <span className="icon text-base">error_outline</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email / Username */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('auth.username')}
              </label>
              <input
                type="text"
                required
                className="linput"
                placeholder="admin"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  className="linput !pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span className="icon icon-sm">{showPwd ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="lbtn lbtn-primary w-full justify-center"
              style={{ height: 44, marginTop: 8 }}
            >
              {loading ? (
                <>
                  <span
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    style={{ animation: 'spin 0.7s linear infinite' }}
                  />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  <span className="icon text-base">login</span>
                  {t('auth.login')}
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {t('auth.noAccount')}{' '}
            <Link
              to="/register"
              className="font-medium hover:underline"
              style={{ color: 'var(--primary-500)' }}
            >
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
