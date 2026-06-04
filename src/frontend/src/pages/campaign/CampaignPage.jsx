import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getCampaignPlan } from '../../api/aiApi'

// ── Hiển thị card gợi ý từ URL params (basket / rfm / churn) ─────────────────
function ActionSuggestionBanner({ params, onDismiss }) {
  const { t } = useTranslation()
  const action = params.get('action')
  if (!action) return null

  if (action === 'bundle') {
    const products = (params.get('products') ?? '').split('|').filter(Boolean)
    const lift     = params.get('lift')
    const conf     = params.get('conf')
    return (
      <div className="rounded-xl p-4 flex items-start gap-3 relative"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.30)' }}>
        <span className="icon text-2xl shrink-0 mt-0.5" style={{ color: 'var(--primary-500)' }}>local_offer</span>
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: 'var(--primary-700)' }}>
            {t('campaign.bundleBannerTitle')}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('campaign.bundleBoughtWith')}: {products.map((p, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1" style={{ color: 'var(--text-tertiary)' }}>+</span>}
                <strong style={{ color: 'var(--primary-600)' }}>{p}</strong>
              </span>
            ))}{lift && <span className="ml-2 text-green-600 font-medium">Lift {lift}x</span>}{conf && <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(conf {conf}%)</span>}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('campaign.bundleProposal')}
          </p>
        </div>
        <button onClick={onDismiss} className="icon shrink-0 text-sm transition-colors"
          style={{ color: 'var(--text-tertiary)', fontSize: 18 }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          close
        </button>
      </div>
    )
  }

  if (action === 'winback') {
    const segment = params.get('segment') ?? ''
    const count   = params.get('count') ?? '?'
    const segColor = segment === 'At Risk' ? '#EF4444' : segment === 'Lost' ? '#6B7280' : '#3B82F6'
    return (
      <div className="rounded-xl p-4 flex items-start gap-3 relative"
        style={{ background: `${segColor}10`, border: `1px solid ${segColor}40` }}>
        <span className="icon text-2xl shrink-0 mt-0.5" style={{ color: segColor }}>person_search</span>
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: segColor }}>
            {t('campaign.winbackBannerTitle', { segment })}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            <strong>{count}</strong> khách hàng phân khúc <strong>{segment}</strong> cần chiến dịch kích hoạt lại.
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
            Đề xuất: Gửi voucher giảm giá 20% + email cá nhân hóa cho {count} khách này — chạy vào thời điểm cao điểm bên dưới.
          </p>
        </div>
        <button onClick={onDismiss} className="icon shrink-0 transition-colors"
          style={{ color: 'var(--text-tertiary)', fontSize: 18 }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          close
        </button>
      </div>
    )
  }

  if (action === 'retain') {
    const customer = params.get('customer') ?? ''
    const prob     = params.get('prob') ?? '?'
    const risk     = params.get('risk') ?? 'HIGH'
    const channel  = params.get('channel') ?? ''
    const riskColor = risk === 'HIGH' ? '#EF4444' : '#F59E0B'
    return (
      <div className="rounded-xl p-4 flex items-start gap-3 relative"
        style={{ background: `${riskColor}0D`, border: `1px solid ${riskColor}40` }}>
        <span className="icon text-2xl shrink-0 mt-0.5" style={{ color: riskColor }}>favorite</span>
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: riskColor }}>
            {t('campaign.retainBannerTitle', { risk })}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{customer}</strong> có xác suất rời bỏ <strong style={{ color: riskColor }}>{prob}%</strong>
            {channel && <span className="ml-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>qua {channel}</span>}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
            Đề xuất: Gửi ngay voucher cá nhân hóa hoặc gọi điện chăm sóc — chọn thời điểm tốt nhất bên dưới để liên hệ.
          </p>
        </div>
        <button onClick={onDismiss} className="icon shrink-0 transition-colors"
          style={{ color: 'var(--text-tertiary)', fontSize: 18 }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          close
        </button>
      </div>
    )
  }

  return null
}

export default function CampaignPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showBanner, setShowBanner] = useState(true)
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const fetchedRef = useRef(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getCampaignPlan({ days_ahead: 60 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const maxDow = Math.max(...(data?.seasonal_insight?.weekly_pattern?.map(d => d.avg) ?? [1]))

  const REC_CONFIG = {
    RUN_CAMPAIGN: { textColor: '#22C55E', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   icon: '🚀', label: t('campaign.recShouldRun') },
    PREPARE:      { textColor: 'var(--primary-500)', bg: 'var(--primary-50)', border: 'rgba(99,102,241,0.25)', icon: '📋', label: t('campaign.recPrepare') },
    NORMAL:       { textColor: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', border: 'var(--border)',       icon: '📅', label: t('campaign.recNormal') },
    LOW_SEASON:   { textColor: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: '⬇️', label: t('campaign.recLow') },
  }

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('campaign.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('campaign.subtitle')}</p>
      </div>

      {/* Banner gợi ý từ Basket / RFM / Churn */}
      {showBanner && (
        <ActionSuggestionBanner
          params={searchParams}
          onDismiss={() => { setShowBanner(false); setSearchParams({}); }}
        />
      )}

      {!data && !loading && <AiEmptyState title={t('campaign.emptyState')} />}

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
                { label: t('campaign.kpiPeakMonth'), value: `🏆 ${data.seasonal_insight.best_month_name}`,  color: '#22C55E' },
                { label: t('campaign.kpiLowMonth'),  value: `⬇️ ${data.seasonal_insight.worst_month_name}`, color: '#F59E0B' },
                { label: t('campaign.kpiBestDay'),   value: `📅 ${data.seasonal_insight.best_weekday}`,    color: 'var(--primary-500)' },
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
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>{t('campaign.chartWeekday')}</h3>
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
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('campaign.planTitle')}</h3>
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
                        {t('campaign.eventLabel')}: {w.events.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: cfg.textColor }}>
                      {w.vs_overall_pct > 0 ? '+' : ''}{w.vs_overall_pct}% {t('campaign.vsAvg')}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{(w.avg_revenue/1e6).toFixed(1)}M VNĐ/{t('campaign.perMonth')}</div>
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
                {t('campaign.upcomingTitle', { count: data.upcoming_events.length })}
              </h3>
              <div className="space-y-2">
                {data.upcoming_events.map(ev => (
                  <div key={ev.name} className="lcard p-4 flex items-center gap-4">
                    <div className="text-center shrink-0" style={{ minWidth: 56 }}>
                      <div className="text-2xl font-bold" style={{ color: 'var(--primary-500)' }}>{ev.days_until}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('campaign.daysLeft')}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{ev.name} – {ev.date}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{ev.tip}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold" style={{ color: '#22C55E' }}>+{Math.round((ev.boost_expected-1)*100)}%</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('campaign.expectedLabel')}</div>
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
