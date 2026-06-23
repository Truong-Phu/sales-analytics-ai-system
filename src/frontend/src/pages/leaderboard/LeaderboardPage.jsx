import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getLeaderboard } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

const TREND_ICON  = { UP: '↑', DOWN: '↓', STABLE: '→' }
const TREND_COLOR = { UP: '#22C55E', DOWN: '#EF4444', STABLE: 'var(--text-tertiary)' }

const dateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const addDays = (date, days) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const fmtProgressPct = value => {
  if (value == null) return ''
  return `${Math.min(100, Number(value)).toLocaleString('vi-VN')}%`
}

function normalizeChannel(name) {
  if (!name) return ''
  const lower = name.toLowerCase()
  if (lower.includes('shopee')) return 'Shopee'
  if (lower.includes('tiktok')) return 'TikTok Shop'
  if (lower.includes('lazada')) return 'Lazada'
  if (lower.includes('facebook')) return 'Facebook'
  if (lower.includes('website')) return 'Website'
  if (lower.includes('offline') || lower.includes('quầy')) return 'Offline'
  return name
}

function buildApiParams(mode, customStart, customEnd, category) {
  const today    = new Date()
  const tomorrow = dateKey(addDays(today, 1))
  const base     = { category, top_n: 10 }
  switch (mode) {
    case 'all':
      return { ...base, start_date: '2020-01-01', end_date: tomorrow }
    case 'this_month': {
      const start = dateKey(new Date(today.getFullYear(), today.getMonth(), 1))
      return { ...base, start_date: start, end_date: tomorrow }
    }
    case 'last_month': {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1)
      const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return { ...base, start_date: dateKey(firstLast), end_date: dateKey(firstThis) }
    }
    case 'this_quarter': {
      const qStartMonth = Math.floor(today.getMonth() / 3) * 3
      const start = dateKey(new Date(today.getFullYear(), qStartMonth, 1))
      return { ...base, start_date: start, end_date: tomorrow }
    }
    case 'last_quarter': {
      const qStartMonth = Math.floor(today.getMonth() / 3) * 3
      const start = dateKey(new Date(today.getFullYear(), qStartMonth - 3, 1))
      const end = dateKey(new Date(today.getFullYear(), qStartMonth, 1))
      return { ...base, start_date: start, end_date: end }
    }
    case 'custom': {
      if (!customStart || !customEnd) return buildApiParams('this_month', customStart, customEnd, category)
      const endExcl = dateKey(addDays(new Date(`${customEnd}T00:00:00`), 1))
      return { ...base, start_date: customStart, end_date: endExcl }
    }
    default:
      return buildApiParams('this_month', customStart, customEnd, category)
  }
}

