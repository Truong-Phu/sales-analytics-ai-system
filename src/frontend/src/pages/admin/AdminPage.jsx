import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getUsers, approveUser, deactivate, activate, changeRole } from '../../api/adminApi'
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

export default function AdminPage() {
  const { t } = useTranslation()
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [tab,     setTab]     = useState('all')
  const [acting,  setActing]  = useState({})

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
  useEffect(() => { fetchUsers() }, [])

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
        <button onClick={fetchUsers} className="lbtn lbtn-secondary !h-9" disabled={loading}>
          <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
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

      {/* Table */}
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
    </div>
  )
}
