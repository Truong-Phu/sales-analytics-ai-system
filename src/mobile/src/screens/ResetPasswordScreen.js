import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

export default function ResetPasswordScreen({ navigation, route }) {
  const emailFromParams = route.params?.email ?? ''

  const [form, setForm] = useState({
    email:           emailFromParams,
    token:           '',
    newPassword:     '',
    confirmPassword: '',
  })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  const set = field => val => setForm(f => ({ ...f, [field]: val }))

  const handleReset = async () => {
    if (form.newPassword !== form.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }
    if (form.newPassword.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        email:           form.email,
        token:           form.token,
        newPassword:     form.newPassword,
        confirmPassword: form.confirmPassword,
      })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Token không hợp lệ hoặc đã hết hạn.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <View style={s.successContainer}>
        <Text style={s.successEmoji}>✅</Text>
        <Text style={s.successTitle}>Đặt lại mật khẩu thành công!</Text>
        <Text style={s.successSub}>Bạn có thể đăng nhập bằng mật khẩu mới.</Text>
        <TouchableOpacity
          style={[s.btn, { marginTop: 24 }]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={s.btnText}>Về trang đăng nhập</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Đặt mật khẩu mới</Text>
        <Text style={s.sub}>Nhập mã 6 chữ số từ email và mật khẩu mới của bạn.</Text>

        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          placeholder="email@congty.vn"
          placeholderTextColor={colors.outline}
          autoCapitalize="none"
          keyboardType="email-address"
          value={form.email}
          onChangeText={set('email')}
        />

        <Text style={s.label}>Mã xác nhận (6 chữ số)</Text>
        <TextInput
          style={[s.input, s.otpInput]}
          placeholder="_ _ _ _ _ _"
          placeholderTextColor={colors.outline}
          keyboardType="number-pad"
          maxLength={6}
          value={form.token}
          onChangeText={set('token')}
        />

        <Text style={s.label}>Mật khẩu mới</Text>
        <TextInput
          style={s.input}
          placeholder="Tối thiểu 8 ký tự"
          placeholderTextColor={colors.outline}
          secureTextEntry
          value={form.newPassword}
          onChangeText={set('newPassword')}
        />

        <Text style={s.label}>Xác nhận mật khẩu mới</Text>
        <TextInput
          style={s.input}
          placeholder="Nhập lại mật khẩu"
          placeholderTextColor={colors.outline}
          secureTextEntry
          value={form.confirmPassword}
          onChangeText={set('confirmPassword')}
        />

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleReset}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.surface} />
            : <Text style={s.btnText}>Đặt mật khẩu mới</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.backRow} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Quay lại</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: colors.surface },
  inner:            { padding: 24, paddingTop: 40 },
  title:            { fontSize: 22, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  sub:              { fontSize: 14, color: colors.outline, marginBottom: 24, lineHeight: 20 },
  errorBox: {
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,171,0.3)',
    borderRadius: radius.sm, padding: 12, marginBottom: 16,
  },
  errorText:  { color: colors.error, fontSize: 13 },
  label:      { fontSize: 13, color: colors.outline, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm,
    padding: 14, fontSize: 14, color: colors.onSurface,
    marginBottom: 16,
  },
  otpInput:   { textAlign: 'center', fontSize: 22, fontWeight: '800', letterSpacing: 10 },
  btn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:    { color: colors.surface, fontSize: 15, fontWeight: '700' },
  backRow:    { alignItems: 'center', marginTop: 24 },
  backText:   { fontSize: 13, color: colors.primary },
  // success state
  successContainer: {
    flex: 1, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  successEmoji:  { fontSize: 64, marginBottom: 16 },
  successTitle:  { fontSize: 20, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
  successSub:    { fontSize: 14, color: colors.outline, marginTop: 8, textAlign: 'center' },
})
