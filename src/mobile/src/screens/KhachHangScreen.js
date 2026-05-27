import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  ScrollView,
} from 'react-native'
import api from '../api/axios'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

function formatMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0'
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

// ─── RFM Segment config ───────────────────────────────────────────────────────
const SEGMENT_CONFIG = {
  VIP:         { color: '#FFD700', bg: 'rgba(255,215,0,0.15)',     icon: '👑', priority: 1 },
  Loyal:       { color: '#4AE176', bg: 'rgba(74,225,118,0.15)',    icon: '💚', priority: 2 },
  Promising:   { color: '#60A5FA', bg: 'rgba(96,165,250,0.15)',    icon: '⭐', priority: 3 },
  'At Risk':   { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',    icon: '⚠️', priority: 4 },
  Lost:        { color: '#EF4444', bg: 'rgba(239,68,68,0.15)',     icon: '💔', priority: 5 },
  New:         { color: '#A78BFA', bg: 'rgba(167,139,250,0.15)',   icon: '🆕', priority: 6 },
  Hibernating: { color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)',   icon: '😴', priority: 7 },
}
const DEFAULT_SEG = { color: '#64748B', bg: '#E2E8F0', icon: '👤', priority: 99 }

const SEGMENT_TABS = [
  { key: '',          label: 'Tất cả'    },
  { key: 'VIP',       label: '👑 VIP'    },
  { key: 'At Risk',   label: '⚠️ Rủi ro' },
  { key: 'Lost',      label: '💔 Mất'    },
  { key: 'New',       label: '🆕 Mới'    },
]

const MOCK_CUSTOMERS = [
  { id: 1, name: 'Nguyễn Thị Hoa',    phone: '0901234567', totalOrders: 12, totalSpent: 4_200_000, segment: 'VIP',         email: 'hoa@mail.com' },
  { id: 2, name: 'Trần Văn Minh',     phone: '0912345678', totalOrders: 8,  totalSpent: 2_800_000, segment: 'Loyal',       email: '' },
  { id: 3, name: 'Lê Hoàng Phúc',     phone: '0923456789', totalOrders: 3,  totalSpent: 890_000,   segment: 'Promising',   email: '' },
  { id: 4, name: 'Phạm Thị Lan',      phone: '0934567890', totalOrders: 6,  totalSpent: 1_500_000, segment: 'At Risk',     email: 'lan@mail.com' },
  { id: 5, name: 'Võ Minh Tuấn',      phone: '0945678901', totalOrders: 1,  totalSpent: 250_000,   segment: 'New',         email: '' },
  { id: 6, name: 'Đặng Thị Bích',     phone: '0956789012', totalOrders: 2,  totalSpent: 450_000,   segment: 'Hibernating', email: '' },
  { id: 7, name: 'Nguyễn Văn Cường',  phone: '0967890123', totalOrders: 0,  totalSpent: 0,         segment: 'Lost',        email: '' },
  { id: 8, name: 'Trương Thị Mai',    phone: '0978901234', totalOrders: 15, totalSpent: 6_800_000, segment: 'VIP',         email: 'mai@mail.com' },
]

// ─── CustomerCard component ───────────────────────────────────────────────────
function CustomerCard({ item, onPress, s, colors }) {
  const seg = SEGMENT_CONFIG[item.segment] ?? DEFAULT_SEG
  const initials = (item.name ?? 'K')
    .split(' ')
    .slice(-1)[0]
    ?.charAt(0)
    ?.toUpperCase() ?? 'K'

  return (
    <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.8} style={s.card}>
      <View style={[s.avatar, { backgroundColor: seg.bg }]}>
        <Text style={[s.avatarText, { color: seg.color }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>{item.name ?? 'Khách ẩn danh'}</Text>
          <View style={[s.segBadge, { backgroundColor: seg.bg }]}>
            <Text style={[s.segText, { color: seg.color }]}>{seg.icon} {item.segment}</Text>
          </View>
        </View>
        <Text style={s.phone}>{item.phone ?? '—'}</Text>
        <View style={s.statsRow}>
          <Text style={s.statItem}>🛒 {item.totalOrders ?? 0} đơn</Text>
          <Text style={s.statItem}>💰 ₫{formatMoney(item.totalSpent)}</Text>
        </View>
      </View>
      <Text style={{ color: colors.outline, fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  )
}

// ─── CustomerDetail screen ────────────────────────────────────────────────────
function CustomerDetailScreen({ customer, onBack, s, colors }) {
  const seg = SEGMENT_CONFIG[customer.segment] ?? DEFAULT_SEG
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={s.detailHeader}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={{ color: colors.primary, fontSize: 16 }}>‹ Quay lại</Text>
        </TouchableOpacity>
        <Text style={s.detailTitle}>Chi tiết khách hàng</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        <View style={s.detailAvatarSection}>
          <View style={[s.detailAvatar, { backgroundColor: seg.bg }]}>
            <Text style={[s.detailAvatarText, { color: seg.color }]}>
              {(customer.name ?? 'K').split(' ').slice(-1)[0]?.charAt(0)?.toUpperCase() ?? 'K'}
            </Text>
          </View>
          <Text style={s.detailName}>{customer.name}</Text>
          <View style={[s.segBadge, { backgroundColor: seg.bg, marginTop: 6 }]}>
            <Text style={[s.segText, { color: seg.color }]}>{seg.icon}  {customer.segment}</Text>
          </View>
        </View>

        <View style={s.detailCard}>
          <Text style={s.detailCardLabel}>THÔNG TIN LIÊN HỆ</Text>
          <DetailRow icon="📞" label="SĐT"   value={customer.phone || '—'} s={s} />
          <DetailRow icon="📧" label="Email" value={customer.email || '—'} s={s} />
        </View>

        <View style={s.detailCard}>
          <Text style={s.detailCardLabel}>SỐ LIỆU MUA HÀNG</Text>
          <DetailRow icon="🛒" label="Tổng đơn"      value={`${customer.totalOrders ?? 0} đơn`}      s={s} />
          <DetailRow icon="💰" label="Tổng chi tiêu"  value={`₫${formatMoney(customer.totalSpent)}`}  s={s} />
        </View>
      </ScrollView>
    </View>
  )
}

function DetailRow({ icon, label, value, s }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailIcon}>{icon}</Text>
      <Text style={s.detailLabel}>{label}:</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KhachHangScreen({ navigation }) {
  const { colors } = useTheme()
  const s          = useMemo(() => makeStyles(colors), [colors])

  const [data,              setData]              = useState([])
  const [loading,           setLoading]           = useState(true)
  const [refreshing,        setRefreshing]        = useState(false)
  const [search,            setSearch]            = useState('')
  const [activeSegment,     setActiveSegment]     = useState('')
  const [isMock,            setIsMock]            = useState(false)
  const [selectedCustomer,  setSelectedCustomer]  = useState(null)
  const [page,              setPage]              = useState(1)
  const [hasMore,           setHasMore]           = useState(true)
  const [loadingMore,       setLoadingMore]       = useState(false)
  const searchTimeout = useRef(null)

  const normalizeCustomer = (c) => ({
    id:          c.id          ?? c.customerId   ?? c.customer_id,
    name:        c.name        ?? c.customerName  ?? c.customer_name ?? 'Khách hàng',
    phone:       c.phone       ?? c.phoneNumber   ?? c.phone_number  ?? '',
    email:       c.email       ?? '',
    totalOrders: c.totalOrders ?? c.total_orders  ?? 0,
    totalSpent:  c.totalSpent  ?? c.total_spent   ?? 0,
    segment:     c.segment     ?? c.rfmSegment    ?? '',
  })

  const fetchCustomers = useCallback(async (opts = {}) => {
    const { reset = false, q = search, seg = activeSegment, pageNum = 1 } = opts
    try {
      const res = await api.get('/api/customers', {
        params: {
          search:     q || undefined,
          segment:    seg || undefined,
          includeRfm: true,
          page:       pageNum,
          pageSize:   20,
        },
      })
      const raw   = res.data?.data ?? res.data
      const list  = Array.isArray(raw) ? raw : (raw?.items ?? [])
      const total = raw?.totalPages ?? 1
      const normalized = list.map(normalizeCustomer)
      setData(prev => reset ? normalized : [...prev, ...normalized])
      setHasMore(pageNum < total && list.length === 20)
      setIsMock(false)
      return pageNum + 1
    } catch {
      if (reset) {
        let filtered = MOCK_CUSTOMERS
        if (q)   filtered = filtered.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))
        if (seg) filtered = filtered.filter(c => c.segment === seg)
        setData(filtered)
        setIsMock(true)
      }
      setHasMore(false)
      return 1
    }
  }, [search, activeSegment])

  useEffect(() => {
    setLoading(true)
    setPage(1)
    setHasMore(true)
    fetchCustomers({ reset: true, seg: activeSegment, pageNum: 1 })
      .then(next => setPage(next))
      .finally(() => setLoading(false))
  }, [activeSegment])

  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setLoading(true)
      setPage(1)
      fetchCustomers({ reset: true, q: search, pageNum: 1 })
        .then(next => setPage(next))
        .finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search])

  const onRefresh = async () => {
    setRefreshing(true)
    const next = await fetchCustomers({ reset: true, pageNum: 1 })
    setPage(next)
    setRefreshing(false)
  }

  const onLoadMore = async () => {
    if (!hasMore || loadingMore || loading) return
    setLoadingMore(true)
    const next = await fetchCustomers({ reset: false, pageNum: page })
    setPage(next)
    setLoadingMore(false)
  }

  const segCounts = data.reduce((acc, c) => {
    if (c.segment) acc[c.segment] = (acc[c.segment] ?? 0) + 1
    return acc
  }, {})

  if (selectedCustomer) {
    return (
      <CustomerDetailScreen
        customer={selectedCustomer}
        onBack={() => setSelectedCustomer(null)}
        s={s}
        colors={colors}
      />
    )
  }

  return (
    <View style={s.container}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm tên, số điện thoại..."
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

      {/* Tabs lọc segment */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6 }}
      >
        {SEGMENT_TABS.map(tab => {
          const active = activeSegment === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveSegment(tab.key)}
              style={[s.filterTab, active && s.filterTabActive]}
            >
              <Text style={[s.filterTabText, active && s.filterTabTextActive]}>
                {tab.label}
                {tab.key && segCounts[tab.key] ? `  (${segCounts[tab.key]})` : ''}
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

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `cust-${item.id ?? i}`}
          renderItem={({ item }) => (
            <CustomerCard item={item} onPress={setSelectedCustomer} s={s} colors={colors} />
          )}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore
              ? <ActivityIndicator size="small" color={colors.primary} style={{ margin: 16 }} />
              : null
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyText}>Không tìm thấy khách hàng</Text>
              <Text style={s.emptySubText}>Kéo xuống để làm mới</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 4,
    backgroundColor: c.surfaceContainer,
    borderRadius: radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: c.onSurface },
  clearText:   { fontSize: 13, color: c.outline, padding: 4 },

  filterTab: {
    height: 32, paddingHorizontal: 12,
    borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    marginRight: 8, borderWidth: 1, borderColor: c.outlineVariant,
  },
  filterTabActive:     { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterTabText:       { fontSize: 12, color: c.outline },
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
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700' },
  nameRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' },
  name:       { fontSize: 14, fontWeight: '700', color: c.onSurface, flex: 1, marginRight: 6 },
  segBadge:   { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  segText:    { fontSize: 10, fontWeight: '700' },
  phone:      { fontSize: 12, color: c.outline, marginBottom: 6 },
  statsRow:   { flexDirection: 'row', gap: 16 },
  statItem:   { fontSize: 12, color: c.outline },

  emptyState:   { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyText:    { fontSize: 15, color: c.onSurface, fontWeight: '600', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: c.outline },

  // Detail screen
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: c.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: c.outlineVariant,
  },
  backBtn:     { padding: 4 },
  detailTitle: { fontSize: 16, fontWeight: '700', color: c.onSurface },
  detailAvatarSection: {
    alignItems: 'center', paddingVertical: 24,
    backgroundColor: c.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: c.outlineVariant,
  },
  detailAvatar: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  detailAvatarText: { fontSize: 28, fontWeight: '700' },
  detailName:       { fontSize: 18, fontWeight: '700', color: c.onSurface },

  detailCard: {
    backgroundColor: c.card,
    borderRadius: radius.md, padding: 16,
    marginHorizontal: 12, marginTop: 12,
  },
  detailCardLabel: {
    fontSize: 11, fontWeight: '700', color: c.textSecondary,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  detailRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  detailIcon:  { fontSize: 15, marginRight: 8, width: 24 },
  detailLabel: { fontSize: 13, color: c.textSecondary, width: 100 },
  detailValue: { fontSize: 13, color: c.textPrimary, flex: 1 },
})
