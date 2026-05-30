import axios from 'axios'
import { storage } from './storage'

// Ưu tiên biến môi trường EXPO_PUBLIC_API_URL từ .env
// Fallback: IP LAN của máy tính (thay 192.168.1.8 bằng IP thật của bạn)
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:5136'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
    // Bypass ngrok browser warning page khi dùng ngrok tunnel trong dev
    'ngrok-skip-browser-warning': 'true',
  },
})

// Đính kèm access token vào mọi request
api.interceptors.request.use(async config => {
  const token = await storage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['Accept-Language'] = 'vi'
  return config
})

// Auto-refresh khi 401
let isRefreshing = false
let queue = []

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }

      isRefreshing = true
      try {
        const refreshToken = await storage.getItem('refresh_token')
        if (!refreshToken) throw new Error('No refresh token')

        // Backend trả về { success: true, data: { accessToken, refreshToken } }
        const { data: res } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken })
        const tokenData = res.data
        await storage.setItem('access_token', tokenData.accessToken)
        await storage.setItem('refresh_token', tokenData.refreshToken)

        queue.forEach(p => p.resolve(tokenData.accessToken))
        queue = []
        original.headers.Authorization = `Bearer ${tokenData.accessToken}`
        return api(original)
      } catch {
        queue.forEach(p => p.reject(err))
        queue = []
        await storage.multiRemove(['access_token', 'refresh_token'])
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
