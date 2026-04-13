import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

export default function ChangePasswordScreen({ navigation }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.current || !form.next || !form.confirm) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đầy đủ các trường.')
      return
    }
    if (form.next !== form.confirm) {
      Alert.alert('Không khớp', 'Mật khẩu mới và xác nhận không khớp.')
      return
    }
    if (form.next.length < 8) {
      Alert.alert('Quá ngắn', 'Mật khẩu phải có ít nhất 8 ký tự.')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: form.current,
        newPassword:     form.next,
      })
      Alert.alert('Thành công', 'Đã đổi mật khẩu thành công!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message ?? 'Không thể đổi mật khẩu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Đổi mật khẩu</Text>

        <View style={s.card}>
          {[
            { key: 'current', label: 'Mật khẩu hiện tại' },
            { key: 'next',    label: 'Mật khẩu mới'      },
            { key: 'confirm', label: 'Xác nhận mật khẩu' },
          ].map((field, i) => (
            <View key={field.key} style={i > 0 ? { marginTop: 16 } : {}}>
              <Text style={s.label}>{field.label}</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor={colors.outline}
                secureTextEntry
                value={form[field.key]}
                onChangeText={v => set(field.key, v)}
              />
            </View>
          ))}

          <View style={s.btnRow}>
            <TouchableOpacity
              style={s.btnCancel}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Text style={s.btnCancelText}>Hủy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.surface} />
                : <Text style={s.btnText}>Lưu thay đổi</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content:   { padding: 20 },
  title: {
    fontSize: 20, fontWeight: '700', color: colors.onSurface,
    marginBottom: 20, marginTop: 8,
  },
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 20,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  label: { fontSize: 13, color: colors.outline, marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm, padding: 13,
    fontSize: 14, color: colors.onSurface,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  btnCancel: {
    flex: 1, backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center',
  },
  btnCancelText: { color: colors.onSurface, fontSize: 15, fontWeight: '600' },
  btn: {
    flex: 2, backgroundColor: colors.primaryContainer,
    borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
})
