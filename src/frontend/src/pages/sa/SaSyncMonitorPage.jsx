import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

const fmtDate = d => d ? new Date(d).toLocaleString('vi-VN') : '—'

const LEVEL_CFG = {
  INFO:     { bg: '#DBEAFE', color: '#1D4ED8' },
  WARN:     { bg: '#FEF9C3', color: '#92400E' },
  ERROR:    { bg: '#FEE2E2', color: '#991B1B' },
  CRITICAL: { bg: '#FEE2E2', color: '#7F1D1D' },
  DEBUG:    { bg: '#F1F5F9', color: '#475569' },
}

const LEVELS = ['', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG']
const PHASES = ['', 'EXTRACT', 'TRANSFORM', 'QUALITY_CHECK', 'LOAD', 'GENERAL']

export default function SaSyncMonitorPage() {
  const { t } = useTranslation()
  const [logs,    setLogs]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [page,    setPage]    = useState(1)
  const [levelFilter, setLevelFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const pageSize = 30

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, pageSize })
    if (levelFilter) params.set('level', levelFilter)
    if (phaseFilter) params.set('phase', phaseFilter)
    axios.get(`/api/admin/sa/sync-logs?${params}`)
      .then(r => { setLogs(r.data.data ?? []); setTotal(r.data.total ?? 0) })
      .catch(() => setError(t('common.cannotLoadData')))
      .finally(() => setLoading(false))
  }, [page, levelFilter, phaseFilter, t])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('sa.sync.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('sa.sync.subtitle', { count: total })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={levelFilter} onChange={e => { setLevelFilter(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {LEVELS.map(l => <option key={l} value={l}>{l || t('sa.sync.allLevels')}</option>)}
          </select>
          <select value={phaseFilter} onChange={e => { setPhaseFilter(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {PHASES.map(p => <option key={p} value={p}>{p || t('sa.sync.allPhases')}</option>)}
          </select>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <span className={`icon text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
            {t('sa.sync.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {loading && logs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: '#6366F1' }} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {[
                  t('sa.sync.colLogId'),
                  t('sa.sync.colJobId'),
                  t('sa.sync.colPhase'),
                  t('sa.sync.colLevel'),
                  t('sa.sync.colMessage'),
                  t('sa.sync.colRecords'),
                  t('sa.sync.colTime')
                ].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const lvCfg = LEVEL_CFG[l.level] ?? LEVEL_CFG.INFO
                return (
                  <tr key={l.logId} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      #{l.logId}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {l.jobId}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                        {l.phase}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: lvCfg.bg, color: lvCfg.color }}>
                        {l.level}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}
                        title={l.message ?? ''}>
                        {l.message ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {l.recordsCount ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(l.createdAt)}
                    </td>
                  </tr>
                )
              })}
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>{t('sa.sync.noData')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>{t('sa.sync.pageInfo', { page, total: totalPages, count: total })}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              {t('common.prev')}
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
