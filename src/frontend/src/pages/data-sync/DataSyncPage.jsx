import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getSyncStatus, triggerSync } from '../../api/syncApi'
import { MOCK_DATA_SYNC } from '../../mockData/dataSync'
import api from '../../api/axios'
import { showToast } from '../../utils/toast'
import { useHasRole } from '../../hooks/useAuth'

// ── API helpers cho Facebook Integration ─────────────────────────────────────
async function getFacebookStatus() {
  const r = await api.get('/api/integrations/facebook/status')
  return r.data
}

async function connectFacebook(pageId, pageAccessToken) {
  const r = await api.post('/api/integrations/facebook', { pageId, pageAccessToken })
  return r.data
}

async function disconnectFacebook() {
  const r = await api.delete('/api/integrations/facebook')
  return r.data
}

async function scrapeFacebook() {
  // Scrape có thể mất 15-60s (Graph API + DB insert) — override timeout riêng
  const r = await api.post('/api/sync/scrape-facebook', {}, { timeout: 60_000 })
  return r.data
}

async function validateFacebookToken() {
  const r = await api.get('/api/integrations/facebook/validate')
  return r.data
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function fetchKeywords() {
  const r = await api.get('/api/scraper/keywords')
  return r.data.keywords
}

async function addKeyword(keyword, sourceType = 'google') {
  await api.post('/api/scraper/keywords', { keyword, sourceType })
}

async function toggleKeyword(id) {
  await api.put(`/api/scraper/keywords/${id}/toggle`)
}

async function deleteKeyword(id) {
  await api.delete(`/api/scraper/keywords/${id}`)
}

async function toggleIntegration(integrationId) {
  await api.patch(`/api/integrations/${integrationId}/toggle`)
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
      setError(e.response?.data?.message ?? e.message ?? 'Lỗi thêm keyword')
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
          {keywords.filter(k => k.isActive).length} đang hoạt động
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

      {/* Hướng dẫn cài đặt Facebook Scraper */}
      {srcType === 'facebook' && (
        <div className="text-xs px-3 py-2.5 rounded-lg space-y-1"
             style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.20)', color: '#3B82F6' }}>
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <span className="icon" style={{ fontSize: 14 }}>info</span>
            Để dùng Facebook Page scraper, cần cấu hình trước:
          </div>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            1. Tạo Facebook App tại <strong>developers.facebook.com</strong><br />
            2. Thêm thông tin vào <code style={{ background: 'var(--bg-elevated)', padding: '0 3px', borderRadius: 3 }}>appsettings.Development.json</code>:<br />
            <code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginTop: 2 }}>
              {'"Facebook": \{ "PageId": "YOUR_PAGE_ID", "PageAccessToken": "YOUR_TOKEN" \}'}
            </code><br />
            3. Restart backend server
          </div>
        </div>
      )}

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
  google_analytics: 'analytics',
}

const STATUS_CFG = {
  idle:    { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', color: '#64748B',              dot: '#64748B',   icon: 'radio_button_unchecked', labelKey: 'dataSync.syncStatus.idle'    },
  syncing: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  color: '#F59E0B',              dot: '#F59E0B',   icon: 'sync',                   labelKey: 'dataSync.syncStatus.syncing' },
  success: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  color: 'var(--accent-500)',    dot: 'var(--accent-500)', icon: 'check_circle',   labelKey: 'dataSync.syncStatus.success' },
  error:   { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   color: '#EF4444',              dot: '#EF4444',   icon: 'error_outline',          labelKey: 'dataSync.syncStatus.error'   },
}

