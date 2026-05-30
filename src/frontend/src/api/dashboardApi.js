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
  orderId:             o.orderId      ?? o.salesKey ?? 0,
  orderCode:           o.orderCode    ?? o.externalOrderId ?? '—',
  externalOrderId:     o.externalOrderId ?? o.orderCode ?? '—',
  customerName:        o.customerName ?? '—',
  customerPhone:       o.customerPhone ?? null,
  channel:             (o.channelName ?? o.channel ?? '—').toLowerCase(),
  channelLabel:        o.channelName  ?? o.channel  ?? '—',
  totalAmount:         Number(o.totalAmount ?? o.netRevenue ?? 0),
  paymentMethod:       o.paymentMethod ?? '—',
  paymentStatus:       o.paymentStatus  ?? 'UNPAID',
  shippingStatus:      o.shippingStatus ?? 'NOT_SHIPPED',
  shippingFee:         Number(o.shippingFee ?? 0),
  discount:            Number(o.discountAmount ?? o.discount ?? 0),
  commissionFee:       o.commissionFee ?? null,
  status:              (o.status ?? 'pending').toLowerCase(),
  createdAt:           o.orderDate    ?? o.createdAt ?? o.saleDate,
  orderDate:           o.orderDate    ?? null,
  shippingAddress:     o.shippingAddress     ?? null,
  shippingDistrict:    o.shippingDistrict    ?? null,
  shippingProvince:    o.shippingProvince    ?? null,
  shippingFullAddress: o.shippingFullAddress ?? null,
  trackingNumber:      o.trackingNumber      ?? null,
  ghnOrderCode:        o.ghnOrderCode        ?? null,
  platformStatus:      o.platformStatus      ?? null,
  paidAt:              o.paidAt              ?? null,
  deliveredAt:         o.deliveredAt         ?? null,
  details:             (o.details ?? []).map(d => ({
    productName:   d.productName   ?? d.ProductName   ?? '—',
    sku:           d.sku           ?? d.Sku            ?? '',
    variation:     d.variation     ?? d.variationName  ?? '',
    imageUrl:      d.imageUrl      ?? d.ImageUrl       ?? null,
    quantity:      d.quantity      ?? d.Quantity       ?? 1,
    unitPrice:     Number(d.unitPrice     ?? d.UnitPrice     ?? 0),
    salePrice:     d.salePrice     != null ? Number(d.salePrice)     : null,
    originalPrice: d.originalPrice != null ? Number(d.originalPrice) : null,
    discount:      Number(d.discount      ?? d.Discount      ?? 0),
    subtotal:      Number(d.subtotal      ?? d.Subtotal      ?? 0),
  })),
})

export const getOrders = async (params = {}, config = {}) => {
  // pageSize thay vì limit cho OLTP endpoint
  const { limit, ...rest } = params
  const res = await api.get('/api/orders/oltp', {
    params: { ...rest, pageSize: limit ?? 20 },
    ...config, // forward signal để AbortController hoạt động
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
  phone:          c.phoneNumber   ?? c.phone         ?? null,
  province:       c.province      ?? '—',
  district:       c.district      ?? null,
  address:        c.address       ?? null,
  region:         c.region        ?? '',
  segment_label:  c.segmentLabel  ?? c.segment_label ?? 'NEW',
  total_orders:   Number(c.totalOrders   ?? c.total_orders   ?? 0),
  total_revenue:  Number(c.totalRevenue  ?? c.total_revenue  ?? 0),
  avg_order_value:Number(c.avgOrderValue ?? c.avg_order_value ?? 0),
  last_order_date: c.lastOrderDate ?? c.last_order_date,
  loyalty_points: c.loyaltyPoints != null ? Number(c.loyaltyPoints) : (c.loyalty_points != null ? Number(c.loyalty_points) : null),
})

export const getCustomers = async (params = {}) => {
  // Loại bỏ các param rỗng để tránh gửi ?segment= thay vì bỏ qua
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v != null)
  )
  const res = await api.get('/api/customers', { params: cleanParams }).then(r => r.data)
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

export const getOltpCustomer = (id) =>
  api.get(`/api/customers/oltp/${id}`).then(r => r.data)

export const createCustomer = (dto) =>
  api.post('/api/customers/oltp', dto).then(r => r.data)

export const updateCustomer = (id, dto) =>
  api.put(`/api/customers/oltp/${id}`, dto).then(r => r.data)

export const deactivateCustomer = (id) =>
  api.delete(`/api/customers/oltp/${id}`).then(r => r.data)

// ── Today vs Yesterday ────────────────────────────────────────────────────────

export const getTodayVsYesterday = () =>
  api.get('/api/dashboard/today-vs-yesterday').then(r => r.data)

// ── Customer order history (5 đơn gần nhất) ──────────────────────────────────
export const getCustomerOrderHistory = (customerId, limit = 5) =>
  api.get(`/api/admin/customers/${customerId}/history`, { params: { page: 1 } })
    .then(r => (r.data.orders ?? []).slice(0, limit))

// ── Drill-down: đơn hàng theo sản phẩm (Dashboard Pareto) ────────────────────

