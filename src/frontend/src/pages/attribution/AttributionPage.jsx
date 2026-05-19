import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getChannelAttribution } from '../../api/aiApi'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#6366F1','#22C55E','#F59E0B','#EF4444','#8B5CF6','#06B6D4']

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
          { channel:'Shopee',            revenue:45_000_000, orders:312, attribution_pct:45.0, avg_order_value:144231, ad_spend:3_500_000,  roi_pct:1185.7, cpa:11218,  recommendation:'Kênh hiệu quả nhất – tăng ngân sách 20%' },
          { channel:'TikTok Shop',       revenue:28_000_000, orders:195, attribution_pct:28.0, avg_order_value:143590, ad_spend:5_200_000,  roi_pct:438.5,  cpa:26667,  recommendation:'ROI tốt nhưng CPA cao – tối ưu creative' },
          { channel:'Lazada',            revenue:15_000_000, orders:98,  attribution_pct:15.0, avg_order_value:153061, ad_spend:2_100_000,  roi_pct:614.3,  cpa:21429,  recommendation:'Ổn định – duy trì' },
          { channel:'Facebook',          revenue:7_000_000,  orders:45,  attribution_pct:7.0,  avg_order_value:155556, ad_spend:4_800_000,  roi_pct:45.8,   cpa:106667, recommendation:'ROI thấp – xem xét lại chiến lược' },
          { channel:'Website trực tiếp', revenue:5_000_000,  orders:30,  attribution_pct:5.0,  avg_order_value:166667, ad_spend:0,          roi_pct:0,      cpa:0,      recommendation:'AOV cao – đầu tư SEO' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const pieData  = (data?.channels ?? []).map(c => ({ name: c.channel, value: c.revenue }))
  const fmt      = v => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${v.toLocaleString()}`
  const roiColor = roi => roi >= 500 ? '#22C55E' : roi >= 200 ? 'var(--primary-500)' : roi >= 50 ? '#F59E0B' : roi > 0 ? '#EF4444' : 'var(--text-tertiary)'

  return (
    <div className="space-y-5">
      {isMock && <MockToast />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Phân bổ Doanh thu theo Kênh</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Channel Attribution – ROI quảng cáo theo từng kênh bán</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 120 }}>
          {[7,14,30,90,365].map(d => <option key={d} value={d}>{d} ngày</option>)}
        </select>
      </div>

      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <>
          {/* Insight */}
          {data?.insight && (
            <div className="rounded-xl p-4 text-sm"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--primary-700)' }}>
              💡 {data.insight}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pie chart */}
            <div className="lcard p-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Tỷ trọng doanh thu</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={v => `${fmt(v)} VNĐ`}
                    contentStyle={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Summary stats */}
            <div className="lcard p-4 space-y-2">
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Tổng quan</h3>
              {[
                { label: 'Tổng doanh thu', value: `${fmt(data?.total_revenue ?? 0)} VNĐ`, color: 'var(--primary-500)' },
                { label: 'Tổng đơn hàng',  value: `${(data?.total_orders ?? 0).toLocaleString()} đơn`, color: '#22C55E' },
                { label: 'Kênh tốt nhất',  value: data?.top_channel ?? '—', color: '#22C55E' },
                { label: 'ROI thấp nhất',  value: data?.worst_roi_channel ?? '—', color: '#EF4444' },
              ].map(k => (
                <div key={k.label} className="flex justify-between items-center py-2"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{k.label}</span>
                  <span className="font-semibold text-sm" style={{ color: k.color }}>{k.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Channel table */}
          <div className="lcard overflow-hidden">
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Chi tiết theo kênh</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Kênh','Doanh thu','Đơn','AOV','Chi phí ads','ROI','Gợi ý'].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold"
                        style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.channels ?? []).map(c => (
                    <tr key={c.channel} style={{ borderBottom: '1px solid var(--border)' }}
                      className="transition-colors"
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="p-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.channel}</td>
                      <td className="p-3">
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(c.revenue)} VNĐ</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.attribution_pct}%</div>
                      </td>
                      <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{c.orders}</td>
                      <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{fmt(c.avg_order_value)}</td>
                      <td className="p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.ad_spend > 0 ? `${fmt(c.ad_spend)} VNĐ` : '—'}
                      </td>
                      <td className="p-3 font-bold" style={{ color: roiColor(c.roi_pct) }}>
                        {c.roi_pct > 0 ? `${c.roi_pct.toFixed(0)}%` : '—'}
                      </td>
                      <td className="p-3 text-xs max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{c.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
