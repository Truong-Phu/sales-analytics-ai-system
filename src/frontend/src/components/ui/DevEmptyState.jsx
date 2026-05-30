/**
 * Empty state cho section chưa có API backend.
 * Khác AiEmptyState: không đề cập mock button vì không có dữ liệu nào để demo.
 */
export default function DevEmptyState({ title = 'Tính năng đang phát triển', desc }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
      <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6, maxWidth: 360 }}>
        {desc ?? 'Chức năng này chưa có dữ liệu từ hệ thống. Sẽ được cập nhật trong phiên bản tiếp theo.'}
      </p>
    </div>
  )
}
