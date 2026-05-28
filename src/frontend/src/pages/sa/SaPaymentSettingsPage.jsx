import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'

// Các phương thức thật người dùng nhìn thấy
const REAL_METHODS = [
  { key: 'CASH',   label: 'Tiền mặt', icon: '💵' },
  { key: 'VIETQR', label: 'VietQR',   icon: '📱' },
  { key: 'MOMO',   label: 'MoMo',     icon: '🟣' },
  { key: 'VNPAY',  label: 'VNPAY',    icon: '💳' },
]

// Mock providers – chỉ dùng nội bộ dev/demo
const MOCK_PROVIDERS = [
  { key: 'MOCK_SEPAY', label: 'Mock SePay Webhook',  desc: 'Giả lập webhook SePay để tự động xác nhận VietQR/chuyển khoản' },
  { key: 'MOCK_MOMO',  label: 'Mock MoMo Callback',  desc: 'Giả lập callback MoMo (success/failed/cancelled)' },
  { key: 'MOCK_VNPAY', label: 'Mock VNPAY Callback', desc: 'Giả lập callback VNPAY (success/failed/cancelled)' },
]

// Config fields theo từng method
// VIETQR không có fields ở đây — bank info quản lý tập trung ở "Tài khoản thanh toán"
const METHOD_FIELDS = {
  // Future: credentials sandbox/production (hiện tại chỉ lưu cấu trúc, chưa gọi API thật)
  MOMO: [
    { key: 'partnerCode', label: 'Partner Code', placeholder: 'Sandbox/Production', future: true },
    { key: 'accessKey',   label: 'Access Key',   placeholder: '(Sandbox key)',      future: true },
    { key: 'secretKey',   label: 'Secret Key',   placeholder: '(Sandbox key)',      future: true, secret: true },
  ],
  VNPAY: [
    { key: 'tmnCode',    label: 'TMN Code',    placeholder: 'Sandbox/Production', future: true },
    { key: 'hashSecret', label: 'Hash Secret', placeholder: '(Sandbox key)',      future: true, secret: true },
  ],
  MOCK_SEPAY: [
    { key: 'apiKey',      label: 'API Key (tương lai)',      placeholder: 'Chừa sẵn cho SePay thật', future: true },
    { key: 'webhookUrl',  label: 'Webhook URL (tương lai)',  placeholder: 'https://your-domain/...', future: true },
  ],
}

function Toggle({ checked, onChange, label, desc }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>}
      </div>
      <div
        onClick={onChange}
        className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
        style={{ background: checked ? 'var(--primary-500)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ left: checked ? '1.25rem' : '2px' }} />
      </div>
    </label>
  )
}

