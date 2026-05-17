import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, ScrollView, Alert, Modal,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

// ─── Hàm format tiền rút gọn ─────────────────────────────────────────────────
function formatMoney(value) {
  if (value == null || isNaN(value)) return '0'
  const n = Number(value)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

// ─── Trạng thái đơn hàng — màu theo spec mới ─────────────────────────────────
const STATUS_CONFIG = {
  pending:   { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B', label: 'Chờ xử lý'   },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6', label: 'Đã xác nhận' },
  shipping:  { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6', label: 'Đang giao'   },
  shipped:   { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6', label: 'Đang giao'   },
  delivered: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', label: 'Hoàn thành'  },
  completed: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', label: 'Hoàn thành'  },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', label: 'Hoàn đơn'   },
  returned:  { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', label: 'Hoàn đơn'   },
}
// Backward compat — vẫn giữ để không vỡ code cũ nếu có tham chiếu
const STATUS_COLOR = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, { bg: v.bg, text: v.text }])
)
const STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])
)

// ─── Filter tabs ──────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: '',          label: 'Tất cả'     },
  { key: 'pending',   label: 'Chờ xử lý' },
  { key: 'shipping',  label: 'Đang giao'  },
  { key: 'completed', label: 'Hoàn thành' },
  { key: 'returned',  label: 'Hoàn đơn'  },
]

// ─── Màu badge kênh ───────────────────────────────────────────────────────────
const CHANNEL_COLORS = {
  shopee:    '#ff6600',
  tiktok:    '#69c9d0',
  lazada:    '#0f146d',
  facebook:  '#1877f2',
  website:   '#4ae176',
  zalo:      '#0066cc',
  'tiktok shop': '#69c9d0',
}
function channelColor(ch = '') {
  return CHANNEL_COLORS[ch.toLowerCase()] ?? colors.secondary
}

// ─── Mock data fallback ───────────────────────────────────────────────────────
const MOCK_ORDERS = {
  items: [
    {
      orderId: 1, externalOrderId: 'SP-2026-0001',
      customerName: 'Nguyễn Văn An',
      channel: 'Shopee', status: 'completed',
      totalAmount: 285_000, createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      orderId: 2, externalOrderId: 'TK-2026-0012',
      customerName: 'Trần Thị Bình',
      channel: 'TikTok', status: 'shipping',
      totalAmount: 450_000, createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      orderId: 3, externalOrderId: 'LZ-2026-0034',
      customerName: 'Lê Hoàng Cường',
      channel: 'Lazada', status: 'pending',
      totalAmount: 1_200_000, createdAt: new Date().toISOString(),
    },
    {
      orderId: 4, externalOrderId: 'FB-2026-0007',
      customerName: 'Phạm Thị Dung',
      channel: 'Facebook', status: 'cancelled',
      totalAmount: 350_000, createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    },
    {
      orderId: 5, externalOrderId: 'SP-2026-0056',
      customerName: 'Võ Minh Đức',
      channel: 'Shopee', status: 'returned',
      totalAmount: 780_000, createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    },
  ],
  totalCount: 5,
  page: 1,
  totalPages: 1,
}

// ─── Hàm hiển thị thời gian tương đối ────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'Vừa xong'
  if (mins < 60)  return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs} giờ trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

