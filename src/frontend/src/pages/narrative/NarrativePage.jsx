import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getNarrative } from '../../api/aiApi'

export default function NarrativePage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [days,    setDays]    = useState(30)
  const [lang,    setLang]    = useState('vi')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getNarrative({ days, language: lang })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        period: `${days} ngày gần nhất`, language: lang,
        headline: 'Doanh thu tháng tăng 15.3% – kết quả kinh doanh rất tích cực!',
        full_narrative: 'Trong 30 ngày vừa qua, tổng doanh thu đạt **158.5 triệu VNĐ**, tăng **15.3%** so với tháng trước. Số lượng đơn hàng tăng 8.7% với **680 đơn**. Kênh **Shopee** tiếp tục dẫn đầu về doanh thu. Sản phẩm bán chạy nhất là **Áo thun nam cổ tròn**. Xu hướng hiện tại rất thuận lợi – nên duy trì chiến lược và tăng ngân sách marketing.',
        key_metrics: { current_revenue: 158500000, revenue_change: 15.3, current_orders: 680, orders_change: 8.7 },
        anomaly_note: 'Phát hiện 1 ngày bất thường: 05/05/2026 doanh thu cao đột biến (+3.2σ)',
        recommendations: [
          'Tập trung ngân sách quảng cáo vào kênh Shopee – đang dẫn đầu doanh thu.',
          'Xem xét phân tích RFM để chăm sóc khách hàng có nguy cơ rời bỏ.',
          'Chuẩn bị chiến dịch 11.11 sớm – dự kiến doanh thu tăng 3.5x.',
        ],
        generated_by: 'rule_based',
        is_mock: true,
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days, lang])

  // Render markdown-like bold
  const renderBold = (text) => text.split('**').map((part, i) =>
    i % 2 === 0 ? part : <strong key={i} className="text-white font-semibold">{part}</strong>
  )

  const revChg = data?.key_metrics?.revenue_change ?? 0
  const revColor = revChg >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Nhận xét Thông minh</h1>
          <p className="text-sm text-gray-400 mt-1">Tự động sinh nhận xét doanh thu bằng ngôn ngữ tự nhiên</p>
        </div>
        <div className="flex gap-2">
          <select value={days} onChange={e => setDays(+e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
            {[7,14,30,90].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
          <button onClick={() => setLang(l => l === 'vi' ? 'en' : 'vi')}
            className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg text-sm hover:border-blue-500">
            {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
          </button>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            Làm mới
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Đang sinh nhận xét...</div>
      ) : data && (
        <>
          {/* Headline */}
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/30 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{revChg >= 10 ? '🚀' : revChg >= 0 ? '📈' : '📉'}</span>
              <div>
                <div className="text-lg font-bold text-white leading-snug">{data.headline}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Kỳ: {data.period} · Sinh bởi: {data.generated_by === 'rule_based' ? 'Rule-based AI' : 'AI Model'}
                </div>
              </div>
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Doanh thu kỳ này', value: `${((data.key_metrics?.current_revenue??0)/1e6).toFixed(1)}M VNĐ`, color: 'text-blue-400' },
              { label: 'Tăng trưởng',      value: `${revChg>=0?'+':''}${revChg}%`,  color: revColor },
              { label: 'Đơn hàng',         value: (data.key_metrics?.current_orders??0).toLocaleString(), color: 'text-green-400' },
              { label: 'ĐH tăng/giảm',    value: `${(data.key_metrics?.orders_change??0)>=0?'+':''}${data.key_metrics?.orders_change??0}%`, color: (data.key_metrics?.orders_change??0)>=0 ? 'text-green-400' : 'text-red-400' },
            ].map(k => (
              <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">{k.label}</div>
                <div className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Full narrative */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">📄 Nhận xét chi tiết</h3>
            <p className="text-gray-300 leading-relaxed">{renderBold(data.full_narrative)}</p>
          </div>

          {/* Anomaly note */}
          {data.anomaly_note && (
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-200">
              ⚠️ {data.anomaly_note}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations?.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">💡 Gợi ý hành động</h3>
              <ul className="space-y-2">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-blue-400 font-bold mt-0.5">{i+1}.</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Export hint */}
          <div className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            💡 Nhận xét này tự động được chèn vào báo cáo PDF khi xuất tại trang <strong className="text-gray-300">Báo cáo</strong>.
          </div>
        </>
      )}
    </div>
  )
}
