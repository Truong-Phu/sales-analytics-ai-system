import React, { useState, useEffect } from 'react'
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

const SEVERITY_STYLE = {
  high:   { bg: 'rgba(255,180,171,0.1)', border: 'rgba(255,180,171,0.3)', text: '#ffb4ab', emoji: '🔴' },
  medium: { bg: 'rgba(255,180,0,0.1)',   border: 'rgba(255,180,0,0.3)',   text: '#ffb400', emoji: '🟡' },
  low:    { bg: 'rgba(173,198,255,0.1)', border: 'rgba(173,198,255,0.3)', text: '#adc6ff', emoji: '🔵' },
}

export default function AlertsScreen() {
  const [data,       setData]      = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      const res = await api.get('/api/ai/anomaly', { params: { days: 30 } })
      setData(res.data)
    } catch { setData({ anomalies: [] }) }
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)) }, [])

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

  const anomalies = data?.anomalies ?? []

  return (
    <View style={s.container}>
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>{anomalies.length}</Text>
          <Text style={s.summaryLabel}>Tổng bất thường</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: colors.error }]}>
            {anomalies.filter(a => a.severity === 'high').length}
          </Text>
          <Text style={s.summaryLabel}>Nghiêm trọng</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={[s.summaryNum, { color: '#ffb400' }]}>
            {anomalies.filter(a => a.severity === 'medium').length}
          </Text>
          <Text style={s.summaryLabel}>Trung bình</Text>
        </View>
      </View>

      <FlatList
        data={anomalies}
        keyExtractor={(_, i) => `${i}`}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        renderItem={({ item }) => {
          const sv = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.low
          return (
            <View style={[s.card, { backgroundColor: sv.bg, borderColor: sv.border }]}>
              <View style={s.cardHeader}>
                <Text style={s.cardEmoji}>{sv.emoji}</Text>
                <View style={s.cardInfo}>
                  <Text style={s.cardDate}>{item.date}</Text>
                  <Text style={[s.cardSeverity, { color: sv.text }]}>
                    {item.severity === 'high' ? 'Nghiêm trọng' :
                     item.severity === 'medium' ? 'Trung bình' : 'Thấp'}
                  </Text>
                </View>
                <View style={s.cardRight}>
                  <Text style={s.cardValue}>₫{(item.value / 1_000_000).toFixed(2)}M</Text>
                  <Text style={[s.cardZScore, { color: sv.text }]}>z={item.zScore?.toFixed(2)}σ</Text>
                </View>
              </View>
              <Text style={s.cardChannel}>{item.channel} – Phát hiện bởi Z-score rolling 14 ngày</Text>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>✅</Text>
            <Text style={s.emptyText}>Không có bất thường nào trong 30 ngày qua</Text>
          </View>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  summaryRow: { flexDirection: 'row', padding: 12, gap: 8 },
  summaryCard: {
    flex: 1, backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  summaryNum:   { fontSize: 24, fontWeight: '700', color: colors.onSurface },
  summaryLabel: { fontSize: 11, color: colors.outline, marginTop: 4, textAlign: 'center' },
  list: { padding: 12, paddingTop: 4 },
  card: {
    borderRadius: radius.md, padding: 14, marginBottom: 10,
    borderWidth: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardEmoji:  { fontSize: 24, marginRight: 10 },
  cardInfo:   { flex: 1 },
  cardDate:   { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  cardSeverity: { fontSize: 12, marginTop: 2 },
  cardRight:  { alignItems: 'flex-end' },
  cardValue:  { fontSize: 15, fontWeight: '700', color: colors.primary },
  cardZScore: { fontSize: 12, marginTop: 2, fontFamily: 'monospace' },
  cardChannel: { fontSize: 12, color: colors.outline },
  empty: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.outline, textAlign: 'center' },
})
