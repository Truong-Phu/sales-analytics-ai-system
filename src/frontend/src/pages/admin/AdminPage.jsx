import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getUsers, approveUser, deactivate, activate, changeRole, getAuditLogs } from '../../api/adminApi'
import { MOCK_USERS } from '../../mockData/admin'

const ROLE_OPTIONS = ['Owner', 'Manager', 'Staff', 'DataIT', 'Admin', 'Viewer']
const ROLE_COLOR = {
  Owner:   { bg: 'rgba(245,158,11,0.12)', color: '#D97706', border: 'rgba(245,158,11,0.35)' },
  Manager: { bg: 'rgba(99,102,241,0.10)', color: 'var(--primary-500)', border: 'rgba(99,102,241,0.30)' },
  Staff:   { bg: 'rgba(16,185,129,0.10)', color: 'var(--accent-500)', border: 'rgba(16,185,129,0.30)' },
  DataIT:  { bg: 'rgba(59,130,246,0.10)', color: '#3B82F6', border: 'rgba(59,130,246,0.30)' },
  Admin:   { bg: 'rgba(139,92,246,0.10)', color: '#7C3AED', border: 'rgba(139,92,246,0.30)' },
  Viewer:  { bg: 'rgba(100,116,139,0.10)', color: '#64748B', border: 'rgba(100,116,139,0.30)' },
}
const STATUS_CFG = {
  active:   { bg: 'rgba(16,185,129,0.10)', color: 'var(--accent-500)', border: 'rgba(16,185,129,0.30)', dot: 'var(--accent-500)', label: 'Hoạt động' },
  inactive: { bg: 'rgba(239,68,68,0.08)',  color: '#EF4444',            border: 'rgba(239,68,68,0.25)',  dot: '#EF4444',            label: 'Vô hiệu' },
  pending:  { bg: 'rgba(245,158,11,0.10)', color: '#F59E0B',            border: 'rgba(245,158,11,0.30)', dot: '#F59E0B',            label: 'Chờ duyệt' },
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

function RoleBadge({ role, label }) {
  const c = ROLE_COLOR[role] ?? ROLE_COLOR.Viewer
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      {label}
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

export default function AdminPage() {
  const { t } = useTranslation()
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [tab,     setTab]     = useState('all')
  const [acting,  setActing]  = useState({})

  // ── Audit log state ────────────────────────────────────────────────────────
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
    setIsMock(false)
    try {
      setUsers(await getUsers())
    } catch {
      setUsers(MOCK_USERS)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchAuditLogs = useCallback(async (page = 1) => {
    setAuditLoading(true)
    setAuditError(false)
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
      setAuditError(true)
      setAuditLogs([])
      setAuditTotal(0)
    } finally {
      setAuditLoading(false)
    }
  }, [filterAction, filterFrom, filterTo])

  useEffect(() => { fetchUsers() }, [])
  useEffect(() => { if (tab === 'audit') fetchAuditLogs(1) }, [tab]) // eslint-disable-line

  const act = async (userId, fn) => {
    setActing(a => ({ ...a, [userId]: true }))
    try { await fn(); await fetchUsers() } catch { /* ignore */ }
    finally { setActing(a => ({ ...a, [userId]: false })) }
  }

  const pendingCount = users.filter(u => u.status === 'pending').length
  const displayed    = tab === 'pending' ? users.filter(u => u.status === 'pending') : users

  const statCards = [
    { label: t('admin.totalUsers'),    value: users.length,                                       icon: 'group',         color: 'var(--primary-500)' },
    { label: t('admin.activeUsers'),   value: users.filter(u => u.status === 'active').length,    icon: 'check_circle',  color: 'var(--accent-500)'  },
    { label: t('admin.pendingUsers'),  value: pendingCount,                                        icon: 'hourglass_top', color: '#F59E0B'             },
    { label: t('admin.inactiveUsers'), value: users.filter(u => u.status === 'inactive').length,  icon: 'block',         color: '#EF4444'             },
  ]

  return (
    <div className="space-y-4">
      <MockToast show={isMock} />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('admin.title')}</h1>
        <button onClick={tab === 'audit' ? () => fetchAuditLogs(1) : fetchUsers}
                className="lbtn lbtn-secondary !h-9" disabled={loading || auditLoading}>
          <span className="icon text-base"
                style={{ ...(( loading || auditLoading) && { animation: 'spin 1s linear infinite' }) }}>
            refresh
          </span>
        </button>
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
      <div className="flex gap-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'all',     label: t('admin.allUsers'),        suffix: '' },
          { key: 'pending', label: t('admin.pendingApproval'), suffix: pendingCount > 0 ? ` (${pendingCount})` : '' },
          { key: 'audit',   label: 'Lịch sử hoạt động',       suffix: auditTotal > 0 ? ` (${auditTotal})` : '' },
        ].map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className="pb-3 px-4 text-sm font-medium transition-all"
            style={{
              borderBottom: `2px solid ${tab === tb.key ? 'var(--primary-500)' : 'transparent'}`,
              color: tab === tb.key ? 'var(--primary-500)' : 'var(--text-secondary)',
              marginBottom: -1,
            }}
          >
            {tb.label}{tb.suffix}
          </button>
        ))}
      </div>

      {/* User management table */}
      {tab !== 'audit' && (
        <div className="lcard overflow-hidden">
          {loading ? (
            <div className="p-16 flex items-center justify-center">
              <span className="w-7 h-7 border-2 rounded-full"
                    style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
            </div>
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
                  {displayed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        {tab === 'pending' ? t('admin.noPending') : t('common.noData')}
                      </td>
                    </tr>
                  ) : displayed.map(u => (
                    <tr key={u.id} className="transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{u.fullName}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={u.role} label={t(`admin.roles.${u.role}`, u.role)} />
                          <select
                            value={u.role}
                            disabled={acting[u.id]}
                            onChange={e => act(u.id, () => changeRole(u.id, e.target.value))}
                            className="linput !h-7 text-xs !px-2 !py-0"
                            style={{ maxWidth: 100 }}
                          >
                            {ROLE_OPTIONS.map(r => (
                              <option key={r} value={r}>{t(`admin.roles.${r}`, r)}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusDot status={u.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {acting[u.id] ? (
                            <span className="w-4 h-4 border-2 rounded-full"
                                  style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
                          ) : (
                            <>
                              {u.status === 'pending' && (
                                <button onClick={() => act(u.id, () => approveUser(u.id))}
                                        className="lbtn lbtn-primary !h-7 !px-3 text-xs">
                                  <span className="icon" style={{ fontSize: 14 }}>check</span>
                                  {t('admin.approve')}
                                </button>
                              )}
                              {u.status === 'active' && (
                                <button onClick={() => act(u.id, () => deactivate(u.id))}
                                        className="lbtn lbtn-secondary !h-7 !px-3 text-xs">
                                  <span className="icon" style={{ fontSize: 14 }}>block</span>
                                  {t('admin.deactivate')}
                                </button>
                              )}
                              {u.status === 'inactive' && (
                                <button onClick={() => act(u.id, () => activate(u.id))}
                                        className="lbtn lbtn-secondary !h-7 !px-3 text-xs">
                                  <span className="icon" style={{ fontSize: 14 }}>check_circle</span>
                                  {t('admin.activate')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit log tab */}
      {tab === 'audit' && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="lcard p-3 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Loại hành động</label>
              <select
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="linput !h-8 text-xs"
                style={{ minWidth: 160 }}
              >
                <option value="">Tất cả</option>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Từ ngày</label>
              <input type="date" value={filterFrom}
                     onChange={e => setFilterFrom(e.target.value)}
                     className="linput !h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Đến ngày</label>
              <input type="date" value={filterTo}
                     onChange={e => setFilterTo(e.target.value)}
                     className="linput !h-8 text-xs" />
            </div>
            <button onClick={() => fetchAuditLogs(1)}
                    className="lbtn lbtn-primary !h-8 !px-4 text-xs" disabled={auditLoading}>
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
              <div className="p-16 flex items-center justify-center">
                <span className="w-7 h-7 border-2 rounded-full"
                      style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : auditError ? (
              <div className="p-12 text-center">
                <span className="icon text-3xl mb-2 block" style={{ color: '#EF4444' }}>error_outline</span>
                <p className="text-sm font-medium" style={{ color: '#EF4444' }}>Không thể kết nối API</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Kiểm tra backend đang chạy và bảng audit_logs đã được tạo (09_audit_log.sql).
                </p>
                <button onClick={() => fetchAuditLogs(1)} className="lbtn lbtn-secondary !h-8 !px-4 text-xs mt-3">
                  Thử lại
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
                        <td className="px-4 py-2.5 text-xs font-mono whitespace-nowrap"
                            style={{ color: 'var(--text-secondary)' }}>
                          {new Date(log.createdAt).toLocaleString('vi-VN')}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-medium"
                            style={{ color: 'var(--text-primary)' }}>
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
                            {log.errorMessage && (
                              <span className="text-xs" style={{ color: '#EF4444' }}>{log.errorMessage}</span>
                            )}
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
              <div className="px-4 py-3 flex items-center justify-between"
                   style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Tổng {auditTotal} bản ghi
                </span>
                <div className="flex gap-2">
                  <button onClick={() => fetchAuditLogs(auditPage - 1)}
                          disabled={auditPage <= 1 || auditLoading}
                          className="lbtn lbtn-secondary !h-7 !px-3 text-xs">
                    <span className="icon" style={{ fontSize: 14 }}>chevron_left</span>
                  </button>
                  <span className="text-xs flex items-center px-2" style={{ color: 'var(--text-secondary)' }}>
                    Trang {auditPage}
                  </span>
                  <button onClick={() => fetchAuditLogs(auditPage + 1)}
                          disabled={auditPage * 50 >= auditTotal || auditLoading}
                          className="lbtn lbtn-secondary !h-7 !px-3 text-xs">
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
