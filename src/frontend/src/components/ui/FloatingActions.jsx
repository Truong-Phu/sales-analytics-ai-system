import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// Hiển thị tooltip khi hover
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false)
  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {show && (
        <div
          className="absolute right-full mr-3 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap pointer-events-none"
          style={{
            background: 'var(--bg-base)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 60,
          }}
        >
          {text}
          {/* Mũi tên phải */}
          <span
            className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 rotate-45"
            style={{ background: 'var(--bg-base)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}
          />
        </div>
      )}
      {children}
    </div>
  )
}

// Nút tròn nổi
function FabButton({ onClick, icon, tooltip, color, visible = true }) {
  return (
    <Tooltip text={tooltip}>
      <button
        onClick={onClick}
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg
                   transition-all duration-200 hover:scale-110 active:scale-95"
        style={{
          background: color,
          color: '#fff',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transform: visible ? 'scale(1)' : 'scale(0.8)',
          transition: 'opacity 250ms ease, transform 250ms ease',
          boxShadow: 'var(--shadow-md)',
        }}
        aria-label={tooltip}
      >
        <span className="icon" style={{ fontSize: 22 }}>{icon}</span>
      </button>
    </Tooltip>
  )
}

// Component chính — đặt trong AppShell, render trên mọi route
export default function FloatingActions() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [scrolled, setScrolled] = useState(false)

  // Theo dõi scroll để hiện/ẩn ScrollTop button
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 200)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isOnAiPage = location.pathname === '/recommendations'

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3"
      style={{ pointerEvents: 'none' }}
    >
      {/* Nút Chatbot AI — ẩn khi đang ở /recommendations */}
      <div style={{ pointerEvents: 'auto', opacity: isOnAiPage ? 0 : 1, transition: 'opacity 250ms ease', pointerEvents: isOnAiPage ? 'none' : 'auto' }}>
        <FabButton
          onClick={() => navigate('/recommendations')}
          icon="smart_toy"
          tooltip="Chatbot AI"
          color="linear-gradient(135deg, var(--primary-500), var(--accent-500))"
          visible={!isOnAiPage}
        />
      </div>

      {/* Nút Scroll to Top — chỉ hiện khi scroll > 200px */}
      <div style={{ pointerEvents: scrolled ? 'auto' : 'none' }}>
        <FabButton
          onClick={scrollToTop}
          icon="keyboard_arrow_up"
          tooltip="Lên đầu trang"
          color="var(--bg-elevated, #374151)"
          visible={scrolled}
        />
      </div>
    </div>
  )
}
