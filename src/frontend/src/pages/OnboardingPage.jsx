import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import api from '../api/axios'

// ── Channel cards ─────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: 'shopee',   name: 'Shopee',         icon: '🛍️',  color: '#EE4D2D', platform: 'shopee' },
  { id: 'tiktok',  name: 'TikTok Shop',     icon: '🎵',  color: '#000000', platform: 'tiktok' },
  { id: 'lazada',  name: 'Lazada',          icon: '📦',  color: '#0F146D', platform: 'lazada' },
  { id: 'facebook',name: 'Facebook',        icon: '📘',  color: '#1877F2', platform: 'facebook' },
]

const TOUR_SLIDES = [
  {
    titleKey: 'onboarding.tourSlide1Title',
    descKey:  'onboarding.tourSlide1Desc',
    icon:     'dashboard',
    color:    'bg-primary/10',
    iconColor:'text-primary',
  },
  {
    titleKey: 'onboarding.tourSlide2Title',
    descKey:  'onboarding.tourSlide2Desc',
    icon:     'bar_chart',
    color:    'bg-secondary/10',
    iconColor:'text-secondary',
  },
  {
    titleKey: 'onboarding.tourSlide3Title',
    descKey:  'onboarding.tourSlide3Desc',
    icon:     'auto_awesome',
    color:    'bg-tertiary/10',
    iconColor:'text-tertiary',
  },
  {
    titleKey: 'onboarding.tourSlide4Title',
    descKey:  'onboarding.tourSlide4Desc',
    icon:     'picture_as_pdf',
    color:    'bg-error/10',
    iconColor:'text-error',
  },
]

// ── Channel Setup Guide Modal ─────────────────────────────────────────────────
function ChannelGuideModal({ channel, onClose }) {
  const guides = {
    shopee: [
      'Đăng nhập vào Shopee Partner Portal tại open.shopee.com',
      'Tạo ứng dụng mới → lấy Partner ID và Partner Key',
      'Ủy quyền Shop của bạn → nhận Access Token',
      'Nhập thông tin vào Settings → Kênh bán hàng → Shopee',
    ],
    tiktok: [
      'Đăng nhập TikTok Shop Partner Center tại partner.tiktokshop.com',
      'Tạo ứng dụng → lấy App Key và App Secret',
      'Kết nối Shop → nhận Access Token',
      'Nhập vào Settings → Kênh bán hàng → TikTok Shop',
    ],
    lazada: [
      'Truy cập Lazada Open Platform tại open.lazada.com',
      'Tạo ứng dụng → lấy App Key và App Secret',
      'Cấp quyền Seller account → nhận Access Token',
      'Nhập vào Settings → Kênh bán hàng → Lazada',
    ],
    facebook: [
      'Tạo Facebook App tại developers.facebook.com',
      'Kích hoạt Pages API và Marketing API',
      'Lấy Long-lived Page Access Token cho Page của bạn',
      'Nhập vào Settings → Kênh bán hàng → Facebook',
    ],
  }
  const steps = guides[channel.id] || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
         onClick={onClose}>
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl
                      max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="text-2xl">{channel.icon}</div>
          <div>
            <h3 className="font-semibold text-on-surface">Kết nối {channel.name}</h3>
            <p className="text-xs text-outline">Hướng dẫn từng bước</p>
          </div>
          <button onClick={onClose} className="ml-auto text-outline hover:text-on-surface">
            <span className="icon">close</span>
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs
                              flex items-center justify-center shrink-0 font-semibold mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm text-on-surface-variant">{step}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-outline bg-primary/5 rounded-xl p-3">
          Sau khi có thông tin, vào <strong>Settings → Kênh bán hàng</strong> để hoàn tất kết nối.
        </p>
        <button onClick={onClose} className="btn-primary w-full mt-4">Đã hiểu</button>
      </div>
    </div>
  )
}

// ── Step components ───────────────────────────────────────────────────────────

