import { useAuth } from './useAuth'

/**
 * Ma trận quyền hạn theo feature & role.
 * Trả về true/false để dùng thống nhất thay vì check role rải rác.
 *
 * Cách dùng:
 *   const canEdit = usePermission('products.edit')
 *   const canViewReport = usePermission('report.view')
 */
const PERMISSIONS = {
  // Dashboard
  'dashboard.view':          ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],

  // AI / Phân tích
  'forecast.view':           ['Owner', 'Manager', 'DataIT'],
  'anomaly.view':            ['Owner', 'Manager', 'DataIT'],
  'recommendations.view':    ['Owner', 'Manager'],

  // Sản phẩm / Đơn hàng / Khách hàng
  'orders.view':             ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],
  'products.view':           ['Owner', 'Manager', 'DataIT', 'Staff'],
  'products.edit':           ['Owner', 'Manager', 'DataIT', 'Staff'],
  'products.delete':         ['Owner', 'Manager'],
  'categories.view':         ['Owner', 'Manager', 'DataIT', 'Staff'],
  'categories.edit':         ['Owner', 'Manager'],
  'customers.view':          ['Owner', 'Manager', 'DataIT'],

  // Vận hành dữ liệu
  'data-sync.view':          ['Owner', 'Manager', 'DataIT'],
  'etl-monitor.view':        ['DataIT', 'Owner'],

  // Báo cáo
  'report.view':             ['Owner', 'Manager', 'DataIT'],
  'report.export':           ['Owner', 'Manager'],

  // Quản trị
  'admin.view':              ['Owner', 'Manager'],
  'admin.manage-users':      ['Owner', 'Manager'],
  'admin.manage-roles':      ['Owner'],

  // Cài đặt
  'settings.view':           ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],
  'settings.subscription':   ['Owner'],

  // Thông báo
  'notifications.view':      ['Owner', 'Manager', 'DataIT', 'Staff', 'Viewer'],
}

export function usePermission(feature) {
  const { user } = useAuth()
  if (!user) return false
  const allowed = PERMISSIONS[feature]
  if (!allowed) return false
  return allowed.includes(user.role)
}

/**
 * Kiểm tra nhiều feature cùng lúc.
 * Trả về object { [feature]: boolean }
 */
export function usePermissions(...features) {
  const { user } = useAuth()
  const role = user?.role ?? ''
  return Object.fromEntries(
    features.map(f => [f, (PERMISSIONS[f] ?? []).includes(role)])
  )
}
