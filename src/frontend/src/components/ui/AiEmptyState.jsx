/**
 * Empty state khi AI Service chưa chạy hoặc chưa đủ dữ liệu.
 * Hiển thị thay vì auto-load mock data.
 */
export default function AiEmptyState({ title = 'Chưa đủ dữ liệu để phân tích' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🤖</div>
      <h3 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 420 }}>
        AI Service chưa khởi động hoặc chưa có đủ dữ liệu lịch sử để chạy mô hình.
        <br />
        Nhấn nút <strong style={{ color: '#F59E0B' }}>Xem dữ liệu mẫu</strong> ở góc dưới phải để xem demo.
      </p>
    </div>
  )
}
