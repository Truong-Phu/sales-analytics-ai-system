import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'

export default function Header({ onMenuClick }) {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const [lang, setLang] = useState(i18n.language?.startsWith('en') ? 'en' : 'vi')

  const toggleLang = () => {
    const next = lang === 'vi' ? 'en' : 'vi'
    setLang(next)
    i18n.changeLanguage(next)
  }

  return (
    <header className="fixed top-0 left-0 md:left-[240px] right-0 h-16 z-40
                       bg-surface-container-lowest/80 backdrop-blur-md
                       border-b border-outline-variant/10
                       flex items-center px-4 md:px-6 gap-3">
      {/* Hamburger – chỉ hiện trên mobile */}
      <button
        onClick={onMenuClick}
        className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg
                   text-on-surface-variant hover:bg-surface-container transition-colors"
        aria-label="Mở menu"
      >
        <span className="icon">menu</span>
      </button>

      {/* Logo mobile */}
      <div className="md:hidden flex items-center gap-1.5 flex-1">
        <span className="icon icon-fill text-primary text-base">bar_chart</span>
        <span className="text-sm font-headline font-bold text-primary uppercase">
          Sales Analytics
        </span>
      </div>

      {/* Spacer desktop */}
      <div className="hidden md:block flex-1" />

      {/* Right: language toggle + notifications + avatar */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Language toggle */}
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                     bg-surface-container text-sm font-medium text-on-surface-variant
                     hover:bg-surface-container-high transition-colors"
          title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
        >
          <span className="text-base">{lang === 'vi' ? '🇻🇳' : '🇺🇸'}</span>
          <span className="uppercase text-xs font-bold hidden sm:inline">{lang}</span>
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
                        flex items-center justify-center text-surface text-sm font-bold cursor-pointer
                        shrink-0">
          {user?.fullName?.[0] ?? 'U'}
        </div>
      </div>
    </header>
  )
}
