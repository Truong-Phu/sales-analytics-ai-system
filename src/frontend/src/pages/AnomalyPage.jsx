import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '../components/ui/Spinner'
import { getAnomaly } from '../api/aiApi'

const SEVERITY_STYLE = {
  high:   'badge-error',
  medium: 'badge-warning',
  low:    'badge-info',
}

export default function AnomalyPage() {
  const { t } = useTranslation()
  const [days,    setDays]    = useState(90)
  const [channel, setChannel] = useState('all')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getAnomaly(days, channel)
      setData(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [days, channel])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('anomaly.title')}</h1>
        <p className="text-outline text-sm mt-0.5">{t('anomaly.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex bg-surface-container rounded-xl p-1 gap-1">
          {[30, 60, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                days === d
                  ? 'bg-primary-container text-on-surface'
                  : 'text-outline hover:text-on-surface'
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>

        <select
          value={channel}
          onChange={e => setChannel(e.target.value)}
          className="form-input !py-2 !px-3 text-sm"
        >
          <option value="all">Tất cả kênh</option>
          <option value="shopee">Shopee</option>
          <option value="lazada">Lazada</option>
          <option value="tiktok">TikTok Shop</option>
        </select>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
              <p className="text-outline text-sm">Tổng bất thường</p>
              <p className="font-headline text-3xl font-bold text-on-surface mt-1">
                {data.anomalies.length}
              </p>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
              <p className="text-outline text-sm">Nghiêm trọng cao</p>
              <p className="font-headline text-3xl font-bold text-error mt-1">
                {data.anomalies.filter(a => a.severity === 'high').length}
              </p>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
              <p className="text-outline text-sm">Z-score cao nhất</p>
              <p className="font-headline text-3xl font-bold text-primary mt-1">
                {data.anomalies.length > 0
                  ? Math.max(...data.anomalies.map(a => Math.abs(a.zScore))).toFixed(2)
                  : '–'
                }σ
              </p>
            </div>
          </div>

          {/* Anomaly list */}
          {data.anomalies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-outline">
              <span className="icon text-5xl mb-3 text-tertiary">check_circle</span>
              <p>{t('anomaly.noAnomaly')}</p>
            </div>
          ) : (
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
              <h3 className="font-headline font-semibold text-on-surface mb-4">
                Danh sách bất thường ({t('anomaly.detected')}: {data.anomalies.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      <th className="text-left text-outline font-medium pb-3 pr-6">{t('anomaly.date')}</th>
                      <th className="text-left text-outline font-medium pb-3 pr-6">Kênh</th>
                      <th className="text-right text-outline font-medium pb-3 pr-6">{t('anomaly.value')}</th>
                      <th className="text-right text-outline font-medium pb-3 pr-6">{t('anomaly.zscore')}</th>
                      <th className="text-center text-outline font-medium pb-3">Mức độ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {data.anomalies.map((a, i) => (
                      <tr key={i} className="hover:bg-surface-container/50 transition-colors">
                        <td className="py-3 pr-6 text-on-surface">{a.date}</td>
                        <td className="py-3 pr-6">
                          <span className="badge-info capitalize">{a.channel}</span>
                        </td>
                        <td className="py-3 pr-6 text-right text-on-surface">
                          ₫{(a.value / 1_000_000).toFixed(2)}M
                        </td>
                        <td className={`py-3 pr-6 text-right font-mono font-medium ${
                          Math.abs(a.zScore) >= 3 ? 'text-error' :
                          Math.abs(a.zScore) >= 2.5 ? 'text-yellow-400' : 'text-outline'
                        }`}>
                          {a.zScore.toFixed(2)}σ
                        </td>
                        <td className="py-3 text-center">
                          <span className={SEVERITY_STYLE[a.severity] ?? 'badge-info'}>
                            {t(`anomaly.severity.${a.severity}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
