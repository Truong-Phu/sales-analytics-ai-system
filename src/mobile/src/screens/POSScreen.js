import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Modal, Alert,
  KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
} from 'react-native'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { colors, radius } from '../components/theme'

// ─── Format tiền rút gọn ─────────────────────────────────────────────────────
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

// ─── Mock sản phẩm ─────────────────────────────────────────────────────────────
const MOCK_PRODUCTS = [
  { id: 1, name: 'Áo thun Unisex oversize',   price: 189_000, stock: 45, category: 'Áo'        },
  { id: 2, name: 'Quần jogger cotton',         price: 279_000, stock: 12, category: 'Quần'      },
  { id: 3, name: 'Váy hoa midi dáng xòe',     price: 349_000, stock: 8,  category: 'Váy'       },
  { id: 4, name: 'Áo khoác dù unisex',        price: 459_000, stock: 20, category: 'Áo'        },
  { id: 5, name: 'Giày sneaker trắng',         price: 599_000, stock: 28, category: 'Giày'      },
  { id: 6, name: 'Túi tote canvas',            price: 149_000, stock: 35, category: 'Phụ kiện'  },
  { id: 7, name: 'Nón bucket cotton',          price: 119_000, stock: 50, category: 'Phụ kiện'  },
  { id: 8, name: 'Dép quai hậu EVA',           price: 199_000, stock: 18, category: 'Giày'      },
]

// ─── Phương thức thanh toán ───────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { key: 'cash',        label: 'Tiền mặt',     emoji: '💵' },
  { key: 'transfer',    label: 'Chuyển khoản', emoji: '🏦' },
  { key: 'card',        label: 'Thẻ',          emoji: '💳' },
]

