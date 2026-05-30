import { useAuth } from '../context/AuthContext'

const SS = 'Staff_Sales'
const SW = 'Staff_Warehouse'
const SM = 'Staff_Marketing'
const S  = 'Staff' // legacy

const PERMISSIONS = {
  'dashboard.view':        ['Owner', 'Manager', 'DataIT', SS, SM, S, 'Viewer'],
  'orders.view':           ['Owner', 'Manager', 'DataIT', SS, S, 'Viewer'],
  'orders.add':            ['Owner', 'Manager', SS, S],
  'products.view':         ['Owner', 'Manager', 'DataIT', SS, SW, SM, S],
  'products.edit':         ['Owner', 'Manager', 'DataIT', SS, SW, S],
  'customers.view':        ['Owner', 'Manager', 'DataIT', SS, SM, S],
  'inventory.view':        ['Owner', 'Manager', 'DataIT', SW, S],
  'inventory.adjust':      ['Owner', 'Manager', SW],
  'procurement.view':      ['Owner', 'Manager', SW],
  'procurement.create':    ['Owner', 'Manager', SW],
  'goods-receipts.view':   ['Owner', 'Manager', SW],
  'goods-receipts.create': ['Owner', 'Manager', SW],
  'report.view':           ['Owner', 'Manager', SM],
  'alerts.view':           ['Owner', 'Manager', 'DataIT', SS, SW, SM, S, 'Viewer'],
}

const PRO_FEATURES = new Set(['report.view', 'customers.view'])

export function usePermission(feature) {
  const { user, plan } = useAuth()
  if (!user) return false
  const allowed = PERMISSIONS[feature]
  if (!allowed || !allowed.includes(user.role)) return false
  if (PRO_FEATURES.has(feature) && (plan ?? 'Free') === 'Free') return false
  return true
}

export function usePlan() {
  const { plan } = useAuth()
  const p = plan ?? 'Free'
  return {
    plan: p,
    isFree: p === 'Free',
    isPro:  p !== 'Free',
  }
}

export function useStaffRole() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  return {
    isSales:     role === 'Staff_Sales'     || role === 'Staff',
    isWarehouse: role === 'Staff_Warehouse',
    isMarketing: role === 'Staff_Marketing',
    isAnyStaff:  [SS, SW, SM, S].includes(role),
  }
}
