/**
 * Empty state khi chưa đủ dữ liệu để phân tích.
 * Prop `desc` để mô tả dữ liệu cần thiết theo từng trang.
 */
export default function AiEmptyState({
  title = 'Chưa đủ dữ liệu để phân tích',
  desc,
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📊</div>
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-tertiary)', lineHeight: 1.8, maxWidth: 440 }}>
        {desc ?? 'Cần có dữ liệu đơn hàng trong khoảng thời gian đã chọn để hiển thị phân tích.'}
      </p>
    </div>
  )
}
