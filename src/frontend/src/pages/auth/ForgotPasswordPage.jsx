import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../hooks/useTheme'
import api from '../../api/axios'

export default function ForgotPasswordPage() {
  const { t }      = useTranslation()
  const { isDark } = useTheme()

  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [devToken, setDevToken] = useState(null)
  const [error,   setError]   = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/auth/forgot-password', { email })
      setSent(true)
      if (res.data?.devToken) setDevToken(res.data.devToken)
    } catch {
      setError(t('auth.forgotError', 'Có lỗi xảy ra. Vui lòng thử lại sau.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'dark' : ''}`}
      style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-sans)' }}
    >
      <div className="w-full max-w-[380px]">
        {/* Back link */}
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm mb-8 hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span className="icon text-base">arrow_back</span>
          {t('auth.backToLogin', 'Quay lại đăng nhập')}
        </Link>

        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('auth.forgotPassword', 'Quên mật khẩu')}
        </h2>
        <p className="text-sm mt-1 mb-8" style={{ color: 'var(--text-tertiary)' }}>
          {t('auth.forgotDesc', 'Nhập email tài khoản — chúng tôi sẽ gửi mã xác nhận 6 chữ số.')}
        </p>

        {sent ? (
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
            >
              <span className="icon text-xl mt-0.5" style={{ color: '#10B981' }}>check_circle</span>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {t('auth.forgotSent', 'Đã gửi hướng dẫn!')}
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('auth.forgotSentDesc', 'Nếu email tồn tại, bạn sẽ nhận được mã xác nhận trong vòng vài phút.')}
                </p>
              </div>
            </div>

            {/* Dev mode: hiển thị token để test */}
            {devToken && (
              <div
                className="p-3 rounded-xl text-sm font-mono"
                style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', color: 'var(--text-secondary)' }}
              >
                <span className="text-xs font-sans font-semibold block mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  DEV MODE — OTP Token:
                </span>
                <span className="text-lg font-bold tracking-widest" style={{ color: 'var(--primary-500)' }}>
                  {devToken}
                </span>
              </div>
            )}

            <Link
              to={`/reset-password?email=${encodeURIComponent(email)}`}
              className="lbtn lbtn-primary w-full justify-center"
              style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span className="icon text-base">lock_reset</span>
              {t('auth.enterToken', 'Nhập mã và đặt mật khẩu mới')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--color-error)' }}
              >
                <span className="icon text-base">error_outline</span>
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Email
              </label>
              <input
                type="email"
                required
                className="linput"
                placeholder="email@congty.vn"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
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
                  {t('common.sending', 'Đang gửi...')}
                </>
              ) : (
                <>
                  <span className="icon text-base">send</span>
                  {t('auth.sendResetLink', 'Gửi mã xác nhận')}
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
