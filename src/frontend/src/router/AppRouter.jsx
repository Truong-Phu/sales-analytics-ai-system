import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { PageSpinner } from '../components/ui/Spinner'
import Layout from '../components/layout/Layout'
import ProtectedRoute from './ProtectedRoute'
import LoginPage       from '../pages/auth/LoginPage'
import RegisterPage    from '../pages/auth/RegisterPage'
import UnauthorizedPage from '../pages/UnauthorizedPage'

// Lazy load để giảm bundle size
const DashboardPage       = lazy(() => import('../pages/DashboardPage'))
const ForecastPage        = lazy(() => import('../pages/ForecastPage'))
const AnomalyPage         = lazy(() => import('../pages/AnomalyPage'))
const RecommendationsPage = lazy(() => import('../pages/RecommendationsPage'))
const OrdersPage          = lazy(() => import('../pages/OrdersPage'))
const DataSyncPage        = lazy(() => import('../pages/DataSyncPage'))
const EtlMonitorPage      = lazy(() => import('../pages/EtlMonitorPage'))
const ReportPage          = lazy(() => import('../pages/ReportPage'))
const AdminPage           = lazy(() => import('../pages/AdminPage'))
const SettingsPage        = lazy(() => import('../pages/SettingsPage'))
const ChangePasswordPage  = lazy(() => import('../pages/auth/ChangePasswordPage'))

// Roles tiện ích
const ALL_ROLES    = ['Owner', 'Manager', 'Staff', 'DataIT', 'Admin']
const ANALYST_ROLES = ['Owner', 'Manager', 'DataIT', 'Admin']
const DATA_ROLES   = ['DataIT', 'Admin']
const ADMIN_ONLY   = ['Admin']

function AppLayout({ children }) {
  return (
    <Layout>
      <Suspense fallback={<PageSpinner />}>
        {children}
      </Suspense>
    </Layout>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login"    element={<LoginPage />}    />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected routes – có Layout */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/dashboard" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <AppLayout><DashboardPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/forecast" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <AppLayout><ForecastPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/anomaly" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <AppLayout><AnomalyPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/recommendations" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <AppLayout><RecommendationsPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/orders" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <AppLayout><OrdersPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/data-sync" element={
          <ProtectedRoute roles={DATA_ROLES}>
            <AppLayout><DataSyncPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/etl-monitor" element={
          <ProtectedRoute roles={DATA_ROLES}>
            <AppLayout><EtlMonitorPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/report" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <AppLayout><ReportPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/admin" element={
          <ProtectedRoute roles={ADMIN_ONLY}>
            <AppLayout><AdminPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <AppLayout><SettingsPage /></AppLayout>
          </ProtectedRoute>
        } />

        <Route path="/change-password" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <AppLayout><ChangePasswordPage /></AppLayout>
          </ProtectedRoute>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
