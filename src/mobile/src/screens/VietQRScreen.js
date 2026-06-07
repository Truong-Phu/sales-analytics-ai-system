import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, Image, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import api from '../api/axios'
import { useTheme } from '../context/ThemeContext'
import { radius } from '../components/theme'
import { formatMoneyWithSymbol } from '../utils/format'

function fmtVND(v) {
  if (v == null) return '—'
  return formatMoneyWithSymbol(v)
}

function fmtCountdown(seconds) {
  if (seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const makeStyles = (c) => StyleSheet.create({
  container:   { flex: 1, backgroundColor: c.surface },
  scrollContent:{ padding: 16, alignItems: 'center' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },

  amountCard: {
    width: '100%', padding: 16, borderRadius: radius.md,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1, borderColor: c.outlineVariant,
    alignItems: 'center', marginBottom: 16,
  },
  amountLabel: { fontSize: 12, color: c.outline, marginBottom: 4 },
  amountValue: { fontSize: 26, fontWeight: '800', color: c.primary },
  codeText:    { fontSize: 13, color: c.outline, marginTop: 4, fontVariant: ['tabular-nums'] },

  qrCard: {
    padding: 16, borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: c.outlineVariant,
    alignItems: 'center', marginBottom: 16,
    elevation: 2, shadowColor: '#000',
    shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  qrImage: { width: 220, height: 220, borderRadius: radius.sm },
  qrHint:  { fontSize: 11, color: '#6B7280', marginTop: 8, textAlign: 'center' },

  countdownCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: radius.full, marginBottom: 16,
  },
  countdownText: { fontSize: 22, fontWeight: '800', marginLeft: 8 },
  countdownLabel: { fontSize: 12, marginLeft: 4 },

  bankCard: {
    width: '100%', padding: 16, borderRadius: radius.md,
    backgroundColor: c.surfaceContainerLow,
    borderWidth: 1, borderColor: c.outlineVariant,
    marginBottom: 16,
  },
  bankTitle: {
    fontSize: 11, fontWeight: '700', color: c.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12,
  },
  bankRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bankLabel: { fontSize: 13, color: c.outline },
  bankValue: { fontSize: 13, color: c.onSurface, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 8 },

  successCard: {
    width: '100%', padding: 24, borderRadius: radius.md,
    backgroundColor: '#D1FAE5',
    borderWidth: 1, borderColor: '#10B981',
    alignItems: 'center',
  },
  successEmoji: { fontSize: 48, marginBottom: 8 },
  successTitle: { fontSize: 18, fontWeight: '800', color: '#065F46', marginBottom: 4 },
  successSub:   { fontSize: 13, color: '#065F46', textAlign: 'center' },

  expiredCard: {
    width: '100%', padding: 20, borderRadius: radius.md,
    backgroundColor: '#FEE2E2',
    borderWidth: 1, borderColor: '#EF4444',
    alignItems: 'center',
  },
  expiredText: { fontSize: 16, fontWeight: '700', color: '#991B1B', marginBottom: 8 },
  expiredSub:  { fontSize: 13, color: '#991B1B', textAlign: 'center', marginBottom: 12 },

  backBtn: {
    marginTop: 16, width: '100%',
    backgroundColor: c.interactive,
    borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center',
  },
  backBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
})

export default function VietQRScreen({ route, navigation }) {
  const { txId } = route?.params ?? {}
  const { colors } = useTheme()
  const { t }      = useTranslation()
  const s          = useMemo(() => makeStyles(colors), [colors])

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [seconds, setSeconds] = useState(0)
  const [isPaid,  setIsPaid]  = useState(false)

  const pollRef = useRef(null)
  const tickRef = useRef(null)

  const fetchData = useCallback(async () => {
    if (!txId) { setError('Không tìm thấy mã giao dịch'); setLoading(false); return }
    try {
      const res = await api.get(`/api/payment/vietqr/${txId}`)
      const d = res.data
      setData(d)
      if (d.transaction?.status === 'Paid') {
        setIsPaid(true)
        return
      }
      // Tính countdown từ expiredAt
      if (d.transaction?.expiredAt) {
        const remaining = Math.max(0, Math.floor(
          (new Date(d.transaction.expiredAt) - new Date()) / 1000
        ))
        setSeconds(remaining)
      }
    } catch (err) {
      setError(err.response?.data?.message ?? 'Không thể tải QR thanh toán')
    } finally {
      setLoading(false)
    }
  }, [txId])

  const checkStatus = useCallback(async () => {
    if (!txId || isPaid) return
    try {
      const res = await api.get(`/api/payment/vietqr/${txId}`)
      if (res.data.transaction?.status === 'Paid') {
        setIsPaid(true)
        clearInterval(pollRef.current)
        clearInterval(tickRef.current)
      }
    } catch { /* Im lặng */ }
  }, [txId, isPaid])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Countdown tick
  useEffect(() => {
    if (isPaid || loading) return
    tickRef.current = setInterval(() => {
      setSeconds(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(tickRef.current)
  }, [isPaid, loading])

  // Auto-poll trạng thái mỗi 10 giây
  useEffect(() => {
    if (isPaid || loading) return
    pollRef.current = setInterval(checkStatus, 10_000)
    return () => clearInterval(pollRef.current)
  }, [checkStatus, isPaid, loading])

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={{ color: '#991B1B', fontSize: 14, textAlign: 'center', margin: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { width: 160 }]}>
          <Text style={s.backBtnText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const tx   = data?.transaction
  const qr   = data?.data
  const isExpired = seconds <= 0 && !isPaid

  return (
    <ScrollView style={s.container} contentContainerStyle={s.scrollContent}>

      {/* Số tiền */}
      <View style={s.amountCard}>
        <Text style={s.amountLabel}>Số tiền cần thanh toán</Text>
        <Text style={s.amountValue}>{fmtVND(tx?.amount)}</Text>
        <Text style={s.codeText}>Mã: {tx?.paymentCode}</Text>
      </View>

      {/* Trạng thái đã thanh toán */}
      {isPaid && (
        <View style={s.successCard}>
          <Text style={s.successEmoji}>✅</Text>
          <Text style={s.successTitle}>Thanh toán thành công!</Text>
          <Text style={s.successSub}>Giao dịch đã được xác nhận</Text>
          <TouchableOpacity style={[s.backBtn, { marginTop: 16 }]} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>Quay lại đơn hàng</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* QR hết hạn */}
      {isExpired && !isPaid && (
        <View style={s.expiredCard}>
          <Text style={s.expiredText}>⏱ Mã QR đã hết hạn</Text>
          <Text style={s.expiredSub}>Vui lòng khởi tạo lại giao dịch mới</Text>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: '#EF4444', marginTop: 0 }]}
            onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* QR code + countdown */}
      {!isPaid && !isExpired && (
        <>
          {/* Countdown */}
          <View style={[s.countdownCard, {
            backgroundColor: seconds > 120 ? '#D1FAE5' : seconds > 30 ? '#FEF3C7' : '#FEE2E2',
          }]}>
            <Text style={{ fontSize: 16 }}>⏱</Text>
            <Text style={[s.countdownText, {
              color: seconds > 120 ? '#065F46' : seconds > 30 ? '#92400E' : '#991B1B',
            }]}>{fmtCountdown(seconds)}</Text>
            <Text style={[s.countdownLabel, {
              color: seconds > 120 ? '#065F46' : seconds > 30 ? '#92400E' : '#991B1B',
            }]}>còn lại</Text>
          </View>

          {/* QR image */}
          {qr?.qrImageUrl ? (
            <View style={s.qrCard}>
              <Image
                source={{ uri: qr.qrImageUrl }}
                style={s.qrImage}
                resizeMode="contain"
              />
              <Text style={s.qrHint}>Quét bằng app ngân hàng hoặc ví điện tử</Text>
            </View>
          ) : null}

          {/* Thông tin chuyển khoản thủ công */}
          {(qr?.bankName || qr?.accountNumber) && (
            <View style={s.bankCard}>
              <Text style={s.bankTitle}>Thông tin chuyển khoản</Text>
              {qr?.bankName && (
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Ngân hàng</Text>
                  <Text style={s.bankValue}>{qr.bankName}</Text>
                </View>
              )}
              {qr?.accountNumber && (
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Số TK</Text>
                  <Text style={s.bankValue}>{qr.accountNumber}</Text>
                </View>
              )}
              {qr?.accountHolder && (
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Chủ TK</Text>
                  <Text style={s.bankValue}>{qr.accountHolder}</Text>
                </View>
              )}
              {qr?.content && (
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Nội dung CK</Text>
                  <Text style={[s.bankValue, { color: colors.primary, fontWeight: '800' }]}>{qr.content}</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>Quay lại đơn hàng</Text>
          </TouchableOpacity>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}
