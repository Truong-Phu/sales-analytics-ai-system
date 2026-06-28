import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTranslation } from 'react-i18next'

const NAV = [
  { href: '/dashboard',  icon: 'dashboard',    key: 'nav.dashboard', defaultLabel: 'Home' },
  { href: '/orders',     icon: 'receipt_long', key: 'nav.sales',     defaultLabel: 'Bán hàng' },
  { href: '/forecast',   icon: 'trending_up',  key: 'nav.aiShort',   defaultLabel: 'AI' },
  { href: '/report',     icon: 'picture_as_pdf', key: 'nav.report',    defaultLabel: 'Báo cáo' },
  { href: '/settings',   icon: 'settings',     key: 'nav.settings',  defaultLabel: 'Cài đặt' },
]

export default function MobileBottomNav() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const role = user?.role ?? ''

  const visible = NAV.filter(item => {
    if (item.href === '/forecast') return ['Owner','Manager','DataIT','Viewer'].includes(role)
    if (item.href === '/report')   return ['Owner','Manager','DataIT'].includes(role)
    return true
  })

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 lcard-glass border-t flex"
      style={{
        height: '56px',
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {visible.map(item => (
        <NavLink
          key={item.href}
          to={item.href}
          className="flex-1 flex flex-col items-center justify-center gap-0.5"
        >
          {({ isActive }) => (
            <>
              <span
                className="icon icon-sm"
                style={{ color: isActive ? 'var(--primary-500)' : 'var(--text-tertiary)' }}
              >
                {item.icon}
              </span>
              <span
                className="text-[10px]"
                style={{ color: isActive ? 'var(--primary-500)' : 'var(--text-tertiary)' }}
              >
                {t(item.key, item.defaultLabel)}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
