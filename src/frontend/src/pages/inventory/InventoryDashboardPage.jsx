import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Chart, registerables } from 'chart.js'
import {
  getInventoryOverview,
  getStockMovement,
  getLowStock,
  getProductVelocity,
  getSupplierPerformanceDashboard,
  getInventoryRecommendations,
} from '../../api/inventoryApi'
import AiEmptyState from '../../components/ui/AiEmptyState'

Chart.register(...registerables)

const RISK_CFG = {
  CRITICAL: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', label: 'Khẩn cấp' },
  HIGH:     { color: '#F97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)', label: 'Cao' },
  MEDIUM:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'Trung bình' },
  LOW:      { color: '#22C55E', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  label: 'Thấp' },
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="lcard p-4">
      <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: color ?? 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-base font-semibold mt-6 mb-3" style={{ color: 'var(--text-primary)' }}>
      {children}
    </h2>
  )
}

function EmptyState({ message = 'Không có dữ liệu' }) {
  return (
    <div className="lcard p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
      {message}
    </div>
  )
}

function ErrorState({ label }) {
  return (
    <div className="lcard p-6 text-center text-sm" style={{ color: 'var(--text-tertiary)', border: '1px dashed var(--border)' }}>
      Không tải được {label} — vui lòng kiểm tra kết nối.
    </div>
  )
}