// ─── Item component — FIX 2: field mapping đa format + card redesign ─────────
function OrderItem({ item }) {
  // Lấy field theo nhiều tên khác nhau từ các backend format
  const orderCode    = item.externalOrderId ?? item.external_order_id ?? item.code ?? `#${item.orderId ?? item.id ?? '?'}`
  const customerName = item.customerName   ?? item.customer_name   ?? item.customer?.name   ?? 'Khách lẻ'
  const channel      = item.channelName    ?? item.channel_name    ?? item.channel          ?? ''
  const dateStr      = item.orderDate      ?? item.order_date      ?? item.createdAt        ?? item.created_at ?? ''
  const total        = item.totalAmount    ?? item.total_amount    ?? item.grandTotal        ?? item.unit_price ?? 0
  const statusKey    = (item.status        ?? item.orderStatus     ?? 'pending').toLowerCase()

  const cfg    = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending
  const chColor = channelColor(channel)

  // Format ngày giờ: hiển thị ngày cụ thể (dd/MM/yyyy)
  const dateDisplay = dateStr
    ? new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <View style={[s.orderCard, { borderLeftColor: cfg.border }]}>
      {/* Dòng 1: mã đơn + badge trạng thái */}
      <View style={s.orderHeader}>
        <Text style={s.orderId} numberOfLines={1}>{orderCode}</Text>
        <View style={[s.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Dòng 2: tên khách + badge kênh */}
      <View style={s.orderRow2}>
        <Text style={s.customerName} numberOfLines={1}>{customerName}</Text>
        {channel ? (
          <View style={[s.channelBadge, { backgroundColor: chColor + '22' }]}>
            <Text style={[s.channelBadgeText, { color: chColor }]}>{channel}</Text>
          </View>
        ) : null}
      </View>

      {/* Dòng 3: ngày + tổng tiền */}
      <View style={s.orderFooter}>
        <Text style={s.date}>{dateDisplay}</Text>
        <Text style={s.amount}>₫{formatMoney(total)}</Text>
      </View>
    </View>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrdersScreen({ navigation }) {
  const [data,         setData]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page,         setPage]         = useState(1)
  const [hasMore,      setHasMore]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [isMock,       setIsMock]       = useState(false)
  // FIX 4 — Filter modal state
  const [showFilter,    setShowFilter]    = useState(false)
  const [filterPeriod,  setFilterPeriod]  = useState('7 ngày')
  const [filterChannel, setFilterChannel] = useState('Tất cả')
  const searchTimeout = useRef(null)

  // Fetch danh sách đơn hàng
  const fetchOrders = useCallback(async (opts = {}) => {
    const {
      reset       = false,
      searchVal   = search,
      filterVal   = activeFilter,
      pageNum     = 1,
      extraParams = {},
    } = opts

    try {
      const res = await api.get('/api/orders', {
        params: {
          search:  searchVal || undefined,
          status:  filterVal || undefined,
          page:    pageNum,
          limit:   15,
          ...extraParams,
        },
      })
      const raw   = res.data?.data ?? res.data
      const items = raw?.items ?? raw ?? []
      const total = raw?.totalPages ?? 1
      setData(prev => reset ? items : [...prev, ...items])
      setHasMore(pageNum < total && items.length === 15)
      setIsMock(false)
      return pageNum + 1
    } catch {
      // Dùng mock data nếu API lỗi
      if (reset) {
        let filtered = MOCK_ORDERS.items
        if (filterVal) filtered = filtered.filter(o => o.status === filterVal || o.status === (filterVal === 'shipping' ? 'shipped' : filterVal))
        if (searchVal) filtered = filtered.filter(o =>
          o.externalOrderId.toLowerCase().includes(searchVal.toLowerCase()) ||
          o.customerName.toLowerCase().includes(searchVal.toLowerCase())
        )
        setData(filtered)
        setIsMock(true)
      }
      setHasMore(false)
      return 1
    }
  }, [search, activeFilter])

  // FIX 4 — Áp dụng filter nâng cao từ modal
  const applyFilter = useCallback(() => {
    // Map period → số ngày để truyền lên API (dùng params nếu backend hỗ trợ)
    const periodDays = filterPeriod === 'Hôm nay' ? 1 : filterPeriod === '7 ngày' ? 7 : 30
    const channelParam = filterChannel === 'Tất cả' ? undefined : filterChannel
    setLoading(true)
    setPage(1)
    setHasMore(true)
    setData([])
    fetchOrders({
      reset: true,
      pageNum: 1,
      // Gửi thêm params nếu backend hỗ trợ — nếu không backend bỏ qua
      extraParams: { days: periodDays, channel: channelParam },
    })
      .then(nextPage => setPage(nextPage))
      .finally(() => setLoading(false))
  }, [filterPeriod, filterChannel, fetchOrders])

  // Load lần đầu hoặc khi filter / search thay đổi
  useEffect(() => {
    setLoading(true)
    setPage(1)
    setHasMore(true)
    setData([])
    fetchOrders({ reset: true, pageNum: 1 })
      .then(nextPage => setPage(nextPage))
      .finally(() => setLoading(false))
  }, [activeFilter])

  // Debounce search 400ms
  useEffect(() => {
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setLoading(true)
      setPage(1)
      setHasMore(true)
      setData([])
      fetchOrders({ reset: true, searchVal: search, pageNum: 1 })
        .then(nextPage => setPage(nextPage))
        .finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search])

  const onRefresh = async () => {
    setRefreshing(true)
    setPage(1)
    setHasMore(true)
    const next = await fetchOrders({ reset: true, pageNum: 1 })
    setPage(next)
    setRefreshing(false)
  }

  const onLoadMore = async () => {
    if (!hasMore || loadingMore || loading) return
    setLoadingMore(true)
    const next = await fetchOrders({ reset: false, pageNum: page })
    setPage(next)
    setLoadingMore(false)
  }

  return (
    <View style={s.container}>
      {/* SearchBar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm mã đơn, tên khách hàng..."
          placeholderTextColor={colors.outline}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}>
            <Text style={s.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* FIX 3 — Filter tabs: compact pill style, cuộn ngang */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
      >
        {FILTER_TABS.map(tab => {
          const active = activeFilter === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveFilter(tab.key)}
              style={{
                height: 36,
                paddingHorizontal: 16,
                borderRadius: 18,
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 8,
                backgroundColor: active ? '#6366F1' : 'transparent',
                borderWidth: active ? 0 : 1,
                borderColor: '#374151',
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: active ? '600' : '400',
                color: active ? '#FFFFFF' : '#9CA3AF',
              }}>
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

      {/* Danh sách đơn hàng */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item.orderId ?? i}`}
          renderItem={({ item }) => <OrderItem item={item} />}
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
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyText}>Không có đơn hàng nào</Text>
              <Text style={s.emptySubText}>Kéo xuống để làm mới</Text>
            </View>
          }
        />
      )}

      {/* FIX 4 — Nút Lọc nâng cao thay FAB "+" */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => setShowFilter(true)}
        activeOpacity={0.85}
      >
        <Text style={s.fabText}>⚙</Text>
        <Text style={s.fabLabel}>Lọc</Text>
      </TouchableOpacity>

      {/* FIX 4 — Modal lọc nâng cao (bottom sheet) */}
      <Modal
        visible={showFilter}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilter(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowFilter(false)}
          activeOpacity={1}
        >
          <View style={s.filterSheet}>
            <Text style={s.filterSheetTitle}>Lọc nâng cao</Text>

            {/* Khoảng thời gian */}
            <Text style={s.filterSectionLabel}>KHOẢNG THỜI GIAN</Text>
            {['Hôm nay', '7 ngày', '30 ngày'].map(period => (
              <TouchableOpacity
                key={period}
                onPress={() => setFilterPeriod(period)}
                style={s.filterOption}
              >
                <View style={[s.radio, filterPeriod === period && s.radioActive]}>
                  {filterPeriod === period && <View style={s.radioDot} />}
                </View>
                <Text style={s.filterOptionText}>{period}</Text>
              </TouchableOpacity>
            ))}

            {/* Kênh bán hàng */}
            <Text style={[s.filterSectionLabel, { marginTop: 16 }]}>KÊNH BÁN HÀNG</Text>
            {['Tất cả', 'Shopee', 'Lazada', 'TikTok', 'Facebook', 'Website'].map(ch => (
              <TouchableOpacity
                key={ch}
                onPress={() => setFilterChannel(ch)}
                style={s.filterOption}
              >
                <View style={[s.radio, filterChannel === ch && s.radioActive]}>
                  {filterChannel === ch && <View style={s.radioDot} />}
                </View>
                <Text style={s.filterOptionText}>{ch}</Text>
              </TouchableOpacity>
            ))}

            {/* Nút áp dụng */}
            <TouchableOpacity
              onPress={() => { applyFilter(); setShowFilter(false) }}
              style={s.filterApplyBtn}
            >
              <Text style={s.filterApplyText}>Áp dụng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // SearchBar
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: colors.onSurface },
  clearBtn:    { padding: 4 },
  clearText:   { fontSize: 13, color: colors.outline },

  // Filter chips — FIX 3: styles sudah di-inline di JSX, sisini placeholder
  filterBar: { paddingHorizontal: 16, paddingVertical: 8 },

  // Mock banner
  mockBanner: {
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  // List
  list: { padding: 12, paddingTop: 4, paddingBottom: 100 },

  // Order card — FIX 2: borderLeft theo status, layout 3 dòng rõ ràng
  orderCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12, padding: 14, marginBottom: 10,
    borderLeftWidth: 3,
    // borderLeftColor được truyền inline theo status
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  orderId: {
    fontSize: 13, color: colors.outline,
    fontFamily: 'monospace', flex: 1, marginRight: 8,
    fontWeight: '700',
  },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  // Dòng 2: tên khách + badge kênh
  orderRow2: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  customerName: {
    fontSize: 14, fontWeight: '700', color: colors.onSurface,
    flex: 1, marginRight: 8,
  },
  // Dòng 3: ngày + tiền
  orderFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  channelBadgeText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '700', color: colors.primary },
  date:   { fontSize: 11, color: colors.outline },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: colors.onSurface, fontWeight: '600', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: colors.outline },

  // FAB — FIX 4: đổi thành nút lọc có label
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    minWidth: 64, height: 56, borderRadius: 28,
    paddingHorizontal: 16,
    backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  fabText:  { fontSize: 18, color: '#FFFFFF' },
  fabLabel: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },

  // Filter modal (bottom sheet) — FIX 4
  filterSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1F2937',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  filterSheetTitle: {
    color: '#F9FAFB', fontSize: 16, fontWeight: '700', marginBottom: 16,
  },
  filterSectionLabel: {
    color: '#9CA3AF', fontSize: 12, fontWeight: '600',
    letterSpacing: 0.8, marginBottom: 4,
  },
  filterOption: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  radioActive: { borderColor: '#6366F1' },
  radioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6366F1' },
  filterOptionText: { color: '#F9FAFB', fontSize: 14 },
  filterApplyBtn: {
    backgroundColor: '#6366F1', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 20,
  },
  filterApplyText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
})
