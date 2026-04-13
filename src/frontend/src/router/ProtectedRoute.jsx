import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PageSpinner } from '../components/ui/Spinner'

/**
 * Bảo vệ route theo xác thực và role.
 * - Chưa login → redirect /login
 * - Không đủ role → redirect /unauthorized
 * - roles = [] → chỉ kiểm tra đã login
 */
export default function ProtectedRoute({ children, roles = [] }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageSpinner />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
