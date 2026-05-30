import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import MockDataButton from '../../components/ui/MockDataButton'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getEtlStatus, triggerEtl } from '../../api/syncApi'
import { MOCK_ETL } from '../../mockData/etlMonitor'

const STATUS_CFG = {
  running: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: '#F59E0B',            dot: '#F59E0B',   icon: 'hourglass_top',   labelKey: 'etlMonitor.status.running' },
  success: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', color: 'var(--accent-500)',  dot: 'var(--accent-500)', icon: 'check_circle', labelKey: 'etlMonitor.status.success' },
  failed:  { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#EF4444',            dot: '#EF4444',   icon: 'cancel',          labelKey: 'etlMonitor.status.failed'  },
  pending: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.20)', color: 'var(--primary-500)', dot: 'var(--primary-500)', icon: 'schedule',   labelKey: 'etlMonitor.status.pending' },
}

function StatusBadge({ status }) {
  const { t } = useTranslation()
  const c = STATUS_CFG[status] ?? STATUS_CFG.pending
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      <span className="w-1.5 h-1.5 rounded-full"
            style={{ background: c.dot, ...(status === 'running' && { animation: 'pulse 1s infinite' }) }} />
      {t(c.labelKey)}
    </span>
  )
}

function ProgressBar({ status, duration }) {
  const pct = status === 'success' ? 100 : status === 'running' ? 60 : status === 'failed' ? 40 : 0
  const color = STATUS_CFG[status]?.dot ?? 'var(--primary-500)'
  return (
    <div className="h-1 rounded-full w-full" style={{ background: 'var(--bg-elevated)' }}>
      <div className="h-full rounded-full transition-all duration-700"
           style={{
             width: `${pct}%`,
             background: color,
             ...(status === 'running' && { animation: 'pulse 2s infinite' }),
           }} />
    </div>
  )
}

