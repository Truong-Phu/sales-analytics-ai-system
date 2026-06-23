import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { useAuth } from '../hooks/useAuth'
import { PageSpinner } from '../components/ui/Spinner'
import AppShell from '../components/layout/AppShell'
import AdminLayout from '../components/layout/AdminLayout'
import ProtectedRoute from './ProtectedRoute'
import SuperAdminRoute from './SuperAdminRoute'
import PlanRoute from './PlanRoute'
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
const LoyaltyVouchersPage = lazy(() => import('../pages/loyalty/LoyaltyVouchersPage'))
const ChangePasswordPage  = lazy(() => import('../pages/auth/ChangePasswordPage'))
const OnboardingPage      = lazy(() => import('../pages/OnboardingPage'))

// Super Admin pages (lazy)
const SaPaymentSettingsPage = lazy(() => import('../pages/sa/SaPaymentSettingsPage'))
const SaDashboard         = lazy(() => import('../pages/sa/SaDashboard'))
const SaCompaniesPage     = lazy(() => import('../pages/sa/SaCompaniesPage'))
const SaUsersPage         = lazy(() => import('../pages/sa/SaUsersPage'))
const SaSubscriptionsPage = lazy(() => import('../pages/sa/SaSubscriptionsPage'))
const SaSyncMonitorPage   = lazy(() => import('../pages/sa/SaSyncMonitorPage'))
const SaAuditLogsPage         = lazy(() => import('../pages/sa/SaAuditLogsPage'))
const SaPaymentAccountsPage   = lazy(() => import('../pages/sa/SaPaymentAccountsPage'))
const SaAnalyticsPage         = lazy(() => import('../pages/sa/SaAnalyticsPage'))
const SaUsagePage             = lazy(() => import('../pages/sa/SaUsagePage'))

// Payment pages
const VietQRPage          = lazy(() => import('../pages/payment/VietQRPage'))
const PaymentHistoryPage  = lazy(() => import('../pages/payment/PaymentHistoryPage'))

// Chức năng sáng tạo mới
const ChurnPage       = lazy(() => import('../pages/churn/ChurnPage'))
const BasketPage      = lazy(() => import('../pages/basket/BasketPage'))
const InventoryPage              = lazy(() => import('../pages/inventory/InventoryPage'))
const InventoryTransactionsPage  = lazy(() => import('../pages/inventory/InventoryTransactionsPage'))
const InventoryDashboardPage     = lazy(() => import('../pages/inventory/InventoryDashboardPage'))
const StockAdjustmentsPage       = lazy(() => import('../pages/inventory/StockAdjustmentsPage'))
const SuppliersManagementPage    = lazy(() => import('../pages/supplier/SuppliersManagementPage'))
const PurchaseOrdersPage         = lazy(() => import('../pages/procurement/PurchaseOrdersPage'))
const GoodsReceiptsPage          = lazy(() => import('../pages/procurement/GoodsReceiptsPage'))
const WhatIfPage      = lazy(() => import('../pages/whatif/WhatIfPage'))
const AttributionPage = lazy(() => import('../pages/attribution/AttributionPage'))
const CampaignPage    = lazy(() => import('../pages/campaign/CampaignPage'))
const LeaderboardPage = lazy(() => import('../pages/leaderboard/LeaderboardPage'))
const NarrativePage   = lazy(() => import('../pages/narrative/NarrativePage'))
const GeoPage         = lazy(() => import('../pages/geo/GeoPage'))

const PricePage       = lazy(() => import('../pages/price/PricePage'))
const SentimentPage   = lazy(() => import('../pages/sentiment/SentimentPage'))
const PosPage         = lazy(() => import('../pages/pos/PosPage'))
const ProfitPage              = lazy(() => import('../pages/finance/ProfitPage'))
const KpiFormulasPage         = lazy(() => import('../pages/finance/KpiFormulasPage'))
const OperatingExpensesPage   = lazy(() => import('../pages/finance/OperatingExpensesPage'))
const PnLPage                 = lazy(() => import('../pages/finance/PnLPage'))
const AdSpendPage             = lazy(() => import('../pages/marketing/AdSpendPage'))

// Roles constants
const ALL_ROLES     = ['Owner', 'Manager', 'Staff_Sales', 'Staff_Warehouse', 'Staff_Marketing', 'Staff', 'DataIT']
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

