import { useState, useEffect, useCallback } from 'react'
import axios from '../../api/axios'

const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—'
const fmtDateInput = d => d ? new Date(d).toISOString().slice(0, 10) : ''

const PLAN_CFG = {
  pro:        { bg: '#EDE9FE', color: '#7C3AED' },
  free:       { bg: '#F1F5F9', color: '#475569' },
  enterprise: { bg: '#FEF9C3', color: '#92400E' },
}
const STATUS_CFG = {
  active:    { bg: '#D1FAE5', color: '#065F46' },
  trial:     { bg: '#DBEAFE', color: '#1D4ED8' },
  expired:   { bg: '#FEE2E2', color: '#991B1B' },
  cancelled: { bg: '#F1F5F9', color: '#475569' },
}

// Cấu hình mặc định theo gói — SuperAdmin vẫn có thể override
const PLAN_DEFAULTS = {
  free:       { maxChannels: 1,  maxUsers: 3,  price: 0,       label: 'Free',       features: ['1 kênh bán hàng', '3 người dùng', 'Import CSV/Excel', 'Dashboard cơ bản'] },
  pro:        { maxChannels: 5,  maxUsers: 20, price: 499000,  label: 'Pro',        features: ['5 kênh bán hàng', '20 người dùng', 'AI dự báo & anomaly', 'Báo cáo nâng cao', 'Export PDF'] },
  enterprise: { maxChannels: -1, maxUsers: -1, price: -1,      label: 'Enterprise', features: ['Kênh không giới hạn', 'Người dùng không giới hạn', 'Tất cả tính năng AI', 'SLA ưu tiên', 'Tùy chỉnh theo yêu cầu'] },
}

