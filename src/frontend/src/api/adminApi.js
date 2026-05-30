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

// ── Payroll API ───────────────────────────────────────────────────────────────
export const getPayroll        = (year, month)    =>
  api.get('/api/payroll', { params: { year, month } }).then(r => r.data)

export const upsertPayroll     = (dto)            =>
  api.post('/api/payroll', dto).then(r => r.data)

export const approvePayroll    = (id)             =>
  api.post(`/api/payroll/${id}/approve`).then(r => r.data)

export const unlockPayroll     = (id)             =>
  api.post(`/api/payroll/${id}/unlock`).then(r => r.data)

export const payPayroll        = (id)             =>
  api.post(`/api/payroll/${id}/pay`).then(r => r.data)

export const sendPayslip       = (id)             =>
  api.post(`/api/payroll/${id}/send-email`).then(r => r.data)

export const getPayrollSalarySummary = (year, month) =>
  api.get('/api/payroll/salary-summary', { params: { year, month } }).then(r => r.data)
