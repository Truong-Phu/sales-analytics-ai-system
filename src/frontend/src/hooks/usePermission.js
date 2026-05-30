import { useAuth } from './useAuth'

/**
 * Ma trận quyền hạn theo feature & role.
 * Roles: Owner | Manager | Staff_Sales | Staff_Warehouse | Staff_Marketing | DataIT | Viewer
 * Staff (legacy) được giữ để tương thích ngược.
 */
const S  = 'Staff'           // legacy
const SS = 'Staff_Sales'
const SW = 'Staff_Warehouse'
const SM = 'Staff_Marketing'

const PERMISSIONS = {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  'dashboard.view':          ['Owner', 'Manager', 'DataIT', SS, SM, S, 'Viewer'],

  // ── AI / Phân tích ────────────────────────────────────────────────────────
  'forecast.view':           ['Owner', 'Manager', 'DataIT'],
  'anomaly.view':            ['Owner', 'Manager', 'DataIT'],
  'recommendations.view':    ['Owner', 'Manager', 'DataIT'],

  // ── Đơn hàng ─────────────────────────────────────────────────────────────
  'orders.view':             ['Owner', 'Manager', 'DataIT', SS, S, 'Viewer'],
  'orders.create':           ['Owner', 'Manager', SS, S],
  'orders.edit':             ['Owner', 'Manager', SS, S],

  // ── Sản phẩm (mọi staff đều xem được) ───────────────────────────────────
  'products.view':           ['Owner', 'Manager', 'DataIT', SS, SW, SM, S],
  'products.edit':           ['Owner', 'Manager', 'DataIT', SS, SW, S],
  'products.delete':         ['Owner', 'Manager'],
  'categories.view':         ['Owner', 'Manager', 'DataIT', SS, SW, SM, S],
  'categories.edit':         ['Owner', 'Manager'],

  // ── Khách hàng ────────────────────────────────────────────────────────────
  'customers.view':          ['Owner', 'Manager', 'DataIT', SS, SM, S],
  'customers.edit':          ['Owner', 'Manager', SS, S],

  // ── Kho / Nhập hàng (Staff_Warehouse) ────────────────────────────────────
  'inventory.view':          ['Owner', 'Manager', 'DataIT', SW, S],
  'inventory.adjust':        ['Owner', 'Manager', SW],
  'procurement.view':        ['Owner', 'Manager', 'DataIT', SW, S],
  'procurement.create':      ['Owner', 'Manager', SW],
  'goods-receipts.view':     ['Owner', 'Manager', 'DataIT', SW, S],
  'goods-receipts.create':   ['Owner', 'Manager', SW],

  // ── Báo cáo ───────────────────────────────────────────────────────────────
  'report.view':             ['Owner', 'Manager', 'DataIT', SM],
  'report.export':           ['Owner', 'Manager'],
  'ad-spend.manage':         ['Owner', 'Manager', SM],

  // ── Vận hành dữ liệu ─────────────────────────────────────────────────────
  'data-sync.view':          ['Owner', 'Manager', 'DataIT'],
  'etl-monitor.view':        ['DataIT', 'Owner'],

  // ── Quản trị ─────────────────────────────────────────────────────────────
  'admin.view':              ['Owner', 'Manager'],
  'admin.manage-users':      ['Owner', 'Manager'],
  'admin.manage-roles':      ['Owner'],

  // ── Cài đặt ──────────────────────────────────────────────────────────────
  'settings.view':           ['Owner', 'Manager', 'DataIT', SS, SW, SM, S, 'Viewer'],
  'settings.subscription':   ['Owner'],

  // ── Thông báo ─────────────────────────────────────────────────────────────
  'notifications.view':      ['Owner', 'Manager', 'DataIT', SS, SW, SM, S, 'Viewer'],
}

export function usePermission(feature) {
  const { user } = useAuth()
  if (!user) return false
  const allowed = PERMISSIONS[feature]
  if (!allowed) return false
  return allowed.includes(user.role)
}

export function usePermissions(...features) {
  const { user } = useAuth()
  const role = user?.role ?? ''
  return Object.fromEntries(
    features.map(f => [f, (PERMISSIONS[f] ?? []).includes(role)])
  )
}

/** Kiểm tra role có phải là một trong các Staff sub-role không */
export function useStaffRole() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  return {
    isSales:     role === 'Staff_Sales'     || role === 'Staff',
    isWarehouse: role === 'Staff_Warehouse',
    isMarketing: role === 'Staff_Marketing',
    isAnyStaff:  ['Staff_Sales', 'Staff_Warehouse', 'Staff_Marketing', 'Staff'].includes(role),
  }
}
