import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Drawer trượt từ bên phải — render qua React Portal vào document.body
 * để thoát khỏi mọi ancestor có transform/filter/contain (ví dụ: .page-enter).
 *
 * Props:
 *   open     — boolean
 *   onClose  — () => void
 *   title    — string
 *   subtitle — string?
 *   width    — number?  (default 520px)
 *   footer   — ReactNode?
 *   children — ReactNode
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

  return createPortal(
    <>
      {/* Overlay — render trực tiếp trên document.body, z-index 1000 */}
      <div
        className="fade-in"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(15,23,42,0.35)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Panel — z-index 1001, luôn cao hơn overlay và header (z-50 = 50) */}
      <div
        className="slide-in-right"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 1001,
          width: `min(${width}px, 100vw)`,
          background: '#ffffff',
          borderLeft: '1px solid #e5e7eb',
          boxShadow: '-4px 0 32px rgba(15,23,42,0.15), -1px 0 8px rgba(15,23,42,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            flexShrink: 0,
            background: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              fontWeight: 700,
              fontSize: 15,
              lineHeight: '1.3',
              color: '#0f172a',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{
                fontSize: 12,
                marginTop: 2,
                color: '#64748b',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                margin: '2px 0 0',
              }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#0f172a' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b' }}
          >
            <span className="icon" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Vùng nội dung cuộn — min-height: 0 bắt buộc để overflow-y hoạt động trong flex */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            background: '#ffffff',
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              gap: 8,
              padding: '12px 20px',
              background: '#ffffff',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
