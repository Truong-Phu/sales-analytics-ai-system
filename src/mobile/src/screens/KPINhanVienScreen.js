import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

function formatMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0'
  const n = Number(v)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

// ─── Kỳ báo cáo ──────────────────────────────────────────────────────────────
const PERIODS = [
  { key: 'today',  label: 'Hôm nay',   days: 1  },
  { key: '7days',  label: '7 ngày',    days: 7  },
  { key: 'month',  label: 'Tháng này', days: 30 },
]

// ─── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_KPI = {
  revenue:       12_500_000,
  revenueTarget: 50_000_000,
  orders:        18,
  ordersTarget:  50,
  customers:     5,
  customersTarget:15,
  rank:          3,
  totalStaff:    8,
  completionRate:36,
  topProducts: [
    { name: 'Áo thun Unisex',   orders: 7, revenue: 4_200_000 },
    { name: 'Quần jogger',       orders: 5, revenue: 3_100_000 },
    { name: 'Giày sneaker',      orders: 4, revenue: 2_800_000 },
  ],
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ current, target, color, s }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  return (
    <View style={s.progressBg}>
      <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  )
}

function KpiRow({ emoji, label, current, target, formatVal, color, s, primaryColor }) {
  const pct = target > 0 ? ((current / target) * 100).toFixed(0) : 0
  const barColor = pct >= 80 ? '#4AE176' : pct >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <View style={s.kpiRow}>
      <View style={s.kpiRowLeft}>
        <Text style={s.kpiRowEmoji}>{emoji}</Text>
        <View>
          <Text style={s.kpiRowLabel}>{label}</Text>
          <View style={s.kpiRowNums}>
            <Text style={[s.kpiRowCurrent, { color: color ?? primaryColor }]}>
              {formatVal(current)}
            </Text>
            <Text style={s.kpiRowSep}>/</Text>
            <Text style={s.kpiRowTarget}>{formatVal(target)}</Text>
          </View>
        </View>
      </View>
      <Text style={[s.kpiPct, { color: barColor }]}>{pct}%</Text>
    </View>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function KPINhanVienScreen() {
  const { user }   = useAuth()
  const { colors } = useTheme()
  const s          = useMemo(() => makeStyles(colors), [colors])

  const [kpi,        setKpi]        = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isMock,     setIsMock]     = useState(false)
  const [period,     setPeriod]     = useState(0) // index of PERIODS

  const fetchKpi = useCallback(async (dayCount) => {
    try {
      const to   = new Date()
      const from = new Date(Date.now() - dayCount * 86_400_000)
      const res  = await api.get('/api/kpi/my-stats', {
        params: {
          userId: user?.id,
          from:   from.toISOString().slice(0, 10),
          to:     to.toISOString().slice(0, 10),
        },
      })
      const raw = res.data?.data ?? res.data
      setKpi({
        revenue:        raw.revenue        ?? raw.totalRevenue        ?? 0,
        revenueTarget:  raw.revenueTarget  ?? raw.target_revenue      ?? 50_000_000,
        orders:         raw.orders         ?? raw.totalOrders         ?? 0,
        ordersTarget:   raw.ordersTarget   ?? raw.target_orders       ?? 50,
        customers:      raw.customers      ?? raw.newCustomers        ?? 0,
        customersTarget:raw.customersTarget ?? raw.target_customers   ?? 15,
        rank:           raw.rank           ?? null,
        totalStaff:     raw.totalStaff     ?? null,
        completionRate: raw.completionRate ?? null,
        topProducts:    raw.topProducts    ?? [],
      })
      setIsMock(false)
    } catch {
      setKpi(MOCK_KPI)
      setIsMock(true)
    }
  }, [user?.id])

  useEffect(() => {
    setLoading(true)
    fetchKpi(PERIODS[period].days).finally(() => setLoading(false))
  }, [period, fetchKpi])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchKpi(PERIODS[period].days)
    setRefreshing(false)
  }

  const data = kpi ?? MOCK_KPI

  // Tính tổng % hoàn thành
  const revenueCompletion = data.revenueTarget > 0
    ? Math.min((data.revenue / data.revenueTarget) * 100, 100)
    : 0
  const overallColor =
    revenueCompletion >= 80 ? '#4AE176' :
    revenueCompletion >= 50 ? '#F59E0B' :
    '#EF4444'

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View style={s.greetingBox}>
        <Text style={s.greetingHello}>Xin chào, {user?.name?.split(' ').pop() ?? 'Bạn'} 👋</Text>
        <Text style={s.greetingRole}>KPI cá nhân của bạn</Text>
      </View>

      {/* Period selector */}
      <View style={s.periodRow}>
        {PERIODS.map((p, i) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => setPeriod(i)}
            style={[s.periodBtn, period === i && s.periodBtnActive]}
          >
            <Text style={[s.periodBtnText, period === i && s.periodBtnTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
        <>
          {/* Tổng tiến độ */}
          <View style={s.overallCard}>
            <Text style={s.overallLabel}>Tổng tiến độ doanh thu</Text>
            <Text style={[s.overallPct, { color: overallColor }]}>
              {revenueCompletion.toFixed(0)}%
            </Text>
            <ProgressBar current={data.revenue} target={data.revenueTarget} color={overallColor} s={s} />
            <Text style={s.overallDetail}>
              ₫{formatMoney(data.revenue)} / ₫{formatMoney(data.revenueTarget)}
            </Text>

            {/* Xếp hạng */}
            {data.rank && (
              <View style={s.rankRow}>
                <Text style={s.rankLabel}>Xếp hạng nhóm:</Text>
                <Text style={s.rankValue}># {data.rank} / {data.totalStaff}</Text>
              </View>
            )}
          </View>

          {/* KPI chi tiết */}
          <View style={s.kpiCard}>
            <Text style={s.cardLabel}>CHỈ TIÊU THEO KỲ</Text>

            <KpiRow
              emoji="💰" label="Doanh thu"
              current={data.revenue} target={data.revenueTarget}
              formatVal={(v) => `₫${formatMoney(v)}`}
              color={colors.primary} s={s} primaryColor={colors.primary}
            />
            <ProgressBar current={data.revenue} target={data.revenueTarget}
              color={revenueCompletion >= 80 ? '#4AE176' : revenueCompletion >= 50 ? '#F59E0B' : '#EF4444'} s={s} />

            <View style={{ height: 14 }} />

            <KpiRow
              emoji="🛒" label="Đơn hàng"
              current={data.orders} target={data.ordersTarget}
              formatVal={(v) => `${v} đơn`}
              s={s} primaryColor={colors.primary}
            />
            <ProgressBar
              current={data.orders} target={data.ordersTarget}
              color={data.ordersTarget > 0 && (data.orders / data.ordersTarget) >= 0.8 ? '#4AE176' : '#F59E0B'} s={s}
            />

            <View style={{ height: 14 }} />

            <KpiRow
              emoji="👤" label="KH mới"
              current={data.customers} target={data.customersTarget}
              formatVal={(v) => `${v} KH`}
              s={s} primaryColor={colors.primary}
            />
            <ProgressBar
              current={data.customers} target={data.customersTarget}
              color={data.customersTarget > 0 && (data.customers / data.customersTarget) >= 0.8 ? '#4AE176' : '#F59E0B'} s={s}
            />
          </View>

          {/* Top sản phẩm đã bán */}
          {data.topProducts?.length > 0 && (
            <View style={s.kpiCard}>
              <Text style={s.cardLabel}>SẢN PHẨM ĐÃ BÁN</Text>
              {data.topProducts.slice(0, 5).map((p, i) => (
                <View key={i} style={[s.productRow, i > 0 && s.productBorder]}>
                  <Text style={s.productRank}>
                    {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </Text>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <Text style={s.productName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.productOrders}>{p.orders} đơn</Text>
                  </View>
                  <Text style={s.productRevenue}>₫{formatMoney(p.revenue)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  center:    { paddingVertical: 60, alignItems: 'center' },

  greetingBox: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
    backgroundColor: c.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: c.outlineVariant,
  },
  greetingHello: { fontSize: 17, fontWeight: '700', color: c.onSurface },
  greetingRole:  { fontSize: 12, color: c.outline, marginTop: 3 },

  periodRow: { flexDirection: 'row', padding: 12, paddingBottom: 6, gap: 8 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.outlineVariant, alignItems: 'center' },
  periodBtnActive:     { backgroundColor: c.primaryContainer, borderColor: c.primary },
  periodBtnText:       { fontSize: 12, color: c.outline },
  periodBtnTextActive: { color: c.surface, fontWeight: '700' },

  mockBanner:     { marginHorizontal: 12, marginBottom: 4, backgroundColor: 'rgba(255,180,0,0.1)', borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)', borderRadius: radius.sm, padding: 8 },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  overallCard:   { backgroundColor: c.card, borderRadius: radius.md, margin: 12, padding: 16 },
  overallLabel:  { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
  overallPct:    { fontSize: 36, fontWeight: '700', marginBottom: 8 },
  overallDetail: { fontSize: 12, color: c.textSecondary, marginTop: 6 },
  rankRow:       { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  rankLabel:     { fontSize: 13, color: c.textSecondary },
  rankValue:     { fontSize: 14, fontWeight: '700', color: '#FFD700' },

  kpiCard:   { backgroundColor: c.card, borderRadius: radius.md, marginHorizontal: 12, marginBottom: 12, padding: 16 },
  cardLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },

  kpiRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  kpiRowLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  kpiRowEmoji:   { fontSize: 20 },
  kpiRowLabel:   { fontSize: 12, color: c.textSecondary, marginBottom: 2 },
  kpiRowNums:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kpiRowCurrent: { fontSize: 15, fontWeight: '700' },
  kpiRowSep:     { fontSize: 13, color: c.cardBorder },
  kpiRowTarget:  { fontSize: 13, color: c.outline },
  kpiPct:        { fontSize: 16, fontWeight: '700', minWidth: 44, textAlign: 'right' },

  progressBg:   { height: 8, backgroundColor: c.cardBorder, borderRadius: 4 },
  progressFill: { height: 8, borderRadius: 4 },

  productRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  productBorder:  { borderTopWidth: 1, borderTopColor: c.cardBorder },
  productRank:    { fontSize: 18, width: 30 },
  productName:    { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
  productOrders:  { fontSize: 11, color: c.textSecondary, marginTop: 2 },
  productRevenue: { fontSize: 13, color: c.primary, fontWeight: '700' },
})
