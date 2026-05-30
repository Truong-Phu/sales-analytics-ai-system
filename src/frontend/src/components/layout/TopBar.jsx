import { useState, useRef, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useTranslation } from 'react-i18next'
import { useCmdK } from '../ui/CommandPalette'
import i18n from '../../i18n'
import axios from '../../api/axios'

// ── Logo ───────────────────────────────────────────────────────────────────────
function LuminaLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="msas-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#msas-grad)" />
      {/* Bar chart ascending */}
      <rect x="6"  y="20" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.7" />
      <rect x="13" y="14" width="5" height="13" rx="1.5" fill="white" fillOpacity="0.85" />
      <rect x="20" y="8"  width="5" height="19" rx="1.5" fill="white" />
      {/* Trend arrow */}
      <path d="M20 9 L25 6 L25 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
    </svg>
  )
}

// ── Theme Toggle ───────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { isDark, toggle } = useTheme()
  const { t } = useTranslation()
  return (
    <button
      onClick={toggle}
      className="lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg"
      title={isDark ? t('settings.switchLight', 'Chuyển sáng') : t('settings.switchDark', 'Chuyển tối')}
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

// ── User Avatar + Dropdown ─────────────────────────────────────────────────────
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
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user?.fullName}</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</p>
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
                <span className="icon icon-sm" style={{ color: 'var(--text-tertiary)' }}>{item.icon}</span>
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

