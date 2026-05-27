import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Modal, Alert,
  KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
} from 'react-native'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

function formatMoney(value) {
  if (value == null || isNaN(value)) return '0'
  const n = Number(value)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}
function formatMoneyFull(v) {
  if (!Number.isFinite(Number(v))) return '0'
  return Number(v).toLocaleString('vi-VN')
}

const MOCK_PRODUCTS = [
  { id: 1, name: 'Áo thun Unisex oversize',   price: 189_000, stock: 45, category: 'Áo'       },
  { id: 2, name: 'Quần jogger cotton',         price: 279_000, stock: 12, category: 'Quần'     },
  { id: 3, name: 'Váy hoa midi dáng xòe',     price: 349_000, stock: 8,  category: 'Váy'      },
  { id: 4, name: 'Áo khoác dù unisex',        price: 459_000, stock: 20, category: 'Áo'       },
  { id: 5, name: 'Giày sneaker trắng',         price: 599_000, stock: 28, category: 'Giày'     },
  { id: 6, name: 'Túi tote canvas',            price: 149_000, stock: 35, category: 'Phụ kiện' },
  { id: 7, name: 'Nón bucket cotton',          price: 119_000, stock: 50, category: 'Phụ kiện' },
  { id: 8, name: 'Dép quai hậu EVA',           price: 199_000, stock: 18, category: 'Giày'     },
]

const PAYMENT_METHODS = [
  { key: 'cash',     label: 'Tiền mặt',     emoji: '💵' },
  { key: 'transfer', label: 'Chuyển khoản', emoji: '🏦' },
  { key: 'card',     label: 'Thẻ',          emoji: '💳' },
]

function ProductCard({ item, onAdd, colors }) {
  const outOfStock = (item.stock ?? 0) <= 0
  const lowStock   = !outOfStock && (item.stock ?? 0) < 5
  const stockColor = outOfStock ? colors.danger : lowStock ? colors.warning : colors.outline
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      marginHorizontal: 10, marginBottom: 6,
      borderRadius: radius.md, padding: 10,
      borderWidth: 1, borderColor: colors.outlineVariant,
      opacity: outOfStock ? 0.5 : 1,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.onSurface, marginBottom: 2 }} numberOfLines={2}>
          {item.name}
        </Text>
        {item.sku ? <Text style={{ fontSize: 10, color: colors.outline, marginBottom: 1 }}>SKU: {item.sku}</Text> : null}
        {item.category ? <Text style={{ fontSize: 11, color: colors.outline, marginBottom: 2 }}>{item.category}</Text> : null}
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 2 }}>
          ₫{formatMoney(item.price ?? 0)}
        </Text>
        <Text style={{ fontSize: 11, color: stockColor }}>
          Tồn kho: {item.stock ?? 0}{lowStock ? '  ⚠ sắp hết' : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: outOfStock ? colors.surfaceContainerHigh : colors.interactive,
          alignItems: 'center', justifyContent: 'center', marginLeft: 10,
        }}
        onPress={() => !outOfStock && onAdd(item)}
        disabled={outOfStock}
        activeOpacity={0.8}
      >
        <Text style={{ fontSize: 20, color: outOfStock ? colors.outline : '#FFF', fontWeight: '700', lineHeight: 22 }}>
          {outOfStock ? '—' : '+'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function CartItem({ item, onIncrease, onDecrease, onRemove, colors }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>₫{formatMoney(item.price)} × {item.qty}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 }}>
        <TouchableOpacity
          onPress={() => onDecrease(item.id)}
          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 18 }}>−</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: '700', marginHorizontal: 8, minWidth: 20, textAlign: 'center' }}>
          {item.qty}
        </Text>
        <TouchableOpacity
          onPress={() => onIncrease(item.id)}
          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 18 }}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 13, color: colors.interactive, fontWeight: '700', minWidth: 56, textAlign: 'right' }}>
        ₫{formatMoney(item.price * item.qty)}
      </Text>
      <TouchableOpacity onPress={() => onRemove(item.id)} style={{ padding: 4, marginLeft: 6 }}>
        <Text style={{ fontSize: 13, color: colors.outline }}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

