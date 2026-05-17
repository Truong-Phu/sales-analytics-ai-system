import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity,
  Alert,
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

// ─── Icon và style theo phân loại ────────────────────────────────────────────
// category: 'low_stock' | 'revenue_anomaly' | 'system' | 'order' | 'payment'
const CATEGORY_CONFIG = {
  low_stock:       { emoji: '🏭', color: '#ffb400', bg: 'rgba(255,180,0,0.10)',   border: 'rgba(255,180,0,0.25)'   },
  revenue_anomaly: { emoji: '📉', color: '#ffb4ab', bg: 'rgba(255,180,171,0.10)', border: 'rgba(255,180,171,0.25)' },
  system:          { emoji: '⚙️', color: '#adc6ff', bg: 'rgba(173,198,255,0.10)', border: 'rgba(173,198,255,0.25)' },
  order:           { emoji: '🛒', color: '#4ae176', bg: 'rgba(74,225,118,0.10)',   border: 'rgba(74,225,118,0.25)'  },
  payment:         { emoji: '💳', color: '#c4c0ff', bg: 'rgba(196,192,255,0.10)', border: 'rgba(196,192,255,0.25)' },
  // Mức nghiêm trọng từ anomaly endpoint cũ
  high:   { emoji: '🔴', color: '#ffb4ab', bg: 'rgba(255,180,171,0.10)', border: 'rgba(255,180,171,0.25)' },
  medium: { emoji: '🟡', color: '#ffb400', bg: 'rgba(255,180,0,0.10)',   border: 'rgba(255,180,0,0.25)'   },
  low:    { emoji: '🔵', color: '#adc6ff', bg: 'rgba(173,198,255,0.10)', border: 'rgba(173,198,255,0.25)' },
}

const DEFAULT_CFG = { emoji: '🔔', color: colors.secondary, bg: 'rgba(173,198,255,0.08)', border: 'rgba(173,198,255,0.2)' }

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
]

// ─── Item component ───────────────────────────────────────────────────────────
function AlertItem({ item, onMarkRead }) {
  const cfg = CATEGORY_CONFIG[item.category ?? item.severity] ?? DEFAULT_CFG
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        if (!item.isRead) onMarkRead(item.id)
      }}
      style={[
        s.card,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          opacity: item.isRead ? 0.65 : 1,
        },
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
  const [alerts,     setAlerts]     = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isMock,     setIsMock]     = useState(false)

  // Gọi GET /api/notifications?category=alert — fallback mock
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications', {
        params: { category: 'alert', limit: 50 },
      })
      const raw = res.data?.data ?? res.data
      const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
      setAlerts(items)
      setIsMock(false)
    } catch {
      // Thử endpoint anomaly cũ (AI anomaly detection)
      try {
        const res2 = await api.get('/api/ai/anomaly', { params: { days: 30 } })
        const anomalies = res2.data?.anomalies ?? res2.data?.data?.anomalies ?? []
        // Map sang format mới
        const mapped = anomalies.map((a, i) => ({
          id: i,
          category: a.severity,
          isRead: false,
          title: a.severity === 'high'   ? 'Bất thường nghiêm trọng'
               : a.severity === 'medium' ? 'Bất thường trung bình'
               :                           'Biến động nhỏ',
          message: `${a.channel ?? 'Kênh không xác định'} — ₫${(a.value / 1_000_000).toFixed(2)}M (z-score=${a.zScore?.toFixed(2)}σ)`,
          createdAt: a.date ? new Date(a.date).toISOString() : new Date().toISOString(),
        }))
        setAlerts(mapped)
        setIsMock(false)
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

  // Đánh dấu đã đọc — PATCH /api/notifications/{id}/read
  const handleMarkRead = async (id) => {
    // Cập nhật local ngay (optimistic)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a))
    try {
      await api.patch(`/api/notifications/${id}/read`)
    } catch {
      // Nếu lỗi, rollback (không throw — im lặng)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: false } : a))
    }
  }

  const unreadCount = alerts.filter(a => !a.isRead).length
  const highCount   = alerts.filter(a => a.category === 'high'   || a.category === 'revenue_anomaly').length
  const mediumCount = alerts.filter(a => a.category === 'medium' || a.category === 'low_stock').length

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
          <Text style={s.summaryNum}>{alerts.length}</Text>
          <Text style={s.summaryLabel}>Tổng cảnh báo</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: colors.error }]}>{unreadCount}</Text>
          <Text style={s.summaryLabel}>Chưa đọc</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: '#ffb400' }]}>{highCount + mediumCount}</Text>
          <Text style={s.summaryLabel}>Cần xử lý</Text>
        </View>
      </View>

      {/* Banner mock */}
      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {/* FlatList cảnh báo */}
      <FlatList
        data={alerts}
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
            <Text style={s.emptyTitle}>Không có cảnh báo nào</Text>
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
  summaryRow: { flexDirection: 'row', padding: 12, paddingBottom: 6, gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  summaryNum:   { fontSize: 22, fontWeight: '700', color: colors.onSurface },
  summaryLabel: { fontSize: 10, color: colors.outline, marginTop: 3, textAlign: 'center' },

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
    backgroundColor: colors.error, marginLeft: 6, flexShrink: 0,
  },
  cardMessage: { fontSize: 13, color: colors.onSurface, lineHeight: 18, marginBottom: 6 },
  cardTime:    { fontSize: 11, color: colors.outline },

  // Empty state
  empty:        { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyIcon:    { fontSize: 52, marginBottom: 14 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 6 },
  emptySubText: { fontSize: 13, color: colors.outline },
})
