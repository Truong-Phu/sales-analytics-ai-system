import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const CmdKContext = createContext(null)

// ── Remove Vietnamese diacritics for fuzzy search ─────────────────────────────
function removeAccents(str) {
  return str.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
}

// ── All searchable items — roles: null = all logged-in users ─────────────────
const AI_ROLES = ['Owner', 'Manager', 'DataIT']
const OPS_ROLES = ['Owner', 'DataIT']

const ITEMS = [
  // Tổng quan
  { id: 'dashboard',     label: 'Tổng quan',               desc: 'Dashboard KPI kinh doanh',               href: '/dashboard',       icon: 'dashboard',           roles: null },

  // Phân tích AI cốt lõi
  { id: 'forecast',      label: 'Dự báo doanh thu',        desc: 'Prophet AI – xu hướng & seasonality',    href: '/forecast',        icon: 'trending_up',         roles: AI_ROLES },
  { id: 'anomaly',       label: 'Phát hiện bất thường',    desc: 'Cảnh báo dữ liệu bất thường',            href: '/anomaly',         icon: 'crisis_alert',        roles: AI_ROLES },
  { id: 'recommend',     label: 'Gợi ý thông minh',        desc: 'Hỏi AI & Insights tự động',              href: '/recommendations', icon: 'psychology',          roles: AI_ROLES },

  // 13 chức năng AI sáng tạo
  { id: 'narrative',     label: 'Tường thuật AI',           desc: 'Tự động sinh narrative từ dữ liệu',     href: '/narrative',       icon: 'auto_awesome',        roles: AI_ROLES },
  { id: 'churn',         label: 'Dự báo rời bỏ',           desc: 'Churn prediction khách hàng',            href: '/churn',           icon: 'person_off',          roles: AI_ROLES },
  { id: 'basket',        label: 'Phân tích giỏ hàng',       desc: 'Market basket analysis',                 href: '/basket',          icon: 'shopping_bag',        roles: AI_ROLES },
  { id: 'whatif',        label: 'Phân tích giả định',       desc: 'What-if scenario simulation',            href: '/whatif',          icon: 'science',             roles: AI_ROLES },
  { id: 'geo',           label: 'Phân tích địa lý',         desc: 'Bản đồ doanh thu theo vùng',             href: '/geo',             icon: 'map',                 roles: AI_ROLES },
  { id: 'campaign',      label: 'Phân tích chiến dịch',     desc: 'Hiệu quả marketing campaigns',           href: '/campaign',        icon: 'campaign',            roles: AI_ROLES },
  { id: 'attribution',   label: 'Phân bổ kênh',             desc: 'Marketing attribution model',            href: '/attribution',     icon: 'account_tree',        roles: AI_ROLES },
  { id: 'suppliers',     label: 'Nhà cung cấp',             desc: 'Quản lý danh sách nhà cung cấp',         href: '/suppliers',       icon: 'local_shipping',      roles: AI_ROLES },
  { id: 'leaderboard',   label: 'Bảng xếp hạng',           desc: 'Top sản phẩm & nhân viên',               href: '/leaderboard',     icon: 'leaderboard',         roles: [...AI_ROLES, 'Staff'] },
  { id: 'inventory',     label: 'Tồn kho thông minh',       desc: 'Dự báo và cảnh báo tồn kho',            href: '/inventory',       icon: 'inventory',           roles: [...AI_ROLES, 'Staff'] },
  { id: 'sentiment',     label: 'Phân tích cảm xúc',        desc: 'Sentiment từ đánh giá khách hàng',       href: '/sentiment',       icon: 'sentiment_satisfied', roles: AI_ROLES },
  { id: 'price',         label: 'Phân tích giá',            desc: 'Tối ưu chiến lược định giá',             href: '/price',           icon: 'price_check',         roles: AI_ROLES },

  // Quản lý dữ liệu
  { id: 'orders',        label: 'Đơn hàng',                 desc: 'Xem và quản lý đơn hàng',               href: '/orders',          icon: 'receipt_long',        roles: null },
  { id: 'products',      label: 'Sản phẩm',                 desc: 'Quản lý kho sản phẩm',                  href: '/products',        icon: 'inventory_2',         roles: null },
  { id: 'categories',    label: 'Danh mục',                 desc: 'Phân loại sản phẩm',                    href: '/categories',      icon: 'category',            roles: null },
  { id: 'customers',     label: 'Khách hàng',               desc: 'Thông tin khách hàng',                  href: '/customers',       icon: 'people',              roles: null },
  { id: 'rfm',           label: 'Phân tích RFM',            desc: 'Phân khúc khách hàng theo RFM',          href: '/customers/rfm',   icon: 'pie_chart',           roles: AI_ROLES },

  // Báo cáo
  { id: 'report',        label: 'Xuất báo cáo',             desc: 'Export PDF báo cáo chuyên nghiệp',       href: '/report',          icon: 'picture_as_pdf',      roles: AI_ROLES },

  // Vận hành & ETL
  { id: 'datasync',      label: 'Đồng bộ dữ liệu',         desc: 'Kết nối sàn TMĐT & nguồn dữ liệu',      href: '/data-sync',       icon: 'sync',                roles: OPS_ROLES },
  { id: 'etl',           label: 'Giám sát ETL',             desc: 'Giám sát pipeline dữ liệu',              href: '/etl-monitor',     icon: 'monitoring',          roles: OPS_ROLES },

  // Quản trị & cài đặt
  { id: 'admin',         label: 'Quản trị hệ thống',        desc: 'Quản lý người dùng & phân quyền',        href: '/admin',           icon: 'manage_accounts',     roles: ['Owner'] },
  { id: 'notifications', label: 'Thông báo',                desc: 'Xem tất cả thông báo',                   href: '/notifications',   icon: 'notifications',       roles: null },
  { id: 'settings',      label: 'Cài đặt',                  desc: 'Tuỳ chỉnh hệ thống',                    href: '/settings',        icon: 'settings',            roles: null },
  { id: 'password',      label: 'Đổi mật khẩu',            desc: 'Thay đổi mật khẩu tài khoản',            href: '/change-password', icon: 'lock',                roles: null },
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
  const { user }              = useAuth()
  const inputRef              = useRef(null)
  const listRef               = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Lọc items theo role — null = hiển thị cho tất cả
  const visibleItems = ITEMS.filter(item =>
    !item.roles || item.roles.includes(user?.role)
  )

  const filtered = query.trim()
    ? visibleItems.filter(item => {
        const q = removeAccents(query)
        return (
          removeAccents(item.label).includes(q) ||
          removeAccents(item.desc).includes(q)
        )
      })
    : visibleItems

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
