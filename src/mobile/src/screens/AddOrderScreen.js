import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

const CHANNELS = ['Shopee', 'Lazada', 'TikTok Shop', 'Facebook', 'Website']
const PAYMENT  = ['COD', 'MoMo', 'VNPay', 'ZaloPay', 'Chuyển khoản']

export default function AddOrderScreen({ navigation }) {
  const [form, setForm] = useState({
    customerName: '', customerPhone: '', channel: 'Shopee',
    productName: '', quantity: '1', unitPrice: '',
    paymentMethod: 'COD', note: '',
  })
  const [loading, setLoading] = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.customerName || !form.productName || !form.unitPrice) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đủ thông tin bắt buộc (*).')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/orders', {
        customerName:  form.customerName,
        customerPhone: form.customerPhone,
        channel:       form.channel.toLowerCase().replace(' ', '_'),
        items: [{
          productName: form.productName,
          quantity:    parseInt(form.quantity) || 1,
          unitPrice:   parseFloat(form.unitPrice.replace(/\D/g, '')) || 0,
        }],
        paymentMethod: form.paymentMethod,
        note:          form.note,
      })
      Alert.alert('Thành công', 'Đã thêm đơn hàng mới!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message ?? 'Không thể thêm đơn hàng. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const Field = ({ label, required, children }) => (
    <View style={s.field}>
      <Text style={s.label}>{label}{required && <Text style={s.required}> *</Text>}</Text>
      {children}
    </View>
  )

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.pageTitle}>Thêm đơn hàng mới</Text>

        <View style={s.section}>
          <Text style={s.sectionTitle}>THÔNG TIN KHÁCH HÀNG</Text>
          <Field label="Tên khách hàng" required>
            <TextInput style={s.input} placeholder="Nguyễn Văn A"
              placeholderTextColor={colors.outline}
              value={form.customerName} onChangeText={v => set('customerName', v)} />
          </Field>
          <Field label="Số điện thoại">
            <TextInput style={s.input} placeholder="0901234567"
              placeholderTextColor={colors.outline}
              keyboardType="phone-pad"
              value={form.customerPhone} onChangeText={v => set('customerPhone', v)} />
          </Field>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>THÔNG TIN ĐƠN HÀNG</Text>
          <Field label="Kênh bán hàng" required>
            <View style={s.chipRow}>
              {CHANNELS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => set('channel', c)}
                  style={[s.chip, form.channel === c && s.chipActive]}
                >
                  <Text style={[s.chipText, form.channel === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Tên sản phẩm" required>
            <TextInput style={s.input} placeholder="VD: Áo thun trắng size M"
              placeholderTextColor={colors.outline}
              value={form.productName} onChangeText={v => set('productName', v)} />
          </Field>

          <View style={s.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Field label="Số lượng" required>
                <TextInput style={s.input} placeholder="1"
                  placeholderTextColor={colors.outline}
                  keyboardType="numeric"
                  value={form.quantity} onChangeText={v => set('quantity', v)} />
              </Field>
            </View>
            <View style={{ flex: 2 }}>
              <Field label="Đơn giá (₫)" required>
                <TextInput style={s.input} placeholder="150000"
                  placeholderTextColor={colors.outline}
                  keyboardType="numeric"
                  value={form.unitPrice} onChangeText={v => set('unitPrice', v)} />
              </Field>
            </View>
          </View>

          {/* Tổng tiền */}
          {form.unitPrice && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Tổng tiền:</Text>
              <Text style={s.totalValue}>
                ₫{((parseInt(form.quantity) || 1) * (parseFloat(form.unitPrice.replace(/\D/g,'')) || 0)).toLocaleString('vi-VN')}
              </Text>
            </View>
          )}

          <Field label="Phương thức thanh toán">
            <View style={s.chipRow}>
              {PAYMENT.map(p => (
                <TouchableOpacity
                  key={p}
                  onPress={() => set('paymentMethod', p)}
                  style={[s.chip, form.paymentMethod === p && s.chipActive]}
                >
                  <Text style={[s.chipText, form.paymentMethod === p && s.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Field label="Ghi chú">
            <TextInput
              style={[s.input, s.textarea]}
              placeholder="Ghi chú thêm (không bắt buộc)..."
              placeholderTextColor={colors.outline}
              multiline numberOfLines={3}
              value={form.note} onChangeText={v => set('note', v)}
            />
          </Field>
        </View>

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.surface} />
            : <Text style={s.btnText}>💾 Lưu đơn hàng</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content:   { padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.onSurface, marginBottom: 20, marginTop: 8 },
  section: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 13, color: colors.outline, marginBottom: 6 },
  required: { color: colors.error },
  input: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm, padding: 13,
    fontSize: 14, color: colors.onSurface,
  },
  textarea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  chipActive:     { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  chipText:       { fontSize: 13, color: colors.outline },
  chipTextActive: { color: colors.surface, fontWeight: '700' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radius.sm, padding: 12, marginBottom: 14,
  },
  totalLabel: { fontSize: 14, color: colors.outline },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.primary },
  btn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.md, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: colors.surface, fontSize: 16, fontWeight: '700' },
})
