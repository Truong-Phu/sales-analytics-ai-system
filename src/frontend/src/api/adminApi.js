import api from './axios'

// Chuẩn hóa user từ backend (isActive:bool → status:string)
function normalizeUser(u) {
  return {
    ...u,
    fullName: u.fullName ?? u.full_name ?? u.username ?? '',
    status:   u.status ?? (u.isActive ? 'active' : 'inactive'),
  }
}

export const getUsers    = ()             => api.get('/api/admin/users').then(r => {
  const raw = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.items ?? [])
  return raw.map(normalizeUser)
})
export const createUser  = (data)         => api.post('/api/admin/users', data)
export const updateUser  = (id, data)     => api.put(`/api/admin/users/${id}`, data)
export const deleteUser  = (id)           => api.delete(`/api/admin/users/${id}`)
export const approveUser = (id)           => api.patch(`/api/admin/users/${id}/approve`)
export const deactivate  = (id)           => api.patch(`/api/admin/users/${id}/deactivate`)
export const activate    = (id)           => api.patch(`/api/admin/users/${id}/activate`)
export const changeRole  = (id, role)     => api.patch(`/api/admin/users/${id}/role`, { role })

export const getAuditLogs = (params = {}) =>
  api.get('/api/admin/audit-logs', { params }).then(r => r.data)
