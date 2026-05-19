import React, { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { storage } from '../api/storage'
import api from '../api/axios'
import { registerForPushNotifications } from '../services/pushNotification'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = globalThis.atob(base64)
    return JSON.parse(json)
  } catch { return null }
}

// Chuẩn hóa plan string: 'pro' → 'Pro', 'free' → 'Free'
function normalizePlan(raw) {
  if (!raw) return 'Free'
  const s = String(raw).toLowerCase()
  if (s === 'pro') return 'Pro'
  if (s === 'enterprise') return 'Enterprise'
  return 'Free'
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [plan,    setPlan]    = useState('Free')
  const [loading, setLoading] = useState(true)

  // Fetch gói dịch vụ từ /api/subscription (fire-and-forget, không block login)
  const fetchPlan = useCallback(async () => {
    try {
      const res = await api.get('/api/subscription')
      const sub = res.data?.data ?? res.data
      if (sub?.plan) setPlan(normalizePlan(sub.plan))
    } catch {
      // Nếu lỗi → giữ nguyên 'Free' (thay vì crash app)
    }
  }, [])

  useEffect(() => {
    storage.getItem('access_token')
      .then(token => {
        if (token) {
          const p = parseJwt(token)
          if (p && p.exp * 1000 > Date.now()) {
            setUser({
              id:    p.sub,
              name:  p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? p.name,
              email: p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? p.email,
              role:  p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? p.role,
            })
            // Fetch plan sau khi xác nhận token còn hạn
            fetchPlan()
          } else {
            storage.removeItem('access_token')
          }
        }
      })
      .catch(err => console.warn('[AuthContext] storage error:', err))
      .finally(() => setLoading(false))
  }, [fetchPlan])

  const login = useCallback(async (identifier, password) => {
    const isEmail = typeof identifier === 'string' && identifier.includes('@')
    const body = isEmail
      ? { email: identifier, password }
      : { username: identifier, password }
    const { data: res } = await api.post('/api/auth/login', body)
    const tokenData = res.data
    await storage.setItem('access_token', tokenData.accessToken)
    await storage.setItem('refresh_token', tokenData.refreshToken)
    const p = parseJwt(tokenData.accessToken)
    const u = {
      id:    p.sub,
      name:  p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? p.name,
      email: p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? p.email,
      role:  p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? p.role,
    }
    setUser(u)
    registerForPushNotifications().catch(() => {})
    // Fetch plan sau khi login (background, không await)
    fetchPlan()
    return u
  }, [fetchPlan])

  const logout = useCallback(async () => {
    await storage.multiRemove(['access_token', 'refresh_token'])
    setUser(null)
    setPlan('Free')
  }, [])

  return (
    <AuthContext.Provider value={{ user, plan, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
