import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getProducts } from '../../api/dashboardApi'
import { MOCK_PRODUCTS } from '../../mockData/products'
import { useAuth } from '../../hooks/useAuth'

const PAGE_SIZE = 10

function StockBadge({ p, t }) {
  const qty = p.total_qty_sold ?? 0
  const stock = p.stock ?? 100
  if (qty === 0 || stock === 0)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                 style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}>
             <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{t('products.status.inactive')}
           </span>
  if (stock < 20)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                 style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#F59E0B' }}>
             <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{t('products.status.low_stock')}
           </span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
               style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--accent-500)' }}>
           <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-500)' }} />{t('products.status.active')}
         </span>
}

export default function ProductsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [isMock,   setIsMock]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState('')
  const [page,     setPage]     = useState(1)
  const [selected, setSelected] = useState(null)
  const [view,     setView]     = useState('table') // 'table' | 'grid'

  const canEdit = ['Manager', 'Staff', 'DataIT', 'Admin'].includes(user?.role)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setIsMock(false)
    try {
      setData(await getProducts({ search, category, page, limit: PAGE_SIZE }))
    } catch {
      const filtered = MOCK_PRODUCTS.filter(p =>
        (!search   || (p.name ?? p.product_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
                      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())) &&
        (!category || (p.category ?? '').toLowerCase().includes(category.toLowerCase()))
      )
      const start = (page - 1) * PAGE_SIZE
      setData({ items: filtered.slice(start, start + PAGE_SIZE), total: filtered.length, page,
                totalPages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) })
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [search, category, page])

  useEffect(() => { fetchData() }, [fetchData])

  const items      = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('products.title')}</h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('products.totalCount', { count: data.total })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--bg-elevated)' }}>
            {['table', 'grid'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{
                  background: view === v ? 'var(--bg-surface)' : 'transparent',
                  color: view === v ? 'var(--primary-500)' : 'var(--text-tertiary)',
                  boxShadow: view === v ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <span className="icon text-base">{v === 'table' ? 'table_rows' : 'grid_view'}</span>
              </button>
            ))}
          </div>
          {canEdit && (
            <button className="lbtn lbtn-primary !h-9">
              <span className="icon text-base">add</span>
              {t('products.addProduct')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input type="text" className="linput !pl-9 text-sm"
                 placeholder={t('products.searchPlaceholder')}
                 value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <input type="text" className="linput text-sm w-44"
               placeholder={t('products.filterCategory')}
               value={category} onChange={e => { setCategory(e.target.value); setPage(1) }} />
        <button onClick={() => { setSearch(''); setCategory(''); setPage(1) }}
                className="lbtn lbtn-secondary !h-9">
          <span className="icon text-base">refresh</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="lcard p-16 flex items-center justify-center">
          <span className="w-7 h-7 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="lcard p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
          <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>inventory_2</span>
          <p className="text-sm">{t('common.noData')}</p>
        </div>
      ) : view === 'grid' ? (
        /* Grid view */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((p, i) => (
            <div
              key={p.product_id ?? p.id ?? i}
              className="lcard p-4 cursor-pointer transition-all"
              onClick={() => setSelected(p)}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = ''}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                   style={{ background: 'var(--bg-elevated)' }}>
                <span className="icon" style={{ fontSize: 22, color: 'var(--primary-500)' }}>inventory_2</span>
              </div>
              <div className="font-medium text-sm truncate mb-1" style={{ color: 'var(--text-primary)' }}>
                {p.product_name ?? p.name}
              </div>
              <div className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{p.category}</div>
              <div className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {(p.unit_price ?? p.price ?? 0).toLocaleString('vi-VN')}₫
              </div>
              <div className="mt-2"><StockBadge p={p} t={t} /></div>
            </div>
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="lcard overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {['#', t('products.name'), 'SKU', t('products.category'), t('products.price'),
                    t('products.qtySold'), t('common.status'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold tracking-wide"
                        style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.product_id ?? p.id ?? i}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[180px] truncate" style={{ color: 'var(--text-primary)' }}>
                      {p.product_name ?? p.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{p.sku}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{p.category}</td>
                    <td className="px-4 py-3 font-mono text-sm text-right" style={{ color: 'var(--text-primary)' }}>
                      {(p.unit_price ?? p.price ?? 0).toLocaleString('vi-VN')}₫
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {(p.total_qty_sold ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3"><StockBadge p={p} t={t} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelected(p)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                style={{ color: 'var(--primary-500)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span className="icon text-base">visibility</span>
                        </button>
                        {canEdit && (
                          <button className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                  style={{ color: 'var(--text-secondary)' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span className="icon text-base">edit</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-5 py-3"
                 style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
                <span className="icon text-base">chevron_left</span>
              </button>
              <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
                {t('common.pageInfo', { page, total: totalPages })}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
                <span className="icon text-base">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.6)' }}
             onClick={() => setSelected(null)}>
          <div className="lcard w-full max-w-md p-6 space-y-5 scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{t('products.detail')}</h2>
              <button onClick={() => setSelected(null)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span className="icon">close</span>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              {[
                [t('products.name'),      selected.product_name ?? selected.name],
                ['SKU',                   selected.sku],
                [t('products.category'),  selected.category],
                [t('products.brand'),     selected.brand ?? '—'],
                [t('products.price'),     `${(selected.unit_price ?? selected.price ?? 0).toLocaleString('vi-VN')}₫`],
                [t('products.costPrice'), `${(selected.cost_price ?? 0).toLocaleString('vi-VN')}₫`],
                [t('products.qtySold'),   (selected.total_qty_sold ?? 0).toLocaleString()],
                [t('products.orders'),    (selected.total_orders ?? 0).toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                  <span className="font-medium text-right text-sm" style={{ color: 'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
