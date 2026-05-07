import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'

const NAV = [
  { to: '/sa',               icon: 'dashboard',       label: 'Dashboard',       exact: true },
  { to: '/sa/companies',     icon: 'business',        label: 'Companies' },
  { to: '/sa/users',         icon: 'group',           label: 'Users' },
  { to: '/sa/subscriptions', icon: 'workspace_premium', label: 'Subscriptions' },
  { to: '/sa/sync-monitor',  icon: 'sync',            label: 'Sync Monitor' },
  { to: '/sa/audit-logs',    icon: 'history',         label: 'Audit Logs' },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { isDark }       = useTheme()
  const navigate         = useNavigate()

  return (
    <div className={`min-h-screen flex ${isDark ? 'dark' : ''}`}
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col"
        style={{
          background: '#0F172A',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}>

        {/* Logo / branding */}
        <div className="px-5 py-5 flex items-center gap-2.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
            SA
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight">Super Admin</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>System Panel</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(99,102,241,0.18)' : undefined,
                color:      isActive ? '#A5B4FC' : undefined,
              })}>
              <span className="icon text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + back-to-app */}
        <div className="px-3 py-4 space-y-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
            style={{ color: 'rgba(255,255,255,0.45)', background: 'transparent' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; e.currentTarget.style.background = 'transparent' }}>
            <span className="icon text-base">arrow_back</span>
            Back to App
          </button>
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
              {(user?.name ?? 'S').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-white truncate">{user?.name ?? 'Super Admin'}</div>
              <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {user?.email ?? ''}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{
            background:   'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            height:       52,
          }}>
          <span className="text-xs font-medium px-2 py-1 rounded-full"
            style={{ background: 'rgba(99,102,241,0.10)', color: '#6366F1' }}>
            Super Admin Mode
          </span>
          <button onClick={logout}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon text-base">logout</span>
            Logout
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
