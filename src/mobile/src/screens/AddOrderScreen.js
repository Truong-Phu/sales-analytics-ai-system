import React, { useState, useMemo, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, FlatList,
} from 'react-native'
import api from '../api/axios'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'
import { formatMoneyWithSymbol } from '../utils/format'

const PAYMENT = ['COD', 'MoMo', 'VNPay', 'ZaloPay', 'Chuyển khoản']

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  content:   { padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: '700', color: c.onSurface, marginBottom: 20, marginTop: 8 },
  section: {
    backgroundColor: c.surfaceContainerLow,
    borderRadius: radius.md, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: c.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  field:    { marginBottom: 14 },
  label:    { fontSize: 13, color: c.outline, marginBottom: 6 },
  required: { color: c.error },
  input: {
    backgroundColor: c.surfaceContainer,
    borderRadius: radius.sm, padding: 13,
    fontSize: 14, color: c.onSurface,
  },
  textarea:       { height: 80, textAlignVertical: 'top' },
  row:            { flexDirection: 'row' },
  chipRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: c.outlineVariant },
  chipActive:     { backgroundColor: c.primaryContainer, borderColor: c.primary },
  chipText:       { fontSize: 13, color: c.outline },
  chipTextActive: { color: c.surface, fontWeight: '700' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: c.surfaceContainerHighest,
    borderRadius: radius.sm, padding: 12, marginBottom: 14,
  },
  totalLabel: { fontSize: 14, color: c.outline },
  totalValue: { fontSize: 16, fontWeight: '700', color: c.primary },
  btn:        { backgroundColor: c.primaryContainer, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: c.surface, fontSize: 16, fontWeight: '700' },
  // Product search dropdown
  searchResult: {
    backgroundColor: c.surfaceContainer, borderRadius: radius.sm,
    marginTop: 4, borderWidth: 1, borderColor: c.outlineVariant,
    maxHeight: 160,
  },
  searchItem: {
    padding: 10, borderBottomWidth: 1, borderBottomColor: c.outlineVariant,
  },
  searchItemName:  { fontSize: 13, color: c.onSurface, fontWeight: '600' },
  searchItemSub:   { fontSize: 11, color: c.outline, marginTop: 1 },
  selectedProduct: {
    backgroundColor: c.primaryContainer, borderRadius: radius.sm,
    padding: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between',
  },
  selectedProductText: { fontSize: 12, color: c.surface, flex: 1 },
  clearBtn:            { fontSize: 12, color: c.surface, fontWeight: '700', marginLeft: 6 },
})

export default function AddOrderScreen({ navigation }) {
  const { colors } = useTheme()
  const s = useMemo(() => makeStyles(colors), [colors])

  const [form, setForm] = useState({
    customerName: '', customerPhone: '',
    productId: null, productName: '',
    quantity: '1', unitPrice: '',
    paymentMethod: 'COD', note: '',
  })
  const [loading,         setLoading]         = useState(false)
  const [searchQuery,     setSearchQuery]     = useState('')
  const [searchResults,   setSearchResults]   = useState([])
  const [searchLoading,   setSearchLoading]   = useState(false)
  const [showDropdown,    setShowDropdown]    = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // Tìm sản phẩm theo tên
  const handleProductSearch = useCallback(async (text) => {
    setSearchQuery(text)
    set('productName', text)
    set('productId', null)
    if (text.length < 2) { setSearchResults([]); setShowDropdown(false); return }
    setSearchLoading(true)
    try {
      const res = await api.get('/api/pos/products/search', { params: { search: text, limit: 8 } })
      const items = res.data?.items ?? res.data?.data ?? res.data ?? []
      setSearchResults(Array.isArray(items) ? items : [])
      setShowDropdown(true)
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  const selectProduct = (product) => {
    const id    = product.productId ?? product.product_id ?? product.id
    const name  = product.productName ?? product.product_name ?? product.name ?? ''
    const price = product.basePrice ?? product.salePrice ?? product.price ?? product.unit_price ?? ''
    set('productId',   id)
    set('productName', name)
    setSearchQuery(name)
    if (price) set('unitPrice', String(price))
    setSearchResults([])
    setShowDropdown(false)
  }

  const clearProduct = () => {
    set('productId', null)
    set('productName', '')
    setSearchQuery('')
    setSearchResults([])
  }

  const handleSubmit = async () => {
    if (!form.customerName || !form.productName || !form.unitPrice) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập đủ thông tin bắt buộc (*).')
      return
    }
    if (!form.productId) {
      Alert.alert('Chọn sản phẩm', 'Vui lòng chọn sản phẩm từ danh sách gợi ý.')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/pos/orders', {
        customerName:  form.customerName,
        customerPhone: form.customerPhone,
        paymentMethod: form.paymentMethod,
        note:          form.note,
        usePoints:     0,
        items: [{
          productId: form.productId,
          qty:       parseInt(form.quantity) || 1,
          price:     parseFloat(String(form.unitPrice).replace(/\D/g, '')) || 0,
        }],
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
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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

          {/* Product search */}
          <Field label="Tìm sản phẩm" required>
            {form.productId ? (
              <View style={s.selectedProduct}>
                <Text style={s.selectedProductText} numberOfLines={1}>
                  ✓ {form.productName}
                </Text>
                <TouchableOpacity onPress={clearProduct}>
                  <Text style={s.clearBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder="Nhập tên sản phẩm để tìm..."
                    placeholderTextColor={colors.outline}
                    value={searchQuery}
                    onChangeText={handleProductSearch}
                  />
                  {searchLoading && (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                  )}
                </View>
                {showDropdown && searchResults.length > 0 && (
                  <View style={s.searchResult}>
                    <FlatList
                      data={searchResults}
                      keyExtractor={(item, i) => String(item.productId ?? item.id ?? i)}
                      keyboardShouldPersistTaps="handled"
                      renderItem={({ item }) => (
                        <TouchableOpacity style={s.searchItem} onPress={() => selectProduct(item)}>
                          <Text style={s.searchItemName}>{item.productName ?? item.product_name ?? item.name}</Text>
                          <Text style={s.searchItemSub}>
                            {item.sku ? `SKU: ${item.sku}` : ''}{item.basePrice ? ` · ${formatMoneyWithSymbol(item.basePrice)}` : ''}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                )}
              </>
            )}
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
                  value={String(form.unitPrice)} onChangeText={v => set('unitPrice', v)} />
              </Field>
            </View>
          </View>

          {/* Tổng tiền */}
          {form.unitPrice ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Tổng tiền:</Text>
              <Text style={s.totalValue}>
                {formatMoneyWithSymbol((parseInt(form.quantity) || 1) * (parseFloat(String(form.unitPrice).replace(/\D/g,'')) || 0))}
              </Text>
            </View>
          ) : null}

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
