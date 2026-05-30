import { useState, useEffect, useCallback } from 'react'
import { getAdSpend, getAdSpendChannels, upsertAdSpend } from '../../api/dashboardApi'

const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                 'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

const fmtVND = v => new Intl.NumberFormat('vi-VN').format(v)

export default function AdSpendPage() {
  const now  = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth() + 1)
  const [channels, setChannels] = useState([])
  const [spend,    setSpend]    = useState({})   // { channelId: amount }
  const [notes,    setNotes]    = useState({})
  const [saving,   setSaving]   = useState({})
  const [saved,    setSaved]    = useState({})
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState('')

  // Load danh sách kênh
  useEffect(() => {
    getAdSpendChannels()
      .then(list => setChannels(list))
      .catch(() => setErr('Không tải được danh sách kênh.'))
  }, [])

  // Load chi phí tháng đã chọn
  const loadSpend = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdSpend(year, month)
      const map = {}; const noteMap = {}
      ;(res.data ?? []).forEach(row => {
        map[row.channelId]     = row.amount
        noteMap[row.channelId] = row.note ?? ''
      })
      setSpend(map)
      setNotes(noteMap)
      setSaved({})
    } catch {
      setErr('Không tải được chi phí.')
    } finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { loadSpend() }, [loadSpend])

  const handleSave = async (channelId) => {
    const amount = parseFloat(String(spend[channelId] ?? '0').replace(/[^0-9.]/g, '')) || 0
    setSaving(s => ({ ...s, [channelId]: true }))
    setErr('')
    try {
      await upsertAdSpend({ channelId, year, month, amount, note: notes[channelId] || null })
      setSaved(s => ({ ...s, [channelId]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [channelId]: false })), 2000)
    } catch {
      setErr('Lưu thất bại, thử lại.')
    } finally {
      setSaving(s => ({ ...s, [channelId]: false }))
    }
  }

  const totalSpend = Object.values(spend).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Nhập chi phí quảng cáo
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Nhập chi phí QC mỗi tháng theo từng kênh để tính ROAS chính xác trong Dashboard
          </p>
        </div>

        {/* Bộ chọn tháng / năm */}
        <div className="flex gap-2 items-center">
          <select value={month} onChange={e => setMonth(+e.target.value)} className="linput text-sm" style={{ width: 120 }}>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(+e.target.value)} className="linput text-sm" style={{ width: 90 }}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
          {err}
        </div>
      )}

      {/* Tổng chi phí */}
      <div className="lcard p-4 flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Tổng chi phí QC — {MONTHS[month-1]} {year}
        </span>
        <span className="text-lg font-bold" style={{ color: 'var(--primary-500)' }}>
          ₫{fmtVND(totalSpend)}
        </span>
      </div>

      {/* Bảng nhập chi phí */}
      <div className="lcard overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Kênh bán hàng</th>
              <th className="text-right px-5 py-3 font-semibold" style={{ color: 'var(--text-tertiary)', width: 200 }}>Chi phí QC (₫)</th>
              <th className="text-left px-5 py-3 font-semibold" style={{ color: 'var(--text-tertiary)', width: 180 }}>Ghi chú</th>
              <th className="px-5 py-3" style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-5 py-10 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Đang tải...
              </td></tr>
            ) : channels.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-10 text-center" style={{ color: 'var(--text-tertiary)' }}>
                Chưa có kênh bán hàng nào.
              </td></tr>
            ) : channels.map(ch => (
              <tr key={ch.channelId} style={{ borderBottom: '1px solid var(--border)' }}>
                {/* Tên kênh */}
                <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {ch.channelName}
                </td>

                {/* Input chi phí */}
                <td className="px-5 py-3">
                  <input
                    type="number" min="0" step="100000"
                    value={spend[ch.channelId] ?? ''}
                    onChange={e => setSpend(s => ({ ...s, [ch.channelId]: e.target.value }))}
                    placeholder="0"
                    className="linput text-right text-sm w-full"
                    style={{ fontFamily: 'monospace' }}
                  />
                </td>

                {/* Ghi chú */}
                <td className="px-5 py-3">
                  <input
                    type="text"
                    value={notes[ch.channelId] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [ch.channelId]: e.target.value }))}
                    placeholder="Ghi chú..."
                    className="linput text-sm w-full"
                  />
                </td>

                {/* Nút lưu */}
                <td className="px-5 py-3 text-center">
                  {saved[ch.channelId] ? (
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent-500)' }}>✓ Đã lưu</span>
                  ) : (
                    <button
                      onClick={() => handleSave(ch.channelId)}
                      disabled={saving[ch.channelId]}
                      className="lbtn lbtn-primary text-xs !h-8 !px-3"
                    >
                      {saving[ch.channelId] ? '...' : 'Lưu'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hướng dẫn */}
      <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <p className="font-semibold mb-2" style={{ color: 'var(--primary-500)' }}>💡 Hướng dẫn</p>
        <ul className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <li>• Nhập tổng chi phí quảng cáo của từng kênh trong tháng này</li>
          <li>• Dữ liệu sẽ tự động tính ROAS = Doanh thu / Chi phí QC trong Dashboard → Tab Marketing</li>
          <li>• Nguồn dữ liệu: xuất báo cáo từ Shopee Ads, TikTok Ads Center, Lazada Sponsored</li>
          <li>• Nếu kênh không chạy QC, nhập 0 hoặc bỏ trống</li>
        </ul>
      </div>
    </div>
  )
}
