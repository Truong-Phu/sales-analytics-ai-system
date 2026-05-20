import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

function formatMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0'
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

// ─── Phân loại tồn kho ────────────────────────────────────────────────────────
function getStockLevel(stock, minStock = 10) {
  if (stock <= 0)          return { label: 'Hết hàng', color: '#EF4444', bg: 'rgba(239,68,68,0.15)',  pct: 0   }
  if (stock < minStock)    return { label: 'Sắp hết',  color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', pct: Math.min(stock / minStock, 1) * 100 }
  return                          { label: 'Còn hàng', color: '#4AE176', bg: 'rgba(74,225,118,0.15)', pct: Math.min(stock / (minStock * 5), 1) * 100 }
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',      label: 'Tất cả'   },
  { key: 'low',      label: '⚠️ Sắp hết' },
  { key: 'out',      label: '❌ Hết hàng' },
]

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_PRODUCTS = [
  { id: 1, name: 'Áo thun Unisex oversize',   category: 'Áo',        price: 189_000, stock: 45, minStock: 10 },
  { id: 2, name: 'Quần jogger cotton cao cấp', category: 'Quần',      price: 279_000, stock: 3,  minStock: 10 },
  { id: 3, name: 'Váy hoa midi dáng xòe',     category: 'Váy',       price: 349_000, stock: 0,  minStock: 5  },
  { id: 4, name: 'Áo khoác dù unisex',        category: 'Áo',        price: 459_000, stock: 7,  minStock: 10 },
  { id: 5, name: 'Giày sneaker trắng',         category: 'Giày',      price: 599_000, stock: 28, minStock: 8  },
  { id: 6, name: 'Túi tote canvas',            category: 'Phụ kiện',  price: 149_000, stock: 0,  minStock: 5  },
  { id: 7, name: 'Nón bucket cotton',          category: 'Phụ kiện',  price: 119_000, stock: 2,  minStock: 10 },
  { id: 8, name: 'Dép quai hậu EVA',           category: 'Giày',      price: 199_000, stock: 18, minStock: 8  },
]

// ─── StockCard component ──────────────────────────────────────────────────────
function StockCard({ item }) {
  const minStock = item.minStock ?? item.min_stock ?? 10
  const level    = getStockLevel(item.stock, minStock)

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.productName} numberOfLines={2}>{item.name}</Text>
          <Text style={s.category}>{item.category ?? '—'}</Text>
          <Text style={s.price}>₫{formatMoney(item.price ?? item.unitPrice ?? item.unit_price ?? 0)}</Text>
        </View>
        {/* Badge trạng thái */}
        <View style={[s.stockBadge, { backgroundColor: level.bg }]}>
          <Text style={[s.stockBadgeText, { color: level.color }]}>{level.label}</Text>
        </View>
      </View>

      {/* Progress bar tồn kho */}
      <View style={s.progressSection}>
        <View style={s.progressHeader}>
          <Text style={[s.stockNum, { color: level.color }]}>
            {item.stock} / {minStock * 5}
          </Text>
          <Text style={s.minStockText}>Tối thiểu: {minStock}</Text>
        </View>
        <View style={s.progressBg}>
          <View
            style={[
              s.progressFill,
              {
                width: `${level.pct}%`,
                backgroundColor: level.color,
              },
            ]}
          />
        </View>
      </View>
    </View>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TonKhoScreen() {
  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isMock,     setIsMock]     = useState(false)
  const [activeTab,  setActiveTab]  = useState('all')

  const fetchProducts = useCallback(async () => {
    try {
      const res  = await api.get('/api/products', { params: { limit: 100 } })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setData(list.map(p => ({
        id:       p.id          ?? p.productId       ?? p.product_id,
        name:     p.name        ?? p.productName      ?? p.product_name ?? 'Sản phẩm',
        category: p.categoryName ?? p.category_name  ?? p.category     ?? '',
        price:    p.price        ?? p.unitPrice       ?? p.unit_price   ?? 0,
        stock:    p.stock        ?? p.stockQuantity   ?? p.stock_quantity ?? 0,
        minStock: p.minStock     ?? p.min_stock       ?? 10,
      })))
      setIsMock(false)
    } catch {
      setData(MOCK_PRODUCTS)
      setIsMock(true)
    }
  }, [])

  useEffect(() => {
    fetchProducts().finally(() => setLoading(false))
  }, [fetchProducts])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchProducts()
    setRefreshing(false)
  }

  // Lọc theo tab
  const filtered = data.filter(p => {
    if (activeTab === 'out') return p.stock <= 0
    if (activeTab === 'low') return p.stock > 0 && p.stock < (p.minStock ?? 10)
    return true
  })

  // Thống kê
  const outCount = data.filter(p => p.stock <= 0).length
  const lowCount = data.filter(p => p.stock > 0 && p.stock < (p.minStock ?? 10)).length

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Tóm tắt thống kê */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>{data.length}</Text>
          <Text style={s.summaryLabel}>Tổng SP</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: '#EF4444' }]}>{outCount}</Text>
          <Text style={s.summaryLabel}>Hết hàng</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: '#F59E0B' }]}>{lowCount}</Text>
          <Text style={s.summaryLabel}>Sắp hết</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
      >
        {FILTER_TABS.map(tab => {
          const active = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[s.filterTab, active && s.filterTabActive]}
            >
              <Text style={[s.filterTabText, active && s.filterTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Banner mock */}
      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {/* Danh sách */}
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `stock-${item.id ?? i}`}
        renderItem={({ item }) => <StockCard item={item} />}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📦</Text>
            <Text style={s.emptyText}>
              {activeTab === 'out' ? 'Không có sản phẩm hết hàng' :
               activeTab === 'low' ? 'Không có sản phẩm sắp hết' :
               'Chưa có sản phẩm nào'}
            </Text>
          </View>
        }
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summaryRow: { flexDirection: 'row', padding: 12, paddingBottom: 0, gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  summaryNum:   { fontSize: 20, fontWeight: '700', color: colors.onSurface },
  summaryLabel: { fontSize: 10, color: colors.outline, marginTop: 3, textAlign: 'center' },

  filterTab: {
    height: 32, paddingHorizontal: 14,
    borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    marginRight: 8, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  filterTabActive:     { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterTabText:       { fontSize: 12, color: '#9CA3AF' },
  filterTabTextActive: { color: '#FFF', fontWeight: '700' },

  mockBanner: {
    marginHorizontal: 12, marginBottom: 4,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  list: { padding: 12, paddingBottom: 24 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  productName: { fontSize: 14, fontWeight: '700', color: colors.onSurface, marginBottom: 3 },
  category:    { fontSize: 12, color: colors.outline, marginBottom: 4 },
  price:       { fontSize: 13, fontWeight: '700', color: colors.primary },
  stockBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full, marginLeft: 8 },
  stockBadgeText: { fontSize: 11, fontWeight: '700' },

  progressSection: {},
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6,
  },
  stockNum:     { fontSize: 13, fontWeight: '700' },
  minStockText: { fontSize: 11, color: colors.outline },
  progressBg:  { height: 8, backgroundColor: colors.surfaceContainerHigh, borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: colors.outline },
})
