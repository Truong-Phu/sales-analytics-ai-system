import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import { colors, radius } from '../components/theme'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleLogin = async () => {
    if (!email || !password) { setError('Vui lòng nhập email và mật khẩu'); return }
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      // Navigation tự động xử lý bởi AppNavigator khi user !== null
    } catch (err) {
      const msg = err.response?.data?.message
      setError(
        msg === 'PENDING_APPROVAL'
          ? 'Tài khoản đang chờ phê duyệt'
          : 'Email hoặc mật khẩu không đúng'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Logo */}
      <View style={s.logoBox}>
        <View style={s.logoIcon}>
          <Text style={s.logoText}>📊</Text>
        </View>
        <Text style={s.appName}>SalesAnalytics</Text>
        <Text style={s.appSub}>Hệ thống phân tích bán hàng đa kênh</Text>
      </View>

      {/* Card */}
      <View style={s.card}>
        <Text style={s.title}>Đăng nhập</Text>

        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          placeholder="admin@example.com"
          placeholderTextColor={colors.outline}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={s.label}>Mật khẩu</Text>
        <TextInput
          style={s.input}
          placeholder="••••••••"
          placeholderTextColor={colors.outline}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.surface} />
            : <Text style={s.btnText}>Đăng nhập</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    padding: 24,
  },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoText:  { fontSize: 32 },
  appName:   { fontSize: 22, fontWeight: '700', color: colors.onSurface },
  appSub:    { fontSize: 13, color: colors.outline, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 20 },
  errorBox: {
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,171,0.3)',
    borderRadius: radius.sm, padding: 12, marginBottom: 12,
  },
  errorText: { color: colors.error, fontSize: 13 },
  label: { fontSize: 13, color: colors.outline, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm,
    padding: 14, fontSize: 14, color: colors.onSurface,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
})
