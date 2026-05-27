import React, { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { storage } from '../api/storage'
import api from '../api/axios'
import { registerForPushNotifications } from '../services/pushNotification'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    // atob chỉ decode Latin-1 → cần escape từng byte rồi decodeURIComponent để xử lý UTF-8 (tiếng Việt)
    const bytes = globalThis.atob(base64)
    const json  = decodeURIComponent(
      bytes.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
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

  // Fetch profile mới nhất từ /api/users/me để sync fullName, avatarUrl sau khi đổi trên web
  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await api.get('/api/users/me')
      const d   = res.data?.data ?? res.data
      if (!d) return
      setUser(prev => {
        if (!prev) return prev
        return {
          ...prev,
          fullName:  d.fullName  ?? d.full_name  ?? prev.fullName,
          name:      d.fullName  ?? d.full_name  ?? prev.name,
          avatarUrl: d.avatarUrl ?? d.avatar_url ?? prev.avatarUrl,
          email:     d.email     ?? prev.email,
          phone:     d.phone     ?? prev.phone,
        }
      })
    } catch {
      // Giữ nguyên dữ liệu JWT nếu API lỗi
    }
  }, [])

  useEffect(() => {
    storage.getItem('access_token')
      .then(token => {
        if (token) {
          const p = parseJwt(token)
          if (p && p.exp * 1000 > Date.now()) {
            const username = p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? p.name ?? ''
            setUser({
              id:          p.sub,
              username,
              name:        p.fullName || username,
              fullName:    p.fullName || '',
              email:       p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? p.email,
              role:        p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? p.role,
              companyName: p.company_name ?? p.companyName ?? null,
              lang:        p.lang ?? 'vi',
            })
            // Fetch profile mới nhất + plan sau khi xác nhận token còn hạn
            fetchUserProfile()
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
    const username = p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? p.name ?? ''
    const u = {
      id:          p.sub,
      username,
      name:        p.fullName || username,
      fullName:    p.fullName || '',
      email:       p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? p.email,
      role:        p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? p.role,
      companyName: p.company_name ?? p.companyName ?? null,
      lang:        p.lang ?? 'vi',
    }
    setUser(u)
    registerForPushNotifications().catch(() => {})
    // Fetch profile mới nhất + plan sau khi login (background, không await)
    fetchUserProfile()
    fetchPlan()
    return u
  }, [fetchPlan, fetchUserProfile])

  const logout = useCallback(async () => {
    await storage.multiRemove(['access_token', 'refresh_token'])
    setUser(null)
    setPlan('Free')
  }, [])

  return (
    <AuthContext.Provider value={{ user, plan, loading, login, logout, refreshProfile: fetchUserProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
