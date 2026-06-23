import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import axios from '../../api/axios'
import AiEmptyState from '../../components/ui/AiEmptyState'
import DetailDrawer from '../../components/ui/DetailDrawer'
import { getChurnPrediction } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

const CHANNEL_CFG = {
  'SHOPEE':      { icon: '🛒', label: 'Shopee',    color: '#EE4D2D' },
  'TIKTOK_SHOP': { icon: '🎵', label: 'TikTok Shop', color: '#555555' },
  'LAZADA':      { icon: '🛍️', label: 'Lazada',    color: '#0F146D' },
  'OFFLINE':     { icon: '🏪', label: 'Cửa hàng',  color: '#10B981' },
  'FACEBOOK':    { icon: '📘', label: 'Facebook',   color: '#1877F2' },
  'WEBSITE':     { icon: '🌐', label: 'Website',    color: '#6366F1' },
}

function fmt(v) {
  return fmtMoneyExact(v || 0)
}

const RISK_COLOR = {
  HIGH:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  text: '#EF4444', dot: '#EF4444' },
  MEDIUM: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', text: '#F59E0B', dot: '#F59E0B' },
  LOW:    { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.30)',  text: '#22C55E', dot: '#22C55E' },
}

function RiskBadge({ risk }) {
  const { t } = useTranslation()
  const c = RISK_COLOR[risk] ?? RISK_COLOR.LOW
  const label = t(`churn.risk.${risk.toLowerCase()}`, risk)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {label}
    </span>
  )
}

function ProbBar({ pct }) {
  const color = pct >= 70 ? '#EF4444' : pct >= 40 ? '#F59E0B' : '#22C55E'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>{pct}%</span>
    </div>
  )
}
const fallbackVouchers = [
  { id: 'v-10', code: 'GIUCHAN10', type: 'PERCENT', value: 10 },
  { id: 'v-15', code: 'GIUCHAN15', type: 'PERCENT', value: 15 },
  { id: 'v-20', code: 'GIUCHAN20', type: 'PERCENT', value: 20 },
  { id: 'v-ship', code: 'FREESHIP', type: 'FREESHIP', value: 0 },
]

const getVoucherLabel = (v) => {
  if (v.type === 'PERCENT') {
    return `Giảm ${v.value}% (Mã: ${v.code}${v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''})`;
  }
  if (v.type === 'FIXED') {
    return `Giảm ${new Intl.NumberFormat('vi-VN').format(v.value)}₫ (Mã: ${v.code}${v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''})`;
  }
  return `Miễn phí vận chuyển (Mã: ${v.code}${v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''})`;
}

