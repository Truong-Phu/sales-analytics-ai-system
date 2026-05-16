import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getSyncStatus, triggerSync } from '../../api/syncApi'
import { MOCK_DATA_SYNC } from '../../mockData/dataSync'
import api from '../../api/axios'
import { showToast } from '../../utils/toast'

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
  idle:    { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.25)', color: '#64748B',              dot: '#64748B',   icon: 'radio_button_unchecked', labelKey: 'dataSync.syncStatus.idle'    },
  syncing: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  color: '#F59E0B',              dot: '#F59E0B',   icon: 'sync',                   labelKey: 'dataSync.syncStatus.syncing' },
  success: { bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)',  color: 'var(--accent-500)',    dot: 'var(--accent-500)', icon: 'check_circle',   labelKey: 'dataSync.syncStatus.success' },
  error:   { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   color: '#EF4444',              dot: '#EF4444',   icon: 'error_outline',          labelKey: 'dataSync.syncStatus.error'   },
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
              {t(s.labelKey)}
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

// ── Import thủ công CSV ───────────────────────────────────────────────────────
const IMPORT_TYPES = [
  { key: 'orders',    label: 'Đơn hàng',   icon: 'receipt_long',  required: ['order_code','customer_email','product_sku','quantity','unit_price','channel','order_date','status'] },
  { key: 'products',  label: 'Sản phẩm',   icon: 'inventory_2',   required: ['sku','name','category','price','stock_quantity'] },
  { key: 'customers', label: 'Khách hàng', icon: 'people',         required: ['email','full_name'] },
  { key: 'sales-data',label: 'Doanh thu',  icon: 'bar_chart',     required: ['date','channel','quantity_sold','revenue'] },
]

function ImportTab() {
  const [type,       setType]       = useState('orders')
  const [file,       setFile]       = useState(null)
  const [preview,    setPreview]    = useState(null) // { headers, rows, total }
  const [importing,  setImporting]  = useState(false)
  const [result,     setResult]     = useState(null) // { success, skipped, errors }
  const [dragOver,   setDragOver]   = useState(false)
  const fileRef = useRef(null)

  const selectedType = IMPORT_TYPES.find(t => t.key === type) ?? IMPORT_TYPES[0]

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
      const res = await api.get(`/api/import/template/${type}`, { responseType: 'blob' })
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href  = url
      link.download = `template_${type}.csv`
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
      const res = await api.post(`/api/import/${type}`, fd, {
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

  const missingCols = preview
    ? selectedType.required.filter(r => !preview.headers.map(h => h.toLowerCase()).includes(r.toLowerCase()))
    : []

  return (
    <div className="space-y-5">
      {/* Section 1: chọn loại */}
      <div className="lcard p-5">
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          CHỌN LOẠI DỮ LIỆU
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {IMPORT_TYPES.map(it => (
            <button
              key={it.key}
              onClick={() => { setType(it.key); reset() }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all"
              style={{
                borderColor: type === it.key ? 'var(--primary-500)' : 'var(--border)',
                background:  type === it.key ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
              }}
            >
              <span className="icon" style={{ fontSize: 22, color: type === it.key ? 'var(--primary-500)' : 'var(--text-tertiary)' }}>
                {it.icon}
              </span>
              <span className="text-xs font-medium" style={{ color: type === it.key ? 'var(--primary-500)' : 'var(--text-secondary)' }}>
                {it.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: upload file */}
      <div className="lcard p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>TẢI VÀ IMPORT FILE</p>
          <button onClick={handleDownloadTemplate} className="lbtn lbtn-secondary !h-7 !px-3 text-xs gap-1">
            <span className="icon" style={{ fontSize: 14 }}>download</span>
            Tải template mẫu
          </button>
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
                Import hoàn tất: {result.success} thành công · {result.skipped} bỏ qua
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

export default function DataSyncPage() {
  const { t } = useTranslation()
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

  const handleSyncAll = async () => {
    if (data?.sources) await Promise.all(data.sources.map(s => handleSync(s.sourceKey)))
  }

  const sources = data?.sources ?? []
  const successCount = sources.filter(s => s.status === 'success').length
  const errorCount   = sources.filter(s => s.status === 'error').length
  const syncingCount = sources.filter(s => s.status === 'syncing').length

  const TABS = [
    { key: 'sync',   label: t('dataSync.title'),  icon: 'sync' },
    { key: 'import', label: t('nav.import'),       icon: 'upload_file' },
    { key: 'scraper',label: 'Từ khóa Scraper',     icon: 'search' },
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
        {activeTab === 'sync' && (
          <div className="flex items-center gap-2">
            <button onClick={fetchStatus} className="lbtn lbtn-secondary !h-9" disabled={loading}>
              <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
            </button>
            <button onClick={handleSyncAll} className="lbtn lbtn-primary !h-9">
              <span className="icon text-base">sync_alt</span>
              {t('dataSync.syncAll')}
            </button>
          </div>
        )}
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
                    t={t}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Tab: Import thủ công */}
      {activeTab === 'import' && <ImportTab />}

      {/* Tab: Keywords Scraper */}
      {activeTab === 'scraper' && <KeywordManager />}
    </div>
  )
}
