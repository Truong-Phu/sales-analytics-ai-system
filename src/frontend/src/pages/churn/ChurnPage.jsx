import { useState, useEffect } from 'react'
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
      <div className="flex-1 h-1.5 rounded-full bg-gray-700">
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
  const [isMock,  setIsMock]  = useState(false)
  const [filter,  setFilter]  = useState('ALL')   // ALL | HIGH | MEDIUM | LOW

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
          { customer_id:'1', full_name:'Nguyễn Thị Lan',  email:'lan@example.com', phone:'0901234567', recency_days:72, frequency:3, monetary:850000,  churn_prob:85.2, risk:'HIGH',   action:'Gửi voucher ưu đãi 15% để kéo lại đơn hàng ngay' },
          { customer_id:'2', full_name:'Trần Văn Minh',   email:'minh@example.com',phone:'0912345678', recency_days:65, frequency:5, monetary:1200000, churn_prob:76.8, risk:'HIGH',   action:'Gửi voucher ưu đãi 15% để kéo lại đơn hàng ngay' },
          { customer_id:'3', full_name:'Lê Thị Hoa',      email:'hoa@example.com', phone:'0923456789', recency_days:45, frequency:8, monetary:2100000, churn_prob:48.3, risk:'MEDIUM', action:'Gửi email nhắc nhở + sản phẩm gợi ý cá nhân hoá' },
          { customer_id:'4', full_name:'Phạm Quang Vinh', email:'vinh@example.com',phone:'0934567890', recency_days:20, frequency:12,monetary:3500000, churn_prob:12.1, risk:'LOW',    action:'Duy trì chăm sóc định kỳ, ưu tiên upsell' },
          { customer_id:'5', full_name:'Hoàng Thị Mai',   email:'mai@example.com', phone:'0945678901', recency_days:80, frequency:2, monetary:420000,  churn_prob:91.4, risk:'HIGH',   action:'Gửi voucher ưu đãi 15% để kéo lại đơn hàng ngay' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = (data?.customers ?? []).filter(c => filter === 'ALL' || c.risk === filter)

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dự báo Churn Khách hàng</h1>
          <p className="text-sm text-gray-400 mt-1">RandomForest + RFM – Phát hiện khách hàng có nguy cơ rời bỏ</p>
        </div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Làm mới
        </button>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tổng khách hàng', value: data.total_customers, color: 'text-blue-400' },
            { label: 'Nguy cơ cao', value: data.high_risk_count, color: 'text-red-400' },
            { label: 'Nguy cơ trung bình', value: data.medium_risk_count, color: 'text-yellow-400' },
            { label: 'Tỷ lệ churn', value: `${data.churn_rate_pct}%`, color: 'text-red-400' },
          ].map(k => (
            <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-xs text-gray-400">{k.label}</div>
              <div className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Model info */}
      {data && (
        <div className="text-xs text-gray-500">
          Model: {data.model} · Threshold: không mua trong {data.churn_threshold_days} ngày = churned
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['ALL','HIGH','MEDIUM','LOW'].map(f => (
          <button key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
              ${filter === f
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-600 text-gray-400 hover:border-blue-500'}`}>
            {f === 'ALL' ? 'Tất cả' : f === 'HIGH' ? 'Cao' : f === 'MEDIUM' ? 'Trung bình' : 'Thấp'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Đang phân tích...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase">
                <th className="text-left p-3">Khách hàng</th>
                <th className="text-center p-3">Recency</th>
                <th className="text-center p-3">Frequency</th>
                <th className="text-right p-3">Monetary</th>
                <th className="text-center p-3">Xác suất churn</th>
                <th className="text-center p-3">Rủi ro</th>
                <th className="text-left p-3">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.customer_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="p-3">
                    <div className="font-medium text-white">{c.full_name}</div>
                    <div className="text-xs text-gray-400">{c.email}</div>
                  </td>
                  <td className="p-3 text-center text-gray-300">{c.recency_days} ngày</td>
                  <td className="p-3 text-center text-gray-300">{c.frequency} đơn</td>
                  <td className="p-3 text-right text-gray-300">{(c.monetary/1000000).toFixed(1)}M</td>
                  <td className="p-3 w-36"><ProbBar pct={c.churn_prob} /></td>
                  <td className="p-3 text-center"><RiskBadge risk={c.risk} /></td>
                  <td className="p-3 text-xs text-gray-400 max-w-xs">{c.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
