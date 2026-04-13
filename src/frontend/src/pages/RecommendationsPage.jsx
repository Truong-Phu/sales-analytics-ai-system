import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '../components/ui/Spinner'
import { getRecommendations } from '../api/aiApi'

const TYPE_ICON = {
  revenue:  'payments',
  channel:  'store',
  product:  'inventory_2',
  anomaly:  'warning',
  general:  'lightbulb',
}

const PRIORITY_STYLE = {
  high:   'border-error/40 bg-error/5',
  medium: 'border-yellow-500/40 bg-yellow-500/5',
  low:    'border-outline-variant bg-surface-container',
}

const PRIORITY_BADGE = {
  high:   'badge-error',
  medium: 'badge-warning',
  low:    'badge-info',
}

export default function RecommendationsPage() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [filter,  setFilter]  = useState('all')

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getRecommendations()
      setData(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const filtered = data?.recommendations?.filter(
    r => filter === 'all' || r.type === filter
  ) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">
            {t('recommendations.title')}
          </h1>
          <p className="text-outline text-sm mt-0.5">{t('recommendations.subtitle')}</p>
        </div>
        <button
          onClick={fetchData}
          className="btn-secondary flex items-center gap-2"
        >
          <span className="icon text-base">refresh</span>
          Làm mới
        </button>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {['all', 'revenue', 'channel', 'product', 'anomaly', 'general'].map(type => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
              filter === type
                ? 'bg-primary-container border-primary text-on-surface'
                : 'border-outline-variant text-outline hover:text-on-surface'
            }`}
          >
            {type === 'all' ? 'Tất cả' : t(`recommendations.type.${type}`)}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-outline">
              <span className="icon text-5xl mb-3">sentiment_satisfied</span>
              <p>Không có đề xuất nào trong danh mục này</p>
            </div>
          ) : filtered.map((rec, i) => (
            <div
              key={i}
              className={`border rounded-2xl p-5 transition-all hover:border-outline ${
                PRIORITY_STYLE[rec.priority] ?? PRIORITY_STYLE.low
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-surface-container-highest
                                flex items-center justify-center">
                  <span className="icon text-primary">{TYPE_ICON[rec.type] ?? 'lightbulb'}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={PRIORITY_BADGE[rec.priority] ?? 'badge-info'}>
                      {t(`recommendations.priority.${rec.priority}`)}
                    </span>
                    <span className="badge-info">
                      {t(`recommendations.type.${rec.type}`)}
                    </span>
                  </div>
                  <p className="text-on-surface font-medium leading-relaxed">{rec.message}</p>
                  {rec.detail && (
                    <p className="text-outline text-sm mt-1">{rec.detail}</p>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-xs text-outline flex-shrink-0">
                  {new Date(data.generatedAt).toLocaleString('vi-VN', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <p className="text-xs text-outline text-center">
          {t('recommendations.generated')}: {new Date(data.generatedAt).toLocaleString('vi-VN')}
        </p>
      )}
    </div>
  )
}
