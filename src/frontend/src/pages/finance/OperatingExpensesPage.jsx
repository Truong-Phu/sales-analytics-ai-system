import { useState, useEffect, useCallback } from 'react'
import { getExpenses, getExpensesSummary, createExpense, updateExpense, deleteExpense } from '../../api/financeApi'
import { useAuth } from '../../hooks/useAuth'

const EXPENSE_TYPES = ['Salary', 'Warehouse', 'Utilities', 'Internet', 'Office', 'Other']
const TYPE_LABELS = {
  Salary:    'Lương nhân viên',
  Warehouse: 'Kho bãi',
  Utilities: 'Điện, nước, gas',
  Internet:  'Internet & Viễn thông',
  Office:    'Văn phòng phẩm',
  Other:     'Khác',
}
const TYPE_ICONS = {
  Salary:    'people',
  Warehouse: 'warehouse',
  Utilities: 'bolt',
  Internet:  'wifi',
  Office:    'business_center',
  Other:     'more_horiz',
}
const TYPE_COLORS = {
  Salary:    '#6366F1',
  Warehouse: '#F59E0B',
  Utilities: '#10B981',
  Internet:  '#3B82F6',
  Office:    '#8B5CF6',
  Other:     '#94A3B8',
}

function fmtM(v) {
  if (v == null || v === 0) return '0'
  const n = Number(v)
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + ' tr'
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'K'
  return n.toLocaleString('vi-VN')
}

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// Form thêm / sửa chi phí
function ExpenseForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ?? {
    expenseType: 'Salary',
    amount:      '',
    expenseDate: today(),
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    const amount = parseFloat(String(form.amount).replace(/[^0-9.]/g, ''))
    if (!amount || amount <= 0) { setErr('Vui lòng nhập số tiền hợp lệ'); return }
    if (!form.expenseDate)      { setErr('Vui lòng chọn ngày'); return }
    setSaving(true); setErr('')
    try {
      await onSave({ ...form, amount })
    } catch (ex) {
      setErr(ex?.response?.data?.error ?? 'Lưu thất bại')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Loại chi phí */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Loại chi phí *
          </label>
          <select value={form.expenseType} onChange={e => f('expenseType', e.target.value)}
                  className="linput text-sm w-full">
            {EXPENSE_TYPES.map(t => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        {/* Ngày */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Ngày *
          </label>
          <input type="date" value={form.expenseDate} max={today()}
                 onChange={e => f('expenseDate', e.target.value)}
                 className="linput text-sm w-full" />
        </div>
        {/* Số tiền */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Số tiền (₫) *
          </label>
          <input type="number" min="0" step="100000" value={form.amount}
                 onChange={e => f('amount', e.target.value)}
                 placeholder="VD: 5000000"
                 className="linput text-sm w-full" style={{ fontFamily: 'monospace' }} />
        </div>
        {/* Mô tả */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
            Mô tả
          </label>
          <input type="text" value={form.description}
                 onChange={e => f('description', e.target.value)}
                 placeholder="VD: Lương tháng 5/2026"
                 className="linput text-sm w-full" />
        </div>
      </div>

      {err && (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {err}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving} className="lbtn lbtn-primary text-sm">
          {saving ? 'Đang lưu...' : initial ? 'Cập nhật' : 'Thêm chi phí'}
        </button>
        <button type="button" onClick={onCancel} className="lbtn lbtn-secondary text-sm">
          Huỷ
        </button>
      </div>
    </form>
  )
}

export default function OperatingExpensesPage() {
  const { user } = useAuth()
  const isOwner  = user?.role === 'Owner'

  const [from, setFrom]       = useState(firstOfMonth())
  const [to,   setTo]         = useState(today())
  const [filter, setFilter]   = useState('all')

  const [items,   setItems]   = useState([])
  const [summary, setSummary] = useState(null)
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  const [showForm, setShowForm]   = useState(false)
  const [editing,  setEditing]    = useState(null) // expense object being edited
  const [deleting, setDeleting]   = useState(null) // id being deleted

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const params = { from, to }
      if (filter !== 'all') params.type = filter
      const [list, summ] = await Promise.all([
        getExpenses(params),
        getExpensesSummary({ from, to }),
      ])
      setItems(list.data ?? [])
      setTotal(list.total ?? 0)
      setSummary(summ)
    } catch (ex) {
      const msg = ex?.response?.data?.error ?? ex?.message ?? ''
      if (msg.includes('relation "public.expenses" does not exist') || msg.includes('42P01')) {
        setErr('MIGRATION CẦN CHẠY: Bảng public.expenses chưa tồn tại trong database. Chạy SQL migration CT-070 trước.')
      } else {
        setErr('Không tải được dữ liệu chi phí. Kiểm tra kết nối backend.')
      }
      setItems([]); setSummary(null)
    } finally { setLoading(false) }
  }, [from, to, filter])

  useEffect(() => { load() }, [load])

  async function handleSave(dto) {
    if (editing) {
      await updateExpense(editing.expenseId, dto)
    } else {
      await createExpense(dto)
    }
    setShowForm(false); setEditing(null)
    await load()
  }

  async function handleDelete(id) {
    try {
      await deleteExpense(id)
      setDeleting(null)
      await load()
    } catch {
      alert('Xoá thất bại')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Chi phí vận hành
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Lương · Kho bãi · Điện nước · Internet · Văn phòng · Khác
            <span className="ml-2 opacity-60">— Không gồm chi phí quảng cáo QC</span>
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null) }}
                className="lbtn lbtn-primary text-sm">
          <span className="icon icon-sm">add</span>
          Thêm chi phí
        </button>
      </div>

      {/* Form thêm/sửa */}
      {(showForm || editing) && (
        <div className="lcard p-5">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            {editing ? 'Sửa chi phí' : 'Thêm chi phí mới'}
          </h2>
          <ExpenseForm
            initial={editing ? {
              expenseType: editing.expenseType,
              amount:      editing.amount,
              expenseDate: editing.expenseDate,
              description: editing.description ?? '',
            } : null}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null) }}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <input type="date" value={from} max={to}
                 onChange={e => setFrom(e.target.value)} className="linput text-sm" style={{ width: 140 }} />
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          <input type="date" value={to} min={from} max={today()}
                 onChange={e => setTo(e.target.value)} className="linput text-sm" style={{ width: 140 }} />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="linput text-sm" style={{ width: 160 }}>
          <option value="all">Tất cả loại</option>
          {EXPENSE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <button onClick={load} className="lbtn lbtn-secondary text-sm !h-9">
          <span className="icon icon-sm">refresh</span>
        </button>
      </div>

      {/* Error state */}
      {err && (
        <div className="lcard p-4 flex items-start gap-3"
             style={{ borderColor: '#F59E0B', background: 'rgba(245,158,11,0.06)' }}>
          <span className="icon text-base shrink-0" style={{ color: '#F59E0B' }}>warning</span>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{err}</p>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {EXPENSE_TYPES.map(t => {
            const amt = summary.byType?.[t] ?? 0
            return (
              <div key={t} className="lcard px-3 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="icon text-base" style={{ color: TYPE_COLORS[t], fontSize: 16 }}>
                    {TYPE_ICONS[t]}
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {TYPE_LABELS[t]}
                  </span>
                </div>
                <div className="text-xl font-bold font-mono" style={{ color: amt > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {fmtM(amt)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total */}
      {summary && (
        <div className="lcard px-4 py-3 flex items-center justify-between"
             style={{ borderColor: 'rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.04)' }}>
          <div className="flex items-center gap-2">
            <span className="icon text-base" style={{ color: '#8B5CF6' }}>account_balance</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Tổng chi phí vận hành kỳ này
            </span>
          </div>
          <span className="text-xl font-bold font-mono" style={{ color: '#8B5CF6' }}>
            ₫{Number(summary.total ?? 0).toLocaleString('vi-VN')}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="lcard overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {loading ? 'Đang tải...' : `${total} chi phí`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg-elevated)', borderBottom: '2px solid var(--border)' }}>
              <tr>
                {['Ngày','Loại','Mô tả','Số tiền',''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold"
                      style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  Đang tải...
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center">
                  <div style={{ color: 'var(--text-tertiary)' }}>
                    <span className="icon text-4xl block mb-2">receipt_long</span>
                    <p className="text-sm">Chưa có chi phí vận hành trong kỳ này</p>
                    <p className="text-xs mt-1">Nhấn "Thêm chi phí" để bắt đầu ghi nhận</p>
                  </div>
                </td></tr>
              ) : items.map(item => (
                <tr key={item.expenseId}
                    style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[--bg-elevated] transition-colors">
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {item.expenseDate}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="icon text-sm" style={{ color: TYPE_COLORS[item.expenseType] }}>
                        {TYPE_ICONS[item.expenseType]}
                      </span>
                      <span className="text-xs font-medium" style={{ color: TYPE_COLORS[item.expenseType] }}>
                        {TYPE_LABELS[item.expenseType] ?? item.expenseType}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 max-w-[200px] truncate" style={{ color: 'var(--text-secondary)' }}
                      title={item.description}>
                    {item.description || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-right" style={{ color: 'var(--text-primary)' }}>
                    ₫{Number(item.amount).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => { setEditing(item); setShowForm(false) }}
                              className="lbtn lbtn-ghost !h-7 !px-2 text-xs">
                        <span className="icon icon-sm">edit</span>
                      </button>
                      {isOwner && (
                        deleting === item.expenseId ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleDelete(item.expenseId)}
                                    className="lbtn !h-7 !px-2 text-xs"
                                    style={{ background: '#EF4444', color: '#fff' }}>
                              Xoá
                            </button>
                            <button onClick={() => setDeleting(null)}
                                    className="lbtn lbtn-ghost !h-7 !px-2 text-xs">
                              Huỷ
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleting(item.expenseId)}
                                  className="lbtn lbtn-ghost !h-7 !px-2 text-xs"
                                  style={{ color: '#EF4444' }}>
                            <span className="icon icon-sm">delete</span>
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note */}
      <div className="lcard p-4 flex items-start gap-3"
           style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.15)' }}>
        <span className="icon text-base shrink-0" style={{ color: 'var(--primary-500)' }}>info</span>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong>Chi phí vận hành</strong> là chi phí doanh nghiệp không gắn trực tiếp với đơn hàng
          (lương, kho bãi, điện nước...). Được dùng trong báo cáo P&amp;L để tính{' '}
          <strong>Business Net Profit = Lợi nhuận vận hành − Chi phí vận hành</strong>.
          Chi phí quảng cáo QC được quản lý riêng tại <a href="/finance/ad-spend"
            className="underline" style={{ color: 'var(--primary-500)' }}>Chi phí quảng cáo</a>.
        </div>
      </div>
    </div>
  )
}
