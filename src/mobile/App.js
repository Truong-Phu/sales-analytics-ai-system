// QUAN TRỌNG: phải là dòng import ĐẦU TIÊN – yêu cầu của @react-navigation/stack
import 'react-native-gesture-handler'
// Khởi tạo i18n trước khi render bất kỳ component nào
import './src/i18n'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/context/AuthContext'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import AppNavigator from './src/navigation/AppNavigator'

function AppWithTheme() {
  const { isDark } = useTheme()
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={isDark ? '#051424' : '#F8FAFC'} />
      <AppNavigator />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppWithTheme />
      </AuthProvider>
    </ThemeProvider>
  )
}
