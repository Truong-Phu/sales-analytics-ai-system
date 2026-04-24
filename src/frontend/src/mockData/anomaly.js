/** Mock data cho AnomalyPage khi API chưa kết nối */
export const MOCK_ANOMALY = {
  anomalies: [
    { date: '2025-03-15', channel: 'shopee',   value: 28_500_000, zScore:  3.12, severity: 'high'   },
    { date: '2025-03-22', channel: 'lazada',   value: 4_200_000,  zScore: -2.87, severity: 'high'   },
    { date: '2025-04-01', channel: 'tiktok',   value: 19_800_000, zScore:  2.61, severity: 'medium' },
    { date: '2025-04-08', channel: 'shopee',   value: 6_100_000,  zScore: -2.55, severity: 'medium' },
    { date: '2025-04-14', channel: 'facebook', value: 11_300_000, zScore:  2.52, severity: 'low'    },
  ],
}
