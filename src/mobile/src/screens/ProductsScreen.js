import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, Modal, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import api from '../api/axios'
import { usePermission } from '../hooks/usePermission'
import { colors, radius } from '../components/theme'

function formatMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0'
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

const STATUS_CONFIG = {
  active:       { label: 'Đang bán',  color: '#4ae176', bg: 'rgba(74,225,118,0.15)'  },
  inactive:     { label: 'Ngừng bán', color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)' },
  out_of_stock: { label: 'Hết hàng',  color: '#ffb400', bg: 'rgba(255,180,0,0.15)'   },
}

const MOCK_PRODUCTS = [
  { id: 1, name: 'Áo thun Unisex oversize',  category: 'Áo',    price: 189_000, stock: 45, status: 'active'       },
  { id: 2, name: 'Quần jogger cotton cao cấp', category: 'Quần',  price: 279_000, stock: 12, status: 'active'       },
  { id: 3, name: 'Váy hoa midi dáng xòe',    category: 'Váy',   price: 349_000, stock: 3,  status: 'out_of_stock'  },
  { id: 4, name: 'Áo khoác dù unisex',       category: 'Áo',    price: 459_000, stock: 0,  status: 'out_of_stock'  },
  { id: 5, name: 'Giày sneaker trắng',        category: 'Giày',  price: 599_000, stock: 28, status: 'active'        },
  { id: 6, name: 'Túi tote canvas',           category: 'Phụ kiện', price: 149_000, stock: 0, status: 'inactive'    },
]

function ProductCard({ item }) {
  const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active
  const stockColor = item.stock === 0 ? colors.error : item.stock < 5 ? '#ffb400' : colors.outline
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.productName} numberOfLines={2}>{item.name}</Text>
          <Text style={s.category}>{item.category ?? '—'}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
      </View>
      <View style={s.cardBottom}>
        <Text style={s.price}>₫{formatMoney(item.price ?? item.unit_price)}</Text>
        <Text style={[s.stock, { color: stockColor }]}>
          Tồn: {item.stock ?? item.stock_quantity ?? 0}
        </Text>
      </View>
    </View>
  )
}

