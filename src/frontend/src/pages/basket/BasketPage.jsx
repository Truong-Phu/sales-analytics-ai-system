import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getBasketAnalysis } from '../../api/aiApi'

export default function BasketPage() {
  const { t } = useTranslation()
  const navigate   = useNavigate()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [minConf, setMinConf] = useState(0.1)
  const [minLift, setMinLift] = useState(1.0)
  const fetchedRef = useRef(false)

  const handleCreateBundle = (rule) => {
    const products = [...rule.antecedents, ...rule.consequents].join('|')
    const params = new URLSearchParams({
      action:   'bundle',
      products,
      lift:     rule.lift.toString(),
      conf:     (rule.confidence * 100).toFixed(0),
    })
    navigate(`/campaign?${params}`)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getBasketAnalysis({
        days: 180,
        min_support: 0.001,
        min_confidence: minConf,
        min_lift: minLift,
        top_n: 30,
      })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }, [minConf, minLift])

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [load])

  const liftColor = (lift) => lift >= 3 ? '#EF4444' : lift >= 2 ? '#F59E0B' : '#22C55E'

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('basket.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('basket.subtitle')}</p>
      </div>

      {!data && !loading && <AiEmptyState title={t('basket.emptyState')} />}

      <div className="lcard p-4 flex gap-6 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t('basket.minConfidence')}: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(minConf*100)}%</strong>
          </label>
          <input type="range" min={0.1} max={0.9} step={0.05} value={minConf}
            onChange={e => setMinConf(+e.target.value)} className="w-32 accent-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t('basket.minLift')}: <strong style={{ color: 'var(--text-primary)' }}>{minLift}x</strong>
          </label>
          <input type="range" min={1} max={5} step={0.5} value={minLift}
            onChange={e => setMinLift(+e.target.value)} className="w-32 accent-indigo-500" />
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">{t('basket.analyzeBtn')}</button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t('basket.kpiOrders'),  tip: MT.orderCount, value: data.total_transactions || '(mẫu)', color: 'var(--primary-500)' },
            { label: t('basket.kpiRules'),   tip: MT.support,    value: data.total_rules, color: '#22C55E' },
            { label: t('basket.kpiSource'),  tip: null,
              value: data.is_mock ? t('basket.sourceSample') : t('basket.sourceReal'),
              color: data.is_mock ? '#F59E0B' : '#22C55E' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {k.label}{k.tip && <InfoTooltip {...k.tip} placement="top" />}
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="lcard p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : (data && data.total_rules === 0 && !loading) ? (
          <div className="lcard p-8 text-center space-y-2">
            <div className="text-3xl">🛒</div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('basket.noRulesFound', 'Không tìm thấy association rules')}
            </p>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {data.note}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('basket.noRulesHint', 'Thử giảm Min Confidence hoặc Min Lift, hoặc nhập thêm đơn hàng có nhiều sản phẩm.')}
            </p>
          </div>
        ) : (data?.rules ?? []).map((rule, i) => (
          <div key={i} className="lcard p-4 transition-colors lcard-hover">
            <div className="flex items-center gap-2 flex-wrap">
              {rule.antecedents.map(p => (
                <span key={p} className="px-2 py-1 rounded text-sm font-medium"
                  style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--primary-600)' }}>{p}</span>
              ))}
              <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              {rule.consequents.map(p => (
                <span key={p} className="px-2 py-1 rounded text-sm font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>{p}</span>
              ))}
              <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span className="inline-flex items-center gap-0.5">Support<InfoTooltip {...MT.support} placement="top" />: <strong style={{ color: 'var(--text-primary)' }}>{(rule.support*100).toFixed(1)}%</strong></span>
                <span className="inline-flex items-center gap-0.5">Confidence<InfoTooltip {...MT.confidence} placement="top" />: <strong style={{ color: 'var(--text-primary)' }}>{(rule.confidence*100).toFixed(1)}%</strong></span>
                <span className="inline-flex items-center gap-0.5">Lift<InfoTooltip {...MT.lift} placement="top" />: <strong style={{ color: liftColor(rule.lift) }}>{rule.lift}x</strong></span>
                <span>{t('basket.orderCount', { count: rule.transactions })}</span>
                <button
                  onClick={() => handleCreateBundle(rule)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                  style={{ borderColor: 'rgba(99,102,241,0.4)', color: 'var(--primary-600)', background: 'rgba(99,102,241,0.06)' }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--primary-500)'; e.currentTarget.style.color='white'; e.currentTarget.style.borderColor='var(--primary-500)' }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(99,102,241,0.06)'; e.currentTarget.style.color='var(--primary-600)'; e.currentTarget.style.borderColor='rgba(99,102,241,0.4)' }}
                  title={t('basket.createBundleTitle')}
                >
                  <span className="icon" style={{ fontSize: 13 }}>campaign</span>
                  {t('basket.createBundle')}
                </button>
              </div>
            </div>
            <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{rule.recommendation}</p>
          </div>
        ))}
      </div>

      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{data.note}</div>
      )}
    </div>
  )
}
