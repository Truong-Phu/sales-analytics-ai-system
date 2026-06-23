import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import DetailDrawer from '../../components/ui/DetailDrawer'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { getCustomers, createCustomer, updateCustomer, deactivateCustomer, getCustomerOrderHistory, getOltpCustomer } from '../../api/dashboardApi'
import { useAuth } from '../../hooks/useAuth'
import { useDebounce } from '../../hooks/useDebounce'
import { exportToCsv } from '../../utils/format'
import i18n from '../../i18n'

// Xử lý segment_label có thể là string hoặc object {vi, en}
function resolveSegment(seg) {
  if (!seg) return 'NEW'
  if (typeof seg === 'string') return seg.toUpperCase()
  const lang = i18n.language?.startsWith('en') ? 'en' : 'vi'
  return (seg[lang] ?? seg.vi ?? seg.en ?? 'NEW').toUpperCase()
}

const EMPTY_CUST = { fullName: '', email: '', phoneNumber: '', address: '', province: '', district: '', ward: '' }
const dateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
const todayKey = () => dateKey(new Date())
const daysAgoKey = (days) => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return dateKey(date)
}
const firstDayOfMonthKey = () => {
  const date = new Date()
  date.setDate(1)
  return dateKey(date)
}
const CUSTOMER_TIME_OPTIONS = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'last7days', label: '7 ngày' },
  { value: 'mtd', label: 'Tháng này' },
  { value: 'custom', label: 'Tùy chỉnh' },
]

function CustomerFormModal({ initial, mode, onClose, onSaved }) {
  const [form,   setForm]   = useState(initial ?? EMPTY_CUST)
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')
  const isEdit = mode === 'edit'

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.fullName.trim()) { setErr('Vui lòng nhập họ tên'); return }
    setSaving(true); setErr('')
    try {
      const dto = {
        fullName:    form.fullName,
        email:       form.email       || null,
        phoneNumber: form.phoneNumber || null,
        address:     form.address     || null,
        province:    form.province    || null,
        district:    form.district    || null,
        ward:        form.ward        || null,
      }
      if (isEdit) await updateCustomer(form.customerId, dto)
      else         await createCustomer(dto)
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.message ?? (isEdit ? 'Lỗi cập nhật' : 'Lỗi tạo khách hàng'))
    } finally {
      setSaving(false)
    }
  }

  const inp = (label, field, type = 'text', required = false) => (
    <div key={field}>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span className="text-red-400"> *</span>}
      </label>
      <input type={type} className="linput text-sm" value={form[field] ?? ''}
             onChange={set(field)} />
    </div>
  )

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng mới'}
      width={480}
      footer={
        <>
          <button onClick={onClose} className="lbtn lbtn-secondary flex-1 justify-center">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="lbtn lbtn-primary flex-1 justify-center">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </>
      }
    >
      <div className="p-5 space-y-3">
        {err && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</p>}
        <div className="grid grid-cols-2 gap-3">
          {inp('Họ và tên', 'fullName', 'text', true)}
          {inp('Email', 'email', 'email')}
          {inp('Số điện thoại', 'phoneNumber', 'tel')}
          {inp('Tỉnh / Thành phố', 'province')}
          {inp('Quận / Huyện', 'district')}
          {inp('Phường / Xã', 'ward')}
        </div>
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Địa chỉ cụ thể</label>
          <textarea className="linput text-sm" rows={2} value={form.address ?? ''}
                    onChange={set('address')} />
        </div>
      </div>
    </DetailDrawer>
  )
}

