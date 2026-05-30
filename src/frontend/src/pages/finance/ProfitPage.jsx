import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getProfitOverview, getProfitByChannel, getProfitByProduct,
  getProfitByDate, getProfitOrders, getFeeConfigs, updateFeeConfig,
} from '../../api/financeApi'
import AiEmptyState from '../../components/ui/AiEmptyState'

function fmtM(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + ' tr'
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + 'K'
  return n.toLocaleString('vi-VN')
}
function fmtPct(v) { return v == null ? '—' : Number(v).toFixed(1) + '%' }
function fmtRate(v) { return v == null ? '' : (Number(v) * 100).toFixed(1) + '%' }

const CHANNEL_LABELS = {
  shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada',
  'bán tại quầy': 'POS', offline: 'POS', website: 'Website',
}

function channelLabel(raw) {
  return CHANNEL_LABELS[(raw || '').toLowerCase()] || raw
}

// ── Tooltip thông tin KPI ─────────────────────────────────────────────────────
const KPI_INFO = {
  'Doanh thu':          { formula: 'gross_revenue - discount', meaning: 'Doanh thu thuần sau chiết khấu từ tất cả kênh bán hàng.', interpret: 'Cao = bán được nhiều hàng.' },
  'Giá vốn (COGS)':     { formula: 'cost_price × quantity', meaning: 'Chi phí nhập hàng trực tiếp để tạo ra sản phẩm đã bán.', interpret: 'Thấp = hiệu quả nhập hàng tốt.' },
  'Lợi nhuận gộp':      { formula: 'Doanh thu − COGS', meaning: 'Lợi nhuận trước khi trừ phí vận hành và quảng cáo.', interpret: 'Biên gộp > 30% là tốt cho thời trang.' },
  'Phí vận hành':       { formula: 'Platform fee + Payment fee + Packaging + Shipping', meaning: 'Toàn bộ phí liên quan đến bán hàng trên sàn và vận chuyển.', interpret: 'Phí < 15% doanh thu là hợp lý.' },
  'LN sau phí sàn':     { formula: 'Lợi nhuận gộp − Phí vận hành', meaning: 'Lợi nhuận sau khi trừ phí sàn TMĐT và vận chuyển. Chưa trừ chi phí quảng cáo.', interpret: 'Đây là điểm hòa vốn trước QC.' },
  'Chi phí QC':         { formula: 'Tổng chi phí quảng cáo nhập tay theo kênh/tháng', meaning: 'Chi phí chạy quảng cáo Shopee Ads, TikTok Ads, Lazada Ads...', interpret: 'Thấp hơn 20% doanh thu là hiệu quả.' },
  'Lợi nhuận vận hành': { formula: 'LN sau phí sàn − Chi phí QC', meaning: 'Lợi nhuận thực tế từ hoạt động bán hàng đa kênh sau tất cả chi phí trực tiếp.', interpret: 'Dương = kinh doanh có lãi. Tăng trưởng = xu hướng tốt.' },
  'Biên lợi nhuận gộp': { formula: '(LN gộp / Doanh thu) × 100', meaning: 'Tỷ lệ lợi nhuận gộp trên doanh thu.', interpret: 'Mục tiêu: ≥ 30% cho thời trang B2C.' },
  'Biên LN vận hành':   { formula: '(LN vận hành / Doanh thu) × 100', meaning: 'Tỷ lệ lợi nhuận vận hành trên doanh thu sau tất cả chi phí trực tiếp.', interpret: 'Mục tiêu: ≥ 10% cho SME thời trang.' },
  'ROAS':               { formula: 'Doanh thu / Chi phí quảng cáo', meaning: '1 đồng quảng cáo tạo ra bao nhiêu đồng doanh thu.', interpret: 'ROAS = 4 → 1đ QC tạo 4đ doanh thu. Mục tiêu: ≥ 4x.' },
  'ACOS':               { formula: '(Chi phí QC / Doanh thu) × 100', meaning: 'Tỷ lệ chi phí quảng cáo trên doanh thu (Advertising Cost of Sale).', interpret: 'ACOS thấp = QC hiệu quả. Mục tiêu: ≤ 15-20%.' },
}

