import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '../components/ui/Spinner'
import { getEtlStatus, triggerEtl } from '../api/syncApi'

const STATUS_STYLE = {
  running: { badge: 'badge-warning', icon: 'hourglass_top'    },
  success: { badge: 'badge-success', icon: 'check_circle'     },
  failed:  { badge: 'badge-error',   icon: 'cancel'           },
  pending: { badge: 'badge-info',    icon: 'schedule'         },
}

export default function EtlMonitorPage() {
  const { t } = useTranslation()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [triggering, setTriggering] = useState({})
  const [error,     setError]     = useState(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await getEtlStatus()
      setData(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleTrigger = async (pipeline) => {
    setTriggering(s => ({ ...s, [pipeline]: true }))
    try {
      await triggerEtl(pipeline)
      await fetchData()
    } catch {
      // ignore
    } finally {
      setTriggering(s => ({ ...s, [pipeline]: false }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">{t('etlMonitor.title')}</h1>
          <p className="text-outline text-sm mt-0.5">{t('etlMonitor.subtitle')}</p>
        </div>
        <button onClick={fetchData} className="btn-secondary flex items-center gap-2">
          <span className="icon text-base">refresh</span>
          Làm mới
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : data && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Tổng pipeline', value: data.pipelines?.length ?? 0,  color: 'text-on-surface' },
              { label: 'Đang chạy',     value: data.pipelines?.filter(p => p.status === 'running').length ?? 0, color: 'text-yellow-400' },
              { label: 'Thành công',    value: data.pipelines?.filter(p => p.status === 'success').length ?? 0, color: 'text-tertiary' },
              { label: 'Thất bại',      value: data.pipelines?.filter(p => p.status === 'failed').length  ?? 0, color: 'text-error' },
            ].map(stat => (
              <div key={stat.label}
                   className="bg-surface-container-low border border-outline-variant rounded-2xl p-4">
                <p className="text-outline text-sm">{stat.label}</p>
                <p className={`font-headline text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Pipeline list */}
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
            <h3 className="font-headline font-semibold text-on-surface mb-4">Danh sách pipeline</h3>
            <div className="space-y-3">
              {data.pipelines?.map(pipeline => {
                const s = STATUS_STYLE[pipeline.status] ?? STATUS_STYLE.pending
                return (
                  <div key={pipeline.pipelineId}
                       className="flex items-center gap-4 p-4 bg-surface-container rounded-xl
                                  border border-outline-variant/50">
                    <span className="icon text-primary text-xl">account_tree</span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-on-surface">{pipeline.name}</p>
                        <span className={s.badge}>{t(`etlMonitor.status.${pipeline.status}`)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-outline">
                        <span>{t('etlMonitor.lastRun')}: {
                          pipeline.lastRun
                            ? new Date(pipeline.lastRun).toLocaleString('vi-VN')
                            : 'Chưa chạy'
                        }</span>
                        {pipeline.duration && (
                          <span>{t('etlMonitor.duration')}: {pipeline.duration}s</span>
                        )}
                        {pipeline.rowsProcessed != null && (
                          <span>{t('etlMonitor.rowsProcessed')}: {pipeline.rowsProcessed.toLocaleString('vi-VN')}</span>
                        )}
                      </div>
                      {pipeline.errorMessage && (
                        <p className="text-error text-xs mt-1">{pipeline.errorMessage}</p>
                      )}
                    </div>

                    <button
                      onClick={() => handleTrigger(pipeline.pipelineId)}
                      disabled={triggering[pipeline.pipelineId] || pipeline.status === 'running'}
                      className="btn-secondary !py-1.5 !px-3 flex items-center gap-1.5 text-sm
                                 disabled:opacity-40 flex-shrink-0"
                    >
                      {triggering[pipeline.pipelineId]
                        ? <span className="w-3.5 h-3.5 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
                        : <span className="icon text-sm">play_arrow</span>
                      }
                      {t('etlMonitor.runManual')}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
