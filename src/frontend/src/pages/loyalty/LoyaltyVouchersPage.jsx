import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DetailDrawer from '../../components/ui/DetailDrawer'

// ── Helper: field row — label ngắn, hint dưới input ───────────────────────
function FieldRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold"
             style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
      {hint && (
        <span className="text-xs leading-tight" style={{ color: 'var(--text-tertiary)', opacity: 0.65 }}>{hint}</span>
      )}
    </div>
  )
}

// ── Type badge helper ──────────────────────────────────────────────────────
const TYPE_COLORS = {
  PERCENT:  { bg: 'rgba(99,102,241,0.1)',  color: 'var(--primary-500)' },
  FIXED:    { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B' },
  FREESHIP: { bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
}

// ── Form fields dùng chung cho cả Create và Edit ───────────────────────────
function VoucherFormFields({ v, setV }) {
  const pct = v.type === 'PERCENT'
  return (
    <div className="flex flex-col">

      {/* ── Thông tin cơ bản ── */}
      <div className="px-5 pt-5 pb-5 grid grid-cols-2 gap-x-4 gap-y-4"
           style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="col-span-2 flex items-center gap-2 mb-1">
          <span className="icon text-sm" style={{ color: 'var(--primary-500)' }}>sell</span>
          <span className="text-xs font-bold" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Thông tin voucher
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        <FieldRow label="Mã voucher">
          <input
            value={v.code}
            onChange={e => setV(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            className="linput !h-10 font-mono font-bold"
            style={{ fontSize: 13, letterSpacing: '0.05em' }}
            placeholder="VD: SALE10"
          />
        </FieldRow>

        <FieldRow label="Loại">
          <select
            value={v.type}
            onChange={e => setV(p => ({ ...p, type: e.target.value }))}
            className="linput !h-10 text-sm"
          >
            <option value="PERCENT">🏷 Giảm theo %</option>
            <option value="FIXED">💰 Giảm cố định</option>
            <option value="FREESHIP">🚚 Freeship</option>
          </select>
        </FieldRow>

        {/* Badge mô tả loại */}
        <div className="col-span-2 -mt-1">
          {(() => {
            const c = TYPE_COLORS[v.type] ?? TYPE_COLORS.FIXED
            const txt = v.type === 'PERCENT' ? 'Giảm theo % — có thể đặt mức giảm tối đa'
              : v.type === 'FIXED' ? 'Giảm số tiền cố định trên đơn hàng'
              : 'Miễn toàn bộ phí vận chuyển'
            return (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
                   style={{ background: c.bg, color: c.color }}>
                <span className="icon" style={{ fontSize: 13 }}>info</span>
                {txt}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Giá trị & giới hạn ── */}
      <div className="px-5 pt-5 pb-5 grid grid-cols-2 gap-x-4 gap-y-5"
           style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="col-span-2 flex items-center gap-2 mb-1">
          <span className="icon text-sm" style={{ color: '#F59E0B' }}>tune</span>
          <span className="text-xs font-bold" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Giá trị & giới hạn
          </span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Giá trị */}
        <FieldRow label={pct ? 'Phần trăm' : 'Số tiền'}>
          <div className="relative">
            <input type="number" min={0}
              value={v.value}
              onChange={e => setV(p => ({ ...p, value: e.target.value }))}
              className="linput !h-10 text-sm pr-9"
              placeholder={pct ? '10' : '50000'}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                  style={{ color: 'var(--text-tertiary)' }}>
              {pct ? '%' : '₫'}
            </span>
          </div>
        </FieldRow>

        {/* Giảm tối đa (chỉ PERCENT) */}
        {pct ? (
          <FieldRow label="Giảm tối đa" hint="Để trống = không giới hạn">
            <div className="relative">
              <input type="number" min={0}
                value={v.maxDiscount}
                onChange={e => setV(p => ({ ...p, maxDiscount: e.target.value }))}
                className="linput !h-10 text-sm pr-9"
                placeholder="—"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                    style={{ color: 'var(--text-tertiary)' }}>₫</span>
            </div>
          </FieldRow>
        ) : <div />}

        {/* Đơn tối thiểu */}
        <FieldRow label="Đơn tối thiểu" hint="0 = không yêu cầu">
          <div className="relative">
            <input type="number" min={0}
              value={v.minOrder}
              onChange={e => setV(p => ({ ...p, minOrder: e.target.value }))}
              className="linput !h-10 text-sm pr-9"
              placeholder="0"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                  style={{ color: 'var(--text-tertiary)' }}>₫</span>
          </div>
        </FieldRow>

        {/* Số lần dùng */}
        <FieldRow label="Lượt dùng tối đa" hint="Để trống = không giới hạn">
          <input type="number" min={0}
            value={v.usageLimit}
            onChange={e => setV(p => ({ ...p, usageLimit: e.target.value }))}
            className="linput !h-10 text-sm"
            placeholder="—"
          />
        </FieldRow>
      </div>

      {/* ── Thời hạn ── */}
      <div className="px-5 pt-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-4"
           style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="col-span-2 flex items-center gap-1.5 mb-1">
          <span className="icon text-sm" style={{ color: '#10B981' }}>schedule</span>
          <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--text-tertiary)' }}>Thời hạn hiệu lực</span>
          <div className="flex-1 h-px ml-1" style={{ background: 'var(--border)' }} />
        </div>

        <FieldRow label="Hiệu lực từ">
          <input type="datetime-local" value={v.validFrom}
                 onChange={e => setV(p => ({ ...p, validFrom: e.target.value }))}
                 className="linput !h-10 text-sm" />
        </FieldRow>

        <FieldRow label="Hiệu lực đến">
          <input type="datetime-local" value={v.validTo}
                 onChange={e => setV(p => ({ ...p, validTo: e.target.value }))}
                 className="linput !h-10 text-sm" />
        </FieldRow>
      </div>

      {/* ── Trạng thái (chỉ edit) ── */}
      {'isActive' in v && (
        <div className="px-5 py-4 flex items-center justify-between"
             style={{ borderTop: '1px solid var(--border)' }}>
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Trạng thái voucher</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {v.isActive ? 'Voucher đang hoạt động và có thể sử dụng' : 'Voucher đã bị tắt, không thể áp dụng'}
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
            <input
              type="checkbox"
              className="sr-only"
              checked={v.isActive}
              onChange={e => setV(p => ({ ...p, isActive: e.target.checked }))}
            />
            <div
              className="w-11 h-6 rounded-full transition-colors duration-200"
              style={{
                background: v.isActive ? 'var(--primary-500)' : 'var(--border)',
                position: 'relative',
              }}
            >
              <div
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: v.isActive ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </div>
          </label>
        </div>
      )}
    </div>
  )
}

// ── Empty state mặc định cho newV ─────────────────────────────────────────
const emptyNew = { code: '', type: 'PERCENT', value: '', minOrder: '', maxDiscount: '', usageLimit: '', validFrom: '', validTo: '' }

// ── Main ──────────────────────────────────────────────────────────────────
export default function LoyaltyVouchersPage() {
  const { t } = useTranslation()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [err,     setErr]     = useState('')

  // Voucher list
  const [vouchers, setVouchers]         = useState([])
  const [vLoad,    setVLoad]            = useState(false)
  const [vErr,     setVErr]             = useState('')
  const [voucherConfirmDlg, setVoucherConfirmDlg] = useState(null)

  // Create drawer
  const [showCreate, setShowCreate] = useState(false)
  const [newV,       setNewV]       = useState(emptyNew)
  const [creating,   setCreating]   = useState(false)

  // Edit drawer
  const [editV,    setEditV]    = useState(null)   // null = đóng
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    axios.get('/api/pos/loyalty/config')
      .then(r => setConfig(r.data))
      .catch(() => setConfig({ pointsPerVnd: 1000, vndPerPoint: 1000, minRedeemPoints: 100, pointExpiryDays: 365, isActive: true }))
      .finally(() => setLoading(false))
    loadVouchers()
  }, [])

  const loadVouchers = () => {
    setVLoad(true)
    axios.get('/api/pos/vouchers')
      .then(r => setVouchers(r.data ?? []))
      .catch(() => setVouchers([]))
      .finally(() => setVLoad(false))
  }

  const saveConfig = async () => {
    setSaving(true); setMsg(''); setErr('')
    try {
      await axios.put('/api/pos/loyalty/config', config)
      setMsg('Đã lưu cấu hình tích điểm')
    } catch { setErr('Lỗi lưu cấu hình') }
    finally { setSaving(false) }
  }

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setVErr(''); setCreating(true)
    try {
      await axios.post('/api/pos/vouchers', {
        ...newV,
        value:        Number(newV.value),
        minOrderValue: Number(newV.minOrder || 0),
        maxDiscount:  newV.maxDiscount ? Number(newV.maxDiscount) : null,
        usageLimit:   newV.usageLimit  ? Number(newV.usageLimit)  : null,
      })
      setShowCreate(false)
      setNewV(emptyNew)
      loadVouchers()
    } catch (e) {
      setVErr(e?.response?.data?.message ?? 'Lỗi tạo voucher')
    } finally { setCreating(false) }
  }

  // ── Open edit drawer ─────────────────────────────────────────────────────
  const openEdit = (v) => {
    setVErr('')
    const toLocal = iso => iso ? iso.slice(0, 16) : ''
    setEditV({
      id:          v.id,
      code:        v.code,
      type:        v.type,
      value:       String(v.value),
      minOrder:    String(v.minOrderValue ?? 0),
      maxDiscount: v.maxDiscount != null ? String(v.maxDiscount) : '',
      usageLimit:  v.usageLimit  != null ? String(v.usageLimit)  : '',
      validFrom:   toLocal(v.validFrom),
      validTo:     toLocal(v.validTo),
      isActive:    v.isActive,
    })
  }

  // ── Save edit ────────────────────────────────────────────────────────────
  const handleSaveEdit = async () => {
    setVErr(''); setEditSaving(true)
    try {
      await axios.put(`/api/pos/vouchers/${editV.id}`, {
        ...editV,
        value:         Number(editV.value),
        minOrderValue: Number(editV.minOrder || 0),
        maxDiscount:   editV.maxDiscount ? Number(editV.maxDiscount) : null,
        usageLimit:    editV.usageLimit  ? Number(editV.usageLimit)  : null,
      })
      setEditV(null)
      loadVouchers()
    } catch (e) {
      setVErr(e?.response?.data?.message ?? 'Lỗi cập nhật voucher')
    } finally { setEditSaving(false) }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteVoucher = (id, code) => setVoucherConfirmDlg({ id, code })

  const doDeleteVoucher = async (id) => {
    setVErr('')
    try {
      await axios.delete(`/api/pos/vouchers/${id}`)
      loadVouchers()
    } catch (e) { setVErr(e?.response?.data?.message ?? 'Lỗi xóa voucher') }
  }

  if (loading) return (
    <div className="lcard p-10 flex justify-center">
      <span className="icon animate-spin text-2xl" style={{ color: 'var(--primary-500)' }}>refresh</span>
    </div>
  )

  const field = (label, key, type = 'number') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input type={type} value={config[key] ?? ''} onChange={e => setConfig(c => ({ ...c, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
             className="linput !h-9 text-sm" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Confirm xóa */}
      <ConfirmDialog
        open={!!voucherConfirmDlg}
        title="Xóa voucher"
        message={voucherConfirmDlg ? `Xóa voucher "${voucherConfirmDlg.code}"?` : ''}
        icon="delete_forever"
        danger
        onClose={() => setVoucherConfirmDlg(null)}
        onConfirm={() => { const id = voucherConfirmDlg?.id; setVoucherConfirmDlg(null); doDeleteVoucher(id) }}
      />

      {/* ── Drawer TẠO voucher ────────────────────────────────────────────── */}
      <DetailDrawer
        open={showCreate}
        onClose={() => { setShowCreate(false); setVErr(''); setNewV(emptyNew) }}
        title="Tạo voucher mới"
        subtitle="Điền đầy đủ thông tin để tạo mã giảm giá"
        width={480}
        footer={
          <>
            <button
              onClick={() => { setShowCreate(false); setVErr(''); setNewV(emptyNew) }}
              className="lbtn lbtn-secondary flex-1 !h-9 text-sm"
            >
              Hủy
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="lbtn lbtn-primary flex-1 !h-9 text-sm"
            >
              {creating ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><span className="icon" style={{ fontSize: 16 }}>add</span> Tạo voucher</>
              )}
            </button>
          </>
        }
      >
        <VoucherFormFields v={newV} setV={setNewV} />
        {vErr && !editV && (
          <p className="px-5 pb-4 text-xs" style={{ color: '#EF4444' }}>{vErr}</p>
        )}
      </DetailDrawer>

      {/* ── Drawer CHỈNH SỬA voucher ─────────────────────────────────────── */}
      <DetailDrawer
        open={!!editV}
        onClose={() => { setEditV(null); setVErr('') }}
        title={editV ? `Sửa voucher — ${editV.code}` : ''}
        subtitle="Cập nhật thông tin voucher"
        width={480}
        footer={
          <>
            <button
              onClick={() => { setEditV(null); setVErr('') }}
              className="lbtn lbtn-secondary flex-1 !h-9 text-sm"
            >
              Hủy
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={editSaving}
              className="lbtn lbtn-primary flex-1 !h-9 text-sm"
            >
              {editSaving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><span className="icon" style={{ fontSize: 16 }}>save</span> Lưu thay đổi</>
              )}
            </button>
          </>
        }
      >
        {editV && <VoucherFormFields v={editV} setV={setEditV} />}
        {vErr && editV && (
          <p className="px-5 pb-4 text-xs" style={{ color: '#EF4444' }}>{vErr}</p>
        )}
      </DetailDrawer>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Loyalty &amp; Voucher</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Quản lý chính sách tích điểm thành viên và mã giảm giá khuyến mãi</p>
      </div>

      <div className="space-y-5">
        {/* Loyalty config */}
        <div className="lcard p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Cấu hình tích điểm</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Kích hoạt</span>
              <input type="checkbox" checked={config.isActive} onChange={e => setConfig(c => ({ ...c, isActive: e.target.checked }))} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('VND để tích 1 điểm', 'pointsPerVnd')}
            {field('1 điểm = bao nhiêu VND (quy đổi)', 'vndPerPoint')}
            {field('Điểm tối thiểu để đổi', 'minRedeemPoints')}
            {field('Điểm hết hạn sau (ngày)', 'pointExpiryDays')}
          </div>
          {msg && <p className="text-xs" style={{ color: 'var(--accent-500)' }}>{msg}</p>}
          {err && <p className="text-xs" style={{ color: '#EF4444' }}>{err}</p>}
          <button onClick={saveConfig} disabled={saving} className="lbtn lbtn-primary !h-9">
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>

        {/* Vouchers */}
        <div className="lcard p-5 space-y-4">
          {vErr && !editV && !showCreate && (
            <p className="text-xs px-1" style={{ color: '#EF4444' }}>{vErr}</p>
          )}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Danh sách Voucher</h3>
            <button
              onClick={() => { setShowCreate(true); setVErr('') }}
              className="lbtn lbtn-primary !h-8 !px-4 text-xs gap-1"
            >
              <span className="icon" style={{ fontSize: 14 }}>add</span> Tạo voucher
            </button>
          </div>

          {vLoad ? (
            <div className="py-6 flex justify-center">
              <span className="icon animate-spin" style={{ color: 'var(--primary-500)' }}>refresh</span>
            </div>
          ) : vouchers.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>Chưa có voucher nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Mã', 'Loại', 'Giá trị', 'Giảm tối đa', 'Đơn tối thiểu', 'Số lần dùng', 'Hiệu lực', 'Trạng thái', 'Thao tác'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map(v => (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="px-3 py-2 font-mono font-bold" style={{ color: 'var(--primary-500)' }}>{v.code}</td>
                      <td className="px-3 py-2">
                        {v.type === 'PERCENT' ? `Giảm ${v.value}%`
                          : v.type === 'FIXED' ? `Giảm ${new Intl.NumberFormat('vi-VN').format(v.value)}đ`
                          : 'Freeship'}
                      </td>
                      <td className="px-3 py-2 font-mono">{new Intl.NumberFormat('vi-VN').format(v.value)}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {v.maxDiscount != null
                          ? new Intl.NumberFormat('vi-VN').format(v.maxDiscount) + 'đ'
                          : <span style={{ opacity: 0.4 }}>—</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">{new Intl.NumberFormat('vi-VN').format(v.minOrderValue ?? 0)}</td>
                      <td className="px-3 py-2 text-center">{v.usedCount ?? 0}{v.usageLimit ? ` / ${v.usageLimit}` : ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(v.validFrom).toLocaleDateString('vi-VN')} → {new Date(v.validTo).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-xs"
                          style={{ background: v.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: v.isActive ? '#10B981' : '#EF4444' }}>
                          {v.isActive ? 'Đang dùng' : 'Đã tắt'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(v)} title="Sửa"
                            className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                            style={{ color: 'var(--primary-500)', background: 'rgba(99,102,241,0.08)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}>
                            <span className="icon" style={{ fontSize: 15 }}>edit</span>
                          </button>
                          <button onClick={() => deleteVoucher(v.id, v.code)} title="Xóa"
                            className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                            style={{ color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}>
                            <span className="icon" style={{ fontSize: 15 }}>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
