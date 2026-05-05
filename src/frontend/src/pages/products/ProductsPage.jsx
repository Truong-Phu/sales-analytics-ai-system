import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getProducts, getOltpProduct, createProduct, updateProduct, deleteProduct, getCategories, uploadProductImage } from '../../api/dashboardApi'
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

const EMPTY_FORM = { sku: '', productName: '', description: '', basePrice: '', costPrice: '', stockQuantity: 0, categoryId: '' }

// Modal tạo / sửa sản phẩm
function ProductFormModal({ initial, mode, onClose, onSaved }) {
  const [form,       setForm]       = useState(initial ?? EMPTY_FORM)
  const [categories, setCategories] = useState([])
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')
  const [imgFile,    setImgFile]    = useState(null)
  const [imgPreview, setImgPreview] = useState(initial?.imageUrl ?? null)
  const fileRef = useRef(null)
  const isEdit  = mode === 'edit'

  // Load danh mục từ API
  useEffect(() => {
    getCategories()
      .then(data => setCategories(data))
      .catch(() => setCategories([]))
  }, [])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleImgSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!form.sku || !form.productName || !form.basePrice || !form.categoryId) {
      setErr('Vui lòng nhập đầy đủ SKU, Tên sản phẩm, Giá bán và Danh mục')
      return
    }
    setSaving(true); setErr('')
    try {
      const dto = {
        sku:           form.sku,
        productName:   form.productName,
        description:   form.description || null,
        basePrice:     Number(form.basePrice),
        costPrice:     form.costPrice ? Number(form.costPrice) : null,
        stockQuantity: Number(form.stockQuantity) || 0,
        categoryId:    Number(form.categoryId),
      }
      let savedId = form.productId
      if (isEdit) {
        await updateProduct(savedId, dto)
      } else {
        const res = await createProduct(dto)
        savedId = res.productId
      }
      // Upload ảnh nếu có chọn
      if (imgFile && savedId) {
        await uploadProductImage(savedId, imgFile)
      }
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.message ?? (isEdit ? 'Lỗi cập nhật' : 'Lỗi tạo sản phẩm'))
    } finally {
      setSaving(false)
    }
  }

  const inp = (label, field, type = 'text', required = false) => (
    <div key={field}>
      <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      <input type={type} className="linput text-sm" value={form[field] ?? ''}
             onChange={set(field)} />
    </div>
  )

  // Nhóm danh mục theo cấp để hiển thị đẹp hơn trong dropdown
  const catOptions = categories.map(c => ({
    value: c.categoryId,
    label: c.level > 1 ? `  └ ${c.categoryName}` : c.categoryName,
  }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="lcard w-full max-w-lg p-6 space-y-4 scale-in overflow-y-auto max-h-[90vh]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
            {isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span className="icon">close</span>
          </button>
        </div>

        {err && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</p>}

        {/* Hình ảnh sản phẩm */}
        <div>
          <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>Hình ảnh sản phẩm</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden shrink-0"
                 style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              {imgPreview
                ? <img src={imgPreview} alt="preview" className="w-full h-full object-cover" />
                : <span className="icon" style={{ fontSize: 24, color: 'var(--text-tertiary)' }}>image</span>
              }
            </div>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()}
                      className="lbtn lbtn-secondary !h-8 text-xs">
                <span className="icon text-sm">upload</span>
                Chọn ảnh
              </button>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>PNG/JPG/WEBP · Tối đa 5MB</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                 onChange={handleImgSelect} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {inp('SKU', 'sku', 'text', true)}
          {inp('Tên sản phẩm', 'productName', 'text', true)}
          {inp('Giá bán (₫)', 'basePrice', 'number', true)}
          {inp('Giá vốn (₫)', 'costPrice', 'number')}
          {inp('Tồn kho', 'stockQuantity', 'number')}

          {/* Dropdown danh mục */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Danh mục<span style={{ color: '#EF4444' }}> *</span>
            </label>
            <select className="linput text-sm"
                    value={form.categoryId ?? ''}
                    onChange={set('categoryId')}>
              <option value="">-- Chọn danh mục --</option>
              {catOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Mô tả</label>
          <textarea className="linput text-sm" rows={2} value={form.description ?? ''}
                    onChange={set('description')} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="lbtn lbtn-secondary flex-1 justify-center">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="lbtn lbtn-primary flex-1 justify-center">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
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
  const [formMode, setFormMode] = useState(null)    // 'create' | 'edit'
  const [formInit, setFormInit] = useState(null)    // dữ liệu ban đầu cho form edit
  const [toast,    setToast]    = useState('')

  const canEdit = ['Manager', 'DataIT', 'Admin'].includes(user?.role)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

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

  const openCreate = () => { setFormInit(null); setFormMode('create') }

  const openEdit = async (p) => {
    try {
      // Lấy dữ liệu OLTP để có CategoryId, StockQuantity...
      const oltp = await getOltpProduct(p.product_id ?? p.productId)
      setFormInit({
        productId:     oltp.productId,
        sku:           oltp.sku,
        productName:   oltp.productName,
        description:   oltp.description ?? '',
        basePrice:     oltp.basePrice,
        costPrice:     oltp.costPrice ?? '',
        stockQuantity: oltp.stockQuantity,
        categoryId:    oltp.categoryId,
      })
      setFormMode('edit')
    } catch {
      showToast('Không tải được thông tin sản phẩm OLTP')
    }
  }

  const handleDelete = async (p, e) => {
    e.stopPropagation()
    if (!window.confirm(`Xóa sản phẩm "${p.product_name ?? p.name}"?`)) return
    try {
      await deleteProduct(p.product_id ?? p.productId)
      showToast('Đã xóa sản phẩm')
      fetchData()
    } catch (err) {
      showToast(err.response?.data?.message ?? 'Lỗi xóa sản phẩm')
    }
  }

  useEffect(() => { fetchData() }, [fetchData])

  const items      = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
             style={{ background: 'var(--primary-500)', color: 'white' }}>
          {toast}
        </div>
      )}

      {formMode && (
        <ProductFormModal
          mode={formMode}
          initial={formInit}
          onClose={() => setFormMode(null)}
          onSaved={() => { setFormMode(null); showToast(formMode === 'create' ? 'Đã thêm sản phẩm' : 'Đã cập nhật sản phẩm'); fetchData() }}
        />
      )}

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
            <button className="lbtn lbtn-primary !h-9" onClick={openCreate}>
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
                        {canEdit && !isMock && (
                          <>
                            <button onClick={() => openEdit(p)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                    title="Sửa sản phẩm"
                                    style={{ color: 'var(--text-secondary)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span className="icon text-base">edit</span>
                            </button>
                            <button onClick={e => handleDelete(p, e)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                    title="Xóa sản phẩm"
                                    style={{ color: '#EF4444' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span className="icon text-base">delete</span>
                            </button>
                          </>
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
