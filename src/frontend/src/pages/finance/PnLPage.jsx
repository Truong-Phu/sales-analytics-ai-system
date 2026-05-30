import { useState, useEffect, useCallback } from 'react'
import { getProfitOverview, getExpensesSummary } from '../../api/financeApi'

function fmtVND(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' tỷ'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + ' tr'
  return n.toLocaleString('vi-VN') + ' ₫'
}
function fmtPct(num, denom) {
  if (!denom || denom === 0) return '—'
  return (Number(num) / Number(denom) * 100).toFixed(1) + '%'
}

const today     = () => new Date().toISOString().slice(0, 10)
const firstYear = () => `${new Date().getFullYear()}-01-01`

// Một dòng trong bảng P&L
function PnLRow({ label, value, indent = 0, bold = false, negative = false, highlight, small = false, divider = false, helpText }) {
  const color = highlight === 'green'  ? 'var(--profit-positive)'
              : highlight === 'red'    ? 'var(--color-error)'
              : highlight === 'purple' ? '#8B5CF6'
              : 'var(--text-primary)'

  if (divider) {
    return (
      <tr>
        <td colSpan={3} style={{ padding: '4px 16px', borderBottom: '2px solid var(--border)' }} />
      </tr>
    )
  }

  return (
    <tr className="hover:bg-[--bg-elevated] transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
      <td className={`py-2.5 pl-${4 + indent * 4} pr-3 ${small ? 'text-xs' : 'text-sm'}`}
          style={{ color: bold ? 'var(--text-primary)' : 'var(--text-secondary)', paddingLeft: 16 + indent * 16 }}>
        {indent > 0 && <span style={{ opacity: 0.3 }}>└ </span>}
        <span style={{ fontWeight: bold ? 700 : 400 }}>{label}</span>
        {helpText && <span className="ml-1.5 text-xs" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{helpText}</span>}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm"
          style={{ color: value < 0 ? 'var(--color-error)' : 'var(--text-tertiary)', opacity: 0.7 }}>
        {negative && value !== 0 ? `(${fmtVND(Math.abs(value))})` : ''}
      </td>
      <td className="py-2.5 px-4 text-right font-mono font-bold text-sm"
          style={{ color, fontWeight: bold ? 700 : 500 }}>
        {negative ? (value !== 0 ? `(${fmtVND(Math.abs(value))})` : '—') : fmtVND(value)}
      </td>
    </tr>
  )
}

function PnLSection({ title, children }) {
  return (
    <>
      <tr style={{ background: 'var(--bg-elevated)' }}>
        <td colSpan={3} className="px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
          {title}
        </td>
      </tr>
      {children}
    </>
  )
}

