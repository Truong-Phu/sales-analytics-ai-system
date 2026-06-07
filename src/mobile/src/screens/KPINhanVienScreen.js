import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, FlatList,
} from 'react-native'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'
import { formatMoney, formatMoneyWithSymbol } from '../utils/format'

// Sinh danh sách 12 tháng gần nhất (tháng hiện tại trở về trước)
function buildMonthList() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year  = d.getFullYear()
    const month = d.getMonth() + 1
    const from  = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to    = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    months.push({ label: `Tháng ${month}/${year}`, from, to, key: `${year}-${month}` })
  }
  return months
}

function ProgressBar({ current, target, color, s }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  return (
    <View style={s.progressBg}>
      <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  )
}

function KpiRow({ emoji, label, current, target, formatVal, color, s, primaryColor }) {
  const pct      = target > 0 ? ((current / target) * 100).toFixed(0) : null
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
            {target != null && (
              <>
                <Text style={s.kpiRowSep}>/</Text>
                <Text style={s.kpiRowTarget}>{formatVal(target)}</Text>
              </>
            )}
          </View>
        </View>
      </View>
      {pct != null && (
        <Text style={[s.kpiPct, { color: barColor }]}>{pct}%</Text>
      )}
    </View>
  )
}

export default function KPINhanVienScreen() {
  const { user }   = useAuth()
  const { colors } = useTheme()
  const s          = useMemo(() => makeStyles(colors), [colors])

  const MONTHS = useMemo(() => buildMonthList(), [])

  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0])
  const [showPicker,    setShowPicker]    = useState(false)
  const [kpi,           setKpi]           = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [error,         setError]         = useState(null)

  const fetchKpi = useCallback(async (month) => {
    setError(null)
    try {
      const res = await api.get('/api/kpi/my-stats', {
        params: { from: month.from, to: month.to },
      })
      const raw = res.data?.data ?? res.data
      setKpi({
        revenue:         Number(raw.revenue        ?? 0),
        revenueTarget:   raw.revenueTarget  != null ? Number(raw.revenueTarget)  : null,
        orders:          Number(raw.orders         ?? 0),
        ordersTarget:    raw.ordersTarget   != null ? Number(raw.ordersTarget)   : null,
        customers:       Number(raw.customers      ?? 0),
        customersTarget: raw.customersTarget != null ? Number(raw.customersTarget): null,
        rank:            raw.rank       ?? null,
        totalStaff:      raw.totalStaff ?? null,
        scope:           raw.scope      ?? 'personal',
        topProducts:     raw.topProducts ?? [],
      })
    } catch (e) {
      setError('Không tải được dữ liệu KPI. Kiểm tra kết nối.')
      setKpi(null)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchKpi(selectedMonth).finally(() => setLoading(false))
  }, [selectedMonth, fetchKpi])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchKpi(selectedMonth)
    setRefreshing(false)
  }

  const revenueCompletion = kpi?.revenueTarget > 0
    ? Math.min((kpi.revenue / kpi.revenueTarget) * 100, 100)
    : null
  const overallColor =
    revenueCompletion == null ? colors.primary :
    revenueCompletion >= 80   ? '#4AE176' :
    revenueCompletion >= 50   ? '#F59E0B' : '#EF4444'

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header chào */}
        <View style={s.greetingBox}>
          <Text style={s.greetingHello}>Xin chào, {user?.name?.split(' ').pop() ?? 'Bạn'} 👋</Text>
          <Text style={s.greetingRole}>KPI cá nhân của bạn</Text>
        </View>

        {/* Dropdown chọn tháng */}
        <View style={s.pickerRow}>
          <TouchableOpacity style={s.pickerBtn} onPress={() => setShowPicker(true)}>
            <Text style={s.pickerBtnText}>📅 {selectedMonth.label}</Text>
            <Text style={s.pickerArrow}>▾</Text>
          </TouchableOpacity>
        </View>

        {/* Error state */}
        {error && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>⚠ {error}</Text>
          </View>
        )}

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : kpi ? (
          <>
            {/* Tổng tiến độ doanh thu */}
            <View style={s.overallCard}>
              <Text style={s.overallLabel}>Tổng doanh thu</Text>
              <Text style={[s.overallValue, { color: colors.primary }]}>
                ₫{formatMoney(kpi.revenue)}
              </Text>
              {kpi.revenueTarget != null && (
                <>
                  <ProgressBar current={kpi.revenue} target={kpi.revenueTarget} color={overallColor} s={s} />
                  <Text style={s.overallDetail}>
                    {revenueCompletion?.toFixed(0)}% / mục tiêu {formatMoneyWithSymbol(kpi.revenueTarget)}
                  </Text>
                </>
              )}
              {kpi.rank && (
                <View style={s.rankRow}>
                  <Text style={s.rankLabel}>Xếp hạng:</Text>
                  <Text style={s.rankValue}>#{kpi.rank} / {kpi.totalStaff} nhân viên</Text>
                </View>
              )}
            </View>

            {/* KPI chi tiết */}
            <View style={s.kpiCard}>
              <Text style={s.cardLabel}>CHỈ SỐ TRONG KỲ</Text>

              <KpiRow
                emoji="💰" label="Doanh thu"
                current={kpi.revenue} target={kpi.revenueTarget}
                formatVal={v => `₫${formatMoney(v)}`}
                color={colors.primary} s={s} primaryColor={colors.primary}
              />
              {kpi.revenueTarget != null && (
                <ProgressBar current={kpi.revenue} target={kpi.revenueTarget} color={overallColor} s={s} />
              )}

              <View style={{ height: 14 }} />

              <KpiRow
                emoji="🛒" label="Đơn hàng"
                current={kpi.orders} target={kpi.ordersTarget}
                formatVal={v => `${v} đơn`}
                s={s} primaryColor={colors.primary}
              />
              {kpi.ordersTarget != null && (
                <ProgressBar
                  current={kpi.orders} target={kpi.ordersTarget}
                  color={kpi.ordersTarget > 0 && kpi.orders / kpi.ordersTarget >= 0.8 ? '#4AE176' : '#F59E0B'} s={s}
                />
              )}

              <View style={{ height: 14 }} />

              <KpiRow
                emoji="👤" label="Khách hàng mới"
                current={kpi.customers} target={kpi.customersTarget}
                formatVal={v => `${v} KH`}
                s={s} primaryColor={colors.primary}
              />
              {kpi.customersTarget != null && (
                <ProgressBar
                  current={kpi.customers} target={kpi.customersTarget}
                  color={kpi.customersTarget > 0 && kpi.customers / kpi.customersTarget >= 0.8 ? '#4AE176' : '#F59E0B'} s={s}
                />
              )}
            </View>

            {/* Top sản phẩm */}
            {kpi.topProducts.length > 0 && (
              <View style={s.kpiCard}>
                <Text style={s.cardLabel}>SẢN PHẨM BÁN CHẠY</Text>
                {kpi.topProducts.map((p, i) => (
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

            {/* Không có target */}
            {kpi.revenueTarget == null && (
              <View style={s.noTargetBanner}>
                <Text style={s.noTargetText}>ℹ Chưa có mục tiêu KPI tháng này. Liên hệ quản lý để đặt mục tiêu.</Text>
              </View>
            )}
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Month picker modal */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={[s.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.onSurface }]}>Chọn tháng</Text>
            <FlatList
              data={MONTHS}
              keyExtractor={item => item.key}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.monthItem, item.key === selectedMonth.key && s.monthItemActive]}
                  onPress={() => { setSelectedMonth(item); setShowPicker(false) }}
                >
                  <Text style={[s.monthItemText, { color: colors.onSurface },
                    item.key === selectedMonth.key && { color: colors.primary, fontWeight: '700' }]}>
                    {item.label}
                    {item.key === MONTHS[0].key ? '  (hiện tại)' : ''}
                  </Text>
                  {item.key === selectedMonth.key && <Text style={{ color: colors.primary }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const makeStyles = (c) => StyleSheet.create({
  center:      { paddingVertical: 60, alignItems: 'center' },

  greetingBox: {
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12,
    backgroundColor: c.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: c.outlineVariant,
  },
  greetingHello: { fontSize: 17, fontWeight: '700', color: c.onSurface },
  greetingRole:  { fontSize: 12, color: c.outline, marginTop: 3 },

  pickerRow: { padding: 12 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.surfaceContainer, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: c.outlineVariant,
  },
  pickerBtnText: { fontSize: 14, color: c.onSurface, fontWeight: '600' },
  pickerArrow:   { fontSize: 16, color: c.outline },

  errorBanner:  { marginHorizontal: 12, marginBottom: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  errorText:    { color: '#EF4444', fontSize: 13 },

  overallCard:   { backgroundColor: c.card, borderRadius: radius.md, margin: 12, padding: 16 },
  overallLabel:  { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
  overallValue:  { fontSize: 32, fontWeight: '700', marginBottom: 8 },
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

  progressBg:   { height: 8, backgroundColor: c.cardBorder, borderRadius: 4, marginBottom: 4 },
  progressFill: { height: 8, borderRadius: 4 },

  productRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  productBorder:  { borderTopWidth: 1, borderTopColor: c.cardBorder },
  productRank:    { fontSize: 18, width: 30 },
  productName:    { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
  productOrders:  { fontSize: 11, color: c.textSecondary, marginTop: 2 },
  productRevenue: { fontSize: 13, color: c.primary, fontWeight: '700' },

  noTargetBanner: { marginHorizontal: 12, marginBottom: 8, backgroundColor: c.surfaceContainerLow, borderRadius: radius.sm, padding: 12 },
  noTargetText:   { fontSize: 12, color: c.outline },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:   { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '60%' },
  modalTitle:   { fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  monthItem:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  monthItemActive: { backgroundColor: 'rgba(99,102,241,0.06)', borderRadius: radius.sm },
  monthItemText: { fontSize: 15 },
})
