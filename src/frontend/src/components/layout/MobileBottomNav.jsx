import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const NAV = [
  { href: '/dashboard',  icon: 'dashboard',    label: 'Home' },
  { href: '/orders',     icon: 'receipt_long', label: 'Bán hàng' },
  { href: '/forecast',   icon: 'trending_up',  label: 'AI' },
  { href: '/report',     icon: 'picture_as_pdf', label: 'Báo cáo' },
  { href: '/settings',   icon: 'settings',     label: 'Cài đặt' },
]

export default function MobileBottomNav() {
  const { user } = useAuth()
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
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
