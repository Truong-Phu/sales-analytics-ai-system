import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createStackNavigator }     from '@react-navigation/stack'
import { Text, View }               from 'react-native'
import { useAuth }                  from '../context/AuthContext'
import { colors }                   from '../components/theme'

// Screens
import LoginScreen           from '../screens/LoginScreen'
import ForgotPasswordScreen  from '../screens/ForgotPasswordScreen'
import ResetPasswordScreen   from '../screens/ResetPasswordScreen'
import DashboardScreen       from '../screens/DashboardScreen'
import OrdersScreen          from '../screens/OrdersScreen'
import AddOrderScreen        from '../screens/AddOrderScreen'
import AlertsScreen          from '../screens/AlertsScreen'
import ProfileScreen         from '../screens/ProfileScreen'
import ChangePasswordScreen  from '../screens/ChangePasswordScreen'
import ProductsScreen        from '../screens/ProductsScreen'
import QuickReportScreen     from '../screens/QuickReportScreen'
import CustomersScreen       from '../screens/CustomersScreen'

const Tab       = createBottomTabNavigator()
const Stack     = createStackNavigator()
const AuthStack = createStackNavigator()

// Cấu hình chung cho Stack headers
const STACK_SCREEN_OPTIONS = {
  headerStyle:      { backgroundColor: colors.surfaceContainerLow },
  headerTintColor:  colors.onSurface,
  headerTitleStyle: { fontWeight: '700', color: colors.onSurface },
  cardStyle:        { backgroundColor: colors.surface },
}

// Icon text đơn giản (emoji thay Material Icons để tránh native dependency)
function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  )
}

// ─── Sub-stacks ───────────────────────────────────────────────────────────────

// Dashboard Stack – bao gồm AlertsScreen để "Xem tất cả cảnh báo" hoạt động
// Dùng cho Staff/Owner/Manager (những role có Alerts trong DashboardStack thay vì tab riêng)
function DashboardWithAlertsStack() {
  return (
    <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Alerts" component={AlertsScreen} options={{ title: 'Cảnh báo & Thông báo' }} />
    </Stack.Navigator>
  )
}

// Dashboard Stack đơn giản (không có Alerts con – dùng cho DataIT/Viewer có tab Alerts riêng)
function DashboardSimpleStack() {
  return (
    <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}

// Orders Stack (Orders list + AddOrder)
function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="OrdersList" component={OrdersScreen}  options={{ title: 'Đơn hàng'     }} />
      <Stack.Screen name="AddOrder"   component={AddOrderScreen} options={{ title: 'Thêm đơn hàng' }} />
    </Stack.Navigator>
  )
}

// Products Stack
function ProductsStack() {
  return (
    <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="ProductsList" component={ProductsScreen} options={{ title: 'Sản phẩm' }} />
    </Stack.Navigator>
  )
}

// Reports + Customers Stack (Owner/Manager)
function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="QuickReport" component={QuickReportScreen} options={{ title: 'Báo cáo nhanh' }} />
      <Stack.Screen name="Customers"   component={CustomersScreen}   options={{ title: 'Khách hàng'   }} />
    </Stack.Navigator>
  )
}

// Profile Stack (Profile + ChangePassword)
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="ProfileMain"    component={ProfileScreen}        options={{ title: 'Tài khoản'    }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Đổi mật khẩu' }} />
    </Stack.Navigator>
  )
}

// ─── Tab cấu hình chuẩn ──────────────────────────────────────────────────────
const TAB_SCREEN_OPTIONS = {
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

// ─── Main Tabs theo role ──────────────────────────────────────────────────────

// Staff: Dashboard(+Alerts) | Orders(+Add) | Products | Profile
function StaffTabs() {
  return (
    <Tab.Navigator screenOptions={TAB_SCREEN_OPTIONS}>
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
        name="Products"
        component={ProductsStack}
        options={{ title: 'Sản phẩm', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tài khoản', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Owner / Manager: Dashboard(+Alerts) | Orders | Reports | Profile
function OwnerManagerTabs() {
  return (
    <Tab.Navigator screenOptions={TAB_SCREEN_OPTIONS}>
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
        name="Reports"
        component={ReportsStack}
        options={{ title: 'Báo cáo', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📈" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tài khoản', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// DataIT: Dashboard | Orders(view-only context, add button hidden by usePermission) | Alerts | Profile
function DataITTabs() {
  return (
    <Tab.Navigator screenOptions={TAB_SCREEN_OPTIONS}>
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
        name="Alerts"
        component={AlertsScreen}
        options={{ title: 'Cảnh báo', tabBarIcon: ({ focused }) => <TabIcon emoji="⚠️" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tài khoản', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Viewer: Dashboard | Orders(read-only) | Alerts | Profile
function ViewerTabs() {
  return (
    <Tab.Navigator screenOptions={TAB_SCREEN_OPTIONS}>
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
        name="Alerts"
        component={AlertsScreen}
        options={{ title: 'Cảnh báo', tabBarIcon: ({ focused }) => <TabIcon emoji="⚠️" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tài khoản', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  )
}

// Fallback tabs – dùng nếu role không xác định
function DefaultTabs() {
  return (
    <Tab.Navigator screenOptions={TAB_SCREEN_OPTIONS}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardSimpleStack}
        options={{ title: 'Tổng quan', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{ title: 'Cảnh báo', tabBarIcon: ({ focused }) => <TabIcon emoji="⚠️" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ title: 'Tài khoản', headerShown: false, tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
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
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: true,
        ...STACK_SCREEN_OPTIONS,
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
