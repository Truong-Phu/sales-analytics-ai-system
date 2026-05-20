import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import api from '../api/axios'
import { usePlan } from '../hooks/usePermission'
import { colors, radius } from '../components/theme'

function formatMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0'
  const n = Number(v)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

const PERIODS = [
  { label: '7 ngày',  days: 7  },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
]

const MOCK_REPORT = {
  totalRevenue:  845_200_000,
  totalOrders:   312,
  totalCustomers: 89,
  totalProfit:   253_560_000,
  revenueTrend:  3.2,
  channels: [
    { name: 'Shopee',   revenue: 310_000_000, orders: 115, color: '#EE4D2D' },
    { name: 'TikTok',   revenue: 245_000_000, orders: 87,  color: '#69C9D0' },
    { name: 'Lazada',   revenue: 178_000_000, orders: 63,  color: '#0F146D' },
    { name: 'Facebook', revenue: 92_000_000,  orders: 34,  color: '#1877F2' },
    { name: 'Website',  revenue: 20_200_000,  orders: 13,  color: '#4AE176' },
  ],
  topProducts: [
    { name: 'Áo thun Unisex oversize',    revenue: 125_000_000, orders: 48 },
    { name: 'Quần jogger cotton',          revenue: 98_000_000,  orders: 37 },
    { name: 'Váy hoa midi',               revenue: 76_000_000,  orders: 29 },
    { name: 'Áo khoác dù',               revenue: 65_000_000,  orders: 24 },
    { name: 'Giày sneaker trắng',          revenue: 52_000_000,  orders: 19 },
  ],
}