function Step1({ data, onChange }) {
  const { t }   = useTranslation()
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(data.logoPreview || null)
  const objectives = ['objectiveSales','objectiveInventory','objectiveForecast','objectiveReport']

  const handleFile = e => {
    const file = e.target.files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    onChange({ ...data, logoFile: file, logoPreview: url })
  }

  const toggleObj = key => {
    const objs = data.objectives || []
    const next = objs.includes(key) ? objs.filter(o => o !== key) : [...objs, key]
    onChange({ ...data, objectives: next })
  }

  return (
    <div className="space-y-5">
      {/* Logo upload */}
      <div>
        <p className="text-sm font-medium text-on-surface mb-2">{t('onboarding.uploadLogo')}</p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-outline-variant
                          bg-surface-container flex items-center justify-center overflow-hidden cursor-pointer
                          hover:border-primary transition-colors"
               onClick={() => fileRef.current?.click()}>
            {preview
              ? <img src={preview} alt="logo" className="w-full h-full object-cover" />
              : <span className="icon text-2xl text-outline">add_photo_alternate</span>
            }
          </div>
          <div>
            <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-sm text-primary hover:underline">
              Chọn ảnh
            </button>
            <p className="text-xs text-outline mt-0.5">PNG, JPG tối đa 2MB</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* Shop name */}
      <div>
        <label className="block text-sm text-outline mb-1.5">Tên cửa hàng hiển thị</label>
        <input
          type="text" className="form-input"
          placeholder="VD: Shop ABC"
          value={data.shopDisplayName || ''}
          onChange={e => onChange({ ...data, shopDisplayName: e.target.value })}
        />
      </div>

      {/* Address */}
      <div>
        <label className="block text-sm text-outline mb-1.5">{t('onboarding.address')}</label>
        <textarea
          className="form-input resize-none h-16 text-sm"
          placeholder="Địa chỉ kho hàng hoặc văn phòng..."
          value={data.address || ''}
          onChange={e => onChange({ ...data, address: e.target.value })}
        />
      </div>

      {/* Objectives */}
      <div>
        <p className="text-sm font-medium text-on-surface mb-2">{t('onboarding.objectives')}</p>
        <div className="grid grid-cols-2 gap-2">
          {objectives.map(key => {
            const selected = (data.objectives || []).includes(key)
            return (
              <button
                key={key} type="button"
                onClick={() => toggleObj(key)}
                className={`text-left px-3 py-2 rounded-xl border text-sm transition-colors
                  ${selected
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-surface-container border-outline-variant text-on-surface-variant hover:border-primary/50'
                  }`}
              >
                <span className="icon text-sm mr-1">{selected ? 'check_box' : 'check_box_outline_blank'}</span>
                {t(`onboarding.${key}`)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Step2({ connectedChannels, onToggle }) {
  const { t } = useTranslation()
  const [guideChannel, setGuideChannel] = useState(null)

  return (
    <div>
      <p className="text-sm text-outline mb-4">
        Kết nối ít nhất 1 kênh để hệ thống đồng bộ dữ liệu thật.
        Bạn cũng có thể bỏ qua và kết nối sau trong <strong>Settings</strong>.
      </p>
      <div className="grid gap-3">
        {CHANNELS.map(ch => {
          const isConnected = connectedChannels.includes(ch.id)
          return (
            <div key={ch.id}
                 className="flex items-center gap-3 px-4 py-3 rounded-xl border border-outline-variant
                            bg-surface-container hover:bg-surface-container-high transition-colors">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                   style={{ backgroundColor: ch.color + '20' }}>
                {ch.icon}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-on-surface">{ch.name}</p>
                <p className="text-xs text-outline">
                  {isConnected ? t('onboarding.connectedStatus') : t('onboarding.notConnectedStatus')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGuideChannel(ch)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  isConnected
                    ? 'bg-success/10 text-success'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {isConnected
                  ? <><span className="icon text-sm mr-1">check</span>Đã kết nối</>
                  : t('onboarding.connectChannel')
                }
              </button>
            </div>
          )
        })}
      </div>

      {guideChannel && (
        <ChannelGuideModal
          channel={guideChannel}
          onClose={() => setGuideChannel(null)}
        />
      )}
    </div>
  )
}

function Step3({ connectedChannels }) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState(0)
  const [done,     setDone]     = useState(false)
  const hasChannels = connectedChannels.length > 0

  useEffect(() => {
    if (!hasChannels) return
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(iv); setDone(true); return 100 }
        return p + 5
      })
    }, 100)
    return () => clearInterval(iv)
  }, [hasChannels])

  if (!hasChannels) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center
                        mx-auto mb-4">
          <span className="icon text-3xl text-warning">warning</span>
        </div>
        <p className="text-on-surface font-medium mb-1">{t('onboarding.usingSampleData')}</p>
        <p className="text-sm text-outline">{t('onboarding.connectChannelFirst')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-on-surface">{done ? t('onboarding.syncComplete') : t('onboarding.syncInProgress')}</p>
          <span className="text-sm font-mono text-primary">{progress}%</span>
        </div>
        <div className="h-2 bg-surface-container rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {done && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Đơn hàng',   value: '1,247', icon: 'shopping_cart' },
            { label: 'Sản phẩm',   value: '348',   icon: 'inventory_2'  },
            { label: 'Khách hàng', value: '892',   icon: 'people'       },
          ].map((k, i) => (
            <div key={i} className="bg-surface-container rounded-xl p-3 text-center">
              <span className="icon text-xl text-primary block mb-1">{k.icon}</span>
              <p className="font-bold text-on-surface text-lg">{k.value}</p>
              <p className="text-xs text-outline">{k.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Step4() {
  const { t }       = useTranslation()
  const [slide, setSlide] = useState(0)
  const s = TOUR_SLIDES[slide]

  return (
    <div>
      {/* Slide display */}
      <div className={`rounded-2xl p-8 flex flex-col items-center text-center mb-5 ${s.color}`}>
        <div className={`w-16 h-16 rounded-2xl bg-white/50 flex items-center justify-center mb-4`}>
          <span className={`icon text-4xl ${s.iconColor}`}>{s.icon}</span>
        </div>
        <h3 className="font-semibold text-on-surface mb-2">{t(s.titleKey)}</h3>
        <p className="text-sm text-on-surface-variant">{t(s.descKey)}</p>
      </div>

      {/* Dots navigation */}
      <div className="flex items-center justify-center gap-2">
        {TOUR_SLIDES.map((_, i) => (
          <button key={i} onClick={() => setSlide(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === slide ? 'w-5 bg-primary' : 'bg-outline-variant'
                  }`} />
        ))}
      </div>

      {/* Prev / Next arrows */}
      <div className="flex justify-between mt-4">
        <button onClick={() => setSlide(s => Math.max(0, s - 1))}
                disabled={slide === 0}
                className="text-sm text-outline disabled:opacity-30">
          ← Trước
        </button>
        <button onClick={() => setSlide(s => Math.min(TOUR_SLIDES.length - 1, s + 1))}
                disabled={slide === TOUR_SLIDES.length - 1}
                className="text-sm text-primary disabled:opacity-30">
          Tiếp →
        </button>
      </div>
    </div>
  )
}

function Step5({ onGoToDashboard }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center
                      mx-auto mb-5">
        <span className="icon text-4xl text-success">check_circle</span>
      </div>
      <h3 className="font-headline text-xl font-semibold text-on-surface mb-2">
        {t('onboarding.setupSummary')}
      </h3>
      <p className="text-sm text-outline mb-8">
        Hệ thống đã sẵn sàng. Bạn có thể bắt đầu phân tích dữ liệu bán hàng ngay!
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onGoToDashboard}
                className="btn-primary col-span-2 flex items-center justify-center gap-2">
          <span className="icon text-base">dashboard</span>
          {t('onboarding.goToDashboard')}
        </button>
        <button onClick={() => window.location.href = '/settings?tab=channels'}
                className="btn-secondary flex items-center justify-center gap-2 text-sm">
          <span className="icon text-sm">link</span>
          {t('onboarding.connectMoreChannels')}
        </button>
        <button onClick={() => window.location.href = '/settings?tab=members'}
                className="btn-secondary flex items-center justify-center gap-2 text-sm">
          <span className="icon text-sm">group_add</span>
          {t('onboarding.inviteMembers')}
        </button>
      </div>
    </div>
  )
}

// ── Main Onboarding ───────────────────────────────────────────────────────────

const STEPS = [
  'onboarding.step1Title',
  'onboarding.step2Title',
  'onboarding.step3Title',
  'onboarding.step4Title',
  'onboarding.step5Title',
]

export default function OnboardingPage() {
  const { t }      = useTranslation()
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const savedStep = parseInt(localStorage.getItem('onboarding_step') || '0', 10)
  const [step, setStep] = useState(savedStep)
  const [step1Data, setStep1Data] = useState(
    JSON.parse(localStorage.getItem('onboarding_s1') || '{"objectives":[]}')
  )
  const [connectedChannels, setConnectedChannels] = useState(
    JSON.parse(localStorage.getItem('onboarding_channels') || '[]')
  )
  const [saving, setSaving] = useState(false)

  // Persist step + data
  useEffect(() => {
    localStorage.setItem('onboarding_step', step)
  }, [step])
  useEffect(() => {
    localStorage.setItem('onboarding_s1', JSON.stringify(step1Data))
  }, [step1Data])
  useEffect(() => {
    localStorage.setItem('onboarding_channels', JSON.stringify(connectedChannels))
  }, [connectedChannels])

  const goNext = () => setStep(s => Math.min(STEPS.length - 1, s + 1))
  const goBack = () => setStep(s => Math.max(0, s - 1))

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.patch('/api/company/onboarding-complete')
    } catch {
      // Ignore – still redirect
    } finally {
      // Clear onboarding state
      localStorage.removeItem('onboarding_step')
      localStorage.removeItem('onboarding_s1')
      localStorage.removeItem('onboarding_channels')
      setSaving(false)
      navigate('/dashboard', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-surface-container-low border-b border-outline-variant px-6 py-4
                      flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <span className="icon text-surface text-lg">analytics</span>
          </div>
          <span className="font-bold text-on-surface">SalesAnalytics</span>
        </div>
        <div className="text-sm text-outline">
          {t('onboarding.step')} {step + 1} {t('onboarding.of')} {STEPS.length}
        </div>
      </div>

      {/* ── Progress Bar ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-4">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-surface-container">
              <div className={`h-full rounded-full transition-all duration-300
                ${i < step ? 'bg-primary w-full'
                : i === step ? 'bg-primary w-1/2'
                : 'w-0'}`} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          {STEPS.map((key, i) => (
            <p key={i} className={`flex-1 text-xs text-center truncate ${
              i === step ? 'text-primary font-medium' : 'text-outline'
            }`}>
              {t(key)}
            </p>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-lg">
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6">
            <h2 className="font-headline text-lg font-semibold text-on-surface mb-1">
              {t(STEPS[step])}
            </h2>
            <p className="text-sm text-outline mb-5">
              {t('onboarding.subtitle')}
            </p>

            {step === 0 && <Step1 data={step1Data} onChange={setStep1Data} />}
            {step === 1 && (
              <Step2
                connectedChannels={connectedChannels}
                onToggle={id => setConnectedChannels(cs =>
                  cs.includes(id) ? cs.filter(c => c !== id) : [...cs, id]
                )}
              />
            )}
            {step === 2 && <Step3 connectedChannels={connectedChannels} />}
            {step === 3 && <Step4 />}
            {step === 4 && <Step5 onGoToDashboard={handleFinish} />}
          </div>

          {/* ── Navigation buttons ─────────────────────────────────────── */}
          {step < STEPS.length - 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={goBack}
                disabled={step === 0}
                className="flex items-center gap-1 text-sm text-outline disabled:opacity-30 hover:text-on-surface"
              >
                <span className="icon text-base">arrow_back</span>
                {t('onboarding.back')}
              </button>

              <div className="flex gap-2">
                {step === 1 && connectedChannels.length === 0 && (
                  <button onClick={goNext}
                          className="text-sm text-outline hover:text-warning px-3 py-1.5">
                    {t('onboarding.skip')}
                  </button>
                )}
                <button
                  onClick={goNext}
                  className="btn-primary flex items-center gap-1.5 text-sm"
                >
                  {t('onboarding.next')}
                  <span className="icon text-base">arrow_forward</span>
                </button>
              </div>
            </div>
          )}

          {step === STEPS.length - 1 && !saving && (
            <p className="text-xs text-center text-outline mt-4">
              Bạn có thể hoàn thành thiết lập bất cứ lúc nào trong <strong>Settings</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