function InfoTooltip({ kpiKey }) {
  const [show, setShow] = useState(false)
  const info = KPI_INFO[kpiKey]
  if (!info) return null
  return (
    <span className="relative inline-flex ml-1">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
        style={{ background: 'currentColor', color: 'inherit', border: '1.5px solid currentColor' }}>
        <span style={{ color: 'white', fontSize: 9 }}>?</span>
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg shadow-xl border z-50 p-3 text-left"
             style={{ background: '#1e293b', color: '#f1f5f9', fontSize: 11, lineHeight: 1.5 }}>
          <div className="font-mono text-[10px] text-blue-300 mb-1">{info.formula}</div>
          <div className="mb-1">{info.meaning}</div>
          <div className="text-green-300 text-[10px]">{info.interpret}</div>
        </div>
      )}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'blue', estimated, infoKey }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    teal:   'bg-teal-50 border-teal-200 text-teal-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    pink:   'bg-pink-50 border-pink-200 text-pink-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-xs font-medium opacity-70 mb-1 flex items-center">
        {label}
        {estimated && <span className="ml-1 text-[10px] opacity-60">(ước tính)</span>}
        {infoKey && <InfoTooltip kpiKey={infoKey} />}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-1">{sub}</div>}
    </div>
  )
}

// ── Fee Config Row ─────────────────────────────────────────────────────────────
function FeeConfigRow({ cfg, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...cfg })
  const [saving, setSaving] = useState(false)

  function handleSave() {
    setSaving(true)
    onSave(cfg.feeConfigId, {
      PlatformFeeRate:       Number(draft.platformFeeRate),
      PaymentFeeRate:        Number(draft.paymentFeeRate),
      FixedFeePerOrder:      Number(draft.fixedFeePerOrder),
      PackagingCostPerOrder: Number(draft.packagingCostPerOrder),
      ShippingCostMode:      draft.shippingCostMode,
      Note:                  draft.note,
    }).finally(() => { setSaving(false); setEditing(false) })
  }

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-2 px-3 font-medium">{cfg.channelName}</td>
      <td className="py-2 px-3">
        {editing
          ? <input type="number" step="0.001" min="0" max="0.5"
              className="w-20 border rounded px-1 text-sm"
              value={draft.platformFeeRate}
              onChange={e => setDraft(d => ({ ...d, platformFeeRate: e.target.value }))} />
          : fmtRate(cfg.platformFeeRate)
        }
      </td>
      <td className="py-2 px-3">
        {editing
          ? <input type="number" step="0.001" min="0" max="0.5"
              className="w-20 border rounded px-1 text-sm"
              value={draft.paymentFeeRate}
              onChange={e => setDraft(d => ({ ...d, paymentFeeRate: e.target.value }))} />
          : fmtRate(cfg.paymentFeeRate)
        }
      </td>
      <td className="py-2 px-3">
        {editing
          ? <input type="number" step="100" min="0"
              className="w-24 border rounded px-1 text-sm"
              value={draft.packagingCostPerOrder}
              onChange={e => setDraft(d => ({ ...d, packagingCostPerOrder: e.target.value }))} />
          : Number(cfg.packagingCostPerOrder).toLocaleString('vi-VN') + ' đ'
        }
      </td>
      <td className="py-2 px-3 text-xs text-yellow-700">
        {cfg.isEstimated ? '⚠ Ước tính' : '✓ Thực tế'}
      </td>
      <td className="py-2 px-3">
        {editing
          ? <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Lưu...' : 'Lưu'}
              </button>
              <button onClick={() => { setEditing(false); setDraft({ ...cfg }) }}
                className="text-xs text-gray-500 hover:text-gray-700">Huỷ</button>
            </div>
          : <button onClick={() => setEditing(true)}
              className="text-xs text-blue-600 hover:underline">Sửa</button>
        }
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfitPage() {
  const today = new Date().toISOString().slice(0, 10)
  const firstOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstOfYear)
  const [to,   setTo]   = useState(today)
  const [tab,  setTab]  = useState('overview')

  const [overview,  setOverview]  = useState(null)
  const [channels,  setChannels]  = useState([])
  const [products,  setProducts]  = useState([])
  const [byDate,    setByDate]    = useState([])
  const [orders,    setOrders]    = useState({ items: [], totalCount: 0 })
  const [feeConfs,  setFeeConfs]  = useState([])
  const [loading, setLoading] = useState(false)
  const [page,    setPage]    = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    const p = { from, to }
    try {
      const [ov, ch, pr, dt, ord, fc] = await Promise.all([
        getProfitOverview(p),
        getProfitByChannel(p),
        getProfitByProduct({ ...p, limit: 30 }),
        getProfitByDate({ ...p, granularity: 'month' }),
        getProfitOrders({ ...p, page, pageSize: 50 }),
        getFeeConfigs(),
      ])
      setOverview(ov); setChannels(ch); setProducts(pr)
      setByDate(dt); setOrders(ord); setFeeConfs(fc)
    } catch {
      setOverview(null); setChannels([]); setProducts([])
      setByDate([]); setOrders({ items: [], totalCount: 0 })
      setFeeConfs([])
    } finally {
      setLoading(false)
    }
  }, [from, to, page])

  useEffect(() => { load() }, [load])

  async function handleSaveConfig(id, dto) {
    try {
      await updateFeeConfig(id, dto)
      await load()
    } catch {
      alert('Lưu thất bại')
    }
  }

  const ov = overview

  return (
    <div className="p-6 space-y-6">
      {!ov && !loading && <AiEmptyState title="Chưa có dữ liệu lợi nhuận" />}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Phân tích lợi nhuận</h1>
          <p className="text-sm text-gray-500">Doanh thu · COGS · LN gộp · Phí sàn · Chi phí QC → Lợi nhuận vận hành</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-sm text-gray-600">Từ</label>
          <input type="date" value={from} max={to}
            className="border rounded px-2 py-1 text-sm"
            onChange={e => setFrom(e.target.value)} />
          <label className="text-sm text-gray-600">đến</label>
          <input type="date" value={to} min={from} max={today}
            className="border rounded px-2 py-1 text-sm"
            onChange={e => setTo(e.target.value)} />
          <button onClick={load} disabled={loading}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Đang tải...' : 'Áp dụng'}
          </button>
        </div>
      </div>

      {/* Cảnh báo estimated */}
      {ov?.isEstimated && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 text-sm text-yellow-800 flex gap-2">
          <span className="text-lg leading-none">⚠</span>
          <span>
            <strong>Lợi nhuận ròng đang là ước tính</strong> vì hệ thống chưa tích hợp
            báo cáo đối soát / Finance API từ sàn. Phí sàn và phí thanh toán được tính theo
            tỷ lệ cấu hình. Kết quả phù hợp cho mục đích demo và phân tích xu hướng.
          </span>
        </div>
      )}

      {/* Missing cost warning */}
      {ov?.missingCostOrders > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2.5 text-sm text-red-800 flex gap-2 items-center">
          <span className="text-base">⚠</span>
          <span><strong>{ov.missingCostOrders} đơn hàng</strong> thiếu giá vốn (cost_price) → COGS và lợi nhuận chưa chính xác. Vào <strong>Quản lý sản phẩm</strong> để cập nhật giá vốn.</span>
        </div>
      )}

      {/* KPI Cards — 2 hàng: hàng 1 tuyệt đối, hàng 2 tỷ lệ */}
      {ov && (<>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Doanh thu"           value={fmtM(ov.revenue)}            color="blue"   infoKey="Doanh thu" />
        <KpiCard label="Giá vốn (COGS)"      value={fmtM(ov.cogs)}               color="orange" infoKey="Giá vốn (COGS)" />
        <KpiCard label="Lợi nhuận gộp"       value={fmtM(ov.grossProfit)}        color="green"  infoKey="Lợi nhuận gộp" />
        <KpiCard label="Phí vận hành"        value={fmtM(ov.estimatedFees)}      color="red"    estimated infoKey="Phí vận hành" />
        <KpiCard label="LN sau phí sàn"      value={fmtM(ov.estimatedNetProfit)} color="teal"   estimated infoKey="LN sau phí sàn" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Chi phí QC"          value={fmtM(ov.advertisingCost ?? 0)}   color="pink"   infoKey="Chi phí QC"
                 sub={ov.advertisingCost > 0 ? `ACOS: ${fmtPct(ov.acos)}` : 'Chưa nhập QC tháng này'} />
        <KpiCard label="Lợi nhuận vận hành"  value={fmtM(ov.operatingProfit ?? 0)}   color="indigo" infoKey="Lợi nhuận vận hành"
                 sub={`Biên: ${fmtPct(ov.operatingMargin ?? 0)}`} />
        <KpiCard label="Biên lợi nhuận gộp"  value={fmtPct(ov.grossMargin)}          color="purple" infoKey="Biên lợi nhuận gộp" />
        <KpiCard label="Biên LN vận hành"    value={fmtPct(ov.operatingMargin ?? 0)} color="yellow" infoKey="Biên LN vận hành" />
        <KpiCard label="ACOS"                value={fmtPct(ov.acos ?? 0)}            color="red"    infoKey="ACOS"
                 sub={`QC: ${fmtM(ov.advertisingCost ?? 0)}`} />
      </div>
      </>)}

      {/* Tabs */}
      <div className="border-b flex gap-6 text-sm font-medium">
        {['overview','channel','product','orders','fee-config'].map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`pb-2 border-b-2 transition-colors ${tab === t
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'overview'    ? 'Theo thời gian'
            : t === 'channel'   ? 'Theo kênh'
            : t === 'product'   ? 'Theo sản phẩm'
            : t === 'orders'    ? 'Đơn hàng'
            :                     'Cấu hình phí'}
          </button>
        ))}
      </div>

      {/* TAB: Theo thời gian */}
      {tab === 'overview' && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold text-gray-700 mb-4">Doanh thu & Lợi nhuận theo tháng</h2>
          {byDate.length === 0
            ? <div className="text-center text-gray-400 py-12">Chưa có dữ liệu</div>
            : <ResponsiveContainer width="100%" height={320}>
                <BarChart data={byDate} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => fmtM(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => fmtM(v)} />
                  <Legend />
                  <Bar dataKey="revenue"            name="Doanh thu"          fill="#3b82f6" />
                  <Bar dataKey="cogs"               name="Giá vốn"            fill="#f97316" />
                  <Bar dataKey="grossProfit"        name="LN gộp"             fill="#22c55e" />
                  <Bar dataKey="estimatedNetProfit" name="LN sau phí sàn"     fill="#14b8a6" />
                  <Bar dataKey="advertisingCost"    name="Chi phí QC"         fill="#ec4899" />
                  <Bar dataKey="operatingProfit"    name="LN vận hành"        fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
          }
        </div>
      )}

      {/* TAB: Theo kênh */}
      {tab === 'channel' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Kênh','Đơn','Doanh thu','Giá vốn','LN Gộp','Biên gộp','Phí sàn (ước)','LN sau phí','Chi phí QC','ACOS','LN vận hành','Biên VH'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map((c, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 font-medium">{channelLabel(c.channel)}</td>
                  <td className="py-2 px-3">{c.orderCount?.toLocaleString()}</td>
                  <td className="py-2 px-3 text-blue-700">{fmtM(c.revenue)}</td>
                  <td className="py-2 px-3 text-orange-600">{fmtM(c.cogs)}</td>
                  <td className="py-2 px-3 text-green-700">{fmtM(c.grossProfit)}</td>
                  <td className="py-2 px-3">{fmtPct(c.grossMargin)}</td>
                  <td className="py-2 px-3 text-red-600">{fmtM(c.estimatedFees)}</td>
                  <td className="py-2 px-3 text-teal-700">{fmtM(c.estimatedNetProfit)}</td>
                  <td className="py-2 px-3 text-pink-700">{fmtM(c.advertisingCost ?? 0)}</td>
                  <td className="py-2 px-3 text-red-500 text-xs">{fmtPct(c.acos ?? 0)}</td>
                  <td className="py-2 px-3 text-indigo-700 font-semibold">{fmtM(c.operatingProfit ?? 0)}</td>
                  <td className="py-2 px-3 text-xs">{fmtPct(c.operatingMargin ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: Theo sản phẩm */}
      {tab === 'product' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['#','SKU','Sản phẩm','SL bán','Doanh thu','Giá vốn','LN Gộp','Biên gộp','LN Ròng (ước)','COGS?'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.length === 0
                ? <tr><td colSpan={10} className="text-center py-10 text-gray-400">Chưa có dữ liệu</td></tr>
                : products.map((p, i) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                  <td className="py-2 px-3 font-mono text-xs">{p.sku}</td>
                  <td className="py-2 px-3 max-w-[180px] truncate" title={p.productName}>{p.productName}</td>
                  <td className="py-2 px-3">{Number(p.totalQty).toLocaleString()}</td>
                  <td className="py-2 px-3 text-blue-700">{fmtM(p.revenue)}</td>
                  <td className="py-2 px-3 text-orange-600">{fmtM(p.cogs)}</td>
                  <td className="py-2 px-3 text-green-700">{fmtM(p.grossProfit)}</td>
                  <td className="py-2 px-3">{fmtPct(p.grossMargin)}</td>
                  <td className="py-2 px-3 text-teal-700">{fmtM(p.estimatedNetProfit)}</td>
                  <td className="py-2 px-3">
                    {p.missingCost
                      ? <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Thiếu</span>
                      : <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: Đơn hàng */}
      {tab === 'orders' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-2 text-xs text-gray-500 border-b">
            {orders.totalCount.toLocaleString()} đơn hàng
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Mã đơn','Kênh','Ngày','Doanh thu','Giá vốn','LN Gộp','Phí ước','LN Ròng (ước)','COGS'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.items.length === 0
                ? <tr><td colSpan={9} className="text-center py-10 text-gray-400">Chưa có dữ liệu</td></tr>
                : orders.items.map((o, i) => (
                <tr key={i} className="border-b hover:bg-gray-50 text-xs">
                  <td className="py-1.5 px-3 font-mono">{o.orderId}</td>
                  <td className="py-1.5 px-3">{channelLabel(o.channel)}</td>
                  <td className="py-1.5 px-3 text-gray-500">{o.date?.slice(0, 10)}</td>
                  <td className="py-1.5 px-3 text-blue-700">{fmtM(o.revenue)}</td>
                  <td className="py-1.5 px-3 text-orange-600">{fmtM(o.cogs)}</td>
                  <td className="py-1.5 px-3 text-green-700">{fmtM(o.grossProfit)}</td>
                  <td className="py-1.5 px-3 text-red-500">{fmtM(o.estimatedFees)}</td>
                  <td className="py-1.5 px-3 text-teal-700 font-semibold">{fmtM(o.estimatedNetProfit)}</td>
                  <td className="py-1.5 px-3">
                    {o.missingCost
                      ? <span className="bg-red-100 text-red-600 px-1 py-0.5 rounded text-[10px]">Thiếu</span>
                      : <span className="bg-green-100 text-green-600 px-1 py-0.5 rounded text-[10px]">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.totalCount > 50 && (
            <div className="p-3 flex gap-2 justify-end text-sm border-t">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 border rounded disabled:opacity-40">Trước</button>
              <span className="px-2 py-1 text-gray-600">Trang {page}</span>
              <button disabled={page * 50 >= orders.totalCount} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40">Sau</button>
            </div>
          )}
        </div>
      )}

      {/* TAB: Cấu hình phí */}
      {tab === 'fee-config' && (
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            Các tỷ lệ dưới đây là <strong>ước tính cho demo</strong>.
            Phí thực tế phụ thuộc vào hợp đồng với từng sàn thương mại điện tử và
            chính sách thanh toán. Cần tích hợp Finance API / Settlement Report để có số liệu chính xác.
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Kênh','Phí sàn','Phí TT','Chi phí đóng gói','Loại',''].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feeConfs.map(cfg => (
                  <FeeConfigRow key={cfg.feeConfigId} cfg={cfg} onSave={handleSaveConfig} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
