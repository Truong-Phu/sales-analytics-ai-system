import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Dialog xác nhận — render qua React Portal vào document.body
 * để đảm bảo luôn hiển thị trên tất cả các layer.
 *
 * Props:
 *   open        — boolean
 *   onClose     — () => void
 *   onConfirm   — () => void
 *   title       — string
 *   message     — string
 *   confirmText — string (default 'Xác nhận')
 *   cancelText  — string (default 'Hủy')
 *   danger      — boolean (nút xác nhận đỏ, icon delete_forever mặc định)
 *   icon        — string | null (tên icon Material Symbols, ghi đè mặc định)
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Xác nhận',
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  danger = false,
  icon = null,
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const resolvedIcon = icon ?? (danger ? 'delete_forever' : 'help_outline')

  return createPortal(
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'rgba(15,23,42,0.45)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
        onClick={onClose}
      >
        {/* Dialog card */}
        <div
          style={{
            background: 'var(--bg-surface, #ffffff)',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(15,23,42,0.25), 0 4px 16px rgba(15,23,42,0.12)',
            width: '100%',
            maxWidth: 420,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Icon + tiêu đề */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: danger ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.10)',
            }}>
              <span className="icon" style={{
                fontSize: 22,
                color: danger ? '#EF4444' : 'var(--primary-500, #6366F1)',
              }}>
                {resolvedIcon}
              </span>
            </div>
            <h3 style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--text-primary, #0f172a)',
              lineHeight: 1.3,
            }}>
              {title}
            </h3>
          </div>

          {/* Nội dung thông báo */}
          {message && (
            <p style={{
              margin: 0,
              fontSize: 14,
              color: 'var(--text-secondary, #475569)',
              lineHeight: 1.55,
            }}>
              {message}
            </p>
          )}

          {/* Cảnh báo không thể hoàn tác (chỉ khi danger=true) */}
          {danger && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <span className="icon" style={{ fontSize: 15, color: '#EF4444', flexShrink: 0 }}>warning</span>
              <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 500 }}>
                Hành động này không thể hoàn tác.
              </span>
            </div>
          )}

          {/* Nút hành động */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              className="lbtn lbtn-secondary"
              onClick={onClose}
              style={{ minWidth: 80 }}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              style={{
                minWidth: 100,
                padding: '0 16px',
                height: 36,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                ...(danger
                  ? { background: '#EF4444', color: '#ffffff' }
                  : { background: 'var(--primary-500, #6366F1)', color: '#ffffff' }
                ),
              }}
            >
              {resolvedIcon && (
                <span className="icon" style={{ fontSize: 16 }}>{resolvedIcon}</span>
              )}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
