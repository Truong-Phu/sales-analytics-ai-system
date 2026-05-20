import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, Alert, ScrollView, ActivityIndicator,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'
import { colors, radius } from '../components/theme'

// Base URL để prepend cho avatar path relative
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:5136'

// ─── Mapping role → tiếng Việt + màu badge ───────────────────────────────────
const ROLE_CONFIG = {
  Owner:   { label: 'Chủ doanh nghiệp', color: '#ffd700', bg: 'rgba(255,215,0,0.15)'    },
  Manager: { label: 'Quản lý',           color: '#c4c0ff', bg: 'rgba(196,192,255,0.15)'  },
  Staff:   { label: 'Nhân viên',         color: '#4ae176', bg: 'rgba(74,225,118,0.15)'   },
  DataIT:  { label: 'Data / IT',         color: '#adc6ff', bg: 'rgba(173,198,255,0.15)'  },
  Admin:   { label: 'Quản trị viên',     color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)'  },
}
const DEFAULT_ROLE = { label: 'Người dùng', color: colors.secondary, bg: 'rgba(173,198,255,0.1)' }

// Gói dịch vụ → badge màu
const PLAN_CONFIG = {
  Free:       { color: '#adc6ff', bg: 'rgba(173,198,255,0.12)' },
  Pro:        { color: '#4ae176', bg: 'rgba(74,225,118,0.12)'  },
  Enterprise: { color: '#ffd700', bg: 'rgba(255,215,0,0.12)'   },
}
const DEFAULT_PLAN = { color: colors.outline, bg: colors.surfaceContainerHigh }

// ─── Avatar component ─────────────────────────────────────────────────────────
function Avatar({ avatarUrl, name, size = 80 }) {
  const [imgError, setImgError] = useState(false)
  const initials = (name ?? 'U')
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map(w => w[0].toUpperCase())
    .join('')

  // Xây dựng full URL nếu là đường dẫn relative
  const uri = avatarUrl
    ? avatarUrl.startsWith('http')
      ? avatarUrl
      : `${BASE_URL}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`
    : null

  if (uri && !imgError) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, marginBottom: 12 }}
        onError={() => setImgError(true)}
      />
    )
  }

  // Fallback: initials
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: colors.primaryContainer,
        alignItems: 'center', justifyContent: 'center', marginBottom: 12,
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: colors.surface }}>
        {initials}
      </Text>
    </View>
  )
}

