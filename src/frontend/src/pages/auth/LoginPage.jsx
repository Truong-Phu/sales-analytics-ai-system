import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'

export default function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm]       = useState({ email: '', password: '' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname ?? '/dashboard'

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
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
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-tertiary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo & title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-gradient-to-br from-primary-container to-primary mb-4 shadow-glow">
            <span className="icon text-surface text-2xl">analytics</span>
          </div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">SalesAnalytics</h1>
          <p className="text-outline text-sm mt-1">Hệ thống phân tích bán hàng đa kênh</p>
        </div>

        {/* Card */}
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8">
          <h2 className="font-headline text-xl font-semibold text-on-surface mb-6">
            {t('auth.login')}
          </h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-error/10 border border-error/30
                            text-error text-sm flex items-center gap-2">
              <span className="icon text-base">error_outline</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-outline mb-1.5">{t('auth.email')}</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="admin@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-outline mb-1.5">{t('auth.password')}</label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-surface/30 border-t-surface
                                   rounded-full animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <span className="icon text-base">login</span>
                  {t('auth.login')}
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-outline">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-primary hover:underline">
              {t('auth.register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