function SourceCard({ src, syncing, onSync, onToggle, canToggle, t }) {
  const s = STATUS_CFG[src.status] ?? STATUS_CFG.idle
  const isBusy = syncing || src.status === 'syncing'
  const isActive = src.isActive !== false

  return (
    <div
      className="lcard p-5 flex flex-col gap-4 transition-all"
      style={{
        borderLeft: `3px solid ${isActive ? s.dot : 'rgba(100,116,139,0.40)'}`,
        opacity: isActive ? 1 : 0.72,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="icon w-10 h-10 flex items-center justify-center rounded-xl shrink-0"
                style={{ fontSize: 22, background: 'var(--bg-elevated)', color: isActive ? 'var(--primary-500)' : 'var(--text-tertiary)' }}>
            {SOURCE_ICON[src.sourceKey] ?? 'api'}
          </span>
          <div>
            <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t(`dataSync.sources.${src.sourceKey}`, src.sourceName)}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {isActive ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: s.dot, ...(src.status === 'syncing' && { animation: 'pulse 1s infinite' }) }} />
                  {t(s.labelKey)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(100,116,139,0.10)', border: '1px solid rgba(100,116,139,0.30)', color: '#64748B' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#94A3B8' }} />
                  Đã tắt
                </span>
              )}
            </div>
          </div>
        </div>
        <span
          className="icon"
          style={{
            fontSize: 20,
            color: isActive ? s.color : '#94A3B8',
            ...(src.status === 'syncing' && isActive && { animation: 'spin 1s linear infinite' }),
          }}
        >
          {isActive ? s.icon : 'power_settings_new'}
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
        {src.errorMessage && isActive && (
          <div className="flex items-start gap-1.5 mt-1 px-2 py-1.5 rounded-lg"
               style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
            <span className="icon shrink-0" style={{ fontSize: 14 }}>error_outline</span>
            <span>{src.errorMessage}</span>
          </div>
        )}
      </div>

      {/* Footer: Sync button + Toggle */}
      <div className="flex items-center gap-2">
        {isActive ? (
          <button
            onClick={onSync}
            disabled={isBusy}
            className="lbtn lbtn-secondary flex-1 justify-center disabled:opacity-50"
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
        ) : (
          <p className="flex-1 text-center text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>
            Kênh đã tắt — không đồng bộ
          </p>
        )}
        {canToggle && src.integrationId && (
          <button
            onClick={() => onToggle(src.integrationId)}
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            style={{
              background: isActive ? 'rgba(16,185,129,0.10)' : 'rgba(100,116,139,0.10)',
              border: `1px solid ${isActive ? 'rgba(16,185,129,0.30)' : 'rgba(100,116,139,0.25)'}`,
            }}
            title={isActive ? 'Tắt kênh này' : 'Bật kênh này'}
          >
            <span className="icon text-lg" style={{ color: isActive ? 'var(--accent-500)' : '#64748B' }}>
              {isActive ? 'toggle_on' : 'toggle_off'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── ETL Pipeline Card (OLTP → DW) ────────────────────────────────────────────
function EtlPipelineCard({ t }) {
  const [jobId,    setJobId]    = useState(null)
  const [status,   setStatus]   = useState(null) // null | 'running' | 'completed' | 'failed'
  const [progress, setProgress] = useState(0)
  const [message,  setMessage]  = useState('')
  const [doneAt,   setDoneAt]   = useState(null)
  const pollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const poll = async (jid) => {
    try {
      const res = await api.get(`/api/sync/status/${jid}`)
      const d   = res.data
      setProgress(d.progress ?? 0)
      setMessage(d.message  ?? '')
      setStatus(d.status)
      if (d.status === 'completed' || d.status === 'failed') {
        stopPolling()
        if (d.status === 'completed') setDoneAt(new Date().toLocaleTimeString('vi-VN'))
      }
    } catch { /* ignore */ }
  }

  const handleTrigger = async () => {
    setStatus('running'); setProgress(0); setMessage('Đang khởi động...'); setDoneAt(null)
    try {
      const res = await api.post('/api/sync/trigger', {})
      const jid = res.data.jobId
      setJobId(jid)
      setMessage(res.data.message || 'Đang xử lý...')
      stopPolling()
      pollRef.current = setInterval(() => poll(jid), 1500)
    } catch (err) {
      setStatus('failed')
      setMessage(err.response?.data?.message || 'Không thể kết nối server')
    }
  }

  // Cleanup khi unmount
  useEffect(() => () => stopPolling(), [])

  const isRunning = status === 'running'

  return (
    <div className="lcard p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>
          {isRunning ? 'hourglass_empty' : 'storage'}
        </span>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          ETL Pipeline – OLTP → Data Warehouse
        </h2>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Chuyển toàn bộ đơn hàng từ database OLTP lên Data Warehouse (fact_sales + dim tables)
        để Dashboard và AI có dữ liệu mới nhất.
      </p>

      {/* Progress bar */}
      {status === 'running' && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>{message}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'var(--primary-500)' }}
            />
          </div>
        </div>
      )}

      {/* Kết quả */}
      {status === 'completed' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
             style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: 'var(--accent-500)' }}>
          <span className="icon" style={{ fontSize: 16 }}>check_circle</span>
          <span>Đồng bộ thành công lúc <strong>{doneAt}</strong> — {message}</span>
        </div>
      )}
      {status === 'failed' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>
          <span className="icon" style={{ fontSize: 16 }}>error_outline</span>
          <span>{message}</span>
        </div>
      )}

      <button
        onClick={handleTrigger}
        disabled={isRunning}
        className="lbtn lbtn-primary w-full justify-center disabled:opacity-50"
        style={{ height: 40 }}
      >
        {isRunning ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  style={{ animation: 'spin 0.7s linear infinite' }} />
            Đang đồng bộ...
          </>
        ) : (
          <>
            <span className="icon text-base">sync_alt</span>
            Đồng bộ ngay
          </>
        )}
      </button>
    </div>
  )
}

// ── Import thủ công CSV từ sàn TMĐT ──────────────────────────────────────────
const IMPORT_SOURCES = [
  {
    key: 'shopee',   label: 'Shopee',       icon: 'storefront',     color: '#EE4D2D',
    desc: 'File xuất từ Shopee Seller Center (Orders → Export)',
    importUrl: '/api/import/platform-orders?source=shopee',
  },
  {
    key: 'tiktok',   label: 'TikTok Shop',  icon: 'play_circle',    color: '#010101',
    desc: 'File Order Report từ TikTok Shop Partner Center',
    importUrl: '/api/import/platform-orders?source=tiktok',
  },
  {
    key: 'lazada',   label: 'Lazada',        icon: 'store',          color: '#0F146D',
    desc: 'File Order Report từ Lazada Seller Center',
    importUrl: '/api/import/platform-orders?source=lazada',
  },
  {
    key: 'facebook', label: 'Facebook',      icon: 'thumb_up',       color: '#1877F2',
    desc: 'File CSV export từ Facebook Business Suite (Orders)',
    importUrl: '/api/import/platform-orders?source=facebook',
  },
  {
    key: 'ghn',      label: 'GHN',           icon: 'local_shipping', color: '#F59E0B',
    desc: 'File báo cáo vận chuyển từ GHN Seller Portal',
    importUrl: '/api/import/platform-orders?source=ghn',
  },
  {
    key: 'vnpay',    label: 'VNPay',         icon: 'payments',       color: '#005BAA',
    desc: 'File lịch sử giao dịch từ VNPay Merchant Portal',
    importUrl: '/api/import/platform-orders?source=vnpay',
  },
]

