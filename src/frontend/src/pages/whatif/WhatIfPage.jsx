import { useState } from 'react'
import { simulateWhatIf } from '../../api/aiApi'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const SCENARIOS = [
  { value: 'price_change',    label: 'Thay đổi giá bán',     icon: '💰', desc: 'Xem tác động khi tăng/giảm giá sản phẩm' },
  { value: 'discount',        label: 'Chạy khuyến mãi',       icon: '🏷️', desc: 'Mô phỏng chương trình giảm giá' },
  { value: 'new_channel',     label: 'Mở kênh bán mới',       icon: '🚀', desc: 'Ước tính doanh thu kênh bán hàng mới' },
  { value: 'boost_marketing', label: 'Tăng ngân sách ads',    icon: '📢', desc: 'Tác động khi tăng chi phí quảng cáo' },
]

const fmt = (v) => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${v.toLocaleString()}`

export default function WhatIfPage() {
  const [scenario,  setScenario]  = useState('price_change')
  const [changePct, setChangePct] = useState(10)
  const [horizon,   setHorizon]   = useState(30)
  const [result,    setResult]    = useState(null)
  const [loading,   setLoading]   = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const res = await simulateWhatIf({ scenario, change_pct: changePct, horizon_days: horizon })
      setResult(res)
    } catch {
      const baseline = Array.from({length: horizon}, (_, i) => ({
        date: new Date(Date.now() + (i+1)*86400000).toISOString().split('T')[0],
        baseline: 5_000_000 + Math.random()*2_000_000,
        simulated: 0, delta: 0, delta_pct: 0,
      }))
      const mult = scenario === 'price_change'
        ? 1 + (changePct/100) * (1 + -1.5 * (changePct/100))
        : scenario === 'discount' ? (1 + changePct/100) * (1 - -1.5 * (changePct/100))
        : scenario === 'new_channel' ? 1 + Math.abs(changePct/100)
        : 1 + Math.abs(changePct/100) * 0.3
      baseline.forEach(p => {
        p.simulated = Math.round(p.baseline * mult)
        p.delta     = p.simulated - p.baseline
        p.delta_pct = (p.delta / p.baseline * 100).toFixed(2)
      })
      const btotal = baseline.reduce((s,p) => s + p.baseline, 0)
      const stotal = baseline.reduce((s,p) => s + p.simulated, 0)
      setResult({
        scenario, change_pct: changePct, horizon_days: horizon,
        baseline_total: btotal, simulated_total: stotal,
        delta_total: stotal - btotal,
        delta_total_pct: ((stotal-btotal)/btotal*100).toFixed(1),
        chart_data: baseline,
        recommendation: `Ước tính doanh thu ${stotal > btotal ? 'tăng' : 'giảm'} ${Math.abs(((stotal-btotal)/btotal*100)).toFixed(1)}% với kịch bản này.`,
        assumptions: ['Price elasticity = -1.5 (mặc định)', 'Dữ liệu mẫu demo'],
        is_mock: true,
      })
    } finally { setLoading(false) }
  }

  const delta      = result ? result.delta_total_pct : 0
  const isPositive = delta > 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>What-If Simulator</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Mô phỏng kịch bản kinh doanh và dự báo tác động doanh thu</p>
      </div>

      {/* Scenario selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SCENARIOS.map(s => (
          <button key={s.value} onClick={() => setScenario(s.value)}
            className="p-4 rounded-xl border text-left transition-all"
            style={scenario === s.value
              ? { borderColor: 'var(--primary-500)', background: 'var(--primary-50)', color: 'var(--primary-700)' }
              : { borderColor: 'var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="font-medium text-sm">{s.label}</div>
            <div className="text-xs mt-1 opacity-70">{s.desc}</div>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="lcard p-5 flex flex-wrap gap-6 items-end">
        <div>
          <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
            {changePct >= 0 ? '📈' : '📉'} Thay đổi:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{changePct > 0 ? '+' : ''}{changePct}%</strong>
          </label>
          <input type="range" min={-50} max={100} step={5} value={changePct}
            onChange={e => setChangePct(+e.target.value)} className="w-48 accent-indigo-500" />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            <span>-50%</span><span>0</span><span>+100%</span>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
            Kỳ mô phỏng: <strong style={{ color: 'var(--text-primary)' }}>{horizon} ngày</strong>
          </label>
          <select value={horizon} onChange={e => setHorizon(+e.target.value)} className="linput text-sm">
            {[7,14,30,60,90].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
        </div>
        <button onClick={run} disabled={loading} className="lbtn lbtn-primary">
          {loading ? 'Đang mô phỏng...' : '▶ Chạy mô phỏng'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Baseline (không thay đổi)', value: fmt(result.baseline_total), color: 'var(--text-secondary)' },
              { label: 'Mô phỏng (sau thay đổi)',   value: fmt(result.simulated_total), color: isPositive ? '#22C55E' : '#EF4444' },
              { label: 'Chênh lệch',                value: `${isPositive?'+':''}${delta}%`, color: isPositive ? '#22C55E' : '#EF4444' },
            ].map(k => (
              <div key={k.label} className="lcard p-4">
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
                <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value} VNĐ</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="lcard p-4">
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Biểu đồ so sánh Baseline vs. Mô phỏng</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={result.chart_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill:'var(--text-tertiary)', fontSize:11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:11 }} tickFormatter={v => `${(v/1e6).toFixed(1)}M`} />
                <Tooltip
                  formatter={v => `${(v/1e6).toFixed(2)}M VNĐ`}
                  contentStyle={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:8 }}
                  labelStyle={{ color:'var(--text-secondary)' }}
                  itemStyle={{ color:'var(--text-primary)' }}
                />
                <Legend wrapperStyle={{ color:'var(--text-tertiary)', fontSize:12 }} />
                <Line type="monotone" dataKey="baseline"  name="Baseline" stroke="var(--text-tertiary)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="simulated" name="Mô phỏng" stroke={isPositive ? '#22C55E' : '#EF4444'} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recommendation */}
          <div className="lcard p-4">
            <div className="text-sm font-medium mb-1" style={{ color: 'var(--primary-500)' }}>💡 Nhận xét AI</div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{result.recommendation}</p>
            {result.assumptions?.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Giả định mô hình:</div>
                <ul className="text-xs list-disc list-inside space-y-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
