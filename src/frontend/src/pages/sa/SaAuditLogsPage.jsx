import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

const fmtDate = d => d ? new Date(d).toLocaleString('vi-VN') : '—'

const STATUS_CFG = {
  SUCCESS:      { bg: '#D1FAE5', color: '#065F46' },
  FAILED:       { bg: '#FEE2E2', color: '#991B1B' },
  UNAUTHORIZED: { bg: '#FEF9C3', color: '#92400E' },
}

const ACTIONS = [
  '', 'LOGIN', 'LOGOUT', 'REGISTER', 'CHANGE_PASSWORD',
  'CREATE_ORDER', 'UPDATE_ORDER', 'APPROVE_USER', 'DEACTIVATE_USER',
  'ACTIVATE_USER', 'CHANGE_ROLE', 'EXPORT_PDF',
  'SA_UPDATE_SUBSCRIPTION', 'ACTIVATE_COMPANY', 'DEACTIVATE_COMPANY',
]

export default function SaAuditLogsPage() {
  const { t } = useTranslation()
  const [logs,    setLogs]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [page,    setPage]    = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const pageSize = 50

  const getStatusLabel = (status) => {
    switch (status) {
      case 'SUCCESS': return t('sa.statusSuccess', 'SUCCESS')
      case 'FAILED': return t('sa.statusFailed', 'FAILED')
      case 'UNAUTHORIZED': return t('sa.statusUnauthorized', 'UNAUTHORIZED')
      default: return status
    }
  }

  const getErrorMessageLabel = (msg) => {
    if (!msg) return '—'
    switch (msg) {
      case 'Sai tên đăng nhập hoặc mật khẩu':
        return t('sa.audit.errInvalidCredentials', 'Sai tên đăng nhập hoặc mật khẩu')
      case 'Mật khẩu cũ không đúng':
        return t('sa.audit.errOldPasswordIncorrect', 'Mật khẩu cũ không đúng')
      default:
        return msg
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, pageSize })
    if (actionFilter) params.set('action', actionFilter)
    if (dateFrom)     params.set('from',   new Date(dateFrom).toISOString())
    if (dateTo)       params.set('to',     new Date(dateTo + 'T23:59:59').toISOString())
    axios.get(`/api/admin/sa/audit-logs?${params}`)
      .then(r => { setLogs(r.data.data ?? []); setTotal(r.data.total ?? 0) })
      .catch(() => setError(t('common.cannotLoadData')))
      .finally(() => setLoading(false))
  }, [page, actionFilter, dateFrom, dateTo, t])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('sa.audit.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {t('sa.audit.subtitle', { count: total })}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>{t('sa.audit.colAction')}</label>
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {ACTIONS.map(a => <option key={a} value={a}>{a || t('sa.audit.allActions')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>{t('sa.audit.from')}</label>
          <input type="date" value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>{t('sa.audit.to')}</label>
          <input type="date" value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </div>
        {(actionFilter || dateFrom || dateTo) && (
          <button onClick={() => { setActionFilter(''); setDateFrom(''); setDateTo(''); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {t('sa.audit.clear')}
          </button>
        )}
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
                  t('sa.audit.colTime'),
                  t('sa.audit.colUser'),
                  t('sa.audit.colAction'),
                  t('sa.audit.colTarget'),
                  t('sa.audit.colStatus'),
                  t('sa.audit.colIp'),
                  t('sa.audit.colDetails')
                ].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => {
                const stCfg = STATUS_CFG[l.status] ?? STATUS_CFG.SUCCESS
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(l.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {l.username ?? '—'}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        #{l.userId}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                        {l.action}
                      </code>
                    </td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {l.entityType && <span>{l.entityType}</span>}
                      {l.entityId && <span className="ml-1 opacity-60">#{l.entityId}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: stCfg.bg, color: stCfg.color }}>
                        {getStatusLabel(l.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {l.ipAddress ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs max-w-xs">
                      {l.errorMessage && (
                        <p className="truncate text-red-500" title={getErrorMessageLabel(l.errorMessage)}>
                          {getErrorMessageLabel(l.errorMessage)}
                        </p>
                      )}
                    </td>
                  </tr>
                )
              })}
              {logs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>{t('sa.audit.noData')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>{t('sa.audit.pageInfo', { page, total: totalPages, count: total })}</span>
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
