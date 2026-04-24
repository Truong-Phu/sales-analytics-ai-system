// QUAN TRỌNG: phải là dòng import ĐẦU TIÊN – yêu cầu của @react-navigation/stack
import 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/context/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#051424" />
      <AppNavigator />
    </AuthProvider>
  )
}
