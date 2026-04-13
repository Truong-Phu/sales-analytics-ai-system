import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'

export default function Header({ title, children }) {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [lang, setLang] = useState(i18n.language?.startsWith('en') ? 'en' : 'vi')

  const toggleLang = () => {
    const next = lang === 'vi' ? 'en' : 'vi'
    setLang(next)
    i18n.changeLanguage(next)
  }

  return (
    <header className="fixed top-0 left-[240px] right-0 h-16 z-40
                       bg-surface-container-lowest/80 backdrop-blur-md
                       border-b border-outline-variant/10
                       flex items-center px-6 gap-4">
      {/* Left: title + children (date picker, filters, etc.) */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {title && <h1 className="page-title shrink-0">{title}</h1>}
        {children}
      </div>

      {/* Right: language + notifications + avatar */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Language toggle */}
        <button onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-surface-container text-sm font-medium text-on-surface-variant
                     hover:bg-surface-container-high transition-colors">
          <span>{lang === 'vi' ? '🇻🇳' : '🇺🇸'}</span>
          <span className="uppercase text-xs font-bold">{lang}</span>
        </button>

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-lg bg-surface-container
                           flex items-center justify-center text-on-surface-variant
                           hover:bg-surface-container-high transition-colors">
          <span className="icon">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-container to-primary
                        flex items-center justify-center text-surface text-sm font-bold cursor-pointer">
          {user?.fullName?.[0] ?? 'U'}
        </div>
      </div>
    </header>
  )
}
