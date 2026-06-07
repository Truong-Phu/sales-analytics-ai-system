import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, Modal, Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import api from '../api/axios'
import { usePermission } from '../hooks/usePermission'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'
import { formatMoney } from '../utils/format'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:5136'

const STATUS_CONFIG = {
  active:       { label: 'Đang bán',  color: '#4ae176', bg: 'rgba(74,225,118,0.15)'  },
  inactive:     { label: 'Ngừng bán', color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)' },
  out_of_stock: { label: 'Hết hàng',  color: '#ffb400', bg: 'rgba(255,180,0,0.15)'   },
}

const MOCK_PRODUCTS = [
  { id: 1, name: 'Áo thun Unisex oversize',  category: 'Áo',       price: 189_000, stock: 45, status: 'active'       },
  { id: 2, name: 'Quần jogger cotton cao cấp', category: 'Quần',   price: 279_000, stock: 12, status: 'active'       },
  { id: 3, name: 'Váy hoa midi dáng xòe',    category: 'Váy',      price: 349_000, stock: 3,  status: 'out_of_stock' },
  { id: 4, name: 'Áo khoác dù unisex',       category: 'Áo',       price: 459_000, stock: 0,  status: 'out_of_stock' },
  { id: 5, name: 'Giày sneaker trắng',        category: 'Giày',     price: 599_000, stock: 28, status: 'active'       },
  { id: 6, name: 'Túi tote canvas',           category: 'Phụ kiện', price: 149_000, stock: 0,  status: 'inactive'    },
]

// Thumbnail ảnh sản phẩm với fallback chữ cái
function ProductThumb({ imageUrl, name, size = 56 }) {
  const [err, setErr] = useState(false)
  const initials = (name ?? 'SP').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  const uri = imageUrl
    ? (imageUrl.startsWith('http') ? imageUrl : `${BASE_URL}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`)
    : null

  if (uri && !err) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius.sm }}
        onError={() => setErr(true)}
        resizeMode="cover"
      />
    )
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius.sm,
      backgroundColor: '#6366F133',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.3, fontWeight: '700', color: '#6366F1' }}>{initials}</Text>
    </View>
  )
}

function ProductCard({ item, colors }) {
  const st = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.active
  const stock = item.stock ?? 0
  const stockColor = stock === 0 ? colors.danger : stock < 5 ? colors.warning : colors.success
  const hasRevInfo = item.totalQtySold > 0 || item.totalOrders > 0

  return (
    <View style={{
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md, padding: 12, marginBottom: 10,
      borderWidth: 1, borderColor: colors.outlineVariant,
      flexDirection: 'row', gap: 10,
    }}>
      {/* Ảnh sản phẩm */}
      <ProductThumb imageUrl={item.imageUrl} name={item.name} size={64} />

      {/* Thông tin */}
      <View style={{ flex: 1 }}>
        {/* Dòng 1: Tên + Badge */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: colors.onSurface, marginRight: 6 }} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full, backgroundColor: st.bg, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: st.color }}>{st.label}</Text>
          </View>
        </View>

        {/* SKU + Danh mục */}
        {item.sku ? <Text style={{ fontSize: 11, color: colors.outline, marginBottom: 1 }}>SKU: {item.sku}</Text> : null}
        {item.category ? <Text style={{ fontSize: 12, color: colors.outline, marginBottom: 6 }}>{item.category}</Text> : null}

        {/* Giá + Tồn kho */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ fontSize: 10, color: colors.outline, marginBottom: 1 }}>Giá bán</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>₫{formatMoney(item.price)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: colors.outline, marginBottom: 1 }}>Tồn kho</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: stockColor }}>{stock} cái</Text>
          </View>
        </View>

        {/* Đã bán */}
        {hasRevInfo && (
          <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.outlineVariant }}>
            <Text style={{ fontSize: 11, color: colors.outline }}>
              📦 Đã bán {item.totalQtySold} sp · {item.totalOrders} đơn
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