export default function EtlMonitorPage() {
  const { t } = useTranslation()
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [triggering, setTriggering] = useState({})
  const [isMock,     setIsMock]     = useState(false)
  const [expanded,   setExpanded]   = useState(null)
  const fetchedRef = useRef(false)

  const [showMockBtn, setShowMockBtn] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    setIsMock(false)
    setShowMockBtn(false)
    try {
      setData(await getEtlStatus())
    } catch {
      setData(null)
      setShowMockBtn(true)
    } finally {
      setLoading(false)
    }
  }

  const loadMock = () => { setData(MOCK_ETL); setIsMock(true); setShowMockBtn(false) }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; fetchData() }, [])

  const handleTrigger = async pipeline => {
    setTriggering(s => ({ ...s, [pipeline]: true }))
    try { await triggerEtl(pipeline); await fetchData() } catch { /* ignore */ }
    finally { setTriggering(s => ({ ...s, [pipeline]: false })) }
  }

  const pipelines = data?.pipelines ?? []
  const statCards = [
    { label: t('etlMonitor.totalPipelines'), value: pipelines.length,                                    color: 'var(--text-primary)', icon: 'account_tree' },
    { label: t('etlMonitor.status.running'), value: pipelines.filter(p => p.status === 'running').length, color: '#F59E0B',             icon: 'hourglass_top' },
    { label: t('etlMonitor.status.success'), value: pipelines.filter(p => p.status === 'success').length, color: 'var(--accent-500)',   icon: 'check_circle'  },
    { label: t('etlMonitor.status.failed'),  value: pipelines.filter(p => p.status === 'failed').length,  color: '#EF4444',             icon: 'cancel'        },
  ]

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />
      <MockDataButton show={showMockBtn} onClick={loadMock} />
      {!data && !loading && <AiEmptyState title="ETL Service chưa khởi động hoặc không kết nối được" />}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('etlMonitor.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('etlMonitor.subtitle')}</p>
        </div>
        <button onClick={fetchData} className="lbtn lbtn-secondary !h-9" disabled={loading}>
          <span className="icon text-base"
                style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
          {t('common.refresh')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="lcard p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{card.label}</span>
              <span className="icon w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ fontSize: 18, background: `${card.color}18`, color: card.color }}>
                {card.icon}
              </span>
            </div>
            <div className="font-mono text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Pipeline list */}
      {loading ? (
        <div className="lcard p-16 flex items-center justify-center">
          <span className="w-7 h-7 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div className="lcard overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('etlMonitor.pipelineList')}
            </h3>
          </div>

          <div className="divide-y" style={{ '--tw-divide-opacity': 1 }}>
            {pipelines.length === 0 ? (
              <div className="p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
                <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>account_tree</span>
                <p className="text-sm">{t('common.noData')}</p>
              </div>
            ) : pipelines.map(pipeline => {
              const isExpanded = expanded === pipeline.pipelineId
              const isBusy = triggering[pipeline.pipelineId] || pipeline.status === 'running'
              return (
                <div key={pipeline.pipelineId} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Main row */}
                  <div
                    className="px-5 py-4 flex items-start gap-4 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : pipeline.pipelineId)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Icon */}
                    <span className="icon w-9 h-9 flex items-center justify-center rounded-xl shrink-0 mt-0.5"
                          style={{ fontSize: 20, background: 'var(--bg-elevated)', color: 'var(--primary-500)' }}>
                      account_tree
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                          {pipeline.name}
                        </span>
                        <StatusBadge status={pipeline.status} />
                      </div>

                      {/* Progress bar */}
                      <ProgressBar status={pipeline.status} duration={pipeline.duration} />

                      {/* Meta */}
                      <div className="flex items-center gap-4 flex-wrap mt-2 text-xs"
                           style={{ color: 'var(--text-tertiary)' }}>
                        <span className="flex items-center gap-1">
                          <span className="icon" style={{ fontSize: 13 }}>schedule</span>
                          {pipeline.lastRun
                            ? new Date(pipeline.lastRun).toLocaleString('vi-VN')
                            : t('etlMonitor.neverRun')}
                        </span>
                        {pipeline.duration != null && (
                          <span className="flex items-center gap-1">
                            <span className="icon" style={{ fontSize: 13 }}>timer</span>
                            {pipeline.duration}s
                          </span>
                        )}
                        {pipeline.rowsProcessed != null && (
                          <span className="flex items-center gap-1">
                            <span className="icon" style={{ fontSize: 13 }}>table_rows</span>
                            <span className="font-mono">{pipeline.rowsProcessed.toLocaleString('vi-VN')}</span> dòng
                          </span>
                        )}
                      </div>

                      {pipeline.errorMessage && (
                        <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded-lg text-xs"
                             style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                          <span className="icon shrink-0" style={{ fontSize: 13 }}>error_outline</span>
                          {pipeline.errorMessage}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleTrigger(pipeline.pipelineId) }}
                        disabled={isBusy}
                        className="lbtn lbtn-secondary !h-8 !px-3 text-xs disabled:opacity-50"
                      >
                        {isBusy ? (
                          <span className="w-3.5 h-3.5 border-2 rounded-full"
                                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
                        ) : (
                          <span className="icon" style={{ fontSize: 15 }}>play_arrow</span>
                        )}
                        {t('etlMonitor.runManual')}
                      </button>
                      <span className="icon" style={{
                        fontSize: 20,
                        color: 'var(--text-tertiary)',
                        transform: isExpanded ? 'rotate(180deg)' : '',
                        transition: 'transform 0.2s',
                      }}>
                        expand_more
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs"
                         style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)' }}>
                      {[
                        { label: 'Pipeline ID', value: pipeline.pipelineId },
                        { label: 'Trạng thái',  value: STATUS_CFG[pipeline.status]?.label ?? pipeline.status },
                        { label: 'Thời lượng',  value: pipeline.duration != null ? `${pipeline.duration}s` : '–' },
                        { label: 'Hàng xử lý',  value: pipeline.rowsProcessed != null ? pipeline.rowsProcessed.toLocaleString() : '–' },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="mb-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.label}</div>
                          <div className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
