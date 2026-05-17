import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getBasketAnalysis } from '../../api/aiApi'

export default function BasketPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [minConf, setMinConf] = useState(0.3)
  const [minLift, setMinLift] = useState(1.0)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getBasketAnalysis({ min_confidence: minConf, min_lift: minLift, top_n: 30 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        total_transactions: 0, total_rules: 3, is_mock: true,
        note: 'Đang dùng dữ liệu mẫu',
        parameters: { days: 180, min_support: 0.02, min_confidence: minConf, min_lift: minLift },
        rules: [
          { antecedents:['Áo thun nam'], consequents:['Quần short nam'], support:0.25, confidence:0.72, lift:2.4, conviction:3.1, transactions:45, recommendation:'72% khách mua Áo thun nam cũng mua Quần short nam → tạo bundle giảm 5%' },
          { antecedents:['Váy hoa nữ'], consequents:['Băng đô thời trang'], support:0.18, confidence:0.65, lift:3.2, conviction:2.5, transactions:33, recommendation:'65% khách mua Váy hoa nữ cũng mua Băng đô → đề xuất cross-sell' },
          { antecedents:['Giày sneaker'], consequents:['Tất cotton'], support:0.31, confidence:0.81, lift:2.1, conviction:4.2, transactions:58, recommendation:'81% khách mua Giày sneaker cũng mua Tất cotton → hiển thị gợi ý ngay trang sản phẩm' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const liftColor = (lift) => lift >= 3 ? '#EF4444' : lift >= 2 ? '#F59E0B' : '#22C55E'

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Phân tích sản phẩm hay mua chung</h1>
          <p className="text-sm text-gray-400 mt-1">Market Basket Analysis – Thuật toán Apriori</p>
        </div>
      </div>

      {/* Params */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex gap-6 flex-wrap">
        <div>
          <label className="text-xs text-gray-400">Min Confidence: {Math.round(minConf*100)}%</label>
          <input type="range" min={0.1} max={0.9} step={0.05} value={minConf}
            onChange={e => setMinConf(+e.target.value)} className="w-32 ml-2 accent-blue-500" />
        </div>
        <div>
          <label className="text-xs text-gray-400">Min Lift: {minLift}x</label>
          <input type="range" min={1} max={5} step={0.5} value={minLift}
            onChange={e => setMinLift(+e.target.value)} className="w-32 ml-2 accent-blue-500" />
        </div>
        <button onClick={load} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Phân tích
        </button>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Tổng đơn hàng', value: data.total_transactions || '(mẫu)', color: 'text-blue-400' },
            { label: 'Rules tìm được', value: data.total_rules, color: 'text-green-400' },
            { label: 'Nguồn dữ liệu', value: data.is_mock ? 'Mẫu' : 'Thực', color: data.is_mock ? 'text-yellow-400' : 'text-green-400' },
          ].map(k => (
            <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-xs text-gray-400">{k.label}</div>
              <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rules */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang phân tích...</div>
        ) : (data?.rules ?? []).map((rule, i) => (
          <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-blue-500/40 transition-colors">
            <div className="flex items-center gap-2 flex-wrap">
              {rule.antecedents.map(p => (
                <span key={p} className="px-2 py-1 bg-blue-900/40 text-blue-300 rounded text-sm font-medium">{p}</span>
              ))}
              <span className="text-gray-400">→</span>
              {rule.consequents.map(p => (
                <span key={p} className="px-2 py-1 bg-green-900/40 text-green-300 rounded text-sm font-medium">{p}</span>
              ))}
              <div className="ml-auto flex gap-3 text-xs text-gray-400">
                <span>Support: <strong className="text-white">{(rule.support*100).toFixed(1)}%</strong></span>
                <span>Confidence: <strong className="text-white">{(rule.confidence*100).toFixed(1)}%</strong></span>
                <span>Lift: <strong style={{ color: liftColor(rule.lift) }}>{rule.lift}x</strong></span>
                <span>Đơn: <strong className="text-white">{rule.transactions}</strong></span>
              </div>
            </div>
            <p className="text-sm text-gray-300 mt-2">{rule.recommendation}</p>
          </div>
        ))}
      </div>

      {data && (
        <div className="text-xs text-gray-500">{data.note}</div>
      )}
    </div>
  )
}
