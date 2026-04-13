import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const BASE_URL = 'http://10.0.2.2:5000' // Android emulator → localhost; thay bằng IP thật khi test device

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Đính kèm access token vào mọi request
api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('access_token')
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
        const refreshToken = await AsyncStorage.getItem('refresh_token')
        if (!refreshToken) throw new Error('No refresh token')

        const { data } = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken })
        await AsyncStorage.setItem('access_token', data.accessToken)
        await AsyncStorage.setItem('refresh_token', data.refreshToken)

        queue.forEach(p => p.resolve(data.accessToken))
        queue = []
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        queue.forEach(p => p.reject(err))
        queue = []
        await AsyncStorage.multiRemove(['access_token', 'refresh_token'])
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api