function PaymentModal({ visible, total, discount, voucherDiscount, onClose, onConfirm, loading, colors }) {
  const [method,       setMethod]       = useState('cash')
  const [cashInput,    setCashInput]    = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone,setCustomerPhone]= useState('')
  const cashGiven  = parseFloat(cashInput.replace(/\D/g, '')) || 0
  const finalTotal = Math.max(0, total - discount - voucherDiscount)
  const change     = method === 'cash' ? Math.max(0, cashGiven - finalTotal) : 0

  const inputStyle = {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12,
    fontSize: 14, color: colors.onSurface, marginBottom: 10,
    borderWidth: 1, borderColor: colors.outlineVariant,
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={onClose} activeOpacity={1}>
          <ScrollView
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              backgroundColor: colors.card,
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: 20, maxHeight: '92%',
            }}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>
              Thanh toán
            </Text>
            <View style={{
              backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.md, padding: 14,
              alignItems: 'center', marginBottom: 16,
            }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}>Tổng cần thanh toán</Text>
              <Text style={{ fontSize: 26, fontWeight: '700', color: colors.interactive }}>₫{formatMoneyFull(finalTotal)}</Text>
              {(discount > 0 || voucherDiscount > 0) && (
                <Text style={{ fontSize: 11, color: colors.success, marginTop: 4 }}>
                  Đã giảm: ₫{formatMoneyFull(discount + voucherDiscount)}
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, marginBottom: 8 }}>
              THÔNG TIN KHÁCH (tùy chọn)
            </Text>
            <TextInput style={inputStyle} placeholder="Tên khách hàng" placeholderTextColor={colors.outline} value={customerName} onChangeText={setCustomerName} />
            <TextInput style={inputStyle} placeholder="Số điện thoại" placeholderTextColor={colors.outline} keyboardType="phone-pad" value={customerPhone} onChangeText={setCustomerPhone} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, marginTop: 16, marginBottom: 8 }}>
              PHƯƠNG THỨC THANH TOÁN
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {PAYMENT_METHODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setMethod(m.key)}
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 10,
                    backgroundColor: colors.surfaceContainer, borderRadius: radius.md,
                    borderWidth: 1.5,
                    borderColor: method === m.key ? colors.interactive : colors.outlineVariant,
                    ...(method === m.key && { backgroundColor: colors.interactive + '18' }),
                  }}
                >
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>{m.emoji}</Text>
                  <Text style={{ fontSize: 12, color: method === m.key ? colors.interactive : colors.textSecondary, fontWeight: '600' }}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {method === 'cash' && (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.8, marginBottom: 8 }}>
                  TIỀN KHÁCH ĐƯA
                </Text>
                <TextInput
                  style={inputStyle}
                  placeholder="VD: 500000"
                  placeholderTextColor={colors.outline}
                  keyboardType="numeric"
                  value={cashInput}
                  onChangeText={setCashInput}
                />
                {cashGiven > 0 && (
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between',
                    backgroundColor: colors.surfaceContainer, borderRadius: radius.sm, padding: 12,
                  }}>
                    <Text style={{ fontSize: 14, color: colors.textSecondary }}>Tiền thối:</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: change >= 0 ? colors.success : colors.danger }}>
                      ₫{formatMoneyFull(change)}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <TouchableOpacity
              style={{
                backgroundColor: colors.interactive, borderRadius: radius.md,
                paddingVertical: 14, alignItems: 'center', marginTop: 16,
                opacity: loading ? 0.6 : 1,
              }}
              onPress={() => onConfirm({ method, customerName, customerPhone })}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>✅  Xác nhận thanh toán</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function TodayOrdersModal({ visible, onClose, colors }) {
  const [orders,   setOrders]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const fetchToday = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await api.get('/api/orders/oltp', {
        params: { channel: 'offline', from: today, to: today, pageSize: 50 },
      })
      const raw   = res.data?.data ?? res.data
      const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setOrders(items)
    } catch { setOrders([]) }
  }, [])
  useEffect(() => {
    if (visible) { setLoading(true); fetchToday().finally(() => setLoading(false)) }
  }, [visible, fetchToday])
  const onRefresh = async () => { setRefreshing(true); await fetchToday(); setRefreshing(false) }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: colors.card,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 20, maxHeight: '70%',
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>Đơn offline hôm nay</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: colors.outline, fontSize: 18 }}>✕</Text></TouchableOpacity>
          </View>
          {loading ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={(item, i) => `today-${item.orderId ?? item.id ?? i}`}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
              renderItem={({ item }) => {
                const total = item.totalAmount ?? item.total_amount ?? 0
                const code  = item.externalOrderId ?? item.external_order_id ?? `#${item.orderId ?? item.id}`
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600' }}>{code}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.customerName ?? item.customer_name ?? 'Khách lẻ'}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.interactive }}>₫{formatMoney(total)}</Text>
                  </View>
                )
              }}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 24 }}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🛍️</Text>
                  <Text style={{ fontSize: 14, color: colors.outline }}>Chưa có đơn offline hôm nay</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

