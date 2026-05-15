import { useState, useRef, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useTranslation } from 'react-i18next'
import { useCmdK } from '../ui/CommandPalette'
import i18n from '../../i18n'
import axios from '../../api/axios'

// ── Logo PNG (đồng bộ với mobile app) ─────────────────────────────────────────
function LuminaLogo({ size = 32 }) {
  return (
    <img
      src="/logo.png"
      alt="MSAS"
      width={size}
      height={size}
      style={{ borderRadius: 6, objectFit: 'contain' }}
    />
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

// ── Language Toggle — lưu vào localStorage để giữ sau reload ─────────────────
function LangToggle() {
  const [lang, setLang] = useState(() =>
    (i18n.language ?? 'vi').startsWith('en') ? 'en' : 'vi'
  )
  const toggle = () => {
    const next = lang === 'vi' ? 'en' : 'vi'
    setLang(next)
    i18n.changeLanguage(next)
    localStorage.setItem('lang', next)
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
  const { t } = useTranslation()
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
    { label: t('auth.changePassword'), icon: 'lock',     href: '/change-password' },
    { label: t('nav.settings'),        icon: 'settings', href: '/settings' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center
                   text-white text-sm font-bold shrink-0 cursor-pointer overflow-hidden"
        style={{ background: user?.avatarUrl ? undefined : 'linear-gradient(135deg, var(--primary-400), var(--accent-500))' }}
      >
        {user?.avatarUrl
          ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          : initials
        }
      </button>

      {open && (
        <div
          className="lcard scale-in absolute right-0 top-10 w-56 py-2 z-[200]"
          style={{ boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {user?.fullName}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {user?.email}
            </p>
          </div>
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
              {t('auth.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell() {
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const [open,        setOpen]        = useState(false)
  const [items,       setItems]       = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef(null)

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await axios.get('/api/notifications?limit=5')
      setItems(res.data.data ?? [])
      setUnreadCount(res.data.unreadCount ?? 0)
    } catch { /* silent fail */ }
  }, [])

  // Polling mỗi 30 giây
  useEffect(() => {
    fetchNotifs()
    const id = setInterval(fetchNotifs, 30_000)
    return () => clearInterval(id)
  }, [fetchNotifs])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = async () => {
    try {
      await axios.patch('/api/notifications/read-all')
      setUnreadCount(0)
      setItems(items.map(n => ({ ...n, isRead: true })))
    } catch { /* silent */ }
  }

  const timeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
    if (diff < 60)      return 'Vừa xong'
    if (diff < 3600)    return `${Math.floor(diff / 60)} phút trước`
    if (diff < 86400)   return `${Math.floor(diff / 3600)} giờ trước`
    return `${Math.floor(diff / 86400)} ngày trước`
  }

  const typeIcon = { info: 'info', warning: 'warning', error: 'error', success: 'check_circle' }
  const typeColor = { info: 'var(--primary-500)', warning: '#F59E0B', error: '#EF4444', success: '#10B981' }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifs() }}
        className="relative lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg"
        title="Thông báo"
      >
        <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>notifications</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: '#EF4444', minWidth: 16 }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="lcard scale-in absolute right-0 top-10 w-80 z-[200]"
             style={{ boxShadow: 'var(--shadow-lg)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b"
               style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('notifications.title')}
              </span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                      style={{ background: '#EF4444' }}>
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--primary-500)' }}>
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Items */}
          <div className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                <span className="icon" style={{ fontSize: 32, opacity: 0.3 }}>notifications_none</span>
                <p className="text-xs">{t('notifications.empty')}</p>
              </div>
            ) : items.map(n => (
              <div key={n.id}
                   className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                   style={{ background: n.isRead ? 'transparent' : 'var(--primary-50, rgba(99,102,241,0.05))' }}
                   onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                   onMouseLeave={e => e.currentTarget.style.background = n.isRead ? 'transparent' : 'var(--primary-50, rgba(99,102,241,0.05))'}
                   onClick={() => { navigate('/notifications'); setOpen(false) }}>
                <span className="icon text-base shrink-0 mt-0.5"
                      style={{ color: typeColor[n.type] ?? 'var(--text-secondary)' }}>
                  {typeIcon[n.type] ?? 'info'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {n.body}
                    </p>
                  )}
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    {timeAgo(n.createdAt)}
                  </p>
                </div>
                {!n.isRead && (
                  <span className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                        style={{ background: 'var(--primary-500)' }} />
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t py-2 px-4" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => { navigate('/notifications'); setOpen(false) }}
              className="text-xs w-full text-center hover:underline"
              style={{ color: 'var(--primary-500)' }}>
              {t('notifications.viewAll')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MegaMenu chung — dùng cho cả "Bán hàng" và "Phân tích AI" ────────────────
function MegaMenu({ items, onClose }) {
  const navigate = useNavigate()

  return (
    <div
      className="lcard scale-in absolute top-full left-0 mt-1 w-64 p-3 z-[200]"
      style={{ boxShadow: 'var(--shadow-lg)' }}
    >
      <div className="flex flex-col gap-0.5">
        {items.map(item => (
          <button
            key={item.href}
            onClick={() => { navigate(item.href); onClose() }}
            className="flex items-start gap-2 p-2.5 rounded-lg text-left
                       transition-colors hover:bg-[--bg-elevated] cursor-pointer"
          >
            <span className="icon icon-sm mt-0.5 shrink-0" style={{ color: 'var(--primary-500)' }}>
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
function NavTab({ href, icon, label, hasMega = false, menuItems = [] }) {
  const [megaOpen, setMegaOpen] = useState(false)
  const { pathname } = useLocation()
  const ref = useRef(null)

  useEffect(() => {
    if (!hasMega) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setMegaOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [hasMega])

  if (hasMega) {
    const isChildActive = menuItems.some(item => pathname.startsWith(item.href))
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setMegaOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     transition-colors hover:bg-[--bg-elevated]"
          style={{ color: megaOpen || isChildActive ? 'var(--primary-500)' : 'var(--text-secondary)' }}
        >
          <span className="icon icon-sm">{icon}</span>
          {/* Label ẩn trên < lg, chỉ hiện icon */}
          <span className="hidden lg:inline">{label}</span>
          <span className="icon icon-sm text-xs hidden lg:inline">
            {megaOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {megaOpen && <MegaMenu items={menuItems} onClose={() => setMegaOpen(false)} />}
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
          {/* Label ẩn trên < lg, chỉ hiện icon */}
          <span className="hidden lg:inline">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── MobileMenu — dropdown khi nhấn hamburger trên < md ───────────────────────
function MobileMenu({ navTabs, showDataSync, showAdmin, onClose }) {
  const navigate  = useNavigate()
  const { t }     = useTranslation()

  // Flatten tất cả nav items (kể cả mega-menu children)
  const allItems = navTabs.flatMap(tab => {
    if (tab.hasMega) {
      return [
        { href: tab.href, icon: tab.icon, label: tab.label, isHeader: true },
        ...(tab.menuItems || []).map(item => ({ ...item, isChild: true })),
      ]
    }
    return [{ href: tab.href, icon: tab.icon, label: tab.label }]
  })

  if (showDataSync) allItems.push({ href: '/data-sync', icon: 'sync', label: t('nav.dataSync') })
  if (showAdmin)    allItems.push({ href: '/admin',     icon: 'manage_accounts', label: t('nav.admin') })

  return (
    <>
      {/* Overlay để đóng menu khi click ngoài */}
      <div
        className="fixed inset-0 z-[149]"
        onClick={onClose}
      />
      {/* Dropdown menu */}
      <div
        className="lcard scale-in absolute top-full left-0 right-0 mt-1 mx-3 p-3 z-[150] flex flex-col gap-0.5"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        {allItems.map((item, idx) => (
          <button
            key={idx}
            onClick={() => { navigate(item.href); onClose() }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                       transition-colors hover:bg-[--bg-elevated]"
            style={{ paddingLeft: item.isChild ? 32 : 12 }}
          >
            <span className="icon icon-sm shrink-0" style={{ color: 'var(--primary-500)' }}>
              {item.icon}
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)', opacity: item.isChild ? 0.8 : 1 }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────
export default function TopBar() {
  const { open: openCmdK }  = useCmdK()
  const { user }            = useAuth()
  const { t }               = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const salesMenuItems = [
    { label: t('nav.orders'),     desc: t('nav.ordersDesc',     'Xem và quản lý đơn hàng'),     icon: 'receipt_long', href: '/orders' },
    { label: t('nav.products'),   desc: t('nav.productsDesc',   'Quản lý kho sản phẩm'),         icon: 'inventory_2',  href: '/products' },
    { label: t('nav.categories'), desc: t('nav.categoriesDesc', 'Phân loại sản phẩm'),           icon: 'category',     href: '/categories' },
    { label: t('nav.customers'),  desc: t('nav.customersDesc',  'Thông tin khách hàng'),          icon: 'people',       href: '/customers' },
  ]

  const aiMenuItems = [
    { label: t('nav.forecast',        'Dự báo doanh thu'),     desc: 'Prophet AI – xu hướng và seasonality', icon: 'trending_up',  href: '/forecast' },
    { label: t('nav.anomaly',         'Phát hiện bất thường'), desc: 'Cảnh báo dữ liệu bất thường',          icon: 'crisis_alert', href: '/anomaly' },
    { label: t('nav.recommendations', 'Gợi ý thông minh'),     desc: 'Hỏi AI & Insights tự động',            icon: 'psychology',   href: '/recommendations' },
  ]

  const navTabs = [
    { href: '/dashboard', icon: 'dashboard',      label: t('nav.dashboard') },
    { href: '/orders',    icon: 'receipt_long',   label: t('nav.sales'),  hasMega: true, menuItems: salesMenuItems },
    { href: '/forecast',  icon: 'auto_awesome',   label: t('nav.ai'),     hasMega: true, menuItems: aiMenuItems },
    { href: '/report',    icon: 'picture_as_pdf', label: t('nav.report') },
  ]

  const showDataSync = ['DataIT', 'Owner'].includes(user?.role)
  const showAdmin    = user?.role === 'Owner'

  return (
    <header
      className="lcard-glass sticky top-0 z-50 border-b h-14 flex items-center px-4 md:px-6 relative"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* LEFT — Logo (luôn hiển thị) */}
      <div className="flex items-center gap-2.5 mr-4 md:mr-6 shrink-0">
        <LuminaLogo size={28} />
        <div className="leading-tight">
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            MSAS
          </span>
          <span className="text-xs block leading-none" style={{ color: 'var(--text-tertiary)' }}>
            Bán hàng đa kênh
          </span>
        </div>
      </div>

      {/* CENTER — Nav tabs: ẩn hoàn toàn < md, icon-only < lg */}
      <nav className="hidden md:flex items-center gap-1 flex-1">
        {navTabs.map(tab => (
          <NavTab key={tab.href} {...tab} />
        ))}
        {showDataSync && (
          <NavTab href="/data-sync" icon="sync" label={t('nav.dataSync')} />
        )}
        {showAdmin && (
          <NavTab href="/admin" icon="manage_accounts" label={t('nav.admin')} />
        )}
      </nav>

      {/* RIGHT — Actions (luôn hiển thị) */}
      <div className="flex items-center gap-1.5 ml-auto">
        {/* Search button — chỉ desktop (md+) */}
        <button
          onClick={openCmdK}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                     border transition-colors hover:bg-[--bg-elevated] cursor-pointer"
          style={{
            borderColor: 'var(--border)',
            color:       'var(--text-tertiary)',
            background:  'var(--bg-surface)',
          }}
        >
          <span className="icon icon-sm">search</span>
          <span className="hidden lg:inline">{t('common.search')}</span>
          <kbd
            className="ml-2 text-[10px] px-1.5 py-0.5 rounded hidden lg:inline"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Mobile search icon */}
        <button
          onClick={openCmdK}
          className="lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg md:hidden"
        >
          <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>search</span>
        </button>

        <NotificationBell />
        <LangToggle />
        <ThemeToggle />
        <UserAvatar />

        {/* Hamburger — chỉ < md */}
        <button
          onClick={() => setMobileMenuOpen(o => !o)}
          className="lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg md:hidden"
          title="Menu"
        >
          <span className="icon text-base" style={{ color: 'var(--text-secondary)' }}>
            {mobileMenuOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <MobileMenu
          navTabs={navTabs}
          showDataSync={showDataSync}
          showAdmin={showAdmin}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  )
}
