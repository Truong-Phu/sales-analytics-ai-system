import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PageSpinner } from '../components/ui/Spinner'

/**
 * Route guard cho Super Admin Panel.
 * - Chưa login → /login
 * - Đã login nhưng KHÔNG phải isSuperAdmin → /dashboard
 */
export default function SuperAdminRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <PageSpinner />
  if (!user)              return <Navigate to="/login"        replace />
  if (!user.isSuperAdmin) return <Navigate to="/dashboard"    replace />

  return children
}
