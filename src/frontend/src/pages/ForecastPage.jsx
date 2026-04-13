import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ForecastChart from '../components/charts/ForecastChart'
import { PageSpinner } from '../components/ui/Spinner'
import { getForecast, getTrend } from '../api/aiApi'

const HORIZONS = [7, 14, 30, 60, 90]
const CHANNELS = [
  { key: 'all',      label: 'Tất cả kênh' },
  { key: 'shopee',   label: 'Shopee'       },
  { key: 'lazada',   label: 'Lazada'       },
  { key: 'tiktok',   label: 'TikTok Shop'  },
]

export default function ForecastPage() {
  const { t } = useTranslation()
  const [horizon,  setHorizon]  = useState(30)
  const [channel,  setChannel]  = useState('all')
  const [result,   setResult]   = useState(null)
  const [trend,    setTrend]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    try {
      const [fc, tr] = await Promise.all([
        getForecast(horizon, channel),
        getTrend(30, channel),
      ])
      setResult(fc)
      setTrend(tr)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('forecast.title')}</h1>
        <p className="text-outline text-sm mt-0.5">{t('forecast.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5
                      flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm text-outline mb-1.5">{t('forecast.horizon')} (ngày)</label>
          <div className="flex gap-2">
            {HORIZONS.map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  horizon === h
                    ? 'bg-primary-container border-primary text-on-surface'
                    : 'border-outline-variant text-outline hover:text-on-surface'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-outline mb-1.5">{t('forecast.channel')}</label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="form-input !py-2"
          >
            {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <button
          onClick={handleRun}
          disabled={loading}
          className="btn-primary flex items-center gap-2 self-end"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-surface/30 border-t-surface rounded-full animate-spin" />
            : <span className="icon text-base">smart_toy</span>
          }
          {t('forecast.runForecast')}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading && <PageSpinner />}

      {!loading && result && (
        <>
          {/* Trend summary cards */}
          {trend && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
                <p className="text-outline text-sm">{t('forecast.trend')}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`icon text-2xl ${
                    trend.direction === 'UP'   ? 'text-tertiary' :
                    trend.direction === 'DOWN' ? 'text-error'    : 'text-outline'
                  }`}>
                    {trend.direction === 'UP' ? 'trending_up' : trend.direction === 'DOWN' ? 'trending_down' : 'trending_flat'}
                  </span>
                  <span className="font-headline text-lg font-semibold text-on-surface capitalize">
                    {t(`dashboard.trend.${trend.direction.toLowerCase()}`)}
                  </span>
                </div>
              </div>

              <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
                <p className="text-outline text-sm">{t('forecast.growth')}</p>
                <p className={`font-headline text-2xl font-bold mt-2 ${
                  trend.growthRate >= 0 ? 'text-tertiary' : 'text-error'
                }`}>
                  {trend.growthRate >= 0 ? '+' : ''}{(trend.growthRate * 100).toFixed(1)}%
                </p>
              </div>

              <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
                <p className="text-outline text-sm">MA7 (7 ngày)</p>
                <p className="font-headline text-2xl font-bold text-on-surface mt-2">
                  ₫{(trend.ma7 / 1_000_000).toFixed(1)}M
                </p>
              </div>
            </div>
          )}

          {/* Forecast chart */}
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-headline font-semibold text-on-surface">
                Biểu đồ dự báo {horizon} ngày
              </h3>
              <span className="badge-info text-xs">{t('forecast.confidence')}</span>
            </div>
            <ForecastChart
              history={result.history}
              forecast={result.forecast}
              height={380}
            />
          </div>

          {/* Forecast table */}
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
            <h3 className="font-headline font-semibold text-on-surface mb-4">
              Chi tiết dự báo ({horizon} ngày tới)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline-variant">
                    <th className="text-left text-outline font-medium pb-3 pr-6">Ngày</th>
                    <th className="text-right text-outline font-medium pb-3 pr-6">{t('forecast.predicted')}</th>
                    <th className="text-right text-outline font-medium pb-3 pr-6">{t('forecast.lower')}</th>
                    <th className="text-right text-outline font-medium pb-3">{t('forecast.upper')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {result.forecast.slice(0, 14).map(row => (
                    <tr key={row.date}>
                      <td className="py-2.5 pr-6 text-on-surface">{row.date}</td>
                      <td className="py-2.5 pr-6 text-right text-primary font-medium">
                        ₫{(row.forecast / 1_000_000).toFixed(2)}M
                      </td>
                      <td className="py-2.5 pr-6 text-right text-outline">
                        ₫{(row.lower / 1_000_000).toFixed(2)}M
                      </td>
                      <td className="py-2.5 text-right text-outline">
                        ₫{(row.upper / 1_000_000).toFixed(2)}M
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !result && (
        <div className="flex flex-col items-center justify-center py-20 text-outline">
          <span className="icon text-5xl mb-3">query_stats</span>
          <p>Chọn tham số và nhấn <strong>Chạy dự báo</strong> để xem kết quả</p>
        </div>
      )}
    </div>
  )
}