function ImportTab() {
  const [source,     setSource]     = useState('shopee')
  const [file,       setFile]       = useState(null)
  const [preview,    setPreview]    = useState(null) // { headers, rows, total }
  const [importing,  setImporting]  = useState(false)
  const [result,     setResult]     = useState(null) // { success, skipped, errors }
  const [dragOver,   setDragOver]   = useState(false)
  const fileRef = useRef(null)

  const selectedSource = IMPORT_SOURCES.find(s => s.key === source) ?? IMPORT_SOURCES[0]

  // Parse CSV preview (chỉ đọc 5 dòng đầu)
  const parsePreview = (csvFile) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text   = e.target.result
      const lines  = text.split(/\r?\n/).filter(l => l.trim())
      const headers = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, '')) ?? []
      const rows    = lines.slice(1, 6).map(l =>
        l.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      )
      setPreview({ headers, rows, total: lines.length - 1 })
    }
    reader.readAsText(csvFile, 'UTF-8')
  }

  const handleFileSelect = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    parsePreview(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.csv')) handleFileSelect(f)
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get(selectedSource.templateUrl, { responseType: 'blob' })
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href  = url
      link.download = `template_${source}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  const handleImport = async () => {
    if (!file) return
    setImporting(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(selectedSource.importUrl, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(res.data)
    } catch (err) {
      setResult({ success: 0, skipped: 0, errors: [{ row: 0, message: err.response?.data?.message ?? 'Lỗi server' }] })
    } finally {
      setImporting(false)
    }
  }

  const reset = () => { setFile(null); setPreview(null); setResult(null) }

  // Platform sources không cần validate cột (backend tự detect)
  const missingCols = []

  return (
    <div className="space-y-5">
      {/* Section 1: chọn nguồn sàn */}
      <div className="lcard p-5">
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          CHỌN NGUỒN DỮ LIỆU
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {IMPORT_SOURCES.map(it => (
            <button
              key={it.key}
              onClick={() => { setSource(it.key); reset() }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all"
              style={{
                borderColor: source === it.key ? it.color : 'var(--border)',
                background:  source === it.key ? `${it.color}0f` : 'var(--bg-elevated)',
              }}
            >
              <span className="icon" style={{ fontSize: 22, color: source === it.key ? it.color : 'var(--text-tertiary)' }}>
                {it.icon}
              </span>
              <span className="text-xs font-medium" style={{ color: source === it.key ? it.color : 'var(--text-secondary)' }}>
                {it.label}
              </span>
              <span className="text-xs text-center leading-tight" style={{ color: 'var(--text-tertiary)' }}>
                {it.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: upload file */}
      <div className="lcard p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>TẢI VÀ IMPORT FILE</p>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
          style={{
            borderColor: dragOver ? 'var(--primary-500)' : 'var(--border)',
            background:  dragOver ? 'rgba(99,102,241,0.04)' : 'transparent',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => handleFileSelect(e.target.files[0])}
          />
          <span className="icon text-4xl mb-2 block" style={{ color: 'var(--text-tertiary)' }}>upload_file</span>
          {file ? (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--primary-500)' }}>{file.name}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Kéo thả file CSV vào đây hoặc <span style={{ color: 'var(--primary-500)' }}>chọn file</span>
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Chỉ chấp nhận .csv</p>
            </div>
          )}
        </div>

        {file && (
          <button onClick={reset} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            ✕ Xóa file
          </button>
        )}
      </div>

      {/* Section 3: preview */}
      {preview && (
        <div className="lcard p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>XEM TRƯỚC</p>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span>{preview.total} dòng dữ liệu · {preview.headers.length} cột</span>
            </div>
          </div>

          {missingCols.length > 0 && (
            <div className="px-3 py-2 rounded-lg text-xs"
                 style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              ⚠ Thiếu cột bắt buộc: <strong>{missingCols.join(', ')}</strong>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                        style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 whitespace-nowrap"
                          style={{ color: 'var(--text-primary)' }}>{cell || '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > 5 && (
            <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
              Hiển thị 5/{preview.total} dòng
            </p>
          )}
        </div>
      )}

      {/* Section 4: xác nhận import */}
      {preview && missingCols.length === 0 && (
        <div className="lcard p-5 space-y-4">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>XÁC NHẬN VÀ IMPORT</p>

          <button
            onClick={handleImport}
            disabled={importing}
            className="lbtn lbtn-primary w-full justify-center"
            style={{ height: 44 }}
          >
            {importing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
                Đang import...
              </>
            ) : (
              <>
                <span className="icon text-base">upload</span>
                Import {preview.total} bản ghi
              </>
            )}
          </button>

          {result && (
            <div className="rounded-xl p-4 space-y-2"
                 style={{
                   background: result.errors?.length > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                   border: `1px solid ${result.errors?.length > 0 ? 'rgba(245,158,11,0.30)' : 'rgba(16,185,129,0.30)'}`,
                 }}>
              <p className="text-sm font-semibold"
                 style={{ color: result.errors?.length > 0 ? '#F59E0B' : 'var(--accent-500)' }}>
                {result.message ?? `Đã import ${result.success} đơn hàng — Đang đồng bộ lên Data Warehouse...`}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {result.success} thành công · {result.skipped} bỏ qua
              </p>
              {result.errors?.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs" style={{ color: '#EF4444' }}>
                  Dòng {e.row}: {e.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Facebook Connection Card ──────────────────────────────────────────────────
function FacebookConnectCard() {
  const [status,        setStatus]        = useState(null)   // null | { connected, pageId, pageName, ... }
  const [loading,       setLoading]       = useState(true)
  const [pageId,        setPageId]        = useState('')
  const [token,         setToken]         = useState('')
  const [connecting,    setConnecting]    = useState(false)
  const [scraping,      setScraping]      = useState(false)
  const [scrapeResult,  setScrapeResult]  = useState(null)
  const [error,         setError]         = useState('')
  const [validating,    setValidating]    = useState(false)
  const [validateResult, setValidateResult] = useState(null) // { valid, message, hint? }

  const loadStatus = async () => {
    setLoading(true)
    try {
      setStatus(await getFacebookStatus())
    } catch {
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  const handleConnect = async () => {
    if (!pageId.trim() || !token.trim()) {
      setError('Vui lòng nhập đầy đủ Page ID và Page Access Token.')
      return
    }
    setConnecting(true); setError('')
    try {
      await connectFacebook(pageId.trim(), token.trim())
      showToast('Kết nối Facebook thành công!', 'success')
      setPageId(''); setToken('')
      await loadStatus()
    } catch (e) {
      setError(e.response?.data?.message ?? e.message ?? 'Lỗi kết nối')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Bạn chắc chắn muốn ngắt kết nối Facebook Page này?')) return
    try {
      await disconnectFacebook()
      showToast('Đã ngắt kết nối Facebook.', 'info')
      await loadStatus()
    } catch (e) {
      showToast(e.response?.data?.message ?? 'Lỗi ngắt kết nối', 'error')
    }
  }

  const handleScrape = async () => {
    setScraping(true); setScrapeResult(null)
    try {
      const r = await scrapeFacebook()
      setScrapeResult(r)
    } catch (e) {
      setScrapeResult({ success: false, error: e.response?.data?.message ?? 'Lỗi scrape' })
    } finally {
      setScraping(false)
    }
  }

  const handleValidate = async () => {
    setValidating(true); setValidateResult(null)
    try {
      const r = await validateFacebookToken()
      setValidateResult(r)
    } catch (e) {
      setValidateResult({ valid: false, message: e.response?.data?.message ?? 'Lỗi kiểm tra token' })
    } finally {
      setValidating(false)
    }
  }

  if (loading) {
    return (
      <div className="lcard p-8 flex justify-center">
        <span className="w-6 h-6 border-2 rounded-full"
              style={{ borderColor: 'var(--border-strong)', borderTopColor: '#1877F2', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div className="lcard p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: 'rgba(24,119,242,0.12)' }}>
          <span className="icon" style={{ fontSize: 24, color: '#1877F2' }}>thumb_up</span>
        </div>
        <div>
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Facebook Page</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Thu thập bài đăng, bình luận và phân tích cảm xúc khách hàng
          </p>
        </div>
        <div className="ml-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: status?.connected ? 'rgba(16,185,129,0.10)' : 'rgba(100,116,139,0.10)',
                  color:      status?.connected ? 'var(--accent-500)' : '#64748B',
                  border:     `1px solid ${status?.connected ? 'rgba(16,185,129,0.30)' : 'rgba(100,116,139,0.25)'}`,
                }}>
            <span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: status?.connected ? 'var(--accent-500)' : '#94A3B8' }} />
            {status?.connected ? 'Đã kết nối' : 'Chưa kết nối'}
          </span>
        </div>
      </div>

      {/* Đã kết nối → hiện thông tin */}
      {status?.connected ? (
        <div className="space-y-4">
          <div className="rounded-xl px-4 py-3 space-y-2"
               style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              <span className="icon" style={{ fontSize: 16, color: 'var(--accent-500)' }}>check_circle</span>
              {status.pageName || status.pageId}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <div>
                <span className="font-medium">Page ID:</span> {status.pageId}
              </div>
              {status.connectedAt && (
                <div>
                  <span className="font-medium">Kết nối lúc:</span>{' '}
                  {new Date(status.connectedAt).toLocaleString('vi-VN')}
                </div>
              )}
              {status.lastSyncAt && (
                <div>
                  <span className="font-medium">Sync lần cuối:</span>{' '}
                  {new Date(status.lastSyncAt).toLocaleString('vi-VN')}
                </div>
              )}
            </div>
            {status.lastError && (
              <div className="text-xs px-2 py-1.5 rounded-lg"
                   style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                {status.lastError}
              </div>
            )}
          </div>

          {/* Validate token result */}
          {validateResult && (
            <div className="rounded-xl px-4 py-3 text-xs space-y-1"
                 style={{
                   background: validateResult.valid ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                   border:     `1px solid ${validateResult.valid ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.30)'}`,
                   color:      validateResult.valid ? 'var(--accent-500)' : '#EF4444',
                 }}>
              <div className="flex items-center gap-1.5 font-semibold">
                <span className="icon" style={{ fontSize: 14 }}>
                  {validateResult.valid ? 'verified' : 'warning'}
                </span>
                {validateResult.message}
              </div>
              {validateResult.hint && (
                <div style={{ color: 'var(--text-secondary)' }}>{validateResult.hint}</div>
              )}
            </div>
          )}

          {/* Scrape result */}
          {scrapeResult && (
            <div className="rounded-xl px-4 py-3 text-xs space-y-1"
                 style={{
                   background: scrapeResult.success !== false ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                   border:     `1px solid ${scrapeResult.success !== false ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                   color:      scrapeResult.success !== false ? 'var(--accent-500)' : '#EF4444',
                 }}>
              {scrapeResult.success !== false ? (
                <>
                  <div className="font-semibold">Scrape hoàn tất</div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {scrapeResult.total_scraped} bài đăng · {scrapeResult.inserted} mới · {scrapeResult.skipped} bỏ qua
                  </div>
                  {scrapeResult.message && scrapeResult.total_scraped === 0 && (
                    <div style={{ color: '#F59E0B' }}>{scrapeResult.message}</div>
                  )}
                </>
              ) : (
                <>
                  <div>{scrapeResult.error ?? scrapeResult.message}</div>
                  {scrapeResult.hint && (
                    <div style={{ color: 'var(--text-secondary)' }}>{scrapeResult.hint}</div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleScrape}
              disabled={scraping}
              className="lbtn lbtn-primary flex-1 justify-center disabled:opacity-50"
              style={{ height: 38, minWidth: 120 }}
            >
              {scraping ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <span className="icon text-base">sync</span>
              )}
              {scraping ? 'Đang scrape...' : 'Scrape ngay'}
            </button>
            <button
              onClick={handleValidate}
              disabled={validating}
              className="lbtn flex-shrink-0 px-3 disabled:opacity-50"
              style={{ height: 38, border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B', background: 'rgba(245,158,11,0.06)' }}
              title="Kiểm tra token còn hợp lệ không"
            >
              {validating ? (
                <span className="w-4 h-4 border-2 rounded-full"
                      style={{ borderColor: 'rgba(245,158,11,0.30)', borderTopColor: '#F59E0B', animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <span className="icon text-base">verified_user</span>
              )}
              Kiểm tra token
            </button>
            <button
              onClick={handleDisconnect}
              className="lbtn flex-shrink-0 px-4"
              style={{ height: 38, border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444', background: 'rgba(239,68,68,0.06)' }}
            >
              <span className="icon text-base">link_off</span>
              Ngắt kết nối
            </button>
          </div>
        </div>
      ) : (
        /* Chưa kết nối → form nhập */
        <div className="space-y-4">
          {/* Hướng dẫn */}
          <div className="rounded-xl px-4 py-3 text-xs space-y-1"
               style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.20)', color: '#3B82F6' }}>
            <div className="font-semibold flex items-center gap-1.5 mb-1">
              <span className="icon" style={{ fontSize: 14 }}>info</span>
              Cách lấy Page Access Token
            </div>
            <ol className="space-y-0.5 list-decimal list-inside" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li>Vào <strong>developers.facebook.com</strong> → Tạo App → Add Product → Facebook Login</li>
              <li>Vào <strong>Graph API Explorer</strong> → chọn Page của bạn</li>
              <li>Thêm quyền: <code style={{ background: 'var(--bg-elevated)', padding: '0 3px', borderRadius: 3 }}>pages_read_engagement</code>, <code style={{ background: 'var(--bg-elevated)', padding: '0 3px', borderRadius: 3 }}>pages_show_list</code></li>
              <li>Nhấn <strong>Generate Access Token</strong> → copy token</li>
              <li>Page ID lấy tại: Trang → Giới thiệu → Page ID</li>
            </ol>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Page ID <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                value={pageId}
                onChange={e => setPageId(e.target.value)}
                placeholder="Ví dụ: 123456789012345"
                className="lbtn w-full !h-9 !px-3 text-sm border"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Page Access Token <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="EAABsbCS4IHUBO..."
                className="lbtn w-full !h-9 !px-3 text-sm border font-mono"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Token được mã hóa AES-256-GCM trước khi lưu, không bao giờ hiển thị lại.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting || !pageId.trim() || !token.trim()}
            className="lbtn lbtn-primary w-full justify-center disabled:opacity-50"
            style={{ height: 42 }}
          >
            {connecting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    style={{ animation: 'spin 0.7s linear infinite' }} />
            ) : (
              <span className="icon text-base">link</span>
            )}
            {connecting ? 'Đang kết nối...' : 'Kết nối Facebook Page'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Generic Connector Card ────────────────────────────────────────────────────
function ConnectorCard({ channel, label, color, icon, guideUrl, guideText, fields, statusUrl, connectUrl, disconnectUrl }) {
  const [status,     setStatus]     = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [form,       setForm]       = useState(() => Object.fromEntries(fields.map(f => [f.key, ''])))
  const [showPwd,    setShowPwd]    = useState({})
  const [connecting, setConnecting] = useState(false)
  const [error,      setError]      = useState('')

  const loadStatus = async () => {
    setLoading(true)
    try { setStatus(await api.get(statusUrl).then(r => r.data)) }
    catch { setStatus({ connected: false }) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadStatus() }, [])

  const handleConnect = async () => {
    const empty = fields.filter(f => f.required && !form[f.key]?.trim())
    if (empty.length) { setError(`Vui lòng nhập: ${empty.map(f => f.label).join(', ')}`); return }
    setConnecting(true); setError('')
    try {
      await api.post(connectUrl, form)
      showToast(`Kết nối ${label} thành công!`, 'success')
      await loadStatus()
    } catch (e) {
      setError(e.response?.data?.message ?? e.message ?? 'Lỗi kết nối')
    } finally { setConnecting(false) }
  }

  const handleDisconnect = async () => {
    if (!confirm(`Bạn chắc chắn muốn ngắt kết nối ${label}?`)) return
    try {
      await api.delete(disconnectUrl)
      showToast(`Đã ngắt kết nối ${label}.`, 'info')
      await loadStatus()
    } catch (e) { showToast(e.response?.data?.message ?? 'Lỗi', 'error') }
  }

  if (loading) return (
    <div className="lcard p-8 flex justify-center">
      <span className="w-6 h-6 border-2 rounded-full"
            style={{ borderColor: 'var(--border-strong)', borderTopColor: color, animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div className="lcard p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: `${color}18` }}>
          <span className="icon" style={{ fontSize: 24, color }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{label}</h2>
          {guideUrl && (
            <a href={guideUrl} target="_blank" rel="noopener noreferrer"
               className="text-xs underline" style={{ color }}>
              {guideText ?? 'Hướng dẫn lấy credentials'}
            </a>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: status?.connected ? 'rgba(16,185,129,0.10)' : 'rgba(100,116,139,0.10)',
                color:      status?.connected ? 'var(--accent-500)' : '#64748B',
                border:     `1px solid ${status?.connected ? 'rgba(16,185,129,0.30)' : 'rgba(100,116,139,0.25)'}`,
              }}>
          <span className="w-1.5 h-1.5 rounded-full"
                style={{ background: status?.connected ? 'var(--accent-500)' : '#94A3B8' }} />
          {status?.connected ? 'Đã kết nối' : 'Chưa kết nối'}
        </span>
      </div>

      {status?.connected ? (
        <div className="space-y-4">
          <div className="rounded-xl px-4 py-3 space-y-1.5"
               style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.20)' }}>
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              <span className="icon" style={{ fontSize: 16, color: 'var(--accent-500)' }}>check_circle</span>
              {status.accountName || status.accountId}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {status.accountId && <div><span className="font-medium">ID:</span> {status.accountId}</div>}
              {status.connectedAt && (
                <div>
                  <span className="font-medium">Kết nối lúc:</span>{' '}
                  {new Date(status.connectedAt).toLocaleString('vi-VN')}
                </div>
              )}
            </div>
          </div>
          <button onClick={handleDisconnect}
                  className="lbtn w-full justify-center"
                  style={{ height: 38, border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444', background: 'rgba(239,68,68,0.06)' }}>
            <span className="icon text-base">link_off</span>
            Ngắt kết nối
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {f.label} {f.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              {f.type === 'select' ? (
                <select value={form[f.key]} onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                        className="lbtn w-full !h-9 !px-3 text-sm border"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}>
                  {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <div className="relative">
                  <input
                    type={f.secret && !showPwd[f.key] ? 'password' : 'text'}
                    value={form[f.key]}
                    onChange={e => setForm(v => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.hint ?? ''}
                    className="lbtn w-full !h-9 !px-3 text-sm border pr-9"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', fontFamily: f.secret ? 'monospace' : 'inherit' }}
                  />
                  {f.secret && (
                    <button onClick={() => setShowPwd(p => ({ ...p, [f.key]: !p[f.key] }))}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            title={showPwd[f.key] ? 'Ẩn' : 'Hiện'}>
                      <span className="icon text-base" style={{ color: 'var(--text-tertiary)' }}>
                        {showPwd[f.key] ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  )}
                </div>
              )}
              {f.hint && f.type !== 'select' && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{f.hint}</p>
              )}
            </div>
          ))}

          {error && (
            <div className="text-xs px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </div>
          )}

          <button onClick={handleConnect} disabled={connecting}
                  className="lbtn lbtn-primary w-full justify-center disabled:opacity-50"
                  style={{ height: 42 }}>
            {connecting
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
              : <span className="icon text-base">link</span>}
            {connecting ? 'Đang kết nối...' : `Kết nối ${label}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Facebook Feed ─────────────────────────────────────────────────────────────
const SENTIMENT_CFG = {
  positive: { label: 'Tích cực', color: '#10B981', bg: 'rgba(16,185,129,0.10)', icon: 'sentiment_satisfied' },
  negative: { label: 'Tiêu cực', color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  icon: 'sentiment_dissatisfied' },
  neutral:  { label: 'Trung lập', color: '#64748B', bg: 'rgba(100,116,139,0.10)', icon: 'sentiment_neutral' },
}

function SentimentBadge({ type }) {
  const cfg = SENTIMENT_CFG[type] ?? SENTIMENT_CFG.neutral
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: cfg.bg, color: cfg.color }}>
      <span className="icon" style={{ fontSize: 13 }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  )
}

// ── Facebook Posts Modal ──────────────────────────────────────────────────────
function FacebookPostsModal({ onClose }) {
  const [posts,    setPosts]    = useState([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState({})
  const [openCmt,  setOpenCmt]  = useState({})
  const PAGE_SIZE = 5

  const load = async (pg = 1) => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/api/integrations/facebook/posts?page=${pg}&pageSize=${PAGE_SIZE}`)
      setPosts(r.data.posts ?? [])
      setTotal(r.data.total ?? 0)
      setPage(pg)
    } catch (e) {
      setError(e.response?.data?.message ?? 'Không thể tải bài đăng')
    } finally { setLoading(false) }
  }

  useEffect(() => { load(1) }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const formatDate = iso => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
         onClick={e => e.target === e.currentTarget && onClose()}>

      {/* Modal panel */}
      <div className="flex flex-col w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl"
           style={{ background: 'var(--bg-card)', maxHeight: '85vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0"
             style={{ borderBottom: '1px solid var(--border-default)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
               style={{ background: '#1877F2' }}>
            <span className="icon text-white text-sm">group</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Bài đăng Facebook
            </h3>
            {total > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {total} bài đăng đã thu thập
              </p>
            )}
          </div>
          <button onClick={() => load(page)}
                  className="lbtn !h-7 !px-2.5 text-xs gap-1"
                  style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
            <span className="icon text-sm">refresh</span>
          </button>
          <button onClick={onClose}
                  className="lbtn !h-7 !w-7 !p-0 flex items-center justify-center"
                  style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-default)' }}>
            <span className="icon text-base">close</span>
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-7 h-7 border-2 rounded-full"
                    style={{ borderColor: 'var(--border-strong)', borderTopColor: '#1877F2', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-sm" style={{ color: '#EF4444' }}>{error}</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12">
              <span className="icon text-5xl mb-3" style={{ color: 'var(--border-strong)', display: 'block' }}>article</span>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Chưa có bài đăng nào. Bấm <strong>"Scrape ngay"</strong> để thu thập.
              </p>
            </div>
          ) : posts.map(post => {
            const isExp  = expanded[post.postId]
            const showCm = openCmt[post.postId]
            const txt    = post.content ?? ''
            const long   = txt.length > 220
            const disp   = !long || isExp ? txt : txt.slice(0, 220) + '…'
            const cmts   = post.comments ?? []
            const { positive = 0, negative = 0, neutral = 0 } = post.sentiment ?? {}
            const tot    = positive + negative + neutral

            return (
              <div key={post.postId} className="rounded-xl p-4 space-y-3"
                   style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>

                {/* Post header */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                       style={{ background: '#1877F2' }}>
                    <span className="icon text-white text-sm">person</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Phân Tích Kinh Doanh Test
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDate(post.postedAt)}
                    </div>
                  </div>
                  {post.reactionsCount > 0 && (
                    <div className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
                      <span className="icon text-sm">favorite</span> {post.reactionsCount}
                    </div>
                  )}
                </div>

                {/* Content */}
                <p className="text-sm leading-relaxed whitespace-pre-line"
                   style={{ color: 'var(--text-primary)' }}>{disp}</p>
                {long && (
                  <button onClick={() => setExpanded(p => ({ ...p, [post.postId]: !isExp }))}
                          className="text-xs font-medium"
                          style={{ color: '#1877F2', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {isExp ? 'Thu gọn ▲' : 'Xem thêm ▼'}
                  </button>
                )}

                {/* Sentiment bar */}
                {tot > 0 && (
                  <div className="space-y-1">
                    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                      {positive > 0 && <div style={{ flex: positive, background: '#10B981' }} />}
                      {neutral  > 0 && <div style={{ flex: neutral,  background: '#94A3B8' }} />}
                      {negative > 0 && <div style={{ flex: negative, background: '#EF4444' }} />}
                    </div>
                    <div className="flex gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {positive > 0 && <span style={{ color: '#10B981' }}>👍 {positive}</span>}
                      {neutral  > 0 && <span>😐 {neutral}</span>}
                      {negative > 0 && <span style={{ color: '#EF4444' }}>👎 {negative}</span>}
                    </div>
                  </div>
                )}

                {/* Comments */}
                {cmts.length > 0 && (
                  <div>
                    <button onClick={() => setOpenCmt(p => ({ ...p, [post.postId]: !showCm }))}
                            className="flex items-center gap-1 text-xs"
                            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <span className="icon text-sm">chat_bubble_outline</span>
                      {showCm ? 'Ẩn bình luận' : `${cmts.length} bình luận`}
                      <span className="icon text-sm">{showCm ? 'expand_less' : 'expand_more'}</span>
                    </button>
                    {showCm && (
                      <div className="mt-2 space-y-2 pl-3 border-l-2"
                           style={{ borderColor: 'var(--border-default)' }}>
                        {cmts.map((c, i) => (
                          <div key={i} className="flex gap-2">
                            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
                                 style={{ background: 'var(--bg-card)' }}>
                              <span className="icon text-xs" style={{ color: 'var(--text-tertiary)' }}>person</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="rounded-xl px-3 py-2 text-xs"
                                   style={{ background: 'var(--bg-card)' }}>
                                <p style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                  {c.text || c.comment_text}
                                </p>
                              </div>
                              <div className="mt-0.5 ml-1">
                                <SentimentBadge type={c.sentiment} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 shrink-0"
               style={{ borderTop: '1px solid var(--border-default)' }}>
            <button onClick={() => load(page - 1)} disabled={page <= 1 || loading}
                    className="lbtn !h-8 !px-3 text-xs disabled:opacity-40">
              <span className="icon text-sm">chevron_left</span> Trước
            </button>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {page} / {totalPages}
            </span>
            <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading}
                    className="lbtn !h-8 !px-3 text-xs disabled:opacity-40">
              Sau <span className="icon text-sm">chevron_right</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Facebook Feed trigger button (dùng trong FacebookConnectCard) ─────────────
function FacebookFeed() {
  const [open,  setOpen]  = useState(false)
  const [count, setCount] = useState(null)  // null = chưa biết, 0 = không có

  useEffect(() => {
    api.get('/api/integrations/facebook/posts?page=1&pageSize=1')
      .then(r => setCount(r.data.total ?? 0))
      .catch(() => setCount(0))
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lbtn w-full justify-center gap-2"
        style={{
          height: 38,
          border: '1px solid rgba(24,119,242,0.35)',
          color: '#1877F2',
          background: 'rgba(24,119,242,0.06)',
        }}
      >
        <span className="icon text-base">article</span>
        Xem bài đăng đã thu thập
        {count !== null && count > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: '#1877F2', color: '#fff' }}>
            {count}
          </span>
        )}
      </button>
      {open && <FacebookPostsModal onClose={() => setOpen(false)} />}
    </>
  )
}

// ── Channel Connect Tab ───────────────────────────────────────────────────────
function ChannelConnectTab() {
  return (
    <div className="space-y-4">
      <div className="lcard px-5 py-3">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
          Kết nối các kênh bán hàng để hệ thống tự động thu thập dữ liệu.
          Thông tin xác thực được mã hóa AES-256-GCM và lưu theo từng tenant.
        </p>
      </div>

      {/* Facebook – vẫn dùng card chuyên biệt (có Scrape ngay) */}
      <FacebookConnectCard />
      <FacebookFeed />

      {/* Shopee */}
      <ConnectorCard
        channel="shopee" label="Shopee" color="#EE4D2D" icon="storefront"
        guideUrl="https://open.shopee.com/developer-guide/16"
        guideText="Lấy credentials tại open.shopee.com"
        statusUrl="/api/integrations/shopee/status"
        connectUrl="/api/integrations/shopee"
        disconnectUrl="/api/integrations/shopee"
        fields={[
          { key: 'partnerId',   label: 'Partner ID',    required: true, hint: 'Shopee Open Platform → App List' },
          { key: 'partnerKey',  label: 'Partner Key',   required: true, hint: 'App → Credentials', secret: true },
          { key: 'shopId',      label: 'Shop ID',       required: true, hint: 'Seller Center → Profile → Shop ID' },
          { key: 'accessToken', label: 'Access Token',  required: true, hint: 'Lấy qua OAuth flow', secret: true },
        ]}
      />

      {/* Lazada */}
      <ConnectorCard
        channel="lazada" label="Lazada" color="#0F146D" icon="store"
        guideUrl="https://open.lazada.com/apps/doc/doc.htm"
        guideText="Lấy credentials tại open.lazada.com"
        statusUrl="/api/integrations/lazada/status"
        connectUrl="/api/integrations/lazada"
        disconnectUrl="/api/integrations/lazada"
        fields={[
          { key: 'appKey',      label: 'App Key',       required: true, hint: 'Lazada Open Platform → My Apps' },
          { key: 'appSecret',   label: 'App Secret',    required: true, hint: 'Cùng trang với App Key', secret: true },
          { key: 'accessToken', label: 'Access Token',  required: true, hint: 'Lấy qua OAuth tại open.lazada.com', secret: true },
        ]}
      />

      {/* TikTok Shop */}
      <ConnectorCard
        channel="tiktok" label="TikTok Shop" color="#010101" icon="play_circle"
        guideUrl="https://partner.tiktokshop.com/docv2/page/63faf02007c1e302f3595a73"
        guideText="Lấy credentials tại partner.tiktokshop.com"
        statusUrl="/api/integrations/tiktok/status"
        connectUrl="/api/integrations/tiktok"
        disconnectUrl="/api/integrations/tiktok"
        fields={[
          { key: 'appKey',      label: 'App Key',       required: true, hint: 'TikTok Shop Partner Center → Apps' },
          { key: 'appSecret',   label: 'App Secret',    required: true, hint: 'App → App Secret', secret: true },
          { key: 'shopId',      label: 'Shop ID',       required: true, hint: 'Shop Management → Shop ID' },
          { key: 'accessToken', label: 'Access Token',  required: true, hint: 'Lấy qua OAuth flow', secret: true },
        ]}
      />

      {/* GHN */}
      <ConnectorCard
        channel="ghn" label="GHN (Giao Hàng Nhanh)" color="#F59E0B" icon="local_shipping"
        guideUrl="https://sso.ghn.vn"
        guideText="Đăng nhập sso.ghn.vn → Tài khoản → API"
        statusUrl="/api/integrations/ghn/status"
        connectUrl="/api/integrations/ghn"
        disconnectUrl="/api/integrations/ghn"
        fields={[
          { key: 'token',  label: 'API Token', required: true, hint: 'sso.ghn.vn → Tài khoản → API Token', secret: true },
          { key: 'shopId', label: 'Shop ID',   required: true, hint: 'GHN Seller → Thông tin cửa hàng → Mã cửa hàng' },
        ]}
      />

      {/* VNPay */}
      <ConnectorCard
        channel="vnpay" label="VNPay" color="#005BAA" icon="payments"
        guideUrl="https://sandbox.vnpayment.vn/merchantv2"
        guideText="Lấy thông tin tại sandbox.vnpayment.vn"
        statusUrl="/api/integrations/vnpay/status"
        connectUrl="/api/integrations/vnpay"
        disconnectUrl="/api/integrations/vnpay"
        fields={[
          { key: 'merchantId',  label: 'Merchant ID (TMN Code)', required: true, hint: 'VNPay Merchant Portal → Thông tin' },
          { key: 'hashSecret',  label: 'Hash Secret',            required: true, hint: 'Cùng trang với Merchant ID', secret: true },
          { key: 'environment', label: 'Môi trường', type: 'select',
            options: [{ value: 'sandbox', label: 'Sandbox (Test)' }, { value: 'production', label: 'Production (Thật)' }] },
        ]}
      />
    </div>
  )
}

export default function DataSyncPage() {
  const { t } = useTranslation()
  const canToggle = useHasRole(['Owner', 'Manager'])
  const [activeTab, setActiveTab] = useState('sync')
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
    try {
      await triggerSync(source)
      await fetchStatus()
    } catch (err) {
      const msg = err.response?.data?.message || 'Lỗi hệ thống, vui lòng thử lại sau'
      showToast(msg, 'error')
    } finally {
      setSyncing(s => ({ ...s, [source]: false }))
    }
  }

  const handleToggle = async integrationId => {
    try {
      await toggleIntegration(integrationId)
      await fetchStatus()
    } catch (err) {
      showToast(err.response?.data?.message || 'Lỗi khi thay đổi trạng thái', 'error')
    }
  }

  const sources = data?.sources ?? []
  const successCount = sources.filter(s => s.status === 'success').length
  const errorCount   = sources.filter(s => s.status === 'error').length
  const syncingCount = sources.filter(s => s.status === 'syncing').length

  const TABS = [
    { key: 'sync',    label: t('dataSync.title'),  icon: 'sync' },
    { key: 'connect', label: 'Kết nối kênh',        icon: 'link' },
    { key: 'import',  label: t('nav.import'),       icon: 'upload_file' },
    { key: 'scraper', label: 'Từ khóa Scraper',     icon: 'search' },
  ]

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('dataSync.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('dataSync.subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 pb-3 px-4 text-sm font-medium transition-all"
            style={{
              borderBottom: `2px solid ${activeTab === tab.key ? 'var(--primary-500)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--primary-500)' : 'var(--text-secondary)',
              marginBottom: -1,
            }}
          >
            <span className="icon" style={{ fontSize: 16 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Đồng bộ tự động */}
      {activeTab === 'sync' && (
        <>
          {/* Summary mini-bar */}
          {!loading && sources.length > 0 && (
            <div className="lcard px-5 py-3 flex items-center gap-6 flex-wrap">
              {[
                { labelKey: 'common.records',              value: sources.length, color: 'var(--text-primary)' },
                { labelKey: 'dataSync.syncStatus.success', value: successCount,   color: 'var(--accent-500)'  },
                { labelKey: 'dataSync.syncStatus.syncing', value: syncingCount,   color: '#F59E0B'             },
                { labelKey: 'dataSync.syncStatus.error',   value: errorCount,     color: '#EF4444'             },
              ].map(item => (
                <div key={item.labelKey} className="flex items-center gap-2">
                  <span className="font-mono text-xl font-bold" style={{ color: item.color }}>{item.value}</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t(item.labelKey)}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="lcard p-16 flex items-center justify-center">
              <span className="w-7 h-7 border-2 rounded-full"
                    style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {/* ETL Pipeline card – đồng bộ ngay toàn bộ OLTP→DW */}
              <EtlPipelineCard t={t} />

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sources.map(src => (
                  <SourceCard
                    key={src.sourceKey}
                    src={src}
                    syncing={syncing[src.sourceKey]}
                    onSync={() => handleSync(src.sourceKey)}
                    onToggle={handleToggle}
                    canToggle={canToggle}
                    t={t}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Tab: Kết nối kênh */}
      {activeTab === 'connect' && <ChannelConnectTab />}

      {/* Tab: Import thủ công */}
      {activeTab === 'import' && <ImportTab />}

      {/* Tab: Keywords Scraper */}
      {activeTab === 'scraper' && <KeywordManager />}
    </div>
  )
}
