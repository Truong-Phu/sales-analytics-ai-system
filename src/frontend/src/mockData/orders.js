/** Mock data cho OrdersPage khi API chưa kết nối */
export const MOCK_ORDERS = {
  items: [
    { orderId: 1, externalOrderId: 'ORD-20250415-A1B2', customerName: 'Nguyễn Thị Hoa', channel: 'shopee',   totalAmount: 850_000,  paymentMethod: 'COD',       status: 'delivered', createdAt: '2025-04-15T08:30:00Z' },
    { orderId: 2, externalOrderId: 'ORD-20250414-C3D4', customerName: 'Trần Văn Bình',   channel: 'lazada',   totalAmount: 1_250_000, paymentMethod: 'VNPay',     status: 'shipping',  createdAt: '2025-04-14T14:20:00Z' },
    { orderId: 3, externalOrderId: 'ORD-20250414-E5F6', customerName: 'Lê Minh Tâm',     channel: 'tiktok',   totalAmount: 450_000,  paymentMethod: 'MoMo',      status: 'confirmed', createdAt: '2025-04-14T10:15:00Z' },
    { orderId: 4, externalOrderId: 'ORD-20250413-G7H8', customerName: 'Phạm Thu Hà',     channel: 'facebook', totalAmount: 990_000,  paymentMethod: 'COD',       status: 'pending',   createdAt: '2025-04-13T16:45:00Z' },
    { orderId: 5, externalOrderId: 'ORD-20250413-I9J0', customerName: 'Đỗ Quang Hưng',   channel: 'website',  totalAmount: 2_150_000, paymentMethod: 'Banking',   status: 'delivered', createdAt: '2025-04-13T09:00:00Z' },
    { orderId: 6, externalOrderId: 'ORD-20250412-K1L2', customerName: 'Vũ Thị Ngọc',     channel: 'shopee',   totalAmount: 650_000,  paymentMethod: 'ShopeePay', status: 'cancelled', createdAt: '2025-04-12T11:30:00Z' },
  ],
  total: 6,
  page: 1,
  limit: 20,
  totalPages: 1,
}