// Màn hình yêu cầu nâng cấp Pro
function ProGateView() {
  return (
    <View style={s.proGate}>
      <Text style={s.proGateIcon}>📊</Text>
      <Text style={s.proGateTitle}>Tính năng dành cho gói Pro</Text>
      <Text style={s.proGateDesc}>
        Báo cáo nhanh, phân tích theo kênh và sản phẩm top chỉ khả dụng với gói{' '}
        <Text style={{ color: '#4ae176', fontWeight: '700' }}>Pro</Text> trở lên.
      </Text>
      <View style={s.proFeatureList}>
        {[
          'Tổng hợp KPI theo kỳ (7/30/90 ngày)',
          'Doanh thu chi tiết theo kênh bán hàng',
          'Top 5 sản phẩm bán chạy',
          'So sánh tăng trưởng so với kỳ trước',
        ].map((f, i) => (
          <View key={i} style={s.proFeatureItem}>
            <Text style={s.proFeatureCheck}>✓</Text>
            <Text style={s.proFeatureText}>{f}</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity
        style={s.upgradeBtn}
        onPress={() => Alert.alert(
          'Nâng cấp Pro',
          'Liên hệ quản trị viên hoặc truy cập web để nâng cấp gói dịch vụ.',
          [{ text: 'Đã hiểu' }]
        )}
      >
        <Text style={s.upgradeBtnText}>Nâng cấp lên Pro — 490.000 ₫/tháng</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function QuickReportScreen({ navigation }) {
  const { isFree } = usePlan()
  const [selectedPeriod, setSelectedPeriod] = useState(1) // index of PERIODS
  const [report,    setReport]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [isMock,    setIsMock]    = useState(false)

  const fetchReport = useCallback(async (days) => {
    try {
      const to   = new Date()
      const from = new Date(Date.now() - days * 86_400_000)
      const res  = await api.get('/api/dashboard', {
        params: {
          from: from.toISOString().slice(0, 10),
          to:   to.toISOString().slice(0, 10),
          channel: 'all',
        },
      })
      const raw = res.data?.data ?? res.data
      // Chuẩn hóa dữ liệu từ nhiều format backend
      const r = {
        totalRevenue:   raw?.kpi?.totalRevenue   ?? raw?.totalRevenue   ?? MOCK_REPORT.totalRevenue,
        totalOrders:    raw?.kpi?.totalOrders    ?? raw?.totalOrders    ?? MOCK_REPORT.totalOrders,
        totalCustomers: raw?.kpi?.newCustomers   ?? raw?.newCustomers   ?? MOCK_REPORT.totalCustomers,
        totalProfit:    raw?.kpi?.totalProfit    ?? raw?.totalProfit    ?? MOCK_REPORT.totalProfit,
        revenueTrend:   raw?.kpi?.revenueTrend   ?? raw?.revenueTrend   ?? 0,
        channels:       raw?.channels            ?? MOCK_REPORT.channels,
        topProducts:    raw?.topProducts         ?? MOCK_REPORT.topProducts,
      }
      setReport(r)
      setIsMock(false)
    } catch {
      setReport(MOCK_REPORT)
      setIsMock(true)
    }
  }, [])

  useEffect(() => {
    if (isFree) { setLoading(false); return }
    fetchReport(PERIODS[selectedPeriod].days).finally(() => setLoading(false))
  }, [isFree, selectedPeriod, fetchReport])

  const onRefresh = async () => {
    if (isFree) return
    setRefreshing(true)
    await fetchReport(PERIODS[selectedPeriod].days)
    setRefreshing(false)
  }

  const changePeriod = (idx) => {
    if (isFree) return
    setSelectedPeriod(idx)
    setLoading(true)
    fetchReport(PERIODS[idx].days).finally(() => setLoading(false))
  }

  if (isFree) return <ProGateView />

  const r = report ?? MOCK_REPORT
  const maxChannelRevenue = Math.max(...(r.channels ?? []).map(c => c.revenue), 1)

  return (
    <ScrollView
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Bộ lọc kỳ báo cáo */}
      <View style={s.periodRow}>
        {PERIODS.map((p, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => changePeriod(i)}
            style={[s.periodBtn, selectedPeriod === i && s.periodBtnActive]}
          >
            <Text style={[s.periodBtnText, selectedPeriod === i && s.periodBtnTextActive]}>
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
          {/* ── KPI Cards ─────────────────────────────────────────────────── */}
          <View style={s.kpiGrid}>
            {[
              { label: 'Doanh thu',  value: `₫${formatMoney(r.totalRevenue)}`, emoji: '💰', sub: r.revenueTrend !== 0 ? `${r.revenueTrend > 0 ? '▲' : '▼'} ${Math.abs(r.revenueTrend).toFixed(1)}%` : null },
              { label: 'Đơn hàng',  value: String(r.totalOrders),   emoji: '🛒'  },
              { label: 'Khách hàng',value: String(r.totalCustomers), emoji: '👤'  },
              { label: 'Lợi nhuận', value: `₫${formatMoney(r.totalProfit)}`,  emoji: '📈'  },
            ].map((kpi, i) => (
              <View key={i} style={s.kpiCard}>
                <Text style={s.kpiEmoji}>{kpi.emoji}</Text>
                <Text style={s.kpiLabel}>{kpi.label}</Text>
                <Text style={s.kpiValue}>{kpi.value}</Text>
                {kpi.sub && (
                  <Text style={[s.kpiSub, { color: r.revenueTrend >= 0 ? '#4ae176' : colors.error }]}>
                    {kpi.sub}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* ── Doanh thu theo kênh ──────────────────────────────────────── */}
          {r.channels?.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>DOANH THU THEO KÊNH</Text>
              {r.channels.map((c, i) => (
                <View key={i} style={{ marginBottom: i < r.channels.length - 1 ? 14 : 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                    <Text style={s.channelName}>{c.name}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.channelRevenue}>₫{formatMoney(c.revenue)}</Text>
                      <Text style={s.channelOrders}>{c.orders} đơn</Text>
                    </View>
                  </View>
                  <View style={s.barBg}>
                    <View
                      style={[
                        s.barFill,
                        {
                          width: `${Math.round((c.revenue / maxChannelRevenue) * 100)}%`,
                          backgroundColor: c.color ?? colors.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Top 5 sản phẩm ───────────────────────────────────────────── */}
          {r.topProducts?.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>TOP 5 SẢN PHẨM</Text>
              {r.topProducts.map((p, i) => (
                <View key={i} style={[s.productRow, i > 0 && s.productRowBorder]}>
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

          {/* ── Link đến Danh sách khách hàng ───────────────────────────── */}
          <TouchableOpacity
            style={s.customerLink}
            onPress={() => navigation?.navigate('Customers')}
            activeOpacity={0.8}
          >
            <Text style={s.customerLinkText}>👥 Xem danh sách khách hàng & RFM →</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { paddingVertical: 60, alignItems: 'center' },

  // Period selector
  periodRow: {
    flexDirection: 'row', padding: 12, paddingBottom: 6, gap: 8,
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center',
  },
  periodBtnActive:     { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  periodBtnText:       { fontSize: 13, color: colors.outline },
  periodBtnTextActive: { color: colors.surface, fontWeight: '700' },

  mockBanner: {
    marginHorizontal: 12, marginBottom: 4,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  kpiCard: {
    width: '47%', margin: '1.5%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 14,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  kpiEmoji: { fontSize: 22, marginBottom: 8 },
  kpiLabel: { fontSize: 11, color: colors.outline },
  kpiValue: { fontSize: 17, fontWeight: '700', color: colors.onSurface, marginTop: 2 },
  kpiSub:   { fontSize: 11, marginTop: 4, fontWeight: '600' },

  // Sections
  section: {
    backgroundColor: '#1F2937',
    borderRadius: radius.md, margin: 12, marginTop: 0, padding: 16,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9CA3AF',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14,
  },
  channelName:    { fontSize: 13, color: '#F9FAFB', fontWeight: '600' },
  channelRevenue: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  channelOrders:  { fontSize: 11, color: '#9CA3AF' },
  barBg:   { height: 6, backgroundColor: '#374151', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },

  // Top products
  productRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  productRowBorder: { borderTopWidth: 1, borderTopColor: '#374151' },
  productRank:      { fontSize: 18, width: 30 },
  productName:      { fontSize: 13, color: '#F9FAFB', fontWeight: '600' },
  productOrders:    { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  productRevenue:   { fontSize: 13, color: colors.primary, fontWeight: '700' },

  // Customers link card
  customerLink: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, margin: 12, marginTop: 0,
    padding: 14, borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center',
  },
  customerLinkText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // Pro gate
  proGate: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, backgroundColor: colors.surface,
  },
  proGateIcon:  { fontSize: 56, marginBottom: 20 },
  proGateTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginBottom: 12, textAlign: 'center' },
  proGateDesc:  { fontSize: 14, color: colors.outline, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  proFeatureList: { alignSelf: 'stretch', marginBottom: 28 },
  proFeatureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  proFeatureCheck:{ fontSize: 15, color: '#4ae176', marginRight: 10, fontWeight: '700' },
  proFeatureText: { fontSize: 14, color: colors.onSurface },
  upgradeBtn: {
    backgroundColor: '#4ae176',
    borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 24,
    alignSelf: 'stretch', alignItems: 'center',
  },
  upgradeBtnText: { color: '#0a1a0f', fontSize: 14, fontWeight: '700' },
})
