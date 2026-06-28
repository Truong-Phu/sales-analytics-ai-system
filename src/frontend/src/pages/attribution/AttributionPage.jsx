import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getChannelAttribution } from '../../api/aiApi'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtMoneyExact } from '../../utils/format'

const COLORS = ['#6366F1','#22C55E','#F59E0B','#EF4444','#8B5CF6','#06B6D4']

export default function AttributionPage() {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language

  const getChannelDisplayName = (name = '') => {
    const raw = String(name || '').trim()
    const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '')
    if (key.includes('shopee')) return 'Shopee'
    if (key.includes('lazada')) return 'Lazada'
    if (key.includes('tiktok')) return 'TikTok Shop'
    if (key.includes('offline') || key.includes('pos') || key.includes('banquay')) {
      return t('dashboard.channel.offline', 'Offline / POS')
    }
    if (key.includes('khac') || key.includes('other')) {
      return t('common.other', 'Other')
    }
    return raw
  }

  const translateRecommendation = (rec) => {
    if (!rec) return ''
    if (currentLang !== 'en') return rec
    const raw = String(rec).trim().toLowerCase()
    if (raw.includes('chua co du lieu') || raw.includes('chưa có dữ liệu')) {
      return t('attribution.recNoAdCost')
    }
    if (raw.includes('roi xuat sac') || raw.includes('roi xuất sắc')) {
      return t('attribution.recExcellentRoi')
    }
    if (raw.includes('roi tot') || raw.includes('roi tốt')) {
      return t('attribution.recGoodRoi')
    }
    if (raw.includes('roi chap nhan duoc') || raw.includes('roi chấp nhận được')) {
      return t('attribution.recAcceptableRoi')
    }
    if (raw.includes('roi thap') || raw.includes('roi thấp')) {
      return t('attribution.recLowRoi')
    }
    return rec
  }

  const getInsightText = () => {
    if (!data) return ''
    if (currentLang !== 'en') return data.insight
    const topCh = getChannelDisplayName(data.top_channel)
    const topPct = data.channels?.[0]?.attribution_pct ?? 0
    const worstRoiCh = data.worst_roi_channel ? getChannelDisplayName(data.worst_roi_channel) : ''
    
    let text = t('attribution.insightTopChannel', { channel: topCh, pct: topPct })
    if (worstRoiCh) {
      text += ' ' + t('attribution.insightWorstRoi', { channel: worstRoiCh })
    }
    return text
  }

  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const [days,   setDays]   = useState(30)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getChannelAttribution({ days })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days])

  const pieData  = (data?.channels ?? []).map(c => ({ name: getChannelDisplayName(c.channel), value: c.revenue }))
  const fmt      = v => fmtMoneyExact(v || 0)
  const roiColor = roi => roi >= 500 ? '#22C55E' : roi >= 200 ? 'var(--primary-500)' : roi >= 50 ? '#F59E0B' : roi > 0 ? '#EF4444' : 'var(--text-tertiary)'

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('attribution.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('attribution.subtitle')}</p>
        </div>
        <select value={days} onChange={e => setDays(+e.target.value)} className="linput text-sm" style={{ width: 120 }}>
          {[7,14,30,90,365].map(d => <option key={d} value={d}>{t('attribution.dayOption', { n: d })}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : !data ? (
        <AiEmptyState title={t('attribution.emptyState')} />
      ) : (
        <>
          {/* Insight */}
          {data?.insight && (
            <div className="rounded-xl p-4 text-sm"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--primary-700)' }}>
              💡 {getInsightText()}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Pie chart */}
            <div className="lcard p-4">
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('attribution.pieTitle')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name}: ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={v => fmt(v)}
                    contentStyle={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Summary stats */}
            <div className="lcard p-4 space-y-2">
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('attribution.overviewTitle')}</h3>
              {[
                { label: t('attribution.totalRevenue'), tip: MT.totalRevenue,  value: fmt(data?.total_revenue ?? 0), color: 'var(--primary-500)' },
                { label: t('attribution.totalOrders'),  tip: MT.orderCount,   value: `${(data?.total_orders ?? 0).toLocaleString()} ${t('attribution.orderCount', { n: '' }).trim()}`, color: '#22C55E' },
                { label: t('attribution.bestChannel'),  tip: MT.salesChannel, value: getChannelDisplayName(data?.top_channel ?? '—'), color: '#22C55E' },
                { label: t('attribution.lowestRoi'),    tip: MT.roi,          value: getChannelDisplayName(data?.worst_roi_channel ?? '—'), color: '#EF4444' },
              ].map(k => (
                <div key={k.label} className="flex justify-between items-center py-2"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="inline-flex items-center gap-0.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {k.label}<InfoTooltip {...k.tip} placement="top" />
                  </span>
                  <span className="font-semibold text-sm" style={{ color: k.color }}>{k.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Channel table */}
          <div className="lcard overflow-hidden">
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('attribution.detailTitle')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {[
                      { h: t('attribution.colChannel'),    tip: MT.salesChannel     },
                      { h: t('attribution.colRevenue'),    tip: MT.channelRevenue   },
                      { h: t('attribution.colOrders'),     tip: MT.orderCount       },
                      { h: t('attribution.colAov'),        tip: MT.aov              },
                      { h: t('attribution.colAdCost'),     tip: MT.acos             },
                      { h: t('attribution.colRoi'),        tip: MT.roi              },
                      { h: t('attribution.colSuggestion'), tip: null                },
                    ].map(({ h, tip }) => (
                      <th key={h} className="text-left p-3 text-xs font-semibold"
                        style={{ color: 'var(--text-tertiary)' }}>
                        <span className="inline-flex items-center gap-0.5">
                          {h}{tip && <InfoTooltip {...tip} placement="bottom" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.channels ?? []).map(c => (
                    <tr key={c.channel} style={{ borderBottom: '1px solid var(--border)' }}
                      className="transition-colors"
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="p-3 font-medium" style={{ color: 'var(--text-primary)' }}>{getChannelDisplayName(c.channel)}</td>
                      <td className="p-3">
                        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(c.revenue)}</div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.attribution_pct}%</div>
                      </td>
                      <td className="p-3" style={{ color: 'var(--text-secondary)' }}>{c.orders}</td>
                      <td className="p-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{fmt(c.avg_order_value)}</td>
                      <td className="p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.ad_spend > 0 ? fmt(c.ad_spend) : '—'}
                      </td>
                      <td className="p-3 font-bold" style={{ color: roiColor(c.roi_pct) }}>
                        {c.roi_pct > 0 ? `${c.roi_pct.toFixed(0)}%` : '—'}
                      </td>
                      <td className="p-3 text-xs max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{translateRecommendation(c.recommendation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
