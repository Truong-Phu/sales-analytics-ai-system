import { useAuth } from '../hooks/useAuth'
import { PageSpinner } from '../components/ui/Spinner'
import ProGate from '../components/ui/ProGate'

const PLAN_ORDER = ['free', 'pro', 'enterprise']

/**
 * Route guard theo gói dịch vụ.
 * - plan đủ → render children
 * - plan không đủ → hiện ProGate (upgrade CTA), không redirect
 * Dùng cùng với ProtectedRoute: ProtectedRoute kiểm tra role, PlanRoute kiểm tra plan.
 */
export default function PlanRoute({ children, minPlan = 'pro', feature = '' }) {
  const { loading, plan } = useAuth()

  if (loading) return <PageSpinner />

  const currentIdx  = PLAN_ORDER.indexOf(plan ?? 'free')
  const requiredIdx = PLAN_ORDER.indexOf(minPlan)

  if (currentIdx < requiredIdx) {
    return <ProGate feature={feature} />
  }

  return children
}