// ─── Card sản phẩm trong danh sách tìm kiếm ──────────────────────────────────
function ProductCard({ item, onAdd }) {
  const outOfStock = (item.stock ?? 0) <= 0
  return (
    <View style={[s.productCard, outOfStock && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.productName} numberOfLines={2}>{item.name}</Text>
        <Text style={s.productCategory}>{item.category ?? ''}</Text>
        <Text style={s.productPrice}>₫{formatMoney(item.price ?? item.unitPrice ?? item.unit_price ?? 0)}</Text>
        <Text style={[s.productStock, { color: outOfStock ? '#EF4444' : (item.stock < 5 ? '#F59E0B' : '#6B7280') }]}>
          Tồn: {item.stock ?? 0}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.addBtn, outOfStock && { backgroundColor: '#374151' }]}
        onPress={() => !outOfStock && onAdd(item)}
        disabled={outOfStock}
        activeOpacity={0.8}
      >
        <Text style={s.addBtnText}>{outOfStock ? '—' : '+'}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Item trong giỏ hàng ─────────────────────────────────────────────────────
function CartItem({ item, onIncrease, onDecrease, onRemove }) {
  return (
    <View style={s.cartItem}>
      <View style={{ flex: 1 }}>
        <Text style={s.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.cartItemPrice}>₫{formatMoney(item.price)} × {item.qty}</Text>
      </View>
      {/* Điều chỉnh số lượng */}
      <View style={s.qtyControl}>
        <TouchableOpacity onPress={() => onDecrease(item.id)} style={s.qtyBtn}>
          <Text style={s.qtyBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={s.qtyValue}>{item.qty}</Text>
        <TouchableOpacity onPress={() => onIncrease(item.id)} style={s.qtyBtn}>
          <Text style={s.qtyBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      {/* Tổng dòng */}
      <Text style={s.cartItemTotal}>₫{formatMoney(item.price * item.qty)}</Text>
      {/* Xóa */}
      <TouchableOpacity onPress={() => onRemove(item.id)} style={s.removeBtn}>
        <Text style={s.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Modal thanh toán ─────────────────────────────────────────────────────────
function PaymentModal({ visible, total, discount, onClose, onConfirm, loading }) {
  const [method,      setMethod]      = useState('cash')
  const [cashInput,   setCashInput]   = useState('')
  const [customerName,setCustomerName]= useState('')
  const [customerPhone,setCustomerPhone] = useState('')

  // Tính tiền thối
  const cashGiven = parseFloat(cashInput.replace(/\D/g, '')) || 0
  const finalTotal = Math.max(0, total - discount)
  const change = method === 'cash' ? Math.max(0, cashGiven - finalTotal) : 0

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={onClose}
          activeOpacity={1}
        >
          <ScrollView
            style={s.payModal}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.payModalTitle}>Thanh toán</Text>

            {/* Tổng tiền */}
            <View style={s.payTotalBox}>
              <Text style={s.payTotalLabel}>Tổng cần thanh toán</Text>
              <Text style={s.payTotalAmount}>₫{formatMoneyFull(finalTotal)}</Text>
            </View>

            {/* Thông tin khách */}
            <Text style={s.paySection}>THÔNG TIN KHÁCH (tùy chọn)</Text>
            <TextInput
              style={s.payInput}
              placeholder="Tên khách hàng"
              placeholderTextColor={colors.outline}
              value={customerName}
              onChangeText={setCustomerName}
            />
            <TextInput
              style={s.payInput}
              placeholder="Số điện thoại"
              placeholderTextColor={colors.outline}
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={setCustomerPhone}
            />

            {/* Phương thức thanh toán */}
            <Text style={[s.paySection, { marginTop: 16 }]}>PHƯƠNG THỨC THANH TOÁN</Text>
            <View style={s.payMethodRow}>
              {PAYMENT_METHODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setMethod(m.key)}
                  style={[s.payMethodBtn, method === m.key && s.payMethodBtnActive]}
                >
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>{m.emoji}</Text>
                  <Text style={[s.payMethodLabel, method === m.key && { color: colors.primary }]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Nhập tiền mặt → tính tiền thối */}
            {method === 'cash' && (
              <View style={s.cashBox}>
                <Text style={s.paySection}>TIỀN KHÁCH ĐƯA</Text>
                <TextInput
                  style={s.payInput}
                  placeholder="VD: 500000"
                  placeholderTextColor={colors.outline}
                  keyboardType="numeric"
                  value={cashInput}
                  onChangeText={setCashInput}
                />
                {cashGiven > 0 && (
                  <View style={s.changeBox}>
                    <Text style={s.changeLabel}>Tiền thối:</Text>
                    <Text style={[s.changeValue, { color: change >= 0 ? '#4AE176' : '#EF4444' }]}>
                      ₫{formatMoneyFull(change)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Xác nhận */}
            <TouchableOpacity
              style={[s.confirmBtn, loading && { opacity: 0.6 }]}
              onPress={() => onConfirm({ method, customerName, customerPhone })}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.confirmBtnText}>✅  Xác nhận thanh toán</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Modal xem đơn offline hôm nay ───────────────────────────────────────────
function TodayOrdersModal({ visible, onClose }) {
  const [orders,   setOrders]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchToday = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const res = await api.get('/api/orders', {
        params: { channel: 'offline', from: today, to: today, limit: 50 },
      })
      const raw   = res.data?.data ?? res.data
      const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setOrders(items)
    } catch {
      setOrders([])
    }
  }, [])

  useEffect(() => {
    if (visible) {
      setLoading(true)
      fetchToday().finally(() => setLoading(false))
    }
  }, [visible, fetchToday])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchToday()
    setRefreshing(false)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View style={s.todaySheet}>
          <View style={s.todayHeader}>
            <Text style={s.todayTitle}>Đơn offline hôm nay</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.outline, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.center}>
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
                  <View style={s.todayItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.todayCode}>{code}</Text>
                      <Text style={s.todayCustomer}>{item.customerName ?? item.customer_name ?? 'Khách lẻ'}</Text>
                    </View>
                    <Text style={s.todayAmount}>₫{formatMoney(total)}</Text>
                  </View>
                )
              }}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={s.emptyIcon}>🛍️</Text>
                  <Text style={s.emptyText}>Chưa có đơn offline hôm nay</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

// ─── Main POS Component ───────────────────────────────────────────────────────
export default function POSScreen({ navigation }) {
  const { user } = useAuth()

  // State sản phẩm
  const [products,    setProducts]    = useState([])
  const [loadingProd, setLoadingProd] = useState(false)
  const [search,      setSearch]      = useState('')
  const [isMockProd,  setIsMockProd]  = useState(false)
  const searchTimeout = useRef(null)

  // State giỏ hàng
  const [cart,     setCart]     = useState([])
  const [discount, setDiscount] = useState('')

  // State modal
  const [showPayment,    setShowPayment]    = useState(false)
  const [showTodayOrders,setShowTodayOrders]= useState(false)
  const [payLoading,     setPayLoading]     = useState(false)

  // Lấy danh sách sản phẩm
  const fetchProducts = useCallback(async (q = '') => {
    setLoadingProd(true)
    try {
      const res  = await api.get('/api/products', {
        params: { search: q || undefined, limit: 30, status: 'active' },
      })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setProducts(list.map(p => ({
        id:       p.id         ?? p.productId  ?? p.product_id,
        name:     p.name       ?? p.productName ?? p.product_name ?? 'Sản phẩm',
        price:    p.price      ?? p.unitPrice   ?? p.unit_price   ?? 0,
        stock:    p.stock      ?? p.stockQuantity ?? p.stock_quantity ?? 0,
        category: p.categoryName ?? p.category_name ?? p.category ?? '',
      })))
      setIsMockProd(false)
    } catch {
      // Fallback mock
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

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Debounce search
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => fetchProducts(search), 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search, fetchProducts])

  // ── Quản lý giỏ hàng ─────────────────────────────────────────────────────
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id)
      if (existing) {
        return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c)
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }]
    })
  }, [])

  const increaseQty = useCallback((id) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + 1 } : c))
  }, [])

  const decreaseQty = useCallback((id) => {
    setCart(prev => {
      const item = prev.find(c => c.id === id)
      if (!item) return prev
      if (item.qty <= 1) return prev.filter(c => c.id !== id)
      return prev.map(c => c.id === id ? { ...c, qty: c.qty - 1 } : c)
    })
  }, [])

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(c => c.id !== id))
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setDiscount('')
  }, [])

  // Tổng tiền
  const subtotal      = cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  const discountVal   = parseFloat(discount.replace(/\D/g, '')) || 0
  const finalTotal    = Math.max(0, subtotal - discountVal)
  const cartCount     = cart.reduce((sum, c) => sum + c.qty, 0)

  // ── Tạo đơn offline ──────────────────────────────────────────────────────
  const handleCheckout = async ({ method, customerName, customerPhone }) => {
    if (cart.length === 0) {
      Alert.alert('Giỏ trống', 'Vui lòng thêm sản phẩm vào giỏ hàng.')
      return
    }
    setPayLoading(true)
    try {
      await api.post('/api/orders', {
        channel:       'offline',
        companyId:     user?.companyId,
        customerName:  customerName || 'Khách lẻ',
        customerPhone: customerPhone || null,
        paymentMethod: method,
        discount:      discountVal,
        items: cart.map(c => ({
          productId:  c.id,
          productName:c.name,
          quantity:   c.qty,
          unitPrice:  c.price,
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

  return (
    <View style={s.container}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🛍️  Bán hàng (POS)</Text>
        <TouchableOpacity onPress={() => setShowTodayOrders(true)} style={s.todayBtn}>
          <Text style={s.todayBtnText}>Hôm nay</Text>
        </TouchableOpacity>
      </View>

      {/* Banner mock */}
      {isMockProd && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {/* ── Layout: 60% sản phẩm + 40% giỏ ────────────────────────────── */}
      <View style={s.body}>

        {/* ═══ 60% trên: Tìm & chọn sản phẩm ═══════════════════════════ */}
        <View style={s.productSection}>
          {/* Search bar */}
          <View style={s.searchWrap}>
            <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={s.searchInput}
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

          {/* Danh sách sản phẩm */}
          {loadingProd ? (
            <View style={s.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={(item, i) => `prod-${item.id ?? i}`}
              renderItem={({ item }) => <ProductCard item={item} onAdd={addToCart} />}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={s.emptyIcon}>📦</Text>
                  <Text style={s.emptyText}>Không tìm thấy sản phẩm</Text>
                </View>
              }
            />
          )}
        </View>

        {/* ═══ 40% dưới: Giỏ hàng ═══════════════════════════════════════ */}
        <View style={s.cartSection}>
          {/* Header giỏ */}
          <View style={s.cartHeader}>
            <Text style={s.cartTitle}>🛒 Giỏ hàng  {cartCount > 0 && <Text style={s.cartCount}>({cartCount})</Text>}</Text>
            {cart.length > 0 && (
              <TouchableOpacity onPress={clearCart}>
                <Text style={s.clearCartText}>Xóa tất cả</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Danh sách giỏ */}
          <FlatList
            data={cart}
            keyExtractor={(item, i) => `cart-${item.id ?? i}`}
            renderItem={({ item }) => (
              <CartItem
                item={item}
                onIncrease={increaseQty}
                onDecrease={decreaseQty}
                onRemove={removeFromCart}
              />
            )}
            style={s.cartList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={s.emptyCart}>
                <Text style={s.emptyCartText}>Chưa có sản phẩm</Text>
              </View>
            }
          />

          {/* Ô giảm giá */}
          <View style={s.discountRow}>
            <Text style={s.discountLabel}>Giảm giá (₫):</Text>
            <TextInput
              style={s.discountInput}
              placeholder="0"
              placeholderTextColor={colors.outline}
              keyboardType="numeric"
              value={discount}
              onChangeText={setDiscount}
            />
          </View>

          {/* Tổng tiền */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Tổng thanh toán:</Text>
            <Text style={s.totalValue}>₫{formatMoneyFull(finalTotal)}</Text>
          </View>

          {/* Nút thanh toán */}
          <TouchableOpacity
            style={[s.checkoutBtn, cart.length === 0 && { opacity: 0.4 }]}
            onPress={() => setShowPayment(true)}
            disabled={cart.length === 0}
            activeOpacity={0.85}
          >
            <Text style={s.checkoutBtnText}>💳  Thanh toán</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal thanh toán */}
      <PaymentModal
        visible={showPayment}
        total={subtotal}
        discount={discountVal}
        onClose={() => setShowPayment(false)}
        onConfirm={handleCheckout}
        loading={payLoading}
      />

      {/* Modal đơn hôm nay */}
      <TodayOrdersModal
        visible={showTodayOrders}
        onClose={() => setShowTodayOrders(false)}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10,
    backgroundColor: colors.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.onSurface },
  todayBtn: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full,
  },
  todayBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // Mock banner
  mockBanner: {
    marginHorizontal: 12, marginTop: 4,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 6,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  // Body layout (60% + 40%)
  body: { flex: 1 },

  // ── Phần sản phẩm (60%) ──────────────────────────────────────────────────
  productSection: {
    flex: 6,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
    paddingBottom: 4,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 10, marginBottom: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: colors.onSurface },

  productCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    marginHorizontal: 10, marginBottom: 6,
    borderRadius: radius.md, padding: 10,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  productName:     { fontSize: 13, fontWeight: '600', color: colors.onSurface, marginBottom: 2 },
  productCategory: { fontSize: 11, color: colors.outline, marginBottom: 2 },
  productPrice:    { fontSize: 13, fontWeight: '700', color: colors.primary },
  productStock:    { fontSize: 11 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 10,
  },
  addBtnText: { fontSize: 20, color: '#FFF', fontWeight: '700', lineHeight: 22 },

  // ── Phần giỏ hàng (40%) ──────────────────────────────────────────────────
  cartSection: {
    flex: 4,
    backgroundColor: '#111827',
    paddingTop: 0,
  },
  cartHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#374151',
  },
  cartTitle:      { fontSize: 14, fontWeight: '700', color: '#F9FAFB' },
  cartCount:      { color: '#6366F1' },
  clearCartText:  { fontSize: 12, color: '#EF4444' },
  cartList:       { flex: 1 },

  cartItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#1F2937',
  },
  cartItemName:  { fontSize: 12, color: '#F9FAFB', fontWeight: '600' },
  cartItemPrice: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  qtyControl:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  qtyBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText:  { color: '#F9FAFB', fontSize: 16, lineHeight: 18 },
  qtyValue:    { fontSize: 14, color: '#F9FAFB', fontWeight: '700', marginHorizontal: 8, minWidth: 20, textAlign: 'center' },
  cartItemTotal: { fontSize: 13, color: '#6366F1', fontWeight: '700', minWidth: 56, textAlign: 'right' },
  removeBtn:   { padding: 4, marginLeft: 6 },
  removeBtnText: { fontSize: 13, color: '#6B7280' },

  emptyCart:     { padding: 16, alignItems: 'center' },
  emptyCartText: { color: '#6B7280', fontSize: 13 },

  // Giảm giá
  discountRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: '#374151',
  },
  discountLabel: { fontSize: 13, color: '#9CA3AF', marginRight: 8 },
  discountInput: {
    flex: 1, backgroundColor: '#1F2937',
    borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10,
    fontSize: 13, color: '#F9FAFB',
  },

  // Tổng
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#1F2937',
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: '#F9FAFB' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#6366F1' },

  // Checkout btn
  checkoutBtn: {
    backgroundColor: '#6366F1',
    marginHorizontal: 12, marginBottom: 8,
    borderRadius: radius.md, paddingVertical: 12,
    alignItems: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  checkoutBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Payment modal
  payModal: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  payModalTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  payTotalBox: {
    backgroundColor: '#1F2937', borderRadius: radius.md, padding: 14,
    alignItems: 'center', marginBottom: 16,
  },
  payTotalLabel:  { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  payTotalAmount: { fontSize: 24, fontWeight: '700', color: '#6366F1' },
  paySection: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 8 },
  payInput: {
    backgroundColor: '#1F2937',
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12,
    fontSize: 14, color: '#F9FAFB', marginBottom: 10,
  },
  payMethodRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  payMethodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: '#1F2937', borderRadius: radius.md,
    borderWidth: 1, borderColor: '#374151',
  },
  payMethodBtnActive: { borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.15)' },
  payMethodLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  cashBox: { marginBottom: 8 },
  changeBox: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#1F2937', borderRadius: radius.sm, padding: 12,
  },
  changeLabel: { fontSize: 14, color: '#9CA3AF' },
  changeValue: { fontSize: 16, fontWeight: '700' },
  confirmBtn: {
    backgroundColor: '#6366F1',
    borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: 16,
  },
  confirmBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Today orders modal
  todaySheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  todayTitle:  { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
  todayItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  todayCode:   { fontSize: 13, color: '#F9FAFB', fontWeight: '600' },
  todayCustomer: { fontSize: 12, color: '#9CA3AF' },
  todayAmount: { fontSize: 14, fontWeight: '700', color: '#6366F1' },

  emptyState: { alignItems: 'center', paddingTop: 24 },
  emptyIcon:  { fontSize: 36, marginBottom: 8 },
  emptyText:  { fontSize: 14, color: colors.outline },
})
