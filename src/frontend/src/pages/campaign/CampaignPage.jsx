import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getCampaignPlan } from '../../api/aiApi'

const REC_CONFIG = {
  RUN_CAMPAIGN: { color: 'text-green-400',  bg: 'bg-green-900/20',  border: 'border-green-500/30', icon: '🚀', label: 'Nên chạy' },
  PREPARE:      { color: 'text-blue-400',   bg: 'bg-blue-900/20',   border: 'border-blue-500/30',  icon: '📋', label: 'Chuẩn bị' },
  NORMAL:       { color: 'text-gray-400',   bg: 'bg-gray-800',      border: 'border-gray-600',     icon: '📅', label: 'Bình thường' },
  LOW_SEASON:   { color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-500/30',icon: '⬇️', label: 'Thấp điểm' },
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
        is_mock: true,
        note: 'Đang dùng dữ liệu mẫu',
        windows: [
          { period:'2026-06', period_type:'month', avg_revenue:38500000, vs_overall_pct:25.3, recommendation:'PREPARE', label:'Tháng 6 – Chuẩn bị trước 01/06', events:['Ngày Quốc tế Thiếu nhi'] },
          { period:'2026-07', period_type:'month', avg_revenue:18200000, vs_overall_pct:-35.2, recommendation:'LOW_SEASON', label:'Tháng 7 – Mùa thấp điểm', events:[] },
          { period:'2026-08', period_type:'month', avg_revenue:28000000, vs_overall_pct:-5.1, recommendation:'NORMAL', label:'Tháng 8 – Bình thường', events:[] },
          { period:'2026-09', period_type:'month', avg_revenue:32000000, vs_overall_pct:8.2, recommendation:'PREPARE', label:'Tháng 9 – Dịp 2/9', events:['Quốc khánh 2/9'] },
          { period:'2026-10', period_type:'month', avg_revenue:45000000, vs_overall_pct:35.5, recommendation:'RUN_CAMPAIGN', label:'Tháng 10 – Ngày Phụ nữ VN 20/10', events:['Ngày Phụ nữ VN 20/10'] },
          { period:'2026-11', period_type:'month', avg_revenue:68500000, vs_overall_pct:144.6, recommendation:'RUN_CAMPAIGN', label:'Tháng 11 – Mùa 11.11', events:['11.11 Sale'] },
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
            { day:'Chủ nhật', avg:28000000, rank:1 },
          ],
        },
        upcoming_events: [
          { name:'Ngày Quốc tế Thiếu nhi', date:'2026-06-01', days_until:15, boost_expected:1.6, prepare_by:'2026-05-25', tip:'Chuẩn bị chiến dịch trước 7 ngày. Dự kiến tăng 60%.' },
          { name:'Quốc khánh', date:'2026-09-02', days_until:108, boost_expected:1.3, prepare_by:'2026-08-26', tip:'Dự kiến tăng 30%.' },
          { name:'Ngày Phụ nữ VN', date:'2026-10-20', days_until:156, boost_expected:1.9, prepare_by:'2026-10-13', tip:'Dự kiến tăng 90%.' },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const maxDow = Math.max(...(data?.seasonal_insight?.weekly_pattern?.map(d => d.avg) ?? [1]))

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div>
        <h1 className="text-2xl font-bold text-white">Lịch Chiến dịch Thông minh</h1>
        <p className="text-sm text-gray-400 mt-1">Gợi ý thời điểm tốt nhất để chạy marketing dựa trên seasonal analysis</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Đang phân tích...</div>
      ) : (
        <>
          {/* Seasonal insight */}
          {data?.seasonal_insight && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">Tháng cao điểm nhất</div>
                <div className="text-xl font-bold text-green-400 mt-1">🏆 {data.seasonal_insight.best_month_name}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">Tháng thấp điểm nhất</div>
                <div className="text-xl font-bold text-yellow-400 mt-1">⬇️ {data.seasonal_insight.worst_month_name}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="text-xs text-gray-400">Ngày bán tốt nhất trong tuần</div>
                <div className="text-xl font-bold text-blue-400 mt-1">📅 {data.seasonal_insight.best_weekday}</div>
              </div>
            </div>
          )}

          {/* Weekly bar chart */}
          {data?.seasonal_insight?.weekly_pattern && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-4">Doanh thu trung bình theo ngày trong tuần</h3>
              <div className="flex items-end gap-2 h-28">
                {data.seasonal_insight.weekly_pattern.map(d => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs text-gray-400">{(d.avg/1e6).toFixed(1)}M</div>
                    <div className="w-full rounded-t transition-all"
                      style={{ height: `${Math.round(d.avg/maxDow*80)}px`, background: d.rank === 1 ? '#22C55E' : d.rank <= 2 ? '#3B82F6' : '#6B7280' }} />
                    <div className="text-xs text-gray-400 text-center">{d.day.replace('Thứ ', 'T')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly windows */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300">Kế hoạch 6 tháng tới</h3>
            {(data?.windows ?? []).map(w => {
              const cfg = REC_CONFIG[w.recommendation] ?? REC_CONFIG.NORMAL
              return (
                <div key={w.period} className={`rounded-xl p-4 border flex items-center gap-4 ${cfg.bg} ${cfg.border}`}>
                  <span className="text-xl">{cfg.icon}</span>
                  <div className="flex-1">
                    <div className={`font-semibold ${cfg.color}`}>{w.label}</div>
                    {w.events.length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">Sự kiện: {w.events.join(', ')}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold ${cfg.color}`}>
                      {w.vs_overall_pct > 0 ? '+' : ''}{w.vs_overall_pct}% vs trung bình
                    </div>
                    <div className="text-xs text-gray-400">{(w.avg_revenue/1e6).toFixed(1)}M VNĐ/tháng</div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full border ${cfg.color} ${cfg.border} ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Upcoming events */}
          {data?.upcoming_events?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">🔔 Sự kiện sắp tới ({data.upcoming_events.length})</h3>
              <div className="space-y-2">
                {data.upcoming_events.map(ev => (
                  <div key={ev.name} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center gap-4">
                    <div className="text-center min-w-16">
                      <div className="text-2xl font-bold text-blue-400">{ev.days_until}</div>
                      <div className="text-xs text-gray-400">ngày nữa</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-white">{ev.name} – {ev.date}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{ev.tip}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-400 font-bold">+{Math.round((ev.boost_expected-1)*100)}%</div>
                      <div className="text-xs text-gray-400">dự kiến</div>
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
