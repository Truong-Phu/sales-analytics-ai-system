import React, { useState, useEffect, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, Image,
  StyleSheet, Alert, ScrollView, ActivityIndicator,
} from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import api from '../api/axios'
import { storage } from '../api/storage'
import { radius } from '../components/theme'
import i18n from '../i18n'
import { useTranslation } from 'react-i18next'

const LANG_KEY = 'app_language'
const LANGS = [
  { key: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { key: 'en', label: 'English',    flag: '🇺🇸' },
]

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:5136'

const ROLE_CONFIG = {
  Owner:   { label: 'Chủ doanh nghiệp', color: '#ffd700', bg: 'rgba(255,215,0,0.15)'    },
  Manager: { label: 'Quản lý',           color: '#c4c0ff', bg: 'rgba(196,192,255,0.15)'  },
  Staff:   { label: 'Nhân viên',         color: '#4ae176', bg: 'rgba(74,225,118,0.15)'   },
  DataIT:  { label: 'Data / IT',         color: '#adc6ff', bg: 'rgba(173,198,255,0.15)'  },
  Admin:   { label: 'Quản trị viên',     color: '#ffb4ab', bg: 'rgba(255,180,171,0.15)'  },
}

const PLAN_CONFIG = {
  Free:       { color: '#adc6ff', bg: 'rgba(173,198,255,0.12)' },
  Pro:        { color: '#4ae176', bg: 'rgba(74,225,118,0.12)'  },
  Enterprise: { color: '#ffd700', bg: 'rgba(255,215,0,0.12)'   },
}

function Avatar({ avatarUrl, name, size = 80 }) {
  const [imgError, setImgError] = useState(false)
  const { colors } = useTheme()
  const initials = (name ?? 'U')
    .split(' ').filter(Boolean).slice(-2).map(w => w[0].toUpperCase()).join('')
  const uri = avatarUrl
    ? (avatarUrl.startsWith('http') ? avatarUrl : `${BASE_URL}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`)
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
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: '#FFF' }}>{initials}</Text>
    </View>
  )
}

