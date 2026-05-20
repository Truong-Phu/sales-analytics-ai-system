import { useState, useEffect, useCallback } from 'react'
import axios from '../../api/axios'

function UsageBar({ used, max, label }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((used / max) * 100))
  const isUnlimited = max === -1
  const color = isUnlimited ? '#10B981' : pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          {isUnlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        {!isUnlimited && (
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        )}
        {isUnlimited && (
          <div className="h-full rounded-full" style={{ width: '30%', background: color }} />
        )}
      </div>
      {!isUnlimited && (
        <p className="text-[10px] mt-0.5 text-right" style={{ color }}>
          {pct}% {pct >= 90 ? '⚠ Sắp đầy' : ''}
        </p>
      )}
    </div>
  )
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  return diff
}

export default function SaUsagePage() {
  const [data,    setData]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const pageSize = 20

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page, pageSize })
    if (search) params.set('search', search)
    axios.get(`/api/admin/sa/usage?${params}`)
      .then(r => { setData(r.data.data ?? []); setTotal(r.data.total ?? 0) })
      .catch(() => setError('Không thể tải dữ liệu sử dụng'))
      .finally(() => setLoading(false))
  }, [page, search])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Giám sát sử dụng</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Mức sử dụng kênh & người dùng theo từng công ty — {total} công ty
          </p>
        </div>
        <input
          type="text" placeholder="Tìm công ty..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="text-sm px-3 py-2 rounded-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: 220 }}
        />
      </div>

      {error && (
        <div className="px-4 py-2 rounded-lg text-sm" style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: '#6366F1' }} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Công ty', 'Gói', 'Sử dụng Kênh', 'Sử dụng User', 'Hết hạn trong'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(row => {
                const days = daysUntil(row.expiresAt)
                const expColor = days == null ? 'var(--text-tertiary)' : days < 7 ? '#EF4444' : days < 30 ? '#F59E0B' : 'var(--text-tertiary)'
                const planColor = row.plan === 'pro' ? '#7C3AED' : row.plan === 'enterprise' ? '#D97706' : '#475569'
                return (
                  <tr key={row.companyId} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{row.companyName}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{row.companyEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${planColor}18`, color: planColor }}>
                        {row.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ minWidth: 180 }}>
                      <UsageBar used={row.channelsUsed ?? 0} max={row.maxChannels ?? 1} label="Kênh" />
                    </td>
                    <td className="px-4 py-3" style={{ minWidth: 180 }}>
                      <UsageBar used={row.usersCount ?? 0} max={row.maxUsers ?? 3} label="User" />
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: expColor, whiteSpace: 'nowrap' }}>
                      {days == null ? '—' : days < 0 ? 'Đã hết hạn' : days === 0 ? 'Hôm nay' : `${days} ngày`}
                      {days != null && days > 0 && days < 30 && (
                        <span className="ml-1">⚠</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>Không có dữ liệu</td></tr>
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
    </div>
  )
}
