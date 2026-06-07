import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import api from '../api/axios'
import { usePlan, usePermission } from '../hooks/usePermission'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'
import { formatMoney } from '../utils/format'

// RFM segment config
const SEGMENT_CONFIG = {
  VIP:         { color: '#ffd700', bg: 'rgba(255,215,0,0.15)',    icon: '👑' },
  Loyal:       { color: '#4ae176', bg: 'rgba(74,225,118,0.15)',   icon: '💚' },
  Promising:   { color: '#adc6ff', bg: 'rgba(173,198,255,0.15)', icon: '⭐' },
  'At Risk':   { color: '#ffb400', bg: 'rgba(255,180,0,0.15)',    icon: '⚠️' },
  Lost:        { color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)', icon: '💔' },
  New:         { color: '#c4c0ff', bg: 'rgba(196,192,255,0.15)', icon: '🆕' },
  Hibernating: { color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)', icon: '😴' },
}
const DEFAULT_SEG = { color: '#64748B', bg: '#E2E8F0', icon: '👤' }

const MOCK_CUSTOMERS = [
  { id: 1, name: 'Nguyễn Thị Hoa',   phone: '0901234567', totalOrders: 12, totalSpent: 4_200_000, segment: 'VIP'         },
  { id: 2, name: 'Trần Văn Minh',    phone: '0912345678', totalOrders: 8,  totalSpent: 2_800_000, segment: 'Loyal'       },
  { id: 3, name: 'Lê Hoàng Phúc',    phone: '0923456789', totalOrders: 3,  totalSpent: 890_000,   segment: 'Promising'   },
  { id: 4, name: 'Phạm Thị Lan',     phone: '0934567890', totalOrders: 6,  totalSpent: 1_500_000, segment: 'At Risk'     },
  { id: 5, name: 'Võ Minh Tuấn',     phone: '0945678901', totalOrders: 1,  totalSpent: 250_000,   segment: 'New'         },
  { id: 6, name: 'Đặng Thị Bích',    phone: '0956789012', totalOrders: 2,  totalSpent: 450_000,   segment: 'Hibernating' },
  { id: 7, name: 'Nguyễn Văn Cường', phone: '0967890123', totalOrders: 0,  totalSpent: 0,         segment: 'Lost'        },
]

function CustomerCard({ item, s, colors }) {
  const seg = SEGMENT_CONFIG[item.segment] ?? DEFAULT_SEG
  return (
    <View style={s.card}>
      {/* Avatar initials */}
      <View style={s.avatar}>
        <Text style={s.avatarText}>
          {(item.name ?? 'K').split(' ').slice(-1)[0]?.charAt(0)?.toUpperCase() ?? 'K'}
        </Text>
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
    </View>
  )
}