// ── Stock Movement Chart ──────────────────────────────────────────────────────
function StockMovementChart({ data }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0 || !canvasRef.current) return
    if (chartRef.current) chartRef.current.destroy()

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels:   data.map(d => d.date),
        datasets: [
          {
            label:           'Nhập kho',
            data:            data.map(d => d.stockIn),
            backgroundColor: 'rgba(34,197,94,0.7)',
            borderColor:     '#22C55E',
            borderWidth:     1,
          },
          {
            label:           'Xuất kho',
            data:            data.map(d => d.stockOut),
            backgroundColor: 'rgba(239,68,68,0.7)',
            borderColor:     '#EF4444',
            borderWidth:     1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: 'var(--text-secondary)', font: { size: 11 } } },
          tooltip: { mode: 'index' },
        },
        scales: {
          x: { ticks: { color: 'var(--text-tertiary)', maxRotation: 45, font: { size: 10 } }, grid: { color: 'var(--border)' } },
          y: { ticks: { color: 'var(--text-tertiary)', font: { size: 11 } }, grid: { color: 'var(--border)' } },
        },
      },
    })
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [data])

  if (!data || data.length === 0) return <EmptyState message="Chưa có giao dịch trong khoảng thời gian này" />
  return <div style={{ height: 240, position: 'relative' }}><canvas ref={canvasRef} /></div>
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InventoryDashboardPage() {
  const navigate = useNavigate()
  const [overview,    setOverview]    = useState(null)
  const [movement,    setMovement]    = useState(null)
  const [lowStock,    setLowStock]    = useState(null)
  const [velocity,    setVelocity]    = useState(null)
  const [suppliers,   setSuppliers]   = useState(null)
  const [recs,        setRecs]        = useState(null)
  const [errors,      setErrors]      = useState({})
  const [loadingMain, setLoadingMain] = useState(true)
  const [movDays,     setMovDays]     = useState(30)

  const setErr = (key) => setErrors(e => ({ ...e, [key]: true }))

  useEffect(() => {
    setLoadingMain(true)
    Promise.allSettled([
      getInventoryOverview(),
      getLowStock({ threshold: 20, pageSize: 10 }),
      getProductVelocity({ days: 30 }),
      getSupplierPerformanceDashboard(),
      getInventoryRecommendations({ targetDays: 30, topN: 10 }),
    ]).then(([ov, ls, vel, sup, rec]) => {
      if (ov.status  === 'fulfilled') setOverview(ov.value);   else setErr('overview')
      if (ls.status  === 'fulfilled') setLowStock(ls.value);   else setErr('lowStock')
      if (vel.status === 'fulfilled') setVelocity(vel.value);  else setErr('velocity')
      if (sup.status === 'fulfilled') setSuppliers(sup.value); else setErr('suppliers')
      if (rec.status === 'fulfilled') setRecs(rec.value);      else setErr('recs')
      setLoadingMain(false)
    })
  }, [])

  useEffect(() => {
    getStockMovement({ days: movDays })
      .then(setMovement)
      .catch(() => setErr('movement'))
  }, [movDays])

  const fmt = (n) => n == null ? '—' : n.toLocaleString('vi-VN')
  const fmtCur = (n) => n == null ? '—' : `${(+n).toLocaleString('vi-VN')}₫`
  const fmtPct = (n) => n == null ? '—' : `${(+n * 100).toFixed(1)}%`

  return (
    <div className="space-y-4">
      {!overview && !loadingMain && <AiEmptyState title="Không kết nối được dữ liệu tồn kho" />}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Dashboard Tồn kho</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Tổng quan vận hành tồn kho, nhà cung cấp và gợi ý nhập hàng
          </p>
        </div>
        <Link to="/inventory"
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          ← Thông minh Tồn kho (AI)
        </Link>
      </div>

      {/* ── KPI Overview ── */}
      {loadingMain ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="lcard p-4 animate-pulse h-20" style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      ) : errors.overview ? (
        <ErrorState label="KPI tổng quan" />
      ) : overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Tổng sản phẩm"      value={fmt(overview.totalProducts)}        />
          <KpiCard label="Tổng tồn kho"        value={fmt(overview.totalStockQuantity)}   />
          <KpiCard label="Tồn kho thấp"        value={fmt(overview.lowStockCount)}        color="#F59E0B" />
          <KpiCard label="Hết hàng"            value={fmt(overview.outOfStockCount)}      color="#EF4444" />
          <KpiCard label="Nhập kho hôm nay"    value={`+${fmt(overview.stockInToday)}`}   color="#22C55E" />
          <KpiCard label="Xuất kho hôm nay"    value={`-${fmt(overview.stockOutToday)}`}  color="#EF4444" />
          <KpiCard label="Giá trị tồn kho"     value={fmtCur(overview.inventoryValue)}    />
          <KpiCard label="PO đang chờ"
            value={fmt(overview.pendingPurchaseOrders + overview.approvedPurchaseOrders)}
            sub={`${fmt(overview.partiallyReceivedPurchaseOrders)} đang nhận hàng`}
            color={overview.pendingPurchaseOrders > 0 ? '#F97316' : undefined}
          />
        </div>
      )}

      {/* ── Stock Movement Chart ── */}
      <div className="lcard p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Biến động tồn kho
          </h2>
          <select value={movDays} onChange={e => setMovDays(+e.target.value)} className="linput text-xs" style={{ width: 110 }}>
            <option value={7}>7 ngày</option>
            <option value={14}>14 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={60}>60 ngày</option>
          </select>
        </div>
        {errors.movement ? <ErrorState label="biểu đồ biến động" /> : <StockMovementChart data={movement} />}
      </div>

      {/* ── Low Stock ── */}
      <SectionTitle>Sản phẩm sắp hết hàng</SectionTitle>
      {errors.lowStock ? <ErrorState label="danh sách tồn kho thấp" /> : !lowStock || lowStock.length === 0 ? (
        <EmptyState message="Không có sản phẩm dưới ngưỡng tồn kho" />
      ) : (
        <div className="lcard overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Sản phẩm', 'SKU', 'Tồn kho', 'Bán/ngày', 'Còn lại', 'Cần nhập', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lowStock.map(item => (
                <tr key={item.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{item.productName}</td>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.sku ?? '—'}</td>
                  <td className="px-4 py-2 font-bold" style={{ color: item.stockQuantity === 0 ? '#EF4444' : '#F59E0B' }}>
                    {fmt(item.stockQuantity)}
                  </td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{item.avgDailySales}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>
                    {item.estimatedDaysLeft != null ? `${item.estimatedDaysLeft}d` : '∞'}
                  </td>
                  <td className="px-4 py-2 font-semibold" style={{ color: item.recommendedReorderQuantity > 0 ? '#F97316' : 'var(--text-tertiary)' }}>
                    {item.recommendedReorderQuantity > 0 ? `+${fmt(item.recommendedReorderQuantity)}` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Nút chính: điều chỉnh tồn kho trực tiếp — không cần PO */}
                      <button
                        onClick={() => navigate(`/stock-adjustments?productId=${item.productId}`)}
                        className="text-xs px-3 py-1 rounded-lg font-semibold whitespace-nowrap flex items-center gap-1"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <span style={{ fontSize: 12 }}>↑</span> Nhập kho
                      </button>
                      {/* Nút phụ: tạo PO đặt hàng nhà cung cấp */}
                      <button
                        onClick={() => navigate(`/purchase-orders?productId=${item.productId}&productName=${encodeURIComponent(item.productName)}`)}
                        className="text-xs px-2 py-1 rounded-lg whitespace-nowrap"
                        style={{ background: 'transparent', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}
                        title="Tạo phiếu đặt hàng nhà cung cấp">
                        Đặt hàng NCC
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Product Velocity ── */}
      <SectionTitle>Tốc độ bán hàng</SectionTitle>
      {errors.velocity ? <ErrorState label="phân tích tốc độ bán" /> : !velocity ? null : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Fast movers */}
          <div className="lcard p-4">
            <div className="text-xs font-semibold mb-2" style={{ color: '#22C55E' }}>
              ⚡ Bán chạy nhất ({velocity.topFastMovingProducts?.length ?? 0})
            </div>
            {velocity.topFastMovingProducts?.length === 0
              ? <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Chưa có dữ liệu</div>
              : velocity.topFastMovingProducts?.slice(0, 5).map(p => (
                <div key={p.productId} className="flex justify-between py-1 text-xs">
                  <span className="truncate mr-2" style={{ color: 'var(--text-secondary)' }}>{p.productName}</span>
                  <span className="font-bold shrink-0" style={{ color: '#22C55E' }}>{fmt(p.totalSold)}</span>
                </div>
              ))
            }
          </div>
          {/* Slow movers */}
          <div className="lcard p-4">
            <div className="text-xs font-semibold mb-2" style={{ color: '#F59E0B' }}>
              🐢 Bán chậm ({velocity.slowMovingProducts?.length ?? 0})
            </div>
            {velocity.slowMovingProducts?.length === 0
              ? <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Không có</div>
              : velocity.slowMovingProducts?.slice(0, 5).map(p => (
                <div key={p.productId} className="flex justify-between py-1 text-xs">
                  <span className="truncate mr-2" style={{ color: 'var(--text-secondary)' }}>{p.productName}</span>
                  <span className="font-bold shrink-0" style={{ color: '#F59E0B' }}>{fmt(p.totalSold)}</span>
                </div>
              ))
            }
          </div>
          {/* Dead stock */}
          <div className="lcard p-4">
            <div className="text-xs font-semibold mb-2" style={{ color: '#EF4444' }}>
              💀 Không bán ({velocity.deadStockProducts?.length ?? 0})
            </div>
            {velocity.deadStockProducts?.length === 0
              ? <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Không có</div>
              : velocity.deadStockProducts?.slice(0, 5).map(p => (
                <div key={p.productId} className="flex justify-between py-1 text-xs">
                  <span className="truncate mr-2" style={{ color: 'var(--text-secondary)' }}>{p.productName}</span>
                  <span className="font-bold shrink-0" style={{ color: '#EF4444' }}>Tồn: {fmt(p.stockQuantity)}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Supplier Performance ── */}
      <SectionTitle>Hiệu suất Nhà cung cấp</SectionTitle>
      {errors.suppliers ? <ErrorState label="hiệu suất nhà cung cấp" /> : !suppliers || suppliers.length === 0 ? (
        <EmptyState message="Chưa có dữ liệu nhà cung cấp — tạo phiếu đặt hàng đầu tiên để theo dõi" />
      ) : (
        <div className="lcard overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nhà cung cấp','Số PO','SL đã nhận','Tổng giá trị','Tỷ lệ hoàn thành','Lần cuối nhập'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs font-medium"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.supplierId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="px-4 py-2 font-medium" style={{ color: 'var(--text-primary)' }}>{s.supplierName}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{fmt(s.totalPurchaseOrders)}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{fmt(s.totalReceivedQuantity)}</td>
                  <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{fmtCur(s.totalReceivedAmount)}</td>
                  <td className="px-4 py-2 font-semibold"
                    style={{ color: s.fulfillmentRate == null ? 'var(--text-tertiary)' : s.fulfillmentRate >= 0.9 ? '#22C55E' : '#F59E0B' }}>
                    {fmtPct(s.fulfillmentRate)}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {s.lastReceiptDate ? new Date(s.lastReceiptDate).toLocaleDateString('vi-VN') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Recommendations ── */}
      <SectionTitle>Gợi ý nhập hàng</SectionTitle>
      {errors.recs ? <ErrorState label="gợi ý nhập hàng" /> : !recs || recs.count === 0 ? (
        <EmptyState message="Không có sản phẩm nào cần chú ý — tồn kho đang ổn định" />
      ) : (
        <div className="space-y-2">
          {recs.items?.map(item => {
            const cfg = RISK_CFG[item.riskLevel] ?? RISK_CFG.LOW
            return (
              <div key={item.productId} className="rounded-xl p-4"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: cfg.color + '20', color: cfg.color }}>
                        {cfg.label}
                      </span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.productName}</span>
                      {item.sku && <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{item.sku}</span>}
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{item.reason}</p>
                    <p className="text-xs mt-0.5 font-medium" style={{ color: cfg.color }}>{item.recommendedAction}</p>
                    {item.lastSupplier && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        NCC gần nhất: {item.lastSupplier}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-4 text-right text-sm shrink-0">
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Tồn kho</div>
                      <div className="font-bold" style={{ color: cfg.color }}>{fmt(item.currentStock)}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Bán/ngày</div>
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{item.avgDailySales}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Còn lại</div>
                      <div className="font-bold" style={{ color: cfg.color }}>
                        {item.estimatedDaysLeft != null ? `${item.estimatedDaysLeft}d` : '∞'}
                      </div>
                    </div>
                    {item.recommendedReorderQuantity > 0 && (
                      <div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Cần nhập</div>
                        <div className="font-bold" style={{ color: '#F97316' }}>+{fmt(item.recommendedReorderQuantity)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div className="text-xs pt-1" style={{ color: 'var(--text-tertiary)' }}>
            Dự trên dữ liệu bán thực tế 30 ngày gần nhất — không phải dự đoán AI
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 pt-2">
        {[
          { to: '/inventory/transactions', label: 'Lịch sử giao dịch' },
          { to: '/purchase-orders',        label: 'Phiếu đặt hàng' },
          { to: '/goods-receipts',         label: 'Phiếu nhập kho' },
          { to: '/suppliers',              label: 'Nhà cung cấp' },
        ].map(l => (
          <Link key={l.to} to={l.to}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            {l.label} →
          </Link>
        ))}
      </div>
    </div>
  )
}
