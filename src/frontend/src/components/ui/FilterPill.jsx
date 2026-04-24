import { useState, useRef, useEffect } from 'react'

export default function FilterPill({ label, options = [], value, onChange, icon }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = options.find(o => o.value === value)
  const isActive = value && value !== '' && value !== 'all'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
                   transition-all border whitespace-nowrap"
        style={{
          background: isActive ? 'var(--primary-50)' : 'var(--bg-surface)',
          borderColor: isActive ? 'var(--primary-200)' : 'var(--border)',
          color: isActive ? 'var(--primary-600)' : 'var(--text-secondary)',
        }}
      >
        {icon && <span className="icon icon-sm">{icon}</span>}
        {selected?.label ?? label}
        {isActive ? (
          <span
            className="icon icon-sm ml-0.5 cursor-pointer hover:opacity-70"
            style={{ fontSize: 14 }}
            onClick={e => { e.stopPropagation(); onChange('all') }}
          >
            close
          </span>
        ) : (
          <span className="icon icon-sm" style={{ fontSize: 14 }}>
            {open ? 'expand_less' : 'expand_more'}
          </span>
        )}
      </button>

      {open && (
        <div
          className="lcard absolute top-full left-0 mt-1 z-50 py-1 scale-in"
          style={{ minWidth: 160, boxShadow: 'var(--shadow-lg)' }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm
                         transition-colors text-left hover:bg-[--bg-elevated]"
              style={{ color: 'var(--text-primary)' }}
            >
              {opt.label}
              {opt.value === value && (
                <span className="icon icon-sm" style={{ color: 'var(--primary-500)', fontSize: 16 }}>check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
