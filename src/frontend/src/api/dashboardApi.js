import api from './axios'

/**
 * Lấy toàn bộ dữ liệu dashboard (KPI + doanh thu + kênh + top sản phẩm).
 * Backend trả về PascalCase record → camelCase sau khi serialise.
 */
export const getDashboard = (from, to, channel = null) => {
  const params = { from, to }
  if (channel) params.channel = channel
  return api.get('/api/dashboard', { params }).then(r => r.data)
}

// ── Orders (OLTP) ─────────────────────────────────────────────────────────────

const normalizeOrder = (o) => ({
  orderId:        o.orderId      ?? o.salesKey ?? 0,
  externalOrderId:o.externalOrderId ?? o.orderCode ?? '—',
  customerName:   o.customerName ?? '—',
  channel:        o.channelName  ?? o.channel  ?? '—',
  totalAmount:    Number(o.totalAmount ?? o.netRevenue ?? 0),
  paymentMethod:  o.paymentMethod ?? '—',
  paymentStatus:  o.paymentStatus  ?? 'UNPAID',
  shippingStatus: o.shippingStatus ?? 'NOT_SHIPPED',
  shippingFee:    Number(o.shippingFee ?? 0),
  discount:       Number(o.discountAmount ?? o.discount ?? 0),
  commissionFee:  o.commissionFee ?? null,
  status:         (o.status ?? 'pending').toLowerCase(),
  createdAt:      o.orderDate    ?? o.createdAt ?? o.saleDate,
})

export const getOrders = async (params = {}) => {
  // pageSize thay vì limit cho OLTP endpoint
  const { limit, ...rest } = params
  const res = await api.get('/api/orders/oltp', {
    params: { ...rest, pageSize: limit ?? 20 },
  }).then(r => r.data)
  return {
    items:      (res.data ?? res.items ?? []).map(normalizeOrder),
    total:      res.total ?? 0,
    page:       res.page  ?? 1,
    totalPages: res.totalPages ?? 1,
  }
}

// ── Products (DW) ─────────────────────────────────────────────────────────────

const normalizeProduct = (p) => ({
  ...p,
  product_id:    p.productId    ?? p.product_id,
  product_name:  p.productName  ?? p.product_name  ?? p.name ?? '',
  name:          p.productName  ?? p.name ?? '',
  sku:           p.sku          ?? '',
  category:      p.category     ?? p.categoryName  ?? '',
  brand:         p.brand        ?? '',
  unit_price:    Number(p.basePrice ?? p.unitPrice ?? p.unit_price ?? p.price ?? 0),
  price:         Number(p.basePrice ?? p.price ?? 0),
  cost_price:    Number(p.costPrice ?? p.cost_price ?? 0),
  stock:         p.stock        ?? p.stockQuantity ?? 100,
  total_qty_sold:Number(p.totalQtySold  ?? p.total_qty_sold ?? 0),
  total_orders:  Number(p.totalOrders   ?? p.total_orders   ?? 0),
})

export const getProducts = async (params = {}) => {
  const res = await api.get('/api/products', { params }).then(r => r.data)
  return {
    items:      (res.data ?? res.items ?? []).map(normalizeProduct),
    total:      res.total ?? 0,
    page:       res.page  ?? 1,
    totalPages: res.totalPages ?? 1,
  }
}

// ── Customers (DW) ────────────────────────────────────────────────────────────

const normalizeCustomer = (c) => ({
  ...c,
  customer_id:    c.customerId    ?? c.customer_id,
  customer_code:  c.customerCode  ?? c.customer_code ?? '',
  full_name:      c.fullName      ?? c.full_name     ?? '',
  email:          c.email         ?? '—',
  province:       c.province      ?? '—',
  region:         c.region        ?? '',
  segment_label:  c.segmentLabel  ?? c.segment_label ?? 'NEW',
  total_orders:   Number(c.totalOrders   ?? c.total_orders   ?? 0),
  total_revenue:  Number(c.totalRevenue  ?? c.total_revenue  ?? 0),
  avg_order_value:Number(c.avgOrderValue ?? c.avg_order_value ?? 0),
  last_order_date: c.lastOrderDate ?? c.last_order_date,
})

