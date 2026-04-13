import api from './axios'

/**
 * Lấy toàn bộ dữ liệu dashboard (KPI + doanh thu + kênh + sản phẩm top).
 * @param {string} from  – ISO date string
 * @param {string} to    – ISO date string
 * @param {string} channel – 'all' | 'shopee' | ...
 */
export const getDashboard = (from, to, channel = 'all') =>
  api.get('/api/dashboard', { params: { from, to, channel } }).then(r => r.data)

export const getOrders = (params) =>
  api.get('/api/orders', { params }).then(r => r.data)

export const getProducts = (params) =>
  api.get('/api/products', { params }).then(r => r.data)

export const getCustomers = (params) =>
  api.get('/api/customers', { params }).then(r => r.data)
