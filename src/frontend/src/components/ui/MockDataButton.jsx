/**
 * Nút "Xem dữ liệu mẫu" hiện ở góc dưới phải khi AI Service chưa chạy.
 * Chỉ hiện khi show=true, click mới load mock — không auto-fallback.
 */
export default function MockDataButton({ show, onClick }) {
  if (!show) return null
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 60,
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#F59E0B', color: '#fff',
        border: 'none', borderRadius: 10, cursor: 'pointer',
        padding: '10px 18px', fontSize: 13, fontWeight: 600,
        boxShadow: '0 4px 16px rgba(245,158,11,0.4)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,158,11,0.5)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(245,158,11,0.4)' }}
    >
      📊 Xem dữ liệu mẫu
    </button>
  )
}
