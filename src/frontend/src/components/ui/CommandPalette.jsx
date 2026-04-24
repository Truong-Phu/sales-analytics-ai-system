import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const CmdKContext = createContext(null)

// ── Remove Vietnamese diacritics for fuzzy search ─────────────────────────────
function removeAccents(str) {
  return str.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
}

// ── All searchable items ──────────────────────────────────────────────────────
const ITEMS = [
  { id: 'dashboard', label: 'Dashboard',              desc: 'Tổng quan kinh doanh',     href: '/dashboard',     icon: 'dashboard' },
  { id: 'orders',    label: 'Đơn hàng',               desc: 'Quản lý đơn hàng',          href: '/orders',        icon: 'receipt_long' },
  { id: 'products',  label: 'Sản phẩm',               desc: 'Quản lý sản phẩm',          href: '/products',      icon: 'inventory_2' },
  { id: 'customers', label: 'Khách hàng',             desc: 'Quản lý khách hàng',        href: '/customers',     icon: 'people' },
  { id: 'forecast',  label: 'Dự báo AI',              desc: 'Dự báo doanh thu Prophet',  href: '/forecast',      icon: 'trending_up' },
  { id: 'anomaly',   label: 'Phát hiện bất thường',   desc: 'Radar cảnh báo',            href: '/anomaly',       icon: 'crisis_alert' },
  { id: 'recommend', label: 'Hỏi AI',                 desc: 'Gợi ý kinh doanh',         href: '/recommendations', icon: 'psychology' },
  { id: 'report',    label: 'Xuất báo cáo',           desc: 'Export PDF báo cáo',        href: '/report',        icon: 'picture_as_pdf' },
  { id: 'datasync',  label: 'Đồng bộ dữ liệu',       desc: 'Kết nối sàn TMĐT',         href: '/data-sync',     icon: 'sync' },
  { id: 'etl',       label: 'ETL Monitor',            desc: 'Giám sát pipeline dữ liệu', href: '/etl-monitor',   icon: 'monitoring' },
  { id: 'admin',     label: 'Quản trị',               desc: 'Quản lý người dùng',        href: '/admin',         icon: 'manage_accounts' },
  { id: 'settings',  label: 'Cài đặt',               desc: 'Tuỳ chỉnh hệ thống',       href: '/settings',      icon: 'settings' },
]

// ── Provider ──────────────────────────────────────────────────────────────────
export function CommandPaletteProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  const open  = useCallback(() => setIsOpen(true),  [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(o => !o)
      }
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <CmdKContext.Provider value={{ isOpen, open, close }}>
      {children}
      {isOpen && <CommandPaletteModal onClose={close} />}
    </CmdKContext.Provider>
  )
}

export function useCmdK() {
  const ctx = useContext(CmdKContext)
  if (!ctx) throw new Error('useCmdK must be used inside CommandPaletteProvider')
  return ctx
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function CommandPaletteModal({ onClose }) {
  const [query, setQuery]     = useState('')
  const [cursor, setCursor]   = useState(0)
  const navigate              = useNavigate()
  const inputRef              = useRef(null)
  const listRef               = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = query.trim()
    ? ITEMS.filter(item => {
        const q = removeAccents(query)
        return (
          removeAccents(item.label).includes(q) ||
          removeAccents(item.desc).includes(q)
        )
      })
    : ITEMS

  useEffect(() => { setCursor(0) }, [query])

  const go = useCallback(item => {
    navigate(item.href)
    onClose()
  }, [navigate, onClose])

  const handleKey = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter' && filtered[cursor]) {
      go(filtered[cursor])
    }
  }

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.children[cursor]
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[300] fade-in"
        style={{ background: 'var(--bg-overlay)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="lcard scale-in fixed z-[301] top-[15%] left-1/2 -translate-x-1/2
                   overflow-hidden"
        style={{
          width: 'min(560px, 90vw)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 border-b"
          style={{ borderColor: 'var(--border)', height: '52px' }}
        >
          <span className="icon" style={{ color: 'var(--text-tertiary)', fontSize: '20px' }}>search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Tìm kiếm trang, tính năng..."
            className="flex-1 bg-transparent border-none outline-none text-base"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
          />
          <kbd
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
            onClick={onClose}
          >
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{ maxHeight: '360px', overflowY: 'auto' }}
          className="scrollbar-none"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Không tìm thấy kết quả
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => go(item)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{
                  background: i === cursor ? 'var(--bg-elevated)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={() => setCursor(i)}
              >
                <span
                  className="icon icon-sm w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
                  style={{
                    background: 'var(--primary-50)',
                    color: 'var(--primary-600)',
                    fontSize: '18px',
                  }}
                >
                  {item.icon}
                </span>
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.desc}</div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-t text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
        >
          <span><kbd className="font-mono">Esc</kbd> đóng</span>
          <span>·</span>
          <span><kbd className="font-mono">↑↓</kbd> di chuyển</span>
          <span>·</span>
          <span><kbd className="font-mono">Enter</kbd> mở</span>
        </div>
      </div>
    </>
  )
}