// Màn hình yêu cầu nâng cấp Pro
function ProGateView({ s }) {
  return (
    <View style={s.proGate}>
      <Text style={s.proGateIcon}>👥</Text>
      <Text style={s.proGateTitle}>Quản lý khách hàng – Gói Pro</Text>
      <Text style={s.proGateDesc}>
        Xem danh sách khách hàng, phân tích phân khúc RFM (VIP, Loyal, Lost...) và lịch sử mua hàng
        chỉ khả dụng với gói <Text style={{ color: '#4ae176', fontWeight: '700' }}>Pro</Text>.
      </Text>
      <TouchableOpacity
        style={s.upgradeBtn}
        onPress={() => Alert.alert(
          'Nâng cấp Pro',
          'Truy cập web hoặc liên hệ quản trị viên để nâng cấp gói dịch vụ.',
          [{ text: 'Đã hiểu' }]
        )}
      >
        <Text style={s.upgradeBtnText}>Nâng cấp lên Pro</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function CustomersScreen() {
  const { isFree }    = usePlan()
  const canView       = usePermission('customers.view')
  const { colors }    = useTheme()
  const s             = useMemo(() => makeStyles(colors), [colors])

  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search,     setSearch]     = useState('')
  const [isMock,     setIsMock]     = useState(false)
  const searchTimeout = useRef(null)

  const fetchCustomers = useCallback(async (q = '') => {
    try {
      const res = await api.get('/api/customers', {
        params: { search: q || undefined, limit: 50, includeRfm: true },
      })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setData(list.map(c => ({
        id:          c.customerId  ?? c.id          ?? c.customer_id,
        name:        c.fullName    ?? c.name        ?? c.customerName ?? c.customer_name ?? 'Khách hàng',
        phone:       c.phone       ?? c.phoneNumber ?? c.phone_number ?? '',
        totalOrders: c.totalOrders ?? c.total_orders ?? 0,
        totalSpent:  c.totalSpent  ?? c.total_spent  ?? 0,
        segment:     c.segment     ?? c.rfmSegment   ?? '',
      })))
      setIsMock(false)
    } catch {
      let filtered = MOCK_CUSTOMERS
      if (q) filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.phone.includes(q)
      )
      setData(filtered)
      setIsMock(true)
    }
  }, [])

  useEffect(() => {
    if (isFree || !canView) { setLoading(false); return }
    fetchCustomers().finally(() => setLoading(false))
  }, [isFree, canView, fetchCustomers])

  useEffect(() => {
    if (isFree || !canView) return
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setLoading(true)
      fetchCustomers(search).finally(() => setLoading(false))
    }, 400)
    return () => clearTimeout(searchTimeout.current)
  }, [search, isFree, canView, fetchCustomers])

  const onRefresh = async () => {
    if (isFree || !canView) return
    setRefreshing(true)
    await fetchCustomers(search)
    setRefreshing(false)
  }

  if (isFree || !canView) return <ProGateView s={s} />

  // Thống kê phân khúc
  const segCounts = data.reduce((acc, c) => {
    acc[c.segment] = (acc[c.segment] ?? 0) + 1
    return acc
  }, {})

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

      {/* Tóm tắt phân khúc */}
      {!loading && data.length > 0 && (
        <View style={s.segSummaryRow}>
          {Object.entries(segCounts).slice(0, 4).map(([seg, count]) => {
            const cfg = SEGMENT_CONFIG[seg] ?? DEFAULT_SEG
            return (
              <View key={seg} style={[s.segSummaryChip, { backgroundColor: cfg.bg }]}>
                <Text style={[s.segSummaryText, { color: cfg.color }]}>
                  {cfg.icon} {seg} ({count})
                </Text>
              </View>
            )
          })}
        </View>
      )}

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
          keyExtractor={(item, i) => `customer_${item.id ?? 'x'}_${i}`}
          renderItem={({ item }) => <CustomerCard item={item} s={s} colors={colors} />}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyText}>Không tìm thấy khách hàng</Text>
            </View>
          }
        />
      )}
    </View>
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
  clearText:   { fontSize: 13, color: c.outline, padding: 4 },

  segSummaryRow:  { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 6, gap: 6 },
  segSummaryChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  segSummaryText: { fontSize: 11, fontWeight: '600' },

  mockBanner:     { marginHorizontal: 12, marginBottom: 4, backgroundColor: 'rgba(255,180,0,0.1)', borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)', borderRadius: radius.sm, padding: 8 },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  list: { padding: 12, paddingBottom: 24 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  avatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: c.surface },
  nameRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  name:       { fontSize: 14, fontWeight: '700', color: c.onSurface, flex: 1, marginRight: 8 },
  segBadge:   { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.full },
  segText:    { fontSize: 10, fontWeight: '700' },
  phone:      { fontSize: 12, color: c.outline, marginBottom: 6 },
  statsRow:   { flexDirection: 'row', gap: 16 },
  statItem:   { fontSize: 12, color: c.outline },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyText:  { fontSize: 15, color: c.outline },

  proGate:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.surface },
  proGateIcon:  { fontSize: 56, marginBottom: 20 },
  proGateTitle: { fontSize: 18, fontWeight: '700', color: c.onSurface, marginBottom: 12, textAlign: 'center' },
  proGateDesc:  { fontSize: 14, color: c.outline, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  upgradeBtn:   { backgroundColor: '#4ae176', borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 32 },
  upgradeBtnText: { color: '#0a1a0f', fontSize: 15, fontWeight: '700' },
})
