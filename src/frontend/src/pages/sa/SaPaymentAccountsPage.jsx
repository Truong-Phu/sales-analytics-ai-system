import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

const METHOD_LABELS = {
  bank_transfer: { label: 'Chuyển khoản ngân hàng', icon: '🏦' },
  vietqr:        { label: 'VietQR',                  icon: '📱' },
  momo:          { label: 'MoMo',                    icon: '🟣' },
  vnpay:         { label: 'VNPay',                   icon: '💳' },
}

const METHODS = Object.keys(METHOD_LABELS)

// Định nghĩa fields config theo từng method
const METHOD_CONFIG = {
  bank_transfer: [
    { key: 'bank_name',      label: 'Tên ngân hàng',     type: 'text', required: true },
    { key: 'account_number', label: 'Số tài khoản',      type: 'text', required: true },
    { key: 'account_name',   label: 'Tên chủ tài khoản', type: 'text', required: true, uppercase: true },
    { key: 'branch',         label: 'Chi nhánh',         type: 'text', required: false },
    { key: 'qr_image',       label: 'Ảnh QR Code',       type: 'file', required: false },
  ],
  vietqr: [
    { key: 'bank_name',      label: 'Tên ngân hàng',     type: 'text', required: true },
    { key: 'bank_bin',       label: 'Bank BIN',          type: 'text', required: true },
    { key: 'account_number', label: 'Số tài khoản',      type: 'text', required: true },
    { key: 'account_name',   label: 'Tên chủ tài khoản', type: 'text', required: true, uppercase: true },
  ],
  momo: [
    { key: 'partner_code', label: 'Partner Code', type: 'text',     required: true },
    { key: 'access_key',   label: 'Access Key',   type: 'text',     required: true },
    { key: 'secret_key',   label: 'Secret Key',   type: 'password', required: true },
    { key: 'endpoint',     label: 'Endpoint',     type: 'url',      required: true,
      defaultVal: 'https://payment.momo.vn/v2/gateway/api/create' },
  ],
  vnpay: [
    { key: 'tmn_code',    label: 'TMN Code',    type: 'text',     required: true },
    { key: 'hash_secret', label: 'Hash Secret', type: 'password', required: true },
    { key: 'payment_url', label: 'Payment URL', type: 'url',      required: true,
      defaultVal: 'https://pay.vnpay.vn/vpcpay.html' },
  ],
}

function buildInitialFields(method, existingConfig) {
  const fields = {}
  const defs = METHOD_CONFIG[method] ?? []
  defs.forEach(f => {
    if (f.type === 'file') {
      const existing = existingConfig?.[f.key]
      if (existing) fields[f.key] = existing
      return
    }
    const existing = existingConfig?.[f.key]
    // Nếu field là masked (*****) hoặc không có → dùng default hoặc rỗng
    fields[f.key] = (existing && existing !== '*****') ? String(existing) : (f.defaultVal ?? '')
  })
  return fields
}

