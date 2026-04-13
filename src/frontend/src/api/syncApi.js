import api from './axios'

export const getSyncStatus  = ()       => api.get('/api/datasync/status').then(r => r.data)
export const triggerSync    = (source) => api.post('/api/datasync/trigger', { source })
export const getEtlStatus   = ()       => api.get('/api/etl/status').then(r => r.data)
export const triggerEtl     = (pipeline) => api.post('/api/etl/trigger', { pipeline })
