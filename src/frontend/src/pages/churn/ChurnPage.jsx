import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getChurnPrediction } from '../../api/aiApi'

const RISK_COLOR = {
  HIGH:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  text: '#EF4444', dot: '#EF4444'  },
  MEDIUM: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', text: '#F59E0B', dot: '#F59E0B'  },
  LOW:    { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  text: '#22C55E', dot: '#22C55E'  },
}

function RiskBadge({ risk }) {
  const c = RISK_COLOR[risk] ?? RISK_COLOR.LOW
  const labels = { HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp' }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {labels[risk] ?? risk}
    </span>
  )
}

function ProbBar({ pct }) {
  const color = pct >= 70 ? '#EF4444' : pct >= 40 ? '#F59E0B' : '#22C55E'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}

export default function ChurnPage() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)
  const [isMock,  setIsMock]  = useState(false)
  const [filter,  setFilter]  = useState('ALL')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getChurnPrediction({ top_n: 100 })
      setData(res)
      setIsMock(false)
    } catch {
      setData({
        total_customers: 182, high_risk_count: 23, medium_risk_count: 47, low_risk_count: 112,
        churn_rate_pct: 12.6, churn_threshold_days: 60, model: 'RandomForestClassifier',
        note: 'Phân tích 182 khách hàng.',
        customers: [
          { customer_id:'1', full_name:'Nguyễn Thị Lan',  email:'lan@example.com', phone:'0901234567', recency_days:72, frequency:3,  monetary:850000,  churn_prob:85.2, risk:'HIGH',   action:'Gửi voucher ưu đãi 15% để kéo lại đơn hàng ngay' },
          { customer_id:'2', full_name:'Trần Văn Minh',   email:'minh@example.com',phone:'0912345678', recency_days:65, frequency:5,  monetary:1200000, churn_prob:76.8, risk:'HIGH',   action:'Gửi voucher ưu đãi 15% để kéo lại đơn hàng ngay' },
          { customer_id:'3', full_name:'Lê Thị Hoa',      email:'hoa@example.com', phone:'0923456789', recency_days:45, frequency:8,  monetary:2100000, churn_prob:48.3, risk:'MEDIUM', action:'Gửi email nhắc nhở + sản phẩm gợi ý cá nhân hoá' },
          { customer_id:'4', full_name:'Phạm Quang Vinh', email:'vinh@example.com',phone:'0934567890', recency_days:20, frequency:12, monetary:3500000, churn_prob:12.1, risk:'LOW',    action:'Duy trì chăm sóc định kỳ, ưu tiên upsell' },
          { customer_id:'5', full_name:'Hoàng Thị Mai',   email:'mai@example.com', phone:'0945678901', recency_days:80, frequency:2,  monetary:420000,  churn_prob:91.4, risk:'HIGH',   action:'Gửi voucher ưu đãi 15% để kéo lại đơn hàng ngay' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const filtered = (data?.customers ?? []).filter(c => filter === 'ALL' || c.risk === filter)

  return (
    <div className="space-y-5">
      {isMock && <MockToast />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Dự báo Churn Khách hàng</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>RandomForest + RFM – Phát hiện khách hàng có nguy cơ rời bỏ</p>
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">Làm mới</button>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tổng khách hàng', value: data.total_customers,    color: 'var(--primary-500)' },
            { label: 'Nguy cơ cao',     value: data.high_risk_count,    color: '#EF4444' },
            { label: 'Nguy cơ TB',      value: data.medium_risk_count,  color: '#F59E0B' },
            { label: 'Tỷ lệ churn',     value: `${data.churn_rate_pct}%`, color: '#EF4444' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Model info */}
      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Model: {data.model} · Threshold: không mua trong {data.churn_threshold_days} ngày = churned
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL','HIGH','MEDIUM','LOW'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={filter === f
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}>
            {f === 'ALL' ? 'Tất cả' : f === 'HIGH' ? 'Cao' : f === 'MEDIUM' ? 'Trung bình' : 'Thấp'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="lcard overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Khách hàng','Recency','Frequency','Monetary','Xác suất churn','Rủi ro','Hành động'].map(h => (
                  <th key={h} className="text-left p-3 text-xs font-semibold tracking-wide"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.customer_id} style={{ borderBottom: '1px solid var(--border)' }}
                  className="transition-colors"
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="p-3">
                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.full_name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.email}</div>
                  </td>
                  <td className="p-3 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{c.recency_days} ngày</td>
                  <td className="p-3 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{c.frequency} đơn</td>
                  <td className="p-3 text-right text-sm" style={{ color: 'var(--text-secondary)' }}>{(c.monetary/1000000).toFixed(1)}M</td>
                  <td className="p-3 w-36"><ProbBar pct={c.churn_prob} /></td>
                  <td className="p-3 text-center"><RiskBadge risk={c.risk} /></td>
                  <td className="p-3 text-xs max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{c.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
