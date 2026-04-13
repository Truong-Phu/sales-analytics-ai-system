import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Hook tiện ích để truy cập AuthContext từ bất kỳ component nào.
 * Trả về: { user, loading, login, logout, setLang }
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải được dùng trong AuthProvider')
  return ctx
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
