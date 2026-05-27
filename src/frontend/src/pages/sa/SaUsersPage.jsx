import { useState, useEffect, useCallback } from 'react'
import axios from '../../api/axios'

const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const ROLE_CFG = {
  Owner:   { bg: '#EDE9FE', color: '#7C3AED' },
  Manager: { bg: '#DBEAFE', color: '#1D4ED8' },
  Staff:   { bg: '#D1FAE5', color: '#065F46' },
  DataIT:  { bg: '#E0F2FE', color: '#0369A1' },
  Viewer:  { bg: '#F1F5F9', color: '#475569' },
}

const ROLES = ['', 'Owner', 'Manager', 'Staff', 'DataIT', 'Viewer']

export default function SaUsersPage() {
  const [users,   setUsers]   = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [page,    setPage]    = useState(1)
  const [roleFilter, setRoleFilter] = useState('')
  const pageSize = 20

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, pageSize })
    if (roleFilter) params.set('role', roleFilter)
    axios.get(`/api/admin/sa/users?${params}`)
      .then(r => { setUsers(r.data.data ?? []); setTotal(r.data.total ?? 0) })
      .catch(() => setError('Không thể tải danh sách người dùng'))
      .finally(() => setLoading(false))
  }, [page, roleFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Quản lý Người dùng</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Tất cả người dùng – {total} tổng
          </p>
        </div>
        <select
          value={roleFilter}
          onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
          className="text-sm px-3 py-2 rounded-lg"
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', minWidth: 140,
          }}>
          {ROLES.map(r => <option key={r} value={r}>{r || 'Tất cả vai trò'}</option>)}
        </select>
      </div>

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
                {['Tên', 'Email', 'Công ty', 'Vai trò', 'Đăng nhập cuối', 'Ngày tạo', 'Trạng thái'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const roleCfg = ROLE_CFG[u.role] ?? ROLE_CFG.Viewer
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: 'linear-gradient(135deg, #6366F1,#8B5CF6)' }}>
                          {(u.fullName ?? u.username ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {u.fullName ?? u.username}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>@{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {u.companyName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: roleCfg.bg, color: roleCfg.color }}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(u.lastLoginAt)}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: u.isActive ? '#D1FAE5' : '#FEE2E2',
                          color:      u.isActive ? '#065F46' : '#991B1B',
                        }}>
                        {u.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>Không có người dùng nào</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-tertiary)' }}>
            Trang {page}/{totalPages} · {total} người dùng
          </span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              ← Trước
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg text-sm disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              Tiếp →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