export default function POSScreen({ navigation }) {
  const { user } = useAuth()
  const { colors } = useTheme()

  const [products,     setProducts]     = useState([])
  const [loadingProd,  setLoadingProd]  = useState(false)
  const [search,       setSearch]       = useState('')
  const [isMockProd,   setIsMockProd]   = useState(false)
  const searchTimeout = useRef(null)

  const [cart,         setCart]         = useState([])
  const [discount,     setDiscount]     = useState('')
  const [voucher,      setVoucher]      = useState('')
  const [voucherData,  setVoucherData]  = useState(null)   // { valid, discount, message, voucherId }
  const [voucherLoading, setVoucherLoading] = useState(false)

  const [showPayment,     setShowPayment]     = useState(false)
  const [showTodayOrders, setShowTodayOrders] = useState(false)
  const [showCart,        setShowCart]        = useState(false)
  const [payLoading,      setPayLoading]      = useState(false)

  const fetchProducts = useCallback(async (q = '') => {
    setLoadingProd(true)
    try {
      const res  = await api.get('/api/products/oltp', {
        params: { search: q || undefined, pageSize: 50, isActive: true },
      })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setProducts(list.map(p => ({
        id:       p.productId   ?? p.id          ?? p.product_id,
        name:     p.productName ?? p.name        ?? p.product_name ?? 'Sản phẩm',
        price:    p.basePrice   ?? p.price       ?? p.unitPrice    ?? p.unit_price ?? 0,
        stock:    p.stockQuantity ?? p.stock     ?? p.stock_quantity ?? 0,
        category: p.categoryName ?? p.category_name ?? p.category ?? '',
        sku:      p.sku ?? '',
      })))
      setIsMockProd(false)
    } catch {
      let filtered = MOCK_PRODUCTS
      if (q) filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.category.toLowerCase().includes(q.toLowerCase())
      )
      setProducts(filtered)
      setIsMockProd(true)
    } finally {
      setLoadingProd(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => fetchProducts(search), 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search, fetchProducts])

  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id)
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }]
    })
  }, [])
  const increaseQty = useCallback((id) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c))
    setVoucherData(null)
  }, [])
  const decreaseQty = useCallback((id) => {
    setCart(prev => {
      const item = prev.find(c => c.id === id)
      if (!item) return prev
      if (item.qty <= 1) return prev.filter(c => c.id !== id)
      return prev.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c)
    })
    setVoucherData(null)
  }, [])
  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(c => c.id !== id))
    setVoucherData(null)  // reset voucher khi giỏ thay đổi
  }, [])
  const clearCart = useCallback(() => {
    setCart([]); setDiscount(''); setVoucher(''); setVoucherData(null)
  }, [])

  const applyVoucher = useCallback(async () => {
    const code = voucher.trim()
    if (!code) { setVoucherData(null); return }
    // Tính subtotal tại thời điểm gọi để tránh stale closure
    setCart(currentCart => {
      const orderValue = currentCart.reduce((sum, c) => sum + c.price * c.qty, 0)
      setVoucherLoading(true)
      api.post('/api/pos/vouchers/validate', { code, orderValue, customerId: null })
        .then(res => setVoucherData(res.data))
        .catch(() => setVoucherData({ valid: false, message: 'Không thể kiểm tra voucher.' }))
        .finally(() => setVoucherLoading(false))
      return currentCart  // không thay đổi cart
    })
  }, [voucher])

  const subtotal        = cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  const discountVal     = parseFloat(discount.replace(/\D/g, '')) || 0
  const voucherDiscount = (voucherData?.valid ? Number(voucherData.discount ?? 0) : 0)
  const finalTotal      = Math.max(0, subtotal - discountVal - voucherDiscount)
  const cartCount      = cart.reduce((sum, c) => sum + c.qty, 0)

  const handleCheckout = async ({ method, customerName, customerPhone }) => {
    if (cart.length === 0) { Alert.alert('Giỏ trống', 'Vui lòng thêm sản phẩm vào giỏ hàng.'); return }
    setPayLoading(true)
    try {
      await api.post('/api/orders', {
        channel:        'offline',
        companyId:      user?.companyId,
        customerName:   customerName || 'Khách lẻ',
        customerPhone:  customerPhone || null,
        paymentMethod:  method,
        discount:       discountVal + voucherDiscount,
        voucherCode:    voucher.trim() || null,
        items: cart.map(c => ({
          productId:   c.id,
          productName: c.name,
          quantity:    c.qty,
          unitPrice:   c.price,
        })),
      })
      setShowPayment(false)
      Alert.alert(
        '✅ Thanh toán thành công',
        `Tổng thu: ₫${formatMoneyFull(finalTotal)}`,
        [
          { text: 'Xem đơn hôm nay', onPress: () => { clearCart(); setShowTodayOrders(true) } },
          { text: 'Đơn mới',         onPress: clearCart },
        ]
      )
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message ?? 'Không thể tạo đơn. Thử lại sau.')
    } finally {
      setPayLoading(false)
    }
  }

  const inputStyle = {
    flex: 1, backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10,
    fontSize: 13, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.outlineVariant,
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10,
        backgroundColor: colors.surfaceContainerLow,
        borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
      }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.onSurface }}>🛍️  Bán hàng (POS)</Text>
        <TouchableOpacity
          onPress={() => setShowTodayOrders(true)}
          style={{ backgroundColor: colors.surfaceContainerHigh, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full }}
        >
          <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Hôm nay</Text>
        </TouchableOpacity>
      </View>

      {isMockProd && (
        <View style={{ marginHorizontal: 12, marginTop: 4, backgroundColor: 'rgba(255,180,0,0.1)', borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)', borderRadius: radius.sm, padding: 6 }}>
          <Text style={{ color: '#ffb400', fontSize: 11, textAlign: 'center' }}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {/* Search + Product List */}
      <View style={{ flex: 1 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          margin: 10, marginBottom: 6,
          backgroundColor: colors.surfaceContainer,
          borderRadius: radius.md, paddingHorizontal: 12,
          borderWidth: 1, borderColor: colors.outlineVariant,
        }}>
          <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 13, color: colors.onSurface }}
            placeholder="Tìm sản phẩm..."
            placeholderTextColor={colors.outline}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={{ fontSize: 13, color: colors.outline }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {loadingProd ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item, i) => `prod-${item.id ?? i}`}
            renderItem={({ item }) => <ProductCard item={item} onAdd={addToCart} colors={colors} />}
            contentContainerStyle={{ paddingBottom: cartCount > 0 ? 90 : 24 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 24 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
                <Text style={{ fontSize: 14, color: colors.outline }}>Không tìm thấy sản phẩm</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Cart FAB */}
      {cartCount > 0 && (
        <TouchableOpacity
          style={{
            position: 'absolute', bottom: 20, left: 16, right: 16,
            backgroundColor: colors.interactive,
            borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'center',
            elevation: 8, shadowColor: '#000', shadowOpacity: 0.4,
            shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          }}
          onPress={() => setShowCart(true)}
          activeOpacity={0.88}
        >
          <Text style={{ fontSize: 20 }}>🛒</Text>
          <View style={{
            backgroundColor: '#FFF', borderRadius: 10,
            minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
            marginLeft: 4, paddingHorizontal: 4,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.interactive }}>{cartCount}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#FFF', marginLeft: 8 }}>
            ₫{formatMoneyFull(finalTotal)}
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Xem giỏ hàng</Text>
        </TouchableOpacity>
      )}

      {/* Cart Modal */}
      <Modal visible={showCart} transparent animationType="slide" onRequestClose={() => setShowCart(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={() => setShowCart(false)} activeOpacity={1}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              paddingBottom: 32, maxHeight: '85%', flexShrink: 1,
            }}>
              {/* Header */}
              <View style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingHorizontal: 12, paddingVertical: 10,
                borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>🛒 Giỏ hàng ({cartCount})</Text>
                {cart.length > 0 && (
                  <TouchableOpacity onPress={clearCart}>
                    <Text style={{ fontSize: 12, color: colors.danger }}>Xóa tất cả</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowCart(false)} style={{ marginLeft: 8 }}>
                  <Text style={{ color: colors.outline, fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Danh sách sản phẩm */}
              <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {cart.length === 0 ? (
                  <View style={{ padding: 16, alignItems: 'center' }}>
                    <Text style={{ color: colors.outline, fontSize: 13 }}>Chưa có sản phẩm</Text>
                  </View>
                ) : (
                  cart.map(item => (
                    <CartItem
                      key={`cart-${item.id}`}
                      item={item}
                      onIncrease={increaseQty}
                      onDecrease={decreaseQty}
                      onRemove={removeFromCart}
                      colors={colors}
                    />
                  ))
                )}
              </ScrollView>

              {/* Giảm giá thủ công */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 12, paddingVertical: 8,
                borderTopWidth: 1, borderTopColor: colors.cardBorder,
              }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginRight: 8, minWidth: 90 }}>Giảm giá (₫):</Text>
                <TextInput
                  style={inputStyle}
                  placeholder="0"
                  placeholderTextColor={colors.outline}
                  keyboardType="numeric"
                  value={discount}
                  onChangeText={setDiscount}
                />
              </View>

              {/* Mã voucher */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 12, paddingVertical: 8,
                borderTopWidth: 1, borderTopColor: colors.cardBorder,
              }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginRight: 8, minWidth: 90 }}>🎫 Voucher:</Text>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  placeholder="Nhập mã voucher..."
                  placeholderTextColor={colors.outline}
                  autoCapitalize="characters"
                  value={voucher}
                  onChangeText={(v) => { setVoucher(v); setVoucherData(null) }}
                  onBlur={applyVoucher}
                />
                <TouchableOpacity
                  onPress={applyVoucher}
                  disabled={voucherLoading || !voucher.trim()}
                  style={{
                    marginLeft: 6, paddingHorizontal: 10, paddingVertical: 6,
                    backgroundColor: colors.interactive, borderRadius: radius.sm,
                    opacity: !voucher.trim() ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                    {voucherLoading ? '...' : 'Áp dụng'}
                  </Text>
                </TouchableOpacity>
              </View>
              {voucherData && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: voucherData.valid ? colors.success : colors.error }}>
                    {voucherData.valid
                      ? `✓ ${voucherData.message} (−₫${formatMoneyFull(voucherData.discount)})`
                      : `✗ ${voucherData.message}`}
                  </Text>
                </View>
              )}

              {/* Tổng tiền */}
              <View style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: colors.surfaceContainerHigh,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>Tổng thanh toán:</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.interactive }}>₫{formatMoneyFull(finalTotal)}</Text>
              </View>

              {/* Thanh toán */}
              <TouchableOpacity
                style={{
                  backgroundColor: colors.interactive,
                  marginHorizontal: 12, marginTop: 8, marginBottom: 8,
                  borderRadius: radius.md, paddingVertical: 12,
                  alignItems: 'center', opacity: cart.length === 0 ? 0.4 : 1,
                }}
                onPress={() => { setShowCart(false); setShowPayment(true) }}
                disabled={cart.length === 0}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>💳  Thanh toán</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      <PaymentModal
        visible={showPayment}
        total={subtotal}
        discount={discountVal}
        voucherDiscount={voucherDiscount}
        onClose={() => setShowPayment(false)}
        onConfirm={handleCheckout}
        loading={payLoading}
        colors={colors}
      />

      <TodayOrdersModal
        visible={showTodayOrders}
        onClose={() => setShowTodayOrders(false)}
        colors={colors}
      />
    </View>
  )
}
