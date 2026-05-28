import api from './axios'

export const getInventoryOverview = (params = {}) =>
  api.get('/api/inventory/dashboard/overview', { params }).then(r => r.data)

export const getStockMovement = (params = {}) =>
  api.get('/api/inventory/dashboard/stock-movement', { params }).then(r => r.data)

export const getLowStock = (params = {}) =>
  api.get('/api/inventory/dashboard/low-stock', { params }).then(r => r.data)

export const getProductVelocity = (params = {}) =>
  api.get('/api/inventory/dashboard/product-velocity', { params }).then(r => r.data)

export const getSupplierPerformanceDashboard = (params = {}) =>
  api.get('/api/inventory/dashboard/supplier-performance', { params }).then(r => r.data)

export const getInventoryRecommendations = (params = {}) =>
  api.get('/api/inventory/recommendations', { params }).then(r => r.data)
