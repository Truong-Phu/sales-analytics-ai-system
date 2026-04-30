import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    username: '', fullName: '', email: '', password: '', confirmPassword: '',
  })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        username: form.username,
        fullName: form.fullName,
        email:    form.email,
        password: form.password,
      })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.message ?? t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8
                        max-w-md w-full text-center">
          <span className="icon text-5xl text-tertiary">check_circle</span>
          <h2 className="font-headline text-xl font-semibold text-on-surface mt-4 mb-2">
            Đăng ký thành công
          </h2>
          <p className="text-outline text-sm mb-6">{t('auth.registerSuccess')}</p>
          <button onClick={() => navigate('/login')} className="btn-primary">
            Về trang đăng nhập
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-gradient-to-br from-primary-container to-primary mb-4 shadow-glow">
            <span className="icon text-surface text-2xl">analytics</span>
          </div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">SalesAnalytics</h1>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8">
          <h2 className="font-headline text-xl font-semibold text-on-surface mb-6">
            {t('auth.register')}
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
              <label className="block text-sm text-outline mb-1.5">{t('auth.username')}</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="nguyenvana"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-outline mb-1.5">{t('auth.fullName')}</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="Nguyễn Văn A"
                value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-outline mb-1.5">{t('auth.email')}</label>
              <input
                type="email"
                required
                className="form-input"
                placeholder="email@company.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-outline mb-1.5">{t('auth.password')}</label>
              <input
                type="password"
                required
                minLength={8}
                className="form-input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-outline mb-1.5">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
                : <span className="icon text-base">person_add</span>
              }
              {t('auth.register')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-outline">
            Đã có tài khoản?{' '}
            <Link to="/login" className="text-primary hover:underline">
              {t('auth.login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
