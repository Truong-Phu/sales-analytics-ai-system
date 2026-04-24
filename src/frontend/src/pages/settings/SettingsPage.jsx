import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'

const NAV = [
  { key: 'profile',  icon: 'person',        label: 'Tài khoản' },
  { key: 'language', icon: 'translate',      label: 'Ngôn ngữ' },
  { key: 'theme',    icon: 'palette',        label: 'Giao diện' },
  { key: 'security', icon: 'lock',           label: 'Bảo mật' },
]

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, setLang } = useAuth()
  const { isDark, toggle } = useTheme()
  const [section, setSection] = useState('profile')
  const [saved,   setSaved]   = useState(false)

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2500) }

  const handleLangChange = lang => {
    i18n.changeLanguage(lang)
    setLang(lang)
    flash()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('settings.title')}</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Left nav */}
        <div className="w-full md:w-52 shrink-0">
          <div className="lcard p-2 space-y-0.5">
            {NAV.map(item => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                style={{
                  background: section === item.key ? 'var(--primary-50, rgba(99,102,241,0.08))' : 'transparent',
                  color: section === item.key ? 'var(--primary-500)' : 'var(--text-secondary)',
                }}
                onMouseEnter={e => { if (section !== item.key) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                onMouseLeave={e => { if (section !== item.key) e.currentTarget.style.background = 'transparent' }}
              >
                <span className="icon" style={{ fontSize: 20 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {saved && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
                 style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--accent-500)' }}>
              <span className="icon" style={{ fontSize: 18 }}>check_circle</span>
              {t('settings.saveSuccess')}
            </div>
          )}

          {section === 'profile' && (
            <div className="lcard p-5 space-y-5">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.profile')}</h2>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0"
                     style={{ background: 'linear-gradient(135deg, var(--primary-500) 0%, var(--accent-500) 100%)' }}>
                  {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
                </div>
                <div>
                  <div className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{user?.name}</div>
                  <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{user?.email}</div>
                  <span className="lbadge lbadge-primary text-xs mt-1 inline-block">
                    {t(`admin.roles.${user?.role}`, user?.role)}
                  </span>
                </div>
              </div>
              <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                {[
                  { label: 'Họ tên',     value: user?.name },
                  { label: 'Email',      value: user?.email },
                  { label: 'Vai trò',    value: t(`admin.roles.${user?.role}`, user?.role) },
                ].map(row => (
                  <div key={row.label} className="flex justify-between gap-4 py-2"
                       style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{row.label}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'language' && (
            <div className="lcard p-5 space-y-4">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.language')}</h2>
              <div className="flex flex-col gap-3">
                {[
                  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', sub: 'Vietnamese' },
                  { code: 'en', label: 'English',    flag: '🇬🇧', sub: 'Tiếng Anh' },
                ].map(lang => {
                  const active = i18n.language === lang.code
                  return (
                    <button
                      key={lang.code}
                      onClick={() => handleLangChange(lang.code)}
                      className="flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left"
                      style={{
                        borderColor: active ? 'var(--primary-500)' : 'var(--border)',
                        background: active ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'var(--bg-elevated)',
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{lang.flag}</span>
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{lang.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{lang.sub}</div>
                      </div>
                      {active && <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>check_circle</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {section === 'theme' && (
            <div className="lcard p-5 space-y-4">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Giao diện</h2>
              <div className="flex flex-col gap-3">
                {[
                  { dark: false, label: 'Sáng (Light)', icon: 'light_mode', sub: 'Nền trắng, thích hợp ban ngày' },
                  { dark: true,  label: 'Tối (Dark)',   icon: 'dark_mode',  sub: 'Nền tối, thích hợp ban đêm' },
                ].map(opt => {
                  const active = isDark === opt.dark
                  return (
                    <button
                      key={String(opt.dark)}
                      onClick={() => { if (!active) toggle() }}
                      className="flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left"
                      style={{
                        borderColor: active ? 'var(--primary-500)' : 'var(--border)',
                        background: active ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'var(--bg-elevated)',
                      }}
                    >
                      <span className="icon w-10 h-10 flex items-center justify-center rounded-xl"
                            style={{ fontSize: 22, background: 'var(--bg-surface)', color: active ? 'var(--primary-500)' : 'var(--text-secondary)' }}>
                        {opt.icon}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{opt.sub}</div>
                      </div>
                      {active && <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>check_circle</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {section === 'security' && (
            <div className="lcard p-5 space-y-4">
              <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{t('settings.security')}</h2>
              <Link
                to="/change-password"
                className="flex items-center justify-between p-4 rounded-xl transition-all"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-500)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div className="flex items-center gap-3">
                  <span className="icon w-9 h-9 flex items-center justify-center rounded-xl"
                        style={{ fontSize: 20, background: 'rgba(99,102,241,0.10)', color: 'var(--primary-500)' }}>
                    lock
                  </span>
                  <div>
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {t('auth.changePassword')}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Thay đổi mật khẩu đăng nhập</div>
                  </div>
                </div>
                <span className="icon" style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>chevron_right</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
