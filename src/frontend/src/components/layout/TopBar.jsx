import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useTranslation } from 'react-i18next'
import { useCmdK } from '../ui/CommandPalette'
import i18n from '../../i18n'

// ── Logo SVG ──────────────────────────────────────────────────────────────────
function LuminaLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill="url(#logoGrad)"
        opacity="0.15"
      />
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        fill="none"
        stroke="url(#logoGrad)"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="16" r="4" fill="url(#logoGrad)" />
    </svg>
  )
}

// ── Theme Toggle ──────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { isDark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg"
      title={isDark ? 'Chuyển sáng' : 'Chuyển tối'}
      style={{ transition: 'transform 300ms' }}
    >
      <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>
        {isDark ? 'light_mode' : 'dark_mode'}
      </span>
    </button>
  )
}

// ── Language Toggle ────────────────────────────────────────────────────────────
function LangToggle() {
  const [lang, setLang] = useState(() =>
    (i18n.language ?? 'vi').startsWith('en') ? 'en' : 'vi'
  )
  const toggle = () => {
    const next = lang === 'vi' ? 'en' : 'vi'
    setLang(next)
    i18n.changeLanguage(next)
  }
  return (
    <button
      onClick={toggle}
      className="lbtn lbtn-ghost h-8 px-2 gap-1 rounded-lg text-xs font-bold"
      title={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
      style={{ color: 'var(--text-secondary)', minWidth: 40 }}
    >
      <span>{lang === 'vi' ? '🇻🇳' : '🇺🇸'}</span>
      <span className="hidden sm:inline uppercase">{lang}</span>
    </button>
  )
}

// ── User Avatar + Dropdown ────────────────────────────────────────────────────
function UserAvatar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initials = (user?.fullName ?? 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const menuItems = [
    { label: 'Đổi mật khẩu', icon: 'lock', href: '/change-password' },
    { label: 'Cài đặt',      icon: 'settings', href: '/settings' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center
                   text-white text-sm font-bold shrink-0 cursor-pointer"
        style={{ background: 'linear-gradient(135deg, var(--primary-400), var(--accent-500))' }}
      >
        {initials}
      </button>

      {open && (
        <div
          className="lcard scale-in absolute right-0 top-10 w-56 py-2 z-[200]"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          {/* Info */}
          <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {user?.fullName}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {user?.email}
            </p>
          </div>
          {/* Menu items */}
          <div className="py-1">
            {menuItems.map(item => (
              <button
                key={item.href}
                onClick={() => { navigate(item.href); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left
                           transition-colors hover:bg-[--bg-elevated]"
                style={{ color: 'var(--text-primary)' }}
              >
                <span className="icon icon-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </div>
          <div className="border-t py-1" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm
                         transition-colors hover:bg-[--bg-elevated]"
              style={{ color: 'var(--color-error)' }}
            >
              <span className="icon icon-sm">logout</span>
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MegaMenu for "Bán hàng" ───────────────────────────────────────────────────
function MegaMenu({ onClose }) {
  const navigate = useNavigate()
  const items = [
    { label: 'Đơn hàng',     desc: 'Quản lý đơn hàng',    icon: 'receipt_long', href: '/orders' },
    { label: 'Sản phẩm',     desc: 'Quản lý sản phẩm',    icon: 'inventory_2',  href: '/products' },
    { label: 'Khách hàng',   desc: 'Hồ sơ khách hàng',    icon: 'people',       href: '/customers' },
    { label: 'Đồng bộ',      desc: 'Kết nối sàn TMĐT',    icon: 'sync',         href: '/data-sync' },
  ]

  return (
    <div
      className="lcard scale-in absolute top-full left-0 mt-1 w-72 p-3 z-[200]"
      style={{ boxShadow: 'var(--shadow-lg)' }}
    >
      <div className="grid grid-cols-2 gap-1">
        {items.map(item => (
          <button
            key={item.href}
            onClick={() => { navigate(item.href); onClose() }}
            className="flex items-start gap-2 p-3 rounded-lg text-left
                       transition-colors hover:bg-[--bg-elevated] cursor-pointer"
          >
            <span className="icon icon-sm mt-0.5" style={{ color: 'var(--primary-500)' }}>
              {item.icon}
            </span>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {item.label}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {item.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── NavTab ────────────────────────────────────────────────────────────────────
function NavTab({ href, icon, label, hasMega = false }) {
  const [megaOpen, setMegaOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!hasMega) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setMegaOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [hasMega])

  if (hasMega) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setMegaOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     transition-colors hover:bg-[--bg-elevated]"
          style={{ color: megaOpen ? 'var(--primary-500)' : 'var(--text-secondary)' }}
        >
          <span className="icon icon-sm">{icon}</span>
          {label}
          <span className="icon icon-sm text-xs">
            {megaOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {megaOpen && <MegaMenu onClose={() => setMegaOpen(false)} />}
      </div>
    )
  }

  return (
    <NavLink
      to={href}
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
         transition-colors ${isActive
           ? 'bg-[--primary-50] text-[--primary-600] dark:bg-[rgba(99,102,241,0.10)] dark:text-[--primary-400]'
           : 'text-[--text-secondary] hover:bg-[--bg-elevated] hover:text-[--text-primary]'
         }`
      }
      style={({ isActive }) => ({
        backgroundColor: isActive ? 'var(--primary-50)' : undefined,
        color: isActive ? 'var(--primary-600)' : 'var(--text-secondary)',
      })}
    >
      {({ isActive }) => (
        <>
          <span className="icon icon-sm" style={{ color: isActive ? 'var(--primary-500)' : undefined }}>
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────
export default function TopBar() {
  const { open: openCmdK } = useCmdK()
  const { user } = useAuth()
  const { t } = useTranslation()

  const navTabs = [
    { href: '/dashboard',       icon: 'dashboard',    label: 'Dashboard' },
    { href: '/orders',          icon: 'receipt_long', label: 'Bán hàng', hasMega: true },
    { href: '/forecast',        icon: 'trending_up',  label: 'Phân tích AI' },
    { href: '/report',          icon: 'picture_as_pdf', label: 'Báo cáo' },
  ]

  return (
    <header
      className="lcard-glass sticky top-0 z-50 border-b h-14 flex items-center px-6"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* LEFT — Logo */}
      <div className="flex items-center gap-2.5 mr-6">
        <LuminaLogo size={28} />
        <div className="leading-tight">
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            MSAS
          </span>
          <span className="text-xs block leading-none" style={{ color: 'var(--text-tertiary)' }}>
            Multi-channel Sales
          </span>
        </div>
      </div>

      {/* CENTER — Nav tabs (hidden on mobile) */}
      <nav className="hidden md:flex items-center gap-1 flex-1">
        {navTabs.map(tab => (
          <NavTab key={tab.href} {...tab} />
        ))}
        {user?.role === 'Admin' && (
          <NavTab href="/admin" icon="manage_accounts" label="Quản trị" />
        )}
      </nav>

      {/* RIGHT — Actions */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Search button — desktop */}
        <button
          onClick={openCmdK}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                     border transition-colors hover:bg-[--bg-elevated] cursor-pointer"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-tertiary)',
            background: 'var(--bg-surface)',
          }}
        >
          <span className="icon icon-sm">search</span>
          <span>Tìm kiếm</span>
          <kbd
            className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            Ctrl K
          </kbd>
        </button>

        <LangToggle />
        <ThemeToggle />

        {/* Mobile search icon */}
        <button
          onClick={openCmdK}
          className="lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg md:hidden"
        >
          <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>search</span>
        </button>

        <UserAvatar />
      </div>
    </header>
  )
}
