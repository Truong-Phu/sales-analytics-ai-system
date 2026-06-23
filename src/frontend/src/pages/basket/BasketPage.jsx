import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'
import DetailDrawer from '../../components/ui/DetailDrawer'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import InfoTooltip from '../../components/ui/InfoTooltip'
import { MT } from '../../constants/metricTooltips'
import { getBasketAnalysis } from '../../api/aiApi'

const fallbackVouchers = [
  { id: 'v-10',   code: 'GIUCHAN10', type: 'PERCENT',  value: 10 },
  { id: 'v-15',   code: 'GIUCHAN15', type: 'PERCENT',  value: 15 },
  { id: 'v-20',   code: 'GIUCHAN20', type: 'PERCENT',  value: 20 },
  { id: 'v-ship', code: 'FREESHIP',  type: 'FREESHIP', value: 0  },
]

const getVoucherLabel = (v) => {
  const min = v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''
  if (v.type === 'PERCENT')  return `Giảm ${v.value}% (Mã: ${v.code}${min})`
  if (v.type === 'FIXED')    return `Giảm ${new Intl.NumberFormat('vi-VN').format(v.value)}₫ (Mã: ${v.code}${min})`
  return `Miễn phí vận chuyển (Mã: ${v.code}${min})`
}

// ── Tạo nội dung bài đăng FB tự động ──────────────────────────────────────
function generateFbPost(products, voucher) {
  const emoji = ['🛍️', '🔥', '✨', '💥', '🎉']
  const prod1 = products[0] ?? 'Sản phẩm A'
  const prod2 = products[1] ?? 'Sản phẩm B'
  const discountStr =
    voucher?.type === 'PERCENT'  ? `${voucher.value}%`
    : voucher?.type === 'FIXED'  ? `${new Intl.NumberFormat('vi-VN').format(voucher.value)}₫`
    : 'miễn phí vận chuyển'
  const code = voucher?.code ?? ''

  return `🔥 COMBO ĐÔI – MUA CÙNG TIẾT KIỆM HƠN!

✨ Mua kèm ngay 2 sản phẩm hot:
👉 ${prod1}
👉 ${prod2}

💥 Giảm ngay ${discountStr} khi mua combo bộ đôi này!
🏷️ Dùng mã: ${code}

⏰ Ưu đãi có hạn – đặt hàng ngay hôm nay để không bỏ lỡ!

📦 Giao hàng toàn quốc
💬 Inbox hoặc comment để được tư vấn ngay!

#combo #khuyenmai #sale #muasamtietkiem`
}

// ── Auto-generate mã voucher từ tên sản phẩm ──────────────────────────────
function autoVoucherCode(products = []) {
  const initials = products
    .map(p => p.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 3))
    .join('')
    .slice(0, 8)
  return `COMBO${initials || Date.now().toString(36).toUpperCase().slice(-4)}`
}

// ── Default validTo: 30 ngày từ hôm nay ───────────────────────────────────
function defaultValidTo() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 16)
}

