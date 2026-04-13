import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from 'react-i18next'

const NAV_ITEMS = [
  // Analytics
  { to: '/dashboard',        icon: 'dashboard',     label: 'Dashboard',          roles: ['Owner','Manager','DataIT','Admin'] },
  { to: '/ai-forecast',      icon: 'trending_up',   label: 'AI Forecast',        roles: ['Owner','Manager','DataIT','Admin'] },
  { to: '/anomaly',          icon: 'crisis_alert',  label: 'Anomaly Detection',  roles: ['Owner','Manager','DataIT','Admin'] },
  { to: '/recommendations',  icon: 'psychology',    label: 'Recommendations',    roles: ['Owner','Manager','Admin'] },
  // Operations
  { divider: 'Operations' },
  { to: '/data-sync',        icon: 'sync',          label: 'Data Sync',          roles: ['DataIT','Admin'] },
  { to: '/etl-monitor',      icon: 'monitoring',    label: 'ETL Monitor',        roles: ['DataIT','Admin'] },
  // Data
  { divider: 'Data' },
  { to: '/orders',           icon: 'receipt_long',  label: 'Đơn hàng',           roles: ['Staff','Manager','DataIT','Admin'] },
  { to: '/products',         icon: 'inventory_2',   label: 'Sản phẩm',           roles: ['Staff','Manager','DataIT','Admin'] },
  { to: '/customers',        icon: 'group',         label: 'Khách hàng',         roles: ['Staff','Manager','DataIT','Admin'] },
  // Reports
  { divider: 'Reports' },
  { to: '/report',           icon: 'picture_as_pdf',label: 'Export Report',      roles: ['Owner','Manager','DataIT','Admin'] },
  { to: '/dw-status',        icon: 'database',      label: 'Data Warehouse',     roles: ['DataIT','Admin'] },
  // Admin
  { divider: 'Admin' },
  { to: '/admin',            icon: 'manage_accounts',label: 'Quản lý Users',    roles: ['Admin'] },
  { to: '/settings',         icon: 'settings',      label: 'Cài đặt',            roles: ['Owner','Manager','Staff','DataIT','Admin'] },
]

const ROLE_BADGE = {
  Owner:   { label: 'Chủ doanh nghiệp', color: 'bg-yellow-500/20 text-yellow-400' },
  Manager: { label: 'Quản lý',          color: 'bg-primary/20 text-primary' },
  Staff:   { label: 'Nhân viên',        color: 'bg-tertiary/20 text-tertiary' },
  DataIT:  { label: 'Data / IT',        color: 'bg-secondary/20 text-secondary' },
  Admin:   { label: 'Admin',            color: 'bg-error/20 text-error' },
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleLogout = () => { logout(); navigate('/login') }

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.divider) return true
    return item.roles?.includes(user?.role)
  })

  // Remove dangling dividers
  const cleanItems = visibleItems.filter((item, i) => {
    if (!item.divider) return true
    const next = visibleItems[i + 1]
    return next && !next.divider
  })

  const badge = ROLE_BADGE[user?.role] ?? ROLE_BADGE.Staff

  return (
    <aside className="w-[240px] h-screen fixed left-0 top-0 bg-surface-container-lowest
                      flex flex-col py-6 px-4 gap-1 z-50 overflow-y-auto">
      {/* Logo */}
      <div className="mb-6 px-3 flex items-center gap-2">
        <span className="icon icon-fill icon-lg text-primary">bar_chart</span>
        <span className="text-base font-headline font-bold text-primary uppercase tracking-tight">
          Sales Analytics
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {cleanItems.map((item, i) => {
          if (item.divider) return (
            <div key={`div-${i}`} className="section-title px-3 pt-4 pb-1">{item.divider}</div>
          )
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`icon ${isActive ? 'icon-fill' : ''}`}>{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* User profile */}
      <div className="mt-4 pt-4 border-t border-outline-variant/10">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-container to-primary
                          flex items-center justify-center text-surface text-sm font-bold shrink-0">
            {user?.fullName?.[0] ?? 'U'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface truncate">{user?.fullName}</p>
            <span className={`badge text-[10px] ${badge.color}`}>{badge.label}</span>
          </div>
        </div>
        <button onClick={handleLogout}
          className="nav-item w-full text-error hover:text-error hover:bg-error/10">
          <span className="icon">logout</span>
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}
