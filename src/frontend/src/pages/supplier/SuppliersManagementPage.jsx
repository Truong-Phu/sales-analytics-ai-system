import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import MockToast from '../../components/ui/MockToast'

const MOCK_SUPPLIERS = [
  { supplierId: 1, supplierCode: 'NCC-001', supplierName: 'Cong ty TNHH Nguyen Thanh', contactName: 'Nguyen Van A', phone: '0901234567', email: 'contact@nguyenthanh.vn', isActive: true },
  { supplierId: 2, supplierCode: 'NCC-002', supplierName: 'Cong ty CP Det May Mien Nam', contactName: 'Tran Thi B', phone: '0912345678', email: 'sales@detmaymn.com', isActive: true },
]

function SupplierModal({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(supplier ?? {
    supplierCode: '', supplierName: '', contactName: '',
    phone: '', email: '', address: '', taxCode: '', note: '',
  })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.supplierName?.trim()) { setErr('Tên nhà cung cấp không được để trống.'); return }
    setLoading(true); setErr('')
    try {
      const payload = {
        supplierCode: form.supplierCode || null,
        supplierName: form.supplierName,
        contactName:  form.contactName  || null,
        phone:        form.phone        || null,
        email:        form.email        || null,
        address:      form.address      || null,
        taxCode:      form.taxCode      || null,
        note:         form.note         || null,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-xl shadow-xl p-6 space-y-4"
           style={{ background: 'var(--bg-card)' }}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {supplier?.supplierId ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
        </h2>

        {err && (
          <div className="text-sm px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
            {err}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            ['Mã NCC',         'supplierCode',  false],
            ['Tên NCC *',      'supplierName',  false],
            ['Người liên hệ',  'contactName',   false],
            ['Điện thoại',     'phone',         false],
            ['Email',          'email',         false],
            ['Mã số thuế',     'taxCode',       false],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
              <input
                value={form[key] ?? ''}
                onChange={e => set(key, e.target.value)}
                className="w-full text-sm rounded-lg border px-3 py-1.5"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Địa chỉ</label>
          <textarea rows={2} value={form.address ?? ''}
            onChange={e => set('address', e.target.value)}
            className="w-full text-sm rounded-lg border px-3 py-1.5 resize-none"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Ghi chú</label>
          <textarea rows={2} value={form.note ?? ''}
            onChange={e => set('note', e.target.value)}
            className="w-full text-sm rounded-lg border px-3 py-1.5 resize-none"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Hủy
          </button>
          <button onClick={save} disabled={loading}
            className="px-4 py-1.5 rounded-lg text-sm text-white font-medium disabled:opacity-60"
            style={{ background: 'var(--primary-500)' }}>
            {loading ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SuppliersManagementPage() {
  const [rows,       setRows]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(true)
  const [isMock,     setIsMock]     = useState(false)
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(null) // null | 'create' | {supplier}

  const PAGE_SIZE = 20

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await api.get('/api/suppliers', { params: { page: p, pageSize: PAGE_SIZE, search: search || undefined } })
      const d = res.data
      setRows(d.items ?? [])
      setTotal(d.total ?? 0)
      setTotalPages(d.totalPages ?? 1)
      setPage(p)
      setIsMock(false)
    } catch {
      setRows(MOCK_SUPPLIERS)
      setTotal(MOCK_SUPPLIERS.length)
      setTotalPages(1)
      setPage(1)
      setIsMock(true)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { load(1) }, [load])

  const softDelete = async (id) => {
    if (!window.confirm('Tắt hoạt động nhà cung cấp này?')) return
    try {
      await api.delete(`/api/suppliers/${id}`)
      load(page)
    } catch (e) {
      alert(e?.response?.data?.message ?? 'Lỗi khi xóa.')
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {isMock && <MockToast />}
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
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Nhà cung cấp</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Quản lý danh sách nhà cung cấp ({total})
          </p>
        </div>
        <button onClick={() => setModal('create')}
          className="px-4 py-2 rounded-lg text-sm text-white font-medium"
          style={{ background: 'var(--primary-500)' }}>
          + Thêm NCC
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1)}
          placeholder="Tìm theo tên, SĐT, email..."
          className="text-sm rounded-lg border px-3 py-1.5 w-72"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <button onClick={() => load(1)}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--primary-500)' }}>
          Tìm
        </button>
      </div>

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
                {['Mã NCC', 'Tên NCC', 'Người liên hệ', 'SĐT', 'Email', 'Trạng thái', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.supplierId}
                    style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
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
                        Sửa
                      </button>
                      {s.isActive && (
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
  )
}
