import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getNarrative } from '../../api/aiApi'

export default function NarrativePage() {
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const [days,   setDays]   = useState(30)
  const [lang,   setLang]   = useState('vi')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getNarrative({ days, language: lang })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days, lang])

  const renderBold = (text) => text.split('**').map((part, i) =>
    i % 2 === 0 ? part : <strong key={i} style={{ color: 'var(--text-primary)' }}>{part}</strong>
  )

  const revChg   = data?.key_metrics?.revenue_change ?? 0
  const revColor = revChg >= 0 ? '#22C55E' : '#EF4444'

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      {!data && !loading && <AiEmptyState title="Chưa đủ dữ liệu sinh nhận xét tự động" />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Nhận xét Thông minh</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Tự động sinh nhận xét doanh thu bằng ngôn ngữ tự nhiên</p>
        </div>
        <div className="flex gap-2">
          <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 110 }}>
            {[7,14,30,90].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
          <button onClick={() => setLang(l => l === 'vi' ? 'en' : 'vi')} className="lbtn lbtn-secondary text-sm">
            {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
          </button>
          <button onClick={load} className="lbtn lbtn-primary text-sm">Làm mới</button>
        </div>
      </div>

      {loading ? (
        <div className="lcard p-12 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : data && (
        <>
          {/* Headline */}
          <div className="rounded-xl p-5"
            style={{ background: 'linear-gradient(135deg, var(--primary-500) 0%, var(--accent-500) 100%)' }}>
            <div className="flex items-start gap-3">
              <span className="text-3xl">{revChg >= 10 ? '🚀' : revChg >= 0 ? '📈' : '📉'}</span>
              <div>
                <div className="text-lg font-bold text-white leading-snug">{data.headline}</div>
                <div className="text-xs text-white/80 mt-1">
                  Kỳ: {data.period} · Sinh bởi: {data.generated_by === 'rule_based' ? 'Rule-based AI' : 'AI Model'}
                </div>
              </div>
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Doanh thu kỳ này', value: `${((data.key_metrics?.current_revenue??0)/1e6).toFixed(1)}M VNĐ`, color: 'var(--primary-500)' },
              { label: 'Tăng trưởng',      value: `${revChg>=0?'+':''}${revChg}%`,  color: revColor },
              { label: 'Đơn hàng',         value: (data.key_metrics?.current_orders??0).toLocaleString(), color: '#22C55E' },
              { label: 'ĐH tăng/giảm',    value: `${(data.key_metrics?.orders_change??0)>=0?'+':''}${data.key_metrics?.orders_change??0}%`, color: (data.key_metrics?.orders_change??0)>=0 ? '#22C55E' : '#EF4444' },
            ].map(k => (
              <div key={k.label} className="lcard p-4">
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
                <div className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Full narrative */}
          <div className="lcard p-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>📄 Nhận xét chi tiết</h3>
            <p className="leading-relaxed text-sm" style={{ color: 'var(--text-secondary)' }}>{renderBold(data.full_narrative)}</p>
          </div>

          {/* Anomaly note */}
          {data.anomaly_note && (
            <div className="rounded-xl p-4 text-sm"
              style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#92400E' }}>
              ⚠️ {data.anomaly_note}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations?.length > 0 && (
            <div className="lcard p-5">
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>💡 Gợi ý hành động</h3>
              <ul className="space-y-2">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-bold mt-0.5" style={{ color: 'var(--primary-500)' }}>{i+1}.</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Export hint */}
          <div className="lcard p-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            💡 Nhận xét này tự động được chèn vào báo cáo PDF khi xuất tại trang <strong style={{ color: 'var(--text-secondary)' }}>Báo cáo</strong>.
          </div>
        </>
      )}
    </div>
  )
}
