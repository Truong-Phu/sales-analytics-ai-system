import { AuthProvider } from './context/AuthContext'
import AppRouter from './router/AppRouter'

// Root component: bọc AuthProvider → AppRouter
export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
