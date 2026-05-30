import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import api from '../api/axios'
import { usePlan } from '../hooks/usePermission'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'

function formatMoney(v) {
  if (v == null || !Number.isFinite(Number(v))) return '0'
  const n = Number(v)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('vi-VN')
}

const CHANNEL_COLORS = {
  Shopee: '#EE4D2D', TikTok: '#2DD4BF', Lazada: '#0F3DD1',
  Facebook: '#1877F2', Website: '#6366F1', Zalo: '#0068FF',
}

const PERIODS = [
  { label: '7 ngày',  days: 7  },
  { label: '30 ngày', days: 30 },
  { label: '90 ngày', days: 90 },
]

const MOCK_CURRENT = {
  totalRevenue: 845_200_000, totalOrders: 312,
  totalCustomers: 89,        totalProfit: 253_560_000,
  channels: [
    { name: 'Shopee',   revenue: 310_000_000, orders: 115, color: '#EE4D2D' },
    { name: 'TikTok',   revenue: 245_000_000, orders: 87,  color: '#69C9D0' },
    { name: 'Lazada',   revenue: 178_000_000, orders: 63,  color: '#0F146D' },
    { name: 'Facebook', revenue: 92_000_000,  orders: 34,  color: '#1877F2' },
    { name: 'Website',  revenue: 20_200_000,  orders: 13,  color: '#4AE176' },
  ],
  topProducts: [
    { name: 'Áo thun Unisex oversize', revenue: 125_000_000, orders: 48 },
    { name: 'Quần jogger cotton',       revenue: 98_000_000,  orders: 37 },
    { name: 'Váy hoa midi',            revenue: 76_000_000,  orders: 29 },
    { name: 'Áo khoác dù',            revenue: 65_000_000,  orders: 24 },
    { name: 'Giày sneaker trắng',       revenue: 52_000_000,  orders: 19 },
  ],
}

const MOCK_PREV = {
  totalRevenue: 732_800_000, totalOrders: 288,
  totalCustomers: 74,        totalProfit: 219_840_000,
}

