import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, Animated, Image,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  Dimensions,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import api from '../api/axios'
import { radius } from '../components/theme'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:5136'

// ─── react-native-svg KHÔNG có trong package.json → dùng bảng fallback ───────
// TODO: cài react-native-svg nếu muốn dùng line chart SVG thật

// ─── Hàm format tiền tệ rút gọn cho mobile ───────────────────────────────────
function formatMoney(value) {
  if (value == null || isNaN(value)) return '0'
  const n = Number(value)
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} triệu`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString('vi-VN')
}

// ─── Mock data fallback khi API lỗi ──────────────────────────────────────────
const MOCK_KPI = {
  todayRevenue:              125_400_000,
  todayRevenueVsYesterday:   12.5,
  todayOrders:               47,
  todayOrdersVsYesterday:    -3.2,
  newCustomers:              8,
  newCustomersVsYesterday:   25.0,
  todayProfit:               38_700_000,
  todayProfitVsYesterday:    8.1,
}

const MOCK_TREND = [
  { label: 'T2', value: 95_000_000 },
  { label: 'T3', value: 110_000_000 },
  { label: 'T4', value: 88_000_000 },
  { label: 'T5', value: 132_000_000 },
  { label: 'T6', value: 145_000_000 },
  { label: 'T7', value: 98_000_000 },
  { label: 'CN', value: 125_400_000 },
]

const MOCK_TOP_PRODUCTS = [
  { name: 'Áo thun Unisex',       channel: 'Shopee',   revenue: 45_200_000 },
  { name: 'Quần jogger cotton',    channel: 'TikTok',   revenue: 38_900_000 },
  { name: 'Váy hoa midi',          channel: 'Lazada',   revenue: 31_500_000 },
  { name: 'Áo khoác dù unisex',   channel: 'Facebook', revenue: 27_100_000 },
  { name: 'Giày sneaker trắng',   channel: 'Website',  revenue: 19_800_000 },
]

const MOCK_CHANNEL_REVENUE = [
  { channel: 'Shopee',   revenue: 45_000_000, color: '#EE4D2D' },
  { channel: 'Lazada',   revenue: 28_000_000, color: '#0F3DD1' },
  { channel: 'TikTok',   revenue: 22_000_000, color: '#2DD4BF' },
  { channel: 'Facebook', revenue: 18_000_000, color: '#1877F2' },
  { channel: 'Website',  revenue: 12_000_000, color: '#6366F1' },
]

const MOCK_ALERTS = [
  { title: 'Tồn kho thấp',              body: 'Áo thun S sắp hết (còn 3)',           type: 'warning' },
  { title: 'Doanh thu giảm bất thường', body: 'Kênh Lazada giảm 23% hôm nay',        type: 'error'   },
]

// ─── Quick period presets cho date filter ────────────────────────────────────
const PERIOD_PRESETS = [
  { key: 'today', label: 'Hôm nay', offsetDays: 0,    trendDays: 7  },
  { key: '7d',    label: '7 ngày',  offsetDays: 6,    trendDays: 7  },
  { key: '30d',   label: '30 ngày', offsetDays: 29,   trendDays: 30 },
  { key: '90d',   label: '90 ngày', offsetDays: 89,   trendDays: 90 },
  { key: 'all',   label: 'Tất cả',  offsetDays: null, trendDays: 90 },
]

function isoDate(d) { return d.toISOString().slice(0, 10) }
function todayStr()  { return isoDate(new Date()) }
function getPeriodRange(periodKey) {
  const today = new Date()
  const todayS = isoDate(today)
  const preset = PERIOD_PRESETS.find(p => p.key === periodKey) ?? PERIOD_PRESETS[0]
  if (preset.offsetDays === null) return { from: '2020-01-01', to: todayS }
  if (preset.offsetDays === 0)   return { from: todayS, to: todayS }
  const fromD = new Date(today)
  fromD.setDate(today.getDate() - preset.offsetDays)
  return { from: isoDate(fromD), to: todayS }
}

// ─── Màu brand chuẩn theo kênh (nhất quán với web) ──────────────────────────
// Quy tắc: dùng màu chính thức của từng sàn, đủ sáng để đọc được trên nền tối
const CHANNEL_COLORS = {
  Shopee:   '#EE4D2D', // cam-đỏ chính thức Shopee
  TikTok:   '#2DD4BF', // teal — đọc được cả light+dark
  Lazada:   '#0F3DD1', // xanh dương Lazada
  Facebook: '#1877F2', // xanh Facebook
  Website:  '#6366F1', // indigo — brand hệ thống
  Zalo:     '#0068FF', // xanh Zalo
}
function channelColor(ch = '') {
  return CHANNEL_COLORS[ch] ?? '#adc6ff'
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────
function Skeleton({ width = '100%', height = 16, style, bgColor }) {
  const anim = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [anim])
  return (
    <Animated.View
      style={[
        {
          width, height,
          backgroundColor: bgColor ?? '#1c2b3c',
          borderRadius: radius.sm,
          opacity: anim,
        },
        style,
      ]}
    />
  )
}

// ─── Tách chuỗi tiền tệ thành số và đơn vị để render khác kích thước ─────────
// "125.4 triệu" → { num: "125.4", unit: "triệu" }
// "1.2 tỷ"      → { num: "1.2",   unit: "tỷ"    }
// "500K"         → { num: "500",   unit: "K"     }
// "125"          → { num: "125",   unit: ""      }
function splitMoneyStr(str) {
  const s = String(str ?? '').trim()
  const m = s.match(/^([\d,\.]+)\s*(triệu|tỷ|K|ng)?$/)
  if (!m) return { num: s, unit: '' }
  return { num: m[1], unit: m[2] ?? '' }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, pct, emoji, valueColor, colors }) {
  const isUp   = pct > 0
  const isDown = pct < 0
  const { num, unit } = splitMoneyStr(value)
  return (
    <View style={[s.kpiCard, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
      <Text style={s.kpiEmoji}>{emoji}</Text>
      <Text style={[s.kpiLabel, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[s.kpiValue, { color: valueColor ?? colors.onSurface }]}>
        ₫{num}
        {unit ? <Text style={[s.kpiUnit, { color: colors.onSurfaceVariant }]}> {unit}</Text> : null}
      </Text>
      {pct !== undefined && pct !== null && (
        <Text style={[s.kpiTrend, isUp ? { color: colors.success } : isDown ? { color: colors.danger } : { color: colors.outline }]}>
          {isUp ? '▲' : isDown ? '▼' : '–'} {Math.abs(pct).toFixed(1)}%
        </Text>
      )}
    </View>
  )
}

function KpiCardCount({ label, value, pct, emoji, colors }) {
  const isUp   = pct > 0
  const isDown = pct < 0
  return (
    <View style={[s.kpiCard, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
      <Text style={s.kpiEmoji}>{emoji}</Text>
      <Text style={[s.kpiLabel, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[s.kpiValue, { color: colors.onSurface }]}>{String(value ?? 0)}</Text>
      {pct !== undefined && pct !== null && (
        <Text style={[s.kpiTrend, isUp ? { color: colors.success } : isDown ? { color: colors.danger } : { color: colors.outline }]}>
          {isUp ? '▲' : isDown ? '▼' : '–'} {Math.abs(pct).toFixed(1)}%
        </Text>
      )}
    </View>
  )
}

// ─── Skeleton Dashboard ───────────────────────────────────────────────────────
function DashboardSkeleton() {
  const { colors } = useTheme()
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} scrollEnabled={false}>
      {/* Skeleton header */}
      <View style={{ padding: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: colors.surfaceContainerLow, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceContainerHigh, marginRight: 10 }} />
        <View>
          <Skeleton width={100} height={12} bgColor={colors.surfaceContainerHigh} style={{ marginBottom: 6 }} />
          <Skeleton width={160} height={18} bgColor={colors.surfaceContainerHigh} style={{ marginBottom: 4 }} />
          <Skeleton width={120} height={11} bgColor={colors.surfaceContainerHigh} />
        </View>
      </View>
      <View style={{ marginHorizontal: 16, height: 8 }} />
      {/* KPI grid skeleton */}
      <View style={s.kpiGrid}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[s.kpiCard, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, gap: 8 }]}>
            <Skeleton width={28} height={28} bgColor={colors.surfaceContainerHigh} style={{ borderRadius: 14 }} />
            <Skeleton width={70} height={12} bgColor={colors.surfaceContainerHigh} />
            <Skeleton width={90} height={22} bgColor={colors.surfaceContainerHigh} />
            <Skeleton width={50} height={12} bgColor={colors.surfaceContainerHigh} />
          </View>
        ))}
      </View>
      {/* Trend skeleton */}
      <Skeleton width='92%' height={13} bgColor={colors.surfaceContainerHigh} style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 10 }} />
      <View style={{ height: 110, marginHorizontal: 16, borderRadius: 12, backgroundColor: colors.surfaceContainerLow }} />
      {/* Top products skeleton */}
      <Skeleton width='92%' height={13} bgColor={colors.surfaceContainerHigh} style={{ marginHorizontal: 16, marginTop: 20, marginBottom: 10 }} />
      <View style={{ marginHorizontal: 16, borderRadius: 12, backgroundColor: colors.surfaceContainerLow, padding: 12 }}>
        {[0,1,2,3,4].map(i => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.outlineVariant }}>
            <Skeleton width={20} height={14} bgColor={colors.surfaceContainerHigh} />
            <View style={{ flex: 1, marginHorizontal: 10, gap: 6 }}>
              <Skeleton width='80%' height={14} bgColor={colors.surfaceContainerHigh} />
              <Skeleton width={60} height={11} bgColor={colors.surfaceContainerHigh} />
            </View>
            <Skeleton width={60} height={14} bgColor={colors.surfaceContainerHigh} />
          </View>
        ))}
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

// ─── AI Insights mock fallback ────────────────────────────────────────────────
const MOCK_INSIGHTS = [
  { type: 'anomaly', level: 'warning', text: 'Doanh thu kênh TikTok giảm 23% so với tuần trước.' },
  { type: 'churn',   level: 'alert',   text: '12 khách hàng VIP chưa mua hàng trong 30 ngày.' },
  { type: 'trend',   level: 'info',    text: 'Xu hướng tăng trưởng Shopee +15% trong 7 ngày qua.' },
  { type: 'stock',   level: 'warning', text: '3 sản phẩm sắp hết hàng dưới mức tối thiểu.' },
]

const INSIGHT_CONFIG = {
  anomaly: { emoji: '📉', color: '#EF4444', bg: 'rgba(239,68,68,0.12)',    navigate: 'ForecastTab' },
  churn:   { emoji: '⚠️', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',   navigate: 'Alerts'      },
  trend:   { emoji: '📈', color: '#4AE176', bg: 'rgba(74,225,118,0.12)',   navigate: null          },
  stock:   { emoji: '🏭', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',   navigate: null          },
  info:    { emoji: '💡', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',   navigate: null          },
}

const LEVEL_BADGE = {
  alert:   { label: 'Cảnh báo',  color: '#EF4444', bg: 'rgba(239,68,68,0.2)'  },
  warning: { label: 'Chú ý',     color: '#F59E0B', bg: 'rgba(245,158,11,0.2)' },
  info:    { label: 'Thông tin', color: '#60A5FA', bg: 'rgba(96,165,250,0.2)' },
}

// Mapping role → màu badge
const ROLE_COLORS = {
  Owner:   { color: '#FFD700', bg: 'rgba(255,215,0,0.2)',    label: 'Chủ DN'   },
  Manager: { color: '#A78BFA', bg: 'rgba(167,139,250,0.2)',  label: 'Quản lý'  },
  Staff:   { color: '#4AE176', bg: 'rgba(74,225,118,0.2)',   label: 'Nhân viên'},
  DataIT:  { color: '#60A5FA', bg: 'rgba(96,165,250,0.2)',   label: 'Data/IT'  },
  Viewer:  { color: '#9CA3AF', bg: 'rgba(156,163,175,0.2)',  label: 'Xem'      },
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth()
  const { colors, isDark } = useTheme()

  // ── State riêng cho từng section ──────────────────────────────────────────
  const [kpi,            setKpi]            = useState(null)
  const [revenueTrend,   setRevenueTrend]   = useState([])
  const [topProducts,    setTopProducts]    = useState([])
  const [channelRevenue, setChannelRevenue] = useState([])
  const [alerts,         setAlerts]         = useState([])
  const [aiInsights,     setAiInsights]     = useState([])

  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)
  const [isMock,         setIsMock]         = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('today')
  const [avatarUrl,      setAvatarUrl]      = useState(null)
  const [avatarError,    setAvatarError]    = useState(false)

  // ── Fetch KPI theo khoảng thời gian ──────────────────────────────────────────
  // isToday=true → dùng today-vs-yesterday để hiện % so hôm qua
  // isToday=false → dùng /api/dashboard với {from, to} → hiện % so kỳ trước từ backend
  const fetchKpi = async (from, to, isToday) => {
    if (isToday) {
      // Attempt 1: endpoint so sánh hôm nay vs hôm qua
      try {
        const res = await api.get('/api/dashboard/today-vs-yesterday')
        const raw = res.data?.data ?? res.data
        return {
          data: {
            todayRevenue:            raw?.today?.revenue       ?? 0,
            todayRevenueVsYesterday: raw?.revenuePct           ?? 0,
            todayOrders:             raw?.today?.orders        ?? 0,
            todayOrdersVsYesterday:  raw?.ordersPct            ?? 0,
            newCustomers:            raw?.today?.newCustomers  ?? 0,
            newCustomersVsYesterday: raw?.customersPct         ?? 0,
            todayProfit:             raw?.today?.profit        ?? 0,
            todayProfitVsYesterday:  raw?.revenuePct           ?? 0,
          },
          mock: false,
        }
      } catch { /* tiếp tục fallback */ }
    }

    // Fallback / non-today: /api/dashboard với date range
    try {
      const res = await api.get('/api/dashboard', { params: { from, to } })
      const raw = res.data?.data ?? res.data
      const kpi = raw?.kpi ?? raw
      return {
        data: {
          todayRevenue:            kpi?.totalRevenue       ?? 0,
          todayRevenueVsYesterday: kpi?.revenueGrowthPct   ?? 0,
          todayOrders:             kpi?.totalOrders         ?? 0,
          todayOrdersVsYesterday:  kpi?.ordersGrowthPct     ?? 0,
          newCustomers:            kpi?.newCustomers         ?? 0,
          newCustomersVsYesterday: kpi?.customersGrowthPct  ?? 0,
          todayProfit:             kpi?.totalProfit          ?? 0,
          todayProfitVsYesterday:  kpi?.revenueGrowthPct    ?? 0,
        },
        mock: false,
      }
    } catch {
      return { data: MOCK_KPI, mock: true }
    }
  }

  // ── Fetch xu hướng doanh thu theo số ngày chọn ───────────────────────────
  const fetchRevenueTrend = async (trendDays = 7) => {
    try {
      const res  = await api.get('/api/dashboard/revenue-trend', { params: { days: trendDays } })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.trend ?? raw?.data ?? [])
      // Chuẩn hóa sang {label, value}
      const normalized = list.map((v, i) => {
        if (typeof v === 'number') return { label: ['T2','T3','T4','T5','T6','T7','CN'][i] ?? `N${i+1}`, value: v }
        return {
          label: v.label ?? v.date ?? ['T2','T3','T4','T5','T6','T7','CN'][i] ?? `N${i+1}`,
          value: v.value ?? v.revenue ?? 0,
        }
      })
      return normalized.length ? normalized : MOCK_TREND
    } catch {
      // TODO: endpoint /api/dashboard/revenue-trend chưa có — dùng mock
      return MOCK_TREND
    }
  }

  // ── Fetch top 5 sản phẩm bán chạy ────────────────────────────────────────
  const fetchTopProducts = async (from, to) => {
    try {
      const res  = await api.get('/api/dashboard/top-products', { params: { limit: 5, from, to } })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.products ?? raw?.items ?? [])
      const normalized = list.slice(0, 5).map(p => ({
        name:    p.name ?? p.productName ?? p.product_name ?? 'Sản phẩm',
        channel: p.channel ?? p.channelName ?? '',
        revenue: p.revenue ?? p.totalRevenue ?? p.total_revenue ?? 0,
      }))
      return normalized.length ? normalized : MOCK_TOP_PRODUCTS
    } catch {
      // TODO: endpoint /api/dashboard/top-products chưa có — dùng mock
      return MOCK_TOP_PRODUCTS
    }
  }

  // ── Fetch doanh thu theo kênh ─────────────────────────────────────────────
  const fetchChannelRevenue = async (from, to) => {
    try {
      const res  = await api.get('/api/dashboard/channel-revenue', { params: { from, to } })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.channels ?? raw?.items ?? [])
      const normalized = list.map(c => ({
        channel: c.channel ?? c.name ?? c.channelName ?? 'Kênh',
        revenue: c.revenue ?? c.totalRevenue ?? 0,
        color:   c.color ?? channelColor(c.channel ?? c.name ?? ''),
      }))
      return normalized.length ? normalized : MOCK_CHANNEL_REVENUE
    } catch {
      // TODO: endpoint /api/dashboard/channel-revenue chưa có — dùng mock
      return MOCK_CHANNEL_REVENUE
    }
  }

  // ── Fetch cảnh báo nhanh ──────────────────────────────────────────────────
  const fetchAlerts = async () => {
    try {
      const res  = await api.get('/api/notifications', { params: { category: 'alert', limit: 3 } })
      const raw  = res.data?.data ?? res.data
      const list = Array.isArray(raw) ? raw : (raw?.notifications ?? raw?.items ?? [])
      return list.slice(0, 3).map(a => ({
        title: a.title ?? a.subject ?? 'Cảnh báo',
        body:  a.body  ?? a.message ?? a.content ?? '',
        type:  a.type  ?? a.severity ?? 'warning',
      }))
    } catch {
      // TODO: endpoint /api/notifications?category=alert chưa kiểm tra — dùng mock
      return MOCK_ALERTS
    }
  }

  // ── Fetch AI Insights ─────────────────────────────────────────────────────
  const fetchInsights = async () => {
    try {
      const res  = await api.get('/api/ai/insights')
      const raw  = res.data?.data ?? res.data
      // Thử nhiều cấu trúc dữ liệu khác nhau từ AI service
      const list = Array.isArray(raw)
        ? raw
        : (raw?.insights ?? raw?.items ?? raw?.recommendations ?? raw?.anomalies ?? [])
      const result = list.slice(0, 4).map(ins => ({
        type:  ins.type   ?? ins.category ?? 'info',
        level: ins.level  ?? ins.severity ?? ins.priority ?? 'info',
        text:  ins.text   ?? ins.message  ?? ins.description ?? ins.content ?? '',
      })).filter(ins => ins.text.trim())
      // Nếu API không trả về gì hữu ích → dùng mock để màn hình không trống
      return result.length ? result : MOCK_INSIGHTS
    } catch {
      return MOCK_INSIGHTS
    }
  }

  // ── Tải song song tất cả sections bằng Promise.all ────────────────────────
  const loadData = async (periodKey = 'today') => {
    const { from, to } = getPeriodRange(periodKey)
    const isToday = periodKey === 'today'
    const preset  = PERIOD_PRESETS.find(p => p.key === periodKey) ?? PERIOD_PRESETS[0]

    const [kpiResult, trend, products, channels, alertList, insightList] = await Promise.all([
      fetchKpi(from, to, isToday),
      fetchRevenueTrend(preset.trendDays),
      fetchTopProducts(from, to),
      fetchChannelRevenue(from, to),
      fetchAlerts(),
      fetchInsights(),
    ])
    setKpi(kpiResult.data)
    setRevenueTrend(trend)
    setTopProducts(products)
    setChannelRevenue(channels)
    setAlerts(alertList)
    setAiInsights(insightList)
    setIsMock(kpiResult.mock)
  }

  useEffect(() => {
    setLoading(true)
    loadData(selectedPeriod).finally(() => setLoading(false))
  }, [selectedPeriod])

  // Fetch avatar từ profile (fire-and-forget, không block UI)
  useEffect(() => {
    api.get('/api/users/me')
      .then(res => {
        const raw = res.data?.data ?? res.data
        if (raw?.avatarUrl) setAvatarUrl(raw.avatarUrl)
      })
      .catch(() => {})
  }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadData(selectedPeriod)
    setRefreshing(false)
  }

  // Hiển thị skeleton khi loading lần đầu
  if (loading) return <DashboardSkeleton />

  const kpiData     = kpi ?? MOCK_KPI
  const maxChannel  = Math.max(...channelRevenue.map(c => c.revenue), 1)

  const cardBg     = isDark ? '#1F2937' : colors.surfaceContainerLow
  const cardBorder = isDark ? '#374151' : colors.outlineVariant
  const textMuted  = isDark ? '#9CA3AF' : colors.outline
  const textBright = isDark ? '#F9FAFB' : colors.onSurface

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.surface }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {(() => {
        const roleCfg     = ROLE_COLORS[user?.role] ?? { color: colors.secondary, bg: 'rgba(173,198,255,0.15)', label: user?.role ?? 'User' }
        const companyName = user?.companyName ?? user?.company ?? null
        const displayName = user?.fullName || user?.name || user?.username || 'Người dùng'
        const initials    = displayName.split(' ').filter(Boolean).slice(-2).map(w => w[0].toUpperCase()).join('')
        const avatarUri   = avatarUrl
          ? (avatarUrl.startsWith('http') ? avatarUrl : `${BASE_URL}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`)
          : null
        return (
          <View style={[s.header, { backgroundColor: colors.surfaceContainerLow, borderBottomColor: colors.outlineVariant }]}>
            {/* Avatar người dùng + thông tin */}
            <View style={s.headerLeft}>
              {/* Avatar: ảnh thật nếu có, fallback chữ cái */}
              {avatarUri && !avatarError ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={s.userAvatar}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <View style={[s.userAvatarFallback, { backgroundColor: colors.primaryContainer }]}>
                  <Text style={s.userAvatarText}>{initials}</Text>
                </View>
              )}
              <View>
                {companyName && (
                  <Text style={[s.companyName, { color: colors.outline }]} numberOfLines={1}>{companyName}</Text>
                )}
                <Text style={[s.greeting, { color: colors.onSurface }]} numberOfLines={1}>{displayName}</Text>
                <Text style={[s.dateText, { color: colors.outline }]}>
                  {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                </Text>
              </View>
            </View>
            {/* Actions bên phải */}
            <View style={s.headerRight}>
              {/* Badge role */}
              <View style={[s.roleBadge, { backgroundColor: roleCfg.bg }]}>
                <Text style={[s.roleBadgeText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
              </View>
              {/* Refresh */}
              <TouchableOpacity onPress={onRefresh} style={s.headerBtn} disabled={refreshing}>
                <Text style={{ fontSize: 18 }}>{refreshing ? '⏳' : '🔄'}</Text>
              </TouchableOpacity>
              {/* Notification */}
              <TouchableOpacity onPress={() => navigation?.navigate('Alerts')} style={s.headerBtn}>
                <Text style={{ fontSize: 18 }}>🔔</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })()}

      {/* ── Banner dữ liệu mẫu ──────────────────────────────────────────── */}
      {isMock && (
        <View style={s.mockBanner}>
          <Text style={s.mockBannerText}>⚠ Đang dùng dữ liệu mẫu — không kết nối được server</Text>
        </View>
      )}

      {/* ── Date range filter chips ──────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.periodBar}
        contentContainerStyle={s.periodBarContent}
      >
        {PERIOD_PRESETS.map(p => {
          const active = selectedPeriod === p.key
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setSelectedPeriod(p.key)}
              style={[
                s.periodChip,
                {
                  backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerLow,
                  borderColor: active ? colors.primary : colors.outlineVariant,
                },
              ]}
            >
              <Text style={[s.periodChipText, { color: active ? colors.primary : colors.onSurfaceVariant }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 1 — KPI Cards (4 card: Doanh thu, Đơn hàng, Khách mới, Lợi nhuận)
          ════════════════════════════════════════════════════════════════════ */}
      <Text style={[s.sectionLabel, { color: textMuted }]}>
        {selectedPeriod === 'today' ? 'KPI HÔM NAY'
          : `KPI ${PERIOD_PRESETS.find(p => p.key === selectedPeriod)?.label?.toUpperCase() ?? ''}`}
      </Text>
      <View style={s.kpiGrid}>
        <KpiCard
          label="Doanh thu"
          value={formatMoney(kpiData.todayRevenue)}
          pct={kpiData.todayRevenueVsYesterday}
          emoji="💰"
          colors={colors}
        />
        <KpiCardCount
          label="Đơn hàng"
          value={kpiData.todayOrders}
          pct={kpiData.todayOrdersVsYesterday}
          emoji="🛒"
          colors={colors}
        />
        <KpiCardCount
          label="Khách mới"
          value={kpiData.newCustomers}
          pct={kpiData.newCustomersVsYesterday}
          emoji="👤"
          colors={colors}
        />
        <KpiCard
          label="Lợi nhuận"
          value={formatMoney(kpiData.todayProfit)}
          pct={kpiData.todayProfitVsYesterday}
          emoji="📈"
          valueColor={kpiData.todayProfit >= 0 ? colors.success : colors.danger}
          colors={colors}
        />
      </View>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 — Xu hướng doanh thu 7 ngày
          react-native-svg chưa cài → hiện bảng 7 dòng thay cho line chart
          ════════════════════════════════════════════════════════════════════ */}
      {revenueTrend.length > 0 && (
        <View style={[s.darkCard, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
          <Text style={[s.darkCardLabel, { color: textMuted }]}>
            {`XU HƯỚNG DOANH THU ${(PERIOD_PRESETS.find(p => p.key === selectedPeriod)?.trendDays ?? 7)} NGÀY`}
          </Text>
          {/* Bảng fallback (thay cho SVG line chart — cài react-native-svg để nâng cấp) */}
          {revenueTrend.map((d, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderBottomWidth: i < revenueTrend.length - 1 ? 1 : 0,
                borderBottomColor: '#374151',
              }}
            >
              <Text style={{ color: textMuted, fontSize: 13, width: 36 }}>{d.label}</Text>
              <View style={{ flex: 1, justifyContent: 'center', marginHorizontal: 10 }}>
                <View style={{ height: 6, backgroundColor: cardBorder, borderRadius: 3 }}>
                  <View
                    style={{
                      height: 6,
                      width: `${Math.round((d.value / Math.max(...revenueTrend.map(x => x.value), 1)) * 100)}%`,
                      backgroundColor: i === revenueTrend.length - 1 ? colors.interactive : colors.interactive + '88',
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
              <Text style={{ color: textBright, fontSize: 13, textAlign: 'right', minWidth: 72 }}>
                ₫{formatMoney(d.value)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 3 — Top 5 sản phẩm bán chạy
          ════════════════════════════════════════════════════════════════════ */}
      {topProducts.length > 0 && (
        <View style={[s.darkCard, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
          <Text style={[s.darkCardLabel, { color: textMuted }]}>TOP 5 SẢN PHẨM</Text>
          {topProducts.map((p, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                borderBottomWidth: i < 4 ? 1 : 0,
                borderBottomColor: cardBorder,
              }}
            >
              <Text style={{ fontSize: 18, width: 30 }}>
                {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </Text>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ color: textBright, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={{ color: textMuted, fontSize: 12 }}>{p.channel}</Text>
              </View>
              <Text style={{ color: colors.interactive, fontWeight: '700', fontSize: 13 }}>
                ₫{formatMoney(p.revenue)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 — Doanh thu theo kênh (progress bar ngang)
          ════════════════════════════════════════════════════════════════════ */}
      {channelRevenue.length > 0 && (
        <View style={[s.darkCard, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
          <Text style={[s.darkCardLabel, { color: textMuted }]}>DOANH THU THEO KÊNH</Text>
          {channelRevenue.map((c, i) => (
            <View key={i} style={{ marginBottom: i < channelRevenue.length - 1 ? 12 : 0 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: textBright, fontSize: 13 }}>{c.channel}</Text>
                <Text style={{ color: textMuted,  fontSize: 13 }}>₫{formatMoney(c.revenue)}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: cardBorder, borderRadius: 3 }}>
                <View
                  style={{
                    height: 6,
                    width: `${Math.round((c.revenue / maxChannel) * 100)}%`,
                    backgroundColor: c.color,
                    borderRadius: 3,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4B — AI Insights (tối đa 4 items)
          ════════════════════════════════════════════════════════════════════ */}
      {aiInsights.length > 0 && (
        <View style={[s.darkCard, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
          <Text style={[s.darkCardLabel, { color: textMuted }]}>AI INSIGHTS</Text>
          {aiInsights.map((ins, i) => {
            const cfg  = INSIGHT_CONFIG[ins.type] ?? INSIGHT_CONFIG.info
            const lvl  = LEVEL_BADGE[ins.level]   ?? LEVEL_BADGE.info
            return (
              <TouchableOpacity
                key={i}
                onPress={() => cfg.navigate && navigation?.navigate(cfg.navigate)}
                activeOpacity={cfg.navigate ? 0.7 : 1}
                style={[
                  {
                    flexDirection: 'row', alignItems: 'flex-start',
                    backgroundColor: cfg.bg, borderRadius: 8,
                    padding: 10, marginBottom: i < aiInsights.length - 1 ? 8 : 0,
                  },
                ]}
              >
                <Text style={{ fontSize: 18, marginRight: 10 }}>{cfg.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: textBright, fontSize: 13, lineHeight: 18 }}>
                    {ins.text}
                  </Text>
                </View>
                <View style={[{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }, { backgroundColor: lvl.bg }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: lvl.color }}>{lvl.label}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 5 — Cảnh báo nhanh (chỉ hiện nếu có alerts)
          ════════════════════════════════════════════════════════════════════ */}
      {alerts.length > 0 && (
        <View style={[s.darkCard, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
          <Text style={[s.darkCardLabel, { color: textMuted }]}>CẢNH BÁO NHANH</Text>
          {alerts.map((a, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: a.type === 'error' ? '#FEE2E2' : '#FEF3C7',
                borderRadius: 8,
                padding: 10,
                marginBottom: i < alerts.length - 1 ? 8 : 0,
              }}
            >
              <Text style={{ fontSize: 16, marginRight: 8 }}>
                {a.type === 'error' ? '⚠️' : '⚡'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontWeight: '600',
                    fontSize: 13,
                    color: a.type === 'error' ? '#991B1B' : '#92400E',
                  }}
                >
                  {a.title}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: a.type === 'error' ? '#B91C1C' : '#A16207',
                  }}
                >
                  {a.body}
                </Text>
              </View>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => navigation?.navigate('Alerts')}
            style={{ marginTop: 10, alignItems: 'center' }}
          >
            <Text style={{ color: colors.interactive, fontSize: 13 }}>Xem tất cả →</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

// ─── Styles (static layout; colors overridden inline via theme) ───────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  headerBtn:   { padding: 4 },

  // Avatar người dùng
  userAvatar: {
    width: 42, height: 42, borderRadius: 21,
    marginRight: 10, marginTop: 2,
  },
  userAvatarFallback: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginTop: 2,
  },
  userAvatarText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  companyName: { fontSize: 12, marginBottom: 1 },

  // Role badge
  roleBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },

  greeting:   { fontSize: 16, fontWeight: '700' },
  dateText:   { fontSize: 11, marginTop: 1 },

  // Banner mock
  mockBanner: {
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: 'rgba(255,180,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)',
    borderRadius: radius.sm, padding: 10,
  },
  mockBannerText: { color: '#ffb400', fontSize: 12, textAlign: 'center' },

  // Section label uppercase style
  sectionLabel: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    marginHorizontal: 16, marginTop: 20, marginBottom: 8,
  },

  // Card container cho section 2-5
  darkCard: {
    borderRadius: 12, padding: 16,
    marginHorizontal: 16, marginBottom: 16,
  },
  darkCardLabel: {
    fontSize: 11, letterSpacing: 1,
    marginBottom: 12, textTransform: 'uppercase', fontWeight: '700',
  },

  // KPI grid
  kpiGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, marginBottom: 4,
  },
  kpiCard: {
    width: '47%', margin: '1.5%',
    borderRadius: radius.md, padding: 14, borderWidth: 1,
  },
  kpiEmoji: { fontSize: 22, marginBottom: 6 },
  kpiLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  kpiValue: { fontSize: 22, fontWeight: '700', marginTop: 4, letterSpacing: -0.5 },
  kpiUnit:  { fontSize: 12, fontWeight: '500' },
  kpiTrend: { fontSize: 11, marginTop: 4 },

  // Top products rows
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  borderTop:  { borderTopWidth: 1, borderTopColor: '#374151' },

  // Period filter bar
  periodBar:        { flexShrink: 0 },
  periodBarContent: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  periodChipText:       { fontSize: 13, fontWeight: '600' },
  periodChipTextActive: { fontWeight: '700' },
})
