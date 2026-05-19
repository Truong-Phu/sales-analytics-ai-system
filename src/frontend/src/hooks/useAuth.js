import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Hook tiện ích để truy cập AuthContext từ bất kỳ component nào.
 * Trả về: { user, loading, login, logout, setLang,
 *           isOwner, isManager, isStaff,
 *           canEdit, canViewReport, canManageUsers }
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải được dùng trong AuthProvider')

  const role = ctx.user?.role ?? ''
  const plan = ctx.plan ?? 'free'

  return {
    ...ctx,
    role,
    plan,
    isFree:       plan === 'free',
    isPro:        plan !== 'free',
    // Role shortcuts
    isOwner:   role === 'Owner',
    isManager: role === 'Manager',
    isStaff:   role === 'Staff',
    isDataIT:  role === 'DataIT',
    isViewer:  role === 'Viewer',
    // Permission helpers
    canEdit:        ['Owner', 'Manager', 'Staff'].includes(role),
    canViewReport:  ['Owner', 'Manager'].includes(role),
    canManageUsers: ['Owner', 'Manager'].includes(role),
  }
}

/**
 * Kiểm tra role hiện tại.
 * Ví dụ: hasRole('Owner') hoặc hasRole(['Owner', 'Manager'])
 */
export function useHasRole(roles) {
  const { user } = useAuth()
  if (!user) return false
  const allowed = Array.isArray(roles) ? roles : [roles]
  return allowed.includes(user.role)
}