const SEGMENT_CFG = {
  VIP:        { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', color: '#D97706', dot: '#F59E0B', icon: 'star' },
  LOYAL:      { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', color: 'var(--primary-500)', dot: 'var(--primary-500)', icon: 'favorite' },
  REGULAR:    { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', color: 'var(--primary-500)', dot: 'var(--primary-500)', icon: 'person' },
  NEW:        { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', color: 'var(--accent-500)', dot: 'var(--accent-500)', icon: 'person_add' },
  'AT RISK':  { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.30)', color: '#F97316', dot: '#F97316', icon: 'warning' },
  AT_RISK:    { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.30)', color: '#F97316', dot: '#F97316', icon: 'warning' },
  LOST:       { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', color: '#EF4444', dot: '#EF4444', icon: 'person_off' },
  INACTIVE:   { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', color: '#EF4444', dot: '#EF4444', icon: 'person_off' },
}
const SEGMENTS = ['all', 'VIP', 'LOYAL', 'REGULAR', 'NEW', 'AT_RISK', 'LOST']

const CHANNEL_ICON = { Shopee: 'store', TikTok: 'play_circle', 'TikTok Shop': 'play_circle', Lazada: 'shopping_bag', Offline: 'storefront' }
const LOYALTY_TIER = {
  Bronze:   { color: '#92400E', bg: 'rgba(146,64,14,0.12)'  },
  Silver:   { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  Gold:     { color: '#D97706', bg: 'rgba(217,119,6,0.12)'  },
  Platinum: { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
}
const PAGE_SIZE = 10

const parseDateOnly = (value) => {
  if (!value) return ''
  return String(value).slice(0, 10)
}

const isWithinRange = (value, from, to) => {
  const key = parseDateOnly(value)
  if (!key) return false
  return (!from || key >= from) && (!to || key <= to)
}

const fmtCurrency = (value) => {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0₫'
  return `${Math.round(n).toLocaleString('vi-VN')}₫`
}

function SegmentBadge({ seg, label }) {
  const c = SEGMENT_CFG[seg] ?? SEGMENT_CFG.REGULAR
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
      <span className="icon" style={{ fontSize: 11 }}>{c.icon}</span>
      {label}
    </span>
  )
}

function Avatar({ name }) {
  const initials = (name ?? '?').split(' ').slice(-2).map(s => s[0]).join('').toUpperCase()
  const hue = (name ?? '').charCodeAt(0) * 37 % 360
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
         style={{ background: `hsl(${hue},50%,50%)` }}>
      {initials}
    </div>
  )
}

export default function CustomersPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [search,        setSearch]        = useState('')
  const [segment,       setSegment]       = useState('all')
  const [timeMode,      setTimeMode]      = useState('all')
  const [from,          setFrom]          = useState('')
  const [to,            setTo]            = useState('')
  const [minSpent,      setMinSpent]      = useState('')
  const [maxSpent,      setMaxSpent]      = useState('')
  const [province,      setProvince]      = useState('')
  const [page,          setPage]          = useState(1)
  const [selected,      setSelected]      = useState(null)
  const [formMode,      setFormMode]      = useState(null)   // 'create' | 'edit'
  const [formInit,      setFormInit]      = useState(null)
  const [toast,         setToast]         = useState('')
  const [selOrders,     setSelOrders]     = useState(null)   // lịch sử đơn KH đang xem
  const [selOrdersLoad, setSelOrdersLoad] = useState(false)
  const [checkedIds,    setCheckedIds]    = useState(new Set())
  const [confirmDlg, setConfirmDlg] = useState(null)

  const debouncedSearch = useDebounce(search, 350)

  const canEdit = ['Owner', 'Manager', 'Staff'].includes(user?.role)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const handleTimeMode = (mode) => {
    setTimeMode(mode)
    setPage(1)
    if (mode === 'last7days') {
      setFrom(daysAgoKey(6))
      setTo(todayKey())
    } else if (mode === 'mtd') {
      setFrom(firstDayOfMonthKey())
      setTo(todayKey())
    } else if (mode === 'all') {
      setFrom('')
      setTo('')
    } else if (!from && !to) {
      setFrom(firstDayOfMonthKey())
      setTo(todayKey())
    }
  }

  // Fetch lịch sử đơn hàng khi chọn KH
  useEffect(() => {
    if (!selected) { setSelOrders(null); return }
    const cid = selected.customer_id ?? selected.customerId
    if (!cid) return
    setSelOrdersLoad(true)
    getCustomerOrderHistory(cid, 20, { from, to })
      .then(orders => {
        const scoped = (from || to)
          ? orders.filter(o => isWithinRange(o.orderDate ?? o.order_date ?? o.date, from, to))
          : orders
        setSelOrders(scoped.slice(0, 5))
      })
      .catch(() => setSelOrders([]))
      .finally(() => setSelOrdersLoad(false))
  }, [selected, from, to])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getCustomers({
        search: debouncedSearch,
        segment: segment === 'all' ? '' : segment,
        from,
        to,
        minSpent,
        maxSpent,
        province,
        page,
        limit: PAGE_SIZE,
      }))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, segment, from, to, minSpent, maxSpent, province, page])

  const openCreate = () => { setFormInit(null); setFormMode('create') }

  const openEdit = async (c) => {
    const cid = c.customer_id ?? c.customerId
    // Luôn lấy từ OLTP để có đủ address, district, ward
    let src = c
    try {
      if (cid) src = await getOltpCustomer(cid)
    } catch { /* fallback to DW data */ }
    setFormInit({
      customerId:  cid,
      fullName:    src.fullName    ?? src.full_name   ?? c.full_name ?? '',
      email:       src.email       ?? '',
      phoneNumber: src.phone       ?? src.phoneNumber ?? c.phone ?? '',
      address:     src.address     ?? '',
      province:    src.province    ?? '',
      district:    src.district    ?? '',
      ward:        src.ward        ?? '',
    })
    setSelected(null)
    setFormMode('edit')
  }

  const handleDeactivate = (c) => {
    setConfirmDlg({ title: 'Ẩn khách hàng', msg: `Ẩn khách hàng "${c.full_name ?? c.fullName}"?`, action: async () => {
      try {
        await deactivateCustomer(c.customer_id ?? c.customerId)
        showToast('Đã ẩn khách hàng')
        setSelected(null)
        fetchData()
      } catch (err) {
        showToast(err.response?.data?.message ?? 'Lỗi ẩn khách hàng')
      }
    }})
  }

  // ── Bulk select ───────────────────────────────────────────────────────────────
  const getCid = (c) => c.customer_id ?? c.id
  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const toggleAll = (items) => {
    const allChecked = items.length > 0 && items.every(c => checkedIds.has(getCid(c)))
    setCheckedIds(allChecked ? new Set() : new Set(items.map(getCid)))
  }
  const handleBulkDeactivate = () => {
    setConfirmDlg({ title: 'Ẩn hàng loạt', msg: `Ẩn ${checkedIds.size} khách hàng đã chọn?`, action: async () => {
      try {
        await Promise.all([...checkedIds].map(id => deactivateCustomer(id)))
        showToast(`Đã ẩn ${checkedIds.size} khách hàng`)
        setCheckedIds(new Set())
        fetchData()
      } catch { showToast('Có lỗi khi ẩn hàng loạt') }
    }})
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const handleExport = (items) => {
    exportToCsv(`khach_hang_${new Date().toISOString().slice(0, 10)}.csv`, items.map(c => ({
      'Mã KH':         c.customer_code ?? '',
      'Tên khách hàng': c.full_name ?? c.fullName ?? '',
      'SĐT':           c.phone ?? c.phone_number ?? '',
      'Email':         c.email ?? '',
      'Tỉnh/thành':    c.province ?? '',
      'Phân khúc':     c.rfm_segment ?? c.segment_label ?? '',
      'Số đơn hàng':   c.total_orders ?? c.totalOrders ?? 0,
      'Tổng chi tiêu (₫)': c.total_spent ?? c.total_revenue ?? 0,
      'Điểm tích lũy': c.loyalty_points ?? 0,
      'Kênh chính':    c.primary_channel ?? '',
    })))
  }

  useEffect(() => { fetchData() }, [fetchData])

  const items      = data?.items ?? []
  const totalPages = data?.totalPages ?? 1
  const fmt = n => Number(n ?? 0).toLocaleString('vi-VN')

  return (
    <>
    <ConfirmDialog
      open={!!confirmDlg}
      title={confirmDlg?.title ?? 'Xác nhận'}
      message={confirmDlg?.msg}
      icon="delete_forever"
      danger
      onClose={() => setConfirmDlg(null)}
      onConfirm={() => { const a = confirmDlg?.action; setConfirmDlg(null); a?.() }}
    />
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
             style={{ background: 'var(--primary-500)', color: 'white' }}>
          {toast}
        </div>
      )}

      {formMode && (
        <CustomerFormModal
          mode={formMode}
          initial={formInit}
          onClose={() => setFormMode(null)}
          onSaved={() => { setFormMode(null); showToast(formMode === 'create' ? 'Đã thêm khách hàng' : 'Đã cập nhật khách hàng'); fetchData() }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('customers.title')}</h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('customers.totalCount', { count: data.total })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button className="lbtn lbtn-primary !h-9" onClick={openCreate}>
              <span className="icon text-base">person_add</span>
              Thêm khách hàng
            </button>
          )}
          <button className="lbtn lbtn-secondary !h-9" onClick={() => handleExport(items)}
                  title="Xuất CSV trang hiện tại">
            <span className="icon text-base">download</span>
            <span className="hidden sm:inline">Xuất CSV</span>
          </button>
          <button onClick={fetchData} className="lbtn lbtn-secondary !h-9" disabled={loading}>
            <span className="icon text-base" style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
             style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <span className="font-medium" style={{ color: 'var(--primary-600)' }}>
            Đã chọn {checkedIds.size} khách hàng
          </span>
          <div className="flex gap-2 ml-auto">
            {canEdit && (
              <button onClick={handleBulkDeactivate}
                      className="lbtn !h-8 !px-3 text-xs font-medium"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                <span className="icon text-sm">visibility_off</span>
                Ẩn {checkedIds.size} KH
              </button>
            )}
            <button onClick={() => setCheckedIds(new Set())}
                    className="lbtn lbtn-secondary !h-8 !px-3 text-xs">
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Filter: search + segment dropdown */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input type="text" className="linput !pl-9 text-sm"
                 placeholder={t('customers.searchPlaceholder')}
                 value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select
          value={segment}
          onChange={e => { setSegment(e.target.value); setPage(1) }}
          className="linput text-sm"
          style={{ width: 160 }}
        >
          {SEGMENTS.map(s => {
            const cfg = SEGMENT_CFG[s]
            return (
              <option key={s} value={s}>
                {s === 'all' ? t('common.all') : t(`customers.segment.${s}`, s)}
              </option>
            )
          })}
        </select>
        <select
          value={timeMode}
          onChange={e => handleTimeMode(e.target.value)}
          className="linput text-sm"
          style={{ width: 160 }}
        >
          {CUSTOMER_TIME_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {timeMode === 'custom' && (
          <>
            <input
              type="date"
              value={from}
              max={to || todayKey()}
              onChange={e => { setFrom(e.target.value); setPage(1) }}
              className="linput text-sm"
              style={{ width: 140 }}
            />
            <input
              type="date"
              value={to}
              min={from}
              max={todayKey()}
              onChange={e => { setTo(e.target.value); setPage(1) }}
              className="linput text-sm"
              style={{ width: 140 }}
            />
          </>
        )}
        <input
          type="number"
          min="0"
          value={minSpent}
          onChange={e => { setMinSpent(e.target.value); setPage(1) }}
          placeholder="Chi tiêu từ ₫"
          className="linput text-sm"
          style={{ width: 130 }}
        />
        <input
          type="number"
          min="0"
          value={maxSpent}
          onChange={e => { setMaxSpent(e.target.value); setPage(1) }}
          placeholder="Chi tiêu đến ₫"
          className="linput text-sm"
          style={{ width: 140 }}
        />
        <input
          type="text"
          value={province}
          onChange={e => { setProvince(e.target.value); setPage(1) }}
          placeholder="Khu vực"
          className="linput text-sm"
          style={{ width: 140 }}
        />
      </div>

      {/* Table */}
      <div className="lcard overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <span className="w-7 h-7 border-2 rounded-full"
                  style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>people</span>
            <p className="text-sm">{t('common.noData')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                           checked={items.length > 0 && items.every(c => checkedIds.has(getCid(c)))}
                           onChange={() => toggleAll(items)}
                           onClick={e => e.stopPropagation()}
                           className="w-4 h-4 cursor-pointer" />
                  </th>
                  {[t('customers.fullName'), t('customers.province'),
                    t('customers.totalOrders'), t('customers.totalRevenue'),
                    'TB/đơn', 'Điểm tích lũy', 'Kênh chính', t('customers.lastOrder'), t('customers.segmentLabel'), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-sm font-semibold tracking-wide"
                        style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.customer_id ?? c.id ?? i}
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)', background: checkedIds.has(getCid(c)) ? 'rgba(99,102,241,0.04)' : undefined }}
                      onClick={() => setSelected(c)}
                      onMouseEnter={e => { if (!checkedIds.has(getCid(c))) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = checkedIds.has(getCid(c)) ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
                    <td className="px-4 py-3 w-10" onClick={e => toggleCheck(getCid(c), e)}>
                      <input type="checkbox" checked={checkedIds.has(getCid(c))} onChange={() => {}}
                             className="w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.full_name ?? c.fullName} />
                        <div>
                          <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{c.full_name ?? c.fullName}</div>
                          {(c.phone ?? c.phone_number) && (
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.phone ?? c.phone_number}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{c.province ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {fmt(c.total_orders ?? c.totalOrders)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fmtCurrency(c.total_spent ?? c.total_revenue ?? c.totalSpent)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {c.avg_order_value ?? c.avgOrderValue ? fmtCurrency(c.avg_order_value ?? c.avgOrderValue) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums" style={{ color: c.loyalty_points > 0 ? 'var(--primary-500)' : 'var(--text-tertiary)' }}>
                      {c.loyalty_points != null ? fmt(c.loyalty_points) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {(c.primary_channel ?? c.primaryChannel) ? (
                        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          <span className="icon" style={{ fontSize: 12 }}>{CHANNEL_ICON[c.primary_channel ?? c.primaryChannel] ?? 'store'}</span>
                          {c.primary_channel ?? c.primaryChannel}
                        </div>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {(c.last_order_at ?? c.last_order_date ?? c.lastOrderAt)
                        ? new Date(c.last_order_at ?? c.last_order_date ?? c.lastOrderAt).toLocaleDateString('vi-VN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const seg = resolveSegment(c.rfm_segment ?? c.rfmSegment ?? c.segment_label)
                        return <SegmentBadge seg={seg} label={t(`customers.segment.${seg}`, seg)} />
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="icon text-base" style={{ color: 'var(--text-tertiary)' }}>chevron_right</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && !loading && (
          <div className="flex items-center justify-center gap-2 px-5 py-3"
               style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                    className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
              <span className="icon text-base">chevron_left</span>
            </button>
            <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
              {t('common.pageInfo', { page, total: totalPages })}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
              <span className="icon text-base">chevron_right</span>
            </button>
          </div>
        )}
      </div>

      {/* Detail drawer — trượt từ bên phải */}
      {selected && (() => {
        const fullName    = selected.full_name ?? selected.fullName ?? '?'
        const phone       = selected.phone ?? selected.phone_number ?? selected.phoneNumber
        const email       = selected.email
        const address     = selected.address
        const rfmSeg      = selected.rfm_segment ?? selected.rfmSegment
        const seg         = resolveSegment(rfmSeg ?? selected.segment_label)
        const segLabel    = t(`customers.segment.${seg}`, seg)
        const hue         = fullName.charCodeAt(0) * 37 % 360
        const lastOrderAt = selected.last_order_at ?? selected.last_order_date ?? selected.lastOrderAt
        const firstOrderAt= selected.first_order_at ?? selected.firstOrderAt
        const lastOrderDays = lastOrderAt
          ? Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86_400_000)
          : null
        const loyaltyTier = selected.loyalty_tier ?? selected.loyaltyTier
        const primaryChan = selected.primary_channel ?? selected.primaryChannel
        const rfmScore    = selected.rfm_score ?? selected.rfmScore
        const rfmR = selected.rfm_r_score ?? selected.rfmRScore
        const rfmF = selected.rfm_f_score ?? selected.rfmFScore
        const rfmM = selected.rfm_m_score ?? selected.rfmMScore

        const footer = canEdit ? (
          <>
            <button onClick={() => openEdit(selected)} className="lbtn lbtn-secondary flex-1 justify-center">
              <span className="icon text-base">edit</span>Sửa
            </button>
            <button onClick={() => handleDeactivate(selected)}
                    className="lbtn flex-1 justify-center"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              <span className="icon text-base">person_off</span>Ẩn
            </button>
          </>
        ) : null

        return (
          <DetailDrawer
            open={true}
            onClose={() => setSelected(null)}
            title={fullName}
            subtitle={[email, phone].filter(Boolean).join(' · ') || undefined}
            width={520}
            footer={footer}
          >
            {/* Avatar header */}
            <div className="flex items-center gap-4 px-5 py-5"
                 style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0"
                   style={{ background: `hsl(${hue},50%,48%)` }}>
                {fullName.split(' ').slice(-2).map(s => s[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{fullName}</p>
                {loyaltyTier && (() => {
                  const tc = LOYALTY_TIER[loyaltyTier] ?? LOYALTY_TIER.Bronze
                  return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-0.5"
                          style={{ background: tc.bg, color: tc.color }}>
                      <span className="icon" style={{ fontSize: 11 }}>military_tech</span>
                      {loyaltyTier}
                    </span>
                  )
                })()}
                <div className="mt-1.5">
                  <SegmentBadge seg={seg} label={segLabel} />
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Thông tin liên hệ */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                   style={{ color: 'var(--text-tertiary)' }}>Thông tin liên hệ</p>
                <div className="space-y-2.5">
                  {[
                    { icon: 'email',       label: email ?? '—' },
                    { icon: 'phone',       label: phone ?? '—' },
                    { icon: 'location_on', label: [selected.address, selected.district, selected.ward, selected.province].filter(v => v && v !== '—').join(', ') || address || '—' },
                    ...(primaryChan ? [{ icon: CHANNEL_ICON[primaryChan] ?? 'store', label: `Kênh chính: ${primaryChan}` }] : []),
                  ].map(item => (
                    <div key={item.icon} className="flex items-center gap-3 text-sm">
                      <span className="icon text-base shrink-0" style={{ color: 'var(--text-tertiary)' }}>{item.icon}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Số liệu mua hàng */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                   style={{ color: 'var(--text-tertiary)' }}>Số liệu mua hàng{from || to ? ' trong kỳ lọc' : ''}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Tổng đơn hàng',  fmt(selected.total_orders ?? selected.totalOrders),                               'shopping_cart'],
                    ['Tổng chi tiêu',  fmtCurrency(selected.total_spent ?? selected.total_revenue ?? selected.totalSpent), 'payments'],
                    ['TB mỗi đơn',     fmtCurrency(selected.avg_order_value ?? selected.avgOrderValue),                   'receipt'],
                    ['Điểm tích lũy',  (selected.loyalty_points ?? selected.loyaltyPoints) != null ? `${fmt(selected.loyalty_points ?? selected.loyaltyPoints)} đ` : '—', 'star'],
                  ].map(([label, value, icon]) => (
                    <div key={label} className="rounded-xl px-4 py-3"
                         style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="icon text-sm" style={{ color: 'var(--primary-400)' }}>{icon}</span>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                      </div>
                      <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{value}</p>
                    </div>
                  ))}
                </div>
                {firstOrderAt && (
                  <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                    Đơn đầu tiên: <span style={{ fontWeight: 500 }}>{new Date(firstOrderAt).toLocaleDateString('vi-VN')}</span>
                  </p>
                )}
                {lastOrderDays != null && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Lần cuối mua:{' '}
                    <span style={{ fontWeight: 500 }}>
                      {lastOrderDays === 0 ? 'Hôm nay' : lastOrderDays === 1 ? 'Hôm qua' : `${lastOrderDays} ngày trước`}
                      {' '}({new Date(lastOrderAt).toLocaleDateString('vi-VN')})
                    </span>
                  </p>
                )}
                {rfmScore != null && (
                  <div className="mt-2 p-2.5 rounded-lg flex items-center gap-3"
                       style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>RFM Score:</span>
                    <span className="font-bold text-sm" style={{ color: 'var(--primary-500)' }}>{rfmScore}</span>
                    {[['R', rfmR], ['F', rfmF], ['M', rfmM]].map(([k, v]) => v != null ? (
                      <span key={k} className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                        {k}: {v}
                      </span>
                    ) : null)}
                  </div>
                )}
              </div>

              {/* Lịch sử đơn hàng */}
              <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3"
                     style={{ color: 'var(--text-tertiary)' }}>{from || to ? '5 đơn hàng gần nhất trong kỳ lọc' : '5 đơn hàng gần nhất'}</p>
                  {selOrdersLoad ? (
                    <div className="flex items-center justify-center py-6">
                      <span className="w-5 h-5 border-2 rounded-full"
                            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
                    </div>
                  ) : !selOrders || selOrders.length === 0 ? (
                    <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>Chưa có đơn hàng</p>
                  ) : (
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                            {['Mã đơn', 'Ngày', 'Kênh', 'Giá trị', 'Trạng thái'].map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold"
                                  style={{ color: 'var(--text-secondary)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selOrders.map((o, i) => (
                            <tr key={o.orderId ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>
                                {o.orderCode ?? o.orderId ?? '—'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                                {o.orderDate ? new Date(o.orderDate).toLocaleDateString('vi-VN') : '—'}
                              </td>
                              <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>
                                {o.channelName ?? '—'}
                              </td>
                              <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                                {fmtCurrency(o.totalAmount)}
                              </td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded"
                                      style={{
                                        background: o.status === 'completed' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                        color: o.status === 'completed' ? '#10B981' : 'var(--primary-500)',
                                      }}>
                                  {o.status ?? '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
            </div>
          </DetailDrawer>
        )
      })()}
    </div>
    </>
  )
}