export default function PnLPage() {
  const [from, setFrom] = useState(firstYear())
  const [to,   setTo]   = useState(today())

  const [profit,   setProfit]   = useState(null)
  const [expenses, setExpenses] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [errProfit, setErrProfit] = useState('')
  const [errExp,    setErrExp]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = { from, to }
    const [pRes, eRes] = await Promise.allSettled([
      getProfitOverview(params),
      getExpensesSummary(params),
    ])
    if (pRes.status === 'fulfilled') { setProfit(pRes.value); setErrProfit('') }
    else { setProfit(null); setErrProfit('Chưa kết nối được backend tài chính') }

    if (eRes.status === 'fulfilled') { setExpenses(eRes.value); setErrExp('') }
    else {
      setExpenses(null)
      const msg = eRes.reason?.response?.data?.error ?? ''
      setErrExp(msg.includes('does not exist') || msg.includes('42P01')
        ? 'Bảng expenses chưa được tạo — chạy migration CT-070'
        : 'Chi phí vận hành chưa khả dụng')
    }
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  const p  = profit
  const ex = expenses

  // Tính tổng chi phí vận hành
  const totalOpEx = ex ? Number(ex.total ?? 0) : 0

  // Lợi nhuận vận hành (từ FinanceController, sau QC)
  const opProfit = p ? Number(p.operatingProfit ?? 0) : 0

  // Business Net Profit
  const netProfit = opProfit - totalOpEx

  // Revenue (để tính %)
  const revenue = p ? Number(p.revenue ?? 0) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Báo cáo P&amp;L
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Profit &amp; Loss — Doanh thu → COGS → Lợi nhuận gộp → Operating Profit → Business Net Profit
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} max={to}
                 onChange={e => setFrom(e.target.value)} className="linput text-sm" style={{ width: 140 }} />
          <span style={{ color: 'var(--text-tertiary)' }}>—</span>
          <input type="date" value={to} min={from} max={today()}
                 onChange={e => setTo(e.target.value)} className="linput text-sm" style={{ width: 140 }} />
          <button onClick={load} disabled={loading} className="lbtn lbtn-secondary text-sm !h-9">
            {loading ? 'Đang tải...' : <span className="icon icon-sm">refresh</span>}
          </button>
        </div>
      </div>

      {/* Banners */}
      {p?.isEstimated && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
             style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="icon text-base" style={{ color: '#D97706' }}>warning</span>
          <p className="text-sm" style={{ color: '#D97706' }}>
            Phí sàn đang là <strong>ước tính</strong> dựa trên cấu hình tỷ lệ — chưa từ báo cáo quyết toán thực tế.
          </p>
        </div>
      )}

      {errExp && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
             style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
          <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>info</span>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {errExp} — Business Net Profit chưa tính được. <a href="/finance/operating-expenses"
              className="underline font-semibold" style={{ color: 'var(--primary-500)' }}>
              Nhập chi phí vận hành
            </a>
          </p>
        </div>
      )}

      {/* P&L Statement */}
      <div className="lcard overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-3 px-4 py-2 text-xs font-bold uppercase tracking-widest"
             style={{ background: 'var(--bg-elevated)', borderBottom: '2px solid var(--border)', color: 'var(--text-tertiary)' }}>
          <div>Khoản mục</div>
          <div className="text-right">Chi tiết</div>
          <div className="text-right pr-2">Tổng</div>
        </div>

        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <span className="w-8 h-8 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
            <p className="text-sm">Đang tải dữ liệu...</p>
          </div>
        ) : errProfit ? (
          <div className="py-16 text-center" style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon text-4xl block mb-2">cloud_off</span>
            <p className="text-sm">{errProfit}</p>
          </div>
        ) : (
          <table className="w-full">
            <tbody>
              {/* ─── TẦNG A: Hiệu quả bán hàng ─── */}
              <PnLSection title="A — Hiệu quả bán hàng">
                <PnLRow label="Doanh thu thuần"          value={p?.revenue ?? 0}            bold />
                <PnLRow label="Giá vốn hàng bán (COGS)"  value={p?.cogs ?? 0}               indent={1} negative />
                <PnLRow label="Lợi nhuận gộp"            value={p?.grossProfit ?? 0}        bold highlight="green"
                        helpText={fmtPct(p?.grossProfit, revenue) + ' biên gộp'} />
                <PnLRow divider />
                <PnLRow label="Phí sàn TMĐT (ước tính)"  value={p?.estimatedFees ?? 0}     indent={1} negative small />
                <PnLRow label="LN sau phí sàn"            value={p?.estimatedNetProfit ?? 0} bold />
                <PnLRow label="Chi phí quảng cáo (QC)"   value={p?.advertisingCost ?? 0}   indent={1} negative small />
              </PnLSection>

              {/* Operating Profit row */}
              <tr style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '2px solid rgba(99,102,241,0.2)' }}>
                <td className="py-3 px-4 font-bold text-sm" style={{ color: '#6366F1' }}>
                  <span className="icon icon-sm mr-1.5">trending_up</span>
                  Lợi nhuận vận hành (Operating Profit)
                </td>
                <td className="py-3 px-3 text-right text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  {fmtPct(opProfit, revenue)} biên VH
                </td>
                <td className="py-3 px-4 text-right font-bold text-lg font-mono"
                    style={{ color: opProfit >= 0 ? '#6366F1' : 'var(--color-error)' }}>
                  {fmtVND(opProfit)}
                </td>
              </tr>

              {/* ─── TẦNG B: Chi phí doanh nghiệp ─── */}
              <PnLSection title="B — Chi phí doanh nghiệp">
                {ex ? (
                  <>
                    {ex.salary    > 0 && <PnLRow label="Lương nhân viên"     value={ex.salary}    indent={1} negative small />}
                    {ex.warehouse > 0 && <PnLRow label="Kho bãi"             value={ex.warehouse} indent={1} negative small />}
                    {ex.utilities > 0 && <PnLRow label="Điện, nước, gas"     value={ex.utilities} indent={1} negative small />}
                    {ex.internet  > 0 && <PnLRow label="Internet & Viễn thông" value={ex.internet} indent={1} negative small />}
                    {ex.office    > 0 && <PnLRow label="Văn phòng phẩm"      value={ex.office}    indent={1} negative small />}
                    {ex.other     > 0 && <PnLRow label="Chi phí khác"        value={ex.other}     indent={1} negative small />}
                    {totalOpEx === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                          Chưa có chi phí vận hành nào được ghi nhận.{' '}
                          <a href="/finance/operating-expenses" className="underline" style={{ color: 'var(--primary-500)' }}>
                            Thêm chi phí
                          </a>
                        </td>
                      </tr>
                    )}
                    <PnLRow label="Tổng chi phí vận hành" value={totalOpEx} bold negative />
                  </>
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                      {errExp}
                    </td>
                  </tr>
                )}
              </PnLSection>

              {/* Business Net Profit */}
              <tr style={{ background: ex ? 'rgba(139,92,246,0.08)' : 'var(--bg-elevated)', borderTop: '2px solid var(--border)' }}>
                <td className="py-4 px-4 font-bold text-base" style={{ color: '#8B5CF6' }}>
                  <span className="icon icon-sm mr-1.5">account_balance</span>
                  Business Net Profit — Lợi nhuận doanh nghiệp ròng
                </td>
                <td className="py-4 px-3 text-right text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  {ex ? fmtPct(netProfit, revenue) + ' biên ròng' : '—'}
                </td>
                <td className="py-4 px-4 text-right font-bold text-xl font-mono"
                    style={{ color: ex ? (netProfit >= 0 ? '#8B5CF6' : 'var(--color-error)') : 'var(--text-tertiary)' }}>
                  {ex ? fmtVND(netProfit) : <span className="text-sm font-normal">Cần dữ liệu chi phí vận hành</span>}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { href: '/finance/profit',               icon: 'analytics',        label: 'Phân tích chi tiết', desc: 'Theo kênh, sản phẩm, thời gian' },
          { href: '/finance/operating-expenses',   icon: 'business_center',  label: 'Chi phí vận hành', desc: 'Nhập lương, kho bãi, điện nước' },
          { href: '/finance/ad-spend',             icon: 'ads_click',        label: 'Chi phí quảng cáo', desc: 'Nhập chi phí QC để tính ROAS/ACOS' },
        ].map(l => (
          <a key={l.href} href={l.href}
             className="lcard lcard-hover p-4 flex items-center gap-3 no-underline">
            <span className="icon text-xl shrink-0" style={{ color: 'var(--primary-500)' }}>{l.icon}</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{l.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{l.desc}</p>
            </div>
            <span className="icon icon-sm ml-auto" style={{ color: 'var(--text-tertiary)' }}>arrow_forward</span>
          </a>
        ))}
      </div>
    </div>
  )
}
