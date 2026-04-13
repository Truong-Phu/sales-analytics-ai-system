import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

function KpiCard({ label, value, trend, emoji }) {
  const isUp   = trend > 0
  const isDown = trend < 0
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiEmoji}>{emoji}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {trend !== undefined && (
        <Text style={[s.kpiTrend, isUp ? s.up : isDown ? s.down : s.flat]}>
          {isUp ? '▲' : isDown ? '▼' : '–'} {Math.abs(trend).toFixed(1)}%
        </Text>
      )}
    </View>
  )
}

export default function DashboardScreen() {
  const { user, logout } = useAuth()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error,     setError]     = useState(null)

  const fetchData = async () => {
    try {
      const to   = new Date()
      const from = new Date(Date.now() - 30 * 86_400_000)
      const res  = await api.get('/api/dashboard', {
        params: {
          from: from.toISOString().slice(0, 10),
          to:   to.toISOString().slice(0, 10),
          channel: 'all',
        },
      })
      setData(res.data)
    } catch { setError('Không thể tải dữ liệu') }
  }

  useEffect(() => {
    fetchData().finally(() => setLoading(false))
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Xin chào, {user?.name?.split(' ').pop()} 👋</Text>
          <Text style={s.dateText}>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {data && (
        <>
          <Text style={s.sectionTitle}>KPI Hôm nay (30 ngày)</Text>

          <View style={s.kpiGrid}>
            <KpiCard
              label="Doanh thu"
              value={`₫${(data.kpi.totalRevenue / 1_000_000).toFixed(1)}M`}
              trend={data.kpi.revenueTrend}
              emoji="💰"
            />
            <KpiCard
              label="Đơn hàng"
              value={data.kpi.totalOrders?.toLocaleString('vi-VN')}
              trend={data.kpi.ordersTrend}
              emoji="🛒"
            />
            <KpiCard
              label="Giá trị TB"
              value={`₫${(data.kpi.avgOrderValue / 1_000).toFixed(0)}K`}
              trend={data.kpi.aovTrend}
              emoji="🧾"
            />
            <KpiCard
              label="KH mới"
              value={data.kpi.newCustomers?.toLocaleString('vi-VN')}
              trend={data.kpi.customersTrend}
              emoji="👤"
            />
          </View>

          {/* Top sản phẩm */}
          <Text style={s.sectionTitle}>Top sản phẩm</Text>
          <View style={s.card}>
            {data.topProducts?.slice(0, 5).map((p, i) => (
              <View key={p.productId} style={[s.productRow, i > 0 && s.borderTop]}>
                <Text style={s.productRank}>{i + 1}</Text>
                <View style={s.productInfo}>
                  <Text style={s.productName} numberOfLines={1}>{p.productName}</Text>
                  <Text style={s.productChannel}>{p.channel}</Text>
                </View>
                <Text style={s.productRevenue}>₫{(p.totalRevenue / 1_000_000).toFixed(1)}M</Text>
              </View>
            ))}
          </View>

          {/* Kênh bán */}
          <Text style={s.sectionTitle}>Doanh thu theo kênh</Text>
          <View style={s.card}>
            {data.revenueByChannel?.map((c, i) => {
              const pct = data.revenueByChannel.reduce((a, b) => a + b.revenue, 0)
              const p   = pct > 0 ? ((c.revenue / pct) * 100).toFixed(0) : 0
              return (
                <View key={c.name} style={[s.channelRow, i > 0 && s.borderTop]}>
                  <Text style={s.channelName}>{c.name}</Text>
                  <View style={s.barWrap}>
                    <View style={[s.bar, { width: `${p}%` }]} />
                  </View>
                  <Text style={s.channelPct}>{p}%</Text>
                </View>
              )
            })}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 52,
  },
  greeting:  { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  dateText:  { fontSize: 12, color: colors.outline, marginTop: 2 },
  logoutBtn: { padding: 8 },
  logoutText:{ fontSize: 13, color: colors.error },
  errorBox: {
    margin: 16, padding: 12,
    backgroundColor: 'rgba(255,180,171,0.1)',
    borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,180,171,0.3)',
  },
  errorText: { color: colors.error, fontSize: 13 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.outline,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginHorizontal: 16, marginTop: 20, marginBottom: 10,
  },
  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 0,
  },
  kpiCard: {
    width: '47%', margin: '1.5%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 16,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  kpiEmoji: { fontSize: 24, marginBottom: 8 },
  kpiLabel: { fontSize: 12, color: colors.outline },
  kpiValue: { fontSize: 22, fontWeight: '700', color: colors.onSurface, marginTop: 2 },
  kpiTrend: { fontSize: 12, marginTop: 4 },
  up:   { color: colors.tertiary },
  down: { color: colors.error    },
  flat: { color: colors.outline  },
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, marginHorizontal: 16,
    borderWidth: 1, borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  borderTop:  { borderTopWidth: 1, borderTopColor: colors.outlineVariant + '44' },
  productRank:{ fontSize: 13, color: colors.outline, width: 20 },
  productInfo:{ flex: 1, marginHorizontal: 10 },
  productName:{ fontSize: 14, color: colors.onSurface, fontWeight: '600' },
  productChannel: { fontSize: 12, color: colors.outline, marginTop: 2 },
  productRevenue: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  channelRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 10,
  },
  channelName: { width: 80, fontSize: 13, color: colors.onSurface },
  barWrap: { flex: 1, height: 6, backgroundColor: colors.surfaceContainerHighest, borderRadius: 3 },
  bar:     { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  channelPct: { fontSize: 13, color: colors.outline, width: 36, textAlign: 'right' },
})
