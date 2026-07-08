import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

const PLAN_CFG = {
  pro:        { bg: '#EDE9FE', color: '#7C3AED' },
  free:       { bg: '#F1F5F9', color: '#475569' },
  enterprise: { bg: '#FEF9C3', color: '#92400E' },
}
const STATUS_CFG = {
  active:   { bg: 'var(--success-bg)', color: 'var(--profit-positive)' },
  inactive: { bg: 'var(--error-bg)', color: 'var(--color-error)' },
  expired:  { bg: 'var(--warning-bg)', color: 'var(--color-warning)' },
}

// Modal xác nhận khóa / mở khóa công ty
function LockModal({ company, onClose, onConfirm }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const isLocking = company.isActive

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm(company.id, !company.isActive, reason)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          {isLocking ? t('sa.companies.modalLockTitle') : t('sa.companies.modalUnlockTitle')}
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {isLocking
            ? t('sa.companies.modalLockWarn', { name: company.name })
            : t('sa.companies.modalUnlockWarn', { name: company.name })}
        </p>

        {isLocking && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {t('sa.companies.modalReasonLabel')} <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <textarea
              className="w-full p-3 rounded-xl text-sm resize-none"
              rows={3}
              placeholder={t('sa.companies.modalReasonPlaceholder')}
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
        )}

        {!isLocking && company.lockReason && (
          <div className="mb-4 p-3 rounded-xl text-sm"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span className="font-medium" style={{ color: 'var(--color-error)' }}>{t('sa.companies.modalPrevReason')} </span>
            <span style={{ color: 'var(--text-secondary)' }}>{company.lockReason}</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {t('sa.companies.modalCancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || (isLocking && !reason.trim())}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: isLocking ? 'var(--color-error)' : 'var(--profit-positive)',
              color: 'white',
            }}>
            {loading ? '...' : isLocking ? t('sa.companies.modalConfirmLock') : t('sa.companies.modalConfirmUnlock')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SaCompaniesPage() {
  const { t } = useTranslation()
  const [companies, setCompanies] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [flash,     setFlash]     = useState('')
  const [modal,     setModal]     = useState(null) // company object

  const load = useCallback(() => {
    setLoading(true)
    axios.get('/api/admin/sa/companies')
      .then(r => setCompanies(r.data))
      .catch(() => setError(t('common.cannotLoadData')))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  const handleToggle = async (id, newIsActive, reason) => {
    try {
      const res = await axios.patch(`/api/admin/sa/companies/${id}/toggle`, {
        isActive: newIsActive,
        reason: reason || null,
      })
      setFlash(res.data.message)
      setTimeout(() => setFlash(''), 3000)
      setModal(null)
      load()
    } catch {
      setError('Không thể cập nhật trạng thái')
    }
  }

  return (
    <div className="space-y-4">
      {modal && (
        <LockModal
          company={modal}
          onClose={() => setModal(null)}
          onConfirm={handleToggle}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('sa.companies.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {t('sa.companies.subtitle')}
          </p>
        </div>
        <span className="text-sm px-3 py-1 rounded-full font-medium"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          {t('sa.companies.count', { count: companies.length })}
        </span>
      </div>

      {flash && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#D1FAE5', color: '#065F46' }}>{flash}</div>
      )}
      {error && (
        <div className="px-4 py-2 rounded-lg text-sm"
          style={{ background: '#FEE2E2', color: '#991B1B' }}>{error}</div>
      )}

      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2"
              style={{ borderColor: '#6366F1' }} />
            Đang tải...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {[
                  t('sa.companies.colCompany'),
                  t('sa.companies.colEmail'),
                  t('sa.companies.colPlan'),
                  t('sa.companies.colSubscription'),
                  t('sa.companies.colMembers'),
                  t('sa.companies.colRegDate'),
                  t('sa.companies.colStatus'),
                  ''
                ].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium"
                    style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => {
                const planCfg      = PLAN_CFG[c.subscription?.plan ?? 'free'] ?? PLAN_CFG.free
                const subStatusCfg = STATUS_CFG[c.subscription?.status ?? 'active'] ?? STATUS_CFG.active
                const companyCfg   = c.isActive ? STATUS_CFG.active : STATUS_CFG.inactive
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: planCfg.bg, color: planCfg.color }}>
                        {c.subscription?.plan ?? 'free'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.subscription && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: subStatusCfg.bg, color: subStatusCfg.color }}>
                          {c.subscription.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                      {c.userCount}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {fmtDate(c.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: companyCfg.bg, color: companyCfg.color }}>
                          {c.isActive ? t('sa.companies.statusActive') : t('sa.companies.statusLocked')}
                        </span>
                        {!c.isActive && c.lockReason && (
                          <div className="text-xs mt-1 max-w-[140px] truncate"
                            style={{ color: 'var(--text-tertiary)' }}
                            title={c.lockReason}>
                            {c.lockReason}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setModal(c)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                        style={{
                          background: c.isActive ? 'var(--error-bg)' : 'var(--success-bg)',
                          color:      c.isActive ? 'var(--color-error)' : 'var(--color-success)',
                        }}>
                        {c.isActive ? t('sa.companies.btnLock') : t('sa.companies.btnUnlock')}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {companies.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm"
                  style={{ color: 'var(--text-tertiary)' }}>{t('sa.companies.noData')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