// Modal thêm sản phẩm mới
function AddProductModal({ visible, onClose, onSuccess }) {
  const [form, setForm] = useState({ name: '', category: '', price: '', stock: '0' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.name || !form.price) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên và giá sản phẩm.')
      return
    }
    setLoading(true)
    try {
      await api.post('/api/products', {
        name:     form.name,
        category: form.category,
        price:    parseFloat(form.price.replace(/\D/g, '')) || 0,
        stock:    parseInt(form.stock) || 0,
        status:   'active',
      })
      Alert.alert('Thành công', 'Đã thêm sản phẩm mới!', [{ text: 'OK', onPress: onSuccess }])
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message ?? 'Không thể thêm sản phẩm.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={onClose}
          activeOpacity={1}
        >
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Thêm sản phẩm mới</Text>
            {[
              { key: 'name', label: 'Tên sản phẩm *', placeholder: 'VD: Áo thun trắng' },
              { key: 'category', label: 'Danh mục', placeholder: 'VD: Áo, Quần...' },
              { key: 'price', label: 'Giá bán (₫) *', placeholder: '189000', keyboard: 'numeric' },
              { key: 'stock', label: 'Tồn kho ban đầu', placeholder: '0', keyboard: 'numeric' },
            ].map(f => (
              <View key={f.key} style={s.modalField}>
                <Text style={s.modalLabel}>{f.label}</Text>
                <TextInput
                  style={s.modalInput}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.outline}
                  keyboardType={f.keyboard ?? 'default'}
                  value={form[f.key]}
                  onChangeText={v => set(f.key, v)}
                />
              </View>
            ))}
            <TouchableOpacity
              style={[s.modalBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={colors.surface} />
                : <Text style={s.modalBtnText}>💾 Lưu sản phẩm</Text>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function ProductsScreen() {
  const canEdit = usePermission('products.edit')

  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search,     setSearch]     = useState('')
  const [isMock,     setIsMock]     = useState(false)
  const [showAdd,    setShowAdd]    = useState(false)
  const searchTimeout = useRef(null)

  const normalizeProduct = (p) => ({
    id:       p.id         ?? p.productId ?? p.product_id,
    name:     p.name       ?? p.productName ?? p.product_name ?? 'Sản phẩm',
    category: p.categoryName ?? p.category_name ?? p.category ?? '',
    price:    p.price      ?? p.unitPrice ?? p.unit_price ?? 0,
    stock:    p.stock      ?? p.stockQuantity ?? p.stock_quantity ?? 0,
    status:   p.status     ?? 'active',
  })

  const fetchProducts = useCallback(async (q = '') => {
    try {
      const res = await api.get('/api/products', {
        params: { search: q || undefined, limit: 50 },
      })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setData(list.map(normalizeProduct))
      setIsMock(false)
    } catch {
      // Fallback: lọc mock theo search
      let filtered = MOCK_PRODUCTS
      if (q) filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.category.toLowerCase().includes(q.toLowerCase())
      )
      setData(filtered)
      setIsMock(true)
    }
  }, [])

  useEffect(() => {
    fetchProducts().finally(() => setLoading(false))
  }, [fetchProducts])

  // Debounce search 400ms
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setLoading(true)
      fetchProducts(search).finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search, fetchProducts])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchProducts(search)
    setRefreshing(false)
  }

  return (
    <View style={s.container}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm tên, danh mục sản phẩm..."
          placeholderTextColor={colors.outline}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={s.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Thống kê nhanh */}
      <View style={s.statsRow}>
        <Text style={s.statsText}>Tổng: {data.length} sản phẩm</Text>
        <Text style={[s.statsText, { color: colors.error }]}>
          Hết hàng: {data.filter(p => p.stock === 0).length}
        </Text>
        <Text style={[s.statsText, { color: '#ffb400' }]}>
          Sắp hết: {data.filter(p => p.stock > 0 && p.stock < 5).length}
        </Text>
      </View>

      {/* Banner mock */}
      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {/* Danh sách sản phẩm */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item.id ?? i}`}
          renderItem={({ item }) => <ProductCard item={item} />}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>📦</Text>
              <Text style={s.emptyText}>Không tìm thấy sản phẩm</Text>
            </View>
          }
        />
      )}

      {/* FAB Thêm sản phẩm – chỉ hiện nếu có quyền edit */}
      {canEdit && (
        <TouchableOpacity style={s.fab} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
          <Text style={s.fabText}>+ Thêm</Text>
        </TouchableOpacity>
      )}

      <AddProductModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={() => {
          setShowAdd(false)
          setLoading(true)
          fetchProducts(search).finally(() => setLoading(false))
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: colors.onSurface },
  clearText:   { fontSize: 13, color: colors.outline, padding: 4 },

  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 6,
  },
  statsText: { fontSize: 12, color: colors.outline },

  mockBanner: {
    marginHorizontal: 12, marginBottom: 4,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  list: { padding: 12, paddingBottom: 100 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  cardTop:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productName: { fontSize: 14, fontWeight: '700', color: colors.onSurface, marginBottom: 3 },
  category:    { fontSize: 12, color: colors.outline },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, marginLeft: 8 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  price:       { fontSize: 15, fontWeight: '700', color: colors.primary },
  stock:       { fontSize: 13, fontWeight: '500' },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: colors.outline },

  fab: {
    position: 'absolute', bottom: 24, right: 20,
    backgroundColor: colors.primaryContainer,
    borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.25,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.surface, fontSize: 14, fontWeight: '700' },

  // Modal
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  modalField: { marginBottom: 12 },
  modalLabel: { fontSize: 13, color: '#9CA3AF', marginBottom: 5 },
  modalInput: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm, padding: 12,
    fontSize: 14, color: colors.onSurface,
  },
  modalBtn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  modalBtnText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
})
