import { useState, useEffect, useCallback } from 'react'
import axios from '../../api/axios'

const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const PLAN_CFG = {
  pro:        { bg: '#EDE9FE', color: '#7C3AED' },
  free:       { bg: '#F1F5F9', color: '#475569' },
  enterprise: { bg: '#FEF9C3', color: '#92400E' },
}
const STATUS_CFG = {
  active:   { bg: '#D1FAE5', color: '#065F46' },
  inactive: { bg: '#FEE2E2', color: '#991B1B' },
  expired:  { bg: '#FEF9C3', color: '#854D0E' },
}

export default function SaCompaniesPage() {
  const [companies, setCompanies] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [toggling,  setToggling]  = useState(null)
  const [flash,     setFlash]     = useState('')

  const load = useCallback(() => {
    setLoading(true)
    axios.get('/api/admin/sa/companies')
      .then(r => setCompanies(r.data))
      .catch(() => setError('Không thể tải danh sách companies'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const toggleCompany = async (id, isActive) => {
    setToggling(id)
    try {
      const res = await axios.patch(`/api/admin/sa/companies/${id}/toggle`, { isActive: !isActive })
      setFlash(res.data.message)
      setTimeout(() => setFlash(''), 3000)
      load()
    } catch {
      setError('Không thể cập nhật trạng thái')
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Companies</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Quản lý tất cả công ty trong hệ thống
          </p>
        </div>
        <span className="text-sm px-3 py-1 rounded-full font-medium"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          {companies.length} companies
        </span>
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
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
              style={{ borderColor: '#6366F1' }} />
            Đang tải...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Công ty', 'Email', 'Gói', 'Subscription', 'Users', 'Ngày đăng ký', 'Trạng thái', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const planCfg = PLAN_CFG[c.subscription?.plan ?? 'free'] ?? PLAN_CFG.free
                const subStatusCfg = STATUS_CFG[c.subscription?.status ?? 'active'] ?? STATUS_CFG.active
                const companyCfg   = c.isActive ? STATUS_CFG.active : STATUS_CFG.inactive
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: planCfg.bg, color: planCfg.color }}>
                        {c.subscription?.plan ?? 'free'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.subscription && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: subStatusCfg.bg, color: subStatusCfg.color }}>
                          {c.subscription.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                      {c.userCount}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: companyCfg.bg, color: companyCfg.color }}>
                        {c.isActive ? 'Active' : 'Locked'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={toggling === c.id}
                        onClick={() => toggleCompany(c.id, c.isActive)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                        style={{
                          background: c.isActive ? '#FEE2E2' : '#D1FAE5',
                          color:      c.isActive ? '#991B1B' : '#065F46',
                        }}>
                        {toggling === c.id ? '...' : c.isActive ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {companies.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>Chưa có company nào</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
