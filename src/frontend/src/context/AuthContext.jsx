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

// Chuẩn hóa plan name về lowercase ('free' | 'pro' | 'enterprise')
function normalizePlan(raw) {
  if (!raw) return 'free'
  const p = raw.toLowerCase().trim()
  return ['pro', 'enterprise'].includes(p) ? p : 'free'
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // { id, name, email, role, lang }
  const [loading, setLoading] = useState(true)   // kiểm tra token lúc khởi động
  const [plan, setPlan]       = useState('free') // 'free' | 'pro' | 'enterprise'

  // Lấy thông tin gói dịch vụ từ backend (không block render)
  const fetchPlan = useCallback(async () => {
    try {
      const r = await api.get('/api/subscription')
      setPlan(normalizePlan(r.data?.data?.plan))
    } catch {
      // SuperAdmin hoặc không có subscription → giữ mặc định 'free'
    }
  }, [])

  // Khôi phục session từ token đang có
  useEffect(() => {
    const token = sessionStorage.getItem('access_token')
    if (token) {
      const payload = parseJwt(token)
      if (payload && payload.exp * 1000 > Date.now()) {
        const baseUser = {
          id:                  payload.sub,
          name:                payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? payload.name,
          email:               payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? payload.email,
          role:                (() => { const r = (payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload.role ?? '').trim(); return r ? r.charAt(0).toUpperCase() + r.slice(1) : r })(),
          lang:                localStorage.getItem('lang') ?? 'vi',
          // Các field cần thiết để route guard hoạt động đúng sau khi reload trang
          isSuperAdmin:        payload['is_super_admin'] === 'True' || payload['is_super_admin'] === true,
          companyId:           payload['company_id'] ?? undefined,
          companySlug:         payload['company_slug'] ?? undefined,
          onboardingCompleted: true,
        }
        setUser(baseUser)
        // Fetch plan + profile đầy đủ — không block việc render
        fetchPlan()
        api.get('/api/users/me')
          .then(r => {
            const d = r.data
            setUser(prev => prev ? {
              ...prev,
              fullName: d.fullName ?? d.full_name ?? prev.name,
              avatarUrl: d.avatarUrl ?? d.avatar_url ?? prev.avatarUrl,
              phone:    d.phone     ?? prev.phone,
              timezone: d.timezone  ?? prev.timezone,
            } : prev)
          })
          .catch(() => {})
      } else {
        // Token hết hạn → xóa
        sessionStorage.removeItem('access_token')
      }
    }
    setLoading(false)
  }, [fetchPlan])

  // Đăng nhập – nhận email hoặc username (hoặc cả hai)
  const login = useCallback(async (email, username, password) => {
    const body = { password }
    if (email)    body.email    = email
    if (username) body.username = username
    // Backend trả về { success, data: { accessToken, refreshToken, ... } }
    const { data: res } = await api.post('/api/auth/login', body)
    const tokenData = res.data
    sessionStorage.setItem('access_token', tokenData.accessToken)
    localStorage.setItem('refresh_token', tokenData.refreshToken)

    const payload = parseJwt(tokenData.accessToken)
    const u = {
      id:                  payload.sub,
      name:                payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? payload.name,
      email:               payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? payload.email,
      role:                (() => { const r = (payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload.role ?? '').trim(); return r ? r.charAt(0).toUpperCase() + r.slice(1) : r })(),
      lang:                tokenData.preferredLanguage ?? 'vi',
      companyId:           tokenData.companyId,
      companySlug:         tokenData.companySlug,
      isSuperAdmin:        tokenData.isSuperAdmin ?? false,
      onboardingCompleted: tokenData.onboardingCompleted ?? true,
    }
    localStorage.setItem('lang', u.lang)
    setUser(u)
    fetchPlan()
    return u
  }, [fetchPlan])

  // Đăng ký tài khoản Owner mới (tạo company + subscription)
  const register = useCallback(async (formData) => {
    // Backend trả về { success, message, data: { accessToken, refreshToken, ... } }
    const { data: res } = await api.post('/api/auth/register', formData)
    const tokenData = res.data
    sessionStorage.setItem('access_token', tokenData.accessToken)
    localStorage.setItem('refresh_token', tokenData.refreshToken)

    const payload = parseJwt(tokenData.accessToken)
    const u = {
      id:                  payload.sub,
      name:                payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? payload.name,
      email:               payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? payload.email,
      role:                (() => { const r = (payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? payload.role ?? '').trim(); return r ? r.charAt(0).toUpperCase() + r.slice(1) : r })(),
      lang:                'vi',
      companyId:           tokenData.companyId,
      companySlug:         tokenData.companySlug,
      isSuperAdmin:        false,
      onboardingCompleted: false,
    }
    localStorage.setItem('lang', 'vi')
    setUser(u)
    fetchPlan()
    return u
  }, [fetchPlan])

  // Đăng xuất – xóa token và state; navigation do component gọi xử lý
  const logout = useCallback(() => {
    sessionStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
    setPlan('free')
  }, [])

  // Đổi ngôn ngữ ưa thích
  const setLang = useCallback((lang) => {
    localStorage.setItem('lang', lang)
    setUser(prev => prev ? { ...prev, lang } : prev)
  }, [])

  // Cập nhật một số field trong user context (sau khi sửa profile, upload avatar…)
  const updateUser = useCallback((fields) => {
    setUser(prev => prev ? { ...prev, ...fields } : prev)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, plan, login, register, logout, setLang, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}
