import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import KpiCard from '../components/ui/KpiCard'
import RevenueLineChart from '../components/charts/RevenueLineChart'
import ChannelDonutChart from '../components/charts/ChannelDonutChart'
import { PageSpinner } from '../components/ui/Spinner'
import { getDashboard } from '../api/dashboardApi'

// Tính ngày mặc định: 30 ngày gần nhất
function defaultRange(days = 30) {
  const to   = new Date()
  const from = new Date(Date.now() - days * 86_400_000)
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}

const PERIODS = [
  { key: '7d',  label: '7 ngày',  days: 7  },
  { key: '30d', label: '30 ngày', days: 30 },
  { key: '90d', label: '90 ngày', days: 90 },
]

const CHANNELS = [
  { key: 'all',      label: 'Tất cả kênh' },
  { key: 'shopee',   label: 'Shopee'       },
  { key: 'lazada',   label: 'Lazada'       },
  { key: 'tiktok',   label: 'TikTok Shop'  },
  { key: 'facebook', label: 'Facebook'     },
  { key: 'website',  label: 'Website'      },
]

export default function DashboardPage() {
  const { t } = useTranslation()
  const [period,  setPeriod]  = useState('30d')
  const [channel, setChannel] = useState('all')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p    = PERIODS.find(x => x.key === period)
      const range = defaultRange(p.days)
      const res   = await getDashboard(range.from, range.to, channel)
      setData(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [period, channel, t])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">
            {t('dashboard.title')}
          </h1>
          <p className="text-outline text-sm mt-0.5">
            Cập nhật lần cuối: {new Date().toLocaleString('vi-VN')}
          </p>
        </div>

        {/* Bộ lọc */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Khoảng thời gian */}
          <div className="flex bg-surface-container rounded-xl p-1 gap-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  period === p.key
                    ? 'bg-primary-container text-on-surface'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Kênh */}
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="form-input !py-2 !px-3 text-sm min-w-[140px]"
          >
            {CHANNELS.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>

          <button
            onClick={fetchData}
            className="btn-secondary !py-2 !px-3 flex items-center gap-1.5"
          >
            <span className="icon text-base">refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm flex items-center gap-2">
          <span className="icon text-base">error_outline</span>
          {error}
          <button onClick={fetchData} className="ml-auto text-xs underline">{t('common.retry')}</button>
        </div>
      )}

      {loading ? <PageSpinner /> : data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              label={t('dashboard.kpi.revenue')}
              value={`₫${(data.kpi.totalRevenue / 1_000_000).toFixed(1)}M`}
              trend={data.kpi.revenueTrend}
              icon="payments"
            />
            <KpiCard
              label={t('dashboard.kpi.orders')}
              value={data.kpi.totalOrders.toLocaleString('vi-VN')}
              trend={data.kpi.ordersTrend}
              icon="shopping_cart"
            />
            <KpiCard
              label={t('dashboard.kpi.aov')}
              value={`₫${(data.kpi.avgOrderValue / 1_000).toFixed(0)}K`}
              trend={data.kpi.aovTrend}
              icon="receipt_long"
            />
            <KpiCard
              label={t('dashboard.kpi.newCustomers')}
              value={data.kpi.newCustomers.toLocaleString('vi-VN')}
              trend={data.kpi.customersTrend}
              icon="person_add"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Revenue line chart – chiếm 2/3 */}
            <div className="xl:col-span-2 bg-surface-container-low border border-outline-variant rounded-2xl p-5">
              <h3 className="font-headline font-semibold text-on-surface mb-4">
                {t('dashboard.revenueChart')}
              </h3>
              <RevenueLineChart
                labels={data.revenueByDay.map(d => d.date)}
                revenue={data.revenueByDay.map(d => d.revenue)}
                profit={data.revenueByDay.map(d => d.profit)}
              />
            </div>

            {/* Donut chart */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
              <h3 className="font-headline font-semibold text-on-surface mb-4">
                {t('dashboard.channelChart')}
              </h3>
              <ChannelDonutChart channels={data.revenueByChannel} />
            </div>
          </div>

          {/* Top products */}
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
            <h3 className="font-headline font-semibold text-on-surface mb-4">
              {t('dashboard.topProducts')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <th className="text-left text-outline font-medium pb-3 pr-4">#</th>
                    <th className="text-left text-outline font-medium pb-3 pr-4">Sản phẩm</th>
                    <th className="text-left text-outline font-medium pb-3 pr-4">Kênh</th>
                    <th className="text-right text-outline font-medium pb-3 pr-4">Đơn hàng</th>
                    <th className="text-right text-outline font-medium pb-3">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {data.topProducts.map((p, i) => (
                    <tr key={p.productId} className="hover:bg-surface-container/50 transition-colors">
                      <td className="py-3 pr-4 text-outline">{i + 1}</td>
                      <td className="py-3 pr-4 text-on-surface font-medium">{p.productName}</td>
                      <td className="py-3 pr-4">
                        <span className="badge-info capitalize">{p.channel}</span>
                      </td>
                      <td className="py-3 pr-4 text-right text-on-surface">
                        {p.totalOrders.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 text-right text-primary font-medium">
                        ₫{(p.totalRevenue / 1_000_000).toFixed(2)}M
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