function ConfigSection({ methodKey, config, onSave }) {
  const fields = METHOD_FIELDS[methodKey] ?? []
  const [values,   setValues]   = useState({})
  const [saving,   setSaving]   = useState(false)
  const [flash,    setFlash]    = useState('')

  // Khởi tạo values từ config hiện có
  useEffect(() => {
    const init = {}
    fields.forEach(f => {
      init[f.key] = config?.[f.key] ?? ''
    })
    setValues(init)
  }, [config, methodKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFields = fields.length > 0

  const handleSave = async () => {
    setSaving(true)
    try {
      // Lấy enabled từ component cha (đã lưu riêng) – chỉ cập nhật config JSON
      await onSave(methodKey, values)
      setFlash('Đã lưu')
      setTimeout(() => setFlash(''), 2000)
    } catch { /* lỗi hiện ở trên */ } finally {
      setSaving(false)
    }
  }

  if (!hasFields) return null

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="space-y-2">
        {fields.map(f => (
          <div key={f.key}>
            <label className="block text-xs font-medium mb-1" style={{
              color: f.future ? 'var(--text-tertiary)' : 'var(--text-secondary)'
            }}>
              {f.label}
              {f.future && <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>(chuẩn bị cho tương lai)</span>}
            </label>
            <input
              type={f.secret ? 'password' : 'text'}
              className="linput text-sm"
              placeholder={f.placeholder}
              value={values[f.key] ?? ''}
              onChange={e => {
                let v = e.target.value
                if (f.uppercase) v = v.toUpperCase()
                setValues(prev => ({ ...prev, [f.key]: v }))
              }}
              disabled={f.future}  // Disable future fields – chưa dùng
              style={{ opacity: f.future ? 0.5 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{ background: 'var(--primary-500)', color: 'white' }}>
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
        {flash && <span className="text-xs" style={{ color: '#10B981' }}>{flash}</span>}
      </div>
    </div>
  )
}

export default function SaPaymentSettingsPage() {
  const [configs,  setConfigs]  = useState({})   // { METHOD_KEY: { enabled, config } }
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [flash,    setFlash]    = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/payment/settings')
      const map = {}
      for (const item of (res.data.data ?? [])) {
        map[item.paymentMethod] = { enabled: item.enabled, config: item.config }
      }
      setConfigs(map)
    } catch {
      setError('Không thể tải cấu hình thanh toán')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const showFlash = msg => { setFlash(msg); setTimeout(() => setFlash(''), 2500) }

  const toggleEnabled = async (methodKey, newVal) => {
    const existing = configs[methodKey] ?? {}
    const configJson = existing.config ? JSON.stringify(existing.config) : null
    try {
      await api.put(`/api/payment/settings/${methodKey}`, {
        enabled: newVal,
        configJson,
      })
      setConfigs(prev => ({ ...prev, [methodKey]: { ...existing, enabled: newVal } }))
      showFlash(`Đã ${newVal ? 'bật' : 'tắt'} ${methodKey}`)
    } catch {
      showFlash('Lỗi cập nhật')
    }
  }

  const saveConfig = async (methodKey, values) => {
    const existing  = configs[methodKey] ?? {}
    const configJson = JSON.stringify(values)
    await api.put(`/api/payment/settings/${methodKey}`, {
      enabled   : existing.enabled ?? true,
      configJson,
    })
    setConfigs(prev => ({ ...prev, [methodKey]: { ...existing, config: values } }))
    showFlash('Đã lưu cấu hình')
  }

  if (loading) return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4 rounded-2xl skeleton" style={{ height: 72 }} />
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Cấu hình thanh toán
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          Quản lý phương thức và tham số thanh toán cho toàn hệ thống
        </p>
      </div>

      {flash && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#D1FAE5', color: '#065F46' }}>{flash}</div>
      )}
      {error && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      {/* ── 1. Phương thức thật ── */}
      <section>
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>
          Phương thức thanh toán
        </h2>
        <div className="space-y-3">
          {REAL_METHODS.map(m => {
            const cfg = configs[m.key] ?? {}
            return (
              <div key={m.key} className="p-4 rounded-2xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <Toggle
                  label={<span><span style={{ marginRight: 6 }}>{m.icon}</span>{m.label}</span>}
                  checked={cfg.enabled ?? false}
                  onChange={() => toggleEnabled(m.key, !(cfg.enabled ?? false))}
                />
                {(cfg.enabled ?? false) && m.key === 'VIETQR' && (
                  <div className="mt-3 pt-3 flex items-start gap-2 text-xs"
                    style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                    <span className="icon text-sm mt-0.5" style={{ color: 'var(--primary-400)' }}>info</span>
                    <span>
                      Thông tin ngân hàng VietQR được cấu hình tại{' '}
                      <strong style={{ color: 'var(--primary-500)' }}>Tài khoản thanh toán</strong>
                      {' '}→ Thêm tài khoản với phương thức <em>VietQR</em> và đặt làm mặc định.
                    </span>
                  </div>
                )}
                {(cfg.enabled ?? false) && m.key !== 'VIETQR' && (
                  <ConfigSection
                    methodKey={m.key}
                    config={cfg.config}
                    onSave={saveConfig}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 2. Mock Providers ── */}
      <section>
        <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
          Mock Providers
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
          Chỉ dùng trong development/demo. Không hiển thị cho người dùng thường.
        </p>
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {/* Dev mode badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium w-fit"
            style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
            <span className="icon text-sm">science</span>
            Development / Demo Mode
          </div>
          {MOCK_PROVIDERS.map(p => {
            const cfg = configs[p.key] ?? {}
            return (
              <div key={p.key}>
                <Toggle
                  label={p.label}
                  desc={p.desc}
                  checked={cfg.enabled ?? false}
                  onChange={() => toggleEnabled(p.key, !(cfg.enabled ?? false))}
                />
                {(cfg.enabled ?? false) && p.key === 'MOCK_SEPAY' && (
                  <ConfigSection
                    methodKey={p.key}
                    config={cfg.config}
                    onSave={saveConfig}
                  />
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 3. Hướng phát triển ── */}
      <section>
        <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
          Hướng phát triển
        </h2>
        <div className="p-4 rounded-2xl space-y-2"
          style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
            Nâng cấp từ mock → sandbox/production (không cần thay đổi database):
          </p>
          {[
            'Tích hợp SePay thật để tự động đối soát chuyển khoản ngân hàng',
            'Tích hợp MoMo sandbox/production (điền partnerCode, accessKey, secretKey)',
            'Tích hợp VNPAY sandbox/production (điền tmnCode, hashSecret)',
            'Triển khai webhook thật qua ngrok hoặc deploy backend public',
            'Mở rộng thanh toán quốc tế bằng Stripe/PayPal nếu phát triển SaaS production',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span className="icon text-sm mt-0.5" style={{ color: 'var(--primary-400)' }}>arrow_forward</span>
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