// ─── MenuItem ─────────────────────────────────────────────────────────────────
function MenuItem({ icon, label, onPress, danger, subtitle }) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.menuIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.menuLabel, danger && { color: colors.error }]}>{label}</Text>
        {subtitle ? <Text style={s.menuSubtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={s.menuArrow}>›</Text>
    </TouchableOpacity>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ProfileScreen({ navigation }) {
  const { user: authUser, logout } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Gọi GET /api/users/me để lấy thông tin đầy đủ mới nhất
  useEffect(() => {
    api.get('/api/users/me')
      .then(res => {
        const raw = res.data?.data ?? res.data
        setProfile(raw)
      })
      .catch(() => {
        // Fallback: dùng dữ liệu từ JWT token trong AuthContext
        setProfile(null)
      })
      .finally(() => setLoading(false))
  }, [])

  // Merge: profile (API) > authUser (JWT)
  const u = profile ?? authUser ?? {}
  const role      = u.role      ?? authUser?.role
  const roleCfg   = ROLE_CONFIG[role] ?? DEFAULT_ROLE
  const plan      = u.subscriptionPlan ?? u.plan ?? 'Free'
  const planCfg   = PLAN_CONFIG[plan]  ?? DEFAULT_PLAN
  const company   = u.companyName ?? u.company ?? null

  const handleLogout = () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: logout },
      ]
    )
  }

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Avatar & thông tin chính */}
      <View style={s.avatarSection}>
        {loading ? (
          <View style={s.avatarPlaceholder}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Avatar avatarUrl={u.avatarUrl} name={u.name} size={80} />
        )}

        <Text style={s.name}>{u.name ?? 'Đang tải...'}</Text>
        <Text style={s.email}>{u.email ?? authUser?.email ?? ''}</Text>

        {/* Badge role */}
        <View style={[s.roleBadge, { backgroundColor: roleCfg.bg }]}>
          <Text style={[s.roleBadgeText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
        </View>

        {/* Công ty + gói dịch vụ */}
        <View style={s.metaRow}>
          {company && (
            <View style={s.metaItem}>
              <Text style={s.metaIcon}>🏢</Text>
              <Text style={s.metaText} numberOfLines={1}>{company}</Text>
            </View>
          )}
          <View style={[s.planBadge, { backgroundColor: planCfg.bg }]}>
            <Text style={[s.planBadgeText, { color: planCfg.color }]}>
              {'★ ' + plan}
            </Text>
          </View>
        </View>
      </View>

      {/* Menu: Tài khoản */}
      <View style={s.menuSection}>
        <Text style={s.sectionTitle}>TÀI KHOẢN</Text>
        <View style={s.menuCard}>
          <MenuItem
            icon="👤"
            label="Thông tin cá nhân"
            subtitle={u.email ?? ''}
            onPress={() => {}}
          />
          <View style={s.divider} />
          <MenuItem
            icon="🔒"
            label="Đổi mật khẩu"
            onPress={() => navigation.navigate('ChangePassword')}
          />
        </View>
      </View>

      {/* Menu: Nhanh đến */}
      <View style={s.menuSection}>
        <Text style={s.sectionTitle}>NHANH ĐẾN</Text>
        <View style={s.menuCard}>
          <MenuItem
            icon="📊"
            label="KPI của tôi"
            subtitle="Xem tiến độ cá nhân"
            onPress={() => navigation.navigate('KPINhanVien')}
          />
          <View style={s.divider} />
          <MenuItem
            icon="🛍️"
            label="Tồn kho"
            subtitle="Kiểm tra sản phẩm sắp hết"
            onPress={() => navigation.navigate('TonKho')}
          />
        </View>
      </View>

      {/* Menu: Cài đặt */}
      <View style={s.menuSection}>
        <Text style={s.sectionTitle}>CÀI ĐẶT</Text>
        <View style={s.menuCard}>
          <MenuItem
            icon="🔔"
            label="Push notification"
            subtitle="Bật"
            onPress={() => {
              Alert.alert('Push notification', 'Tính năng đang phát triển.', [{ text: 'OK' }])
            }}
          />
          <View style={s.divider} />
          <MenuItem
            icon="🌐"
            label="Ngôn ngữ"
            subtitle="Tiếng Việt (VI)"
            onPress={() => {
              Alert.alert('Ngôn ngữ', 'Chọn ngôn ngữ hiển thị:', [
                { text: 'Tiếng Việt', onPress: () => {} },
                { text: 'English',    onPress: () => {} },
                { text: 'Hủy', style: 'cancel' },
              ])
            }}
          />
          <View style={s.divider} />
          <MenuItem
            icon="🖥️"
            label="IP Server"
            subtitle={BASE_URL}
            onPress={() => {
              Alert.alert(
                'Địa chỉ Server',
                `Địa chỉ hiện tại:\n${BASE_URL}\n\nĐể thay đổi, cập nhật biến EXPO_PUBLIC_API_URL trong file .env và khởi động lại app.`,
                [{ text: 'Đã hiểu' }]
              )
            }}
          />
        </View>
      </View>

      {/* Menu: Ứng dụng */}
      <View style={s.menuSection}>
        <Text style={s.sectionTitle}>ỨNG DỤNG</Text>
        <View style={s.menuCard}>
          <MenuItem icon="ℹ️"  label="Phiên bản" subtitle="1.0.0" onPress={() => {}} />
          <View style={s.divider} />
          <MenuItem icon="🔗"  label="SalesAnalytics Web" subtitle={BASE_URL} onPress={() => {}} />
        </View>
      </View>

      {/* Đăng xuất */}
      <View style={s.menuSection}>
        <View style={s.menuCard}>
          <MenuItem icon="🚪" label="Đăng xuất" onPress={handleLogout} danger />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  // Avatar section
  avatarSection: {
    alignItems: 'center', paddingTop: 32, paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  name:  { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  email: { fontSize: 13, color: colors.outline, marginTop: 4 },

  // Role badge
  roleBadge: {
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: radius.full,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },

  // Công ty + plan
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, gap: 10, flexWrap: 'wrap', justifyContent: 'center',
  },
  metaItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaIcon:   { fontSize: 13 },
  metaText:   { fontSize: 13, color: colors.outline, maxWidth: 150 },
  planBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  planBadgeText: { fontSize: 11, fontWeight: '700' },

  // Menu
  menuSection:  { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  menuCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
  },
  menuIcon:     { fontSize: 18, marginRight: 12 },
  menuLabel:    { fontSize: 15, color: colors.onSurface, fontWeight: '500' },
  menuSubtitle: { fontSize: 11, color: colors.outline, marginTop: 1 },
  menuArrow:    { fontSize: 18, color: colors.outline },
  divider:      { height: 1, backgroundColor: colors.outlineVariant + '55', marginLeft: 46 },
})
