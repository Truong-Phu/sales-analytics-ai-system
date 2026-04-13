import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageSpinner } from '../components/ui/Spinner'
import { getUsers, approveUser, deactivate, activate, changeRole } from '../api/adminApi'

const ROLE_OPTIONS = ['Owner', 'Manager', 'Staff', 'DataIT', 'Admin']

const STATUS_BADGE = {
  active:  'badge-success',
  inactive:'badge-error',
  pending: 'badge-warning',
}

export default function AdminPage() {
  const { t } = useTranslation()
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [tab,     setTab]     = useState('all')    // 'all' | 'pending'
  const [acting,  setActing]  = useState({})       // { userId: true } khi đang xử lý

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await getUsers()
      setUsers(res)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const act = async (userId, fn) => {
    setActing(a => ({ ...a, [userId]: true }))
    try {
      await fn()
      await fetchUsers()
    } catch {
      // ignore
    } finally {
      setActing(a => ({ ...a, [userId]: false }))
    }
  }

  const displayed = tab === 'pending'
    ? users.filter(u => u.status === 'pending')
    : users

  const pendingCount = users.filter(u => u.status === 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-on-surface">{t('admin.title')}</h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Tổng người dùng', value: users.length,                                          color: 'text-on-surface' },
          { label: 'Đang hoạt động',  value: users.filter(u => u.status === 'active').length,       color: 'text-tertiary'  },
          { label: 'Chờ phê duyệt',   value: pendingCount,                                          color: 'text-yellow-400' },
          { label: 'Vô hiệu hóa',     value: users.filter(u => u.status === 'inactive').length,     color: 'text-error'     },
        ].map(stat => (
          <div key={stat.label}
               className="bg-surface-container-low border border-outline-variant rounded-2xl p-4">
            <p className="text-outline text-sm">{stat.label}</p>
            <p className={`font-headline text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-3 border-b border-outline-variant">
        {[
          { key: 'all',     label: 'Tất cả người dùng' },
          { key: 'pending', label: `Chờ phê duyệt${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
        ].map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-all ${
              tab === tb.key
                ? 'border-primary text-primary'
                : 'border-transparent text-outline hover:text-on-surface'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? <PageSpinner /> : (
        <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left text-outline font-medium pb-3 pr-4">Họ tên</th>
                  <th className="text-left text-outline font-medium pb-3 pr-4">Email</th>
                  <th className="text-left text-outline font-medium pb-3 pr-4">Vai trò</th>
                  <th className="text-center text-outline font-medium pb-3 pr-4">Trạng thái</th>
                  <th className="text-left text-outline font-medium pb-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {displayed.map(user => (
                  <tr key={user.id} className="hover:bg-surface-container/50 transition-colors">
                    <td className="py-3 pr-4 text-on-surface font-medium">{user.fullName}</td>
                    <td className="py-3 pr-4 text-outline">{user.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={user.role}
                        disabled={acting[user.id]}
                        onChange={e => act(user.id, () => changeRole(user.id, e.target.value))}
                        className="bg-surface-container border border-outline-variant rounded-lg
                                   text-on-surface text-xs px-2 py-1 focus:outline-none"
                      >
                        {ROLE_OPTIONS.map(r => (
                          <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <span className={STATUS_BADGE[user.status] ?? 'badge-info'}>
                        {t(`admin.userStatus.${user.status}`)}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {user.status === 'pending' && (
                          <button
                            onClick={() => act(user.id, () => approveUser(user.id))}
                            disabled={acting[user.id]}
                            className="btn-primary !py-1 !px-3 text-xs flex items-center gap-1"
                          >
                            <span className="icon text-sm">check</span>
                            {t('admin.approve')}
                          </button>
                        )}
                        {user.status === 'active' && (
                          <button
                            onClick={() => act(user.id, () => deactivate(user.id))}
                            disabled={acting[user.id]}
                            className="btn-secondary !py-1 !px-3 text-xs flex items-center gap-1"
                          >
                            <span className="icon text-sm">block</span>
                            {t('admin.deactivate')}
                          </button>
                        )}
                        {user.status === 'inactive' && (
                          <button
                            onClick={() => act(user.id, () => activate(user.id))}
                            disabled={acting[user.id]}
                            className="btn-secondary !py-1 !px-3 text-xs flex items-center gap-1"
                          >
                            <span className="icon text-sm">check_circle</span>
                            {t('admin.activate')}
                          </button>
                        )}
                        {acting[user.id] && (
                          <span className="w-4 h-4 border-2 border-outline-variant border-t-primary
                                           rounded-full animate-spin" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-outline">
                      {tab === 'pending' ? 'Không có tài khoản chờ phê duyệt' : t('common.noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
