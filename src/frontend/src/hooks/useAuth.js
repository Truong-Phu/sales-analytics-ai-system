import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Hook tiện ích để truy cập AuthContext từ bất kỳ component nào.
 * Trả về: { user, loading, login, logout, setLang,
 *           isAdmin, isOwner, isManager, isStaff,
 *           canEdit, canViewReport, canManageUsers }
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải được dùng trong AuthProvider')

  const role = ctx.user?.role ?? ''

  return {
    ...ctx,
    // Role shortcuts
    isAdmin:   role === 'Admin',
    isOwner:   role === 'Owner',
    isManager: role === 'Manager',
    isStaff:   role === 'Staff',
    isDataIT:  role === 'DataIT',
    isViewer:  role === 'Viewer',
    // Permission helpers
    canEdit:        ['Admin', 'Owner', 'Manager', 'Staff'].includes(role),
    canViewReport:  ['Admin', 'Owner', 'Manager'].includes(role),
    canManageUsers: role === 'Admin',
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
