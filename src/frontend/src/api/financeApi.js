import api from './axios'

const BASE = '/api/finance'

export const getProfitOverview  = (params = {}) =>
  api.get(`${BASE}/profit/overview`,    { params }).then(r => r.data)

export const getProfitByChannel = (params = {}) =>
  api.get(`${BASE}/profit/by-channel`,  { params }).then(r => r.data)

export const getProfitByProduct = (params = {}) =>
  api.get(`${BASE}/profit/by-product`,  { params }).then(r => r.data)

export const getProfitByDate    = (params = {}) =>
  api.get(`${BASE}/profit/by-date`,     { params }).then(r => r.data)

export const getProfitOrders    = (params = {}) =>
  api.get(`${BASE}/profit/orders`,      { params }).then(r => r.data)

export const getFeeConfigs      = ()    =>
  api.get(`${BASE}/fee-configs`).then(r => r.data)

export const updateFeeConfig    = (id, dto) =>
  api.put(`${BASE}/fee-configs/${id}`, dto).then(r => r.data)
