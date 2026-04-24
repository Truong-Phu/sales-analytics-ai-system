import { createContext, useState, useEffect, useCallback } from 'react'
import api from '../api/axios'

export const AuthContext = createContext(null)

// Giải mã JWT payload (không verify signature – backend đã verify)
function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // { id, name, email, role, lang }
  const [loading, setLoading] = useState(true)   // kiểm tra token lúc khởi động

  // Khôi phục session từ token đang có
  useEffect(() => {
    const token = sessionStorage.getItem('access_token')
    if (token) {
      const payload = parseJwt(token)
      if (payload && payload.exp * 1000 > Date.now()) {
        setUser({
          id:    payload.sub,
          name:  payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? payload.name,
          email: payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? payload.email,
          role:  payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload.role,
          lang:  localStorage.getItem('lang') ?? 'vi',
        })
      } else {
        // Token hết hạn → xóa
        sessionStorage.removeItem('access_token')
      }
    }
    setLoading(false)
  }, [])

  // Đăng nhập
  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/api/auth/login', { username, password })
    sessionStorage.setItem('access_token', data.accessToken)
    localStorage.setItem('refresh_token', data.refreshToken)

    const payload = parseJwt(data.accessToken)
    const u = {
      id:    payload.sub,
      name:  payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? payload.name,
      email: payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? payload.email,
      role:  payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload.role,
      lang:  data.preferredLanguage ?? 'vi',
    }
    localStorage.setItem('lang', u.lang)
    setUser(u)
    return u
  }, [])

  // Đăng xuất
  const logout = useCallback(() => {
    sessionStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
    window.location.href = '/login'
  }, [])

  // Đổi ngôn ngữ ưa thích
  const setLang = useCallback((lang) => {
    localStorage.setItem('lang', lang)
    setUser(prev => prev ? { ...prev, lang } : prev)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setLang }}>
      {children}
    </AuthContext.Provider>
  )
}
