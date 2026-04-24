/** Mock data cho EtlMonitorPage khi API chưa kết nối */
export const MOCK_ETL = {
  pipelines: [
    { pipelineId: 'extract_shopee',   name: 'Extract – Shopee',          status: 'success', lastRun: '2025-04-15T08:05:00Z', duration: 45,  rowsProcessed: 1250, errorMessage: null },
    { pipelineId: 'extract_lazada',   name: 'Extract – Lazada',          status: 'success', lastRun: '2025-04-15T07:50:00Z', duration: 32,  rowsProcessed: 830,  errorMessage: null },
    { pipelineId: 'transform_clean',  name: 'Transform – Làm sạch dữ liệu', status: 'success', lastRun: '2025-04-15T08:15:00Z', duration: 120, rowsProcessed: 2080, errorMessage: null },
    { pipelineId: 'load_dw',          name: 'Load – Data Warehouse',     status: 'success', lastRun: '2025-04-15T08:17:00Z', duration: 88,  rowsProcessed: 2080, errorMessage: null },
    { pipelineId: 'extract_facebook', name: 'Extract – Facebook',        status: 'failed',  lastRun: '2025-04-14T20:05:00Z', duration: 12,  rowsProcessed: 0,    errorMessage: 'Auth token expired' },
    { pipelineId: 'train_prophet',    name: 'Train – Prophet Model',     status: 'pending', lastRun: null,                   duration: null, rowsProcessed: null, errorMessage: null },
  ],
}