export const getDrillDownOrders = async (productKey, from, to, limit = 50) => {
  const params = { limit }
  if (productKey) params.productKey = productKey
  if (from)       params.from       = from
  if (to)         params.to         = to
  const res = await api.get('/api/orders', { params }).then(r => r.data)
  return (res.data ?? []).map(o => ({
    orderId:  o.ExternalOrderId ?? o.externalOrderId ?? `#${o.SalesKey ?? o.salesKey}`,
    date:     (o.SaleDate ?? o.saleDate ?? '').toString().slice(0, 10),
    channel:  o.ChannelName  ?? o.channelName  ?? '—',
    qty:      o.Quantity     ?? o.quantity     ?? 0,
    revenue:  Number(o.NetRevenue    ?? o.netRevenue    ?? 0),
    status:   o.Status       ?? '—',
  }))
}

// ── Drill-down: danh sách KH theo phân khúc (Dashboard Customer tab) ──────────

export const getDrillDownCustomers = async (segment, limit = 50) => {
  const segMap = { new: 'NEW', returning: 'RETURNING', vip: 'VIP', atrisk: 'AT_RISK' }
  const res = await api.get('/api/customers', {
    params: { segment: segMap[segment] ?? segment, limit },
  }).then(r => r.data)
  return (res.data ?? []).map(c => ({
    customerId:    c.CustomerCode  ?? c.customerCode  ?? `#${c.CustomerId ?? c.customerId}`,
    name:          c.FullName      ?? c.fullName      ?? '—',
    totalOrders:   Number(c.TotalOrders  ?? c.totalOrders  ?? 0),
    totalRevenue:  Number(c.TotalRevenue ?? c.totalRevenue ?? 0),
    lastOrderDate: (c.LastOrderDate ?? c.lastOrderDate ?? '').toString().slice(0, 10),
  }))
}

// ── Product Channel Prices ────────────────────────────────────────────────────

export const getChannelPrices = (productId) =>
  api.get(`/api/products/oltp/${productId}/channel-prices`).then(r => r.data)

export const saveChannelPrice = (productId, dto) =>
  api.post(`/api/products/oltp/${productId}/channel-prices`, dto).then(r => r.data)

// ── Order Notes ───────────────────────────────────────────────────────────────

export const getOrderNotes   = (orderId)        => api.get(`/api/orders/oltp/${orderId}/notes`).then(r => r.data)
export const addOrderNote    = (orderId, note)   => api.post(`/api/orders/oltp/${orderId}/notes`, { note }).then(r => r.data)
export const deleteOrderNote = (orderId, noteId) => api.delete(`/api/orders/oltp/${orderId}/notes/${noteId}`).then(r => r.data)

// ── Facebook Ads Performance ──────────────────────────────────────────────────
export const getFbAds = (from, to) =>
  api.get('/api/dashboard/fb-ads', { params: { from, to } }).then(r => r.data)

// ── Heatmap đơn hàng theo giờ × thứ (OLTP) ───────────────────────────────────
export const getOrderHeatmap = (from, to, channel = null) => {
  const params = { from, to }
  if (channel && channel !== 'all') params.channel = channel
  return api.get('/api/dashboard/heatmap', { params }).then(r => r.data)
}

// ── Phễu trạng thái đơn hàng (OLTP) ─────────────────────────────────────────
export const getOrderFunnel = (from, to, channel = null) => {
  const params = { from, to }
  if (channel && channel !== 'all') params.channel = channel
  return api.get('/api/dashboard/order-funnel', { params }).then(r => r.data)
}

// ── Doanh thu theo tháng × kênh (DW) ─────────────────────────────────────────
export const getMonthlyByChannel = (from, to) =>
  api.get('/api/dashboard/monthly-by-channel', { params: { from, to } }).then(r => r.data)

// ── KPI vận hành: hoàn/huỷ/giao thành công (OLTP) ────────────────────────────
export const getOpsKpi = (from, to, channel = null) => {
  const params = { from, to }
  if (channel && channel !== 'all') params.channel = channel
  return api.get('/api/dashboard/ops-kpi', { params }).then(r => r.data)
}

// ── Chi phí quảng cáo (Ad Spend) ────────────────────────────────────────────
export const getAdSpend = (year, month) =>
  api.get('/api/ad-spend', { params: { year, month } }).then(r => r.data)
export const getAdSpendChannels = () =>
  api.get('/api/ad-spend/channels').then(r => r.data.data ?? [])
export const getAdSpendHistory = (months = 6) =>
  api.get('/api/ad-spend/history', { params: { months } }).then(r => r.data)
export const upsertAdSpend = (dto) =>
  api.put('/api/ad-spend', dto).then(r => r.data)

// ── Tồn kho thực tế (OLTP products + order_items) ────────────────────────────
export const getInventoryReal = (from, to) =>
  api.get('/api/dashboard/inventory-real', { params: { from, to } }).then(r => r.data)

// ── Top sản phẩm theo kênh (OLTP orders × products × channels) ───────────────
export const getTopProductsByChannel = (from, to, limit = 3) =>
  api.get('/api/dashboard/top-products-by-channel', { params: { from, to, limit } })
     .then(r => r.data?.data ?? r.data ?? [])
