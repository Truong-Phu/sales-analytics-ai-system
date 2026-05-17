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

const Tab   = createBottomTabNavigator()
const Stack = createStackNavigator()
const AuthStack = createStackNavigator()

// Icon text đơn giản (thay Material Icons bằng emoji để không cần thêm native dependency)
function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  )
}

// Stack cho màn hình Orders (có AddOrder con)
function OrdersStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:      { backgroundColor: colors.surfaceContainerLow },
        headerTintColor:  colors.onSurface,
        headerTitleStyle: { fontWeight: '700', color: colors.onSurface },
        cardStyle:        { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="OrdersList" component={OrdersScreen}  options={{ title: 'Đơn hàng' }} />
      <Stack.Screen name="AddOrder"   component={AddOrderScreen} options={{ title: 'Thêm đơn hàng' }} />
    </Stack.Navigator>
  )
}

// Stack cho Profile (có ChangePassword con)
function ProfileStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle:      { backgroundColor: colors.surfaceContainerLow },
        headerTintColor:  colors.onSurface,
        headerTitleStyle: { fontWeight: '700', color: colors.onSurface },
        cardStyle:        { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="ProfileMain"     component={ProfileScreen}        options={{ title: 'Tài khoản' }} />
      <Stack.Screen name="ChangePassword"  component={ChangePasswordScreen} options={{ title: 'Đổi mật khẩu' }} />
    </Stack.Navigator>
  )
}

// Bottom tab navigation (sau login)
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
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
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Tổng quan',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersStack}
        options={{
          title: 'Đơn hàng',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛒" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          title: 'Cảnh báo',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚠️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          title: 'Tài khoản',
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  )
}

// Auth stack (chưa login)
function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle:      { backgroundColor: colors.surfaceContainerLow },
        headerTintColor:  colors.primary,
        headerTitleStyle: { fontWeight: '700', color: colors.onSurface },
        cardStyle:        { backgroundColor: colors.surface },
      }}
    >
      <AuthStack.Screen name="Login"          component={LoginScreen}          options={{ headerShown: false }} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Quên mật khẩu' }} />
      <AuthStack.Screen name="ResetPassword"  component={ResetPasswordScreen}  options={{ title: 'Đặt mật khẩu mới' }} />
    </AuthStack.Navigator>
  )
}

// Root navigator – tự động chuyển dựa trên user state
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
      {user ? <MainTabs /> : <AuthNavigator />}
    </NavigationContainer>
  )
}
