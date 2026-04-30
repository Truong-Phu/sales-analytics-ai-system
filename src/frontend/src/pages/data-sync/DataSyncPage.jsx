import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getSyncStatus, triggerSync } from '../../api/syncApi'
import { MOCK_DATA_SYNC } from '../../mockData/dataSync'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function fetchKeywords() {
  const r = await fetch(`${API_BASE}/api/scraper/keywords`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
  })
  if (!r.ok) throw new Error('Lỗi tải keywords')
  return (await r.json()).keywords
}

async function addKeyword(keyword, sourceType = 'google') {
  const r = await fetch(`${API_BASE}/api/scraper/keywords`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    },
    body: JSON.stringify({ keyword, sourceType }),
  })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error(data.message ?? 'Lỗi thêm keyword')
  }
}

async function toggleKeyword(id) {
  const r = await fetch(`${API_BASE}/api/scraper/keywords/${id}/toggle`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
  })
  if (!r.ok) throw new Error('Lỗi toggle keyword')
}

async function deleteKeyword(id) {
  const r = await fetch(`${API_BASE}/api/scraper/keywords/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
  })
  if (!r.ok) throw new Error('Lỗi xóa keyword')
}

function KeywordManager() {
  const [keywords, setKeywords] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [input,    setInput]    = useState('')
  const [srcType,  setSrcType]  = useState('google')
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')

  const load = async () => {
    setLoading(true)
    try { setKeywords(await fetchKeywords()) } catch { /* ignore — không crash */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!input.trim()) return
    setBusy(true); setError('')
    try {
      await addKeyword(input.trim(), srcType)
      setInput('')
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async id => {
    setBusy(true)
    try { await toggleKeyword(id); await load() } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  const handleDelete = async id => {
    if (!confirm('Xóa từ khóa này?')) return
    setBusy(true)
    try { await deleteKeyword(id); await load() } catch { /* ignore */ }
    finally { setBusy(false) }
  }

  return (
    <div className="lcard p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>search</span>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Từ khóa tìm kiếm Scraper
        </h2>
        <span className="text-xs ml-1 px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(100,116,139,0.10)', color: 'var(--text-tertiary)' }}>
          {keywords.filter(k => k.isActive).length} active
        </span>
      </div>

      {/* Add form */}
      <div className="flex gap-2 flex-wrap">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Nhập từ khóa tìm kiếm..."
          className="lbtn flex-1 min-w-0 !h-9 !px-3 text-sm border"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
        />
        <select
          value={srcType}
          onChange={e => setSrcType(e.target.value)}
          className="lbtn !h-9 !px-2 text-xs border"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
        >
          <option value="google">Google</option>
          <option value="facebook">Facebook</option>
        </select>
        <button
          onClick={handleAdd}
          disabled={busy || !input.trim()}
          className="lbtn lbtn-primary !h-9 !px-4 disabled:opacity-50"
        >
          <span className="icon text-base">add</span>
          Thêm
        </button>
      </div>

      {error && (
        <div className="text-xs px-3 py-2 rounded-lg"
             style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {error}
        </div>
      )}

      {/* Keyword list */}
      {loading ? (
        <div className="flex justify-center py-4">
          <span className="w-5 h-5 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div className="space-y-2">
          {keywords.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
              Chưa có từ khóa nào. Thêm từ khóa để bắt đầu scrape.
            </p>
          ) : keywords.map(kw => (
            <div key={kw.id}
                 className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs"
                 style={{
                   background: kw.isActive ? 'var(--bg-elevated)' : 'rgba(100,116,139,0.06)',
                   opacity: kw.isActive ? 1 : 0.6,
                 }}>
              <span className="flex-1 font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {kw.keyword}
              </span>
              <span className="px-1.5 py-0.5 rounded text-xs"
                    style={{ background: 'rgba(46,117,182,0.10)', color: 'var(--primary-500)' }}>
                {kw.sourceType}
              </span>
              <span className="px-1.5 py-0.5 rounded text-xs"
                    style={{ background: 'rgba(100,116,139,0.10)', color: 'var(--text-tertiary)' }}>
                {kw.useCount} lần
              </span>
              {/* Toggle */}
              <button
                onClick={() => handleToggle(kw.id)}
                disabled={busy}
                title={kw.isActive ? 'Tắt' : 'Bật'}
                className="w-8 h-5 rounded-full relative transition-colors shrink-0"
                style={{
                  background: kw.isActive ? 'var(--accent-500)' : 'var(--border-strong)',
                }}
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                      style={{ left: kw.isActive ? '14px' : '2px' }} />
              </button>
              {/* Delete */}
              <button
                onClick={() => handleDelete(kw.id)}
                disabled={busy}
                className="shrink-0 hover:opacity-70"
                title="Xóa"
              >
                <span className="icon text-base" style={{ color: '#EF4444' }}>delete_outline</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SOURCE_ICON = {
  shopee: 'storefront', lazada: 'store', tiktok: 'play_circle',
  facebook: 'thumb_up', ghn: 'local_shipping', vnpay: 'payments',
}

const STATUS_CFG = {
  idle:    { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', color: '#64748B',              dot: '#64748B',   icon: 'radio_button_unchecked', label: 'Chờ' },
  syncing: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  color: '#F59E0B',              dot: '#F59E0B',   icon: 'sync',                   label: 'Đang đồng bộ' },
  success: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  color: 'var(--accent-500)',    dot: 'var(--accent-500)', icon: 'check_circle',   label: 'Thành công' },
  error:   { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   color: '#EF4444',              dot: '#EF4444',   icon: 'error_outline',          label: 'Lỗi' },
}

function SourceCard({ src, syncing, onSync, t }) {
  const s = STATUS_CFG[src.status] ?? STATUS_CFG.idle
  const isBusy = syncing || src.status === 'syncing'

  return (
    <div
      className="lcard p-5 flex flex-col gap-4 transition-all"
      style={{
        borderLeft: `3px solid ${s.dot}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="icon w-10 h-10 flex items-center justify-center rounded-xl shrink-0"
                style={{ fontSize: 22, background: 'var(--bg-elevated)', color: 'var(--primary-500)' }}>
            {SOURCE_ICON[src.sourceKey] ?? 'api'}
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t(`dataSync.sources.${src.sourceKey}`, src.sourceName)}
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-0.5"
              style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full"
                    style={{ background: s.dot, ...(src.status === 'syncing' && { animation: 'pulse 1s infinite' }) }} />
              {s.label}
            </span>
          </div>
        </div>
        <span
          className="icon"
          style={{
            fontSize: 20,
            color: s.color,
            ...(src.status === 'syncing' && { animation: 'spin 1s linear infinite' }),
          }}
        >
          {s.icon}
        </span>
      </div>

      {/* Meta info */}
      <div className="space-y-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <div className="flex items-center gap-1.5">
          <span className="icon" style={{ fontSize: 14 }}>schedule</span>
          {t('dataSync.lastSync')}: {src.lastSync
            ? new Date(src.lastSync).toLocaleString('vi-VN')
            : t('dataSync.neverSynced')}
        </div>
        {src.recordsSynced != null && (
          <div className="flex items-center gap-1.5">
            <span className="icon" style={{ fontSize: 14 }}>table_rows</span>
            {t('dataSync.records')}: <span className="font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
              {src.recordsSynced.toLocaleString('vi-VN')}
            </span>
          </div>
        )}
        {src.errorMessage && (
          <div className="flex items-start gap-1.5 mt-1 px-2 py-1.5 rounded-lg"
               style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
            <span className="icon shrink-0" style={{ fontSize: 14 }}>error_outline</span>
            <span>{src.errorMessage}</span>
          </div>
        )}
      </div>

      {/* Sync button */}
      <button
        onClick={onSync}
        disabled={isBusy}
        className="lbtn lbtn-secondary w-full justify-center disabled:opacity-50"
        style={{ height: 36 }}
      >
        {isBusy ? (
          <span className="w-4 h-4 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <span className="icon text-base">sync</span>
        )}
        {t('dataSync.syncNow')}
      </button>
    </div>
  )
}

