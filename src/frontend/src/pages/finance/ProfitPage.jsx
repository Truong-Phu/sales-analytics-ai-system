import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  getProfitOverview, getProfitByChannel, getProfitByProduct,
  getProfitByDate, getProfitOrders, getFeeConfigs, updateFeeConfig,
} from '../../api/financeApi'

// ── Mock data dự phòng ────────────────────────────────────────────────────────
const MOCK_OVERVIEW = {
  revenue: 1265592450, cogs: 622890800, grossProfit: 642701650,
  estimatedFees: 37967774, estimatedNetProfit: 604733876,
  grossMargin: 50.8, estimatedNetMargin: 47.8,
  missingCostOrders: 0, isEstimated: true,
}
const MOCK_CHANNELS = [
  { channel: 'shopee',      revenue: 600000000, cogs: 295000000, grossProfit: 305000000, estimatedFees: 18000000, estimatedNetProfit: 287000000, grossMargin: 50.8, estimatedNetMargin: 47.8, orderCount: 1103 },
  { channel: 'tiktok',      revenue: 380000000, cogs: 187000000, grossProfit: 193000000, estimatedFees: 10500000, estimatedNetProfit: 182500000, grossMargin: 50.8, estimatedNetMargin: 48.0, orderCount: 661  },
  { channel: 'lazada',      revenue: 284000000, cogs: 140000000, grossProfit: 144000000, estimatedFees: 9400000,  estimatedNetProfit: 134600000, grossMargin: 50.7, estimatedNetMargin: 47.4, orderCount: 551  },
  { channel: 'Bán tại quầy', revenue: 1600000,  cogs:  800000,  grossProfit:  800000,   estimatedFees: 0,        estimatedNetProfit:  800000,   grossMargin: 50.0, estimatedNetMargin: 50.0, orderCount: 7    },
]
const MOCK_CONFIGS = [
  { feeConfigId: 1, channelName: 'SHOPEE',      platformFeeRate: 0.025, paymentFeeRate: 0.005, fixedFeePerOrder: 0, packagingCostPerOrder: 2000, shippingCostMode: 'USE_ORDER_SHIPPING_FEE', isEstimated: true,  note: 'Estimated for demo' },
  { feeConfigId: 2, channelName: 'TIKTOK_SHOP', platformFeeRate: 0.020, paymentFeeRate: 0.005, fixedFeePerOrder: 0, packagingCostPerOrder: 2000, shippingCostMode: 'USE_ORDER_SHIPPING_FEE', isEstimated: true,  note: 'Estimated for demo' },
  { feeConfigId: 3, channelName: 'LAZADA',      platformFeeRate: 0.030, paymentFeeRate: 0.005, fixedFeePerOrder: 0, packagingCostPerOrder: 2000, shippingCostMode: 'USE_ORDER_SHIPPING_FEE', isEstimated: true,  note: 'Estimated for demo' },
  { feeConfigId: 4, channelName: 'OFFLINE',     platformFeeRate: 0.000, paymentFeeRate: 0.000, fixedFeePerOrder: 0, packagingCostPerOrder: 0,    shippingCostMode: 'ZERO',                   isEstimated: false, note: 'POS' },
]

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

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'blue', estimated }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    teal:   'bg-teal-50 border-teal-200 text-teal-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-xs font-medium opacity-70 mb-1">
        {label}{estimated && <span className="ml-1 text-[10px] opacity-60">(ước tính)</span>}
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
  const [loading,   setLoading]   = useState(false)
  const [useMock,   setUseMock]   = useState(false)
  const [page,      setPage]      = useState(1)

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
      setUseMock(false)
    } catch {
      setOverview(MOCK_OVERVIEW); setChannels(MOCK_CHANNELS)
      setProducts([]); setByDate([]); setOrders({ items: [], totalCount: 0 })
      setFeeConfs(MOCK_CONFIGS); setUseMock(true)
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

  const ov = overview || MOCK_OVERVIEW

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Phân tích lợi nhuận</h1>
          <p className="text-sm text-gray-500">Revenue · COGS · Gross Profit · Estimated Net Profit</p>
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
      {ov.isEstimated && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-4 py-3 text-sm text-yellow-800 flex gap-2">
          <span className="text-lg leading-none">⚠</span>
          <span>
            <strong>Lợi nhuận ròng đang là ước tính</strong> vì hệ thống chưa tích hợp
            báo cáo đối soát / Finance API từ sàn. Phí sàn và phí thanh toán được tính theo
            tỷ lệ cấu hình. Kết quả phù hợp cho mục đích demo và phân tích xu hướng.
          </span>
        </div>
      )}

      {useMock && (
        <div className="bg-amber-100 border border-amber-400 rounded-lg px-4 py-2 text-sm text-amber-800">
          Đang dùng dữ liệu mẫu — backend chưa kết nối.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Doanh thu"           value={fmtM(ov.revenue)}            color="blue"   />
        <KpiCard label="Giá vốn (COGS)"      value={fmtM(ov.cogs)}               color="orange" />
        <KpiCard label="Lợi nhuận gộp"       value={fmtM(ov.grossProfit)}         color="green"  />
        <KpiCard label="Phí ước tính"        value={fmtM(ov.estimatedFees)}       color="red"    estimated />
        <KpiCard label="LN ròng ước tính"    value={fmtM(ov.estimatedNetProfit)}  color="teal"   estimated />
        <KpiCard label="Biên lợi nhuận gộp"  value={fmtPct(ov.grossMargin)}       color="purple" />
        <KpiCard label="Biên LN ròng (ước)"  value={fmtPct(ov.estimatedNetMargin)} color="yellow" estimated />
      </div>

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
                  <Bar dataKey="grossProfit"        name="Lợi nhuận gộp"      fill="#22c55e" />
                  <Bar dataKey="estimatedNetProfit" name="LN ròng ước tính"   fill="#14b8a6" />
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
                {['Kênh','Đơn','Doanh thu','Giá vốn','LN Gộp','Biên gộp','Phí (ước)','LN Ròng (ước)','Biên ròng'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-600">{h}</th>
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
                  <td className="py-2 px-3 text-teal-700 font-semibold">{fmtM(c.estimatedNetProfit)}</td>
                  <td className="py-2 px-3">{fmtPct(c.estimatedNetMargin)}</td>
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
