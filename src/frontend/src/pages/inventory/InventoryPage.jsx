import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useLocation } from 'react-router-dom'
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
  const [filter,      setFilter]     = useState('ALL')
  const [expandedIds, setExpandedIds]= useState(new Set())
  const [varCache,    setVarCache]   = useState({})
  const [varLoading,  setVarLoading] = useState(new Set())
  const [reorderPlan, setReorderPlan]= useState([])

  const load = async () => {
    setLoading(true)
    try {
      const [res, planRes] = await Promise.all([
        getInventoryIntelligence({ days: 30 }),
        api.get('/api/inventory/reorder-plan', { params: { days: 30, targetDays: 30 } })
          .then(r => r.data)
          .catch(() => ({ items: [] })),
      ])
      setData(res)
      setReorderPlan(planRes.items ?? [])
    } catch {
      setData(null)
      setReorderPlan([])
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

  const reorderByProduct = useMemo(() => {
    const map = new Map()
    reorderPlan.forEach(it => {
      const key = String(it.productId)
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    })
    return map
  }, [reorderPlan])

  const sourceLabel = (source) => ({
    sales_recent: t('inventory.reorderSourceRecent'),
    sales_history: t('inventory.reorderSourceHistory'),
    last_purchase_order: t('inventory.reorderSourceLastPo'),
    last_goods_receipt: t('inventory.reorderSourceLastReceipt'),
    min_safe_stock: t('inventory.reorderSourceMinSafe'),
  }[source] ?? t('inventory.reorderSourceSafeStock'))

  const formatDaysLeft = (value) => {
    if (value == null) return '—'
    const n = Number(value)
    if (!Number.isFinite(n) || n >= 9999) return '—'
    if (n <= 0) return t('inventory.outOfStock')
    return `${Math.round(n)}d`
  }

  const formatAvgDailySales = (value) => {
    if (value == null) return '—'
    const n = Number(value)
    return Number.isFinite(n) ? n.toFixed(1) : '—'
  }

  const buildSummaryFromPlan = (item, planItems) => {
    const stock = planItems.reduce((sum, x) => sum + Number(x.stockQuantity ?? 0), 0)
    const avgDailySales = planItems.reduce((sum, x) => sum + Number(x.avgDailySales ?? 0), 0)
    const variantDaysLeft = planItems
      .map(x => Number(x.daysLeft))
      .filter(x => Number.isFinite(x) && x >= 0)
    return {
      stock,
      avgDailySales,
      daysLeft: variantDaysLeft.length ? Math.min(...variantDaysLeft) : 9999,
    }
  }

  const getDerivedStatus = (item) => {
    const planItems = reorderByProduct.get(String(item.product_id)) ?? []
    if (!planItems.length) return 'NO_SALES'
    const summary = buildSummaryFromPlan(item, planItems)
    const daysLeft = Number(summary.daysLeft)
    if (Number(summary.stock) <= 0) return 'OUT_OF_STOCK'
    if (!Number.isFinite(daysLeft) || daysLeft >= 9999) return 'OK'
    if (daysLeft <= 7) return 'CRITICAL'
    if (daysLeft <= 14) return 'WARNING'
    if (daysLeft > 60) return 'OVERSTOCK'
    return 'OK'
  }

  const visibleItems = useMemo(() => (data?.items ?? [])
    .map(item => ({ ...item, derivedStatus: getDerivedStatus(item) }))
    .filter(i => i.derivedStatus !== 'NO_SALES'), [data, reorderByProduct])

  const filtered = visibleItems.filter(i =>
    filter === 'ALL'
    || i.derivedStatus === filter
    || (filter === 'CRITICAL' && i.derivedStatus === 'OUT_OF_STOCK'))

  const inventoryCounts = useMemo(() => visibleItems.reduce((acc, item) => {
    acc[item.derivedStatus] = (acc[item.derivedStatus] ?? 0) + 1
    return acc
  }, { CRITICAL: 0, WARNING: 0, OK: 0, OVERSTOCK: 0, OUT_OF_STOCK: 0 }), [visibleItems])

  const buildPurchaseUrl = (product, neededPlanItems) => {
    const items = (neededPlanItems ?? [])
      .map(it => ({
        productId:   it.productId ?? product.product_id,
        productName: it.productName ?? product.product_name,
        variationId: it.variationId ?? null,
        quantity:    it.reorderQty ?? it.reorder_qty ?? it.quantity,
        importPrice: it.importPrice ?? 0,
      }))
      .filter(it => Number(it.quantity) > 0)
    return `/purchase-orders?items=${encodeURIComponent(JSON.stringify(items))}&returnUrl=${encodeURIComponent(location.pathname)}`
  }

  return (
    <div className="space-y-5">
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
            { label: t('inventory.kpiUrgent'),    value: inventoryCounts.CRITICAL + inventoryCounts.OUT_OF_STOCK, color: '#EF4444', tip: MT.stockCritical  },
            { label: t('inventory.kpiLow'),       value: inventoryCounts.WARNING, color: '#F59E0B', tip: MT.stockWarning   },
            { label: t('inventory.kpiNormal'),    value: inventoryCounts.OK, color: '#22C55E', tip: MT.stockOk        },
            { label: t('inventory.kpiOverstock'), value: inventoryCounts.OVERSTOCK, color: '#3B82F6', tip: MT.stockOverstock },
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
            const status     = item.derivedStatus ?? item.status
            const cfg        = STATUS_CONFIG[status] ?? STATUS_CONFIG.OK
            const isExpanded = expandedIds.has(item.product_id)
            const vars       = varCache[item.product_id]
            const isVarLoading = varLoading.has(item.product_id)
            const planItems  = reorderByProduct.get(String(item.product_id)) ?? []
            const neededPlanItems = planItems.filter(x => Number(x.reorderQty ?? 0) > 0)
            const summary = buildSummaryFromPlan(item, planItems)
            const reorderQty = planItems.reduce((s, x) => s + Number(x.reorderQty ?? 0), 0)
            const message = reorderQty > 0
              ? `${item.product_name}: ${Math.round(summary.daysLeft)} ngày hết hàng – Lên kế hoạch đặt thêm ${reorderQty} đơn vị`
              : `${item.product_name}: dự kiến còn ${formatDaysLeft(summary.daysLeft)} – Chưa cần đặt thêm`
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
                      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{message}</p>
                    </div>
                    <div className="flex items-center gap-4 text-right text-sm shrink-0">
                      {[
                        { label: t('inventory.itemStock'),      tip: MT.currentStock,   value: summary.stock, colored: true },
                        { label: t('inventory.itemSoldPerDay'), tip: MT.avgDailySales, value: summary.avgDailySales > 0 ? Number(summary.avgDailySales).toFixed(1) : '—' },
                        { label: t('inventory.itemDaysLeft'),   tip: MT.daysOfStock,   value: summary.stock === 0 ? t('inventory.outOfStock') : summary.daysLeft >= 999 ? t('inventory.infinite') : `${Math.round(summary.daysLeft)}d`, colored: true },
                        ...(reorderQty > 0 ? [{ label: t('inventory.itemNeedOrder'), tip: MT.reorderPoint, value: reorderQty, special: '#F97316' }] : []),
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
                      {neededPlanItems.length > 0 && (
                        <div className="text-xs text-left max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
                          <div className="font-semibold" style={{ color: '#F97316' }}>
                            {neededPlanItems.length} biến thể cần nhập
                          </div>
                        </div>
                      )}
                      {reorderQty > 0 && (
                        <button
                          onClick={() => navigate(buildPurchaseUrl(item, neededPlanItems))}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap flex items-center gap-1"
                          style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--primary-500)', border: '1px solid rgba(99,102,241,0.3)' }}>
                          <span className="icon" style={{ fontSize: 13 }}>shopping_cart</span> {t('inventory.reorderBtn')}
                        </button>
                      )}
                      <button
                        onClick={() => toggleVariations(item.product_id)}
                        className="text-xs px-2 py-1.5 rounded-lg font-medium"
                        style={{ background: 'rgba(100,116,139,0.12)', color: 'var(--text-secondary)', border: '1px solid rgba(100,116,139,0.2)' }}>
                        <span className="icon text-sm" style={{ display: 'block', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                          chevron_right
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sub-rows biến thể */}
                {isExpanded && (
                  <div className="overflow-x-auto" style={{ background: 'var(--bg-elevated)', borderTop: `1px solid ${cfg.border}` }}>
                    {isVarLoading ? (
                      <div className="px-6 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('inventory.varLoading')}</div>
                    ) : !vars || vars.length === 0 ? (
                      <div className="px-6 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('inventory.varEmpty')}</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {[
                              { label: t('inventory.varColSku') },
                              { label: t('inventory.varColColor') },
                              { label: t('inventory.varColSize') },
                              { label: t('inventory.varColStock') },
                              { label: t('inventory.varColSoldPerDay'), tip: MT.avgDailySales },
                              { label: t('inventory.varColDaysLeft'), tip: MT.daysOfStock },
                              { label: t('inventory.varColSafeStock'), tip: MT.safeStock },
                              { label: t('inventory.varColNeedOrder'), tip: MT.reorderPoint },
                              { label: t('inventory.varColReason') },
                            ].map(h => (
                              <th key={h.label} className="px-6 py-2 text-left font-medium"
                                  style={{ color: 'var(--text-tertiary)' }}>
                                <span className="inline-flex items-center gap-0.5">
                                  {h.label}{h.tip && <InfoTooltip {...h.tip} placement="bottom" />}
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {vars.map(v => {
                            const plan = planItems.find(p => String(p.variationId) === String(v.variationId))
                            const needQty = Number(plan?.reorderQty ?? 0)
                            return (
                              <tr key={v.variationId}
                                  style={{
                                    borderBottom: '1px solid var(--border)',
                                    background: needQty > 0 ? 'rgba(249,115,22,0.06)' : 'transparent',
                                  }}>
                                <td className="px-6 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{v.sku ?? plan?.variationSku ?? '—'}</td>
                                <td className="px-6 py-2" style={{ color: 'var(--text-primary)' }}>{v.color ?? plan?.color ?? '—'}</td>
                                <td className="px-6 py-2" style={{ color: 'var(--text-primary)' }}>{v.size ?? plan?.size ?? '—'}</td>
                                <td className="px-6 py-2 font-semibold"
                                    style={{ color: (v.stockQuantity ?? 0) === 0 ? '#EF4444' : 'var(--text-primary)' }}>
                                  {v.stockQuantity ?? 0}
                                </td>
                                <td className="px-6 py-2 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                  {formatAvgDailySales(plan?.avgDailySales)}
                                </td>
                                <td className="px-6 py-2 tabular-nums" style={{ color: needQty > 0 ? '#F97316' : 'var(--text-secondary)' }}>
                                  {formatDaysLeft(plan?.daysLeft)}
                                </td>
                                <td className="px-6 py-2 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                  {plan?.safeStock ?? '—'}
                                </td>
                                <td className="px-6 py-2 tabular-nums font-bold" style={{ color: needQty > 0 ? '#F97316' : 'var(--text-tertiary)' }}>
                                  {needQty > 0 ? needQty : '—'}
                                </td>
                                <td className="px-6 py-2" style={{ color: 'var(--text-tertiary)' }}>
                                  {plan ? sourceLabel(plan.reorderSource) : '—'}
                                </td>
                              </tr>
                            )
                          })}
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
