import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getCampaignPlan } from '../../api/aiApi'

const REC_CONFIG = {
  RUN_CAMPAIGN: { textColor: '#22C55E', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   icon: '🚀', label: 'Nên chạy'   },
  PREPARE:      { textColor: 'var(--primary-500)', bg: 'var(--primary-50)', border: 'rgba(99,102,241,0.25)', icon: '📋', label: 'Chuẩn bị' },
  NORMAL:       { textColor: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', border: 'var(--border)',       icon: '📅', label: 'Bình thường'},
  LOW_SEASON:   { textColor: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: '⬇️', label: 'Thấp điểm' },
}

export default function CampaignPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getCampaignPlan({ days_ahead: 60 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        is_mock: true, note: 'Đang dùng dữ liệu mẫu',
        windows: [
          { period:'2026-06', period_type:'month', avg_revenue:38500000, vs_overall_pct:25.3,  recommendation:'PREPARE',      label:'Tháng 6 – Chuẩn bị trước 01/06',         events:['Ngày Quốc tế Thiếu nhi'] },
          { period:'2026-07', period_type:'month', avg_revenue:18200000, vs_overall_pct:-35.2, recommendation:'LOW_SEASON',   label:'Tháng 7 – Mùa thấp điểm',                events:[] },
          { period:'2026-08', period_type:'month', avg_revenue:28000000, vs_overall_pct:-5.1,  recommendation:'NORMAL',       label:'Tháng 8 – Bình thường',                   events:[] },
          { period:'2026-09', period_type:'month', avg_revenue:32000000, vs_overall_pct:8.2,   recommendation:'PREPARE',      label:'Tháng 9 – Dịp 2/9',                       events:['Quốc khánh 2/9'] },
          { period:'2026-10', period_type:'month', avg_revenue:45000000, vs_overall_pct:35.5,  recommendation:'RUN_CAMPAIGN', label:'Tháng 10 – Ngày Phụ nữ VN 20/10',         events:['Ngày Phụ nữ VN 20/10'] },
          { period:'2026-11', period_type:'month', avg_revenue:68500000, vs_overall_pct:144.6, recommendation:'RUN_CAMPAIGN', label:'Tháng 11 – Mùa 11.11',                    events:['11.11 Sale'] },
        ],
        seasonal_insight: {
          best_month: 11, best_month_name: 'Tháng 11 (11.11)',
          worst_month: 7, worst_month_name: 'Tháng 7',
          best_weekday: 'Thứ 7',
          weekly_pattern: [
            { day:'Thứ 2', avg:22000000, rank:5 },
            { day:'Thứ 3', avg:20500000, rank:6 },
            { day:'Thứ 4', avg:21800000, rank:4 },
            { day:'Thứ 5', avg:23000000, rank:3 },
            { day:'Thứ 6', avg:25500000, rank:2 },
            { day:'Thứ 7', avg:32000000, rank:1 },
            { day:'CN',    avg:28000000, rank:1 },
          ],
        },
        upcoming_events: [
          { name:'Ngày Quốc tế Thiếu nhi', date:'2026-06-01', days_until:15,  boost_expected:1.6, prepare_by:'2026-05-25', tip:'Chuẩn bị chiến dịch trước 7 ngày. Dự kiến tăng 60%.' },
          { name:'Quốc khánh',              date:'2026-09-02', days_until:108, boost_expected:1.3, prepare_by:'2026-08-26', tip:'Dự kiến tăng 30%.' },
          { name:'Ngày Phụ nữ VN',          date:'2026-10-20', days_until:156, boost_expected:1.9, prepare_by:'2026-10-13', tip:'Dự kiến tăng 90%.' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const maxDow = Math.max(...(data?.seasonal_insight?.weekly_pattern?.map(d => d.avg) ?? [1]))

  return (
    <div className="space-y-5">
      {isMock && <MockToast />}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Lịch Chiến dịch Thông minh</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Gợi ý thời điểm tốt nhất để chạy marketing dựa trên seasonal analysis</p>
      </div>

      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <>
          {/* Seasonal insight KPIs */}
          {data?.seasonal_insight && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Tháng cao điểm nhất',           value: `🏆 ${data.seasonal_insight.best_month_name}`,  color: '#22C55E' },
                { label: 'Tháng thấp điểm nhất',          value: `⬇️ ${data.seasonal_insight.worst_month_name}`, color: '#F59E0B' },
                { label: 'Ngày bán tốt nhất trong tuần',  value: `📅 ${data.seasonal_insight.best_weekday}`,    color: 'var(--primary-500)' },
              ].map(k => (
                <div key={k.label} className="lcard p-4">
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
                  <div className="text-lg font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Weekly bar chart */}
          {data?.seasonal_insight?.weekly_pattern && (
            <div className="lcard p-4">
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Doanh thu trung bình theo ngày trong tuần</h3>
              <div className="flex items-end gap-2 h-28">
                {data.seasonal_insight.weekly_pattern.map(d => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{(d.avg/1e6).toFixed(1)}M</div>
                    <div className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.round(d.avg/maxDow*80)}px`,
                        background: d.rank === 1 ? '#22C55E' : d.rank <= 2 ? 'var(--primary-500)' : 'var(--text-tertiary)',
                      }} />
                    <div className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>{d.day.replace('Thứ ', 'T')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly windows */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Kế hoạch 6 tháng tới</h3>
            {(data?.windows ?? []).map(w => {
              const cfg = REC_CONFIG[w.recommendation] ?? REC_CONFIG.NORMAL
              return (
                <div key={w.period} className="rounded-xl p-4 flex items-center gap-4"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <span className="text-xl shrink-0">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold" style={{ color: cfg.textColor }}>{w.label}</div>
                    {w.events.length > 0 && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        Sự kiện: {w.events.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: cfg.textColor }}>
                      {w.vs_overall_pct > 0 ? '+' : ''}{w.vs_overall_pct}% vs trung bình
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{(w.avg_revenue/1e6).toFixed(1)}M VNĐ/tháng</div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full shrink-0"
                    style={{ color: cfg.textColor, border: `1px solid ${cfg.border}`, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Upcoming events */}
          {data?.upcoming_events?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
                🔔 Sự kiện sắp tới ({data.upcoming_events.length})
              </h3>
              <div className="space-y-2">
                {data.upcoming_events.map(ev => (
                  <div key={ev.name} className="lcard p-4 flex items-center gap-4">
                    <div className="text-center shrink-0" style={{ minWidth: 56 }}>
                      <div className="text-2xl font-bold" style={{ color: 'var(--primary-500)' }}>{ev.days_until}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>ngày nữa</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{ev.name} – {ev.date}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{ev.tip}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold" style={{ color: '#22C55E' }}>+{Math.round((ev.boost_expected-1)*100)}%</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>dự kiến</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