export default function DataSyncPage() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState({})
  const [isMock,  setIsMock]  = useState(false)

  const fetchStatus = async () => {
    setLoading(true)
    setIsMock(false)
    try {
      setData(await getSyncStatus())
    } catch {
      setData(MOCK_DATA_SYNC)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleSync = async source => {
    setSyncing(s => ({ ...s, [source]: true }))
    try { await triggerSync(source); await fetchStatus() } catch { /* ignore */ }
    finally { setSyncing(s => ({ ...s, [source]: false })) }
  }

  const handleSyncAll = async () => {
    if (data?.sources) await Promise.all(data.sources.map(s => handleSync(s.sourceKey)))
  }

  const sources = data?.sources ?? []
  const successCount = sources.filter(s => s.status === 'success').length
  const errorCount   = sources.filter(s => s.status === 'error').length
  const syncingCount = sources.filter(s => s.status === 'syncing').length

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('dataSync.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('dataSync.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStatus} className="lbtn lbtn-secondary !h-9" disabled={loading}>
            <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
          </button>
          <button onClick={handleSyncAll} className="lbtn lbtn-primary !h-9">
            <span className="icon text-base">sync_alt</span>
            {t('dataSync.syncAll')}
          </button>
        </div>
      </div>

      {/* Summary mini-bar */}
      {!loading && sources.length > 0 && (
        <div className="lcard px-5 py-3 flex items-center gap-6 flex-wrap">
          {[
            { label: 'Tổng nguồn',    value: sources.length, color: 'var(--text-primary)' },
            { label: 'Thành công',     value: successCount,   color: 'var(--accent-500)'  },
            { label: 'Đang đồng bộ',  value: syncingCount,   color: '#F59E0B'             },
            { label: 'Lỗi',           value: errorCount,     color: '#EF4444'             },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold" style={{ color: item.color }}>{item.value}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Source cards */}
      {loading ? (
        <div className="lcard p-16 flex items-center justify-center">
          <span className="w-7 h-7 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sources.map(src => (
            <SourceCard
              key={src.sourceKey}
              src={src}
              syncing={syncing[src.sourceKey]}
              onSync={() => handleSync(src.sourceKey)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Keyword Management */}
      <KeywordManager />
    </div>
  )
}
