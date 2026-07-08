import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'

// Các phương thức thật người dùng nhìn thấy
const REAL_METHODS = [
  { key: 'CASH',         label: 'Tiền mặt',              icon: '💵' },
  { key: 'VIETQR',       label: 'VietQR',                icon: '📱' },
  { key: 'BANK_TRANSFER',label: 'Chuyển khoản ngân hàng', icon: '🏦' },
  { key: 'MOMO',         label: 'MoMo',                  icon: '🟣' },
  { key: 'VNPAY',        label: 'VNPAY',                 icon: '💳' },
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
  const { t } = useTranslation()
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
      setFlash(t('sa.paymentSettings.badgeSaved'))
      setTimeout(() => setFlash(''), 2000)
    } catch { /* lỗi hiện ở trên */ } finally {
      setSaving(false)
    }
  }

  const getFieldLabel = (fieldKey, defaultLabel) => {
    switch (fieldKey) {
      case 'partnerCode': return t('paymentField.partnerCode', 'Partner Code');
      case 'accessKey': return t('paymentField.accessKey', 'Access Key');
      case 'secretKey': return t('paymentField.secretKey', 'Secret Key');
      case 'tmnCode': return t('paymentField.tmnCode', 'TMN Code');
      case 'hashSecret': return t('paymentField.hashSecret', 'Hash Secret');
      case 'apiKey': return t('paymentField.apiKey', 'API Key (tương lai)');
      case 'webhookUrl': return t('paymentField.webhookUrl', 'Webhook URL (tương lai)');
      default: return defaultLabel;
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
              {getFieldLabel(f.key, f.label)}
              {f.future && <span className="ml-1 text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>{t('sa.paymentSettings.sandboxHint')}</span>}
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
          {saving ? t('sa.paymentSettings.saving') : t('sa.paymentSettings.btnSaveConfig')}
        </button>
        {flash && <span className="text-xs" style={{ color: '#10B981' }}>{flash}</span>}
      </div>
    </div>
  )
}

export default function SaPaymentSettingsPage() {
  const { t } = useTranslation()
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
      setError(t('common.cannotLoadData'))
    } finally {
      setLoading(false)
    }
  }, [t])

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
      showFlash(t('sa.paymentSettings.toastStatus', { method: methodKey, status: newVal ? t('sa.companies.statusActive').toLowerCase() : t('sa.companies.statusLocked').toLowerCase() }))
    } catch {
      showFlash(t('sa.paymentSettings.toastSaveError'))
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
    showFlash(t('sa.paymentSettings.toastSaved'))
  }

  const getRealMethodLabel = (key) => {
    switch (key) {
      case 'CASH': return t('paymentMethod.cash', 'Tiền mặt');
      case 'VIETQR': return t('paymentMethod.vietqr', 'VietQR');
      case 'BANK_TRANSFER': return t('paymentMethod.bank_transfer', 'Chuyển khoản ngân hàng');
      case 'MOMO': return t('paymentMethod.momo', 'MoMo');
      case 'VNPAY': return t('paymentMethod.vnpay', 'VNPAY');
      default: return key;
    }
  }

  const getMockProviderLabel = (key) => {
    switch (key) {
      case 'MOCK_SEPAY': return t('paymentMock.sepayLabel', 'Mock SePay Webhook');
      case 'MOCK_MOMO': return t('paymentMock.momoLabel', 'Mock MoMo Callback');
      case 'MOCK_VNPAY': return t('paymentMock.vnpayLabel', 'Mock VNPAY Callback');
      default: return key;
    }
  }

  const getMockProviderDesc = (key) => {
    switch (key) {
      case 'MOCK_SEPAY': return t('paymentMock.sepayDesc', 'Giả lập webhook SePay để tự động xác nhận VietQR/chuyển khoản');
      case 'MOCK_MOMO': return t('paymentMock.momoDesc', 'Giả lập callback MoMo (success/failed/cancelled)');
      case 'MOCK_VNPAY': return t('paymentMock.vnpayDesc', 'Giả lập callback VNPAY (success/failed/cancelled)');
      default: return '';
    }
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
          {t('sa.paymentSettings.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {t('sa.paymentSettings.subtitle')}
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
          {t('sa.paymentSettings.secMethods')}
        </h2>
        <div className="space-y-3">
          {REAL_METHODS.map(m => {
            const cfg = configs[m.key] ?? {}
            return (
              <div key={m.key} className="p-4 rounded-2xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <Toggle
                  label={<span><span style={{ marginRight: 6 }}>{m.icon}</span>{getRealMethodLabel(m.key)}</span>}
                  checked={cfg.enabled ?? false}
                  onChange={() => toggleEnabled(m.key, !(cfg.enabled ?? false))}
                />
                {(cfg.enabled ?? false) && m.key === 'VIETQR' && (
                  <div className="mt-3 pt-3 flex items-start gap-2 text-xs"
                    style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                    <span className="icon text-sm mt-0.5" style={{ color: 'var(--primary-400)' }}>info</span>
                    <span>
                      {t('sa.paymentSettings.vietqrGuide')}
                    </span>
                  </div>
                )}
                {(cfg.enabled ?? false) && m.key === 'BANK_TRANSFER' && (
                  <div className="mt-3 pt-3 flex items-start gap-2 text-xs"
                    style={{ borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                    <span className="icon text-sm mt-0.5" style={{ color: 'var(--primary-400)' }}>info</span>
                    <span>
                      {t('sa.paymentSettings.bankTransferGuide', 'Thông tin ngân hàng chuyển khoản được cấu hình tại Tài khoản thanh toán — Thêm tài khoản với phương thức Chuyển khoản ngân hàng và đặt làm mặc định.')}
                    </span>
                  </div>
                )}
                {(cfg.enabled ?? false) && m.key !== 'VIETQR' && m.key !== 'BANK_TRANSFER' && (
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
          {t('sa.paymentSettings.secMock')}
        </h2>
        <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
          {t('sa.paymentSettings.mockGuide')}
        </p>
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          {/* Dev mode badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium w-fit"
            style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
            <span className="icon text-sm">science</span>
            {t('sa.paymentSettings.devBadge')}
          </div>
          {MOCK_PROVIDERS.map(p => {
            const cfg = configs[p.key] ?? {}
            return (
              <div key={p.key}>
                <Toggle
                  label={getMockProviderLabel(p.key)}
                  desc={getMockProviderDesc(p.key)}
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
          {t('sa.paymentSettings.secRoadmap')}
        </h2>
        <div className="p-4 rounded-2xl space-y-2"
          style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
            {t('sa.paymentSettings.roadmapDesc')}
          </p>
          {[
            t('sa.paymentSettings.roadmapItem1'),
            t('sa.paymentSettings.roadmapItem2'),
            t('sa.paymentSettings.roadmapItem3'),
            t('sa.paymentSettings.roadmapItem4'),
            t('sa.paymentSettings.roadmapItem5')
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
