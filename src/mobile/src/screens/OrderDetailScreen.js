import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import api from '../api/axios'
import { usePermission } from '../hooks/usePermission'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

function formatMoney(value) {
  if (value == null || isNaN(value)) return '0'
  const n = Number(value)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

const STATUS_CONFIG = {
  pending:   { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B', emoji: '⏳' },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6', emoji: '✅' },
  shipping:  { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED', emoji: '🚚' },
  shipped:   { bg: '#EDE9FE', text: '#5B21B6', border: '#7C3AED', emoji: '🚚' },
  delivered: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', emoji: '📦' },
  completed: { bg: '#D1FAE5', text: '#065F46', border: '#10B981', emoji: '📦' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', emoji: '❌' },
  returned:  { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', emoji: '↩️' },
}
const DEFAULT_STATUS = STATUS_CONFIG.pending

const STATUS_TIMELINE = ['pending', 'confirmed', 'shipping', 'delivered']

const CHANNEL_COLORS = {
  shopee:   '#EE4D2D', tiktok: '#2DD4BF', lazada: '#0F3DD1',
  facebook: '#1877F2', website: '#6366F1', offline: '#6B7280', zalo: '#0068FF',
}
function channelColor(ch = '', fallback = '#6366F1') {
  return CHANNEL_COLORS[ch.toLowerCase()] ?? fallback
}

const MOCK_ORDER_DETAIL = {
  orderId: 1,
  externalOrderId: 'SP-2026-0001',
  channel: 'Shopee',
  status: 'shipping',
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  customer: { name: 'Nguyễn Văn An', phone: '0901234567', address: '123 Nguyễn Huệ, Q1, TP.HCM' },
  items: [
    { name: 'Áo thun Unisex oversize (S)', quantity: 2, unitPrice: 189_000, totalPrice: 378_000 },
    { name: 'Quần jogger cotton (M)',       quantity: 1, unitPrice: 279_000, totalPrice: 279_000 },
  ],
  subtotal: 657_000, shippingFee: 25_000, discount: 50_000, totalAmount: 632_000,
  paymentMethod: 'MoMo',
  note: 'Giao buổi chiều, gọi trước 30 phút',
  trackingCode: 'GHN-2026-ABC123',
}

const UPDATABLE_STATUSES = [
  { key: 'pending',   labelKey: 'status.pending'   },
  { key: 'confirmed', labelKey: 'status.confirmed' },
  { key: 'shipping',  labelKey: 'status.shipping'  },
  { key: 'delivered', labelKey: 'status.delivered' },
  { key: 'completed', labelKey: 'status.completed' },
  { key: 'cancelled', labelKey: 'status.cancelled' },
]

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },

  mockBanner: {
    marginHorizontal: 12, marginTop: 8,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  headerCard: {
    backgroundColor: c.surfaceContainerLow,
    margin: 12, borderRadius: radius.md, padding: 16,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  headerTop:        { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderCode:        { fontSize: 15, fontWeight: '700', color: c.onSurface, flex: 1, marginRight: 8 },
  channelBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  channelBadgeText: { fontSize: 11, fontWeight: '700' },
  statusBadge:      { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, marginBottom: 8 },
  statusBadgeText:  { fontSize: 13, fontWeight: '700' },
  trackingText:     { fontSize: 12, color: c.outline, marginBottom: 4 },
  dateText:         { fontSize: 12, color: c.outline },

  sectionCard: {
    backgroundColor: c.surfaceContainerLow,
    borderRadius: radius.md, padding: 16,
    marginHorizontal: 12, marginBottom: 12,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: c.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },

  // Timeline
  timeline:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  timelineItem:  { flex: 1, alignItems: 'center', position: 'relative' },
  timelineLine:  { position: 'absolute', top: 10, left: '-50%', right: '50%', height: 2 },
  timelineDot:   { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  timelineLabel: { fontSize: 10, textAlign: 'center', paddingHorizontal: 2 },

  // Info rows
  infoRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  infoIcon:  { fontSize: 15, marginRight: 8, width: 22 },
  infoLabel: { fontSize: 13, color: c.outline, width: 65 },
  infoValue: { fontSize: 13, color: c.onSurface, flex: 1 },

  // Items
  itemRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  itemBorder: { borderTopWidth: 1, borderTopColor: c.outlineVariant },
  itemName:   { fontSize: 13, color: c.onSurface, fontWeight: '600', marginBottom: 3 },
  itemQty:    { fontSize: 12, color: c.outline },
  itemTotal:  { fontSize: 14, fontWeight: '700', marginLeft: 10 },

  // Summary
  summaryBox:   { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.outlineVariant },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 13, color: c.outline },
  summaryValue: { fontSize: 13, color: c.onSurface },
  totalLine:    { height: 1, backgroundColor: c.outlineVariant, marginVertical: 8 },

  noteText: { fontSize: 13, color: c.onSurface, lineHeight: 20 },

  updateStatusBtn: {
    backgroundColor: c.interactive,
    marginHorizontal: 12, marginBottom: 8,
    borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  updateStatusBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Payment
  payBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.full, marginBottom: 10,
  },
  payBadgeText: { fontSize: 12, fontWeight: '700' },
  payBtn: {
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14,
    alignItems: 'center', marginTop: 4,
  },
  payBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Payment method picker modal
  methodOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: radius.sm, marginBottom: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  methodIcon:  { fontSize: 20, marginRight: 10 },
  methodLabel: { fontSize: 14, color: c.onSurface, flex: 1 },

  // Modal
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: c.surfaceContainerLow,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: c.outlineVariant,
  },
  modalTitle: { color: c.onSurface, fontSize: 16, fontWeight: '700', marginBottom: 16 },
  statusOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: radius.sm, marginBottom: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: c.outlineVariant,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  radioDot:         { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { fontSize: 14, color: c.onSurface },
  updateBtn: {
    backgroundColor: c.interactive, borderRadius: radius.md,
    padding: 14, alignItems: 'center', marginTop: 16,
  },
  updateBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
})

// ─── Timeline component ───────────────────────────────────────────────────────
function OrderTimeline({ currentStatus, colors, s, t }) {
  const currentIdx = STATUS_TIMELINE.indexOf(currentStatus)
  return (
    <View style={s.timeline}>
      {STATUS_TIMELINE.map((st, idx) => {
        const done  = idx <= currentIdx
        const isCur = idx === currentIdx
        return (
          <View key={st} style={s.timelineItem}>
            {idx > 0 && (
              <View style={[s.timelineLine, { backgroundColor: done ? colors.interactive : colors.outlineVariant }]} />
            )}
            <View style={[
              s.timelineDot,
              {
                backgroundColor: done ? colors.interactive : colors.surfaceContainerHigh,
                borderColor: isCur ? colors.primary : 'transparent',
                borderWidth: isCur ? 2 : 0,
              },
            ]}>
              {done && <Text style={{ fontSize: 8, color: '#FFF' }}>✓</Text>}
            </View>
            <Text style={[
              s.timelineLabel,
              { color: done ? colors.onSurface : colors.outline, fontWeight: isCur ? '700' : '400' },
            ]}>
              {t(`status.${st}`, { defaultValue: st })}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Modal cập nhật trạng thái ───────────────────────────────────────────────
function UpdateStatusModal({ visible, currentStatus, onClose, onUpdate, loading, s, colors, t }) {
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
          <Text style={s.modalTitle}>{t('orderDetail.updateTitle')}</Text>
          {UPDATABLE_STATUSES.map(st => {
            const cfg    = STATUS_CONFIG[st.key] ?? DEFAULT_STATUS
            const active = selected === st.key
            return (
              <TouchableOpacity
                key={st.key}
                onPress={() => setSelected(st.key)}
                style={[s.statusOption, active && { backgroundColor: cfg.bg, borderColor: cfg.border }]}
              >
                <View style={[s.radio, active && { borderColor: cfg.border }]}>
                  {active && <View style={[s.radioDot, { backgroundColor: cfg.border }]} />}
                </View>
                <Text style={[s.statusOptionText, active && { color: cfg.text, fontWeight: '700' }]}>
                  {cfg.emoji}  {t(st.labelKey, { defaultValue: st.key })}
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
              : <Text style={s.updateBtnText}>{t('orderDetail.confirm')}</Text>
            }
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── Helper components ────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, s }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoLabel}>{label}:</Text>
      <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function SummaryRow({ label, value, bold, color, s }) {
  return (
    <View style={s.summaryRow}>
      <Text style={[s.summaryLabel, bold && { fontWeight: '700', color }]}>{label}</Text>
      <Text style={[s.summaryValue, bold && { fontWeight: '700' }, color && { color }]}>{value}</Text>
    </View>
  )
}

const PAYMENT_STATUS_CFG = {
  UNPAID:   { bg: '#FEF3C7', text: '#92400E', label: 'Chưa thanh toán' },
  PAID:     { bg: '#D1FAE5', text: '#065F46', label: 'Đã thanh toán'   },
  REFUNDED: { bg: '#DBEAFE', text: '#1E40AF', label: 'Đã hoàn tiền'   },
}

const METHOD_OPTS = [
  { key: 'CASH',          label: 'Tiền mặt',        icon: '💵' },
  { key: 'BANK_TRANSFER', label: 'Chuyển khoản',     icon: '🏦' },
  { key: 'VIETQR',        label: 'VietQR',           icon: '📱' },
  { key: 'MOMO',          label: 'MoMo',             icon: '🟣' },
  { key: 'VNPAY',         label: 'VNPAY',            icon: '💳' },
]

function normalizeOrder(raw) {
  if (!raw) return null
  const rawItems = raw.details ?? raw.items ?? raw.orderItems ?? raw.order_items ?? []
  const items = rawItems.map(it => ({
    name:       it.productName ?? it.name       ?? it.product_name ?? 'Sản phẩm',
    quantity:   it.quantity    ?? 1,
    unitPrice:  it.unitPrice   ?? it.unit_price ?? 0,
    totalPrice: it.subtotal    ?? it.totalPrice ?? it.total_price
                ?? (it.quantity ?? 1) * (it.unitPrice ?? it.unit_price ?? 0),
  }))
  return {
    orderId:        raw.orderId        ?? raw.id,
    externalOrderId:raw.orderCode      ?? raw.externalOrderId ?? raw.external_order_id ?? raw.code,
    channel:        raw.channelName    ?? raw.channel_name    ?? raw.channel,
    status:         raw.status         ?? raw.orderStatus     ?? 'pending',
    createdAt:      raw.orderDate      ?? raw.order_date      ?? raw.createdAt    ?? raw.created_at,
    trackingCode:   raw.trackingCode   ?? raw.tracking_code   ?? raw.trackingNumber,
    customer: {
      name:    raw.customer?.name    ?? raw.customerName    ?? raw.customer_name,
      phone:   raw.customer?.phone   ?? raw.customerPhone   ?? raw.customer_phone ?? raw.phoneNumber,
      address: (raw.customer?.address
               ?? raw.shippingFullAddress ?? raw.shipping_full_address
               ?? [raw.shippingAddress ?? raw.shipping_address,
                   raw.shippingDistrict ?? raw.shipping_district,
                   raw.shippingProvince ?? raw.shipping_province]
                  .filter(Boolean).join(', '))
               || null,
    },
    items,
    subtotal:       raw.subtotal       ?? raw.sub_total      ?? 0,
    shippingFee:    raw.shippingFee    ?? raw.shipping_fee   ?? 0,
    discount:       raw.discount       ?? raw.discountAmount  ?? 0,
    totalAmount:    raw.totalAmount    ?? raw.total_amount   ?? raw.grandTotal    ?? 0,
    paymentMethod:  raw.paymentMethod  ?? raw.payment_method ?? '',
    paymentStatus:  raw.paymentStatus  ?? raw.payment_status ?? 'UNPAID',
    note:           raw.note           ?? raw.notes          ?? '',
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrderDetailScreen({ route, navigation }) {
  const { orderId, orderData } = route?.params ?? {}
  const { colors } = useTheme()
  const { t }      = useTranslation()
  const s          = useMemo(() => makeStyles(colors), [colors])
  const canUpdate  = usePermission('orders.add')

  const [order,      setOrder]      = useState(orderData ? normalizeOrder(orderData) : null)
  const [loading,    setLoading]    = useState(!orderData)
  const [refreshing, setRefreshing] = useState(false)
  const [isMock,     setIsMock]     = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [updating,   setUpdating]   = useState(false)

  // Payment state
  const [payTx,       setPayTx]       = useState(null)   // giao dịch thanh toán hiện tại
  const [showPayPick, setShowPayPick] = useState(false)  // modal chọn phương thức
  const [selMethod,   setSelMethod]   = useState('CASH')
  const [paying,      setPaying]      = useState(false)

  const fetchDetail = useCallback(async () => {
    const id = orderId ?? order?.orderId ?? order?.id
    if (!id) {
      setOrder(normalizeOrder(MOCK_ORDER_DETAIL))
      setIsMock(true)
      return
    }
    try {
      const res = await api.get(`/api/orders/oltp/${id}`)
      const raw = res.data?.data ?? res.data
      setOrder(normalizeOrder(raw))
      setIsMock(false)
    } catch {
      if (orderData) {
        setOrder(normalizeOrder(orderData))
      } else {
        setOrder(normalizeOrder(MOCK_ORDER_DETAIL))
        setIsMock(true)
      }
    }
  }, [orderId, orderData])

  useEffect(() => {
    const id = orderId ?? orderData?.orderId ?? orderData?.id
    if (orderData) {
      setOrder(normalizeOrder(orderData))
      setLoading(false)
      if (id) fetchDetail()
    } else {
      fetchDetail().finally(() => setLoading(false))
    }
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchDetail()
    setRefreshing(false)
  }

  const fetchPayTx = useCallback(async (id) => {
    if (!id) return
    try {
      const res = await api.get(`/api/payment/order/${id}`)
      setPayTx(res.data?.data ?? null)
    } catch { /* Im lặng */ }
  }, [])

  // Gọi fetchPayTx sau khi load xong order
  useEffect(() => {
    if (order?.orderId) fetchPayTx(order.orderId)
  }, [order?.orderId, fetchPayTx])

  const handleInitiatePayment = async () => {
    const id = order?.orderId ?? order?.id
    if (!id) return
    setPaying(true)
    try {
      const res = await api.post(`/api/payment/order/${id}/initiate`, { method: selMethod })
      const tx = res.data?.data
      setPayTx(tx)
      setShowPayPick(false)

      if (selMethod === 'VIETQR') {
        navigation.navigate('VietQR', { txId: tx?.transactionId ?? tx?.id })
      } else {
        // Cash / Bank Transfer: xác nhận đã thu tay
        Alert.alert(
          'Thanh toán ' + (selMethod === 'CASH' ? 'tiền mặt' : 'chuyển khoản'),
          'Xác nhận đã thu tiền từ khách?',
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Đã thu',
              onPress: async () => {
                try {
                  const txId = tx?.transactionId ?? tx?.id
                  await api.post(`/api/payment/transaction/${txId}/confirm`, {})
                  setPayTx(prev => ({ ...prev, status: 'Paid' }))
                  setOrder(prev => ({ ...prev, paymentStatus: 'PAID' }))
                  Alert.alert('✅', 'Đã xác nhận thanh toán thành công!')
                } catch (err) {
                  Alert.alert('Lỗi', err.response?.data?.message ?? 'Không thể xác nhận')
                }
              },
            },
          ]
        )
      }
    } catch (err) {
      Alert.alert(t('common.error'), err.response?.data?.message ?? 'Không thể khởi tạo thanh toán')
    } finally {
      setPaying(false)
    }
  }

  const handleViewQR = () => {
    if (!payTx) return
    navigation.navigate('VietQR', { txId: payTx.id })
  }

  const handleUpdateStatus = async (newStatus) => {
    const id = order?.orderId ?? order?.id
    if (!id) return
    setUpdating(true)
    try {
      await api.put(`/api/orders/oltp/${id}`, { status: newStatus })
      setOrder(prev => ({ ...prev, status: newStatus }))
      setShowUpdate(false)
      Alert.alert(t('common.confirm'), 'Đã cập nhật trạng thái đơn hàng.')
    } catch (err) {
      Alert.alert(t('common.error'), err.response?.data?.message ?? 'Không thể cập nhật. Thử lại sau.')
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
  const channel   = order.channel ?? order.channelName ?? order.channel_name ?? ''
  const chColor   = channelColor(channel, colors.secondary)

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>{t('common.mockBanner')}</Text>
        </View>
      )}

      {/* Header */}
      <View style={s.headerCard}>
        <View style={s.headerTop}>
          <Text style={s.orderCode} numberOfLines={1}>
            {order.externalOrderId ?? `#${order.orderId ?? order.id ?? '?'}`}
          </Text>
          {channel ? (
            <View style={[s.channelBadge, { backgroundColor: chColor + '22' }]}>
              <Text style={[s.channelBadgeText, { color: chColor }]}>{channel}</Text>
            </View>
          ) : null}
        </View>
        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusBadgeText, { color: cfg.text }]}>
            {cfg.emoji}  {t(`status.${statusKey}`, { defaultValue: cfg.label ?? statusKey })}
          </Text>
        </View>
        {order.trackingCode && (
          <Text style={s.trackingText}>{t('orderDetail.tracking')}: {order.trackingCode}</Text>
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

      {/* Timeline */}
      {!['cancelled', 'returned'].includes(statusKey) && (
        <View style={s.sectionCard}>
          <Text style={s.cardLabel}>{t('orderDetail.progress')}</Text>
          <OrderTimeline currentStatus={statusKey} colors={colors} s={s} t={t} />
        </View>
      )}

      {/* Thông tin khách hàng */}
      <View style={s.sectionCard}>
        <Text style={s.cardLabel}>{t('orderDetail.customer')}</Text>
        <InfoRow icon="👤" label={t('orderDetail.name')}    value={order.customer?.name    ?? '—'} s={s} />
        <InfoRow icon="📞" label={t('orderDetail.phone')}   value={order.customer?.phone   ?? '—'} s={s} />
        <InfoRow icon="📍" label={t('orderDetail.address')} value={order.customer?.address ?? '—'} s={s} />
      </View>

      {/* Sản phẩm */}
      <View style={s.sectionCard}>
        <Text style={s.cardLabel}>{t('orderDetail.products')}</Text>
        {(order.items ?? []).map((item, idx) => (
          <View key={idx} style={[s.itemRow, idx > 0 && s.itemBorder]}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
              <Text style={s.itemQty}>x{item.quantity}  ×  ₫{formatMoney(item.unitPrice)}</Text>
            </View>
            <Text style={[s.itemTotal, { color: colors.primary }]}>
              ₫{formatMoney(item.totalPrice)}
            </Text>
          </View>
        ))}
        <View style={s.summaryBox}>
          <SummaryRow label={t('orderDetail.subtotal')} value={`₫${formatMoney(order.subtotal)}`} s={s} />
          <SummaryRow label={t('orderDetail.shipping')} value={`₫${formatMoney(order.shippingFee)}`} s={s} />
          {(order.discount ?? 0) > 0 && (
            <SummaryRow label={t('orderDetail.discount')} value={`-₫${formatMoney(order.discount)}`} color={colors.success} s={s} />
          )}
          <View style={s.totalLine} />
          <SummaryRow
            label={t('orderDetail.total')}
            value={`₫${formatMoney(order.totalAmount)}`}
            bold color={colors.primary}
            s={s}
          />
          <SummaryRow label={t('orderDetail.payment')} value={order.paymentMethod ?? '—'} s={s} />
        </View>
      </View>

      {/* Ghi chú */}
      {(order.note || order.notes) && (
        <View style={s.sectionCard}>
          <Text style={s.cardLabel}>{t('orderDetail.note')}</Text>
          <Text style={s.noteText}>{order.note ?? order.notes}</Text>
        </View>
      )}

      {/* Thanh toán */}
      {(() => {
        const psCfg = PAYMENT_STATUS_CFG[order.paymentStatus?.toUpperCase()] ?? PAYMENT_STATUS_CFG.UNPAID
        const txPending = payTx && payTx.status === 'Pending'
        const isUnpaid  = (order.paymentStatus ?? 'UNPAID').toUpperCase() === 'UNPAID'
        return (
          <View style={s.sectionCard}>
            <Text style={s.cardLabel}>THANH TOÁN</Text>

            {/* Badge trạng thái thanh toán */}
            <View style={[s.payBadge, { backgroundColor: psCfg.bg }]}>
              <Text style={[s.payBadgeText, { color: psCfg.text }]}>{psCfg.label}</Text>
            </View>

            {order.paymentMethod ? (
              <Text style={{ fontSize: 13, color: colors.outline, marginBottom: 8 }}>
                Phương thức: {order.paymentMethod}
              </Text>
            ) : null}

            {/* Nút xem QR nếu đang có giao dịch VietQR Pending */}
            {txPending && payTx.paymentMethod === 'VIETQR' && (
              <TouchableOpacity
                style={[s.payBtn, { backgroundColor: '#6366F1' }]}
                onPress={handleViewQR}
                activeOpacity={0.85}
              >
                <Text style={s.payBtnText}>📱  Xem mã QR thanh toán</Text>
              </TouchableOpacity>
            )}

            {/* Nút xác nhận thủ công nếu đang Pending (Cash/Bank Transfer) */}
            {txPending && payTx.paymentMethod !== 'VIETQR' && canUpdate && (
              <TouchableOpacity
                style={[s.payBtn, { backgroundColor: '#10B981' }]}
                onPress={async () => {
                  Alert.alert('Xác nhận thanh toán', 'Xác nhận đã thu tiền từ khách?', [
                    { text: 'Hủy', style: 'cancel' },
                    {
                      text: 'Đã thu',
                      onPress: async () => {
                        try {
                          await api.post(`/api/payment/transaction/${payTx.id}/confirm`, {})
                          setPayTx(prev => ({ ...prev, status: 'Paid' }))
                          setOrder(prev => ({ ...prev, paymentStatus: 'PAID' }))
                          Alert.alert('✅', 'Đã xác nhận thanh toán!')
                        } catch (err) {
                          Alert.alert(t('common.error'), err.response?.data?.message ?? 'Không thể xác nhận')
                        }
                      },
                    },
                  ])
                }}
                activeOpacity={0.85}
              >
                <Text style={s.payBtnText}>✅  Xác nhận đã thu tiền</Text>
              </TouchableOpacity>
            )}

            {/* Nút khởi tạo thanh toán nếu chưa thanh toán */}
            {isUnpaid && !txPending && canUpdate && (
              <TouchableOpacity
                style={[s.payBtn, { backgroundColor: colors.interactive }]}
                onPress={() => setShowPayPick(true)}
                activeOpacity={0.85}
              >
                <Text style={s.payBtnText}>💳  {t('payment.initiate')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })()}

      {/* Nút cập nhật */}
      {canUpdate && !['cancelled', 'returned', 'completed'].includes(statusKey) && (
        <TouchableOpacity
          style={s.updateStatusBtn}
          onPress={() => setShowUpdate(true)}
          activeOpacity={0.85}
        >
          <Text style={s.updateStatusBtnText}>{t('orderDetail.updateStatus')}</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />

      <UpdateStatusModal
        visible={showUpdate}
        currentStatus={statusKey}
        onClose={() => setShowUpdate(false)}
        onUpdate={handleUpdateStatus}
        loading={updating}
        s={s}
        colors={colors}
        t={t}
      />

      {/* Modal chọn phương thức thanh toán */}
      <Modal visible={showPayPick} transparent animationType="slide" onRequestClose={() => setShowPayPick(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          onPress={() => setShowPayPick(false)}
          activeOpacity={1}
        >
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>{t('payment.initiateTitle')}</Text>
            {METHOD_OPTS.map(m => {
              const active = selMethod === m.key
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => setSelMethod(m.key)}
                  style={[
                    s.methodOption,
                    active && { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
                  ]}
                >
                  <Text style={s.methodIcon}>{m.icon}</Text>
                  <Text style={[s.methodLabel, active && { fontWeight: '700', color: '#4338CA' }]}>
                    {m.label}
                  </Text>
                  <View style={[s.radio, active && { borderColor: '#6366F1' }]}>
                    {active && <View style={[s.radioDot, { backgroundColor: '#6366F1' }]} />}
                  </View>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity
              style={[s.updateBtn, paying && { opacity: 0.6 }]}
              onPress={handleInitiatePayment}
              disabled={paying}
            >
              {paying
                ? <ActivityIndicator color="#FFF" />
                : <Text style={s.updateBtnText}>{t('payment.initiate')}</Text>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  )
}