function MenuItem({ icon, label, onPress, danger, subtitle, colors }) {
  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 13, paddingHorizontal: 16,
      }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: 18, marginRight: 12 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: danger ? colors.danger : colors.onSurface, fontWeight: '500' }}>{label}</Text>
        {subtitle ? <Text style={{ fontSize: 11, color: colors.outline, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      <Text style={{ fontSize: 18, color: colors.outline }}>›</Text>
    </TouchableOpacity>
  )
}

export default function ProfileScreen({ navigation }) {
  const { user: authUser, logout } = useAuth()
  const { colors, isDark, themeMode, setThemeMode } = useTheme()
  const { t } = useTranslation()
  const [profile,  setProfile]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [lang,     setLang]     = useState(i18n.language ?? 'vi')

  useEffect(() => {
    api.get('/api/users/me')
      .then(res => { const raw = res.data?.data ?? res.data; setProfile(raw) })
      .catch(() => { setProfile(null) })
      .finally(() => setLoading(false))
    storage.getItem(LANG_KEY).then(v => { if (v) setLang(v) }).catch(() => {})
  }, [])

  const handleChangeLang = (newLang) => {
    storage.setItem(LANG_KEY, newLang).catch(() => {})
    i18n.changeLanguage(newLang)
    setLang(newLang)
  }

  const handleThemeChange = () => {
    const THEME_LABEL = {
      system: 'Theo hệ thống',
      dark:   'Tối',
      light:  'Sáng',
    }
    Alert.alert('Giao diện', 'Chọn chế độ hiển thị:', [
      { text: '☀️  Sáng',          onPress: () => setThemeMode('light')  },
      { text: '🌙  Tối',           onPress: () => setThemeMode('dark')   },
      { text: '⚙️  Theo hệ thống', onPress: () => setThemeMode('system') },
      { text: 'Hủy', style: 'cancel' },
    ])
  }

  const handleLogout = () => {
    Alert.alert(
      t('profile.logoutTitle') ?? 'Đăng xuất',
      t('profile.logoutMsg')   ?? 'Bạn có chắc muốn đăng xuất?',
      [
        { text: t('common.cancel') ?? 'Hủy', style: 'cancel' },
        { text: t('profile.logout') ?? 'Đăng xuất', style: 'destructive', onPress: logout },
      ]
    )
  }

  const u        = profile ?? authUser ?? {}
  const role     = u.role ?? authUser?.role
  const roleCfg  = ROLE_CONFIG[role] ?? { label: 'Người dùng', color: colors.secondary, bg: 'rgba(173,198,255,0.1)' }
  const plan     = u.subscriptionPlan ?? u.plan ?? 'Free'
  const planCfg  = PLAN_CONFIG[plan]  ?? { color: colors.outline, bg: colors.surfaceContainerHigh }
  const company  = u.companyName ?? u.company ?? null

  const THEME_SUBTITLE = { system: 'Theo hệ thống', dark: '🌙 Tối', light: '☀️ Sáng' }

  // Dynamic styles based on current theme
  const cardStyle = {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.outlineVariant,
  }
  const dividerStyle = { height: 1, backgroundColor: colors.outlineVariant + '55', marginLeft: 46 }
  const sectionTitleStyle = {
    fontSize: 11, fontWeight: '700', color: colors.outline,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} showsVerticalScrollIndicator={false}>
      {/* Avatar + thông tin */}
      <View style={{
        alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 20,
        backgroundColor: colors.surfaceContainerLow,
        borderBottomWidth: 1, borderBottomColor: colors.outlineVariant,
      }}>
        {loading ? (
          <View style={{
            width: 80, height: 80, borderRadius: 40,
            backgroundColor: colors.surfaceContainerHigh,
            alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <Avatar avatarUrl={u.avatarUrl} name={u.fullName ?? u.name} size={80} />
        )}

        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.onSurface }}>{u.fullName ?? u.name ?? 'Đang tải...'}</Text>
        <Text style={{ fontSize: 13, color: colors.outline, marginTop: 4 }}>{u.email ?? authUser?.email ?? ''}</Text>

        <View style={{ marginTop: 10, paddingHorizontal: 14, paddingVertical: 5, borderRadius: radius.full, backgroundColor: roleCfg.bg }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: roleCfg.color }}>{roleCfg.label}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {company && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 13 }}>🏢</Text>
              <Text style={{ fontSize: 13, color: colors.outline, maxWidth: 150 }} numberOfLines={1}>{company}</Text>
            </View>
          )}
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, backgroundColor: planCfg.bg }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: planCfg.color }}>{'★ ' + plan}</Text>
          </View>
        </View>
      </View>

      {/* TÀI KHOẢN */}
      <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
        <Text style={sectionTitleStyle}>{t('profile.account')}</Text>
        <View style={cardStyle}>
          <MenuItem icon="👤" label={t('profile.personalInfo')} subtitle={u.email ?? ''} onPress={() => {}} colors={colors} />
          <View style={dividerStyle} />
          <MenuItem icon="🔒" label={t('profile.changePassword')} onPress={() => navigation.navigate('ChangePassword')} colors={colors} />
        </View>
      </View>

      {/* NHANH ĐẾN */}
      <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
        <Text style={sectionTitleStyle}>{t('profile.quickNav')}</Text>
        <View style={cardStyle}>
          {/* KPI cá nhân: chỉ hiện với Staff, không hiện Owner/Manager */}
          {!['Owner', 'Manager', 'DataIT', 'Viewer'].includes(authUser?.role) && (
            <>
              <MenuItem icon="📊" label={t('profile.myKpi')} subtitle={t('profile.kpiSub')} onPress={() => navigation.navigate('KPINhanVien')} colors={colors} />
              <View style={dividerStyle} />
            </>
          )}
          <MenuItem icon="🛍️" label={t('profile.inventory')} subtitle={t('profile.inventorySub')} onPress={() => navigation.navigate('TonKho')} colors={colors} />
          <View style={dividerStyle} />
          <MenuItem icon="💳" label={t('payment.history')} subtitle={t('payment.title')} onPress={() => navigation.navigate('PaymentHistory')} colors={colors} />
        </View>
      </View>

      {/* CÀI ĐẶT */}
      <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
        <Text style={sectionTitleStyle}>{t('profile.settings')}</Text>
        <View style={cardStyle}>
          <MenuItem
            icon="🔔"
            label={t('profile.notifications')}
            subtitle={t('profile.notifOn')}
            onPress={() => Alert.alert('Push notification', 'Tính năng đang phát triển.', [{ text: t('common.ok') }])}
            colors={colors}
          />
          <View style={dividerStyle} />
          <MenuItem
            icon="🌐"
            label={t('profile.language')}
            subtitle={LANGS.find(l => l.key === lang)?.label ?? 'Tiếng Việt'}
            onPress={() => {
              Alert.alert('Ngôn ngữ / Language', 'Chọn ngôn ngữ hiển thị:', [
                ...LANGS.map(l => ({ text: `${l.flag} ${l.label}`, onPress: () => handleChangeLang(l.key) })),
                { text: `${t('common.cancel')} / Cancel`, style: 'cancel' },
              ])
            }}
            colors={colors}
          />
          <View style={dividerStyle} />
          <MenuItem
            icon={isDark ? '🌙' : '☀️'}
            label="Giao diện"
            subtitle={THEME_SUBTITLE[themeMode] ?? 'Tối'}
            onPress={handleThemeChange}
            colors={colors}
          />
        </View>
      </View>

      {/* Đăng xuất */}
      <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
        <View style={cardStyle}>
          <MenuItem icon="🚪" label={t('profile.logout')} onPress={handleLogout} danger colors={colors} />
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}
