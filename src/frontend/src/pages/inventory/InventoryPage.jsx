import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import MockToast from '../../components/ui/MockToast'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getInventoryIntelligence } from '../../api/aiApi'
import api from '../../api/axios'

export default function InventoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const STATUS_CONFIG = {
    CRITICAL:    { textColor: '#EF4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: '🔴', label: t('inventory.statusUrgent') },
    WARNING:     { textColor: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '🟡', label: t('inventory.statusLow') },
    OUT_OF_STOCK:{ textColor: '#EF4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.30)',  icon: '⛔', label: t('inventory.statusOutOfStock') },
    OK:          { textColor: '#22C55E', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  icon: '🟢', label: t('inventory.statusNormal') },
    OVERSTOCK:   { textColor: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', icon: '🔵', label: t('inventory.statusOverstock') },
    NO_SALES:    { textColor: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', border: 'var(--border)', icon: '⚪', label: t('inventory.statusNoOrders') },
  }
  const [data,        setData]       = useState(null)
  const [loading,     setLoading]    = useState(true)
  const [isMock,      setIsMock]     = useState(false)
  const [filter,      setFilter]     = useState('ALL')
  const [expandedIds, setExpandedIds]= useState(new Set())
  const [varCache,    setVarCache]   = useState({})
  const [varLoading,  setVarLoading] = useState(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const res = await getInventoryIntelligence({ days: 30 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
      setIsMock(false)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const toggleVariations = async (productId) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(productId)) { next.delete(productId); return next }
      next.add(productId)
      return next
    })
    if (varCache[productId] !== undefined) return
    setVarLoading(prev => new Set(prev).add(productId))
    try {
      const r = await api.get(`/api/products/${productId}/variations`)
      setVarCache(c => ({ ...c, [productId]: r.data?.data ?? r.data ?? [] }))
    } catch {
      setVarCache(c => ({ ...c, [productId]: [] }))
    } finally {
      setVarLoading(prev => { const s = new Set(prev); s.delete(productId); return s })
    }
  }

  const visibleItems = (data?.items ?? []).filter(i => i.status !== 'NO_SALES')
  const filtered = visibleItems.filter(i => filter === 'ALL' || i.status === filter)

  return (
    <div className="space-y-5">
      {isMock && <MockToast />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('inventory.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('inventory.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-md"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
            {t('inventory.soldRate')}
          </span>
          <Link to="/inventory/dashboard"
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {t('inventory.dashboardLink')}
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('inventory.kpiUrgent'),    value: data.critical_count,  color: '#EF4444', tip: MT.stockCritical  },
            { label: t('inventory.kpiLow'),       value: data.warning_count,   color: '#F59E0B', tip: MT.stockWarning   },
            { label: t('inventory.kpiNormal'),    value: data.ok_count,        color: '#22C55E', tip: MT.stockOk        },
            { label: t('inventory.kpiOverstock'), value: data.overstock_count, color: '#3B82F6', tip: MT.stockOverstock },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {k.label}<InfoTooltip {...k.tip} placement="top" />
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL','CRITICAL','WARNING','OK','OVERSTOCK'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={filter === f
              ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
              : { borderColor: 'var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}>
            {f === 'ALL' ? t('inventory.filterAll') : STATUS_CONFIG[f]?.label ?? f}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cfg        = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.OK
            const isExpanded = expandedIds.has(item.product_id)
            const vars       = varCache[item.product_id]
            const isVarLoading = varLoading.has(item.product_id)
            return (
              <div key={item.product_id} className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${cfg.border}` }}>
                <div className="p-4" style={{ background: cfg.bg }}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{cfg.icon}</span>
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.product_name}</span>
                        <span className="text-xs font-medium" style={{ color: cfg.textColor }}>{cfg.label}</span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.message}</p>
                    </div>
                    <div className="flex items-center gap-4 text-right text-sm shrink-0">
                      {[
                        { label: t('inventory.itemStock'),      tip: MT.currentStock,   value: item.current_stock, colored: true },
                        { label: t('inventory.itemSoldPerDay'), tip: MT.avgDailySales, value: item.avg_daily_sales > 0 ? Number(item.avg_daily_sales).toFixed(1) : '—' },
                        { label: t('inventory.itemDaysLeft'),   tip: MT.daysOfStock,   value: item.current_stock === 0 ? t('inventory.outOfStock') : item.days_until_stockout >= 999 ? t('inventory.infinite') : `${Math.round(item.days_until_stockout)}d`, colored: true },
                        ...(item.reorder_qty > 0 ? [{ label: t('inventory.itemNeedOrder'), tip: MT.reorderPoint, value: item.reorder_qty, special: '#F97316' }] : []),
                      ].map((col, ci) => (
                        <div key={ci}>
                          <div className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {col.label}<InfoTooltip {...col.tip} placement="top" />
                          </div>
                          <div className="font-bold" style={{ color: col.special ?? (col.colored ? cfg.textColor : 'var(--text-primary)') }}>
                            {col.value}
                          </div>
                        </div>
                      ))}
                      {item.reorder_qty > 0 && (
                        <button
                          onClick={() => navigate(`/goods-receipts?action=create&productId=${item.product_id}&productName=${encodeURIComponent(item.product_name)}&returnUrl=${encodeURIComponent(location.pathname)}`)}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap flex items-center gap-1"
                          style={{ background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)' }}>
                          <span style={{ fontSize: 12 }}>↑</span> {t('inventory.reorderBtn')}
                        </button>
                      )}
                      {!isMock && (
                        <button
                          onClick={() => toggleVariations(item.product_id)}
                          className="text-xs px-2 py-1.5 rounded-lg font-medium"
                          style={{ background: 'rgba(100,116,139,0.12)', color: 'var(--text-secondary)', border: '1px solid rgba(100,116,139,0.2)' }}>
                          <span className="icon text-sm" style={{ display: 'block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                            chevron_right
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-rows biến thể */}
                {isExpanded && (
                  <div style={{ background: 'var(--bg-elevated)', borderTop: `1px solid ${cfg.border}` }}>
                    {isVarLoading ? (
                      <div className="px-6 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('inventory.varLoading')}</div>
                    ) : !vars || vars.length === 0 ? (
                      <div className="px-6 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('inventory.varEmpty')}</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {[t('inventory.varColSku'), t('inventory.varColColor'), t('inventory.varColSize'), t('inventory.varColStock')].map(h => (
                              <th key={h} className="px-6 py-2 text-left font-medium"
                                  style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vars.map(v => (
                            <tr key={v.variationId} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="px-6 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{v.sku ?? '—'}</td>
                              <td className="px-6 py-2" style={{ color: 'var(--text-primary)' }}>{v.color ?? '—'}</td>
                              <td className="px-6 py-2" style={{ color: 'var(--text-primary)' }}>{v.size ?? '—'}</td>
                              <td className="px-6 py-2 font-semibold"
                                  style={{ color: (v.stockQuantity ?? 0) === 0 ? '#EF4444' : 'var(--text-primary)' }}>
                                {v.stockQuantity ?? 0}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Phân tích {visibleItems.length} sản phẩm dựa trên tốc độ bán {data.analysis_days ?? 30} ngày gần nhất
        </div>
      )}
    </div>
  )
}
