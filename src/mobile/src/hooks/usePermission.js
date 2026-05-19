import { useAuth } from '../context/AuthContext'

// Ma trận quyền cho mobile – giống usePermission.js ở frontend nhưng rút gọn
const PERMISSIONS = {
  'dashboard.view': ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],
  'orders.view':    ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],
  'orders.add':     ['Owner', 'Manager', 'Staff'],
  'products.view':  ['Owner', 'Manager', 'DataIT', 'Staff'],
  'products.edit':  ['Owner', 'Manager', 'DataIT', 'Staff'],
  'customers.view': ['Owner', 'Manager', 'DataIT'],
  'report.view':    ['Owner', 'Manager'],
  'alerts.view':    ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],
}

// Các tính năng yêu cầu gói Pro trở lên
const PRO_FEATURES = new Set(['report.view', 'customers.view'])

export function usePermission(feature) {
  const { user, plan } = useAuth()
  if (!user) return false
  const allowed = PERMISSIONS[feature]
  if (!allowed || !allowed.includes(user.role)) return false
  // Gói Free không truy cập được tính năng Pro
  if (PRO_FEATURES.has(feature) && (plan ?? 'Free') === 'Free') return false
  return true
}

export function usePlan() {
  const { plan } = useAuth()
  const p = plan ?? 'Free'
  return {
    plan: p,
    isFree: p === 'Free',
    isPro: p !== 'Free',
  }
}