function AddProductModal({ visible, onClose, onSuccess, colors }) {
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} activeOpacity={1}>
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            backgroundColor: colors.card,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 20, paddingBottom: 36,
          }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 16 }}>
              Thêm sản phẩm mới
            </Text>
            {[
              { key: 'name',     label: 'Tên sản phẩm *',    placeholder: 'VD: Áo thun trắng' },
              { key: 'category', label: 'Danh mục',           placeholder: 'VD: Áo, Quần...' },
              { key: 'price',    label: 'Giá bán (₫) *',     placeholder: '189000', keyboard: 'numeric' },
              { key: 'stock',    label: 'Tồn kho ban đầu',   placeholder: '0', keyboard: 'numeric' },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 5 }}>{f.label}</Text>
                <TextInput
                  style={{
                    backgroundColor: colors.surfaceContainer,
                    borderRadius: radius.sm, padding: 12,
                    fontSize: 14, color: colors.onSurface,
                    borderWidth: 1, borderColor: colors.outlineVariant,
                  }}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.outline}
                  keyboardType={f.keyboard ?? 'default'}
                  value={form[f.key]}
                  onChangeText={v => set(f.key, v)}
                />
              </View>
            ))}
            <TouchableOpacity
              style={{ backgroundColor: colors.primaryContainer, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 8, opacity: loading ? 0.6 : 1 }}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '700' }}>💾 Lưu sản phẩm</Text>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function ProductsScreen() {
  const { colors } = useTheme()
  const canEdit = usePermission('products.edit')

  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search,     setSearch]     = useState('')
  const [isMock,     setIsMock]     = useState(false)
  const [showAdd,    setShowAdd]    = useState(false)
  const searchTimeout = useRef(null)

  const normalizeProduct = (p) => {
    const stock = p.stock ?? p.stockQuantity ?? p.stock_quantity ?? 0
    const imageRaw = p.imageUrl ?? p.image_url ?? p.image ?? p.thumbnail ?? p.photo ?? null
    const imageUrl = imageRaw
      ? (imageRaw.startsWith('http') ? imageRaw : `${BASE_URL}${imageRaw.startsWith('/') ? '' : '/'}${imageRaw}`)
      : null
    return {
      id:           p.id          ?? p.productId   ?? p.product_id,
      name:         p.name        ?? p.productName ?? p.product_name ?? 'Sản phẩm',
      sku:          p.sku         ?? p.code        ?? '',
      category:     p.categoryName ?? p.category_name ?? p.category ?? '',
      price:        p.price       ?? p.unitPrice   ?? p.unit_price
                    ?? p.basePrice ?? p.base_price  ?? p.sellingPrice ?? 0,
      stock,
      imageUrl,
      totalOrders:  p.totalOrders  ?? p.total_orders  ?? 0,
      totalQtySold: p.totalQtySold ?? p.total_qty_sold ?? 0,
      status:       p.status ?? (stock === 0 ? 'out_of_stock' : 'active'),
    }
  }

  const fetchProducts = useCallback(async (q = '') => {
    try {
      const res = await api.get('/api/products/oltp', {
        params: { search: q || undefined, pageSize: 50 },
      })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setData(list.map(normalizeProduct))
      setIsMock(false)
    } catch {
      // Fallback DW endpoint
      try {
        const res2 = await api.get('/api/products', {
          params: { search: q || undefined, limit: 50 },
        })
        const raw2  = res2.data?.data ?? res2.data
        const list2 = Array.isArray(raw2) ? raw2 : (raw2?.items ?? [])
        setData(list2.map(normalizeProduct))
        setIsMock(false)
      } catch {
        let filtered = MOCK_PRODUCTS
        if (q) filtered = filtered.filter(p =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.category.toLowerCase().includes(q.toLowerCase())
        )
        setData(filtered.map(p => ({ ...p, imageUrl: null })))
        setIsMock(true)
      }
    }
  }, [])

  useEffect(() => {
    fetchProducts().finally(() => setLoading(false))
  }, [fetchProducts])

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
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Search bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        margin: 12, marginBottom: 6,
        backgroundColor: colors.surfaceContainer,
        borderRadius: radius.md, paddingHorizontal: 12,
        borderWidth: 1, borderColor: colors.outlineVariant,
      }}>
        <Text style={{ fontSize: 14, marginRight: 8 }}>🔍</Text>
        <TextInput
          style={{ flex: 1, paddingVertical: 11, fontSize: 14, color: colors.onSurface }}
          placeholder="Tìm tên, danh mục sản phẩm..."
          placeholderTextColor={colors.outline}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ fontSize: 13, color: colors.outline, padding: 4 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6 }}>
        <Text style={{ fontSize: 12, color: colors.outline }}>Tổng: {data.length} sản phẩm</Text>
        <Text style={{ fontSize: 12, color: colors.danger }}>
          Hết hàng: {data.filter(p => p.stock === 0).length}
        </Text>
        <Text style={{ fontSize: 12, color: colors.warning }}>
          Sắp hết: {data.filter(p => p.stock > 0 && p.stock < 5).length}
        </Text>
      </View>

      {isMock && (
        <View style={{
          marginHorizontal: 12, marginBottom: 4,
          backgroundColor: 'rgba(255,180,0,0.1)',
          borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
          borderRadius: radius.sm, padding: 8,
        }}>
          <Text style={{ color: '#ffb400', fontSize: 11, textAlign: 'center' }}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item.id ?? i}`}
          renderItem={({ item }) => <ProductCard item={item} colors={colors} />}
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📦</Text>
              <Text style={{ fontSize: 15, color: colors.outline }}>Không tìm thấy sản phẩm</Text>
            </View>
          }
        />
      )}

      {canEdit && (
        <TouchableOpacity
          style={{
            position: 'absolute', bottom: 24, right: 20,
            backgroundColor: colors.primaryContainer,
            borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14,
            elevation: 6, shadowColor: '#000', shadowOpacity: 0.25,
            shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
          }}
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '700' }}>+ Thêm</Text>
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
        colors={colors}
      />
    </View>
  )
}
