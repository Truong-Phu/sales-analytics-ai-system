import React, { createContext, useState, useEffect, useCallback, useContext } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../api/axios'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch { return null }
}

// Polyfill atob cho React Native
function atob(base64) {
  return Buffer.from(base64, 'base64').toString('binary')
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem('access_token').then(token => {
      if (token) {
        const p = parseJwt(token)
        if (p && p.exp * 1000 > Date.now()) {
          setUser({
            id:    p.sub,
            name:  p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? p.name,
            email: p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? p.email,
            role:  p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? p.role,
          })
        }
      }
      setLoading(false)
    })
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    await AsyncStorage.setItem('access_token', data.accessToken)
    await AsyncStorage.setItem('refresh_token', data.refreshToken)
    const p = parseJwt(data.accessToken)
    const u = {
      id:    p.sub,
      name:  p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ?? p.name,
      email: p['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ?? p.email,
      role:  p['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ?? p.role,
    }
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token'])
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
