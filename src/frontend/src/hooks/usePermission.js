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
  'dashboard.view':          ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff', 'Viewer'],

  // AI / Phân tích
  'forecast.view':           ['Owner', 'Manager', 'DataIT', 'Admin'],
  'anomaly.view':            ['Owner', 'Manager', 'DataIT', 'Admin'],
  'recommendations.view':    ['Owner', 'Manager', 'Admin'],

  // Sản phẩm / Đơn hàng / Khách hàng
  'orders.view':             ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff', 'Viewer'],
  'products.view':           ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff'],
  'products.edit':           ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff'],
  'products.delete':         ['Owner', 'Manager', 'Admin'],
  'categories.view':         ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff'],
  'categories.edit':         ['Owner', 'Manager', 'Admin'],
  'customers.view':          ['Owner', 'Manager', 'DataIT', 'Admin'],

  // Vận hành dữ liệu
  'data-sync.view':          ['Owner', 'Manager', 'DataIT', 'Admin'],
  'etl-monitor.view':        ['DataIT', 'Admin'],

  // Báo cáo
  'report.view':             ['Owner', 'Manager', 'DataIT', 'Admin'],
  'report.export':           ['Owner', 'Manager', 'Admin'],

  // Quản trị
  'admin.view':              ['Owner', 'Manager', 'Admin'],
  'admin.manage-users':      ['Owner', 'Manager', 'Admin'],
  'admin.manage-roles':      ['Owner', 'Admin'],

  // Cài đặt
  'settings.view':           ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff', 'Viewer'],
  'settings.subscription':   ['Owner'],

  // Thông báo
  'notifications.view':      ['Owner', 'Manager', 'DataIT', 'Admin', 'Staff', 'Viewer'],
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
