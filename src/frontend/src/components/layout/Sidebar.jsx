import { useState, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from 'react-i18next'

// ── Nav items — subgroup có thể thu gọn, divider là tiêu đề section ──────────
const NAV_ITEMS = [
  // ── Phân tích cốt lõi ────────────────────────────────────────────────────
  { divider: 'nav.sectionAnalytics' },
  { to: '/dashboard',       icon: 'dashboard',    labelKey: 'nav.dashboard',       roles: ['Owner','Manager','DataIT','Staff','Viewer'] },
  { to: '/forecast',        icon: 'trending_up',  labelKey: 'nav.forecast',        roles: ['Owner','Manager','DataIT'] },
  { to: '/anomaly',         icon: 'crisis_alert', labelKey: 'nav.anomaly',         roles: ['Owner','Manager','DataIT'] },
  { to: '/recommendations', icon: 'psychology',   labelKey: 'nav.recommendations', roles: ['Owner','Manager','DataIT'] },

  // ── AI Nâng cao — 3 nhóm thu gọn ─────────────────────────────────────────
  { divider: 'nav.sectionAiAdvanced' },

  {
    subgroup: 'aiml',
    labelKey: 'nav.groupAiMl',
    icon:     'model_training',
    roles:    ['Owner','Manager','DataIT'],
    children: [
      { to: '/narrative', icon: 'auto_awesome',        labelKey: 'nav.narrative', roles: ['Owner','Manager','DataIT'] },
      { to: '/churn',     icon: 'person_off',          labelKey: 'nav.churn',     roles: ['Owner','Manager','DataIT'] },
      { to: '/basket',    icon: 'shopping_bag',        labelKey: 'nav.basket',    roles: ['Owner','Manager','DataIT'] },
      { to: '/whatif',    icon: 'science',             labelKey: 'nav.whatIf',    roles: ['Owner','Manager','DataIT'] },
    ],
  },
  {
    subgroup: 'market',
    labelKey: 'nav.groupMarket',
    icon:     'show_chart',
    roles:    ['Owner','Manager','DataIT','Staff'],
    children: [
      { to: '/geo',         icon: 'map',          labelKey: 'nav.geo',         roles: ['Owner','Manager','DataIT'] },
      { to: '/campaign',    icon: 'campaign',     labelKey: 'nav.campaign',    roles: ['Owner','Manager','DataIT'] },
      { to: '/attribution', icon: 'account_tree', labelKey: 'nav.attribution', roles: ['Owner','Manager','DataIT'] },
      { to: '/leaderboard', icon: 'leaderboard',  labelKey: 'nav.leaderboard', roles: ['Owner','Manager','Staff','DataIT'] },
    ],
  },
  {
    subgroup: 'opsai',
    labelKey: 'nav.groupOpsAi',
    icon:     'tune',
    roles:    ['Owner','Manager','DataIT','Staff'],
    children: [
      { to: '/supplier',  icon: 'local_shipping',      labelKey: 'nav.supplier',  roles: ['Owner','Manager','DataIT'] },
      { to: '/inventory', icon: 'inventory',           labelKey: 'nav.inventory', roles: ['Owner','Manager','Staff','DataIT'] },
      { to: '/sentiment', icon: 'sentiment_satisfied', labelKey: 'nav.sentiment', roles: ['Owner','Manager','DataIT'] },
      { to: '/price',     icon: 'price_check',         labelKey: 'nav.price',     roles: ['Owner','Manager','DataIT'] },
    ],
  },

  // ── Bán hàng ─────────────────────────────────────────────────────────────
  { divider: 'nav.sectionSales' },
  { to: '/pos', icon: 'point_of_sale', labelKey: 'nav.pos', roles: ['Owner','Manager','Staff'] },

  // ── Quản lý dữ liệu ──────────────────────────────────────────────────────
  { divider: 'nav.sectionData' },
  { to: '/orders',        icon: 'receipt_long', labelKey: 'nav.orders',      roles: ['Owner','Manager','Staff','DataIT','Viewer'] },
  { to: '/products',      icon: 'inventory_2',  labelKey: 'nav.products',    roles: ['Owner','Manager','Staff','DataIT'] },
  { to: '/categories',    icon: 'category',     labelKey: 'nav.categories',  roles: ['Owner','Manager','Staff','DataIT'] },
  { to: '/customers',     icon: 'people',       labelKey: 'nav.customers',   roles: ['Owner','Manager','DataIT'] },
  { to: '/customers/rfm', icon: 'pie_chart',    labelKey: 'nav.rfmAnalysis', roles: ['Owner','Manager','DataIT'] },

  // ── Vận hành & ETL ───────────────────────────────────────────────────────
  { divider: 'nav.sectionOperations' },
  { to: '/data-sync',    icon: 'sync',       labelKey: 'nav.dataSync',   roles: ['DataIT','Owner'] },
  { to: '/etl-monitor',  icon: 'monitoring', labelKey: 'nav.etlMonitor', roles: ['DataIT','Owner'] },

  // ── Báo cáo ──────────────────────────────────────────────────────────────
  { divider: 'nav.sectionReports' },
  { to: '/report', icon: 'picture_as_pdf', labelKey: 'nav.report', roles: ['Owner','Manager','DataIT'] },

  // ── Quản trị ─────────────────────────────────────────────────────────────
  { divider: 'nav.sectionAdmin' },
  { to: '/notifications', icon: 'notifications',  labelKey: 'nav.notifications', roles: ['Owner','Manager','Staff','DataIT','Viewer'] },
  { to: '/admin',         icon: 'manage_accounts', labelKey: 'nav.admin',         roles: ['Owner'] },
  { to: '/settings',      icon: 'settings',        labelKey: 'nav.settings',      roles: ['Owner','Manager','Staff','DataIT','Viewer'] },
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
  const navigate         = useNavigate()
  const { t }            = useTranslation()
  const [collapsed,   setCollapsed]   = useState(false)
  // Mặc định nhóm đầu mở, 2 nhóm sau đóng
  const [openGroups, setOpenGroups]   = useState({ aiml: true, market: false, opsai: false })

  const toggleGroup = useCallback(
    key => setOpenGroups(g => ({ ...g, [key]: !g[key] })),
    [],
  )

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  // Chuẩn hóa role: trim + capitalize đầu từ (tránh lỗi "owner" ≠ "Owner")
  const normalizeRole = r => {
    if (!r) return ''
    const t = r.trim()
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  const userRole = normalizeRole(user?.role)

  // Lọc item theo role, giữ subgroup nếu có ít nhất 1 child visible
  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.divider)   return true
    if (item.subgroup)  return item.children?.some(c => c.roles?.includes(userRole)) ?? false
    return item.roles?.includes(userRole)
  })

  // Bỏ divider cuối / divider kề nhau
  const cleanItems = visibleItems.filter((item, i) => {
    if (!item.divider) return true
    const next = visibleItems[i + 1]
    return next && !next.divider
  })

  const badge = ROLE_BADGE[userRole] ?? ROLE_BADGE.Staff
  const w     = collapsed ? 'w-[68px]' : 'w-[240px]'

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
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
          >
            <span className="icon text-base">{collapsed ? 'menu_open' : 'menu'}</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 flex-1 px-3">
          {cleanItems.flatMap((item, i) => {
            // ── Divider ──
            if (item.divider) {
              if (collapsed) return []
              return [(
                <div key={`div-${i}`} className="section-title px-2 pt-4 pb-1">
                  {t(item.divider)}
                </div>
              )]
            }

            // ── Subgroup thu gọn ──
            if (item.subgroup) {
              const visChildren = item.children?.filter(c => c.roles?.includes(userRole)) ?? []

              // Collapsed sidebar: hiện thẳng các icon con, không có header nhóm
              if (collapsed) {
                return visChildren.map(child => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `nav-item justify-center !px-2 ${isActive ? 'nav-item-active' : ''}`
                    }
                    title={t(child.labelKey)}
                  >
                    {({ isActive }) => (
                      <span className={`icon shrink-0 ${isActive ? 'icon-fill' : ''}`}>
                        {child.icon}
                      </span>
                    )}
                  </NavLink>
                ))
              }

              // Expanded sidebar: header toggle + children khi mở
              const isOpen = openGroups[item.subgroup] ?? false
              return [(
                <div key={`sg-${item.subgroup}`}>
                  <button
                    onClick={() => toggleGroup(item.subgroup)}
                    className="nav-item w-full"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="icon shrink-0">{item.icon}</span>
                      <span className="text-sm truncate">{t(item.labelKey)}</span>
                    </span>
                    <span
                      className="icon shrink-0"
                      style={{
                        fontSize: '18px',
                        transition: 'transform 0.2s',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                      }}
                    >
                      expand_more
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      className="ml-3 border-l flex flex-col gap-0.5 py-0.5"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {visChildren.map(child => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `nav-item pl-3 ${isActive ? 'nav-item-active' : ''}`
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <span className={`icon shrink-0 ${isActive ? 'icon-fill' : ''}`}>
                                {child.icon}
                              </span>
                              <span className="text-sm truncate">{t(child.labelKey)}</span>
                            </>
                          )}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )]
            }

            // ── Nav item thường ──
            return [(
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
                    <span className={`icon shrink-0 ${isActive ? 'icon-fill' : ''}`}>{item.icon}</span>
                    {!collapsed && <span className="text-sm truncate">{t(item.labelKey)}</span>}
                  </>
                )}
              </NavLink>
            )]
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
                  {t(`admin.roles.${userRole}`, userRole)}
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

        {/* Collapsed: chỉ logout icon */}
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
