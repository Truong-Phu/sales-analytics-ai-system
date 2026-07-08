import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuth } from '../../hooks/useAuth'
import PaymentStatusBadge from '../../components/payment/PaymentStatusBadge'

function fmtVND(v) {
  if (!v && v !== 0) return '–'
  return `₫${Number(v).toLocaleString('vi-VN')}`
}

function Countdown({ expiredAt }) {
  const { t } = useTranslation()
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    if (!expiredAt) { setRemaining(''); return }

    const tick = () => {
      const diff = new Date(expiredAt) - Date.now()
      if (diff <= 0) { setRemaining(t('vietqr.expired')); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiredAt, t])

  return remaining ? (
    <span className="text-xs font-mono" style={{
      color: remaining === t('vietqr.expired') ? '#EF4444' : '#F59E0B'
    }}>
      {remaining === t('vietqr.expired') ? `⏰ ${remaining}` : `⏱ ${remaining}`}
    </span>
  ) : null
}

export default function VietQRPage() {
  const { t } = useTranslation()
  const [params]     = useSearchParams()
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const txId         = params.get('txId')

  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [toast,    setToast]    = useState('')
  const [checking, setChecking] = useState(false)

  const canMock = ['Owner', 'Manager', 'Staff'].includes(user?.role) || user?.isSuperAdmin

  const load = useCallback(async () => {
    if (!txId) { setError(t('vietqr.noTxId')); setLoading(false); return }
    try {
      const res = await api.get(`/api/payment/vietqr/${txId}`)
      setData(res.data)
    } catch {
      setError(t('vietqr.loadError'))
    } finally {
      setLoading(false)
    }
  }, [txId, t])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const currentStatus = String(data?.transaction?.status || '').toUpperCase()
    if (currentStatus !== 'PENDING') return
    const id = setInterval(async () => {
      try {
        const res = await api.get(`/api/payment/vietqr/${txId}`)
        setData(res.data)
        const nextStatus = String(res.data?.transaction?.status || '').toUpperCase()
        if (nextStatus === 'PAID') {
          setToast(t('vietqr.confirmedToast'))
          clearInterval(id)
        }
      } catch { /* silent */ }
    }, 10000)
    return () => clearInterval(id)
  }, [data?.transaction?.status, txId, t])

  const handleMockSePay = async () => {
    setChecking(true)
    try {
      await api.post('/api/payment/mock/sepay-success', {
        paymentCode    : data.transaction.paymentCode,
        amount         : data.transaction.amount,
        transactionCode: `MOCK_${Date.now()}`,
      })
      setToast(t('vietqr.simulatedToast'))
      load()
    } catch (e) {
      setToast(e.response?.data?.message ?? t('common.error'))
    } finally {
      setChecking(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--primary-500) transparent transparent transparent' }} />
    </div>
  )

  if (error) return (
    <div className="p-6 text-center" style={{ color: '#EF4444' }}>{error}</div>
  )

  const tx  = data?.transaction
  const qr  = data?.data
  const isPaid = String(tx?.status || '').toUpperCase() === 'PAID'

  const BANK_ROWS = qr ? [
    { label: t('vietqr.labelBank'),    value: qr.bankName },
    { label: t('vietqr.labelAccount'), value: qr.accountNumber },
    { label: t('vietqr.labelName'),    value: qr.accountHolder },
    { label: t('vietqr.labelContent'), value: qr.transferContent },
    { label: t('vietqr.labelAmount'),  value: fmtVND(qr.amount) },
  ] : []

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      {toast && (
        <div className="fixed top-16 right-4 z-40 px-4 py-2 rounded-lg text-sm font-medium shadow-md"
          style={{ background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' }}>
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          <span className="icon text-xl">arrow_back</span>
        </button>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('vietqr.title')}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{tx?.paymentCode}</span>
            {tx?.status && <PaymentStatusBadge status={tx.status} size="xs" />}
          </div>
        </div>
      </div>

      {isPaid ? (
        <div className="p-6 rounded-2xl text-center space-y-4"
          style={{ background: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}>
          <div>
            <span className="icon text-5xl block mb-3" style={{ color: '#10B981' }}>check_circle</span>
            <p className="font-bold text-lg" style={{ color: '#10B981' }}>{t('vietqr.successMsg')}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{fmtVND(tx?.amount)}</p>
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t border-dashed" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
            <button onClick={() => navigate('/pos')}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: '#10B981' }}>
              Quay lại quầy bán hàng (POS)
            </button>
            <button onClick={() => navigate('/orders')}
              className="w-full py-2.5 rounded-xl text-sm font-medium border transition-colors"
              style={{ borderColor: 'rgba(16,185,129,0.3)', color: '#10B981', background: 'transparent' }}>
              Xem danh sách đơn hàng
            </button>
          </div>
        </div>
      ) : (
        <>
          {qr?.qrDataUrl ? (
            <div className="p-4 rounded-2xl text-center"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <img src={qr.qrDataUrl} alt="VietQR" className="mx-auto rounded-xl"
                style={{ width: 220, height: 220, objectFit: 'contain' }}
                onError={e => { e.target.style.display = 'none' }} />
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {t('vietqr.scanHint')}
              </p>
              <div className="mt-1.5">
                <Countdown expiredAt={tx?.expiredAt} />
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl text-center"
              style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
              <span className="icon text-4xl" style={{ color: 'var(--text-tertiary)' }}>qr_code</span>
              <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                {t('vietqr.noConfig')}
              </p>
            </div>
          )}

          {qr && (
            <div className="p-4 rounded-2xl space-y-2"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                {t('vietqr.backupTitle')}
              </p>
              {BANK_ROWS.map(row => (
                <div key={row.label} className="flex justify-between items-center text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span className="font-medium font-mono text-right" style={{ color: 'var(--text-primary)' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {canMock && (
            <button onClick={handleMockSePay} disabled={checking}
              className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
              <span className="icon text-base">science</span>
              {checking ? t('vietqr.simulating') : t('vietqr.mockBtn')}
            </button>
          )}

          <div className="px-3 py-2.5 rounded-xl text-xs space-y-1"
            style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border)' }}>
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-secondary)' }}>
              <span className="icon text-sm">rocket_launch</span>
              {t('vietqr.devTitle')}
            </div>
            <p style={{ color: 'var(--text-tertiary)' }}>{t('vietqr.devNote')}</p>
          </div>
        </>
      )}
    </div>
  )
}
