import React, { useState, useEffect, useRef } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator }     from '@react-navigation/stack'
import { Text, View }               from 'react-native'
import { useAuth }                  from '../context/AuthContext'
import { useTheme }                 from '../context/ThemeContext'
import api                          from '../api/axios'

// Screens – Auth
import LoginScreen           from '../screens/LoginScreen'
import ForgotPasswordScreen  from '../screens/ForgotPasswordScreen'
import ResetPasswordScreen   from '../screens/ResetPasswordScreen'
import ChangePasswordScreen  from '../screens/ChangePasswordScreen'

// Screens – Main
import DashboardScreen       from '../screens/DashboardScreen'
import OrdersScreen          from '../screens/OrdersScreen'
import OrderDetailScreen     from '../screens/OrderDetailScreen'
import AddOrderScreen        from '../screens/AddOrderScreen'
import AlertsScreen          from '../screens/AlertsScreen'
import ProfileScreen         from '../screens/ProfileScreen'
import ProductsScreen        from '../screens/ProductsScreen'
import QuickReportScreen     from '../screens/QuickReportScreen'
import CustomersScreen       from '../screens/CustomersScreen'
import POSScreen             from '../screens/POSScreen'
import KhachHangScreen       from '../screens/KhachHangScreen'
import TonKhoScreen          from '../screens/TonKhoScreen'
import KPINhanVienScreen     from '../screens/KPINhanVienScreen'

const Tab       = createBottomTabNavigator()
const Stack     = createStackNavigator()
const AuthStack = createStackNavigator()

// Dynamic stack options — generated per-render based on theme
function getStackOptions(colors) {
  return {
    headerStyle:      { backgroundColor: colors.surfaceContainerLow },
    headerTintColor:  colors.onSurface,
    headerTitleStyle: { fontWeight: '700', color: colors.onSurface },
    cardStyle:        { backgroundColor: colors.surface },
  }
}

// Icon text đơn giản (emoji thay Material Icons để tránh native dependency)
function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  )
}

// Badge số thông báo chưa đọc
function TabIconWithBadge({ emoji, focused, badge }) {
  return (
    <View style={{ position: 'relative' }}>
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
      {badge > 0 && (
        <View style={{
          position: 'absolute', top: -4, right: -8,
          backgroundColor: '#EF4444',
          borderRadius: 9, minWidth: 18, height: 18,
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      )}
    </View>
  )
}

// Tab POS nổi bật (màu primary)
function TabIconPOS({ focused }) {
  return (
    <View style={{
      backgroundColor: focused ? '#6366F1' : '#3730A3',
      borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4,
      marginTop: -4,
    }}>
      <Text style={{ fontSize: 20 }}>🛍️</Text>
    </View>
  )
}

// ─── Sub-stacks ───────────────────────────────────────────────────────────────

// Dashboard Stack – bao gồm AlertsScreen để "Xem tất cả cảnh báo" hoạt động
// Dùng cho Staff/Owner/Manager (những role có Alerts trong DashboardStack thay vì tab riêng)
function DashboardWithAlertsStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Cảnh báo & Thông báo' }} />
      <Stack.Screen name="KhachHang"     component={KhachHangScreen}   options={{ title: 'Khách hàng'       }} />
      <Stack.Screen name="TonKho"        component={TonKhoScreen}       options={{ title: 'Tồn kho'          }} />
      <Stack.Screen name="KPINhanVien"   component={KPINhanVienScreen}  options={{ title: 'KPI của tôi'      }} />
    </Stack.Navigator>
  )
}

// Dashboard Stack đơn giản (không có Alerts con – dùng cho DataIT/Viewer có tab Alerts riêng)
function DashboardSimpleStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="KhachHang"     component={KhachHangScreen}   options={{ title: 'Khách hàng'       }} />
      <Stack.Screen name="TonKho"        component={TonKhoScreen}       options={{ title: 'Tồn kho'          }} />
      <Stack.Screen name="KPINhanVien"   component={KPINhanVienScreen}  options={{ title: 'KPI của tôi'      }} />
    </Stack.Navigator>
  )
}