function ActionExecutionDrawer({ config, onClose, onSuccess }) {
  const [sending, setSending] = useState(false)
  const [method, setMethod] = useState('SMS')
  const [vouchers, setVouchers] = useState([])
  const [selectedVoucher, setSelectedVoucher] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    axios.get('/api/pos/vouchers')
      .then(r => {
        const active = (r.data ?? []).filter(v => v.isActive)
        if (active.length > 0) {
          setVouchers(active)
          setSelectedVoucher(active[0])
        } else {
          setVouchers(fallbackVouchers)
          setSelectedVoucher(fallbackVouchers[0])
        }
      })
      .catch(() => {
        setVouchers(fallbackVouchers)
        setSelectedVoucher(fallbackVouchers[0])
      })
  }, [])

  useEffect(() => {
    if (!selectedVoucher) return
    const discountText = selectedVoucher.type === 'PERCENT' 
      ? `giảm giá ${selectedVoucher.value}% [${selectedVoucher.code}]`
      : selectedVoucher.type === 'FIXED'
        ? `giảm giá ${new Intl.NumberFormat('vi-VN').format(selectedVoucher.value)}₫ [${selectedVoucher.code}]`
        : `miễn phí vận chuyển [${selectedVoucher.code}]`

    if (config.action === 'retain') {
      const channelName = config.channel === 'SHOPEE' ? 'Shopee' : config.channel === 'TIKTOK_SHOP' ? 'TikTok Shop' : config.channel === 'LAZADA' ? 'Lazada' : config.channel === 'FACEBOOK' ? 'Facebook' : config.channel === 'WEBSITE' ? 'Website' : 'cửa hàng';
      setMessage(`Chào anh/chị ${config.customer}, ${channelName} gửi tặng anh/chị mã ${discountText} cho đơn hàng tiếp theo. Áp dụng đến hết tháng này. Cảm ơn anh/chị đã đồng hành cùng cửa hàng!`)
    }
  }, [config, selectedVoucher])

  const handleSend = () => {
    setSending(true)
    setTimeout(() => {
      setSending(false)
      
      try {
        const list = JSON.parse(localStorage.getItem('executed_campaigns') ?? '[]')
        const discountVal = selectedVoucher 
          ? `[${selectedVoucher.code}] - ${selectedVoucher.type === 'PERCENT' ? `${selectedVoucher.value}%` : selectedVoucher.type === 'FIXED' ? `${new Intl.NumberFormat('vi-VN').format(selectedVoucher.value)}₫` : 'Freeship'}` 
          : '20%'
          
        list.unshift({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          action: 'retain',
          target: config.customer,
          method: method,
          discount: discountVal,
          message: message,
          status: 'SUCCESS'
        })
        localStorage.setItem('executed_campaigns', JSON.stringify(list))
      } catch (e) {
        console.error(e)
      }

      onSuccess(`Đã kích hoạt thành công chiến dịch giữ chân cho khách hàng ${config.customer}!`)
      onClose()
    }, 1500)
  }

  const title = 'Thực thi chiến dịch giữ chân'
  const subtitle = `Khách hàng: ${config.customer} (Rủi ro: ${config.risk})`

  const drawerFooter = (
    <div className="flex justify-end gap-2 w-full">
      <button onClick={onClose} disabled={sending} className="lbtn lbtn-secondary text-xs !h-9 !px-3">
        Hủy bỏ
      </button>
      <button onClick={handleSend} disabled={sending} className="lbtn lbtn-primary text-xs !h-9 !px-4">
        {sending ? (
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          'Gửi ưu đãi ngay'
        )}
      </button>
    </div>
  )

  return (
    <DetailDrawer
      open={true}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={460}
      footer={drawerFooter}
    >
      <div className="p-5 space-y-4 text-xs text-secondary" style={{ color: 'var(--text-secondary)' }}>
        <div className="bg-red-50 dark:bg-red-950/20 p-3.5 rounded-xl border border-red-100 dark:border-red-900/30 space-y-1">
          <p>Khách hàng: <strong className="text-foreground" style={{ color: 'var(--text-primary)' }}>{config.customer}</strong></p>
          <p>Xác suất rời bỏ: <strong style={{ color: '#EF4444' }}>{config.prob}% ({config.risk})</strong></p>
          <p>Kênh tiếp cận gợi ý: <strong className="text-foreground" style={{ color: 'var(--text-primary)' }}>{config.channel || 'Tất cả'}</strong></p>
        </div>

        <div className="space-y-4 pt-2">
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Phương thức gửi ưu đãi</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="linput text-xs w-full">
              <option value="SMS">Gửi SMS Brandname tự động (qua SĐT)</option>
              <option value="Email">Gửi Email Marketing cá nhân hóa (qua Gmail)</option>
            </select>
          </div>
          
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Mức ưu đãi / Voucher</label>
            <select 
              value={selectedVoucher?.id || ''} 
              onChange={e => {
                const found = vouchers.find(v => v.id === e.target.value || String(v.id) === e.target.value)
                if (found) setSelectedVoucher(found)
              }} 
              className="linput text-xs w-full"
            >
              {vouchers.map(v => (
                <option key={v.id} value={v.id}>{getVoucherLabel(v)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Nội dung thông điệp</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="linput w-full p-2 h-36 text-xs"
              style={{ fontFamily: 'sans-serif', lineHeight: '1.4' }}
            />
          </div>
        </div>
      </div>
    </DetailDrawer>
  )
}

export default function ChurnPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)
  const [filter,  setFilter]  = useState('ALL')
  const [executionDrawer, setExecutionDrawer] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getChurnPrediction({ top_n: 100 })
      setData(res)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const filtered = (data?.customers ?? []).filter(c => filter === 'ALL' || c.risk === filter)

  const flatRows = filtered.flatMap(c => {
    const chList = c.channels?.length > 0
      ? c.channels
      : [{ channel: null, orders: 0, revenue: 0, recency_days: null }]
    return chList.map((ch, ci) => ({ c, ch, ci, span: chList.length }))
  })

  const FILTERS = [
    { key: 'ALL',    label: t('churn.filterAll') },
    { key: 'HIGH',   label: t('churn.risk.high') },
    { key: 'MEDIUM', label: t('churn.risk.medium') },
    { key: 'LOW',    label: t('churn.risk.low') },
  ]

  const COLS = [
    { label: t('churn.colCustomer'),   cls: 'p-3 text-left' },
    { label: t('churn.colChannel'),    cls: 'p-3 text-left' },
    { label: t('churn.colRecency'),    cls: 'p-3 text-right' },
    { label: t('churn.colOrders'),     cls: 'p-3 text-right' },
    { label: t('churn.colRevenue'),    cls: 'p-3 text-right' },
    { label: t('churn.colChurnProb'),  cls: 'p-3 text-left' },
    { label: t('churn.colRisk'),       cls: 'p-3 text-center' },
    { label: t('churn.colAction'),     cls: 'p-3 text-left' },
    { label: '',                       cls: 'p-3' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('churn.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('churn.subtitle')}</p>
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">{t('common.refresh')}</button>
      </div>

      {!data && !loading && <AiEmptyState title={t('churn.emptyState')} />}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('churn.totalCustomers'), value: data.total_customers,      color: 'var(--primary-500)' },
            { label: t('churn.highRisk'),        value: data.high_risk_count,      color: '#EF4444' },
            { label: t('churn.mediumRisk'),      value: data.medium_risk_count,    color: '#F59E0B' },
            { label: t('churn.churnRate'),       value: `${data.churn_rate_pct}%`, color: '#EF4444' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {t('churn.thresholdBefore')} <strong>{data.churn_threshold_days} {t('churn.daysSuffix')}</strong> {t('churn.thresholdAfter')}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={filter === f.key
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="lcard overflow-x-auto">
        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: 'var(--bg-elevated)' }}>
                {COLS.map(h => (
                  <th key={h.label} className={`${h.cls} text-xs font-semibold tracking-wide`}
                    style={{ color: 'var(--text-tertiary)', borderBottom: '2px solid var(--border)' }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flatRows.map(({ c, ch, ci, span }) => {
                const cfg = ch.channel
                  ? (CHANNEL_CFG[ch.channel] ?? { icon: '📦', label: ch.channel, color: '#6B7280' })
                  : null
                const isTop = ci === 0
                const recencyColor = ch.recency_days == null ? 'var(--text-tertiary)'
                  : ch.recency_days > 60 ? '#EF4444'
                  : ch.recency_days > 30 ? '#F59E0B'
                  : '#22C55E'
                const rowBorderTop = ci === 0
                  ? '2px solid var(--border)'
                  : '1px dashed color-mix(in srgb, var(--border) 50%, transparent)'

                return (
                  <tr key={`${c.customer_id}-${ci}`} style={{ borderTop: rowBorderTop }}>

                    {ci === 0 && (
                      <td rowSpan={span} className="p-3"
                        style={{ verticalAlign: 'middle', borderRight: '1px solid var(--border)' }}>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.full_name}</div>
                        {c.email && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{c.email}</div>
                        )}
                        {c.phone && (
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.phone}</div>
                        )}
                      </td>
                    )}

                    <td className="px-3 py-2" style={{ verticalAlign: 'middle' }}>
                      {cfg ? (
                        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <span>{cfg.icon}</span>
                          <span className="font-medium" style={{ color: isTop ? cfg.color : 'var(--text-secondary)' }}>
                            {cfg.label}
                          </span>
                          {isTop && (
                            <span className="text-[9px] px-1 rounded"
                              style={{ background: `${cfg.color}20`, color: cfg.color }}>
                              {t('churn.primaryBadge')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap"
                      style={{ verticalAlign: 'middle', color: recencyColor }}>
                      {ch.recency_days != null ? `${ch.recency_days} ${t('churn.daysSuffix')}` : '—'}
                    </td>

                    <td className="px-3 py-2 text-right text-sm"
                      style={{ verticalAlign: 'middle', color: 'var(--text-secondary)' }}>
                      {ch.orders}
                    </td>

                    <td className="px-3 py-2 text-right text-sm font-medium whitespace-nowrap"
                      style={{ verticalAlign: 'middle', color: cfg && isTop ? cfg.color : 'var(--text-secondary)' }}>
                      {fmt(ch.revenue)}₫
                    </td>

                    <td className="px-3 py-2 w-36"
                      style={{ verticalAlign: 'middle', borderLeft: '1px solid var(--border)' }}>
                      <ProbBar pct={c.churn_prob} />
                    </td>

                    <td className="px-3 py-2 text-center" style={{ verticalAlign: 'middle' }}>
                      <RiskBadge risk={c.risk} />
                    </td>

                    <td className="px-3 py-2 text-xs"
                      style={{ verticalAlign: 'middle', color: 'var(--text-tertiary)', maxWidth: 220 }}>
                      {ch.action ?? c.action}
                    </td>

                    {ci === 0 && (
                      <td rowSpan={span} className="px-3 py-2"
                        style={{ verticalAlign: 'middle', borderLeft: '1px solid var(--border)' }}>
                        {c.risk !== 'LOW' && (
                          <button
                            onClick={() => {
                              setExecutionDrawer({
                                action:   'retain',
                                customer:  c.full_name,
                                prob:      String(c.churn_prob),
                                risk:      c.risk,
                                channel:   c.channels?.[0]?.channel ?? '',
                              })
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap"
                            style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#EF4444', background: 'rgba(239,68,68,0.06)' }}
                            onMouseEnter={e => { e.currentTarget.style.background='#EF4444'; e.currentTarget.style.color='white' }}
                            onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; e.currentTarget.style.color='#EF4444' }}
                            title={`${t('churn.retainBtn')} ${c.full_name} (churn ${c.churn_prob}%)`}
                          >
                            <span className="icon" style={{ fontSize: 13 }}>campaign</span>
                            {t('churn.retainBtn')}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {executionDrawer && (
        <ActionExecutionDrawer
          config={executionDrawer}
          onClose={() => setExecutionDrawer(null)}
          onSuccess={(msg) => {
            setToastMsg(msg)
            setTimeout(() => setToastMsg(null), 3000)
          }}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl p-4 flex items-center gap-2 text-white shadow-lg animate-fade-in"
             style={{ background: '#10B981', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="icon">check_circle</span>
          <span className="text-sm font-semibold">{toastMsg}</span>
        </div>
      )}
    </div>
  )
}
