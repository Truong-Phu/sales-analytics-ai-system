import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getChannelAttribution } from '../../api/aiApi'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#06B6D4']

export default function AttributionPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [days,    setDays]    = useState(30)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getChannelAttribution({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        model:'last_touch', total_revenue:100_000_000, total_orders:680, analysis_days:30,
        top_channel:'Shopee', worst_roi_channel:'Facebook', is_mock:true,
        insight:'Shopee đóng góp 45% doanh thu với ROI cao nhất. Facebook có ROI thấp nhất.',
        channels:[
          { channel:'Shopee',            revenue:45_000_000, orders:312, attribution_pct:45.0, avg_order_value:144231, ad_spend:3_500_000, roi_pct:1185.7, cpa:11218, recommendation:'Kênh hiệu quả nhất – tăng ngân sách 20%' },
          { channel:'TikTok Shop',       revenue:28_000_000, orders:195, attribution_pct:28.0, avg_order_value:143590, ad_spend:5_200_000, roi_pct:438.5,  cpa:26667, recommendation:'ROI tốt nhưng CPA cao – tối ưu creative' },
          { channel:'Lazada',            revenue:15_000_000, orders:98,  attribution_pct:15.0, avg_order_value:153061, ad_spend:2_100_000, roi_pct:614.3,  cpa:21429, recommendation:'Ổn định – duy trì' },
          { channel:'Facebook',          revenue:7_000_000,  orders:45,  attribution_pct:7.0,  avg_order_value:155556, ad_spend:4_800_000, roi_pct:45.8,   cpa:106667,recommendation:'ROI thấp – xem xét lại chiến lược' },
          { channel:'Website trực tiếp', revenue:5_000_000,  orders:30,  attribution_pct:5.0,  avg_order_value:166667, ad_spend:0,         roi_pct:0,      cpa:0,     recommendation:'AOV cao – đầu tư SEO' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const pieData = (data?.channels ?? []).map(c => ({ name: c.channel, value: c.revenue }))
  const fmt = v => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${v.toLocaleString()}`
  const roiColor = roi => roi >= 500 ? '#22C55E' : roi >= 200 ? '#3B82F6' : roi >= 50 ? '#F59E0B' : roi > 0 ? '#EF4444' : '#6B7280'

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Phân bổ Doanh thu theo Kênh</h1>
          <p className="text-sm text-gray-400 mt-1">Channel Attribution – ROI quảng cáo theo từng kênh bán</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)}
          className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
          {[7,14,30,90,365].map(d => <option key={d} value={d}>{d} ngày</option>)}
        </select>
      </div>

      {loading ? <div className="p-8 text-center text-gray-400">Đang tải...</div> : (
        <>
          {/* Insight */}
          {data?.insight && (
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 text-sm text-blue-200">
              💡 {data.insight}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pie chart */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Tỷ trọng doanh thu</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${fmt(v)} VNĐ`} contentStyle={{ background:'#1F2937', border:'1px solid #374151', borderRadius:8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Summary */}
            <div className="space-y-3">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">Tổng doanh thu</div>
                <div className="text-2xl font-bold text-white">{fmt(data?.total_revenue ?? 0)} VNĐ</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">Kênh dẫn đầu</div>
                <div className="text-xl font-bold text-green-400">🏆 {data?.top_channel}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">Kênh ROI thấp nhất</div>
                <div className="text-xl font-bold text-red-400">⚠️ {data?.worst_roi_channel || '–'}</div>
              </div>
            </div>
          </div>

          {/* Channel table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase">
                  <th className="text-left p-3">Kênh</th>
                  <th className="text-right p-3">Doanh thu</th>
                  <th className="text-right p-3">Tỷ trọng</th>
                  <th className="text-right p-3">Đơn hàng</th>
                  <th className="text-right p-3">AOV</th>
                  <th className="text-right p-3">ROI</th>
                  <th className="text-left p-3">Gợi ý</th>
                </tr>
              </thead>
              <tbody>
                {(data?.channels ?? []).map((c, i) => (
                  <tr key={c.channel} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="font-medium text-white">{c.channel}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-white">{fmt(c.revenue)}M</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-12 h-1.5 rounded-full bg-gray-700">
                          <div className="h-full rounded-full" style={{ width:`${c.attribution_pct}%`, background: COLORS[i%COLORS.length] }} />
                        </div>
                        <span className="text-gray-300 text-xs">{c.attribution_pct}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-right text-gray-300">{c.orders}</td>
                    <td className="p-3 text-right text-gray-300">{(c.avg_order_value/1000).toFixed(0)}K</td>
                    <td className="p-3 text-right font-mono font-bold" style={{ color: roiColor(c.roi_pct) }}>
                      {c.roi_pct > 0 ? `${c.roi_pct}%` : '–'}
                    </td>
                    <td className="p-3 text-xs text-gray-400 max-w-xs">{c.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