function EditModal({ sub, onClose, onSaved }) {
  const [form, setForm] = useState({
    plan:        sub.plan        ?? 'free',
    status:      sub.status      ?? 'active',
    expiresAt:   fmtDateInput(sub.expiresAt),
    maxChannels: sub.maxChannels ?? PLAN_DEFAULTS.free.maxChannels,
    maxUsers:    sub.maxUsers    ?? PLAN_DEFAULTS.free.maxUsers,
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Khi thay đổi gói → tự động điền giá trị mặc định
  const handlePlanChange = (plan) => {
    const def = PLAN_DEFAULTS[plan] ?? PLAN_DEFAULTS.free
    setForm(f => ({
      ...f,
      plan,
      maxChannels: def.maxChannels,
      maxUsers:    def.maxUsers,
    }))
  }

  const isEnterprise = form.plan === 'enterprise'
  const planDef = PLAN_DEFAULTS[form.plan] ?? PLAN_DEFAULTS.free

  const save = async () => {
    setLoading(true); setError('')
    try {
      await axios.put(`/api/admin/sa/subscriptions/${sub.id}`, {
        plan:        form.plan,
        status:      form.status,
        expiresAt:   form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        maxChannels: isEnterprise ? -1 : (form.maxChannels === '' ? null : Number(form.maxChannels)),
        maxUsers:    isEnterprise ? -1 : (form.maxUsers    === '' ? null : Number(form.maxUsers)),
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message ?? 'Lỗi khi cập nhật')
    } finally { setLoading(false) }
  }

  const inp = 'w-full text-sm px-3 py-2 rounded-lg'
  const inpStyle = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    color: 'var(--text-primary)',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        style={{ background: 'var(--bg-surface)' }}>
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Chỉnh sửa Gói đăng ký
          </h3>
          <button onClick={onClose}><span className="icon" style={{ color: 'var(--text-tertiary)' }}>close</span></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{sub.companyName}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Gói</label>
              <select className={inp} style={inpStyle}
                value={form.plan} onChange={e => handlePlanChange(e.target.value)}>
                {['free', 'pro', 'enterprise'].map(p => (
                  <option key={p} value={p}>{PLAN_DEFAULTS[p].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Trạng thái</label>
              <select className={inp} style={inpStyle}
                value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {['active', 'trial', 'expired', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Mô tả gói — features list */}
          <div className="px-3 py-2.5 rounded-lg text-xs space-y-1"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <p className="font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Gói {planDef.label} — {planDef.price === -1 ? 'Liên hệ' : planDef.price === 0 ? 'Miễn phí' : `${planDef.price.toLocaleString('vi-VN')} VND/tháng`}
            </p>
            {planDef.features.map(f => (
              <div key={f} className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                <span className="icon text-xs" style={{ color: '#10B981' }}>check_circle</span>
                {f}
              </div>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Hết hạn</label>
            <input type="date" className={inp} style={inpStyle}
              value={form.expiresAt}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Tối đa Kênh
                {!isEnterprise && <span className="ml-1 opacity-60">(mặc định: {planDef.maxChannels})</span>}
              </label>
              {isEnterprise ? (
                <div className={`${inp} opacity-60`} style={{ ...inpStyle, cursor: 'not-allowed' }}>Không giới hạn (∞)</div>
              ) : (
                <input type="number" className={inp} style={inpStyle}
                  value={form.maxChannels}
                  onChange={e => setForm(f => ({ ...f, maxChannels: e.target.value }))} />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Tối đa Người dùng
                {!isEnterprise && <span className="ml-1 opacity-60">(mặc định: {planDef.maxUsers})</span>}
              </label>
              {isEnterprise ? (
                <div className={`${inp} opacity-60`} style={{ ...inpStyle, cursor: 'not-allowed' }}>Không giới hạn (∞)</div>
              ) : (
                <input type="number" className={inp} style={inpStyle}
                  value={form.maxUsers}
                  onChange={e => setForm(f => ({ ...f, maxUsers: e.target.value }))} />
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex-1 lbtn lbtn-secondary">Hủy</button>
          <button onClick={save} disabled={loading} className="flex-1 lbtn lbtn-primary">
            {loading ? '...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SaSubscriptionsPage() {
  const [subs,    setSubs]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [page,    setPage]    = useState(1)
  const [planFilter,   setPlanFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [flash,   setFlash]   = useState('')
  const pageSize = 20

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, pageSize })
    if (planFilter)   params.set('plan',   planFilter)
    if (statusFilter) params.set('status', statusFilter)
    axios.get(`/api/admin/sa/subscriptions?${params}`)
      .then(r => { setSubs(r.data.data ?? []); setTotal(r.data.total ?? 0) })
      .catch(() => setError('Không thể tải danh sách gói đăng ký'))
      .finally(() => setLoading(false))
  }, [page, planFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Gói đăng ký</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Quản lý gói dịch vụ – {total} tổng
          </p>
        </div>
        <div className="flex gap-2">
          <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="">Tất cả gói</option>
            {['free', 'pro', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="">Tất cả trạng thái</option>
            {['active', 'trial', 'expired', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {flash && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#D1FAE5', color: '#065F46' }}>{flash}</div>
      )}
      {error && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto"
              style={{ borderColor: '#6366F1' }} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Công ty', 'Gói', 'Trạng thái', 'Kênh', 'Người dùng', 'Hết hạn', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map(s => {
                const planCfg   = PLAN_CFG[s.plan]   ?? PLAN_CFG.free
                const statusCfg = STATUS_CFG[s.status] ?? STATUS_CFG.active
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.companyName}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.companyEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: planCfg.bg, color: planCfg.color }}>{s.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: statusCfg.bg, color: statusCfg.color }}>{s.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                      {s.maxChannels === -1 ? '∞' : s.maxChannels}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                      {s.maxUsers === -1 ? '∞' : s.maxUsers}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(s.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setEditing(s)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                        Sửa
                      </button>
                    </td>
                  </tr>
                )
              })}
              {subs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>Không có gói đăng ký nào</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>Trang {page}/{totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              ← Trước
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              Tiếp →
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EditModal
          sub={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setFlash('Đã cập nhật gói đăng ký')
            setTimeout(() => setFlash(''), 3000)
            load()
          }}
        />
      )}
    </div>
  )
}