function delta(cur, prev) {
  if (!prev || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

function ProGateView({ s }) {
  return (
    <View style={s.proGate}>
      <Text style={s.proGateIcon}>📊</Text>
      <Text style={s.proGateTitle}>Tính năng dành cho gói Pro</Text>
      <Text style={s.proGateDesc}>
        Báo cáo so sánh kỳ, phân tích theo kênh và sản phẩm top chỉ khả dụng với gói{' '}
        <Text style={{ color: '#4ae176', fontWeight: '700' }}>Pro</Text> trở lên.
      </Text>
      <View style={s.proFeatureList}>
        {[
          'So sánh kỳ này vs kỳ trước (7/30/90 ngày)',
          'Tỷ trọng doanh thu theo kênh bán hàng',
          'Top 5 sản phẩm bán chạy với % tổng doanh thu',
          'Tăng trưởng doanh thu, đơn hàng, lợi nhuận',
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

// So sánh 1 chỉ số: giá trị kỳ này, kỳ trước, % tăng trưởng
function CompareRow({ label, emoji, curVal, prevVal, formatFn, colors }) {
  const d    = delta(curVal, prevVal)
  const isUp = d !== null && d >= 0
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                   borderBottomWidth: 1, borderBottomColor: colors.outlineVariant }}>
      <Text style={{ fontSize: 18, width: 32 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: colors.onSurface, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 11, color: colors.outline, marginTop: 2 }}>
          Kỳ trước: {formatFn(prevVal)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.onSurface }}>
          {formatFn(curVal)}
        </Text>
        {d !== null && (
          <Text style={{ fontSize: 12, fontWeight: '700',
                         color: isUp ? '#4ae176' : '#ef4444', marginTop: 2 }}>
            {isUp ? '▲' : '▼'} {Math.abs(d).toFixed(1)}%
          </Text>
        )}
      </View>
    </View>
  )
}

export default function QuickReportScreen({ navigation }) {
  const { isFree } = usePlan()
  const { colors } = useTheme()
  const s          = useMemo(() => makeStyles(colors), [colors])

  const [selectedPeriod, setSelectedPeriod] = useState(1)
  const [current,  setCurrent]  = useState(null)
  const [prev,     setPrev]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isMock,   setIsMock]   = useState(false)

  const fetchReport = useCallback(async (days) => {
    try {
      const to      = new Date()
      const fromCur = new Date(Date.now() - days * 86_400_000)
      const fromPrv = new Date(Date.now() - days * 2 * 86_400_000)

      const [resCur, resPrv] = await Promise.all([
        api.get('/api/dashboard', {
          params: { from: fromCur.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
        }),
        api.get('/api/dashboard', {
          params: {
            from: fromPrv.toISOString().slice(0, 10),
            to:   fromCur.toISOString().slice(0, 10),
          },
        }),
      ])

      const rawCur = resCur.data?.data ?? resCur.data
      const rawPrv = resPrv.data?.data ?? resPrv.data
      const kpiCur = rawCur?.kpi ?? rawCur
      const kpiPrv = rawPrv?.kpi ?? rawPrv

      // Map channels: backend trả về revenueByChannel với field channelName
      const channels = (rawCur?.revenueByChannel ?? rawCur?.channels ?? []).map(c => ({
        name:    c.channelName ?? c.name ?? '',
        revenue: c.revenue     ?? 0,
        orders:  c.orders      ?? 0,
        color:   CHANNEL_COLORS[c.channelName ?? c.name] ?? '#adc6ff',
      }))

      // Map topProducts: backend trả về productName, giới hạn 5
      const topProducts = (rawCur?.topProducts ?? []).slice(0, 5).map(p => ({
        name:    p.productName ?? p.name ?? 'Sản phẩm',
        orders:  p.totalOrders ?? p.qtySold ?? p.orders ?? 0,
        revenue: p.revenue     ?? 0,
      }))

      setCurrent({
        totalRevenue:   kpiCur?.totalRevenue   ?? MOCK_CURRENT.totalRevenue,
        totalOrders:    kpiCur?.totalOrders    ?? MOCK_CURRENT.totalOrders,
        totalCustomers: kpiCur?.newCustomers   ?? MOCK_CURRENT.totalCustomers,
        totalProfit:    kpiCur?.totalProfit    ?? MOCK_CURRENT.totalProfit,
        channels:       channels.length > 0   ? channels    : MOCK_CURRENT.channels,
        topProducts:    topProducts.length > 0 ? topProducts : MOCK_CURRENT.topProducts,
      })
      setPrev({
        totalRevenue:   kpiPrv?.totalRevenue   ?? MOCK_PREV.totalRevenue,
        totalOrders:    kpiPrv?.totalOrders    ?? MOCK_PREV.totalOrders,
        totalCustomers: kpiPrv?.newCustomers   ?? MOCK_PREV.totalCustomers,
        totalProfit:    kpiPrv?.totalProfit    ?? MOCK_PREV.totalProfit,
      })
      setIsMock(false)
    } catch {
      setCurrent(MOCK_CURRENT)
      setPrev(MOCK_PREV)
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

  if (isFree) return <ProGateView s={s} />

  const cur = current ?? MOCK_CURRENT
  const prv = prev    ?? MOCK_PREV

  // Tính tổng doanh thu để tính % tỷ trọng kênh
  const totalChannelRevenue = (cur.channels ?? []).reduce((s, c) => s + c.revenue, 0) || 1
  const totalProductRevenue = (cur.topProducts ?? []).reduce((s, p) => s + p.revenue, 0) || 1

  return (
    <ScrollView
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* ── Bộ lọc kỳ ── */}
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
          {/* ── Section 1: So sánh kỳ này vs kỳ trước ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>
              SO SÁNH KỲ NÀY VS KỲ TRƯỚC ({PERIODS[selectedPeriod].label})
            </Text>
            <CompareRow
              label="Doanh thu" emoji="💰"
              curVal={cur.totalRevenue}  prevVal={prv.totalRevenue}
              formatFn={v => `₫${formatMoney(v)}`} colors={colors}
            />
            <CompareRow
              label="Đơn hàng" emoji="🛒"
              curVal={cur.totalOrders}   prevVal={prv.totalOrders}
              formatFn={v => String(v)}  colors={colors}
            />
            <CompareRow
              label="Khách hàng mới" emoji="👤"
              curVal={cur.totalCustomers} prevVal={prv.totalCustomers}
              formatFn={v => String(v)}   colors={colors}
            />
            <CompareRow
              label="Lợi nhuận" emoji="📈"
              curVal={cur.totalProfit}   prevVal={prv.totalProfit}
              formatFn={v => `₫${formatMoney(v)}`} colors={colors}
            />
          </View>

          {/* ── Section 2: Tỷ trọng doanh thu theo kênh ── */}
          {(cur.channels?.length ?? 0) > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>TỶ TRỌNG THEO KÊNH</Text>
              {cur.channels.map((ch, i) => {
                const pct = Math.round((ch.revenue / totalChannelRevenue) * 100)
                return (
                  <View key={i} style={{ marginBottom: i < cur.channels.length - 1 ? 14 : 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={s.channelName}>{ch.name}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.channelRevenue}>₫{formatMoney(ch.revenue)}</Text>
                        <Text style={s.channelPct}>{pct}% tổng · {ch.orders} đơn</Text>
                      </View>
                    </View>
                    <View style={s.barBg}>
                      <View
                        style={[s.barFill, {
                          width: `${pct}%`,
                          backgroundColor: ch.color ?? colors.primary,
                        }]}
                      />
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* ── Section 3: Top 5 sản phẩm với % tổng doanh thu ── */}
          {(cur.topProducts?.length ?? 0) > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>TOP 5 SẢN PHẨM TRONG KỲ</Text>
              {cur.topProducts.map((p, i) => {
                const pct = ((p.revenue / totalProductRevenue) * 100).toFixed(1)
                return (
                  <View key={i} style={[s.productRow, i > 0 && s.productRowBorder]}>
                    <Text style={s.productRank}>
                      {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                    </Text>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={s.productName} numberOfLines={1}>{p.name}</Text>
                      <Text style={s.productOrders}>{p.orders} đơn · {pct}% tổng DT</Text>
                    </View>
                    <Text style={s.productRevenue}>₫{formatMoney(p.revenue)}</Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* ── Link đến danh sách khách hàng ── */}
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

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  center:    { paddingVertical: 60, alignItems: 'center' },

  periodRow: { flexDirection: 'row', padding: 12, paddingBottom: 6, gap: 8 },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: c.outlineVariant, alignItems: 'center',
  },
  periodBtnActive:     { backgroundColor: c.primaryContainer, borderColor: c.primary },
  periodBtnText:       { fontSize: 13, color: c.outline },
  periodBtnTextActive: { color: c.surface, fontWeight: '700' },

  mockBanner: {
    marginHorizontal: 12, marginBottom: 4,
    backgroundColor: 'rgba(255,180,0,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 8,
  },
  mockBannerText: { color: '#ffb400', fontSize: 11, textAlign: 'center' },

  section: {
    backgroundColor: c.card ?? c.surfaceContainerLow,
    borderRadius: radius.md, margin: 12, marginTop: 8, padding: 16,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: c.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },

  channelName:    { fontSize: 13, color: c.onSurface, fontWeight: '600' },
  channelRevenue: { fontSize: 13, color: c.primary, fontWeight: '700' },
  channelPct:     { fontSize: 11, color: c.outline, marginTop: 2 },
  barBg:   { height: 6, backgroundColor: c.outlineVariant, borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },

  productRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  productRowBorder: { borderTopWidth: 1, borderTopColor: c.outlineVariant },
  productRank:      { fontSize: 18, width: 30 },
  productName:      { fontSize: 13, color: c.onSurface, fontWeight: '600' },
  productOrders:    { fontSize: 11, color: c.outline, marginTop: 2 },
  productRevenue:   { fontSize: 13, color: c.primary, fontWeight: '700' },

  customerLink: {
    backgroundColor: c.surfaceContainerLow ?? c.surface,
    borderRadius: radius.md, margin: 12, marginTop: 0,
    padding: 14, borderWidth: 1, borderColor: c.outlineVariant,
    alignItems: 'center',
  },
  customerLinkText: { fontSize: 14, color: c.primary, fontWeight: '600' },

  proGate:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.surface },
  proGateIcon:  { fontSize: 56, marginBottom: 20 },
  proGateTitle: { fontSize: 18, fontWeight: '700', color: c.onSurface, marginBottom: 12, textAlign: 'center' },
  proGateDesc:  { fontSize: 14, color: c.outline, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  proFeatureList: { alignSelf: 'stretch', marginBottom: 28 },
  proFeatureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  proFeatureCheck:{ fontSize: 15, color: '#4ae176', marginRight: 10, fontWeight: '700' },
  proFeatureText: { fontSize: 14, color: c.onSurface },
  upgradeBtn: {
    backgroundColor: '#4ae176', borderRadius: radius.md,
    paddingVertical: 14, paddingHorizontal: 24,
    alignSelf: 'stretch', alignItems: 'center',
  },
  upgradeBtnText: { color: '#0a1a0f', fontSize: 14, fontWeight: '700' },
})
