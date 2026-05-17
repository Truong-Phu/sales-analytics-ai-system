import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { PageSpinner } from '../components/ui/Spinner'
import AppShell from '../components/layout/AppShell'
import AdminLayout from '../components/layout/AdminLayout'
import ProtectedRoute from './ProtectedRoute'
import SuperAdminRoute from './SuperAdminRoute'
import ErrorBoundary from '../components/ui/ErrorBoundary'
import LoginPage           from '../pages/auth/LoginPage'
import RegisterPage        from '../pages/auth/RegisterPage'
import ForgotPasswordPage  from '../pages/auth/ForgotPasswordPage'
import ResetPasswordPage   from '../pages/auth/ResetPasswordPage'
import UnauthorizedPage    from '../pages/UnauthorizedPage'

// Lazy load để giảm bundle size
const DashboardPage       = lazy(() => import('../pages/dashboard/DashboardPage'))
const ForecastPage        = lazy(() => import('../pages/ai-forecast/ForecastPage'))
const AnomalyPage         = lazy(() => import('../pages/anomaly/AnomalyPage'))
const RecommendationsPage = lazy(() => import('../pages/recommendations/RecommendationsPage'))
const OrdersPage          = lazy(() => import('../pages/orders/OrdersPage'))
const ProductsPage        = lazy(() => import('../pages/products/ProductsPage'))
const CategoriesPage      = lazy(() => import('../pages/categories/CategoriesPage'))
const CustomersPage       = lazy(() => import('../pages/customers/CustomersPage'))
const RfmPage             = lazy(() => import('../pages/customers/RfmPage'))
const NotificationsPage   = lazy(() => import('../pages/notifications/NotificationsPage'))
const DataSyncPage        = lazy(() => import('../pages/data-sync/DataSyncPage'))
const EtlMonitorPage      = lazy(() => import('../pages/etl-monitor/EtlMonitorPage'))
const ReportPage          = lazy(() => import('../pages/report/ReportPage'))
const AdminPage           = lazy(() => import('../pages/admin/AdminPage'))
const SettingsPage        = lazy(() => import('../pages/settings/SettingsPage'))
const ChangePasswordPage  = lazy(() => import('../pages/auth/ChangePasswordPage'))
const OnboardingPage      = lazy(() => import('../pages/OnboardingPage'))

// Super Admin pages (lazy)
const SaDashboard         = lazy(() => import('../pages/sa/SaDashboard'))
const SaCompaniesPage     = lazy(() => import('../pages/sa/SaCompaniesPage'))
const SaUsersPage         = lazy(() => import('../pages/sa/SaUsersPage'))
const SaSubscriptionsPage = lazy(() => import('../pages/sa/SaSubscriptionsPage'))
const SaSyncMonitorPage   = lazy(() => import('../pages/sa/SaSyncMonitorPage'))
const SaAuditLogsPage         = lazy(() => import('../pages/sa/SaAuditLogsPage'))
const SaPaymentAccountsPage   = lazy(() => import('../pages/sa/SaPaymentAccountsPage'))

// Chức năng sáng tạo mới
const ChurnPage       = lazy(() => import('../pages/churn/ChurnPage'))
const BasketPage      = lazy(() => import('../pages/basket/BasketPage'))
const InventoryPage   = lazy(() => import('../pages/inventory/InventoryPage'))
const WhatIfPage      = lazy(() => import('../pages/whatif/WhatIfPage'))
const AttributionPage = lazy(() => import('../pages/attribution/AttributionPage'))
const CampaignPage    = lazy(() => import('../pages/campaign/CampaignPage'))
const LeaderboardPage = lazy(() => import('../pages/leaderboard/LeaderboardPage'))
const NarrativePage   = lazy(() => import('../pages/narrative/NarrativePage'))

// Roles constants
const ALL_ROLES     = ['Owner', 'Manager', 'Staff', 'DataIT']
const ANALYST_ROLES = ['Owner', 'Manager', 'DataIT']
const DATA_ROLES    = ['DataIT', 'Owner']
const ADMIN_ONLY    = ['Owner']
const VIEWER_ROUTES = [...ALL_ROLES, 'Viewer']

function Shell({ children }) {
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<PageSpinner />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes – NO AppShell */}
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/register"        element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password"  element={<ResetPasswordPage />} />
        <Route path="/unauthorized"    element={<UnauthorizedPage />} />

        {/* Onboarding – requires auth, no AppShell, Owner/Manager only */}
        <Route path="/onboarding" element={
          <ProtectedRoute roles={['Owner', 'Manager']} skipOnboarding>
            <ErrorBoundary>
              <Suspense fallback={<PageSpinner />}>
                <OnboardingPage />
              </Suspense>
            </ErrorBoundary>
          </ProtectedRoute>
        } />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Analytics */}
        <Route path="/dashboard" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><DashboardPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/forecast" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><ForecastPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/anomaly" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><AnomalyPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/recommendations" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><RecommendationsPage /></Shell>
          </ProtectedRoute>
        } />

        {/* Data */}
        <Route path="/orders" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><OrdersPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/products" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <Shell><ProductsPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/categories" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <Shell><CategoriesPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/notifications" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><NotificationsPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/customers" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><CustomersPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/customers/rfm" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><RfmPage /></Shell>
          </ProtectedRoute>
        } />

        {/* Operations */}
        <Route path="/data-sync" element={
          <ProtectedRoute roles={DATA_ROLES}>
            <Shell><DataSyncPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/etl-monitor" element={
          <ProtectedRoute roles={DATA_ROLES}>
            <Shell><EtlMonitorPage /></Shell>
          </ProtectedRoute>
        } />

        {/* Reports */}
        <Route path="/report" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><ReportPage /></Shell>
          </ProtectedRoute>
        } />

        {/* ── Chức năng sáng tạo mới ── */}
        <Route path="/churn" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><ChurnPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/basket" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><BasketPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/inventory" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <Shell><InventoryPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/whatif" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><WhatIfPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/attribution" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><AttributionPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/campaign" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><CampaignPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/leaderboard" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><LeaderboardPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/narrative" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><NarrativePage /></Shell>
          </ProtectedRoute>
        } />

        {/* Admin */}
        <Route path="/admin" element={
          <ProtectedRoute roles={ADMIN_ONLY}>
            <Shell><AdminPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><SettingsPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/change-password" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><ChangePasswordPage /></Shell>
          </ProtectedRoute>
        } />

        {/* ── Super Admin Panel (/sa/*) ── */}
        <Route path="/sa" element={
          <SuperAdminRoute>
            <ErrorBoundary>
              <Suspense fallback={<PageSpinner />}>
                <AdminLayout />
              </Suspense>
            </ErrorBoundary>
          </SuperAdminRoute>
        }>
          <Route index                  element={<Suspense fallback={<PageSpinner />}><SaDashboard /></Suspense>} />
          <Route path="companies"       element={<Suspense fallback={<PageSpinner />}><SaCompaniesPage /></Suspense>} />
          <Route path="users"           element={<Suspense fallback={<PageSpinner />}><SaUsersPage /></Suspense>} />
          <Route path="subscriptions"   element={<Suspense fallback={<PageSpinner />}><SaSubscriptionsPage /></Suspense>} />
          <Route path="sync-monitor"    element={<Suspense fallback={<PageSpinner />}><SaSyncMonitorPage /></Suspense>} />
          <Route path="audit-logs"      element={<Suspense fallback={<PageSpinner />}><SaAuditLogsPage /></Suspense>} />
          <Route path="system/payment-accounts" element={<Suspense fallback={<PageSpinner />}><SaPaymentAccountsPage /></Suspense>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
