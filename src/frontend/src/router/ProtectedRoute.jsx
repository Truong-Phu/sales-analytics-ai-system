import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PageSpinner } from '../components/ui/Spinner'

/**
 * Bảo vệ route theo xác thực và role.
 * - Chưa login → redirect /login
 * - Chưa hoàn thành onboarding (Owner mới) → redirect /onboarding
 * - Không đủ role → redirect /unauthorized
 * - roles = [] → chỉ kiểm tra đã login
 * - skipOnboarding = true → bỏ qua kiểm tra onboarding (dùng cho route /onboarding)
 */
export default function ProtectedRoute({ children, roles = [], skipOnboarding = false }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageSpinner />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!skipOnboarding && user.onboardingCompleted === false) {
    return <Navigate to="/onboarding" replace />
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
