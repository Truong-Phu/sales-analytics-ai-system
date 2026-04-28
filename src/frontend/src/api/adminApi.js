import api from './axios'

export const getUsers    = ()             => api.get('/api/admin/users').then(r => r.data)
export const approveUser = (id)           => api.patch(`/api/admin/users/${id}/approve`)
export const deactivate  = (id)           => api.patch(`/api/admin/users/${id}/deactivate`)
export const activate    = (id)           => api.patch(`/api/admin/users/${id}/activate`)
export const changeRole  = (id, role)     => api.patch(`/api/admin/users/${id}/role`, { role })

export const getAuditLogs = (params = {}) =>
  api.get('/api/admin/audit-logs', { params }).then(r => r.data)
