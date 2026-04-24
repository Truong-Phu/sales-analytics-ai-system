// Pill nhỏ góc trên phải thay cho full-width banner mock
export default function MockToast({ show }) {
  if (!show) return null
  return (
    <div
      className="fixed top-[64px] right-4 z-40 flex items-center gap-2
                 px-3 py-1.5 rounded-full text-xs font-medium shadow-sm slide-up"
      style={{
        background: 'rgba(245,158,11,0.10)',
        border:     '1px solid rgba(245,158,11,0.30)',
        color:      '#D97706',
        backdropFilter: 'blur(8px)',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ background: '#F59E0B' }}
      />
      Dữ liệu mẫu
    </div>
  )
}
