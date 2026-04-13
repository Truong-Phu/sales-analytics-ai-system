import api from './axios'

export const getUsers    = ()             => api.get('/api/admin/users').then(r => r.data)
export const approveUser = (id)           => api.post(`/api/admin/users/${id}/approve`)
export const deactivate  = (id)           => api.post(`/api/admin/users/${id}/deactivate`)
export const activate    = (id)           => api.post(`/api/admin/users/${id}/activate`)
export const changeRole  = (id, role)     => api.put(`/api/admin/users/${id}/role`, { role })