export default function LeaderboardPage() {
  const { t } = useTranslation()
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [category,    setCategory]    = useState('product')
  const [staffTab,    setStaffTab]    = useState('staff')
  const [timeMode,    setTimeMode]    = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd,   setCustomEnd]   = useState('')
  const [sortOrder,   setSortOrder]   = useState('desc') // 'desc' = cao→thấp, 'asc' = thấp→cao

  const CATEGORIES = [
    { value: 'product',  label: t('leaderboard.catProducts'),  icon: '📦' },
    { value: 'customer', label: t('leaderboard.catCustomers'), icon: '👑' },
    { value: 'channel',  label: t('leaderboard.catChannels'),  icon: '🏪' },
    { value: 'staff',    label: t('leaderboard.catStaff'),     icon: '🏆' },
  ]

  const STAFF_SUBTABS = [
    { value: 'staff',           label: t('leaderboard.staffSales'),     icon: 'storefront', unit: t('leaderboard.unitOfflineOrders') },
    { value: 'staff_warehouse', label: t('leaderboard.staffWarehouse'), icon: 'warehouse',  unit: t('leaderboard.unitWarehouseEntries') },
    { value: 'staff_marketing', label: t('leaderboard.staffMarketing'), icon: 'campaign',   unit: t('leaderboard.unitMonthlyBudget') },
  ]

  const STAFF_KPI_LABELS = {
    staff: {
      primary: 'DT',
      secondary: 'Đơn',
      tertiary: 'KH',
      primaryMoney: true,
    },
    staff_warehouse: {
      primary: 'SL xử lý',
      secondary: 'Thao tác',
      tertiary: 'Phiếu',
      primaryMoney: false,
    },
    staff_marketing: {
      primary: 'QC',
      secondary: 'Dòng QC',
      tertiary: 'Kênh QC',
      primaryMoney: true,
    },
  }

  const TIME_FILTERS = [
    { value: 'all',        label: t('leaderboard.timeAll') },
    { value: 'this_month', label: t('leaderboard.timeThisMonth') },
    { value: 'last_month', label: t('leaderboard.timeLastMonth') },
    { value: 'last_quarter', label: t('leaderboard.timeLastQuarter', 'Quý trước') },
    { value: 'this_quarter', label: t('leaderboard.timeThisQuarter', 'Quý này') },
    { value: 'custom',     label: t('leaderboard.timeCustom') },
  ]

  const apiCategory = category === 'staff' ? staffTab : category
  const activeSubtab = STAFF_SUBTABS.find(s => s.value === staffTab) ?? STAFF_SUBTABS[0]
  const staffKpiLabels = STAFF_KPI_LABELS[staffTab] ?? STAFF_KPI_LABELS.staff
  const isMoneyLeaderboard = ['product', 'customer', 'channel', 'staff_marketing'].includes(apiCategory)
  const isStaffLeaderboard = category === 'staff'

  const load = async () => {
    if (timeMode === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    try {
      const res = await getLeaderboard(buildApiParams(timeMode, customStart, customEnd, apiCategory))
      // Sắp xếp client-side theo sortOrder
      if (res?.entries) {
        res.entries = [...res.entries].sort((a, b) =>
          sortOrder === 'desc' ? b.value - a.value : a.value - b.value
        ).map((e, i) => ({
          ...e,
          rank: i + 1,
          badge: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : undefined,
        }))
      }
      setData(res)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [apiCategory, timeMode, customStart, customEnd, sortOrder])

  const hasData = data && (data.entries ?? []).length > 0

  const orderUnit = category !== 'staff' ? t('leaderboard.unitOrders') : activeSubtab.unit
  const maxEntryValue = Math.max(...(data?.entries ?? []).map(e => Number(e.value) || 0), 1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('leaderboard.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('leaderboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sort direction toggle */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {[
              { value: 'desc', label: '↓ Cao → Thấp' },
              { value: 'asc',  label: '↑ Thấp → Cao' },
            ].map(s => (
              <button key={s.value} onClick={() => setSortOrder(s.value)}
                className="px-3 py-1.5 text-xs font-medium transition-all"
                style={sortOrder === s.value
                  ? { background: 'var(--primary-500)', color: '#fff' }
                  : { background: 'transparent', color: 'var(--text-secondary)' }}>
                {s.label}
              </button>
            ))}
          </div>
          {/* Time filter pills */}
          {TIME_FILTERS.map(f => (
            <button key={f.value} onClick={() => setTimeMode(f.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={timeMode === f.value
                ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
                : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {timeMode === 'custom' && (
        <div className="lcard p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('leaderboard.dateFrom')}</span>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="linput text-sm" style={{ width: 150 }} />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('leaderboard.dateTo')}</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            max={dateKey(new Date())}
            className="linput text-sm" style={{ width: 150 }} />
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.value}
            onClick={() => { setCategory(c.value); if (c.value !== 'staff') setStaffTab('staff') }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
            style={category === c.value
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <span>{c.icon}</span>{c.label}
          </button>
        ))}
      </div>

      {/* Staff sub-tabs — chỉ hiện khi category = staff */}
      {category === 'staff' && (
        <div className="flex gap-0 px-1"
             style={{ borderBottom: '1px solid var(--border)' }}>
          {STAFF_SUBTABS.map(t => (
            <button key={t.value}
              onClick={() => setStaffTab(t.value)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all"
              style={{
                borderBottom: `2px solid ${staffTab === t.value ? 'var(--primary-500)' : 'transparent'}`,
                color: staffTab === t.value ? 'var(--primary-500)' : 'var(--text-secondary)',
                marginBottom: -1,
              }}>
              <span className="icon" style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="lcard p-12 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : hasData ? (
        <div className="space-y-4">
          {/* AI Decision Support Banner */}
          <div className="lcard p-4" style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <div className="flex items-start gap-2.5">
              <span className="icon text-primary-500 animate-pulse mt-0.5" style={{ color: 'var(--primary-500)', fontSize: 20 }}>auto_awesome</span>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-foreground" style={{ color: 'var(--text-primary)' }}>
                  Gợi ý & Tư vấn Quyết định AI (AI Action Insights)
                </h4>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  {(() => {
                    const topPerformer = data.entries[0]
                    const topName = category === 'channel' ? normalizeChannel(topPerformer?.name) : (topPerformer?.name || '—')
                    const topVal = topPerformer ? (isMoneyLeaderboard ? fmtMoneyExact(topPerformer.value) : `${topPerformer.value.toLocaleString('vi-VN')} ${orderUnit}`) : '—'
                    
                    if (category === 'product') {
                      return (
                        <>
                          Sản phẩm <strong>{topName}</strong> đang dẫn đầu doanh số với <strong>{topVal}</strong> trong kỳ. Hệ thống đề xuất doanh nghiệp liên hệ sớm với nhà cung cấp để đảm bảo tồn kho cho sản phẩm này, tránh đứt hàng. Đối với các sản phẩm xếp cuối bảng (hiệu suất thấp), hãy cân nhắc thiết lập chính sách bán kèm (bundle) với sản phẩm hot hoặc chạy flash sale xả hàng để giải phóng mặt bằng kho và thu hồi vốn lưu động.
                        </>
                      )
                    }
                    if (category === 'customer') {
                      return (
                        <>
                          Khách hàng VIP lớn nhất trong kỳ này là <strong>{topName}</strong> đóng góp <strong>{topVal}</strong>. Hệ thống khuyên bạn nên thiết lập chương trình tri ân VIP riêng biệt (tặng voucher độc quyền 15-20%) cho Top 5 khách hàng hàng đầu. Đồng thời, kết hợp với bộ lọc khách hàng rời bỏ (Rfm/Churn) để chủ động chăm sóc lại nhóm khách hàng có tần suất mua giảm dần.
                        </>
                      )
                    }
                    if (category === 'channel') {
                      return (
                        <>
                          Kênh bán hàng <strong>{topName}</strong> đem lại doanh số cao nhất đạt <strong>{topVal}</strong>. Khuyến nghị doanh nghiệp ưu tiên phân bổ ngân sách marketing vào kênh này. Hãy click trực tiếp vào tên kênh trên bảng để đối chiếu chi tiết số đơn hàng, đồng thời rà soát lại cơ cấu phí nền tảng để đảm bảo biên lợi nhuận ròng của kênh luôn tối ưu.
                        </>
                      )
                    }
                    // category === 'staff'
                    return (
                      <>
                        Nhân sự xuất sắc nhất trong bảng xếp hạng kỳ này là <strong>{topName}</strong> với <strong>{topVal}</strong>. Đề xuất ban quản lý tổ chức các buổi chia sẻ kinh nghiệm thực chiến từ nhân sự đầu bảng để đồng bộ và nâng cao năng lực cho toàn bộ nhân sự cấp dưới. Bạn cũng có thể thiết lập thêm chính sách thưởng nóng để tạo động lực thi đua cạnh tranh lành mạnh.
                      </>
                    )
                  })()}
                </p>
              </div>
            </div>
          </div>

          <div className="lcard overflow-hidden">
          {/* Sub-header */}
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
            <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{data?.period_label}</span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('leaderboard.totalRevLabel', { value: fmtMoneyExact(data?.total_revenue ?? 0) })}
            </span>
          </div>

          {/* Entries */}
          <div>
            {(data?.entries ?? []).map((entry, i) => (
              <div key={entry.rank}
                className="px-5 py-4 flex items-center gap-4 transition-colors"
                style={{
                  borderBottom: '1px solid var(--border)',
                  background: i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'rgba(245,158,11,0.06)' : 'transparent'}>

                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {entry.badge
                    ? <span className="text-2xl">{entry.badge}</span>
                    : <span className="font-bold text-lg" style={{ color: 'var(--text-tertiary)' }}>#{entry.rank}</span>
                  }
                </div>

                {/* Bar */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {category === 'channel' ? normalizeChannel(entry.name) : entry.name}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)', maxWidth: 200 }}>
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min(100, Math.round((Number(entry.value) || 0) / maxEntryValue * 100))}%`,
                        background: 'var(--primary-500)',
                      }} />
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {entry.orders} {orderUnit}
                    </span>
                  </div>
                  {isStaffLeaderboard && (
                    <div className="mt-1 text-xs flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: 'var(--text-tertiary)' }}>
                      {data?.kpi_period_match ? (
                        entry.hasAnyTarget ? (
                          <>
                            <span>KPI tháng {data?.kpi_period}: <strong style={{ color: entry.isKpiAchieved ? '#10B981' : '#F59E0B' }}>
                              {entry.isKpiAchieved ? 'Đạt' : 'Chưa đạt'}{entry.overallPct != null ? ` · ${fmtProgressPct(entry.overallPct)}` : ''}
                            </strong></span>
                            {entry.revTarget > 0 && (
                              <span>
                                {staffKpiLabels.primary}{' '}
                                {staffKpiLabels.primaryMoney
                                  ? fmtMoneyExact(entry.actualRevenue ?? 0)
                                  : Number(entry.actualRevenue ?? 0).toLocaleString('vi-VN')}
                                {' / '}
                                {staffKpiLabels.primaryMoney
                                  ? fmtMoneyExact(entry.revTarget)
                                  : Number(entry.revTarget).toLocaleString('vi-VN')}
                              </span>
                            )}
                            {entry.ordTarget > 0 && <span>{staffKpiLabels.secondary} {Number(entry.actualOrders ?? 0).toLocaleString('vi-VN')} / {Number(entry.ordTarget).toLocaleString('vi-VN')}</span>}
                            {entry.custTarget > 0 && <span>{staffKpiLabels.tertiary} {Number(entry.actualNewCustomers ?? 0).toLocaleString('vi-VN')} / {Number(entry.custTarget).toLocaleString('vi-VN')}</span>}
                          </>
                        ) : (
                          <span>Chưa đặt KPI tháng {data?.kpi_period}</span>
                        )
                      ) : (
                        <span>Chỉ đối chiếu KPI khi bộ lọc nằm trong một tháng</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Value + Trend */}
                <div className="text-right shrink-0">
                  <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isMoneyLeaderboard ? fmtMoneyExact(entry.value ?? 0) : entry.value_label}
                  </div>
                  <div className="text-xs" style={{ color: TREND_COLOR[entry.trend] }}>
                    {TREND_ICON[entry.trend]} {Math.abs(entry.change_pct).toFixed(1)}%
                    {' '}{entry.trend === 'UP' ? t('leaderboard.trendUp') : entry.trend === 'DOWN' ? t('leaderboard.trendDown') : t('leaderboard.trendStable')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      ) : (
        <AiEmptyState title={t('leaderboard.emptyState')} />
      )}
    </div>
  )
}
