import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getNarrative } from '../../api/aiApi'
import DateRangeFilter from '../../components/ui/DateRangeFilter'
import { fmtMoneyExact } from '../../utils/format'

const dateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const todayKey = () => dateKey(new Date())
const firstDayOfMonth = () => {
  const d = new Date()
  d.setDate(1)
  return dateKey(d)
}

export default function NarrativePage() {
  const { t, i18n } = useTranslation()
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const [from,   setFrom]   = useState(() => firstDayOfMonth())
  const [to,     setTo]     = useState(() => todayKey())
  const lang = i18n.language?.startsWith('en') ? 'en' : 'vi'

  const computeDays = (f, t) => Math.max(1, Math.round((new Date(t) - new Date(f)) / 86400000) + 1)

  const load = async () => {
    setLoading(true)
    try {
      const days = computeDays(from, to)
      const res = await getNarrative({ days, language: lang })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [from, to, lang]) // eslint-disable-line

  const renderBold = (text) => text.split('**').map((part, i) =>
    i % 2 === 0 ? part : <strong key={i} style={{ color: 'var(--text-primary)' }}>{part}</strong>
  )

  const revChg   = data?.key_metrics?.revenue_change ?? 0
  const revColor = revChg >= 0 ? '#22C55E' : '#EF4444'

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('narrative.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('narrative.subtitle')}</p>
        </div>
        <DateRangeFilter from={from} to={to} onChange={(f, tVal) => { setFrom(f); setTo(tVal) }} />
      </div>

      {!data && !loading && <AiEmptyState title={t('narrative.emptyState')} />}

      {loading ? (
        <div className="lcard p-12 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : data && (
        <>
          <div className="rounded-xl p-5"
            style={{ background: 'linear-gradient(135deg, var(--primary-500) 0%, var(--accent-500) 100%)' }}>
            <div className="flex items-start gap-3">
              <span className="text-3xl">{revChg >= 10 ? '🚀' : revChg >= 0 ? '📈' : '📉'}</span>
              <div>
                <div className="text-lg font-bold text-white leading-snug">{data.headline}</div>
                <div className="text-xs text-white/80 mt-1">
                  {t('narrative.periodLabel')}: {data.period} · {t('narrative.generatedBy')}:{' '}
                  {data.generated_by === 'rule_based' ? t('narrative.generatorRule') : t('narrative.generatorAI')}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('narrative.kpiRevenue'),    value: fmtMoneyExact(data.key_metrics?.current_revenue ?? 0), color: 'var(--primary-500)' },
              { label: t('narrative.kpiGrowth'),     value: `${revChg>=0?'+':''}${revChg}%`, color: revColor },
              { label: t('narrative.kpiOrders'),     value: (data.key_metrics?.current_orders??0).toLocaleString(), color: '#22C55E' },
              { label: t('narrative.kpiOrderDelta'), value: `${(data.key_metrics?.orders_change??0)>=0?'+':''}${data.key_metrics?.orders_change??0}%`,
                color: (data.key_metrics?.orders_change??0)>=0 ? '#22C55E' : '#EF4444' },
            ].map(k => (
              <div key={k.label} className="lcard p-4">
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
                <div className="text-xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div className="lcard p-5">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>{t('narrative.detailSection')}</h3>
            <p className="leading-relaxed text-sm" style={{ color: 'var(--text-secondary)' }}>{renderBold(data.full_narrative)}</p>
          </div>

          {data.anomaly_note && (
            <div className="rounded-xl p-4 text-sm"
              style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#92400E' }}>
              ⚠️ {data.anomaly_note}
            </div>
          )}

          {data.recommendations?.length > 0 && (
            <div className="lcard p-5">
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>{t('narrative.actionSection')}</h3>
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

          <div className="lcard p-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {t('narrative.reportHint')}{' '}
            <Link to="/report" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t('narrative.reportLink')}</Link>.
          </div>
        </>
      )}
    </div>
  )
}