// ── Notification Bell ──────────────────────────────────────────────────────────
function NotificationBell() {
  const { t }    = useTranslation()
  const navigate = useNavigate()
  const [open,        setOpen]        = useState(false)
  const [items,       setItems]       = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef(null)

  const fetchedRef = useRef(false)

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await axios.get('/api/notifications?limit=5')
      setItems(res.data.data ?? [])
      setUnreadCount(res.data.unreadCount ?? 0)
    } catch { /* silent fail */ }
  }, [])

  useEffect(() => {
    // chặn StrictMode double-invoke: chỉ fetch ngay lần đầu tiên
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchNotifs()
    }
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
    if (diff < 60)    return t('notifications.timeJustNow', 'Vừa xong')
    if (diff < 3600)  return t('notifications.timeMinutes', '{{n}} phút trước', { n: Math.floor(diff / 60) })
    if (diff < 86400) return t('notifications.timeHours',   '{{n}} giờ trước',  { n: Math.floor(diff / 3600) })
    return t('notifications.timeDays', '{{n}} ngày trước', { n: Math.floor(diff / 86400) })
  }

  const typeIcon  = { info: 'info', warning: 'warning', error: 'error', success: 'check_circle' }
  const typeColor = { info: 'var(--primary-500)', warning: '#F59E0B', error: '#EF4444', success: '#10B981' }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifs() }}
        className="relative lbtn lbtn-ghost w-8 h-8 p-0 justify-center rounded-lg"
        title={t('notifications.title')}
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
              <button onClick={markAllRead} className="text-xs hover:underline"
                      style={{ color: 'var(--primary-500)' }}>
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

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
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                  {n.body && (
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>
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

// ── MegaMenu — hỗ trợ 1 hoặc 2 cột ──────────────────────────────────────────
function MegaMenu({ items, onClose, columns = 1 }) {
  const navigate = useNavigate()

  return (
    <div
      className="lcard scale-in absolute top-full left-0 mt-1 p-3 z-[200]"
      style={{
        boxShadow: 'var(--shadow-lg)',
        width: columns === 2 ? 540 : 272,
        maxHeight: '75vh',
        overflowY: 'auto',
      }}
    >
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
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
            <div className="min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {item.label}
              </div>
              <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                {item.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── NavTab ─────────────────────────────────────────────────────────────────────
function NavTab({ href, icon, label, hasMega = false, menuItems = [], columns = 1 }) {
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
    const isChildActive = menuItems.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setMegaOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                     transition-colors hover:bg-[--bg-elevated]"
          style={{ color: megaOpen || isChildActive ? 'var(--primary-500)' : 'var(--text-secondary)' }}
        >
          <span className="icon icon-sm">{icon}</span>
          <span className="hidden lg:inline">{label}</span>
          <span className="icon text-xs hidden lg:inline">
            {megaOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        {megaOpen && (
          <MegaMenu items={menuItems} onClose={() => setMegaOpen(false)} columns={columns} />
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={href}
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
         ${isActive
           ? 'text-[--primary-600] dark:text-[--primary-400]'
           : 'text-[--text-secondary] hover:bg-[--bg-elevated] hover:text-[--text-primary]'
         }`
      }
      style={({ isActive }) => ({
        backgroundColor: isActive ? 'var(--primary-50)' : undefined,
        color: isActive ? 'var(--primary-600)' : undefined,
      })}
    >
      {({ isActive }) => (
        <>
          <span className="icon icon-sm" style={{ color: isActive ? 'var(--primary-500)' : undefined }}>
            {icon}
          </span>
          <span className="hidden lg:inline">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── MobileMenu — toàn bộ nav dạng accordion cho < md ─────────────────────────
function MobileMenu({ navTabs, onClose }) {
  const navigate = useNavigate()
  const [openGroup, setOpenGroup] = useState(null)

  return (
    <>
      <div className="fixed inset-0 z-[149]" onClick={onClose} />
      <div
        className="lcard scale-in absolute top-full left-0 right-0 mt-1 mx-3 z-[150] overflow-y-auto"
        style={{ boxShadow: 'var(--shadow-lg)', maxHeight: '80vh' }}
      >
        {navTabs.map((tab, idx) => {
          if (!tab.hasMega) {
            return (
              <button
                key={tab.href}
                onClick={() => { navigate(tab.href); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left
                           transition-colors hover:bg-[--bg-elevated] border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="icon icon-sm shrink-0" style={{ color: 'var(--primary-500)' }}>{tab.icon}</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{tab.label}</span>
              </button>
            )
          }

          const isOpen = openGroup === idx
          return (
            <div key={tab.href} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setOpenGroup(isOpen ? null : idx)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left
                           transition-colors hover:bg-[--bg-elevated]"
              >
                <span className="icon icon-sm shrink-0" style={{ color: 'var(--primary-500)' }}>{tab.icon}</span>
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{tab.label}</span>
                <span className="icon icon-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {isOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {isOpen && (
                <div className="pb-2">
                  {tab.menuItems.map(item => (
                    <button
                      key={item.href}
                      onClick={() => { navigate(item.href); onClose() }}
                      className="w-full flex items-center gap-3 pl-10 pr-4 py-2.5 text-left
                                 transition-colors hover:bg-[--bg-elevated]"
                    >
                      <span className="icon icon-sm shrink-0" style={{ color: 'var(--primary-400)' }}>{item.icon}</span>
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── TopBar ─────────────────────────────────────────────────────────────────────
export default function TopBar() {
  const { open: openCmdK } = useCmdK()
  const { user }           = useAuth()
  const { t }              = useTranslation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Chuẩn hóa role để tránh lỗi casing (ví dụ "owner" vs "Owner")
  const role             = user?.role ? user.role.trim().charAt(0).toUpperCase() + user.role.trim().slice(1) : ''
  const canSeeAI         = ['Owner', 'Manager', 'DataIT'].includes(role)
  const canSeeSales      = ['Owner', 'Manager', 'Staff'].includes(role)
  const canSeeOperations = ['DataIT', 'Owner'].includes(role)
  const canSeeAdmin      = role === 'Owner'

  // ── Nhóm Bán hàng: POS (canSeeSales) + CRUD + Khách hàng (canSeeAI) ────────
  const salesMenuItems = [
    ...(canSeeSales ? [
      { label: t('nav.pos',        'Bán hàng (POS)'),  desc: 'Bán hàng trực tiếp tại quầy',     icon: 'point_of_sale', href: '/pos' },
    ] : []),
    { label: t('nav.orders',     'Đơn hàng'),          desc: 'Xem và quản lý đơn hàng',          icon: 'receipt_long',  href: '/orders' },
    { label: t('nav.products',   'Sản phẩm'),          desc: 'Quản lý kho sản phẩm',              icon: 'inventory_2',   href: '/products' },
    { label: t('nav.categories', 'Danh mục'),          desc: 'Phân loại sản phẩm',                icon: 'category',      href: '/categories' },
    ...(canSeeAI ? [
      { label: t('nav.customers',   'Khách hàng'),     desc: 'Thông tin & phân tích khách hàng',  icon: 'people',        href: '/customers' },
      { label: t('nav.rfmAnalysis', 'Phân tích RFM'),  desc: 'Phân khúc khách hàng RFM',          icon: 'pie_chart',     href: '/customers/rfm' },
    ] : []),
  ]

  // ── Nhóm Tồn kho & Mua hàng ──────────────────────────────────────────────
  const invMenuItems = [
    { label: t('nav.invDashboard',   'Dashboard Tồn kho'),  desc: 'KPI, biến động kho, gợi ý nhập hàng',   icon: 'bar_chart',     href: '/inventory/dashboard' },
    { label: t('nav.inventory',      'Thông minh Tồn kho'), desc: 'Dự báo hết hàng & đặt thêm (AI)',        icon: 'inventory',     href: '/inventory' },
    { label: t('nav.invTransactions','Lịch sử giao dịch'),  desc: 'Nhật ký nhập/xuất/chỉnh kho',            icon: 'history',       href: '/inventory/transactions' },
    { label: t('nav.stockAdjust',    'Chỉnh kho thủ công'), desc: 'Kiểm kê thực tế, điều chỉnh sai lệch',  icon: 'tune',          href: '/stock-adjustments' },
    { label: t('nav.suppliers',      'Nhà cung cấp'),       desc: 'Danh sách & thông tin liên hệ NCC',      icon: 'business',      href: '/suppliers' },
    { label: t('nav.purchaseOrders', 'Phiếu đặt hàng'),     desc: 'Tạo và theo dõi đơn đặt hàng NCC',      icon: 'shopping_cart', href: '/purchase-orders' },
    { label: t('nav.goodsReceipts',  'Phiếu nhập kho'),     desc: 'Xác nhận hàng về & cập nhật tồn kho',   icon: 'move_to_inbox', href: '/goods-receipts' },
    { label: t('nav.supplier',       'Hiệu suất NCC (AI)'), desc: 'Phân tích & đánh giá nhà cung cấp',     icon: 'local_shipping',href: '/supplier' },
  ]

  // ── Nhóm Phân tích: AI + Tài chính + Báo cáo ─────────────────────────────
  const analysisMenuItems = [
    { label: t('nav.forecast',        'Dự báo doanh thu'),     desc: 'Prophet AI – xu hướng & seasonality',     icon: 'trending_up',            href: '/forecast' },
    { label: t('nav.anomaly',         'Phát hiện bất thường'), desc: 'Cảnh báo dữ liệu bất thường',             icon: 'crisis_alert',           href: '/anomaly' },
    { label: t('nav.narrative',       'Nhận xét Thông minh'),  desc: 'Tự động sinh nhận xét ngôn ngữ tự nhiên', icon: 'auto_awesome',           href: '/narrative' },
    { label: t('nav.recommendations', 'Gợi ý hành động'),      desc: 'Khuyến nghị từ AI insights',              icon: 'psychology',             href: '/recommendations' },
    { label: t('nav.churn',           'Dự báo Churn'),         desc: 'Churn prediction khách hàng',             icon: 'person_off',             href: '/churn' },
    { label: t('nav.basket',          'Phân tích giỏ hàng'),   desc: 'Market basket analysis',                  icon: 'shopping_bag',           href: '/basket' },
    { label: t('nav.whatIf',          'Mô phỏng What-If'),     desc: 'What-if scenario simulation',             icon: 'science',                href: '/whatif' },
    { label: t('nav.price',           'Thông minh Giá'),       desc: 'Tối ưu chiến lược định giá',              icon: 'price_check',            href: '/price' },
    { label: t('nav.finance',         'Lợi nhuận'),            desc: 'Doanh thu, COGS & biên lợi nhuận',        icon: 'account_balance_wallet', href: '/finance/profit' },
    { label: t('nav.report',          'Báo cáo tổng hợp'),     desc: 'Xuất báo cáo PDF, Excel',                 icon: 'picture_as_pdf',         href: '/report' },
  ]

  // ── Nhóm Vận hành & Quản trị ─────────────────────────────────────────────
  const opsMenuItems = [
    { label: t('nav.dataSync',   'Đồng bộ dữ liệu'), desc: 'Kết nối sàn TMĐT & nguồn dữ liệu',      icon: 'sync',            href: '/data-sync' },
    { label: t('nav.etlMonitor', 'Giám sát ETL'),     desc: 'Giám sát pipeline dữ liệu',              icon: 'monitoring',      href: '/etl-monitor' },
    ...(canSeeAdmin ? [
      { label: t('nav.admin', 'Quản trị hệ thống'),   desc: 'Quản lý người dùng & cấu hình hệ thống', icon: 'manage_accounts', href: '/admin' },
    ] : []),
  ]

  // ── Build navTabs theo role (5 tab tối đa cho Owner) ─────────────────────
  const navTabs = [
    { href: '/dashboard', icon: 'dashboard', label: t('nav.dashboard', 'Tổng quan') },
    {
      href: '/orders',
      icon: 'storefront',
      label: t('nav.sales', 'Bán hàng'),
      hasMega: true,
      menuItems: salesMenuItems,
      columns: canSeeAI ? 2 : 1,
    },
    ...(canSeeAI ? [{
      href: '/inventory/dashboard',
      icon: 'warehouse',
      label: t('nav.groupInvOps', 'Kho & Mua hàng'),
      hasMega: true,
      menuItems: invMenuItems,
      columns: 2,
    }] : canSeeSales ? [{
      // Staff: link đơn giản đến Smart Inventory
      href: '/inventory',
      icon: 'inventory_2',
      label: t('nav.inventory', 'Tồn kho'),
    }] : []),
    ...(canSeeAI ? [{
      href: '/forecast',
      icon: 'auto_awesome',
      label: t('nav.analysis', 'Phân tích'),
      hasMega: true,
      menuItems: analysisMenuItems,
      columns: 2,
    }] : []),
    ...(canSeeOperations ? [{
      href: '/data-sync',
      icon: 'settings',
      label: t('nav.operations', 'Vận hành'),
      hasMega: true,
      menuItems: opsMenuItems,
    }] : []),
  ]

  return (
    <header
      className="lcard-glass sticky top-0 z-50 border-b h-14 flex items-center px-4 md:px-6 relative"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* LEFT — Logo */}
      <div className="flex items-center gap-2.5 mr-4 md:mr-6 shrink-0">
        <LuminaLogo size={28} />
        <div className="leading-tight">
          <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            MSAS
          </span>
          <span className="text-xs block leading-none" style={{ color: 'var(--text-tertiary)' }}>
            {t('topbar.subtitle')}
          </span>
        </div>
      </div>

      {/* CENTER — Nav tabs: hiện trên md+ */}
      <nav className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
        {navTabs.map(tab => (
          <NavTab key={tab.href} {...tab} />
        ))}
      </nav>

      {/* RIGHT — Actions */}
      <div className="flex items-center gap-1.5 ml-auto">
        {/* Search — desktop */}
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
          <span className="hidden lg:inline">{t('common.search', 'Tìm kiếm')}</span>
          <kbd
            className="ml-2 text-[10px] px-1.5 py-0.5 rounded hidden lg:inline"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            Ctrl K
          </kbd>
        </button>

        {/* Search — mobile */}
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

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <MobileMenu
          navTabs={navTabs}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  )
}
