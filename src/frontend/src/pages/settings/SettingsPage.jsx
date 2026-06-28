import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { Link, useSearchParams } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import axios from '../../api/axios'
import SubscriptionPage from './SubscriptionPage'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

// ── Cảnh báo đổi mật khẩu mặc định ──────────────────────────────────────────
const PWD_WARNING_KEY = 'msas_pwd_warning_dismissed'

function PasswordWarningBanner() {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(PWD_WARNING_KEY) === 'true'
  )

  if (dismissed) return null

  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
         style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }}>
      <span className="icon shrink-0 mt-0.5" style={{ fontSize: 20, color: '#D97706' }}>warning</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
          {t('settings.defaultPasswordWarning')}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>
          {t('settings.defaultPasswordWarningDesc')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link to="/change-password"
              className="lbtn lbtn-primary !h-8 !px-3 text-xs">
          {t('settings.changeNow')}
        </Link>
        <button
          onClick={() => { localStorage.setItem(PWD_WARNING_KEY, 'true'); setDismissed(true) }}
          className="w-7 h-7 flex items-center justify-center rounded-lg"
          style={{ color: '#B45309' }}
          title={t('settings.ignore')}>
          <span className="icon" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>
    </div>
  )
}

// ── Avatar component ──────────────────────────────────────────────────────────
function AvatarSection({ user, avatarUrl, onAvatarChange, onContextUpdate }) {
  const { t } = useTranslation()
  const fileRef = useRef(null)
  const [preview,   setPreview]   = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  const initials = (user?.fullName ?? user?.name ?? 'U')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const handleFile = async e => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setUploadErr(t('settings.avatarSizeError', 'Ảnh tối đa 2MB')); return }
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) { setUploadErr(t('settings.avatarTypeError', 'Chỉ chấp nhận PNG/JPG/WEBP')); return }

    setUploadErr('')
    // Hiển thị preview ngay
    setPreview(URL.createObjectURL(file))

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      await axios.post('/api/users/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      // Refresh toàn bộ profile từ API để lấy avatarUrl đầy đủ và nhất quán
      const profile = await axios.get('/api/users/me')
      const freshAvatarUrl = profile.data.avatarUrl ?? profile.data.avatar_url
      onAvatarChange?.(freshAvatarUrl)
      onContextUpdate?.({ avatarUrl: freshAvatarUrl, fullName: profile.data.fullName ?? profile.data.full_name })
      setPreview(null) // xóa blob preview, dùng URL thật từ API
    } catch (err) {
      setUploadErr(err.response?.data?.message ?? t('settings.uploadFailed', 'Upload thất bại'))
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const src = preview ?? avatarUrl ?? user?.avatarUrl
  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center font-bold text-2xl text-white shrink-0"
          style={{ background: src ? undefined : 'linear-gradient(135deg, var(--primary-500), var(--accent-500))' }}>
          {src ? <img src={src} alt="avatar" className="w-full h-full object-cover" /> : initials}
        </div>
        {uploading && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <button onClick={() => fileRef.current?.click()}
          className="lbtn lbtn-secondary text-sm" style={{ height: 36 }}>
          <span className="icon icon-sm">upload</span>
          {t('settings.changeAvatar')}
        </button>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('settings.avatarHint', 'PNG · JPG · WEBP · Tối đa 2MB')}</p>
        {uploadErr && <p className="text-xs" style={{ color: '#EF4444' }}>{uploadErr}</p>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
    </div>
  )
}

