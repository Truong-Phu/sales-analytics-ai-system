import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../hooks/useTheme'
import api from '../../api/axios'

export default function ResetPasswordPage() {
  const { t }      = useTranslation()
  const { isDark } = useTheme()
  const navigate   = useNavigate()
  const [params]   = useSearchParams()

  const [form, setForm] = useState({
    email:           params.get('email') ?? '',
    token:           '',
    newPassword:     '',
    confirmPassword: '',
  })
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (form.newPassword !== form.confirmPassword) {
      setError(t('auth.passwordMismatch', 'Mật khẩu xác nhận không khớp.'))
      return
    }
    if (form.newPassword.length < 8) {
      setError(t('auth.passwordTooShort', 'Mật khẩu phải có ít nhất 8 ký tự.'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        email:           form.email,
        token:           form.token,
        newPassword:     form.newPassword,
        confirmPassword: form.confirmPassword,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(err.response?.data?.message ?? t('auth.resetFailed', 'Token không hợp lệ hoặc đã hết hạn.'))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'dark' : ''}`}
        style={{ background: 'var(--bg-base)' }}
      >
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(16,185,129,0.12)' }}
          >
            <span className="icon text-3xl" style={{ color: '#10B981' }}>check_circle</span>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('auth.resetSuccess', 'Đặt lại mật khẩu thành công!')}
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {t('auth.resetSuccessDesc', 'Đang chuyển hướng đến trang đăng nhập...')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'dark' : ''}`}
      style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-sans)' }}
    >
      <div className="w-full max-w-[380px]">
        <Link
          to="/forgot-password"
          className="inline-flex items-center gap-1.5 text-sm mb-8 hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span className="icon text-base">arrow_back</span>
          {t('auth.backToForgot', 'Quay lại')}
        </Link>

        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('auth.resetPassword', 'Đặt mật khẩu mới')}
        </h2>
        <p className="text-sm mt-1 mb-8" style={{ color: 'var(--text-tertiary)' }}>
          {t('auth.resetDesc', 'Nhập mã 6 chữ số bạn nhận được qua email và mật khẩu mới.')}
        </p>

        {error && (
          <div
            className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--color-error)' }}
          >
            <span className="icon text-base">error_outline</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email (pre-filled from query param, editable) */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              type="email"
              required
              className="linput"
              value={form.email}
              onChange={set('email')}
            />
          </div>

          {/* OTP Token */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {t('auth.otpCode', 'Mã xác nhận (6 chữ số)')}
            </label>
            <input
              type="text"
              required
              maxLength={6}
              inputMode="numeric"
              className="linput tracking-widest text-center text-xl font-bold"
              placeholder="_ _ _ _ _ _"
              value={form.token}
              onChange={set('token')}
            />
          </div>

          {/* New password */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {t('auth.newPassword', 'Mật khẩu mới')}
            </label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                required
                minLength={8}
                className="linput !pr-10"
                placeholder="Tối thiểu 8 ký tự"
                value={form.newPassword}
                onChange={set('newPassword')}
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

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {t('auth.confirmPassword', 'Xác nhận mật khẩu mới')}
            </label>
            <input
              type={showPwd ? 'text' : 'password'}
              required
              className="linput"
              placeholder="Nhập lại mật khẩu"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="lbtn lbtn-primary w-full justify-center"
            style={{ height: 44 }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
                {t('common.saving', 'Đang lưu...')}
              </>
            ) : (
              <>
                <span className="icon text-base">lock_reset</span>
                {t('auth.setNewPassword', 'Đặt mật khẩu mới')}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
