import { useState, useEffect } from 'react'
import axios from '../../api/axios'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const PLAN_COLORS = { free: '#94A3B8', pro: '#7C3AED', enterprise: '#D97706' }

function KpiCard({ label, value, sub, color = '#6366F1' }) {
  return (
    <div className="rounded-xl px-5 py-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

export default function SaAnalyticsPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    axios.get('/api/admin/sa/analytics')
      .then(r => setData(r.data))
      .catch(() => setError('Không thể tải dữ liệu thống kê nền tảng'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#6366F1' }} />
    </div>
  )

  if (error || !data) return (
    <div className="rounded-xl px-5 py-4 text-sm" style={{ background: '#FEE2E2', color: '#991B1B' }}>
      {error || 'Không có dữ liệu'}
    </div>
  )

  const planDist = [
    { name: 'Free',       value: data.byPlan?.free       ?? 0 },
    { name: 'Pro',        value: data.byPlan?.pro        ?? 0 },
    { name: 'Enterprise', value: data.byPlan?.enterprise ?? 0 },
  ].filter(d => d.value > 0)

  const planColors = [PLAN_COLORS.free, PLAN_COLORS.pro, PLAN_COLORS.enterprise]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Thống kê nền tảng</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Tổng quan hoạt động toàn hệ thống</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KpiCard label="Tổng công ty"      value={data.totalCompanies  ?? 0} color="#6366F1" />
        <KpiCard label="Đang hoạt động"    value={data.activeCompanies ?? 0} color="#10B981" sub={`/${data.totalCompanies ?? 0} tổng`} />
        <KpiCard label="Đang dùng thử"     value={data.trialCompanies  ?? 0} color="#3B82F6" />
        <KpiCard label="Đã hết hạn"        value={data.expiredCompanies ?? 0} color="#EF4444" />
        <KpiCard label="Tổng người dùng"   value={data.totalUsers      ?? 0} color="#8B5CF6" />
        <KpiCard label="Người dùng active" value={data.activeUsers     ?? 0} color="#10B981" sub={`/${data.totalUsers ?? 0} tổng`} />
        <KpiCard label="Gói Pro active"    value={data.proSubscriptions ?? 0} color="#7C3AED" />
        {data.monthlyRevenue != null && (
          <KpiCard label="Doanh thu tháng" value={`₫${Number(data.monthlyRevenue).toLocaleString('vi-VN')}`} color="#F59E0B" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phân bổ theo gói — Donut chart */}
        {planDist.length > 0 && (
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Phân bổ theo gói</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={planDist} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={3}>
                  {planDist.map((_, i) => <Cell key={i} fill={planColors[i % planColors.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} công ty`, n]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tăng trưởng công ty mới theo tháng */}
        {data.monthlyGrowth?.length > 0 && (
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h2 className="font-semibold text-sm mb-4" style={{ color: 'var(--text-primary)' }}>Công ty mới theo tháng</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.monthlyGrowth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="newCompanies" name="Công ty mới"
                  stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
