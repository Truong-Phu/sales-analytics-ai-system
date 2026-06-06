import { useState, useRef, useEffect } from 'react'

/**
 * InfoTooltip — icon ⓘ nhỏ, click để hiện popup giải thích KPI/thuật ngữ.
 * Props:
 *   title       — tên chỉ số (bắt buộc)
 *   description — ý nghĩa
 *   formula     — công thức tính
 *   source      — nguồn dữ liệu (string hoặc string[])
 *   placement   — 'top' | 'bottom' | 'top-left' (default: 'top')
 *   def         — object { name, description, formula, sourceFields } (backward compat với KPI_DEFINITIONS)
 *   className   — class bổ sung cho wrapper
 */
export default function InfoTooltip({ title, description, formula, source, placement = 'top', def, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Hỗ trợ cả cách gọi mới (props trực tiếp) và cũ (def object)
  const _title  = title       ?? def?.name
  const _desc   = description ?? def?.description
  const _form   = formula     ?? def?.formula
  const _src    = source      ?? (Array.isArray(def?.sourceFields) ? def.sourceFields.join(', ') : def?.sourceFields)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!_title) return null

  const popupStyle = placement === 'bottom'
    ? { top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }
    : placement === 'top-left'
    ? { bottom: 'calc(100% + 6px)', right: 0 }
    : { bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)' }

  return (
    <div ref={ref} className={`relative inline-flex shrink-0 ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="w-4 h-4 rounded-full flex items-center justify-center ml-0.5"
        style={{
          background:  'var(--bg-elevated)',
          color:       open ? 'var(--primary-500)' : 'var(--text-tertiary)',
          fontSize:    9,
          fontWeight:  700,
          lineHeight:  1,
          border:      `1px solid ${open ? 'var(--primary-400)' : 'var(--border)'}`,
          flexShrink:  0,
        }}
        title={`Xem định nghĩa: ${_title}`}
      >
        ⓘ
      </button>

      {open && (
        <div
          className="lcard scale-in absolute z-[400] p-3"
          style={{
            ...popupStyle,
            width:     270,
            boxShadow: 'var(--shadow-lg)',
            fontSize:  12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-bold mb-2" style={{ color: 'var(--text-primary)', fontSize: 13 }}>
            {_title}
          </p>
          <div className="space-y-1.5">
            {_desc && (
              <div>
                <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>Ý nghĩa: </span>
                <span style={{ color: 'var(--text-secondary)' }}>{_desc}</span>
              </div>
            )}
            {_form && (
              <div>
                <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>Công thức: </span>
                <span className="font-mono" style={{ color: 'var(--primary-600)', fontSize: 11 }}>{_form}</span>
              </div>
            )}
            {_src && (
              <div className="pt-1.5 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>Nguồn dữ liệu: </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{_src}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
