import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { Link } from 'react-router-dom'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, setLang } = useAuth()
  const [saved, setSaved] = useState(false)

  const handleLangChange = (lang) => {
    i18n.changeLanguage(lang)
    setLang(lang)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-headline text-2xl font-bold text-on-surface">{t('settings.title')}</h1>

      {saved && (
        <div className="px-4 py-3 rounded-xl bg-tertiary/10 border border-tertiary/30
                        text-tertiary text-sm flex items-center gap-2">
          <span className="icon">check_circle</span>
          {t('settings.saveSuccess')}
        </div>
      )}

      {/* Profile */}
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
        <h2 className="font-headline font-semibold text-on-surface mb-4">
          {t('settings.profile')}
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary-container to-primary
                          flex items-center justify-center text-surface font-bold text-xl">
            {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div>
            <p className="font-medium text-on-surface">{user?.name}</p>
            <p className="text-outline text-sm">{user?.email}</p>
            <span className="badge-info text-xs mt-1 inline-block">
              {t(`admin.roles.${user?.role}`, user?.role)}
            </span>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
        <h2 className="font-headline font-semibold text-on-surface mb-4">
          {t('settings.language')}
        </h2>
        <div className="flex gap-3">
          {[
            { code: 'vi', label: t('common.vietnamese'), flag: '🇻🇳' },
            { code: 'en', label: t('common.english'),    flag: '🇬🇧' },
          ].map(lang => (
            <button
              key={lang.code}
              onClick={() => handleLangChange(lang.code)}
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                i18n.language === lang.code
                  ? 'border-primary bg-primary-container/20'
                  : 'border-outline-variant hover:border-outline'
              }`}
            >
              <span className="text-2xl">{lang.flag}</span>
              <span className={`font-medium ${
                i18n.language === lang.code ? 'text-on-surface' : 'text-outline'
              }`}>
                {lang.label}
              </span>
              {i18n.language === lang.code && (
                <span className="icon text-primary ml-auto">check_circle</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
        <h2 className="font-headline font-semibold text-on-surface mb-4">
          {t('settings.security')}
        </h2>
        <Link
          to="/change-password"
          className="flex items-center justify-between p-4 rounded-xl
                     bg-surface-container hover:bg-surface-container-high transition-colors group"
        >
          <div className="flex items-center gap-3">
            <span className="icon text-outline">lock</span>
            <span className="text-on-surface">{t('auth.changePassword')}</span>
          </div>
          <span className="icon text-outline group-hover:text-on-surface transition-colors">
            chevron_right
          </span>
        </Link>
      </div>
    </div>
  )
}
