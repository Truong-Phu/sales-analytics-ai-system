import React, { useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

export default function LoginScreen({ navigation }) {
  const { login }   = useAuth()
  const { colors }  = useTheme()
  const s           = useMemo(() => makeStyles(colors), [colors])

  const [identifier,    setIdentifier]    = useState('')
  const [password,      setPassword]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [showPassword,  setShowPassword]  = useState(false)

  const handleLogin = async () => {
    if (!identifier || !password) {
      setError('Vui lòng nhập Email/Tên đăng nhập và mật khẩu')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(identifier.trim(), password)
    } catch (err) {
      if (!err.response) {
        setError('Không thể kết nối server. Kiểm tra IP backend và kết nối mạng.')
        return
      }
      const msg = err.response?.data?.message
      setError(
        msg === 'PENDING_APPROVAL'
          ? 'Tài khoản đang chờ phê duyệt. Vui lòng chờ phê duyệt từ quản trị viên.'
          : (err.response?.status === 403
            ? (msg ?? 'Tài khoản bị khóa hoặc không có quyền truy cập')
            : (msg ?? 'Email/Tên đăng nhập hoặc mật khẩu không đúng'))
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
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
            <View style={{ width: 8, height: 14, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 2 }} />
            <View style={{ width: 8, height: 20, backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 2 }} />
            <View style={{ width: 8, height: 27, backgroundColor: '#ffffff', borderRadius: 2 }} />
          </View>
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

        <Text style={s.label}>Email hoặc Tên đăng nhập</Text>
        <TextInput
          style={s.input}
          placeholder="Nhập email hoặc tên đăng nhập"
          placeholderTextColor={colors.outline}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={identifier}
          onChangeText={setIdentifier}
        />

        <Text style={s.label}>Mật khẩu</Text>
        <View style={s.passwordRow}>
          <TextInput
            style={[s.input, s.passwordInput]}
            placeholder="••••••••"
            placeholderTextColor={colors.outline}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowPassword(v => !v)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.outline}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={s.forgotRow}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={s.forgotText}>Quên mật khẩu?</Text>
        </TouchableOpacity>

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

const makeStyles = (c) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
    justifyContent: 'center',
    padding: 24,
  },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoIcon: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  appName:   { fontSize: 22, fontWeight: '700', color: c.onSurface },
  appSub:    { fontSize: 13, color: c.outline, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: c.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: c.outlineVariant,
  },
  title: { fontSize: 18, fontWeight: '700', color: c.onSurface, marginBottom: 20 },
  errorBox: {
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,171,0.3)',
    borderRadius: radius.sm, padding: 12, marginBottom: 12,
  },
  errorText: { color: c.error, fontSize: 13 },
  label: { fontSize: 13, color: c.outline, marginBottom: 6 },
  input: {
    backgroundColor: c.surfaceContainer,
    borderRadius: radius.sm,
    padding: 14, fontSize: 14, color: c.onSurface,
    marginBottom: 16,
  },
  passwordRow:  { position: 'relative', marginBottom: 0 },
  passwordInput:{ marginBottom: 0, paddingRight: 48 },
  eyeBtn:       { position: 'absolute', right: 14, top: 14 },
  forgotRow:    { alignItems: 'flex-end', marginTop: 8, marginBottom: 20 },
  forgotText:   { fontSize: 13, color: c.primary },
  btn: {
    backgroundColor: c.primaryContainer,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: c.surface, fontSize: 15, fontWeight: '700' },
})
