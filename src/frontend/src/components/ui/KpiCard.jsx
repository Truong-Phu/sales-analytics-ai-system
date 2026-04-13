/**
 * KPI Card – hiển thị một metric với icon, giá trị và trend.
 *
 * Props:
 *   label     – tên metric (string)
 *   value     – giá trị hiển thị (string/number)
 *   trend     – phần trăm thay đổi (number, dương = tăng, âm = giảm)
 *   icon      – Material Symbol name (string)
 *   iconColor – tailwind text-color class (default 'text-primary')
 *   sub       – dòng phụ (optional)
 */
export default function KpiCard({ label, value, trend, icon, iconColor = 'text-primary', sub }) {
  const isUp = trend > 0
  const trendColor = trend === 0 ? 'text-outline' : isUp ? 'text-tertiary' : 'text-error'
  const trendIcon  = trend === 0 ? 'remove' : isUp ? 'trending_up' : 'trending_down'

  return (
    <div className="kpi-card">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="section-title mb-1">{label}</p>
          <p className="text-2xl font-headline font-extrabold text-on-surface leading-none">
            {value}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg bg-surface-container-high
                         flex items-center justify-center ${iconColor}/20`}>
          <span className={`icon icon-fill ${iconColor}`}>{icon}</span>
        </div>
      </div>

      {/* Trend + sub */}
      <div className="flex items-center justify-between mt-auto">
        {trend !== undefined ? (
          <div className={`flex items-center gap-1 ${trendColor}`}>
            <span className="icon icon-sm">{trendIcon}</span>
            <span className="text-xs font-bold">
              {trend > 0 ? '+' : ''}{trend?.toFixed(1)}%
            </span>
            <span className="text-xs text-outline ml-1">vs kỳ trước</span>
          </div>
        ) : <div />}
        {sub && <span className="text-xs text-outline">{sub}</span>}
      </div>
    </div>
  )
}
