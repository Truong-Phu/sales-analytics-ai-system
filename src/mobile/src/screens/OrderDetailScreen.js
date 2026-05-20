import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native'
import api from '../api/axios'
import { usePermission } from '../hooks/usePermission'
import { colors, radius } from '../components/theme'

// ─── Format tiền rút gọn ─────────────────────────────────────────────────────
function formatMoney(value) {
  if (value == null || isNaN(value)) return '0'
  const n = Number(value)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

// ─── Cấu hình trạng thái ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:   { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B', label: 'Chờ xử lý',   emoji: '⏳' },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6', label: 'Đã xác nhận', emoji: '✅' },
  shipping:  { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED', label: 'Đang giao',   emoji: '🚚' },
  shipped:   { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED', label: 'Đang giao',   emoji: '🚚' },
  delivered: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', label: 'Hoàn thành',  emoji: '📦' },
  completed: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', label: 'Hoàn thành',  emoji: '📦' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', label: 'Đã hủy',      emoji: '❌' },
  returned:  { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', label: 'Hoàn đơn',    emoji: '↩️' },
}
const DEFAULT_STATUS = STATUS_CONFIG.pending

// Timeline theo thứ tự trạng thái đơn hàng
const STATUS_TIMELINE = ['pending', 'confirmed', 'shipping', 'delivered']

// ─── Màu badge kênh ───────────────────────────────────────────────────────────
const CHANNEL_COLORS = {
  shopee:    '#EE4D2D',
  tiktok:    '#2DD4BF',
  lazada:    '#0F3DD1',
  facebook:  '#1877F2',
  website:   '#6366F1',
  offline:   '#6B7280',
  zalo:      '#0068FF',
}
function channelColor(ch = '') {
  return CHANNEL_COLORS[ch.toLowerCase()] ?? colors.secondary
}

// ─── Mock data chi tiết đơn hàng ─────────────────────────────────────────────
const MOCK_ORDER_DETAIL = {
  orderId: 1,
  externalOrderId: 'SP-2026-0001',
  channel: 'Shopee',
  status: 'shipping',
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  customer: {
    name: 'Nguyễn Văn An',
    phone: '0901234567',
    address: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM',
  },
  items: [
    { name: 'Áo thun Unisex oversize (S)', quantity: 2, unitPrice: 189_000, totalPrice: 378_000 },
    { name: 'Quần jogger cotton (M)',       quantity: 1, unitPrice: 279_000, totalPrice: 279_000 },
  ],
  subtotal:      657_000,
  shippingFee:   25_000,
  discount:      50_000,
  totalAmount:   632_000,
  paymentMethod: 'MoMo',
  note:          'Giao buổi chiều, gọi trước 30 phút',
  trackingCode:  'GHN-2026-ABC123',
}

// Danh sách trạng thái cập nhật được
const UPDATABLE_STATUSES = [
  { key: 'pending',   label: 'Chờ xử lý'   },
  { key: 'confirmed', label: 'Xác nhận'     },
  { key: 'shipping',  label: 'Đang giao'    },
  { key: 'delivered', label: 'Đã giao xong' },
  { key: 'completed', label: 'Hoàn thành'   },
  { key: 'cancelled', label: 'Hủy đơn'      },
]

// ─── Timeline component ───────────────────────────────────────────────────────
function OrderTimeline({ currentStatus }) {
  const currentIdx = STATUS_TIMELINE.indexOf(currentStatus)
  return (
    <View style={s.timeline}>
      {STATUS_TIMELINE.map((st, idx) => {
        const cfg     = STATUS_CONFIG[st] ?? DEFAULT_STATUS
        const done    = idx <= currentIdx
        const isCur   = idx === currentIdx
        return (
          <View key={st} style={s.timelineItem}>
            {/* Đường kết nối */}
            {idx > 0 && (
              <View style={[
                s.timelineLine,
                { backgroundColor: done ? '#6366F1' : '#374151' },
              ]} />
            )}
            {/* Dot */}
            <View style={[
              s.timelineDot,
              {
                backgroundColor: done ? '#6366F1' : '#374151',
                borderColor:     isCur ? '#A5B4FC' : 'transparent',
                borderWidth:     isCur ? 2 : 0,
              },
            ]}>
              {done && <Text style={{ fontSize: 8, color: '#FFF' }}>✓</Text>}
            </View>
            {/* Label */}
            <Text style={[
              s.timelineLabel,
              { color: done ? '#F9FAFB' : '#6B7280', fontWeight: isCur ? '700' : '400' },
            ]}>
              {cfg.label}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Modal cập nhật trạng thái ───────────────────────────────────────────────
function UpdateStatusModal({ visible, currentStatus, onClose, onUpdate, loading }) {
  const [selected, setSelected] = useState(currentStatus)

  useEffect(() => { setSelected(currentStatus) }, [currentStatus])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
        activeOpacity={1}
      >
        <View style={s.modalSheet}>
          <Text style={s.modalTitle}>Cập nhật trạng thái đơn</Text>

          {UPDATABLE_STATUSES.map(st => {
            const cfg    = STATUS_CONFIG[st.key] ?? DEFAULT_STATUS
            const active = selected === st.key
            return (
              <TouchableOpacity
                key={st.key}
                onPress={() => setSelected(st.key)}
                style={[
                  s.statusOption,
                  active && { backgroundColor: cfg.bg, borderColor: cfg.border },
                ]}
              >
                <View style={[s.radio, active && { borderColor: cfg.border }]}>
                  {active && <View style={[s.radioDot, { backgroundColor: cfg.border }]} />}
                </View>
                <Text style={[s.statusOptionText, active && { color: cfg.text, fontWeight: '700' }]}>
                  {cfg.emoji}  {cfg.label}
                </Text>
              </TouchableOpacity>
            )
          })}

          <TouchableOpacity
            style={[s.updateBtn, loading && { opacity: 0.6 }]}
            onPress={() => onUpdate(selected)}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.updateBtnText}>Xác nhận cập nhật</Text>
            }
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrderDetailScreen({ route, navigation }) {
  // orderId có thể truyền qua params hoặc lấy từ item đầy đủ
  const { orderId, orderData } = route?.params ?? {}

  const canUpdate = usePermission('orders.add') // Staff/Owner/Manager

  const [order,      setOrder]      = useState(orderData ?? null)
  const [loading,    setLoading]    = useState(!orderData)
  const [refreshing, setRefreshing] = useState(false)
  const [isMock,     setIsMock]     = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [updating,   setUpdating]   = useState(false)

  // Lấy chi tiết đơn hàng từ API
  const fetchDetail = useCallback(async () => {
    const id = orderId ?? order?.orderId ?? order?.id
    if (!id) {
      setOrder(MOCK_ORDER_DETAIL)
      setIsMock(true)
      return
    }
    try {
      const res = await api.get(`/api/orders/${id}`)
      const raw = res.data?.data ?? res.data
      setOrder(normalizeOrder(raw))
      setIsMock(false)
    } catch {
      // Nếu đã có orderData thô → giữ nguyên, chỉ normalize
      if (orderData) {
        setOrder(normalizeOrder(orderData))
      } else {
        setOrder(MOCK_ORDER_DETAIL)
        setIsMock(true)
      }
    }
  }, [orderId, orderData])

  useEffect(() => {
    if (!orderData) {
      fetchDetail().finally(() => setLoading(false))
    } else {
      setOrder(normalizeOrder(orderData))
      setLoading(false)
    }
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchDetail()
    setRefreshing(false)
  }

  // Cập nhật trạng thái đơn hàng
  const handleUpdateStatus = async (newStatus) => {
    const id = order?.orderId ?? order?.id
    if (!id) return
    setUpdating(true)
    try {
      await api.put(`/api/orders/${id}/status`, { status: newStatus })
      setOrder(prev => ({ ...prev, status: newStatus }))
      setShowUpdate(false)
      Alert.alert('Thành công', 'Đã cập nhật trạng thái đơn hàng.')
    } catch (err) {
      Alert.alert('Lỗi', err.response?.data?.message ?? 'Không thể cập nhật. Thử lại sau.')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!order) {
    return (
      <View style={s.center}>
        <Text style={{ color: colors.outline }}>Không tìm thấy đơn hàng.</Text>
      </View>
    )
  }

  const statusKey = (order.status ?? 'pending').toLowerCase()
  const cfg       = STATUS_CONFIG[statusKey] ?? DEFAULT_STATUS
  const chColor   = channelColor(order.channel ?? order.channelName ?? '')
  const channel   = order.channel ?? order.channelName ?? order.channel_name ?? ''

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Banner mock ─────────────────────────────────────────────────── */}
      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>⚠ Đang dùng dữ liệu mẫu</Text>
        </View>
      )}

      {/* ── Header: Mã đơn + badge kênh + trạng thái ─────────────────── */}
      <View style={s.headerCard}>
        <View style={s.headerTop}>
          <Text style={s.orderCode} numberOfLines={1}>
            {order.externalOrderId ?? order.external_order_id ?? `#${order.orderId ?? order.id ?? '?'}`}
          </Text>
          {channel ? (
            <View style={[s.channelBadge, { backgroundColor: chColor + '22' }]}>
              <Text style={[s.channelBadgeText, { color: chColor }]}>{channel}</Text>
            </View>
          ) : null}
        </View>
        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusBadgeText, { color: cfg.text }]}>{cfg.emoji}  {cfg.label}</Text>
        </View>
        {order.trackingCode && (
          <Text style={s.trackingText}>Mã vận đơn: {order.trackingCode}</Text>
        )}
        <Text style={s.dateText}>
          {order.createdAt
            ? new Date(order.createdAt).toLocaleString('vi-VN', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })
            : ''}
        </Text>
      </View>

      {/* ── Timeline trạng thái ──────────────────────────────────────── */}
      {!['cancelled', 'returned'].includes(statusKey) && (
        <View style={s.darkCard}>
          <Text style={s.cardLabel}>TIẾN ĐỘ ĐƠN HÀNG</Text>
          <OrderTimeline currentStatus={statusKey} />
        </View>
      )}

      {/* ── Thông tin khách hàng ─────────────────────────────────────── */}
      <View style={s.darkCard}>
        <Text style={s.cardLabel}>THÔNG TIN KHÁCH HÀNG</Text>
        <InfoRow icon="👤" label="Họ tên"   value={order.customer?.name    ?? order.customerName    ?? order.customer_name    ?? '—'} />
        <InfoRow icon="📞" label="SĐT"      value={order.customer?.phone   ?? order.customerPhone   ?? order.customer_phone   ?? '—'} />
        <InfoRow icon="📍" label="Địa chỉ"  value={order.customer?.address ?? order.shippingAddress ?? order.shipping_address ?? '—'} />
      </View>

      {/* ── Danh sách sản phẩm ──────────────────────────────────────── */}
      <View style={s.darkCard}>
        <Text style={s.cardLabel}>SẢN PHẨM</Text>
        {(order.items ?? order.orderItems ?? order.order_items ?? []).map((item, idx) => (
          <View key={idx} style={[s.itemRow, idx > 0 && s.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName} numberOfLines={2}>
                {item.name ?? item.productName ?? item.product_name ?? 'Sản phẩm'}
              </Text>
              <Text style={s.itemQty}>
                x{item.quantity ?? 1}  ×  ₫{formatMoney(item.unitPrice ?? item.unit_price ?? 0)}
              </Text>
            </View>
            <Text style={s.itemTotal}>
              ₫{formatMoney(item.totalPrice ?? item.total_price ?? (item.quantity ?? 1) * (item.unitPrice ?? item.unit_price ?? 0))}
            </Text>
          </View>
        ))}
        {/* Tổng kết tiền */}
        <View style={s.summaryBox}>
          <SummaryRow label="Tạm tính"    value={`₫${formatMoney(order.subtotal ?? order.sub_total ?? 0)}`} />
          <SummaryRow label="Phí ship"     value={`₫${formatMoney(order.shippingFee ?? order.shipping_fee ?? 0)}`} />
          {(order.discount ?? 0) > 0 && (
            <SummaryRow label="Giảm giá" value={`-₫${formatMoney(order.discount)}`} color="#4AE176" />
          )}
          <View style={s.totalLine} />
          <SummaryRow
            label="Thực thu"
            value={`₫${formatMoney(order.totalAmount ?? order.total_amount ?? order.grandTotal ?? 0)}`}
            bold
            color={colors.primary}
          />
          <SummaryRow label="Thanh toán" value={order.paymentMethod ?? order.payment_method ?? '—'} />
        </View>
      </View>

      {/* ── Ghi chú ─────────────────────────────────────────────────── */}
      {(order.note || order.notes) && (
        <View style={s.darkCard}>
          <Text style={s.cardLabel}>GHI CHÚ</Text>
          <Text style={s.noteText}>{order.note ?? order.notes}</Text>
        </View>
      )}

      {/* ── Nút cập nhật trạng thái ─────────────────────────────────── */}
      {canUpdate && !['cancelled', 'returned', 'completed'].includes(statusKey) && (
        <TouchableOpacity
          style={s.updateStatusBtn}
          onPress={() => setShowUpdate(true)}
          activeOpacity={0.85}
        >
          <Text style={s.updateStatusBtnText}>🔄  Cập nhật trạng thái</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />

      {/* Modal cập nhật */}
      <UpdateStatusModal
        visible={showUpdate}
        currentStatus={statusKey}
        onClose={() => setShowUpdate(false)}
        onUpdate={handleUpdateStatus}
        loading={updating}
      />
    </ScrollView>
  )
}

// ─── Helper components ────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoLabel}>{label}:</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function SummaryRow({ label, value, bold, color }) {
  return (
    <View style={s.summaryRow}>
      <Text style={[s.summaryLabel, bold && { fontWeight: '700', color: '#F9FAFB' }]}>{label}</Text>
      <Text style={[s.summaryValue, bold && { fontWeight: '700' }, color && { color }]}>{value}</Text>
    </View>
  )
}

// Chuẩn hóa nhiều format backend
function normalizeOrder(raw) {
  if (!raw) return null
  return {
    orderId:        raw.orderId        ?? raw.id,
    externalOrderId:raw.externalOrderId ?? raw.external_order_id ?? raw.orderCode ?? raw.code,
    channel:        raw.channelName    ?? raw.channel_name    ?? raw.channel,
    status:         raw.status         ?? raw.orderStatus     ?? 'pending',
    createdAt:      raw.orderDate      ?? raw.order_date      ?? raw.createdAt    ?? raw.created_at,
    trackingCode:   raw.trackingCode   ?? raw.tracking_code   ?? raw.trackingNumber,
    customer: {
      name:    raw.customer?.name    ?? raw.customerName    ?? raw.customer_name,
      phone:   raw.customer?.phone   ?? raw.customerPhone   ?? raw.customer_phone ?? raw.phoneNumber,
      address: raw.customer?.address ?? raw.shippingAddress ?? raw.shipping_address ?? raw.address,
    },
    items:          raw.items          ?? raw.orderItems     ?? raw.order_items   ?? [],
    subtotal:       raw.subtotal       ?? raw.sub_total      ?? 0,
    shippingFee:    raw.shippingFee    ?? raw.shipping_fee   ?? 0,
    discount:       raw.discount       ?? raw.discountAmount  ?? 0,
    totalAmount:    raw.totalAmount    ?? raw.total_amount   ?? raw.grandTotal    ?? 0,
    paymentMethod:  raw.paymentMethod  ?? raw.payment_method ?? '',
    note:           raw.note           ?? raw.notes          ?? '',
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  // Mock banner
  mockBanner: {
    marginHorizontal: 12, marginTop: 8,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  // Header card
  headerCard: {
    backgroundColor: colors.surfaceContainerLow,
    margin: 12, borderRadius: radius.md, padding: 16,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderCode: { fontSize: 15, fontWeight: '700', color: colors.onSurface, flex: 1, marginRight: 8 },
  channelBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  channelBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge:      { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, marginBottom: 8 },
  statusBadgeText:  { fontSize: 13, fontWeight: '700' },
  trackingText: { fontSize: 12, color: colors.outline, marginBottom: 4 },
  dateText:     { fontSize: 12, color: colors.outline },

  // Dark cards
  darkCard: {
    backgroundColor: '#1F2937',
    borderRadius: radius.md, padding: 16,
    marginHorizontal: 12, marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },

  // Timeline
  timeline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  timelineItem: { flex: 1, alignItems: 'center', position: 'relative' },
  timelineLine: {
    position: 'absolute', top: 10, left: '-50%', right: '50%',
    height: 2,
  },
  timelineDot: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  timelineLabel: { fontSize: 10, textAlign: 'center', paddingHorizontal: 2 },

  // Info rows
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  infoIcon:  { fontSize: 15, marginRight: 8, width: 22 },
  infoLabel: { fontSize: 13, color: '#9CA3AF', width: 65 },
  infoValue: { fontSize: 13, color: '#F9FAFB', flex: 1 },

  // Items
  itemRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  itemBorder: { borderTopWidth: 1, borderTopColor: '#374151' },
  itemName:   { fontSize: 13, color: '#F9FAFB', fontWeight: '600', marginBottom: 3 },
  itemQty:    { fontSize: 12, color: '#9CA3AF' },
  itemTotal:  { fontSize: 14, fontWeight: '700', color: colors.primary, marginLeft: 10 },

  // Summary
  summaryBox: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#374151',
  },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 13, color: '#9CA3AF' },
  summaryValue: { fontSize: 13, color: '#F9FAFB' },
  totalLine:    { height: 1, backgroundColor: '#374151', marginVertical: 8 },

  // Note
  noteText: { fontSize: 13, color: '#D1D5DB', lineHeight: 20 },

  // Update status button
  updateStatusBtn: {
    backgroundColor: '#6366F1',
    marginHorizontal: 12, marginBottom: 8,
    borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  updateStatusBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Modal sheet
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#111827',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
  },
  modalTitle: { color: '#F9FAFB', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  statusOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: radius.sm, marginBottom: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#374151',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { fontSize: 14, color: '#F9FAFB' },
  updateBtn: {
    backgroundColor: '#6366F1', borderRadius: radius.md,
    padding: 14, alignItems: 'center', marginTop: 16,
  },
  updateBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
})
