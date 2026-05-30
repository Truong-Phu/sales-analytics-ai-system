import { useState, useEffect, useRef } from 'react'
import MockToast from '../../components/ui/MockToast'
import MockDataButton from '../../components/ui/MockDataButton'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getBasketAnalysis } from '../../api/aiApi'

const MOCK_BASKET = {
  total_transactions: 0, total_rules: 3, is_mock: true,
  note: 'Đang dùng dữ liệu mẫu',
  parameters: { days: 180, min_support: 0.02, min_confidence: 0.3, min_lift: 1.0 },
  rules: [
    { antecedents:['Áo thun nam'],  consequents:['Quần short nam'],     support:0.25, confidence:0.72, lift:2.4, conviction:3.1, transactions:45, recommendation:'72% khách mua Áo thun nam cũng mua Quần short nam → tạo bundle giảm 5%' },
    { antecedents:['Váy hoa nữ'],   consequents:['Băng đô thời trang'], support:0.18, confidence:0.65, lift:3.2, conviction:2.5, transactions:33, recommendation:'65% khách mua Váy hoa nữ cũng mua Băng đô → đề xuất cross-sell' },
    { antecedents:['Giày sneaker'], consequents:['Tất cotton'],          support:0.31, confidence:0.81, lift:2.1, conviction:4.2, transactions:58, recommendation:'81% khách mua Giày sneaker cũng mua Tất cotton → hiển thị gợi ý ngay trang sản phẩm' },
  ],
}

export default function BasketPage() {
  const [data,    setData]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [isMock,      setIsMock]      = useState(false)
  const [showMockBtn, setShowMockBtn] = useState(false)
  const [minConf,     setMinConf]     = useState(0.3)
  const [minLift,     setMinLift]     = useState(1.0)
  const fetchedRef = useRef(false)

  const load = async () => {
    setLoading(true)
    setShowMockBtn(false)
    try {
      const res = await getBasketAnalysis({ min_confidence: minConf, min_lift: minLift, top_n: 30 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
      setShowMockBtn(true)
    } finally { setLoading(false) }
  }

  const loadMock = () => { setData(MOCK_BASKET); setIsMock(true); setShowMockBtn(false) }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const liftColor = (lift) => lift >= 3 ? '#EF4444' : lift >= 2 ? '#F59E0B' : '#22C55E'

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <MockDataButton show={showMockBtn} onClick={loadMock} />
      {!data && !loading && <AiEmptyState title="Chưa đủ dữ liệu phân tích sản phẩm hay mua chung" />}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Phân tích sản phẩm hay mua chung</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Market Basket Analysis – Thuật toán Apriori</p>
      </div>

      {/* Params */}
      <div className="lcard p-4 flex gap-6 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Min Confidence: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(minConf*100)}%</strong>
          </label>
          <input type="range" min={0.1} max={0.9} step={0.05} value={minConf}
            onChange={e => setMinConf(+e.target.value)} className="w-32 accent-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            Min Lift: <strong style={{ color: 'var(--text-primary)' }}>{minLift}x</strong>
          </label>
          <input type="range" min={1} max={5} step={0.5} value={minLift}
            onChange={e => setMinLift(+e.target.value)} className="w-32 accent-indigo-500" />
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">Phân tích</button>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Tổng đơn hàng', value: data.total_transactions || '(mẫu)', color: 'var(--primary-500)' },
            { label: 'Rules tìm được', value: data.total_rules, color: '#22C55E' },
            { label: 'Nguồn dữ liệu', value: data.is_mock ? 'Mẫu' : 'Thực', color: data.is_mock ? '#F59E0B' : '#22C55E' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rules */}
      <div className="space-y-3">
        {loading ? (
          <div className="lcard p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : (data?.rules ?? []).map((rule, i) => (
          <div key={i} className="lcard p-4 transition-colors lcard-hover">
            <div className="flex items-center gap-2 flex-wrap">
              {rule.antecedents.map(p => (
                <span key={p} className="px-2 py-1 rounded text-sm font-medium"
                  style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--primary-600)' }}>{p}</span>
              ))}
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              {rule.consequents.map(p => (
                <span key={p} className="px-2 py-1 rounded text-sm font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>{p}</span>
              ))}
              <div className="ml-auto flex gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>Support: <strong style={{ color: 'var(--text-primary)' }}>{(rule.support*100).toFixed(1)}%</strong></span>
                <span>Confidence: <strong style={{ color: 'var(--text-primary)' }}>{(rule.confidence*100).toFixed(1)}%</strong></span>
                <span>Lift: <strong style={{ color: liftColor(rule.lift) }}>{rule.lift}x</strong></span>
                <span>Đơn: <strong style={{ color: 'var(--text-primary)' }}>{rule.transactions}</strong></span>
              </div>
            </div>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{rule.recommendation}</p>
          </div>
        ))}
      </div>

      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{data.note}</div>
      )}
    </div>
  )
}