export const getCustomers = async (params = {}) => {
  const res = await api.get('/api/customers', { params }).then(r => r.data)
  return {
    items:      (res.data ?? res.items ?? []).map(normalizeCustomer),
    total:      res.total ?? 0,
    page:       res.page  ?? 1,
    totalPages: res.totalPages ?? 1,
  }
}

// ── Categories CRUD ───────────────────────────────────────────────────────────

export const getCategories = () =>
  api.get('/api/categories').then(r => r.data.data ?? r.data)

export const createCategory = (dto) =>
  api.post('/api/categories', dto).then(r => r.data)

export const updateCategory = (id, dto) =>
  api.put(`/api/categories/${id}`, dto).then(r => r.data)

export const deleteCategory = (id) =>
  api.delete(`/api/categories/${id}`).then(r => r.data)

export const toggleCategory = (id) =>
  api.patch(`/api/categories/${id}/toggle`).then(r => r.data)

// ── Orders OLTP CRUD ─────────────────────────────────────────────────────────

export const updateOrderStatus = (id, dto) =>
  api.put(`/api/orders/oltp/${id}`, dto).then(r => r.data)

export const cancelOrder = (id) =>
  api.delete(`/api/orders/oltp/${id}`).then(r => r.data)

// ── Products OLTP CRUD ───────────────────────────────────────────────────────

export const getOltpProducts = async (params = {}) => {
  const { limit, ...rest } = params
  const res = await api.get('/api/products/oltp', {
    params: { ...rest, pageSize: limit ?? 20 },
  }).then(r => r.data)
  return {
    items:      (res.data ?? res.items ?? []).map(normalizeProduct),
    total:      res.total ?? 0,
    page:       res.page  ?? 1,
    totalPages: res.totalPages ?? 1,
  }
}

export const getOltpProduct = (id) =>
  api.get(`/api/products/oltp/${id}`).then(r => r.data)

export const createProduct = (dto) =>
  api.post('/api/products/oltp', dto).then(r => r.data)

export const updateProduct = (id, dto) =>
  api.put(`/api/products/oltp/${id}`, dto).then(r => r.data)

export const deleteProduct = (id) =>
  api.delete(`/api/products/oltp/${id}`).then(r => r.data)

export const uploadProductImage = (id, file) => {
  const fd = new FormData()
  fd.append('image', file)
  return api.post(`/api/products/oltp/${id}/image`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ── Customers OLTP CRUD ──────────────────────────────────────────────────────

export const getOltpCustomers = async (params = {}) => {
  const { limit, ...rest } = params
  const res = await api.get('/api/customers/oltp', {
    params: { ...rest, pageSize: limit ?? 20 },
  }).then(r => r.data)
  return {
    items:      res.data ?? res.items ?? [],
    total:      res.total ?? 0,
    page:       res.page  ?? 1,
    totalPages: res.totalPages ?? 1,
  }
}

export const createCustomer = (dto) =>
  api.post('/api/customers/oltp', dto).then(r => r.data)

export const updateCustomer = (id, dto) =>
  api.put(`/api/customers/oltp/${id}`, dto).then(r => r.data)

export const deactivateCustomer = (id) =>
  api.delete(`/api/customers/oltp/${id}`).then(r => r.data)

// ── Today vs Yesterday ────────────────────────────────────────────────────────

export const getTodayVsYesterday = () =>
  api.get('/api/dashboard/today-vs-yesterday').then(r => r.data)

// ── Product Channel Prices ────────────────────────────────────────────────────

export const getChannelPrices = (productId) =>
  api.get(`/api/products/oltp/${productId}/channel-prices`).then(r => r.data)

export const saveChannelPrice = (productId, dto) =>
  api.post(`/api/products/oltp/${productId}/channel-prices`, dto).then(r => r.data)
