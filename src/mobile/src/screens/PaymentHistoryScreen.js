import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import api from '../api/axios'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

const TX_STATUS = {
  Pending:   { bg: '#FEF3C7', text: '#92400E', label: 'Chờ TT'      },
  Paid:      { bg: '#D1FAE5', text: '#065F46', label: 'Đã TT'        },
  Failed:    { bg: '#FEE2E2', text: '#991B1B', label: 'Thất bại'     },
  Cancelled: { bg: '#F3F4F6', text: '#6B7280', label: 'Đã hủy'       },
  Expired:   { bg: '#F3F4F6', text: '#6B7280', label: 'Hết hạn'      },
}

const METHOD_LABEL = {
  CASH: 'Tiền mặt', BANK_TRANSFER: 'CK ngân hàng',
  VIETQR: 'VietQR', MOMO: 'MoMo', VNPAY: 'VNPAY',
}

function fmtVND(v) {
  if (v == null) return '—'
  if (v >= 1_000_000) return `₫${(v / 1_000_000).toFixed(1)}M`
  return `₫${Number(v).toLocaleString('vi-VN')}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

const makeStyles = (c) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: c.surface },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  listContent: { padding: 12 },

  card: {
    backgroundColor: c.surfaceContainerLow,
    borderRadius: radius.md, padding: 14,
    marginBottom: 10,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 8,
  },
  codeText:    { fontSize: 13, fontWeight: '700', color: c.onSurface, fontVariant: ['tabular-nums'] },
  methodText:  { fontSize: 12, color: c.outline, marginTop: 2 },
  amountText:  { fontSize: 15, fontWeight: '700', color: c.primary, textAlign: 'right' },

  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: radius.full, marginBottom: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700' },

  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dateLabel: { fontSize: 11, color: c.outline },
  dateVal:   { fontSize: 11, color: c.outline },

  typeChip: {
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: c.surfaceContainerHigh,
    alignSelf: 'flex-start', marginBottom: 6,
  },
  typeText: { fontSize: 10, color: c.outline, fontWeight: '600' },

  emptyBox:  { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: c.outline, fontSize: 14, marginTop: 8 },

  errorBox: {
    margin: 12, padding: 12, borderRadius: radius.md,
    backgroundColor: '#FEE2E2',
  },
  errorText: { color: '#991B1B', fontSize: 13, textAlign: 'center' },
  retryBtn:  { marginTop: 8, alignItems: 'center' },
  retryText: { color: '#991B1B', fontWeight: '700', fontSize: 13 },

  footer: { paddingVertical: 16, alignItems: 'center' },
})

export default function PaymentHistoryScreen() {
  const { colors } = useTheme()
  const { t }      = useTranslation()
  const s          = useMemo(() => makeStyles(colors), [colors])

  const [items,      setItems]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [loadingMore,setLoadingMore]= useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error,      setError]      = useState('')
  const pageSize = 20

  const load = useCallback(async (pg = 1, append = false) => {
    if (!append) setError('')
    try {
      const res = await api.get(`/api/payment/history?page=${pg}&pageSize=${pageSize}`)
      const data  = res.data.data  ?? []
      const ttl   = res.data.total ?? 0
      setTotal(ttl)
      setItems(prev => append ? [...prev, ...data] : data)
    } catch {
      setError(t('payment.loadError', { defaultValue: 'Không thể tải lịch sử thanh toán' }))
    }
  }, [t])

  useEffect(() => {
    setLoading(true)
    load(1).finally(() => setLoading(false))
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    setPage(1)
    await load(1)
    setRefreshing(false)
  }

  const onLoadMore = async () => {
    if (loadingMore || items.length >= total) return
    const nextPage = page + 1
    setPage(nextPage)
    setLoadingMore(true)
    await load(nextPage, true)
    setLoadingMore(false)
  }

  const renderItem = ({ item: tx }) => {
    const cfg = TX_STATUS[tx.status] ?? TX_STATUS.Pending
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={s.codeText} numberOfLines={1}>{tx.paymentCode}</Text>
            <Text style={s.methodText}>{METHOD_LABEL[tx.paymentMethod] ?? tx.paymentMethod}</Text>
          </View>
          <Text style={s.amountText}>{fmtVND(tx.amount)}</Text>
        </View>

        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>

        <View style={s.typeChip}>
          <Text style={s.typeText}>
            {tx.orderId
              ? `Đơn #${tx.orderId}`
              : tx.invoiceId ? 'Gói dịch vụ' : '—'}
          </Text>
        </View>

        <View style={s.dateRow}>
          <Text style={s.dateLabel}>Tạo: {fmtDate(tx.createdAt)}</Text>
          {tx.paidAt && <Text style={[s.dateVal, { color: '#10B981' }]}>TT: {fmtDate(tx.paidAt)}</Text>}
        </View>
      </View>
    )
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  if (error) {
    return (
      <View style={s.container}>
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(1).finally(() => setLoading(false)) }}>
            <Text style={s.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={s.listContent}
      data={items}
      keyExtractor={tx => tx.id ?? tx.paymentCode}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.3}
      ListEmptyComponent={
        <View style={s.emptyBox}>
          <Text style={{ fontSize: 32 }}>💳</Text>
          <Text style={s.emptyText}>Chưa có giao dịch nào</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? <View style={s.footer}><ActivityIndicator color={colors.primary} /></View> : null
      }
    />
  )
}