// Orders Stack (Orders list + OrderDetail + AddOrder)
function OrdersStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="OrdersList"   component={OrdersScreen}      options={{ title: 'Đơn hàng'      }} />
      <Stack.Screen name="OrderDetail"  component={OrderDetailScreen} options={{ title: 'Chi tiết đơn'   }} />
      <Stack.Screen name="AddOrder"     component={AddOrderScreen}    options={{ title: 'Thêm đơn hàng' }} />
    </Stack.Navigator>
  )
}

// POS Stack
function POSStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="POSMain" component={POSScreen} options={{ title: 'Bán hàng (POS)' }} />
    </Stack.Navigator>
  )
}

// Products Stack
function ProductsStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="ProductsList" component={ProductsScreen} options={{ title: 'Sản phẩm' }} />
    </Stack.Navigator>
  )
}

// Notifications Stack (Tab Thông báo)
function NotificationsStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="AlertsMain" component={AlertsScreen} options={{ title: 'Thông báo' }} />
    </Stack.Navigator>
  )
}

// Reports + Customers Stack (Owner/Manager)
function ReportsStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="QuickReport" component={QuickReportScreen} options={{ title: 'Báo cáo nhanh' }} />
      <Stack.Screen name="Customers"   component={CustomersScreen}   options={{ title: 'Khách hàng'   }} />
    </Stack.Navigator>
  )
}

