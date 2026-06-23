import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, ScrollView, Modal,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import api from '../api/axios'
import { usePermission } from '../hooks/usePermission'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'
import { formatMoney } from '../utils/format'

const STATUS_CONFIG = {
  pending:   { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
  shipping:  { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED' },
  shipped:   { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED' },
  delivered: { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
  completed: { bg: '#D1FAE5', text: '#065F46', border: '#10B981' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  returned:  { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
}

// Map tab key → actual DB status values (uppercase, comma-separated for API)
const STATUS_FILTER_MAP = {
  pending:   ['PENDING', 'CONFIRMED'],
  shipping:  ['SHIPPING', 'SHIPPED'],
  completed: ['COMPLETED', 'DELIVERED'],
  returned:  ['RETURNED', 'CANCELLED'],
}

const CHANNEL_COLORS = {
  shopee:       '#ff6600',
  tiktok:       '#69c9d0',
  'tiktok shop':'#69c9d0',
  lazada:       '#0f146d',
  facebook:     '#1877f2',
  website:      '#4ae176',
  zalo:         '#0066cc',
}
function normalizeChannel(name) {
  if (!name) return ''
  const lower = name.toLowerCase()
  if (lower.includes('shopee')) return 'Shopee'
  if (lower.includes('tiktok')) return 'TikTok Shop'
  if (lower.includes('lazada')) return 'Lazada'
  if (lower.includes('facebook')) return 'Facebook'
  if (lower.includes('website')) return 'Website'
  if (lower.includes('offline') || lower.includes('quầy')) return 'Offline'
  return name
}

function channelColor(ch = '') {
  const norm = normalizeChannel(ch)
  return CHANNEL_COLORS[norm.toLowerCase()] ?? '#6366F1'
}

const MOCK_ORDERS = [
  { orderId: 1, externalOrderId: 'SP-2026-0001', customerName: 'Nguyễn Văn An',  channel: 'Shopee',   status: 'completed', totalAmount: 285_000, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { orderId: 2, externalOrderId: 'TK-2026-0012', customerName: 'Trần Thị Bình',  channel: 'TikTok',   status: 'shipping',  totalAmount: 450_000, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { orderId: 3, externalOrderId: 'LZ-2026-0034', customerName: 'Lê Hoàng Cường', channel: 'Lazada',   status: 'pending',   totalAmount: 1_200_000, createdAt: new Date().toISOString() },
  { orderId: 4, externalOrderId: 'FB-2026-0007', customerName: 'Phạm Thị Dung',  channel: 'Facebook', status: 'cancelled', totalAmount: 350_000, createdAt: new Date(Date.now() - 7200000).toISOString() },
  { orderId: 5, externalOrderId: 'SP-2026-0056', customerName: 'Võ Minh Đức',    channel: 'Shopee',   status: 'returned',  totalAmount: 780_000, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
]

function OrderItem({ item, onPress, colors, statusLabel }) {
  const orderCode    = item.externalOrderId ?? item.external_order_id ?? item.code ?? `#${item.orderId ?? item.id ?? '?'}`
  const customerName = item.customerName   ?? item.customer_name   ?? item.customer?.name   ?? 'Khách lẻ'
  const channel      = normalizeChannel(item.channelName ?? item.channel_name ?? item.channel ?? '')
  const dateStr      = item.orderDate      ?? item.order_date      ?? item.createdAt        ?? item.created_at ?? ''
  const total        = item.totalAmount    ?? item.total_amount    ?? item.grandTotal        ?? 0
  const statusKey    = (item.status        ?? item.orderStatus     ?? 'pending').toLowerCase()
  const cfg    = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending
  const chColor = channelColor(channel)
  const dateDisplay = dateStr
    ? new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: colors.surfaceContainerLow,
        borderRadius: 12, padding: 14, marginBottom: 10,
        borderLeftWidth: 3, borderLeftColor: cfg.border,
        borderWidth: 1, borderColor: colors.outlineVariant,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: colors.outline, fontFamily: 'monospace', flex: 1, marginRight: 8, fontWeight: '700' }} numberOfLines={1}>
          {orderCode}
        </Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: cfg.bg }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.text }}>{statusLabel ?? cfg.label}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.onSurface, flex: 1, marginRight: 8 }} numberOfLines={1}>
          {customerName}
        </Text>
        {channel ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: chColor + '22' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: chColor }}>{channel}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 11, color: colors.outline }}>{dateDisplay}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>₫{formatMoney(total)}</Text>
      </View>
    </TouchableOpacity>
  )
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, marginBottom: 6,
    backgroundColor: c.surfaceContainer,
    borderRadius: radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: c.onSurface },
  clearBtn:    { padding: 4 },
  clearText:   { fontSize: 13, color: c.outline },
  statsRow:  { paddingHorizontal: 14, paddingVertical: 4 },
  statsText: { fontSize: 12, color: c.outline },
  mockBanner: {
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },
  list: { padding: 12, paddingTop: 4, paddingBottom: 100 },
  emptyState:   { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyText:    { fontSize: 15, color: c.onSurface, fontWeight: '600', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: c.outline },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    minWidth: 64, height: 56, borderRadius: 28,
    paddingHorizontal: 16,
    backgroundColor: c.interactive,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 4,
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.3,
    shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  fabText:  { fontSize: 18, color: '#FFFFFF' },
  fabLabel: { fontSize: 13, color: '#FFFFFF', fontWeight: '600' },
  filterSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: c.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  filterSheetTitle:    { color: c.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  filterSectionLabel:  { color: c.textSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 },
  filterOption:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: c.cardBorder,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  radioActive:      { borderColor: c.interactive },
  radioDot:         { width: 10, height: 10, borderRadius: 5, backgroundColor: c.interactive },
  filterOptionText: { color: c.textPrimary, fontSize: 14 },
  filterApplyBtn:   { backgroundColor: c.interactive, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  filterApplyText:  { color: '#FFF', fontWeight: '600', fontSize: 15 },
})

export default function OrdersScreen({ navigation }) {
  const { colors }  = useTheme()
  const { t }       = useTranslation()
  const s           = useMemo(() => makeStyles(colors), [colors])

  const [data,         setData]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page,         setPage]         = useState(1)
  const [hasMore,      setHasMore]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [isMock,       setIsMock]       = useState(false)
  const [totalCount,   setTotalCount]   = useState(0)
  const [showFilter,   setShowFilter]   = useState(false)
  const [filterPeriod, setFilterPeriod] = useState(t('common.day7'))
  const [filterChannel,setFilterChannel]= useState(t('common.all'))
  const searchTimeout = useRef(null)

  // Build comma-separated status param from filter map
  const buildStatusParam = (filterKey) => {
    if (!filterKey) return undefined
    return STATUS_FILTER_MAP[filterKey]?.join(',') ?? filterKey
  }

  const fetchOrders = useCallback(async (opts = {}) => {
    const {
      reset       = false,
      searchVal   = search,
      filterVal   = activeFilter,
      pageNum     = 1,
      extraParams = {},
    } = opts
    try {
      const res = await api.get('/api/orders/oltp', {
        params: {
          search:   searchVal || undefined,
          status:   buildStatusParam(filterVal),
          page:     pageNum,
          pageSize: 50,
          ...extraParams,
        },
      })
      // API trả về PagedResult: { data: [...], total: N, totalPages: N }
      const pagedResult = res.data
      const items       = Array.isArray(pagedResult?.data)  ? pagedResult.data
                        : Array.isArray(pagedResult?.items) ? pagedResult.items
                        : Array.isArray(pagedResult)        ? pagedResult
                        : []
      const totalPages  = pagedResult?.totalPages ?? 1
      const count       = pagedResult?.total ?? pagedResult?.totalCount ?? pagedResult?.count ?? items.length

      setTotalCount(prev => (reset || pageNum === 1) ? count : prev)
      setData(prev => reset ? items : [...prev, ...items])
      setHasMore(pageNum < totalPages && items.length > 0)
      setIsMock(false)
      return pageNum + 1
    } catch {
      if (reset) {
        setData(MOCK_ORDERS)
        setTotalCount(MOCK_ORDERS.length)
        setIsMock(true)
      }
      setHasMore(false)
      return 1
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeFilter])

  const applyFilter = useCallback(() => {
    const periodDays = filterPeriod === t('common.today') ? 1
                     : filterPeriod === t('common.day7')  ? 7
                     : 30
    const channelParam = filterChannel === t('common.all') ? undefined : filterChannel
    setLoading(true)
    setPage(1)
    setHasMore(true)
    setData([])
    fetchOrders({
      reset: true, pageNum: 1,
      extraParams: { days: periodDays, channel: channelParam },
    })
      .then(nextPage => setPage(nextPage))
      .finally(() => setLoading(false))
  }, [filterPeriod, filterChannel, fetchOrders, t])

  useEffect(() => {
    setLoading(true)
    setPage(1)
    setHasMore(true)
    setData([])
    fetchOrders({ reset: true, pageNum: 1 })
      .then(nextPage => setPage(nextPage))
      .finally(() => setLoading(false))
  }, [activeFilter])

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

  const FILTER_TABS = [
    { key: '',          label: t('orders.all')       },
    { key: 'pending',   label: t('orders.pending')   },
    { key: 'shipping',  label: t('orders.shipping')  },
    { key: 'completed', label: t('orders.completed') },
    { key: 'returned',  label: t('orders.returned')  },
  ]

  const PERIOD_OPTIONS  = [t('common.today'), t('common.day7'), t('common.day30')]
  const CHANNEL_OPTIONS = [t('common.all'), 'Shopee', 'Lazada', 'TikTok Shop', 'Facebook', 'Website']

  return (
    <View style={s.container}>
      {/* SearchBar + nút lọc */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder={t('orders.search')}
          placeholderTextColor={colors.outline}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} style={s.clearBtn}>
            <Text style={s.clearText}>✕</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowFilter(true)} style={s.clearBtn}>
            <Text style={{ fontSize: 16, color: colors.outline }}>⚙</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tổng số đơn */}
      <View style={s.statsRow}>
        <Text style={s.statsText}>Tổng: {totalCount} đơn</Text>
      </View>

      {/* Filter tabs */}
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
                height: 36, paddingHorizontal: 16,
                borderRadius: 18, justifyContent: 'center', alignItems: 'center',
                marginRight: 8,
                backgroundColor: active ? colors.interactive : 'transparent',
                borderWidth: active ? 0 : 1, borderColor: colors.outlineVariant,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: active ? '600' : '400',
                color: active ? '#FFFFFF' : colors.outline,
              }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>{t('common.mockBanner')}</Text>
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item.orderId ?? item.id ?? i}`}
          renderItem={({ item }) => {
            const statusKey = (item.status ?? item.orderStatus ?? 'pending').toLowerCase()
            const statusLabel = t(`status.${statusKey}`, { defaultValue: statusKey })
            return (
              <OrderItem
                item={item}
                colors={colors}
                statusLabel={statusLabel}
                onPress={() => navigation.navigate('OrderDetail', {
                  orderId:   item.orderId ?? item.id,
                  orderData: item,
                })}
              />
            )
          }}
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
              <Text style={s.emptyText}>
                {activeFilter
                  ? `${t('common.no')} "${FILTER_TABS.find(tab => tab.key === activeFilter)?.label}"`
                  : t('orders.empty')}
              </Text>
              <Text style={s.emptySubText}>{t('orders.emptyHint')}</Text>
            </View>
          }
        />
      )}



      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowFilter(false)}
          activeOpacity={1}
        >
          <View style={s.filterSheet}>
            <Text style={s.filterSheetTitle}>{t('orders.filterTitle')}</Text>
            <Text style={s.filterSectionLabel}>{t('orders.filterPeriod')}</Text>
            {PERIOD_OPTIONS.map(period => (
              <TouchableOpacity key={period} onPress={() => setFilterPeriod(period)} style={s.filterOption}>
                <View style={[s.radio, filterPeriod === period && s.radioActive]}>
                  {filterPeriod === period && <View style={s.radioDot} />}
                </View>
                <Text style={s.filterOptionText}>{period}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[s.filterSectionLabel, { marginTop: 16 }]}>{t('orders.filterChannel')}</Text>
            {CHANNEL_OPTIONS.map(ch => (
              <TouchableOpacity key={ch} onPress={() => setFilterChannel(ch)} style={s.filterOption}>
                <View style={[s.radio, filterChannel === ch && s.radioActive]}>
                  {filterChannel === ch && <View style={s.radioDot} />}
                </View>
                <Text style={s.filterOptionText}>{ch}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { applyFilter(); setShowFilter(false) }} style={s.filterApplyBtn}>
              <Text style={s.filterApplyText}>{t('orders.apply')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}
