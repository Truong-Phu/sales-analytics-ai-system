import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: đính kèm access token ──────────────────────────────
api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Gửi ngôn ngữ theo header
  const lang = localStorage.getItem('lang') ?? 'vi'
  config.headers['Accept-Language'] = lang
  return config
})

// ── Response interceptor: auto-refresh token khi 401 ────────────────────────
let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true

      if (isRefreshing) {
        // Queue các request khác chờ token mới
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      isRefreshing = true
      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (!refreshToken) throw new Error('No refresh token')

        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken })
        const newToken = data.accessToken

        sessionStorage.setItem('access_token', newToken)
        localStorage.setItem('refresh_token', data.refreshToken)

        refreshQueue.forEach(p => p.resolve(newToken))
        refreshQueue = []

        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        refreshQueue.forEach(p => p.reject(err))
        refreshQueue = []
        sessionStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