// Profile Stack (Profile + ChangePassword + KPI + TonKho)
function ProfileStack() {
  const { colors } = useTheme()
  return (
    <Stack.Navigator screenOptions={getStackOptions(colors)}>
      <Stack.Screen name="ProfileMain"    component={ProfileScreen}       options={{ title: 'Tài khoản'    }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Đổi mật khẩu' }} />
      <Stack.Screen name="KPINhanVien"    component={KPINhanVienScreen}   options={{ title: 'KPI của tôi'  }} />
      <Stack.Screen name="TonKho"         component={TonKhoScreen}        options={{ title: 'Tồn kho'      }} />
    </Stack.Navigator>
  )
}

// ─── Hook lấy số thông báo chưa đọc ─────────────────────────────────────────
function useUnreadCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const fetch = async () => {
      try {
        const res = await api.get('/api/notifications', { params: { limit: 50 } })
        const raw = res.data?.data ?? res.data
        const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
        const unread = items.filter(n => !n.isRead).length
        if (!cancelled) setCount(unread)
      } catch {
        // Im lặng nếu lỗi, giữ count = 0
      }
    }
    fetch()
    // Poll mỗi 60s
    const timer = setInterval(fetch, 60_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  return count
}

// Dynamic tab options — generated per-render based on theme
function getTabOptions(colors) {
  return {
    tabBarStyle: {
      backgroundColor: colors.surfaceContainerLow,
      borderTopColor:  colors.outlineVariant,
      borderTopWidth:  1,
      paddingBottom:   4,
      height:          60,
    },
    tabBarActiveTintColor:   colors.primary,
    tabBarInactiveTintColor: colors.outline,
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
    headerStyle:      { backgroundColor: colors.surfaceContainerLow },
    headerTintColor:  colors.onSurface,
    headerTitleStyle: { fontWeight: '700', fontSize: 16, color: colors.onSurface },
  }
}

// ─── Main Tabs theo role ──────────────────────────────────────────────────────
// Tab 5 chuẩn: Tổng quan | Đơn hàng | POS | Thông báo | Tôi
// RBAC giữ nguyên logic cũ — thêm POS tab và Thông báo tab với badge

// Staff: Tổng quan(+Alerts) | Đơn hàng(+Add) | POS | Sản phẩm | Tôi
function StaffTabs() {
  const unread = useUnreadCount()
  const { colors } = useTheme()
  return (
    <Tab.Navigator screenOptions={getTabOptions(colors)}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardWithAlertsStack}
        options={{ title: 'Tổng quan', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{ title: 'Đơn hàng', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} /> }}
      />
      <Tab.Screen
        name="POS"
        component={POSStack}
        options={{
          title: 'Bán hàng', headerShown: false,
          tabBarIcon: ({ focused }) => <TabIconPOS focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{ title: 'Thông báo', headerShown: false, tabBarIcon: ({ focused }) => <TabIconWithBadge emoji="🔔" focused={focused} badge={unread} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tôi', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Owner / Manager: Tổng quan | Đơn hàng | POS | Thông báo | Tôi
function OwnerManagerTabs() {
  const unread = useUnreadCount()
  const { colors } = useTheme()
  return (
    <Tab.Navigator screenOptions={getTabOptions(colors)}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardWithAlertsStack}
        options={{ title: 'Tổng quan', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{ title: 'Đơn hàng', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} /> }}
      />
      <Tab.Screen
        name="POS"
        component={POSStack}
        options={{
          title: 'Bán hàng', headerShown: false,
          tabBarIcon: ({ focused }) => <TabIconPOS focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{ title: 'Thông báo', headerShown: false, tabBarIcon: ({ focused }) => <TabIconWithBadge emoji="🔔" focused={focused} badge={unread} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tôi', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// DataIT: Tổng quan | Đơn hàng | POS | Thông báo | Tôi
function DataITTabs() {
  const unread = useUnreadCount()
  const { colors } = useTheme()
  return (
    <Tab.Navigator screenOptions={getTabOptions(colors)}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardSimpleStack}
        options={{ title: 'Tổng quan', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{ title: 'Đơn hàng', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} /> }}
      />
      <Tab.Screen
        name="POS"
        component={POSStack}
        options={{
          title: 'Bán hàng', headerShown: false,
          tabBarIcon: ({ focused }) => <TabIconPOS focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{ title: 'Thông báo', headerShown: false, tabBarIcon: ({ focused }) => <TabIconWithBadge emoji="🔔" focused={focused} badge={unread} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tôi', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Viewer: Tổng quan | Đơn hàng | Thông báo | Tôi (không có POS)
function ViewerTabs() {
  const unread = useUnreadCount()
  const { colors } = useTheme()
  return (
    <Tab.Navigator screenOptions={getTabOptions(colors)}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardSimpleStack}
        options={{ title: 'Tổng quan', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{ title: 'Đơn hàng', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} /> }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{ title: 'Thông báo', headerShown: false, tabBarIcon: ({ focused }) => <TabIconWithBadge emoji="🔔" focused={focused} badge={unread} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tôi', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Fallback tabs – dùng nếu role không xác định
function DefaultTabs() {
  const unread = useUnreadCount()
  const { colors } = useTheme()
  return (
    <Tab.Navigator screenOptions={getTabOptions(colors)}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardSimpleStack}
        options={{ title: 'Tổng quan', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{ title: 'Thông báo', headerShown: false, tabBarIcon: ({ focused }) => <TabIconWithBadge emoji="🔔" focused={focused} badge={unread} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tôi', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Chọn tab navigator phù hợp theo role
function MainTabs({ role }) {
  switch (role) {
    case 'Owner':
    case 'Manager':
      return <OwnerManagerTabs />
    case 'Staff':
      return <StaffTabs />
    case 'DataIT':
      return <DataITTabs />
    case 'Viewer':
      return <ViewerTabs />
    default:
      return <DefaultTabs />
  }
}

// ─── Auth Stack (chưa login) ──────────────────────────────────────────────────
function AuthNavigator() {
  const { colors } = useTheme()
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: true,
        ...getStackOptions(colors),
        headerTintColor: colors.primary,
      }}
    >
      <AuthStack.Screen name="Login"          component={LoginScreen}          options={{ headerShown: false }} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Quên mật khẩu'     }} />
      <AuthStack.Screen name="ResetPassword"  component={ResetPasswordScreen}  options={{ title: 'Đặt mật khẩu mới' }} />
    </AuthStack.Navigator>
  )
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useAuth()
  const { colors } = useTheme()

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: 16 }}>Đang tải...</Text>
      </View>
    )
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs role={user.role} /> : <AuthNavigator />}
    </NavigationContainer>
  )
}
