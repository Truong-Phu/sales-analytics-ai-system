import DevEmptyState from '../../components/ui/DevEmptyState'

export default function PricePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Thông minh Giá</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          So sánh giá sản phẩm với mức thị trường – gợi ý điều chỉnh
        </p>
      </div>
      <div className="lcard">
        <DevEmptyState
          title="Tính năng đang phát triển"
          desc="Chức năng phân tích giá thị trường yêu cầu tích hợp thu thập dữ liệu (web scraping) từ Shopee, Lazada, TikTok Shop. Đây là hướng phát triển trong phiên bản tiếp theo của hệ thống."
        />
      </div>
    </div>
  )
}
