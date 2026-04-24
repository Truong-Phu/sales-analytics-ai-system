/** Mock data cho DataSyncPage khi API chưa kết nối */
export const MOCK_DATA_SYNC = {
  sources: [
    { sourceKey: 'shopee',   sourceName: 'Shopee',     status: 'success', lastSync: '2025-04-15T08:00:00Z', recordsSynced: 1250, errorMessage: null },
    { sourceKey: 'lazada',   sourceName: 'Lazada',     status: 'success', lastSync: '2025-04-15T07:45:00Z', recordsSynced: 830,  errorMessage: null },
    { sourceKey: 'tiktok',   sourceName: 'TikTok Shop',status: 'idle',    lastSync: '2025-04-14T23:00:00Z', recordsSynced: 620,  errorMessage: null },
    { sourceKey: 'facebook', sourceName: 'Facebook',   status: 'error',   lastSync: '2025-04-14T20:00:00Z', recordsSynced: 0,    errorMessage: 'Token hết hạn – cần xác thực lại' },
    { sourceKey: 'ghn',      sourceName: 'GHN',        status: 'success', lastSync: '2025-04-15T06:30:00Z', recordsSynced: 450,  errorMessage: null },
    { sourceKey: 'vnpay',    sourceName: 'VNPay',      status: 'idle',    lastSync: '2025-04-13T12:00:00Z', recordsSynced: 280,  errorMessage: null },
  ],
}
