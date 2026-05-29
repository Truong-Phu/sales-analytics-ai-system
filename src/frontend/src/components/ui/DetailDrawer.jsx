import { useEffect } from 'react'

/**
 * Drawer trượt từ bên phải — dùng cho mọi màn hình xem chi tiết.
 * Props:
 *   open     — boolean
 *   onClose  — () => void
 *   title    — string
 *   subtitle — string?  (hiển thị nhỏ dưới title)
 *   width    — number?  (default 520, tính bằng px)
 *   footer   — ReactNode? (cố định ở đáy, bọc sẵn trong flex gap-2)
 *   children — ReactNode  (vùng cuộn)
 */
export default function DetailDrawer({ open, onClose, title, subtitle, width = 520, footer, children }) {
  // Khóa scroll body khi drawer đang mở
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Đóng bằng phím Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Overlay mờ */}
      <div
        className="fixed inset-0 z-40 fade-in"
        style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel trượt từ phải */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col slide-in-right"
        style={{
          width: `min(${width}px, 100vw)`,
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header cố định */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span className="icon">close</span>
          </button>
        </div>

        {/* Vùng nội dung — cuộn dọc */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {/* Footer cố định (nếu có) */}
        {footer && (
          <div
            className="shrink-0 flex gap-2 px-5 py-3"
            style={{ borderTop: '1px solid var(--border)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
