import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

// ─── Hàm hiển thị thời gian tương đối ────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'Vừa xong'
  if (mins < 60)  return `${mins} phút trước`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs} giờ trước`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days} ngày trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

// ─── Cấu hình icon và style theo category ────────────────────────────────────
const CATEGORY_CONFIG = {
  // AI Cảnh báo
  low_stock:       { emoji: '🏭', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.25)',   tab: 'ai'     },
  revenue_anomaly: { emoji: '📉', color: '#EF4444', bg: 'rgba(239,68,68,0.10)',    border: 'rgba(239,68,68,0.25)',    tab: 'ai'     },
  churn:           { emoji: '⚠️', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.25)',   tab: 'ai'     },
  at_risk:         { emoji: '🟡', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.25)',   tab: 'ai'     },
  // Mức độ anomaly (từ endpoint AI cũ)
  high:            { emoji: '🔴', color: '#EF4444', bg: 'rgba(239,68,68,0.10)',    border: 'rgba(239,68,68,0.25)',    tab: 'ai'     },
  medium:          { emoji: '🟡', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',   border: 'rgba(245,158,11,0.25)',   tab: 'ai'     },
  low:             { emoji: '🔵', color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',   border: 'rgba(96,165,250,0.25)',   tab: 'ai'     },
  // Hệ thống
  system:          { emoji: '⚙️', color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',   border: 'rgba(96,165,250,0.25)',   tab: 'system' },
  etl:             { emoji: '🔄', color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',   border: 'rgba(96,165,250,0.25)',   tab: 'system' },
  success:         { emoji: '✅', color: '#4AE176', bg: 'rgba(74,225,118,0.10)',   border: 'rgba(74,225,118,0.25)',   tab: 'system' },
  // Đơn hàng
  order:           { emoji: '🛒', color: '#4AE176', bg: 'rgba(74,225,118,0.10)',   border: 'rgba(74,225,118,0.25)',   tab: 'order'  },
  payment:         { emoji: '💳', color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.25)', tab: 'order'  },
  shipping:        { emoji: '🚚', color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',   border: 'rgba(96,165,250,0.25)',   tab: 'order'  },
}
const DEFAULT_CFG = { emoji: '🔔', color: colors.secondary, bg: 'rgba(173,198,255,0.08)', border: 'rgba(173,198,255,0.2)', tab: 'system' }

// ─── Tab lọc ─────────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',    label: 'Tất cả'      },
  { key: 'ai',     label: 'AI Cảnh báo' },
  { key: 'system', label: 'Hệ thống'    },
  { key: 'order',  label: 'Đơn hàng'    },
]

// ─── Mock data fallback ───────────────────────────────────────────────────────
const MOCK_ALERTS = [
  {
    id: 1, category: 'low_stock', isRead: false,
    title: 'Tồn kho thấp',
    message: 'Sản phẩm "Áo thun oversize" còn 5 cái, dưới mức tối thiểu (10).',
    createdAt: new Date(Date.now() - 15 * 60_000).toISOString(),
  },
  {
    id: 2, category: 'revenue_anomaly', isRead: false,
    title: 'Doanh thu bất thường',
    message: 'Doanh thu kênh TikTok hôm nay giảm 45% so với trung bình 7 ngày (z-score = -2.8σ).',
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  },
  {
    id: 3, category: 'system', isRead: true,
    title: 'Đồng bộ dữ liệu hoàn tất',
    message: 'ETL pipeline đã xử lý thành công 1.247 bản ghi từ Shopee lúc 08:00.',
    createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
  },
  {
    id: 4, category: 'order', isRead: true,
    title: 'Đơn hàng mới',
    message: '15 đơn hàng mới từ kênh Lazada đang chờ xử lý.',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  },
  {
    id: 5, category: 'payment', isRead: false,
    title: 'Thanh toán thất bại',
    message: 'Đơn SP-2026-0034: thanh toán MoMo thất bại. Vui lòng kiểm tra lại.',
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  },
  {
    id: 6, category: 'churn', isRead: false,
    title: 'Khách hàng có nguy cơ rời bỏ',
    message: '12 khách hàng phân khúc "At Risk" chưa mua hàng trong 45 ngày.',
    createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
]

// ─── Item component ───────────────────────────────────────────────────────────
function AlertItem({ item, onMarkRead }) {
  const cfg = CATEGORY_CONFIG[item.category ?? item.severity] ?? DEFAULT_CFG
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => { if (!item.isRead) onMarkRead(item.id) }}
      style={[
        s.card,
        { backgroundColor: cfg.bg, borderColor: cfg.border, opacity: item.isRead ? 0.65 : 1 },
      ]}
    >
      <View style={s.cardHeader}>
        {/* Icon phân loại */}
        <Text style={s.cardEmoji}>{cfg.emoji}</Text>

        <View style={s.cardBody}>
          <View style={s.titleRow}>
            <Text style={[s.cardTitle, { color: cfg.color }]} numberOfLines={1}>
              {item.title}
            </Text>
            {/* Chấm đỏ = chưa đọc */}
            {!item.isRead && <View style={s.unreadDot} />}
          </View>
          <Text style={s.cardMessage} numberOfLines={3}>{item.message}</Text>
          <Text style={s.cardTime}>{relativeTime(item.createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const [alerts,      setAlerts]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [isMock,      setIsMock]      = useState(false)
  const [activeTab,   setActiveTab]   = useState('all')
  const [markingAll,  setMarkingAll]  = useState(false)

  // Gọi GET /api/notifications — fallback AI anomaly → mock
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications', {
        params: { limit: 100 },
      })
      const raw   = res.data?.data ?? res.data
      const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setAlerts(items)
      setIsMock(false)
    } catch {
      // Fallback: thử endpoint anomaly AI cũ
      try {
        const res2 = await api.get('/api/ai/anomaly', { params: { days: 30 } })
        const anomalies = res2.data?.anomalies ?? res2.data?.data?.anomalies ?? []
        const mapped = anomalies.map((a, i) => ({
          id: i,
          category: a.severity ?? 'low',
          isRead: false,
          title:
            a.severity === 'high'   ? 'Bất thường nghiêm trọng'
          : a.severity === 'medium' ? 'Bất thường trung bình'
          :                           'Biến động nhỏ',
          message: `${a.channel ?? 'Kênh không xác định'} — ₫${Number.isFinite(a.value) ? (a.value / 1_000_000).toFixed(2) : '—'}M (z-score=${a.zScore?.toFixed(2) ?? '—'}σ)`,
          createdAt: a.date ? new Date(a.date).toISOString() : new Date().toISOString(),
        }))
        setAlerts(mapped.length ? mapped : MOCK_ALERTS)
        setIsMock(!mapped.length)
      } catch {
        setAlerts(MOCK_ALERTS)
        setIsMock(true)
      }
    }
  }, [])

  useEffect(() => {
    fetchAlerts().finally(() => setLoading(false))
  }, [fetchAlerts])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchAlerts()
    setRefreshing(false)
  }

  // Đánh dấu đã đọc 1 item — PATCH /api/notifications/{id}/read
  const handleMarkRead = async (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a))
    try {
      await api.patch(`/api/notifications/${id}/read`)
    } catch {
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: false } : a))
    }
  }

  // Đánh dấu tất cả đã đọc — POST /api/notifications/read-all
  const handleMarkAllRead = async () => {
    if (markingAll) return
    const unread = alerts.filter(a => !a.isRead)
    if (unread.length === 0) { Alert.alert('', 'Tất cả đã được đọc.'); return }
    setMarkingAll(true)
    // Optimistic update
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true })))
    try {
      await api.post('/api/notifications/read-all')
    } catch {
      // Rollback nếu lỗi
      setAlerts(prev => prev.map((a, i) => ({ ...a, isRead: !unread.find(u => u.id === a.id) })))
      Alert.alert('Lỗi', 'Không thể đánh dấu. Thử lại sau.')
    } finally {
      setMarkingAll(false)
    }
  }

  // Xóa thông báo — DELETE /api/notifications/{id}
  const handleDelete = async (id) => {
    Alert.alert(
      'Xóa thông báo',
      'Bạn có chắc muốn xóa thông báo này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa', style: 'destructive',
          onPress: async () => {
            setAlerts(prev => prev.filter(a => a.id !== id))
            try {
              await api.delete(`/api/notifications/${id}`)
            } catch {
              // Nếu lỗi, reload lại
              fetchAlerts()
            }
          },
        },
      ]
    )
  }

  // Lọc theo tab
  const filtered = activeTab === 'all'
    ? alerts
    : alerts.filter(a => {
        const cfg = CATEGORY_CONFIG[a.category ?? a.severity] ?? DEFAULT_CFG
        return cfg.tab === activeTab
      })

  const unreadCount = alerts.filter(a => !a.isRead).length

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* ── Tóm tắt thống kê ────────────────────────────────────────────── */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>{alerts.length}</Text>
          <Text style={s.summaryLabel}>Tổng thông báo</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: '#EF4444' }]}>{unreadCount}</Text>
          <Text style={s.summaryLabel}>Chưa đọc</Text>
        </View>
        <TouchableOpacity
          style={[s.summaryCard, s.markAllCard]}
          onPress={handleMarkAllRead}
          disabled={markingAll || unreadCount === 0}
        >
          {markingAll
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={s.summaryNum}>✓</Text>
          }
          <Text style={s.summaryLabel}>Đọc tất cả</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab lọc ─────────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
      >
        {FILTER_TABS.map(tab => {
          const active  = activeTab === tab.key
          const tabCount = tab.key === 'all'
            ? alerts.filter(a => !a.isRead).length
            : alerts.filter(a => {
                const cfg = CATEGORY_CONFIG[a.category ?? a.severity] ?? DEFAULT_CFG
                return cfg.tab === tab.key && !a.isRead
              }).length
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[s.filterTab, active && s.filterTabActive]}
            >
              <Text style={[s.filterTabText, active && s.filterTabTextActive]}>
                {tab.label}
                {tabCount > 0 ? `  ${tabCount}` : ''}
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

      {/* ── Danh sách thông báo ──────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `alert-${item.id ?? i}`}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <AlertItem item={item} onMarkRead={handleMarkRead} />
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>✅</Text>
            <Text style={s.emptyTitle}>
              {activeTab === 'all' ? 'Không có thông báo nào' : 'Không có thông báo trong mục này'}
            </Text>
            <Text style={s.emptySubText}>Hệ thống đang hoạt động bình thường</Text>
          </View>
        }
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  // Summary bar
  summaryRow: { flexDirection: 'row', padding: 12, paddingBottom: 0, gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  markAllCard: { borderColor: colors.primary + '55' },
  summaryNum:   { fontSize: 20, fontWeight: '700', color: colors.onSurface },
  summaryLabel: { fontSize: 10, color: colors.outline, marginTop: 3, textAlign: 'center' },

  // Filter tabs
  filterTab: {
    height: 34, paddingHorizontal: 14,
    borderRadius: 17, justifyContent: 'center', alignItems: 'center',
    marginRight: 8,
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  filterTabActive:     { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterTabText:       { fontSize: 12, fontWeight: '500', color: '#9CA3AF' },
  filterTabTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // Mock banner
  mockBanner: {
    marginHorizontal: 12, marginBottom: 4,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  // List
  list: { padding: 12, paddingTop: 6, paddingBottom: 24 },

  // Alert card
  card: {
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardEmoji:  { fontSize: 24, marginRight: 12, marginTop: 1 },
  cardBody:   { flex: 1 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  cardTitle:  { fontSize: 14, fontWeight: '700', flex: 1 },
  unreadDot:  {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#EF4444', marginLeft: 6, flexShrink: 0,
  },
  cardMessage: { fontSize: 13, color: colors.onSurface, lineHeight: 18, marginBottom: 6 },
  cardTime:    { fontSize: 11, color: colors.outline },

  // Empty state
  empty:        { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyIcon:    { fontSize: 52, marginBottom: 14 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 6 },
  emptySubText: { fontSize: 13, color: colors.outline },
})
