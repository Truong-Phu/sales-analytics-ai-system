import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '../components/ui/Spinner'
import { getSyncStatus, triggerSync } from '../api/syncApi'

const SOURCE_ICON = {
  shopee:   'storefront',
  lazada:   'store',
  tiktok:   'play_circle',
  facebook: 'thumb_up',
  ghn:      'local_shipping',
  vnpay:    'payments',
}

const STATUS_STYLE = {
  idle:    { badge: 'badge-info',    icon: 'radio_button_unchecked', color: 'text-outline'  },
  syncing: { badge: 'badge-warning', icon: 'sync',                   color: 'text-yellow-400 animate-spin' },
  success: { badge: 'badge-success', icon: 'check_circle',           color: 'text-tertiary' },
  error:   { badge: 'badge-error',   icon: 'error',                  color: 'text-error'    },
}

export default function DataSyncPage() {
  const { t } = useTranslation()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [syncing,   setSyncing]   = useState({})
  const [error,     setError]     = useState(null)

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const res = await getSyncStatus()
      setData(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleSync = async (source) => {
    setSyncing(s => ({ ...s, [source]: true }))
    try {
      await triggerSync(source)
      await fetchStatus()
    } catch {
      // ignore – status sẽ update khi fetch lại
    } finally {
      setSyncing(s => ({ ...s, [source]: false }))
    }
  }

  const handleSyncAll = async () => {
    if (data?.sources) {
      await Promise.all(data.sources.map(s => handleSync(s.sourceKey)))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">{t('dataSync.title')}</h1>
          <p className="text-outline text-sm mt-0.5">{t('dataSync.subtitle')}</p>
        </div>
        <button onClick={handleSyncAll} className="btn-primary flex items-center gap-2">
          <span className="icon text-base">sync_alt</span>
          Đồng bộ tất cả
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.sources?.map(src => {
            const s = STATUS_STYLE[src.status] ?? STATUS_STYLE.idle
            return (
              <div
                key={src.sourceKey}
                className="bg-surface-container-low border border-outline-variant rounded-2xl p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest
                                    flex items-center justify-center">
                      <span className="icon text-primary">
                        {SOURCE_ICON[src.sourceKey] ?? 'api'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-on-surface">
                        {t(`dataSync.sources.${src.sourceKey}`, src.sourceName)}
                      </p>
                      <span className={s.badge}>
                        {t(`dataSync.syncStatus.${src.status}`)}
                      </span>
                    </div>
                  </div>
                  <span className={`icon ${s.color}`}>{s.icon}</span>
                </div>

                <div className="space-y-1 text-sm text-outline mb-4">
                  <p>{t('dataSync.lastSync')}: {
                    src.lastSync
                      ? new Date(src.lastSync).toLocaleString('vi-VN')
                      : 'Chưa đồng bộ'
                  }</p>
                  {src.recordsSynced != null && (
                    <p>Bản ghi: {src.recordsSynced.toLocaleString('vi-VN')}</p>
                  )}
                  {src.errorMessage && (
                    <p className="text-error text-xs">{src.errorMessage}</p>
                  )}
                </div>

                <button
                  onClick={() => handleSync(src.sourceKey)}
                  disabled={syncing[src.sourceKey] || src.status === 'syncing'}
                  className="btn-secondary w-full flex items-center justify-center gap-2 !py-2"
                >
                  {syncing[src.sourceKey]
                    ? <span className="w-4 h-4 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
                    : <span className="icon text-base">sync</span>
                  }
                  {t('dataSync.syncNow')}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
