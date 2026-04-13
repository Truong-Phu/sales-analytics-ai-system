import React from 'react'
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import { colors, radius } from '../components/theme'

const ROLE_LABEL = {
  Owner:   'Chủ doanh nghiệp',
  Manager: 'Quản lý',
  Staff:   'Nhân viên',
  DataIT:  'Data/IT',
  Admin:   'Quản trị viên',
}

function MenuItem({ icon, label, onPress, danger }) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.menuIcon}>{icon}</Text>
      <Text style={[s.menuLabel, danger && { color: colors.error }]}>{label}</Text>
      <Text style={s.menuArrow}>›</Text>
    </TouchableOpacity>
  )
}

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth()

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <ScrollView style={s.container}>
      {/* Avatar & info */}
      <View style={s.avatarSection}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
        </View>
        <Text style={s.name}>{user?.name}</Text>
        <Text style={s.email}>{user?.email}</Text>
        <View style={s.roleBadge}>
          <Text style={s.roleBadgeText}>{ROLE_LABEL[user?.role] ?? user?.role}</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={s.menuSection}>
        <Text style={s.sectionTitle}>TÀI KHOẢN</Text>
        <View style={s.menuCard}>
          <MenuItem icon="🔒" label="Đổi mật khẩu"
            onPress={() => navigation.navigate('ChangePassword')} />
          <View style={s.divider} />
          <MenuItem icon="🌐" label="Ngôn ngữ: Tiếng Việt"
            onPress={() => {}} />
        </View>
      </View>

      <View style={s.menuSection}>
        <Text style={s.sectionTitle}>ỨNG DỤNG</Text>
        <View style={s.menuCard}>
          <MenuItem icon="ℹ️" label="Phiên bản 1.0.0" onPress={() => {}} />
          <View style={s.divider} />
          <MenuItem icon="🔗" label="SalesAnalytics Web" onPress={() => {}} />
        </View>
      </View>

      <View style={s.menuSection}>
        <View style={s.menuCard}>
          <MenuItem icon="🚪" label="Đăng xuất" onPress={handleLogout} danger />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  avatarSection: {
    alignItems: 'center', paddingTop: 32, paddingBottom: 24,
    backgroundColor: colors.surfaceContainerLow,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText:  { fontSize: 32, fontWeight: '700', color: colors.surface },
  name:        { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  email:       { fontSize: 13, color: colors.outline, marginTop: 4 },
  roleBadge: {
    marginTop: 10,
    backgroundColor: 'rgba(196,192,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: radius.full,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  menuSection:   { marginTop: 16, paddingHorizontal: 16 },
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
    paddingVertical: 15, paddingHorizontal: 16,
  },
  menuIcon:  { fontSize: 18, marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 15, color: colors.onSurface },
  menuArrow: { fontSize: 18, color: colors.outline },
  divider:   { height: 1, backgroundColor: colors.outlineVariant + '44', marginLeft: 46 },
})
