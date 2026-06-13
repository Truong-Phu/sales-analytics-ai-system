import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { useAuth } from '../../hooks/useAuth'
import DetailDrawer from '../../components/ui/DetailDrawer'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { exportToCsv } from '../../utils/format'
import { useDebounce } from '../../hooks/useDebounce'

function SupplierModal({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(supplier ?? {
    supplierCode: '', supplierName: '', contactName: '',
    phone: '', email: '', address: '', taxCode: '', note: '',
  })
  const [allProducts,   setAllProducts]   = useState([])
  // Map: productId → importPrice (chỉ sản phẩm được chọn mới có entry)
  const [selectedProds, setSelectedProds] = useState(new Map())
  const [prodSearch,    setProdSearch]    = useState('')
  const [loading,       setLoading]       = useState(false)
  const [err,           setErr]           = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const supplierId = supplier?.supplierId

  useEffect(() => {
    api.get('/api/products/oltp', { params: { pageSize: 200, isActive: true } })
       .then(r => setAllProducts(r.data.data ?? [])).catch(() => {})

    if (supplierId) {
      api.get(`/api/suppliers/${supplierId}/products`)
         .then(r => {
           const m = new Map()
           ;(r.data ?? []).forEach(p => m.set(p.productId, p.importPrice ?? 0))
           setSelectedProds(m)
         })
         .catch(() => {})
    }
  }, [supplierId])

  const filteredProducts = allProducts.filter(p =>
    p.productName.toLowerCase().includes(prodSearch.toLowerCase())
  )

  const toggleProduct = (pid) => setSelectedProds(prev => {
    const next = new Map(prev)
    if (next.has(pid)) { next.delete(pid) } else { next.set(pid, 0) }
    return next
  })

  const setPrice = (pid, val) => setSelectedProds(prev => {
    const next = new Map(prev)
    next.set(pid, Number(val) || 0)
    return next
  })

  const save = async () => {
    if (!form.supplierName?.trim()) { setErr('Tên nhà cung cấp không được để trống.'); return }
    setLoading(true); setErr('')
    try {
      const products = [...selectedProds.entries()].map(([productId, importPrice]) => ({ productId, importPrice }))
      const payload = {
        supplierCode: form.supplierCode || null,
        supplierName: form.supplierName,
        contactName:  form.contactName  || null,
        phone:        form.phone        || null,
        email:        form.email        || null,
        address:      form.address      || null,
        taxCode:      form.taxCode      || null,
        note:         form.note         || null,
        products,
      }
      if (supplier?.supplierId) {
        await api.put(`/api/suppliers/${supplier.supplierId}`, payload)
      } else {
        await api.post('/api/suppliers', payload)
      }
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi lưu nhà cung cấp.')
    } finally { setLoading(false) }
  }

  const selectedCount = selectedProds.size

  const drawerFooter = (
    <>
      <button onClick={onClose} className="lbtn lbtn-secondary flex-1 justify-center">Hủy</button>
      <button onClick={save} disabled={loading} className="lbtn lbtn-primary flex-1 justify-center">
        {loading ? 'Đang lưu...' : 'Lưu'}
      </button>
    </>
  )

  return (
    <DetailDrawer
      open={true}
      onClose={onClose}
      title={supplier?.supplierId ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
      subtitle={supplier?.supplierCode ? `Mã: ${supplier.supplierCode}` : undefined}
      width={600}
      footer={drawerFooter}
    >
      <div className="p-5 space-y-4">
        {err && (
          <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
            {err}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            ['Mã NCC',         'supplierCode'],
            ['Tên NCC *',      'supplierName'],
            ['Người liên hệ',  'contactName'],
            ['Điện thoại',     'phone'],
            ['Email',          'email'],
            ['Mã số thuế',     'taxCode'],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
              <input
                value={form[key] ?? ''}
                onChange={e => set(key, e.target.value)}
                className="linput text-sm"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Địa chỉ</label>
          <textarea rows={2} value={form.address ?? ''}
            onChange={e => set('address', e.target.value)}
            className="linput text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Ghi chú</label>
          <textarea rows={2} value={form.note ?? ''}
            onChange={e => set('note', e.target.value)}
            className="linput text-sm resize-none"
          />
        </div>

        {/* Sản phẩm NCC cung cấp + Giá nhập */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Sản phẩm cung cấp
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>
                  {selectedCount > 0 ? `Đã chọn ${selectedCount} SP` : 'Chưa chọn'}
                </span>
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Chọn sản phẩm và nhập giá nhập từ nhà cung cấp
              </p>
            </div>
            {selectedCount > 0 && (
              <button onClick={() => setSelectedProds(new Map())}
                className="text-xs shrink-0" style={{ color: '#EF4444' }}>Bỏ chọn tất cả</button>
            )}
          </div>
          <input
            value={prodSearch} onChange={e => setProdSearch(e.target.value)}
            placeholder="Tìm sản phẩm..."
            className="linput text-sm mb-2"
          />

          <div className="rounded-lg border overflow-y-auto" style={{
            borderColor: 'var(--border)', maxHeight: '300px', background: 'var(--bg-elevated)'
          }}>
            <div className="grid grid-cols-[auto_1fr_160px] gap-2 px-3 py-2 text-[11px] font-medium sticky top-0"
                 style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
              <span />
              <span>Sản phẩm</span>
              <span className="text-right">Giá nhập NCC (đ)</span>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="text-xs py-3 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Không tìm thấy sản phẩm
              </div>
            ) : filteredProducts.map(p => {
              const isChecked    = selectedProds.has(p.productId)
              const importPrice  = selectedProds.get(p.productId) ?? 0

              return (
                <div key={p.productId}
                     style={{
                       borderBottom: '1px solid var(--border)',
                       background: isChecked ? 'rgba(59,130,246,0.04)' : 'transparent'
                     }}>
                  <div className="grid grid-cols-[auto_1fr_160px] gap-2 items-center px-3 py-2">
                    <input type="checkbox" checked={isChecked} onChange={() => toggleProduct(p.productId)}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer" />
                    <div>
                      <span className="text-sm cursor-pointer" onClick={() => toggleProduct(p.productId)}
                            style={{ color: 'var(--text-primary)' }}>
                        {p.productName}
                        {p.sku && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{p.sku}</span>}
                      </span>
                    </div>
                    <input
                      type="number" min="0" step="1000"
                      value={isChecked ? importPrice : ''}
                      disabled={!isChecked}
                      onChange={e => setPrice(p.productId, e.target.value)}
                      placeholder={isChecked ? '0' : '—'}
                      className="w-full text-xs rounded border px-2 py-1 text-right disabled:opacity-40"
                      style={{
                        background: 'var(--bg-card)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </DetailDrawer>
  )
}

export default function SuppliersManagementPage() {
  const { t } = useTranslation()
  const { user }                    = useAuth()
  const canEdit                     = ['Owner', 'Manager'].includes(user?.role)
  const [rows,         setRows]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [totalPages,   setTotalPages]   = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState('') // '' | 'true' | 'false'
  const [modal,        setModal]        = useState(null) // null | 'create' | {supplier}
  const [checkedIds,   setCheckedIds]   = useState(new Set())
  const [confirmDlg, setConfirmDlg] = useState(null)

  const debouncedSearch = useDebounce(search, 350)

  const PAGE_SIZE = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, pageSize: PAGE_SIZE }
      if (debouncedSearch) params.search = debouncedSearch
      if (activeFilter !== '') params.active = activeFilter
      const res = await api.get('/api/suppliers', { params })
      const d = res.data
      setRows(d.items ?? [])
      setTotal(d.total ?? 0)
      setTotalPages(d.totalPages ?? 1)
      setPage(p)
    } catch {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setPage(1)
    } finally { setLoading(false) }
  }, [debouncedSearch, activeFilter])

  useEffect(() => { load(1) }, [load])

  const softDelete = (id) => {
    setConfirmDlg({ title: 'Tắt nhà cung cấp', msg: 'Tắt hoạt động nhà cung cấp này?', action: async () => {
      try {
        await api.delete(`/api/suppliers/${id}`)
        load(page)
      } catch (e) {
        setConfirmDlg(prev => prev ? { ...prev, errMsg: e?.response?.data?.message ?? 'Lỗi khi xóa.' } : null)
      }
    }})
  }

  // ── Bulk select ───────────────────────────────────────────────────────────────
  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const toggleAll = () => {
    const allChecked = rows.length > 0 && rows.every(r => checkedIds.has(r.supplierId))
    setCheckedIds(allChecked ? new Set() : new Set(rows.map(r => r.supplierId)))
  }
  const handleBulkDeactivate = () => {
    setConfirmDlg({ title: 'Tắt hàng loạt', msg: `Tắt ${checkedIds.size} nhà cung cấp đã chọn?`, action: async () => {
      try {
        await Promise.all([...checkedIds].map(id => api.delete(`/api/suppliers/${id}`)))
        setCheckedIds(new Set())
        load(page)
      } catch { /* ignore */ }
    }})
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    exportToCsv(`nha_cung_cap_${new Date().toISOString().slice(0, 10)}.csv`, rows.map(s => ({
      'Mã NCC':       s.supplierCode ?? '',
      'Tên NCC':      s.supplierName ?? '',
      'Người liên hệ': s.contactName ?? '',
      'SĐT':          s.phone ?? '',
      'Email':        s.email ?? '',
      'Địa chỉ':      s.address ?? '',
      'Trạng thái':   s.isActive ? 'Hoạt động' : 'Ngừng',
    })))
  }

  return (
    <>
    <ConfirmDialog
      open={!!confirmDlg}
      title={confirmDlg?.title ?? 'Xác nhận'}
      message={confirmDlg?.msg}
      icon="delete_forever"
      danger
      onClose={() => setConfirmDlg(null)}
      onConfirm={() => { const a = confirmDlg?.action; setConfirmDlg(null); a?.() }}
    />
    <div className="p-4 md:p-6 space-y-4">
      {modal && (
        <SupplierModal
          supplier={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(page) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{t('supplierMgmt.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('supplierMgmt.subtitle', { count: total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="px-3 py-2 rounded-lg text-sm border flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title={t('common.export_csv')}>
            <span className="icon text-base">download</span>
            <span className="hidden sm:inline">{t('common.export_csv')}</span>
          </button>
          {canEdit && (
            <button onClick={() => setModal('create')}
              className="px-4 py-2 rounded-lg text-sm text-white font-medium"
              style={{ background: 'var(--primary-500)' }}>
              {t('supplierMgmt.addBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Tìm theo tên, SĐT, email..."
            className="linput !pl-9 text-sm"
          />
        </div>
        <select
          value={activeFilter}
          onChange={e => { setActiveFilter(e.target.value); setPage(1) }}
          className="linput text-sm"
          style={{ width: 160 }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="true">Đang hoạt động</option>
          <option value="false">Ngừng hoạt động</option>
        </select>
        {(search || activeFilter) && (
          <button
            onClick={() => { setSearch(''); setActiveFilter(''); setPage(1) }}
            className="lbtn lbtn-secondary !h-9">
            <span className="icon text-base">refresh</span>
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
             style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <span className="font-medium" style={{ color: 'var(--primary-600)' }}>
            Đã chọn {checkedIds.size} nhà cung cấp
          </span>
          <div className="flex gap-2 ml-auto">
            {canEdit && (
              <button onClick={handleBulkDeactivate}
                      className="lbtn !h-8 !px-3 text-xs font-medium"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                <span className="icon text-sm">block</span>
                Tắt {checkedIds.size} NCC
              </button>
            )}
            <button onClick={() => setCheckedIds(new Set())}
                    className="lbtn lbtn-secondary !h-8 !px-3 text-xs">
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
                 style={{ borderColor: 'var(--primary-500)', borderTopColor: 'transparent' }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Không có nhà cung cấp nào
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox"
                         checked={rows.length > 0 && rows.every(r => checkedIds.has(r.supplierId))}
                         onChange={toggleAll}
                         onClick={e => e.stopPropagation()}
                         className="w-4 h-4 cursor-pointer" />
                </th>
                {['Mã NCC', 'Tên NCC', 'Người liên hệ', 'SĐT', 'Email', 'Trạng thái', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.supplierId}
                    style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                             background: checkedIds.has(s.supplierId) ? 'rgba(99,102,241,0.04)' : undefined }}>
                  <td className="px-4 py-3 w-10" onClick={e => toggleCheck(s.supplierId, e)}>
                    <input type="checkbox" checked={checkedIds.has(s.supplierId)} onChange={() => {}}
                           className="w-4 h-4 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {s.supplierCode ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {s.supplierName}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {s.contactName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {s.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {s.email ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: s.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                            color:      s.isActive ? '#22C55E' : '#64748B',
                          }}>
                      {s.isActive ? 'Hoạt động' : 'Ngừng'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setModal(s)}
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                        {canEdit ? 'Sửa' : 'Xem'}
                      </button>
                      {canEdit && s.isActive && (
                        <button onClick={() => softDelete(s.supplierId)}
                          className="text-xs px-2 py-1 rounded border"
                          style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444' }}>
                          Tắt
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>Trang {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => load(page - 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>← Trước</button>
            <button disabled={page >= totalPages} onClick={() => load(page + 1)}
              className="px-3 py-1 rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Tiếp →</button>
          </div>
        </div>
      )}
    </div>
    </>
  )
}
