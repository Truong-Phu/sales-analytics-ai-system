import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

export default function ForgotPasswordScreen({ navigation }) {
  const [email,    setEmail]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [devToken, setDevToken] = useState(null)
  const [error,    setError]    = useState('')

  const handleSend = async () => {
    if (!email.trim()) { setError('Vui lòng nhập email'); return }
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSent(true)
      if (res.data?.devToken) setDevToken(res.data.devToken)
    } catch {
      setError('Có lỗi xảy ra. Vui lòng thử lại sau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Quên mật khẩu</Text>
        <Text style={s.sub}>Nhập email tài khoản để nhận mã xác nhận 6 chữ số.</Text>

        {!!error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {sent ? (
          <View>
            <View style={s.successBox}>
              <Text style={s.successText}>
                Nếu email tồn tại, chúng tôi đã gửi mã xác nhận. Vui lòng kiểm tra hộp thư.
              </Text>
            </View>

            {!!devToken && (
              <View style={s.devBox}>
                <Text style={s.devLabel}>DEV MODE — Mã xác nhận:</Text>
                <Text style={s.devToken}>{devToken}</Text>
              </View>
            )}

            <TouchableOpacity
              style={s.btn}
              onPress={() => navigation.navigate('ResetPassword', { email: email.trim() })}
              activeOpacity={0.85}
            >
              <Text style={s.btnText}>Nhập mã & đặt mật khẩu mới</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="email@congty.vn"
              placeholderTextColor={colors.outline}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.surface} />
                : <Text style={s.btnText}>Gửi mã xác nhận</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={s.backRow} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Quay lại đăng nhập</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  inner: { padding: 24, paddingTop: 40 },
  title: { fontSize: 22, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  sub:   { fontSize: 14, color: colors.outline, marginBottom: 24, lineHeight: 20 },
  errorBox: {
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,171,0.3)',
    borderRadius: radius.sm, padding: 12, marginBottom: 16,
  },
  errorText: { color: colors.error, fontSize: 13 },
  successBox: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
    borderRadius: radius.sm, padding: 14, marginBottom: 16,
  },
  successText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  devBox: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: colors.outlineVariant, borderStyle: 'dashed',
  },
  devLabel: { fontSize: 11, color: colors.outline, marginBottom: 6 },
  devToken: { fontSize: 28, fontWeight: '800', color: colors.primary, letterSpacing: 8 },
  label: { fontSize: 13, color: colors.outline, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm,
    padding: 14, fontSize: 14, color: colors.onSurface,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  backRow: { alignItems: 'center', marginTop: 24 },
  backText: { fontSize: 13, color: colors.primary },
})