function AccountFormModal({ initial, onClose, onSave }) {
  const { t } = useTranslation()
  const isEdit = !!initial
  const [method,      setMethod]      = useState(initial?.method      ?? 'vnpay')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [isActive,    setIsActive]    = useState(initial?.isActive    ?? true)
  const [isDefault,   setIsDefault]   = useState(initial?.isDefault   ?? false)
  const [note,        setNote]        = useState(initial?.note        ?? '')
  const [sortOrder,   setSortOrder]   = useState(initial?.sortOrder   ?? 0)
  const [configFields, setConfigFields] = useState(() =>
    buildInitialFields(initial?.method ?? 'vnpay', initial?.config)
  )
  const [showPass,  setShowPass]  = useState({}) // key → boolean
  const [qrPreview, setQrPreview] = useState(initial?.config?.qr_image ?? null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const qrRef = useRef(null)

  const getMethodLabel = (methodKey) => {
    switch (methodKey) {
      case 'bank_transfer': return t('paymentMethod.bank_transfer', 'Chuyển khoản ngân hàng');
      case 'vietqr': return t('paymentMethod.vietqr', 'VietQR');
      case 'momo': return t('paymentMethod.momo', 'MoMo');
      case 'vnpay': return t('paymentMethod.vnpay', 'VNPay');
      default: return methodKey;
    }
  }

  const getFieldLabel = (fieldKey, defaultLabel) => {
    switch (fieldKey) {
      case 'bank_name': return t('paymentField.bank_name', 'Tên ngân hàng');
      case 'account_number': return t('paymentField.account_number', 'Số tài khoản');
      case 'account_name': return t('paymentField.account_name', 'Tên chủ tài khoản');
      case 'branch': return t('paymentField.branch', 'Chi nhánh');
      case 'qr_image': return t('paymentField.qr_image', 'Ảnh QR Code');
      case 'bank_bin': return t('paymentField.bank_bin', 'Bank BIN');
      case 'partner_code': return t('paymentField.partner_code', 'Partner Code');
      case 'access_key': return t('paymentField.access_key', 'Access Key');
      case 'secret_key': return t('paymentField.secret_key', 'Secret Key');
      case 'endpoint': return t('paymentField.endpoint', 'Endpoint');
      case 'tmn_code': return t('paymentField.tmn_code', 'TMN Code');
      case 'hash_secret': return t('paymentField.hash_secret', 'Hash Secret');
      case 'payment_url': return t('paymentField.payment_url', 'Payment URL');
      default: return defaultLabel;
    }
  }

  // Reset config fields khi đổi method
  useEffect(() => {
    setConfigFields(buildInitialFields(method, isEdit ? initial?.config : null))
    setShowPass({})
    setQrPreview((isEdit && method === initial?.method) ? initial?.config?.qr_image : null)
  }, [method]) // eslint-disable-line react-hooks/exhaustive-deps

  const setField = key => e => {
    let val = e.target.value
    const def = (METHOD_CONFIG[method] ?? []).find(f => f.key === key)
    if (def?.uppercase) val = val.toUpperCase()
    setConfigFields(prev => ({ ...prev, [key]: val }))
  }

  const handleQrSelect = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = ev.target.result
      setConfigFields(prev => ({ ...prev, qr_image: b64 }))
      setQrPreview(b64)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!displayName.trim()) { setError(t('sa.paymentAccounts.errDisplayName')); return }

    const defs = METHOD_CONFIG[method] ?? []
    for (const f of defs) {
      if (f.required && f.type !== 'file' && !configFields[f.key]) {
        setError(t('sa.paymentAccounts.errFieldRequired', { label: getFieldLabel(f.key, f.label) })); return
      }
    }

    // Nếu edit mà toàn bộ config fields rỗng → không gửi config (giữ cũ)
    const allEmpty = defs
      .filter(f => f.type !== 'file')
      .every(f => !configFields[f.key])
    const configStr = (!isEdit || !allEmpty) ? JSON.stringify(configFields) : null

    setLoading(true); setError('')
    try {
      await onSave({
        method,
        displayName: displayName.trim(),
        isActive,
        isDefault,
        config:    configStr,
        note:      note || null,
        sortOrder: parseInt(sortOrder) || 0,
      })
    } catch (err) {
      setError(err.response?.data?.message ?? t('common.saveError'))
    } finally {
      setLoading(false)
    }
  }

  const defs = METHOD_CONFIG[method] ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          {isEdit ? t('sa.paymentAccounts.modalEditTitle') : t('sa.paymentAccounts.modalCreateTitle')}
        </h3>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Method + Display name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('sa.paymentAccounts.modalMethod')} <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select className="linput text-sm" value={method}
                onChange={e => setMethod(e.target.value)}>
                {METHODS.map(m => (
                  <option key={m} value={m}>{METHOD_LABELS[m].icon} {getMethodLabel(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('sa.paymentAccounts.modalDisplayName')} <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input type="text" className="linput text-sm"
                placeholder={t('sa.paymentAccounts.modalDisplayNamePlaceholder')}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)} />
            </div>
          </div>

          {/* Dynamic config fields theo method */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              {t('sa.paymentAccounts.modalConfigHeader', { label: getMethodLabel(method) })}
              {isEdit && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{t('sa.paymentAccounts.modalConfigEditHint')}</span>}
            </p>

            <div className="space-y-3">
              {defs.map(f => {
                if (f.type === 'file') {
                  // QR upload (bank_transfer)
                  return (
                    <div key={f.key}>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {getFieldLabel(f.key, f.label)}
                      </label>
                      {qrPreview && (
                        <img src={qrPreview} alt="QR preview"
                          className="w-24 h-24 object-contain rounded-lg mb-2"
                          style={{ border: '1px solid var(--border)' }} />
                      )}
                      <button type="button"
                        onClick={() => qrRef.current?.click()}
                        className="lbtn lbtn-secondary !h-8 text-xs">
                        <span className="icon text-sm">upload</span>
                        {qrPreview ? t('sa.paymentAccounts.modalChangeQr') : t('sa.paymentAccounts.modalSelectQr')}
                      </button>
                      <input ref={qrRef} type="file" accept="image/*" className="hidden"
                        onChange={handleQrSelect} />
                    </div>
                  )
                }

                if (f.type === 'password') {
                  const visible = showPass[f.key] ?? false
                  return (
                    <div key={f.key}>
                      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {getFieldLabel(f.key, f.label)}{f.required && <span style={{ color: '#EF4444' }}> *</span>}
                        <span className="ml-1" style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>{t('sa.paymentAccounts.modalSensitiveField')}</span>
                      </label>
                      <div className="relative">
                        <input
                           type={visible ? 'text' : 'password'}
                           className="linput text-sm"
                           style={{ paddingRight: 40 }}
                           placeholder={isEdit ? t('sa.paymentAccounts.modalSensitivePlaceholder') : ''}
                           value={configFields[f.key] ?? ''}
                           onChange={setField(f.key)} />
                        <button type="button"
                          onClick={() => setShowPass(p => ({ ...p, [f.key]: !visible }))}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          <span className="icon" style={{ fontSize: 18 }}>{visible ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                    </div>
                  )
                }

                // text / url
                return (
                  <div key={f.key}>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      {getFieldLabel(f.key, f.label)}{f.required && <span style={{ color: '#EF4444' }}> *</span>}
                    </label>
                    <input type={f.type === 'url' ? 'url' : 'text'}
                      className="linput text-sm"
                      placeholder={f.defaultVal ?? ''}
                      value={configFields[f.key] ?? ''}
                      onChange={setField(f.key)} />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Note + sort order */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('sa.paymentAccounts.modalNote')}
              </label>
              <input type="text" className="linput text-sm"
                placeholder={t('sa.paymentAccounts.modalNotePlaceholder')}
                value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('sa.paymentAccounts.modalSort')}
              </label>
              <input type="number" className="linput text-sm"
                value={sortOrder} min={0}
                onChange={e => setSortOrder(e.target.value)} />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-5">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
              {t('sa.paymentAccounts.modalActive')}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              {t('sa.paymentAccounts.modalDefault')}
            </label>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {t('sa.paymentAccounts.modalCancel')}
          </button>
          <button onClick={handleSave} disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--primary-500)', color: 'white' }}>
            {loading ? t('sa.paymentSettings.saving') : isEdit ? t('sa.paymentAccounts.modalSave') : t('sa.paymentAccounts.modalAdd')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SaPaymentAccountsPage() {
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [flash,    setFlash]    = useState('')
  const [modal,    setModal]    = useState(null) // null | { type: 'create' | 'edit', data? }
  const [deleting, setDeleting] = useState(null)

  const getMethodLabel = (methodKey) => {
    switch (methodKey) {
      case 'bank_transfer': return t('paymentMethod.bank_transfer', 'Chuyển khoản ngân hàng');
      case 'vietqr': return t('paymentMethod.vietqr', 'VietQR');
      case 'momo': return t('paymentMethod.momo', 'MoMo');
      case 'vnpay': return t('paymentMethod.vnpay', 'VNPay');
      default: return methodKey;
    }
  }

  const load = useCallback(() => {
    setLoading(true)
    axios.get('/api/system/payment-accounts')
      .then(r => setAccounts(r.data.data ?? []))
      .catch(() => setError(t('common.cannotLoadData')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  const showFlash = msg => { setFlash(msg); setTimeout(() => setFlash(''), 3000) }

  const handleSave = async formData => {
    if (modal?.type === 'edit') {
      await axios.put(`/api/system/payment-accounts/${modal.data.id}`, formData)
      showFlash(t('sa.paymentAccounts.toastUpdated'))
    } else {
      await axios.post('/api/system/payment-accounts', formData)
      showFlash(t('sa.paymentAccounts.toastAdded'))
    }
    setModal(null)
    load()
  }

  const handleDelete = async id => {
    setDeleting(id)
    try {
      await axios.delete(`/api/system/payment-accounts/${id}`)
      showFlash(t('sa.paymentAccounts.toastDeleted'))
      load()
    } catch {
      setError(t('sa.paymentAccounts.errorDelete'))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {modal && (
        <AccountFormModal
          initial={modal.type === 'edit' ? modal.data : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('sa.paymentAccounts.title')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('sa.paymentAccounts.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setModal({ type: 'create' })}
          className="lbtn lbtn-primary text-sm"
          style={{ height: 36 }}>
          <span className="icon text-base">add</span>
          {t('sa.paymentAccounts.addBtn')}
        </button>
      </div>

      {flash && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#D1FAE5', color: '#065F46' }}>{flash}</div>
      )}
      {error && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 rounded-xl flex items-center gap-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="w-9 h-9 rounded-full skeleton" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded skeleton" />
                <div className="h-3 w-24 rounded skeleton" />
              </div>
              <div className="h-8 w-20 rounded-lg skeleton" />
              <div className="h-8 w-16 rounded-lg skeleton" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="py-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <span className="icon text-4xl block mb-3" style={{ color: 'var(--text-tertiary)' }}>payments</span>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{t('sa.paymentAccounts.noData')}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{t('sa.paymentAccounts.addHint')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {accounts.map(a => {
            const m = METHOD_LABELS[a.method] ?? { label: a.method, icon: '💰' }
            return (
              <div key={a.id}
                className="p-4 rounded-xl flex items-center gap-4"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="text-2xl">{m.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{a.displayName}</span>
                    {a.isDefault && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: '#EDE9FE', color: '#7C3AED' }}>{t('sa.paymentAccounts.defaultBadge')}</span>
                    )}
                    {!a.isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: '#FEE2E2', color: '#991B1B' }}>{t('sa.paymentAccounts.inactiveBadge')}</span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {getMethodLabel(a.method)}
                    {a.note && <span> · {a.note}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setModal({ type: 'edit', data: a })}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                    {t('sa.paymentAccounts.btnEdit')}
                  </button>
                  <button
                    disabled={deleting === a.id}
                    onClick={() => handleDelete(a.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ background: '#FEE2E2', color: '#991B1B' }}>
                    {deleting === a.id ? '...' : t('sa.paymentAccounts.btnDelete')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
