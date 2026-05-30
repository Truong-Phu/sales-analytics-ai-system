import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getUsers, deactivate, activate, getAuditLogs,
  createUser, updateUser, deleteUser,
} from '../../api/adminApi'
import { useAuth } from '../../hooks/useAuth'
import api from '../../api/axios'

const ROLE_CREATEABLE = ['Manager', 'Staff_Sales', 'Staff_Warehouse', 'Staff_Marketing', 'DataIT', 'Viewer']
const ROLE_LABEL = {
  Owner:           'Chủ doanh nghiệp',
  Manager:         'Quản lý',
  Staff_Sales:     'NV Bán hàng',
  Staff_Warehouse: 'NV Kho',
  Staff_Marketing: 'NV Marketing',
  DataIT:          'Data/IT',
  Viewer:          'Xem',
  Staff:           'Nhân viên (cũ)',
}
const ROLE_COLOR = {
  Owner:           { bg: 'rgba(139,92,246,0.10)', color: '#7C3AED', border: 'rgba(139,92,246,0.30)' },
  Manager:         { bg: 'rgba(59,130,246,0.10)',  color: '#3B82F6', border: 'rgba(59,130,246,0.30)' },
  Staff_Sales:     { bg: 'rgba(16,185,129,0.10)',  color: '#10B981', border: 'rgba(16,185,129,0.30)' },
  Staff_Warehouse: { bg: 'rgba(245,158,11,0.10)',  color: '#D97706', border: 'rgba(245,158,11,0.30)' },
  Staff_Marketing: { bg: 'rgba(236,72,153,0.10)',  color: '#DB2777', border: 'rgba(236,72,153,0.30)' },
  Staff:           { bg: 'rgba(16,185,129,0.10)',  color: '#10B981', border: 'rgba(16,185,129,0.30)' },
  DataIT:          { bg: 'rgba(99,102,241,0.10)',  color: '#6366F1', border: 'rgba(99,102,241,0.30)' },
  Viewer:          { bg: 'rgba(100,116,139,0.10)', color: '#64748B', border: 'rgba(100,116,139,0.30)' },
}
const STATUS_CFG = {
  active:   { bg: 'rgba(16,185,129,0.10)', color: 'var(--accent-500)', border: 'rgba(16,185,129,0.30)', dot: 'var(--accent-500)', label: 'Hoạt động' },
  inactive: { bg: 'rgba(239,68,68,0.08)',  color: '#EF4444',           border: 'rgba(239,68,68,0.25)',  dot: '#EF4444',           label: 'Vô hiệu'   },
  pending:  { bg: 'rgba(245,158,11,0.10)', color: '#F59E0B',           border: 'rgba(245,158,11,0.30)', dot: '#F59E0B',           label: 'Chờ duyệt' },
}
const AUDIT_STATUS_CFG = {
  SUCCESS:      { bg: 'rgba(16,185,129,0.10)', color: 'var(--accent-500)', border: 'rgba(16,185,129,0.30)' },
  FAILED:       { bg: 'rgba(239,68,68,0.08)',  color: '#EF4444',           border: 'rgba(239,68,68,0.25)'  },
  UNAUTHORIZED: { bg: 'rgba(245,158,11,0.10)', color: '#F59E0B',           border: 'rgba(245,158,11,0.30)' },
}
const ACTION_LABELS = {
  LOGIN: 'Đăng nhập', LOGOUT: 'Đăng xuất', CHANGE_PASSWORD: 'Đổi mật khẩu',
  CREATE_ORDER: 'Tạo đơn hàng', UPDATE_ORDER: 'Cập nhật đơn hàng',
  APPROVE_USER: 'Phê duyệt TK', DEACTIVATE_USER: 'Khóa TK', ACTIVATE_USER: 'Kích hoạt TK',
  CHANGE_ROLE: 'Đổi phân quyền', EXPORT_PDF: 'Xuất PDF',
  TRIGGER_SYNC: 'Kích hoạt Sync', TRIGGER_ETL: 'Kích hoạt ETL',
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const c = ROLE_COLOR[role] ?? ROLE_COLOR.Viewer
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {ROLE_LABEL[role] ?? role}
    </span>
  )
}