// ── Notification toggle ───────────────────────────────────────────────────────
function NotifToggle({ label, desc, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className="w-11 h-6 rounded-full transition-all shrink-0"
        style={{ background: value ? 'var(--primary-500)' : 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div className="w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: value ? 'translateX(20px)' : 'translateX(2px)', marginTop: '2px' }} />
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { user, logout, updateUser } = useAuth()
  const { isDark, toggle } = useTheme()

  const NAV = [
    { key: 'profile',       icon: 'person',           label: t('settings.account') },
    { key: 'security',      icon: 'lock',             label: t('settings.security') },
    { key: 'notifications', icon: 'notifications',    label: t('settings.notifications') },
    { key: 'appearance',    icon: 'palette',          label: t('settings.appearance') },
    // Chỉ Owner mới thấy tab Gói dịch vụ
    ...(user?.role === 'Owner'
      ? [{ key: 'subscription', icon: 'workspace_premium', label: t('subscription.title', 'Gói dịch vụ') }]
      : []),
    { key: 'policy',        icon: 'gavel',            label: t('settings.policy') },
  ]

  const [searchParams] = useSearchParams()
  const [section,    setSection]    = useState(() => searchParams.get('tab') ?? 'profile')
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState('')
  const [avatarUrl,  setAvatarUrl]  = useState(user?.avatarUrl ?? null)
  const [loginHistory, setLoginHistory] = useState([])
  const [histLoading,  setHistLoading]  = useState(false)
  const [logoutConfirmDlg, setLogoutConfirmDlg] = useState(false)

  // Profile form state
  const [profile, setProfile] = useState({
    fullName:  user?.fullName ?? user?.name ?? '',
    email:     user?.email ?? '',
    phone:     user?.phone ?? '',
    birthdate: user?.birthdate ?? '',
    timezone:  user?.timezone ?? 'Asia/Ho_Chi_Minh',
    langPref:  user?.langPref ?? i18n.language?.slice(0,2) ?? 'vi',
  })

  // Notification preferences
  const [notif, setNotif] = useState({
    emailNotify:        true,
    anomalyAlert:       true,
    lowStockAlert:      true,
    newOrderNotify:     true,
    syncErrorNotify:    true,
    subscriptionNotify: true,
    aiRecommendAlert:   false,
    dailyReport:        false,
    weeklyReport:       true,
    pushNotify:         false,
  })

  // Load profile từ API khi mount để lấy phone, birthdate, timezone, langPref, avatarUrl
  useEffect(() => {
    axios.get('/api/users/me')
      .then(r => {
        const d = r.data
        setProfile({
          fullName:  d.fullName  ?? d.full_name  ?? user?.fullName ?? '',
          email:     d.email     ?? user?.email  ?? '',
          phone:     d.phone     ?? '',
          birthdate: d.birthdate ?? '',
          timezone:  d.timezone  ?? 'Asia/Ho_Chi_Minh',
          langPref:  d.langPref  ?? d.lang_pref  ?? 'vi',
        })
        const av = d.avatarUrl ?? d.avatar_url
        if (av) setAvatarUrl(av)
      })
      .catch(() => {}) // giữ giá trị mặc định nếu API lỗi
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load notification prefs từ API khi mount
  useEffect(() => {
    axios.get('/api/users/notification-preferences')
      .then(r => setNotif(r.data))
      .catch(() => {})
  }, [])

  // Load lịch sử đăng nhập thực tế khi vào tab Bảo mật
  useEffect(() => {
    if (section !== 'security') return
    setHistLoading(true)
    axios.get('/api/users/login-history')
      .then(r => setLoginHistory(r.data))
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [section])

  const flash = (err = '') => {
    if (err) { setError(err); setTimeout(() => setError(''), 4000); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const saveProfile = async () => {
    try {
      await axios.patch('/api/users/profile', {
        fullName:  profile.fullName || null,
        phone:     profile.phone     || null,
        birthdate: profile.birthdate || null,
        timezone:  profile.timezone  || null,
        langPref:  profile.langPref  || null,
      })
      // Cập nhật user context để navbar/header hiển thị tên mới ngay
      updateUser({ name: profile.fullName, lang: profile.langPref })
      i18n.changeLanguage(profile.langPref)
      localStorage.setItem('lang', profile.langPref)
      flash()
    } catch (err) {
      flash(err.response?.data?.message ?? t('settings.saveError', 'Không thể lưu thông tin. Vui lòng thử lại.'))
    }
  }

  const saveNotif = async () => {
    try {
      await axios.put('/api/users/notification-preferences', notif)
      flash()
    } catch (err) {
      flash(err.response?.data?.message ?? t('settings.notifSaveError', 'Lỗi lưu tùy chọn thông báo'))
    }
  }

  const handleLogoutAll = () => {
    setLogoutConfirmDlg(true)
  }

  const doLogoutAll = async () => {
    try {
      await axios.post('/api/users/logout-all')
      logout()
    } catch (err) {
      flash(err.response?.data?.message ?? t('settings.logoutError', 'Lỗi đăng xuất'))
    }
  }

  return (
    <>
    <ConfirmDialog
      open={logoutConfirmDlg}
      title={t('settings.logoutAllDevices')}
      message={t('settings.logoutAllDevicesConfirm')}
      icon="logout"
      danger={false}
      onClose={() => setLogoutConfirmDlg(false)}
      onConfirm={() => { setLogoutConfirmDlg(false); doLogoutAll() }}
    />
    <div className="space-y-4">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('settings.title')}</h1>

      {/* Mobile: horizontal scrollable tab bar */}
      <div className="flex md:hidden overflow-x-auto gap-1 pb-1 -mx-1 px-1"
           style={{ scrollbarWidth: 'none' }}>
        {NAV.map(item => (
          <button key={item.key} onClick={() => setSection(item.key)}
            className="flex-none flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all"
            style={{
              background: section === item.key ? 'rgba(99,102,241,0.12)' : 'var(--bg-elevated)',
              color:      section === item.key ? 'var(--primary-500)'     : 'var(--text-secondary)',
              border:     `1px solid ${section === item.key ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
            }}>
            <span className="icon" style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Desktop: vertical left nav */}
        <div className="hidden md:block w-52 shrink-0">
          <div className="lcard p-2 space-y-0.5">
            {NAV.map(item => (
              <button key={item.key} onClick={() => setSection(item.key)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left"
                style={{
                  background: section === item.key ? 'var(--primary-50, rgba(99,102,241,0.08))' : 'transparent',
                  color: section === item.key ? 'var(--primary-500)' : 'var(--text-secondary)',
                }}>
                <span className="icon" style={{ fontSize: 20 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Feedback */}
          {saved && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--accent-500)' }}>
              <span className="icon" style={{ fontSize: 18 }}>check_circle</span>
              {t('settings.saveSuccess')}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm slide-up"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--color-error)' }}>
              <span className="icon" style={{ fontSize: 18 }}>error</span>
              {error}
            </div>
          )}

          {/* ── PROFILE ── */}
          {section === 'profile' && (
            <div className="lcard p-5 space-y-5">
              <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.profileInfo')}</h2>

              {/* Avatar */}
              <AvatarSection
                user={user}
                avatarUrl={avatarUrl}
                onAvatarChange={url => setAvatarUrl(url)}
                onContextUpdate={updateUser}
              />
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }} />

              {/* Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: t('settings.fullName'),  key: 'fullName',  type: 'text',     placeholder: t('settings.fullNamePlaceholder', 'Nguyễn Văn A') },
                  { label: t('auth.email', 'Email'),      key: 'email',     type: 'email',    placeholder: 'user@example.com', disabled: true },
                  { label: t('settings.phoneNumber'), key: 'phone', type: 'tel',      placeholder: t('settings.phonePlaceholder', '09xxxxxxxx') },
                  { label: t('settings.birthdate'),  key: 'birthdate', type: 'date',     placeholder: '' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-caption font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{f.label}</label>
                    <input type={f.type} placeholder={f.placeholder}
                      value={profile[f.key]} disabled={f.disabled}
                      onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                      className="linput text-sm"
                      style={{ opacity: f.disabled ? 0.6 : 1 }}
                    />
                  </div>
                ))}

                {/* Timezone */}
                <div>
                  <label className="block text-caption font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.timezone')}</label>
                  <select value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))} className="linput text-sm">
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="UTC">UTC (GMT+0)</option>
                  </select>
                </div>

                {/* Language preference */}
                <div>
                  <label className="block text-caption font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('settings.defaultLanguage')}</label>
                  <select value={profile.langPref} onChange={e => setProfile(p => ({ ...p, langPref: e.target.value }))} className="linput text-sm">
                    <option value="vi">🇻🇳 Tiếng Việt</option>
                    <option value="en">🇺🇸 English</option>
                  </select>
                </div>
              </div>

              {/* Role (readonly) */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
                <span className="icon" style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>badge</span>
                <div>
                  <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{t('settings.systemRole', 'Vai trò hệ thống')}</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t(`admin.roles.${user?.role}`, user?.role)}
                  </div>
                </div>
              </div>

              <button onClick={saveProfile} className="lbtn lbtn-primary" style={{ height: 40 }}>
                <span className="icon icon-sm">save</span>
                {t('settings.saveInfo')}
              </button>
            </div>
          )}

          {/* ── SECURITY ── */}
          {section === 'security' && (
            <div className="space-y-4">
              {/* Cảnh báo mật khẩu mặc định */}
              <PasswordWarningBanner />

              <div className="lcard p-5 space-y-3">
                <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.securityInfo')}</h2>
                <Link to="/change-password"
                  className="flex items-center justify-between p-4 rounded-xl transition-all border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary-500)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div className="flex items-center gap-3">
                    <span className="icon w-9 h-9 flex items-center justify-center rounded-xl"
                      style={{ fontSize: 20, background: 'rgba(99,102,241,0.10)', color: 'var(--primary-500)' }}>lock</span>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('settings.changePassword')}</div>
                      <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{t('settings.changePasswordDesc')}</div>
                    </div>
                  </div>
                  <span className="icon" style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>chevron_right</span>
                </Link>

                <button className="w-full flex items-center justify-between p-4 rounded-xl transition-all border text-left"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
                  onClick={handleLogoutAll}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-error)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div className="flex items-center gap-3">
                    <span className="icon w-9 h-9 flex items-center justify-center rounded-xl"
                      style={{ fontSize: 20, background: 'rgba(239,68,68,0.10)', color: 'var(--color-error)' }}>logout</span>
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>{t('settings.logoutAllDevices')}</div>
                      <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{t('settings.logoutAllDevicesDesc')}</div>
                    </div>
                  </div>
                  <span className="icon" style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>chevron_right</span>
                </button>
              </div>

              {/* Login history */}
              <div className="lcard p-5">
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>{t('settings.recentLoginHistory')}</h3>
                {histLoading ? (
                  <div className="flex justify-center py-6">
                    <span className="w-5 h-5 border-2 rounded-full"
                          style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : loginHistory.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>{t('settings.noLoginHistory')}</p>
                ) : (
                  <div className="space-y-2">
                    {loginHistory.map((log, i) => (
                      <div key={i} className="flex items-start gap-3 py-2.5"
                           style={{ borderBottom: i < loginHistory.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span className="icon w-8 h-8 flex items-center justify-center rounded-lg shrink-0"
                          style={{ fontSize: 16,
                                   background: log.status === 'SUCCESS' ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
                                   color: log.status === 'SUCCESS' ? 'var(--accent-500)' : '#EF4444' }}>
                          {log.status === 'SUCCESS' ? 'check_circle' : 'cancel'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                            {log.userAgent ?? t('settings.unknownDevice')}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            IP: {log.ip ?? '—'} · {log.time ? new Date(log.time).toLocaleString(i18n.language?.startsWith('en') ? 'en-US' : 'vi-VN') : '—'}
                          </div>
                        </div>
                        <span className="text-xs font-medium shrink-0"
                              style={{ color: log.status === 'SUCCESS' ? 'var(--accent-500)' : '#EF4444' }}>
                          {log.status === 'SUCCESS' ? t('admin.auditStatus.SUCCESS', 'Thành công') : t('admin.auditStatus.FAILED', 'Thất bại')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {section === 'notifications' && (() => {
            const role = user?.role ?? ''
            const isOwner    = role === 'Owner'
            const isManager  = ['Owner','Manager'].includes(role)
            const isDataIT   = ['Owner','DataIT'].includes(role)
            const isWarehouse= ['Owner','Manager','Staff_Warehouse','DataIT'].includes(role)
            const isStaff    = ['Owner','Manager','Staff_Sales','Staff_Warehouse','Staff_Marketing'].includes(role)
            return (
              <div className="lcard p-5 space-y-1">
                <h2 className="text-subtitle font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('settings.notif.title')}</h2>
                <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  {t('settings.notif.desc')}
                </p>

                {/* ── Cảnh báo & Phân tích ── */}
                <p className="text-xs font-semibold uppercase tracking-wide pb-1 pt-2"
                   style={{ color: 'var(--text-tertiary)' }}>{t('settings.notif.groups.alerts')}</p>
                <NotifToggle label={t('settings.notif.items.emailNotify')}
                  desc={t('settings.notif.items.emailNotifyDesc')}
                  value={notif.emailNotify} onChange={v => setNotif(n => ({ ...n, emailNotify: v }))} />
                {isManager && (
                  <NotifToggle label={t('settings.notif.items.anomalyAlert')}
                    desc={t('settings.notif.items.anomalyAlertDesc')}
                    value={notif.anomalyAlert} onChange={v => setNotif(n => ({ ...n, anomalyAlert: v }))} />
                )}
                {isWarehouse && (
                  <NotifToggle label={t('settings.notif.items.lowStockAlert')}
                    desc={t('settings.notif.items.lowStockAlertDesc')}
                    value={notif.lowStockAlert} onChange={v => setNotif(n => ({ ...n, lowStockAlert: v }))} />
                )}
                {isManager && (
                  <NotifToggle label={t('settings.notif.items.aiRecommendAlert')}
                    desc={t('settings.notif.items.aiRecommendAlertDesc')}
                    value={notif.aiRecommendAlert} onChange={v => setNotif(n => ({ ...n, aiRecommendAlert: v }))} />
                )}
                {isStaff && (
                  <NotifToggle label={t('settings.notif.items.newOrderNotify')}
                    desc={t('settings.notif.items.newOrderNotifyDesc')}
                    value={notif.newOrderNotify} onChange={v => setNotif(n => ({ ...n, newOrderNotify: v }))} />
                )}
                {isDataIT && (
                  <NotifToggle label={t('settings.notif.items.syncErrorNotify')}
                    desc={t('settings.notif.items.syncErrorNotifyDesc')}
                    value={notif.syncErrorNotify} onChange={v => setNotif(n => ({ ...n, syncErrorNotify: v }))} />
                )}
                {isOwner && (
                  <NotifToggle label={t('settings.notif.items.subscriptionNotify')}
                    desc={t('settings.notif.items.subscriptionNotifyDesc')}
                    value={notif.subscriptionNotify} onChange={v => setNotif(n => ({ ...n, subscriptionNotify: v }))} />
                )}

                {/* ── Báo cáo định kỳ ── */}
                {isManager && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide py-1 pt-4"
                       style={{ color: 'var(--text-tertiary)' }}>{t('settings.notif.groups.reports')}</p>
                    <NotifToggle label={t('settings.notif.items.dailyReport')}
                      desc={t('settings.notif.items.dailyReportDesc')}
                      value={notif.dailyReport} onChange={v => setNotif(n => ({ ...n, dailyReport: v }))} />
                    <NotifToggle label={t('settings.notif.items.weeklyReport')}
                      desc={t('settings.notif.items.weeklyReportDesc')}
                      value={notif.weeklyReport} onChange={v => setNotif(n => ({ ...n, weeklyReport: v }))} />
                  </>
                )}

                {/* ── Mobile ── */}
                <p className="text-xs font-semibold uppercase tracking-wide py-1 pt-4"
                   style={{ color: 'var(--text-tertiary)' }}>{t('settings.notif.groups.mobile')}</p>
                <NotifToggle label={t('settings.notif.items.pushNotify')}
                  desc={t('settings.notif.items.pushNotifyDesc')}
                  value={notif.pushNotify} onChange={v => setNotif(n => ({ ...n, pushNotify: v }))} />

                <div className="pt-4">
                  <button onClick={saveNotif} className="lbtn lbtn-primary" style={{ height: 40 }}>
                    <span className="icon icon-sm">save</span>
                    {t('settings.notif.saveBtn')}
                  </button>
                </div>
              </div>
            )
          })()}

          {/* ── APPEARANCE ── */}
          {section === 'appearance' && (
            <div className="space-y-4">
              {/* Theme */}
              <div className="lcard p-5 space-y-3">
                <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.theme.title')}</h2>
                {[
                  { dark: false, label: t('settings.theme.light'), icon: 'light_mode', sub: t('settings.theme.lightDesc') },
                  { dark: true,  label: t('settings.theme.dark'),   icon: 'dark_mode',  sub: t('settings.theme.darkDesc') },
                ].map(opt => {
                  const active = isDark === opt.dark
                  return (
                    <button key={String(opt.dark)} onClick={() => { if (!active) toggle() }}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left"
                      style={{ borderColor: active ? 'var(--primary-500)' : 'var(--border)', background: active ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'var(--bg-elevated)' }}>
                      <span className="icon w-10 h-10 flex items-center justify-center rounded-xl"
                        style={{ fontSize: 22, background: 'var(--bg-surface)', color: active ? 'var(--primary-500)' : 'var(--text-secondary)' }}>
                        {opt.icon}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                        <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{opt.sub}</div>
                      </div>
                      {active && <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>check_circle</span>}
                    </button>
                  )
                })}
              </div>

              {/* Language */}
              <div className="lcard p-5 space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('settings.theme.language')}</h3>
                {[
                  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', sub: 'Vietnamese' },
                  { code: 'en', label: 'English',    flag: '🇺🇸', sub: i18n.language?.startsWith('vi') ? 'Tiếng Anh' : 'English' },
                ].map(lang => {
                  const active = i18n.language?.startsWith(lang.code)
                  return (
                    <button key={lang.code} onClick={() => {
                      i18n.changeLanguage(lang.code)
                      localStorage.setItem('lang', lang.code)
                    }}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left"
                      style={{ borderColor: active ? 'var(--primary-500)' : 'var(--border)', background: active ? 'var(--primary-50, rgba(99,102,241,0.06))' : 'var(--bg-elevated)' }}>
                      <span style={{ fontSize: 28 }}>{lang.flag}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{lang.label}</div>
                        <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>{lang.sub}</div>
                      </div>
                      {active && <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>check_circle</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── SUBSCRIPTION (Owner only) ── */}
          {section === 'subscription' && (
            <div className="lcard p-5">
              <SubscriptionPage />
            </div>
          )}

          {/* ── ĐIỀU KHOẢN & CHÍNH SÁCH ── */}
          {section === 'policy' && <PolicySection />}
        </div>
      </div>
    </div>
    </>
  )
}



// ── Accordion item ──────────────────────────────────────────────────────────
function AccordionItem({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-left"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="icon" style={{ fontSize: 20, color: 'var(--text-tertiary)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
      </button>
      {open && (
        <div className="pb-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Điều khoản & Chính sách ─────────────────────────────────────────────────
function PolicySection() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="lcard p-5">
        <div className="flex items-start gap-3">
          <span className="icon text-2xl mt-0.5" style={{ color: 'var(--primary-500)' }}>gavel</span>
          <div>
            <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('settings.policyDetail.title')}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {t('settings.policyDetail.lastUpdated')}
            </p>
          </div>
        </div>
      </div>

      {/* Điều khoản dịch vụ */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('settings.policyDetail.terms.title')}
        </h3>
        <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p>{t('settings.policyDetail.terms.intro')}</p>
          <p><b>{t('settings.policyDetail.terms.scopeTitle')}</b> {t('settings.policyDetail.terms.scopeContent')}</p>
          <p><b>{t('settings.policyDetail.terms.securityTitle')}</b> {t('settings.policyDetail.terms.securityContent')}</p>
          <p><b>{t('settings.policyDetail.terms.usageTitle')}</b> {t('settings.policyDetail.terms.usageContent')}</p>
          <p><b>{t('settings.policyDetail.terms.ownershipTitle')}</b> {t('settings.policyDetail.terms.ownershipContent')}</p>
          <p><b>{t('settings.policyDetail.terms.changeTitle')}</b> {t('settings.policyDetail.terms.changeContent')}</p>
          <p><b>{t('settings.policyDetail.terms.terminationTitle')}</b> {t('settings.policyDetail.terms.terminationContent')}</p>
        </div>
      </div>

      {/* Chính sách bảo mật */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('settings.policyDetail.privacy.title')}
        </h3>
        <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p><b>{t('settings.policyDetail.privacy.collectTitle')}</b> {t('settings.policyDetail.privacy.collectContent')}</p>
          <p><b>{t('settings.policyDetail.privacy.storageTitle')}</b> {t('settings.policyDetail.privacy.storageContent')}</p>
          <p><b>{t('settings.policyDetail.privacy.accessTitle')}</b> {t('settings.policyDetail.privacy.accessContent')}</p>
          <p><b>{t('settings.policyDetail.privacy.nosellTitle')}</b> {t('settings.policyDetail.privacy.nosellContent')}</p>
          <p><b>{t('settings.policyDetail.privacy.rightsTitle')}</b> {t('settings.policyDetail.privacy.rightsContent')}</p>
          <p><b>{t('settings.policyDetail.privacy.lawTitle')}</b> {t('settings.policyDetail.privacy.lawContent')}</p>
        </div>
      </div>

      {/* Chính sách hoàn tiền */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('settings.policyDetail.refund.title')}
        </h3>
        <div className="space-y-3">
          {[
            {
              plan: t('settings.policyDetail.refund.freeTitle'),
              icon: 'card_membership',
              color: '#6B7280',
              content: t('settings.policyDetail.refund.freeDesc'),
            },
            {
              plan: t('settings.policyDetail.refund.proTitle'),
              icon: 'workspace_premium',
              color: 'var(--primary-500)',
              content: t('settings.policyDetail.refund.proDesc'),
            },
          ].map(item => (
            <div key={item.plan} className="flex gap-3 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
              <span className="icon w-9 h-9 flex items-center justify-center rounded-lg shrink-0"
                style={{ fontSize: 20, background: `${item.color}18`, color: item.color }}>
                {item.icon}
              </span>
              <div>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{item.plan}</div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.content}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
          {t('settings.policyDetail.refund.requestText')}
        </p>
      </div>

      {/* Liên hệ */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          {t('settings.policyDetail.contact.title')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: 'email',    label: t('settings.policyDetail.contact.techLabel'), value: 'support@msas.vn',  href: 'mailto:support@msas.vn' },
            { icon: 'schedule', label: t('settings.policyDetail.contact.hoursLabel'), value: t('settings.policyDetail.contact.hoursValue'), href: null },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
              <span className="icon text-lg" style={{ color: 'var(--primary-500)' }}>{c.icon}</span>
              <div>
                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.label}</div>
                {c.href
                  ? <a href={c.href} className="text-sm font-medium" style={{ color: 'var(--primary-500)' }}>{c.value}</a>
                  : <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{c.value}</div>
                }
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
