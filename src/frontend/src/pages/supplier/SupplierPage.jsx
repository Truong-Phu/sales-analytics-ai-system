import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getSupplierPerformance } from '../../api/aiApi'

function StatusBadge({ status }) {
  const map = {
    GOOD:     { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  color: '#22C55E', label: 'Tốt'       },
    WARNING:  { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: '#F59E0B', label: 'Cảnh báo'  },
    CRITICAL: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#EF4444', label: 'Nguy hiểm' },
  }
  const s = map[status] ?? map.WARNING
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
    </span>
  )
}

function QualityStars({ score }) {
  const full = Math.floor(score)
  const half = score - full >= 0.5
  return (
    <span className="text-sm" style={{ color: '#F59E0B' }}>
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
      <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>{score.toFixed(1)}</span>
    </span>
  )
}

function OnTimeBar({ rate }) {
  const color = rate >= 0.85 ? '#22C55E' : rate >= 0.70 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-bold" style={{ color }}>{(rate * 100).toFixed(1)}%</span>
      <div className="w-20 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${rate * 100}%`, background: color }} />
      </div>
    </div>
  )
}

export default function SupplierPage() {
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const [days,   setDays]   = useState(90)
  const [filter, setFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('on_time_rate')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getSupplierPerformance({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const suppliers = data?.suppliers ?? []
  const filtered  = filter === 'ALL' ? suppliers : suppliers.filter(s => s.status === filter)
  const sorted    = [...filtered].sort((a, b) => {
    if (sortBy === 'on_time_rate') return b.on_time_rate - a.on_time_rate
    if (sortBy === 'avg_lead_days') return a.avg_lead_days - b.avg_lead_days
    if (sortBy === 'total_value') return b.total_value - a.total_value
    return 0
  })

  const counts    = { GOOD: 0, WARNING: 0, CRITICAL: 0 }
  suppliers.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1 })
  const avgOnTime = suppliers.length ? suppliers.reduce((s, r) => s + r.on_time_rate, 0) / suppliers.length : 0
  const worst     = suppliers.reduce((w, s) => (!w || s.on_time_rate < w.on_time_rate) ? s : w, null)

  const fmt = v => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v.toLocaleString()

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      {!data && !loading && <AiEmptyState title="Chưa đủ dữ liệu phân tích hiệu suất nhà cung cấp" />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Hiệu suất Nhà cung cấp</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Tỷ lệ giao đúng hạn, thời gian lead time và chất lượng</p>
        </div>
        <div className="flex gap-2">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="linput text-sm">
            <option value="on_time_rate">Sắp xếp: Đúng hạn</option>
            <option value="avg_lead_days">Sắp xếp: Lead time</option>
            <option value="total_value">Sắp xếp: Giá trị</option>
          </select>
          <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 110 }}>
            {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
          <button onClick={load} className="lbtn lbtn-primary text-sm">Làm mới</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Tổng NCC',    value: suppliers.length, color: 'var(--primary-500)' },
          { label: 'TB Đúng hạn', value: `${(avgOnTime * 100).toFixed(1)}%`, color: avgOnTime >= 0.85 ? '#22C55E' : '#F59E0B' },
          { label: 'NCC Tốt',     value: counts.GOOD,      color: '#22C55E' },
          { label: 'Cần chú ý',   value: counts.WARNING + counts.CRITICAL, color: counts.WARNING + counts.CRITICAL > 0 ? '#EF4444' : 'var(--text-tertiary)' },
        ].map(k => (
          <div key={k.label} className="lcard p-4">
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['ALL', 'GOOD', 'WARNING', 'CRITICAL'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
            style={filter === f
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {f === 'ALL' ? 'Tất cả' : f === 'GOOD' ? 'Tốt' : f === 'WARNING' ? 'Cảnh báo' : 'Nguy hiểm'}
            {f !== 'ALL' && <span className="ml-1 text-xs opacity-70">({counts[f] ?? 0})</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <div className="lcard overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {['Nhà cung cấp','Trạng thái','Đúng hạn','Lead time','Tổng giao','Chất lượng','Giá trị'].map(h => (
                    <th key={h} className="text-left p-4 text-xs font-semibold"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.supplier_name} style={{ borderBottom: '1px solid var(--border)' }}
                    className="transition-colors"
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="p-4">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.supplier_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {s.late_deliveries} lần trễ / {s.total_deliveries} lần giao
                      </div>
                    </td>
                    <td className="p-4 text-center"><StatusBadge status={s.status} /></td>
                    <td className="p-4"><OnTimeBar rate={s.on_time_rate} /></td>
                    <td className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>{s.avg_lead_days.toFixed(1)} ngày</td>
                    <td className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>{s.total_quantity.toLocaleString()}</td>
                    <td className="p-4 text-center"><QualityStars score={s.quality_score} /></td>
                    <td className="p-4 text-right font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(s.total_value)} VNĐ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>Không có dữ liệu</div>
          )}
        </div>
      )}

      {/* Worst supplier alert */}
      {worst && worst.status === 'CRITICAL' && (
        <div className="rounded-xl p-4 text-sm"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#991B1B' }}>
          ⚠️ <strong>{worst.supplier_name}</strong> có tỷ lệ đúng hạn thấp ({(worst.on_time_rate * 100).toFixed(0)}%) —
          cân nhắc đánh giá lại hợp đồng hoặc tìm nhà cung cấp thay thế.
        </div>
      )}
    </div>
  )
}