function ActionExecutionDrawer({ config, onClose, onSuccess }) {
  const [sending,  setSending]  = useState(false)
  const [err,      setErr]      = useState('')
  const [phase,    setPhase]    = useState('config') // 'config' | 'fb_post'
  const [fbPost,   setFbPost]   = useState('')
  const [copied,   setCopied]   = useState(false)
  const [createdCode, setCreatedCode] = useState('')

  // Form tạo voucher mới
  const [newV, setNewV] = useState(() => ({
    code:       autoVoucherCode(config.products),
    type:       'PERCENT',
    value:      '10',
    validTo:    defaultValidTo(),
    usageLimit: '100',
  }))

  const discountLabel = newV.type === 'PERCENT'
    ? `${newV.value}%`
    : newV.type === 'FIXED'
      ? `${new Intl.NumberFormat('vi-VN').format(Number(newV.value) || 0)}₫`
      : 'freeship'

  const handleSend = async () => {
    setErr('')
    setSending(true)
    try {
      // Tạo voucher mới qua API
      await axios.post('/api/pos/vouchers', {
        code:          newV.code.trim().toUpperCase(),
        type:          newV.type,
        value:         Number(newV.value),
        minOrderValue: 0,
        maxDiscount:   null,
        usageLimit:    newV.usageLimit ? Number(newV.usageLimit) : null,
        validFrom:     new Date().toISOString(),
        validTo:       new Date(newV.validTo).toISOString(),
      })

      // Lưu campaign vào localStorage
      const list = JSON.parse(localStorage.getItem('executed_campaigns') ?? '[]')
      list.unshift({
        id:        Date.now(),
        timestamp: new Date().toISOString(),
        action:    'bundle',
        target:    config.products?.join(' + '),
        method:    'Combo',
        discount:  `[${newV.code.toUpperCase()}] - ${discountLabel}`,
        message:   `Combo ${config.products?.join(' + ')} — giảm ${discountLabel} mã ${newV.code.toUpperCase()}`,
        status:    'SUCCESS',
      })
      localStorage.setItem('executed_campaigns', JSON.stringify(list))

      setCreatedCode(newV.code.toUpperCase())
      setFbPost(generateFbPost(config.products ?? [], { code: newV.code.toUpperCase(), type: newV.type, value: Number(newV.value) }))
      setPhase('fb_post')
      onSuccess(`Đã tạo voucher ${newV.code.toUpperCase()} và kích hoạt chiến dịch combo!`)
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Lỗi tạo voucher. Vui lòng thử lại.')
    } finally {
      setSending(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(fbPost).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Phase: Gợi ý bài đăng FB ────────────────────────────────────────────
  if (phase === 'fb_post') {
    return (
      <DetailDrawer
        open={true}
        onClose={onClose}
        title="Gợi ý bài đăng Facebook"
        subtitle="Copy nội dung và đăng lên Fanpage để thông báo combo đến khách hàng"
        width={480}
        footer={
          <div className="flex gap-2 w-full">
            <button onClick={onClose} className="lbtn lbtn-secondary flex-1 !h-9 text-sm">
              Đóng
            </button>
            <button
              onClick={handleCopy}
              className="lbtn lbtn-primary flex-1 !h-9 text-sm gap-1.5"
              style={copied ? { background: '#10B981', borderColor: '#10B981' } : {}}
            >
              <span className="icon" style={{ fontSize: 16 }}>{copied ? 'check_circle' : 'content_copy'}</span>
              {copied ? 'Đã sao chép!' : 'Copy bài đăng'}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-0">

          {/* Banner thành công */}
          <div className="px-5 pt-5 pb-4 flex items-start gap-3"
               style={{ background: 'rgba(16,185,129,0.06)', borderBottom: '1px solid var(--border)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                 style={{ background: 'rgba(16,185,129,0.15)' }}>
              <span className="icon text-lg" style={{ color: '#10B981' }}>check_circle</span>
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: '#10B981' }}>
                Chiến dịch combo đã được kích hoạt!
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Voucher <strong style={{ color: 'var(--text-primary)' }}>{createdCode}</strong> đã được tạo và sẽ tự động áp dụng tại POS khi khách mua đủ combo.
              </div>
            </div>
          </div>

          {/* Gợi ý đăng FB */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                   style={{ background: 'rgba(24,119,242,0.12)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Bài đăng Facebook gợi ý
              </span>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(24,119,242,0.1)', color: '#1877F2' }}>
                Tự động sinh từ AI
              </span>
            </div>

            {/* Preview post */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {/* FB post header mock */}
              <div className="px-3 py-2.5 flex items-center gap-2"
                   style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                     style={{ background: 'var(--primary-500)' }}>FB</div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Fanpage của bạn</div>
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Vừa xong · 🌐</div>
                </div>
              </div>

              {/* Editable textarea */}
              <textarea
                value={fbPost}
                onChange={e => setFbPost(e.target.value)}
                className="w-full text-sm p-3 resize-none outline-none"
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  minHeight: 260,
                  fontFamily: 'sans-serif',
                  lineHeight: '1.6',
                  border: 'none',
                }}
              />
            </div>

            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              ✏️ Chỉnh sửa nội dung trước khi đăng nếu cần. Nhấn <strong>Copy</strong> rồi paste lên Fanpage.
            </p>
          </div>

          {/* Hướng dẫn nhanh */}
          <div className="px-5 pb-5">
            <div className="rounded-xl p-3 space-y-2"
                 style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                📋 Các bước đăng bài nhanh
              </div>
              {[
                { n: '1', text: 'Nhấn "Copy bài đăng" phía dưới' },
                { n: '2', text: 'Mở Facebook → Fanpage → Tạo bài viết' },
                { n: '3', text: 'Paste nội dung vào, thêm ảnh sản phẩm' },
                { n: '4', text: 'Đăng bài và ghim lên đầu trang' },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                        style={{ background: 'var(--primary-500)', color: '#fff' }}>{s.n}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DetailDrawer>
    )
  }

  // ── Phase: Cấu hình combo + tạo voucher mới ────────────────────────────
  return (
    <DetailDrawer
      open={true}
      onClose={onClose}
      title="Tạo chiến dịch combo"
      subtitle={`Mua kèm: ${config.products?.join(' + ')}`}
      width={480}
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} disabled={sending} className="lbtn lbtn-secondary flex-1 !h-9 text-sm">
            Hủy bỏ
          </button>
          <button onClick={handleSend} disabled={sending} className="lbtn lbtn-primary flex-1 !h-9 text-sm gap-1.5">
            {sending
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><span className="icon" style={{ fontSize: 15 }}>local_offer</span> Tạo voucher & Kích hoạt</>
            }
          </button>
        </div>
      }
    >
      <div className="flex flex-col">

        {/* Thông tin combo từ AI */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="icon text-sm" style={{ color: '#10B981' }}>auto_awesome</span>
            <span className="text-xs font-bold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              Gợi ý từ Basket Analysis
            </span>
          </div>
          <div className="rounded-xl p-3 space-y-2"
               style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div className="flex flex-wrap gap-1.5">
              {config.products?.map((p, i) => (
                <span key={i} className="px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                  {p}
                </span>
              ))}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Lift <strong style={{ color: '#10B981' }}>{config.lift}x</strong> ·
              Confidence <strong style={{ color: '#10B981' }}>{config.conf}%</strong> —
              Khách mua sản phẩm này thường mua kèm nhau
            </div>
          </div>
        </div>

        {/* Form tạo voucher mới */}
        <div className="px-5 pt-4 pb-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="icon text-sm" style={{ color: 'var(--primary-500)' }}>confirmation_number</span>
            <span className="text-xs font-bold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              Tạo voucher combo mới
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Mã voucher */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
              Mã voucher
            </label>
            <input
              value={newV.code}
              onChange={e => setNewV(p => ({ ...p, code: e.target.value.toUpperCase() }))}
              className="linput !h-10 font-mono font-bold"
              style={{ fontSize: 14, letterSpacing: '0.06em' }}
              placeholder="COMBO..."
            />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>
              Tự sinh từ tên sản phẩm — có thể chỉnh sửa
            </span>
          </div>

          {/* Loại & Giá trị */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Loại</label>
              <select value={newV.type} onChange={e => setNewV(p => ({ ...p, type: e.target.value }))}
                      className="linput !h-10 text-sm">
                <option value="PERCENT">🏷 Giảm %</option>
                <option value="FIXED">💰 Giảm cố định</option>
                <option value="FREESHIP">🚚 Freeship</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                {newV.type === 'PERCENT' ? 'Phần trăm' : 'Số tiền'}
              </label>
              <div className="relative">
                <input type="number" min={0}
                  value={newV.value}
                  onChange={e => setNewV(p => ({ ...p, value: e.target.value }))}
                  className="linput !h-10 text-sm pr-9"
                  placeholder={newV.type === 'PERCENT' ? '10' : '50000'}
                  disabled={newV.type === 'FREESHIP'}
                />
                {newV.type !== 'FREESHIP' && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{ color: 'var(--text-tertiary)' }}>
                    {newV.type === 'PERCENT' ? '%' : '₫'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Hiệu lực đến & Lượt dùng */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Hiệu lực đến</label>
              <input type="datetime-local" value={newV.validTo}
                     onChange={e => setNewV(p => ({ ...p, validTo: e.target.value }))}
                     className="linput !h-10 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>Lượt dùng tối đa</label>
              <input type="number" min={0} value={newV.usageLimit}
                     onChange={e => setNewV(p => ({ ...p, usageLimit: e.target.value }))}
                     className="linput !h-10 text-sm" placeholder="—" />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-2"
               style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <span className="icon text-base" style={{ color: 'var(--primary-500)' }}>confirmation_number</span>
            <div className="text-xs">
              <span className="font-mono font-bold" style={{ color: 'var(--primary-500)' }}>{newV.code || '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}> · Giảm <strong>{discountLabel}</strong> · đến {newV.validTo ? new Date(newV.validTo).toLocaleDateString('vi-VN') : '—'}</span>
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              <span className="icon text-sm">error</span>
              {err}
            </div>
          )}
        </div>
      </div>
    </DetailDrawer>
  )
}



export default function BasketPage() {
  const { t } = useTranslation()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [minConf, setMinConf] = useState(0.1)
  const [minLift, setMinLift] = useState(1.0)
  const [executionDrawer, setExecutionDrawer] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const [executedComboTargets, setExecutedComboTargets] = useState([])
  const fetchedRef = useRef(false)

  const updateExecutedCombos = useCallback(() => {
    try {
      const list = JSON.parse(localStorage.getItem('executed_campaigns') ?? '[]')
      const targets = list
        .filter(item => item.action === 'bundle' && item.status === 'SUCCESS')
        .map(item => item.target)
      setExecutedComboTargets(targets)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    updateExecutedCombos()
  }, [updateExecutedCombos])

  const handleCreateBundle = (rule) => {
    const products = [...rule.antecedents, ...rule.consequents]
    setExecutionDrawer({
      action:   'bundle',
      products,
      lift:     rule.lift.toString(),
      conf:     (rule.confidence * 100).toFixed(0),
    })
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getBasketAnalysis({
        days: 180,
        min_support: 0.001,
        min_confidence: minConf,
        min_lift: minLift,
        top_n: 30,
      })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }, [minConf, minLift])

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [load])

  const liftColor = (lift) => lift >= 3 ? '#EF4444' : lift >= 2 ? '#F59E0B' : '#22C55E'

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('basket.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('basket.subtitle')}</p>
      </div>

      {!data && !loading && <AiEmptyState title={t('basket.emptyState')} />}

      <div className="lcard p-4 flex gap-6 flex-wrap items-end">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t('basket.minConfidence')}: <strong style={{ color: 'var(--text-primary)' }}>{Math.round(minConf*100)}%</strong>
          </label>
          <input type="range" min={0.1} max={0.9} step={0.05} value={minConf}
            onChange={e => setMinConf(+e.target.value)} className="w-32 accent-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
            {t('basket.minLift')}: <strong style={{ color: 'var(--text-primary)' }}>{minLift}x</strong>
          </label>
          <input type="range" min={1} max={5} step={0.5} value={minLift}
            onChange={e => setMinLift(+e.target.value)} className="w-32 accent-indigo-500" />
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">{t('basket.analyzeBtn')}</button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t('basket.kpiOrders'),  tip: MT.orderCount, value: data.total_transactions || '(mẫu)', color: 'var(--primary-500)' },
            { label: t('basket.kpiRules'),   tip: MT.support,    value: data.total_rules, color: '#22C55E' },
            { label: t('basket.kpiSource'),  tip: null,
              value: data.is_mock ? t('basket.sourceSample') : t('basket.sourceReal'),
              color: data.is_mock ? '#F59E0B' : '#22C55E' },
          ].map(k => (
            <div key={k.label} className="lcard p-4">
              <div className="inline-flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {k.label}{k.tip && <InfoTooltip {...k.tip} placement="top" />}
              </div>
              <div className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="lcard p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
          </div>
        ) : (data && data.total_rules === 0 && !loading) ? (
          <div className="lcard p-8 text-center space-y-2">
            <div className="text-3xl">🛒</div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('basket.noRulesFound', 'Không tìm thấy association rules')}
            </p>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {data.note}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('basket.noRulesHint', 'Thử giảm Min Confidence hoặc Min Lift, hoặc nhập thêm đơn hàng có nhiều sản phẩm.')}
            </p>
          </div>
        ) : (data?.rules ?? []).map((rule, i) => {
          const targetComboKey = [...rule.antecedents, ...rule.consequents].join(' + ')
          const isExecuted = executedComboTargets.includes(targetComboKey)
          return (
            <div key={i} className="lcard p-4 transition-colors lcard-hover">
              <div className="flex items-center gap-2 flex-wrap">
                {rule.antecedents.map(p => (
                  <span key={p} className="px-2 py-1 rounded text-sm font-medium"
                    style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--primary-600)' }}>{p}</span>
                ))}
                <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                {rule.consequents.map(p => (
                  <span key={p} className="px-2 py-1 rounded text-sm font-medium"
                    style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>{p}</span>
                ))}
                
                {isExecuted && (
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1 border shrink-0"
                        style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.3)', color: '#10B981' }}>
                    <span className="icon text-xs" style={{ fontSize: 13 }}>check_circle</span>
                    Đã tạo chiến dịch
                  </span>
                )}

                <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="inline-flex items-center gap-0.5">Support<InfoTooltip {...MT.support} placement="top" />: <strong style={{ color: 'var(--text-primary)' }}>{(rule.support*100).toFixed(1)}%</strong></span>
                  <span className="inline-flex items-center gap-0.5">Confidence<InfoTooltip {...MT.confidence} placement="top" />: <strong style={{ color: 'var(--text-primary)' }}>{(rule.confidence*100).toFixed(1)}%</strong></span>
                  <span className="inline-flex items-center gap-0.5">Lift<InfoTooltip {...MT.lift} placement="top" />: <strong style={{ color: liftColor(rule.lift) }}>{rule.lift}x</strong></span>
                  <span>{t('basket.orderCount', { count: rule.transactions })}</span>
                  <button
                    onClick={() => handleCreateBundle(rule)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={
                      isExecuted
                        ? { borderColor: 'rgba(16,185,129,0.4)', color: '#059669', background: 'rgba(16,185,129,0.06)' }
                        : { borderColor: 'rgba(99,102,241,0.4)', color: 'var(--primary-600)', background: 'rgba(99,102,241,0.06)' }
                    }
                    onMouseEnter={e => {
                      if (isExecuted) {
                        e.currentTarget.style.background='#10B981';
                        e.currentTarget.style.color='white';
                        e.currentTarget.style.borderColor='#10B981';
                      } else {
                        e.currentTarget.style.background='var(--primary-500)';
                        e.currentTarget.style.color='white';
                        e.currentTarget.style.borderColor='var(--primary-500)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (isExecuted) {
                        e.currentTarget.style.background='rgba(16,185,129,0.06)';
                        e.currentTarget.style.color='#059669';
                        e.currentTarget.style.borderColor='rgba(16,185,129,0.4)';
                      } else {
                        e.currentTarget.style.background='rgba(99,102,241,0.06)';
                        e.currentTarget.style.color='var(--primary-600)';
                        e.currentTarget.style.borderColor='rgba(99,102,241,0.4)';
                      }
                    }}
                    title={isExecuted ? "Chiến dịch combo này đã được kích hoạt. Nhấn để tạo lại/chỉnh sửa." : t('basket.createBundleTitle')}
                  >
                    <span className="icon" style={{ fontSize: 13 }}>{isExecuted ? 'check_circle' : 'campaign'}</span>
                    {isExecuted ? "Đã tạo combo" : t('basket.createBundle')}
                  </button>
                </div>
              </div>
              <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>{rule.recommendation}</p>
            </div>
          )
        })}
      </div>

      {data && (
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{data.note}</div>
      )}
      {executionDrawer && (
        <ActionExecutionDrawer
          config={executionDrawer}
          onClose={() => setExecutionDrawer(null)}
          onSuccess={(msg) => {
            setToastMsg(msg)
            updateExecutedCombos()
            setTimeout(() => setToastMsg(null), 3000)
          }}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl p-4 flex items-center gap-2 text-white shadow-lg animate-fade-in"
             style={{ background: '#10B981', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="icon">check_circle</span>
          <span className="text-sm font-semibold">{toastMsg}</span>
        </div>
      )}
    </div>
  )
}