// Redirect thông minh: SuperAdmin → /sa, còn lại → /dashboard
function RootRedirect() {
  const { user } = useAuth()
  return <Navigate to={user?.isSuperAdmin ? '/sa' : '/dashboard'} replace />
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

        {/* Root redirect — SA đến /sa, các role khác đến /dashboard */}
        <Route path="/" element={<RootRedirect />} />

        {/* Analytics */}
        <Route path="/dashboard" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><DashboardPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/forecast" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Dự báo doanh thu AI">
              <Shell><ForecastPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />

        <Route path="/anomaly" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phát hiện bất thường">
              <Shell><AnomalyPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />

        <Route path="/recommendations" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Gợi ý thông minh AI">
              <Shell><RecommendationsPage /></Shell>
            </PlanRoute>
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
            <PlanRoute minPlan="pro" feature="Phân tích khách hàng">
              <Shell><CustomersPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />

        <Route path="/customers/rfm" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích RFM">
              <Shell><RfmPage /></Shell>
            </PlanRoute>
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
            <PlanRoute minPlan="pro" feature="Xuất báo cáo nâng cao">
              <Shell><ReportPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />

        {/* ── Chức năng sáng tạo mới ── */}
        <Route path="/churn" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Dự báo rời bỏ khách hàng">
              <Shell><ChurnPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/basket" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích giỏ hàng">
              <Shell><BasketPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/inventory" element={
          <ProtectedRoute roles={ALL_ROLES}>
            <PlanRoute minPlan="pro" feature="Tồn kho thông minh">
              <Shell><InventoryPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/inventory/transactions" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'DataIT']}>
            <Shell><InventoryTransactionsPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/inventory/dashboard" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'DataIT']}>
            <PlanRoute minPlan="pro" feature="Tồn kho thông minh AI">
              <Shell><InventoryDashboardPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/stock-adjustments" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'DataIT']}>
            <Shell><StockAdjustmentsPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/suppliers" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'DataIT']}>
            <Shell><SuppliersManagementPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/purchase-orders" element={
          <ProtectedRoute roles={['Owner', 'Manager']}>
            <Shell><PurchaseOrdersPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/goods-receipts" element={
          <ProtectedRoute roles={['Owner', 'Manager']}>
            <Shell><GoodsReceiptsPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/whatif" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích giả định What-If">
              <Shell><WhatIfPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/attribution" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân bổ kênh marketing">
              <Shell><AttributionPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/campaign" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích chiến dịch">
              <Shell><CampaignPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/leaderboard" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <PlanRoute minPlan="pro" feature="Bảng xếp hạng nhân viên">
              <Shell><LeaderboardPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/narrative" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Tường thuật AI">
              <Shell><NarrativePage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/geo" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích địa lý">
              <Shell><GeoPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        {/* /supplier removed — supplier analytics covered by /inventory/dashboard */}
        <Route path="/price" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích giá">
              <Shell><PricePage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/sentiment" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích cảm xúc">
              <Shell><SentimentPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />

        {/* ── Payment ── */}
        <Route path="/payment/vietqr" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'Staff_Sales', 'Staff']}>
            <Shell><VietQRPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/payment/history" element={
          <ProtectedRoute roles={VIEWER_ROUTES}>
            <Shell><PaymentHistoryPage /></Shell>
          </ProtectedRoute>
        } />

        {/* POS — Bán hàng tại quầy: Staff_Sales */}
        <Route path="/pos" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'Staff_Sales', 'Staff']}>
            <Shell><PosPage /></Shell>
          </ProtectedRoute>
        } />

        <Route path="/loyalty-vouchers" element={
          <ProtectedRoute roles={['Owner', 'Manager']}>
            <Shell><LoyaltyVouchersPage /></Shell>
          </ProtectedRoute>
        } />

        {/* Finance Module — tất cả routes /finance/* */}
        <Route path="/finance/profit" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Phân tích lợi nhuận nâng cao">
              <Shell><ProfitPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/finance/ad-spend" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'Staff_Marketing']}>
            <Shell><AdSpendPage /></Shell>
          </ProtectedRoute>
        } />
        <Route path="/finance/operating-expenses" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Quản lý chi phí vận hành">
              <Shell><OperatingExpensesPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/finance/pnl" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <PlanRoute minPlan="pro" feature="Báo cáo P&L đầy đủ">
              <Shell><PnLPage /></Shell>
            </PlanRoute>
          </ProtectedRoute>
        } />
        <Route path="/finance/kpi-formulas" element={
          <ProtectedRoute roles={ANALYST_ROLES}>
            <Shell><KpiFormulasPage /></Shell>
          </ProtectedRoute>
        } />

        {/* Marketing — Nhập chi phí quảng cáo */}
        <Route path="/marketing/ad-spend" element={
          <ProtectedRoute roles={['Owner', 'Manager', 'Staff_Marketing']}>
            <Shell><AdSpendPage /></Shell>
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
          <Route path="payment-settings" element={<Suspense fallback={<PageSpinner />}><SaPaymentSettingsPage /></Suspense>} />
          <Route path="analytics"       element={<Suspense fallback={<PageSpinner />}><SaAnalyticsPage /></Suspense>} />
          <Route path="usage"           element={<Suspense fallback={<PageSpinner />}><SaUsagePage /></Suspense>} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}
