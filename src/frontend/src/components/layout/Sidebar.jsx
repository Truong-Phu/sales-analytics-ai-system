import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from 'react-i18next'

// Cấu trúc nav items – label là i18n key (nav.xxx)
const NAV_ITEMS = [
  // Analytics
  { to: '/dashboard',       icon: 'dashboard',        labelKey: 'nav.dashboard',       roles: ['Owner','Manager','DataIT','Viewer'] },
  { to: '/forecast',        icon: 'trending_up',      labelKey: 'nav.forecast',        roles: ['Owner','Manager','DataIT'] },
  { to: '/anomaly',         icon: 'crisis_alert',     labelKey: 'nav.anomaly',         roles: ['Owner','Manager','DataIT'] },
  { to: '/recommendations', icon: 'psychology',       labelKey: 'nav.recommendations', roles: ['Owner','Manager'] },
  // Operations
  { divider: 'nav.sectionOperations' },
  { to: '/data-sync',       icon: 'sync',             labelKey: 'nav.dataSync',        roles: ['DataIT','Owner'] },
  { to: '/etl-monitor',     icon: 'monitoring',       labelKey: 'nav.etlMonitor',      roles: ['DataIT','Owner'] },
  // Data
  { divider: 'nav.sectionData' },
  { to: '/orders',          icon: 'receipt_long',     labelKey: 'nav.orders',          roles: ['Staff','Manager','DataIT','Viewer'] },
  { to: '/products',        icon: 'inventory_2',      labelKey: 'nav.products',        roles: ['Staff','Manager','DataIT','Owner'] },
  { to: '/categories',      icon: 'category',         labelKey: 'nav.categories',      roles: ['Staff','Manager','DataIT','Owner'] },
  { to: '/customers',       icon: 'people',           labelKey: 'nav.customers',       roles: ['Owner','Manager','DataIT'] },
  { to: '/customers/rfm',   icon: 'pie_chart',        labelKey: 'nav.rfmAnalysis',     roles: ['Owner','Manager','DataIT'] },
  { to: '/churn',           icon: 'person_off',       labelKey: 'nav.churn',           roles: ['Owner','Manager','DataIT'] },
  { to: '/basket',          icon: 'shopping_bag',     labelKey: 'nav.basket',          roles: ['Owner','Manager','DataIT'] },
  { to: '/inventory',       icon: 'inventory',        labelKey: 'nav.inventory',       roles: ['Owner','Manager','Staff','DataIT'] },
  // AI Advanced
  { divider: 'nav.sectionAiAdvanced' },
  { to: '/whatif',          icon: 'science',          labelKey: 'nav.whatIf',          roles: ['Owner','Manager','DataIT'] },
  { to: '/attribution',     icon: 'account_tree',     labelKey: 'nav.attribution',     roles: ['Owner','Manager','DataIT'] },
  { to: '/campaign',        icon: 'campaign',         labelKey: 'nav.campaign',        roles: ['Owner','Manager','DataIT'] },
  { to: '/leaderboard',     icon: 'leaderboard',      labelKey: 'nav.leaderboard',     roles: ['Owner','Manager','Staff','DataIT'] },
  { to: '/narrative',       icon: 'auto_awesome',     labelKey: 'nav.narrative',       roles: ['Owner','Manager','DataIT'] },
  // Reports
  { divider: 'nav.sectionReports' },
  { to: '/report',          icon: 'picture_as_pdf',   labelKey: 'nav.report',          roles: ['Owner','Manager','DataIT'] },
  // Admin
  { divider: 'nav.sectionAdmin' },
  { to: '/admin',           icon: 'manage_accounts',  labelKey: 'nav.admin',           roles: ['Owner'] },
  { to: '/settings',        icon: 'settings',         labelKey: 'nav.settings',        roles: ['Owner','Manager','Staff','DataIT','Viewer'] },
]

const ROLE_BADGE = {
  Owner:   { color: 'bg-yellow-500/20 text-yellow-400' },
  Manager: { color: 'bg-primary/20 text-primary' },
  Staff:   { color: 'bg-tertiary/20 text-tertiary' },
  DataIT:  { color: 'bg-secondary/20 text-secondary' },
  Viewer:  { color: 'bg-outline/20 text-outline' },
}

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  // Lọc nav items theo role
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.divider) return true
    return item.roles?.includes(user?.role)
  })

  // Bỏ divider cuối/kề nhau
  const cleanItems = visibleItems.filter((item, i) => {
    if (!item.divider) return true
    const next = visibleItems[i + 1]
    return next && !next.divider
  })

  const badge = ROLE_BADGE[user?.role] ?? ROLE_BADGE.Staff
  const w = collapsed ? 'w-[68px]' : 'w-[240px]'

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${w} h-screen fixed left-0 top-0
          bg-surface-container-lowest flex flex-col py-5 gap-1 z-50
          overflow-y-auto overflow-x-hidden transition-all duration-200
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Logo + collapse toggle */}
        <div className={`flex items-center mb-4 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="icon icon-fill icon-lg text-primary shrink-0">bar_chart</span>
              <span className="text-sm font-headline font-bold text-primary uppercase tracking-tight truncate">
                Sales Analytics
              </span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="w-8 h-8 flex items-center justify-center rounded-lg
                       text-outline hover:text-primary hover:bg-surface-container-low
                       transition-colors shrink-0"
            title={collapsed ? t('nav.dashboard') : ''}
          >
            <span className="icon text-base">
              {collapsed ? 'menu_open' : 'menu'}
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1 px-3">
          {cleanItems.map((item, i) => {
            if (item.divider) {
              if (collapsed) return null
              return (
                <div key={`div-${i}`} className="section-title px-2 pt-4 pb-1">
                  {t(item.divider)}
                </div>
              )
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `nav-item ${isActive ? 'nav-item-active' : ''} ${collapsed ? 'justify-center !px-2' : ''}`
                }
                title={collapsed ? t(item.labelKey) : undefined}
              >
                {({ isActive }) => (
                  <>
                    <span className={`icon shrink-0 ${isActive ? 'icon-fill' : ''}`}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className="text-sm truncate">{t(item.labelKey)}</span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User profile */}
        {!collapsed && (
          <div className="mt-4 pt-4 border-t border-outline-variant/10 px-3">
            <div className="flex items-center gap-3 px-2 mb-3">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-primary-container to-primary
                              flex items-center justify-center text-surface text-sm font-bold shrink-0">
                {user?.avatarUrl
                  ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : (user?.fullName?.[0] ?? user?.name?.[0] ?? 'U')
                }
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate">{user?.fullName}</p>
                <span className={`badge text-[10px] ${badge.color}`}>
                  {t(`admin.roles.${user?.role}`, user?.role)}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="nav-item w-full text-error hover:text-error hover:bg-error/10"
            >
              <span className="icon">logout</span>
              <span>{t('auth.logout')}</span>
            </button>
          </div>
        )}

        {/* Collapsed: chỉ hiện logout icon */}
        {collapsed && (
          <div className="pt-4 border-t border-outline-variant/10 px-3 pb-2">
            <button
              onClick={handleLogout}
              className="nav-item w-full text-error hover:text-error hover:bg-error/10 justify-center !px-2"
              title={t('auth.logout')}
            >
              <span className="icon">logout</span>
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
