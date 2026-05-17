import React, { createContext, useState, useEffect, useCallback, useContext } from 'react'
import { storage } from '../api/storage'
import api from '../api/axios'
import { registerForPushNotifications } from '../services/pushNotification'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    // Expo SDK 44+ cung cấp globalThis.atob sẵn
    const json = globalThis.atob(base64)
    return JSON.parse(json)
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

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
          } else {
            storage.removeItem('access_token')
          }
        }
      })
      .catch(err => console.warn('[AuthContext] storage error:', err))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (identifier, password) => {
    // Phân biệt email hay username để gửi đúng field cho backend
    const isEmail = typeof identifier === 'string' && identifier.includes('@')
    const body = isEmail
      ? { email: identifier, password }
      : { username: identifier, password }
    // Backend trả về { success: true, data: { accessToken, refreshToken, ... } }
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
    // Đăng ký push notification sau khi login (fire-and-forget)
    registerForPushNotifications().catch(() => {})
    return u
  }, [])

  const logout = useCallback(async () => {
    await storage.multiRemove(['access_token', 'refresh_token'])
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
