import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

const STATUS_COLOR = {
  pending:   { bg: 'rgba(255,180,0,0.12)',   text: '#ffb400' },
  confirmed: { bg: 'rgba(173,198,255,0.12)', text: '#adc6ff' },
  shipping:  { bg: 'rgba(173,198,255,0.12)', text: '#adc6ff' },
  delivered: { bg: 'rgba(74,225,118,0.12)',  text: '#4ae176' },
  cancelled: { bg: 'rgba(255,180,171,0.12)', text: '#ffb4ab' },
  returned:  { bg: 'rgba(255,180,171,0.12)', text: '#ffb4ab' },
}

const STATUS_LABEL = {
  pending: 'Chờ xử lý', confirmed: 'Đã xác nhận',
  shipping: 'Đang giao', delivered: 'Đã giao',
  cancelled: 'Đã hủy',  returned: 'Hoàn trả',
}

function OrderItem({ item, onPress }) {
  const sc = STATUS_COLOR[item.status] ?? STATUS_COLOR.pending
  return (
    <TouchableOpacity style={s.orderCard} onPress={() => onPress(item)} activeOpacity={0.8}>
      <View style={s.orderHeader}>
        <Text style={s.orderId} numberOfLines={1}>{item.externalOrderId}</Text>
        <View style={[s.badge, { backgroundColor: sc.bg }]}>
          <Text style={[s.badgeText, { color: sc.text }]}>{STATUS_LABEL[item.status]}</Text>
        </View>
      </View>
      <Text style={s.customerName}>{item.customerName}</Text>
      <View style={s.orderFooter}>
        <Text style={s.channel}>{item.channel}</Text>
        <Text style={s.amount}>₫{item.totalAmount?.toLocaleString('vi-VN')}</Text>
      </View>
      <Text style={s.date}>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</Text>
    </TouchableOpacity>
  )
}

export default function OrdersScreen({ navigation }) {
  const [data,      setData]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)
  const [hasMore,   setHasMore]   = useState(true)
  const [error,     setError]     = useState(null)

  const fetchData = useCallback(async (reset = false) => {
    if (!reset && !hasMore) return
    try {
      const p = reset ? 1 : page
      const res = await api.get('/api/orders', {
        params: { search, page: p, limit: 15 },
      })
      const items = res.data.items ?? []
      setData(reset ? items : prev => [...prev, ...items])
      setHasMore(items.length === 15)
      if (!reset) setPage(p + 1)
    } catch { setError('Không thể tải đơn hàng') }
  }, [search, page, hasMore])

  useEffect(() => {
    setPage(1)
    setHasMore(true)
    setData([])
    fetchData(true).finally(() => setLoading(false))
  }, [search])

  const onRefresh = async () => {
    setRefreshing(true)
    setPage(1)
    setHasMore(true)
    await fetchData(true)
    setRefreshing(false)
  }

  return (
    <View style={s.container}>
      {/* Search bar */}
      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Tìm đơn hàng, khách hàng..."
          placeholderTextColor={colors.outline}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {error && <Text style={s.errorText}>{error}</Text>}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => `${item.orderId ?? i}`}
          renderItem={({ item }) => (
            <OrderItem item={item} onPress={() => {}} />
          )}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onEndReached={() => fetchData()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={s.emptyText}>Không có đơn hàng nào</Text>
          }
        />
      )}

      {/* FAB thêm đơn */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => navigation.navigate('AddOrder')}
        activeOpacity={0.85}
      >
        <Text style={s.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  searchIcon:  { fontSize: 14, marginRight: 8, color: colors.outline },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.onSurface },
  list: { padding: 12, paddingTop: 4, paddingBottom: 80 },
  orderCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  orderId:   { fontSize: 13, color: colors.outline, fontFamily: 'monospace', flex: 1 },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  customerName: { fontSize: 15, fontWeight: '600', color: colors.onSurface, marginBottom: 8 },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  channel: { fontSize: 12, color: colors.secondary },
  amount:  { fontSize: 15, fontWeight: '700', color: colors.primary },
  date:    { fontSize: 11, color: colors.outline },
  errorText: { color: colors.error, padding: 16, textAlign: 'center' },
  emptyText: { color: colors.outline, textAlign: 'center', padding: 40, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6,
  },
  fabText: { fontSize: 24, color: colors.surface, fontWeight: '700' },
})