function StatusDot({ status }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.inactive
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

function AuditStatusBadge({ status }) {
  const c = AUDIT_STATUS_CFG[status] ?? AUDIT_STATUS_CFG.FAILED
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {status}
    </span>
  )
}

function Spinner({ size = 4 }) {
  return (
    <span className={`w-${size} h-${size} border-2 rounded-full`}
          style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
  )
}

function IconBtn({ icon, title, color, bg, hoverBg, onClick, disabled }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} title={title} disabled={disabled}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
            style={{ color, background: hov ? hoverBg : bg }}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}>
      <span className="icon" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  )
}

// ─── Modal Thêm người dùng ────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }) {
  const { t } = useTranslation()
  const [form, setForm]   = useState({ fullName: '', email: '', tempPassword: '', role: 'Staff_Sales', sendInvite: false })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.fullName.trim() || !form.email.trim() || !form.tempPassword.trim()) {
      setError('Vui lòng điền đầy đủ các trường bắt buộc.')
      return
    }
    if (form.tempPassword.length < 6) {
      setError('Mật khẩu tạm phải có ít nhất 6 ký tự.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createUser({ fullName: form.fullName.trim(), email: form.email.trim(), tempPassword: form.tempPassword, role: form.role, sendInvite: form.sendInvite })
      onCreated()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Tạo người dùng thất bại. Kiểm tra email đã tồn tại chưa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="lcard w-full max-w-md p-6 space-y-5" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Thêm người dùng mới</h2>
          <button onClick={onClose} className="icon text-xl leading-none" style={{ color: 'var(--text-tertiary)' }}>close</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Họ và tên', key: 'fullName', type: 'text',     placeholder: 'Nguyễn Văn A' },
            { label: 'Email',     key: 'email',    type: 'email',    placeholder: 'user@company.com' },
            { label: 'Mật khẩu tạm', key: 'tempPassword', type: 'password', placeholder: 'Tối thiểu 6 ký tự' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {label} <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input type={type} className="linput w-full" placeholder={placeholder}
                     value={form[key]} onChange={set(key)} />
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Vai trò <span style={{ color: '#EF4444' }}>*</span></label>
            <select className="linput w-full" value={form.role} onChange={set('role')}>
              {ROLE_CREATEABLE.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded accent-primary"
                   checked={form.sendInvite} onChange={set('sendInvite')} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Gửi email mời đăng nhập</span>
          </label>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg"
               style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="lbtn lbtn-secondary flex-1" disabled={saving}>Hủy</button>
            <button type="submit" className="lbtn lbtn-primary flex-1" disabled={saving}>
              {saving ? <Spinner size={4} /> : 'Tạo người dùng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal Sửa người dùng ─────────────────────────────────────────────────────
function EditUserModal({ user: u, onClose, onSaved }) {
  const [form, setForm]   = useState({
    fullName: u.fullName ?? '',
    role:     u.role ?? 'Staff_Sales',
    isActive: u.status === 'active' || u.isActive === true,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.fullName.trim()) { setError('Họ tên không được để trống.'); return }
    setSaving(true)
    setError('')
    try {
      await updateUser(u.id, { fullName: form.fullName.trim(), role: form.role, isActive: form.isActive })
      onSaved()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Cập nhật thất bại. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const isOwnerUser = u.role === 'Owner'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="lcard w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Sửa thông tin người dùng</h2>
          <button onClick={onClose} className="icon text-xl leading-none" style={{ color: 'var(--text-tertiary)' }}>close</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Họ và tên <span style={{ color: '#EF4444' }}>*</span></label>
            <input className="linput w-full" value={form.fullName}
                   onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Vai trò</label>
            {isOwnerUser ? (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                Không thể thay đổi vai trò Owner
              </div>
            ) : (
              <select className="linput w-full" value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_CREATEABLE.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            )}
          </div>

          {!isOwnerUser && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 rounded accent-primary"
                     checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tài khoản đang hoạt động</span>
            </label>
          )}

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg"
               style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="lbtn lbtn-secondary flex-1" disabled={saving}>Hủy</button>
            <button type="submit" className="lbtn lbtn-primary flex-1" disabled={saving}>
              {saving ? <Spinner size={4} /> : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── KPI Progress bar ────────────────────────────────────────────────────────
function KpiBar({ actual, target, color = 'var(--primary-500)' }) {
  if (!target) return <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Chưa đặt mục tiêu</span>
  const pct = Math.min(100, Math.round((actual / target) * 100))
  const barColor = pct >= 100 ? '#10B981' : pct >= 70 ? 'var(--primary-500)' : '#F59E0B'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color: barColor }}>{pct}%</span>
    </div>
  )
}

// ─── Set KPI Target Modal ────────────────────────────────────────────────────
function SetTargetModal({ staff, period, onClose, onSaved }) {
  const [year, month] = period.split('-').map(Number)
  const [rev,  setRev]  = useState(String(staff.revTarget ?? ''))
  const [ord,  setOrd]  = useState(String(staff.ordTarget ?? ''))
  const [cust, setCust] = useState(String(staff.custTarget ?? ''))
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      await api.post('/api/admin/staff/kpi/targets', {
        userId:           staff.userId,
        year, month,
        revenueTarget:    rev  ? Number(rev)  : null,
        orderCountTarget: ord  ? Number(ord)  : null,
        newCustomerTarget:cust ? Number(cust) : null,
      })
      onSaved()
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi lưu KPI target')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="lcard w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Đặt KPI — {staff.fullName}
          </h3>
          <button onClick={onClose} className="icon text-xl" style={{ color: 'var(--text-tertiary)' }}>close</button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Tháng {month}/{year}</p>

        {[
          { label: 'Mục tiêu doanh thu (VND)', val: rev,  set: setRev,  placeholder: 'VD: 50000000' },
          { label: 'Mục tiêu số đơn',          val: ord,  set: setOrd,  placeholder: 'VD: 100' },
          { label: 'Mục tiêu KH mới',           val: cust, set: setCust, placeholder: 'VD: 20' },
        ].map(f => (
          <div key={f.label} className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
            <input type="number" value={f.val} onChange={e => f.set(e.target.value)}
                   placeholder={f.placeholder} className="linput !h-9 text-sm" />
          </div>
        ))}

        {err && <p className="text-xs" style={{ color: '#EF4444' }}>{err}</p>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="lbtn lbtn-secondary flex-1">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="lbtn lbtn-primary flex-1">
            {saving ? 'Đang lưu...' : 'Lưu KPI'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── KPI Tab ─────────────────────────────────────────────────────────────────
function KpiTab() {
  const today    = new Date()
  const [period, setPeriod] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}`)
  const [data,   setData]   = useState([])
  const [loading,setLoading]= useState(false)
  const [error,  setError]  = useState(false)
  const [target, setTarget] = useState(null) // staff row being edited

  const fetch = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await api.get(`/api/admin/staff/kpi?period=${period}`)
      setData(res.data.staff ?? [])
    } catch {
      setError(true); setData([])
    } finally { setLoading(false) }
  }, [period])

  useEffect(() => { fetch() }, [fetch])

  const fmt = v => v == null ? '—' : new Intl.NumberFormat('vi-VN').format(v)

  return (
    <div className="space-y-3">
      {target && (
        <SetTargetModal staff={target} period={period} onClose={() => setTarget(null)}
                        onSaved={() => { setTarget(null); fetch() }} />
      )}

      {/* Controls */}
      <div className="lcard p-3 flex flex-wrap gap-3 items-center">
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Kỳ (tháng/năm)</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
                 className="linput !h-8 text-xs" />
        </div>
        <button onClick={fetch} className="lbtn lbtn-secondary !h-8 !px-4 text-xs" disabled={loading}>
          <span className="icon" style={{ fontSize: 14, ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
          Tải lại
        </button>
        <p className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
          Kỳ {period} — {data.length} nhân viên
        </p>
      </div>

      {/* Table */}
      <div className="lcard overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <span className="w-7 h-7 border-2 rounded-full block"
                  style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <span className="icon text-3xl mb-2 block" style={{ color: '#EF4444' }}>error_outline</span>
            <p className="text-sm" style={{ color: '#EF4444' }}>Không thể tải dữ liệu KPI</p>
            <button onClick={fetch} className="lbtn lbtn-secondary !h-8 !px-4 text-xs mt-3">Thử lại</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  {['Nhân viên', 'Vai trò', 'Doanh thu thực tế', 'Mục tiêu DT', 'Tiến độ DT',
                    'Số đơn', 'Mục tiêu đơn', 'KH mới', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold tracking-wide"
                        style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={9} className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Chưa có dữ liệu nhân viên cho kỳ này
                  </td></tr>
                ) : data.map(s => (
                  <tr key={s.userId} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{s.fullName}</td>
                    <td className="px-4 py-2.5"><RoleBadge role={s.role} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                      {fmt(s.revenue)} ₫
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {s.revTarget ? `${fmt(s.revTarget)} ₫` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <KpiBar actual={Number(s.revenue)} target={s.revTarget ? Number(s.revTarget) : null} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-center" style={{ color: 'var(--text-primary)' }}>
                      {fmt(s.orderCount)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                      {s.ordTarget ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-center" style={{ color: 'var(--text-primary)' }}>
                      {fmt(s.newCustomers)}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setTarget(s)}
                              className="lbtn lbtn-secondary !h-7 !px-3 text-xs gap-1">
                        <span className="icon" style={{ fontSize: 14 }}>edit</span>
                        Đặt KPI
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { t } = useTranslation()
  const { user: me } = useAuth()
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('all')
  const [acting,  setActing]  = useState({})

  const [showCreate, setShowCreate] = useState(false)
  const [editUser,   setEditUser]   = useState(null)

  // ── Audit log ──────────────────────────────────────────────────────────────
  const [auditLogs,    setAuditLogs]    = useState([])
  const [auditTotal,   setAuditTotal]   = useState(0)
  const [auditPage,    setAuditPage]    = useState(1)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError,   setAuditError]   = useState(false)
  const [filterAction, setFilterAction] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const fetchUsers = async () => {
    setLoading(true)
    try   { setUsers(await getUsers()) }
    catch { setUsers([]) }
    finally { setLoading(false) }
  }

  const fetchAuditLogs = useCallback(async (page = 1) => {
    setAuditLoading(true); setAuditError(false)
    try {
      const params = { page, pageSize: 50 }
      if (filterAction) params.action = filterAction
      if (filterFrom)   params.from   = filterFrom
      if (filterTo)     params.to     = filterTo
      const res = await getAuditLogs(params)
      setAuditLogs(res.data)
      setAuditTotal(res.total)
      setAuditPage(page)
    } catch {
      setAuditError(true); setAuditLogs([]); setAuditTotal(0)
    } finally {
      setAuditLoading(false)
    }
  }, [filterAction, filterFrom, filterTo])

  useEffect(() => { fetchUsers() }, [])
  useEffect(() => { if (tab === 'audit') fetchAuditLogs(1) }, [tab]) // eslint-disable-line

  const act = async (userId, fn) => {
    setActing(a => ({ ...a, [userId]: true }))
    try   { await fn(); await fetchUsers() }
    catch { /* ignore */ }
    finally { setActing(a => ({ ...a, [userId]: false })) }
  }

  const handleToggleActive = u => {
    if (u.status === 'active') act(u.id, () => deactivate(u.id))
    else                       act(u.id, () => activate(u.id))
  }

  const handleDelete = u => {
    if (!window.confirm(`Xóa người dùng "${u.fullName}"?\nHành động này không thể hoàn tác.`)) return
    act(u.id, () => deleteUser(u.id))
  }

  const managerCount = users.filter(u => u.role === 'Manager').length
  const isOwner      = me?.role === 'Owner'

  const statCards = [
    { label: t('admin.totalUsers'),    value: users.length,                                      icon: 'group',           color: 'var(--primary-500)' },
    { label: t('admin.activeUsers'),   value: users.filter(u => u.status === 'active').length,   icon: 'check_circle',    color: 'var(--accent-500)'  },
    { label: 'Quản lý',               value: managerCount,                                       icon: 'manage_accounts', color: '#3B82F6'             },
    { label: t('admin.inactiveUsers'), value: users.filter(u => u.status === 'inactive').length, icon: 'block',           color: '#EF4444'             },
  ]

  return (
    <div className="space-y-4">
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={fetchUsers} />}
      {editUser   && <EditUserModal   user={editUser} onClose={() => setEditUser(null)} onSaved={fetchUsers} />}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('admin.title')}</h1>
        <div className="flex items-center gap-2">
          {tab === 'all' && (
            <button onClick={() => setShowCreate(true)} className="lbtn lbtn-primary !h-9 gap-1.5">
              <span className="icon text-base">person_add</span>
              <span className="hidden sm:inline">Thêm người dùng</span>
            </button>
          )}
          <button onClick={tab === 'audit' ? () => fetchAuditLogs(1) : fetchUsers}
                  className={`lbtn lbtn-secondary !h-9 ${tab === 'kpi' ? 'hidden' : ''}`}
                  disabled={loading || auditLoading}>
            <span className="icon text-base"
                  style={{ ...((loading || auditLoading) && { animation: 'spin 1s linear infinite' }) }}>
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="lcard p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{card.label}</span>
              <span className="icon w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ fontSize: 18, background: `${card.color}18`, color: card.color }}>
                {card.icon}
              </span>
            </div>
            <div className="font-mono text-2xl font-bold" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'all',   label: t('admin.allUsers'),  suffix: '' },
          { key: 'kpi',   label: 'KPI Nhân viên',      suffix: '' },
          { key: 'audit', label: 'Lịch sử hoạt động', suffix: auditTotal > 0 ? ` (${auditTotal})` : '' },
        ].map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
                  className="pb-3 px-4 text-sm font-medium transition-all"
                  style={{
                    borderBottom: `2px solid ${tab === tb.key ? 'var(--primary-500)' : 'transparent'}`,
                    color: tab === tb.key ? 'var(--primary-500)' : 'var(--text-secondary)',
                    marginBottom: -1,
                  }}>
            {tb.label}{tb.suffix}
          </button>
        ))}
      </div>

      {/* ── Users table ── */}
      {tab === 'all' && (
        <div className="lcard overflow-hidden">
          {loading ? (
            <div className="p-16 flex items-center justify-center"><Spinner size={7} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                    {[t('admin.fullName'), t('admin.email'), t('admin.roleCol'), t('common.status'), t('common.actions')].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold tracking-wide"
                          style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        {t('common.noData')}
                      </td>
                    </tr>
                  ) : users.map(u => {
                    const isSelf     = String(me?.id) === String(u.id)
                    const isUserOwner = u.role === 'Owner'
                    return (
                      <tr key={u.id} className="transition-colors"
                          style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                          <div className="flex items-center gap-2">
                            {u.fullName}
                            {isSelf && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-normal"
                                    style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary-500)' }}>
                                bạn
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3"><StatusDot status={u.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {acting[u.id] ? <Spinner size={4} /> : (
                              <>
                                {/* Sửa */}
                                <IconBtn
                                  icon="edit" title="Sửa thông tin"
                                  color="var(--primary-500)"
                                  bg="rgba(99,102,241,0.08)" hoverBg="rgba(99,102,241,0.16)"
                                  onClick={() => setEditUser(u)}
                                />

                                {/* Khoá / Mở – không tự khoá, không khoá Owner khác */}
                                {!isSelf && !isUserOwner && (
                                  <IconBtn
                                    icon={u.status === 'active' ? 'lock' : 'lock_open'}
                                    title={u.status === 'active' ? 'Vô hiệu hóa' : 'Kích hoạt'}
                                    color={u.status === 'active' ? '#F59E0B' : 'var(--accent-500)'}
                                    bg={u.status === 'active' ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)'}
                                    hoverBg={u.status === 'active' ? 'rgba(245,158,11,0.16)' : 'rgba(16,185,129,0.16)'}
                                    onClick={() => handleToggleActive(u)}
                                  />
                                )}

                                {/* Xóa – chỉ Owner thấy, không xóa chính mình / Owner khác */}
                                {isOwner && !isSelf && !isUserOwner && (
                                  <IconBtn
                                    icon="delete" title="Xóa người dùng"
                                    color="#EF4444"
                                    bg="rgba(239,68,68,0.08)" hoverBg="rgba(239,68,68,0.16)"
                                    onClick={() => handleDelete(u)}
                                  />
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── KPI tab ── */}
      {tab === 'kpi' && <KpiTab />}

      {/* ── Audit log tab ── */}
      {tab === 'audit' && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="lcard p-3 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loại hành động</label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                      className="linput !h-8 text-xs" style={{ minWidth: 160 }}>
                <option value="">Tất cả</option>
                {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Từ ngày</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="linput !h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Đến ngày</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="linput !h-8 text-xs" />
            </div>
            <button onClick={() => fetchAuditLogs(1)} className="lbtn lbtn-primary !h-8 !px-4 text-xs" disabled={auditLoading}>
              <span className="icon" style={{ fontSize: 14 }}>search</span>
              Tìm kiếm
            </button>
            <button onClick={() => { setFilterAction(''); setFilterFrom(''); setFilterTo('') }}
                    className="lbtn lbtn-secondary !h-8 !px-3 text-xs" disabled={auditLoading}>
              Xóa lọc
            </button>
          </div>

          {/* Table */}
          <div className="lcard overflow-hidden">
            {auditLoading ? (
              <div className="p-16 flex items-center justify-center"><Spinner size={7} /></div>
            ) : auditError ? (
              <div className="p-12 text-center">
                <span className="icon text-3xl mb-2 block" style={{ color: '#EF4444' }}>error_outline</span>
                <p className="text-sm font-medium" style={{ color: '#EF4444' }}>Không thể kết nối API</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Kiểm tra backend đang chạy và bảng audit_logs đã được tạo (09_audit_log.sql).
                </p>
                <button onClick={() => fetchAuditLogs(1)} className="lbtn lbtn-secondary !h-8 !px-4 text-xs mt-3">
                  {t('common.retry')}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      {['Thời gian', 'Người dùng', 'Hành động', 'Đối tượng', 'Trạng thái'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold tracking-wide"
                            style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                          Chưa có dữ liệu lịch sử hoạt động
                        </td>
                      </tr>
                    ) : auditLogs.map(log => (
                      <tr key={log.id} className="transition-colors"
                          style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td className="px-4 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(log.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {log.username ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="font-mono px-1.5 py-0.5 rounded text-xs"
                                style={{ background: 'var(--bg-elevated)', color: 'var(--primary-500)', border: '1px solid var(--border)' }}>
                            {ACTION_LABELS[log.action] ?? log.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {log.entityType ? `${log.entityType}${log.entityId ? ` #${log.entityId}` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-1">
                            <AuditStatusBadge status={log.status} />
                            {log.errorMessage && <span className="text-xs" style={{ color: '#EF4444' }}>{log.errorMessage}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {auditTotal > 50 && (
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Tổng {auditTotal} bản ghi</span>
                <div className="flex gap-2">
                  <button onClick={() => fetchAuditLogs(auditPage - 1)}
                          disabled={auditPage <= 1 || auditLoading} className="lbtn lbtn-secondary !h-7 !px-3 text-xs">
                    <span className="icon" style={{ fontSize: 14 }}>chevron_left</span>
                  </button>
                  <span className="text-xs flex items-center px-2" style={{ color: 'var(--text-secondary)' }}>
                    Trang {auditPage}
                  </span>
                  <button onClick={() => fetchAuditLogs(auditPage + 1)}
                          disabled={auditPage * 50 >= auditTotal || auditLoading} className="lbtn lbtn-secondary !h-7 !px-3 text-xs">
                    <span className="icon" style={{ fontSize: 14 }}>chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
