import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'

export default function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (form.newPassword !== form.confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword:     form.newPassword,
      })
      setSuccess(true)
      setTimeout(() => navigate('/settings'), 2000)
    } catch (err) {
      setError(err.response?.data?.message ?? t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-headline text-2xl font-bold text-on-surface mb-6">
        {t('auth.changePassword')}
      </h1>

      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-8">
        {success && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-tertiary/10 border border-tertiary/30
                          text-tertiary text-sm flex items-center gap-2">
            <span className="icon text-base">check_circle</span>
            {t('auth.changePasswordSuccess')}
          </div>
        )}

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-error/10 border border-error/30
                          text-error text-sm flex items-center gap-2">
            <span className="icon text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-outline mb-1.5">{t('auth.currentPassword')}</label>
            <input
              type="password"
              required
              className="form-input"
              placeholder="••••••••"
              value={form.currentPassword}
              onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm text-outline mb-1.5">{t('auth.newPassword')}</label>
            <input
              type="password"
              required
              minLength={8}
              className="form-input"
              placeholder="••••••••"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
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

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary flex-1"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
                : <span className="icon text-base">lock_reset</span>
              }
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
