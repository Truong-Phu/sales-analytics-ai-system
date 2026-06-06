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
          Bạn đang dùng mật khẩu mặc định
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>
          Mật khẩu mặc định <b>12345678</b> không an toàn. Hãy đổi ngay để bảo vệ tài khoản.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link to="/change-password"
              className="lbtn lbtn-primary !h-8 !px-3 text-xs">
          Đổi ngay
        </Link>
        <button
          onClick={() => { localStorage.setItem(PWD_WARNING_KEY, 'true'); setDismissed(true) }}
          className="w-7 h-7 flex items-center justify-center rounded-lg"
          style={{ color: '#B45309' }}
          title="Bỏ qua">
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
    if (file.size > 2 * 1024 * 1024) { setUploadErr('Ảnh tối đa 2MB'); return }
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) { setUploadErr('Chỉ chấp nhận PNG/JPG/WEBP'); return }

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
      setUploadErr(err.response?.data?.message ?? 'Upload thất bại')
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
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>PNG · JPG · WEBP · Tối đa 2MB</p>
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
    // Owner/Manager thấy tab Loyalty & Voucher
    ...(['Owner','Manager'].includes(user?.role)
      ? [{ key: 'loyalty', icon: 'loyalty', label: 'Loyalty & Voucher' }]
      : []),
    { key: 'policy',        icon: 'gavel',            label: 'Điều khoản & Chính sách' },
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
      flash()
    } catch (err) {
      flash(err.response?.data?.message ?? 'Không thể lưu thông tin. Vui lòng thử lại.')
    }
  }

  const saveNotif = async () => {
    try {
      await axios.put('/api/users/notification-preferences', notif)
      flash()
    } catch (err) {
      flash(err.response?.data?.message ?? 'Lỗi lưu tùy chọn thông báo')
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
      flash(err.response?.data?.message ?? 'Lỗi đăng xuất')
    }
  }

  return (
    <>
    <ConfirmDialog
      open={logoutConfirmDlg}
      title="Đăng xuất tất cả thiết bị"
      message="Bạn sẽ cần đăng nhập lại trên tất cả thiết bị."
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
              <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>Thông tin tài khoản</h2>

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
                  { label: 'Họ và tên',  key: 'fullName',  type: 'text',     placeholder: 'Nguyễn Văn A' },
                  { label: 'Email',      key: 'email',     type: 'email',    placeholder: 'user@example.com', disabled: true },
                  { label: 'Số điện thoại', key: 'phone', type: 'tel',      placeholder: '09xxxxxxxx' },
                  { label: 'Ngày sinh',  key: 'birthdate', type: 'date',     placeholder: '' },
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
                  <label className="block text-caption font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Múi giờ</label>
                  <select value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))} className="linput text-sm">
                    <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                    <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="UTC">UTC (GMT+0)</option>
                  </select>
                </div>

                {/* Language preference */}
                <div>
                  <label className="block text-caption font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Ngôn ngữ mặc định</label>
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
                  <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Vai trò hệ thống</div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t(`admin.roles.${user?.role}`, user?.role)}
                  </div>
                </div>
              </div>

              <button onClick={saveProfile} className="lbtn lbtn-primary" style={{ height: 40 }}>
                <span className="icon icon-sm">save</span>
                Lưu thông tin
              </button>
            </div>
          )}

          {/* ── SECURITY ── */}
          {section === 'security' && (
            <div className="space-y-4">
              {/* Cảnh báo mật khẩu mặc định */}
              <PasswordWarningBanner />

              <div className="lcard p-5 space-y-3">
                <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>Bảo mật</h2>
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
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Đổi mật khẩu</div>
                      <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Thay đổi mật khẩu đăng nhập</div>
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
                      <div className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>Đăng xuất tất cả thiết bị</div>
                      <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>Kết thúc tất cả phiên đăng nhập đang hoạt động</div>
                    </div>
                  </div>
                  <span className="icon" style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>chevron_right</span>
                </button>
              </div>

              {/* Login history */}
              <div className="lcard p-5">
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Lịch sử đăng nhập gần đây</h3>
                {histLoading ? (
                  <div className="flex justify-center py-6">
                    <span className="w-5 h-5 border-2 rounded-full"
                          style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : loginHistory.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>Chưa có lịch sử đăng nhập</p>
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
                            {log.userAgent ?? 'Thiết bị không rõ'}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            IP: {log.ip ?? '—'} · {log.time ? new Date(log.time).toLocaleString('vi-VN') : '—'}
                          </div>
                        </div>
                        <span className="text-xs font-medium shrink-0"
                              style={{ color: log.status === 'SUCCESS' ? 'var(--accent-500)' : '#EF4444' }}>
                          {log.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}
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
                <h2 className="text-subtitle font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Tùy chọn thông báo</h2>
                <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                  Tùy chọn được lưu cho tài khoản của bạn. Email chỉ được gửi khi "Nhận thông báo qua email" được bật.
                </p>

                {/* ── Cảnh báo & Phân tích ── */}
                <p className="text-xs font-semibold uppercase tracking-wide pb-1 pt-2"
                   style={{ color: 'var(--text-tertiary)' }}>Cảnh báo &amp; Phân tích</p>
                <NotifToggle label="Nhận thông báo qua email"
                  desc="Bật/tắt toàn bộ email thông báo từ hệ thống"
                  value={notif.emailNotify} onChange={v => setNotif(n => ({ ...n, emailNotify: v }))} />
                {isManager && (
                  <NotifToggle label="Phát hiện doanh thu bất thường"
                    desc="Thông báo khi AI phát hiện ngày có doanh thu tăng/giảm đột biến so với xu hướng thường ngày"
                    value={notif.anomalyAlert} onChange={v => setNotif(n => ({ ...n, anomalyAlert: v }))} />
                )}
                {isWarehouse && (
                  <NotifToggle label="Cảnh báo sắp hết hàng"
                    desc="Thông báo khi sản phẩm tồn kho dưới ngưỡng an toàn (dưới 10 đơn vị)"
                    value={notif.lowStockAlert} onChange={v => setNotif(n => ({ ...n, lowStockAlert: v }))} />
                )}
                {isManager && (
                  <NotifToggle label="Gợi ý AI &amp; Khuyến nghị kinh doanh"
                    desc="Thông báo khi AI tạo gợi ý mới về chiến lược bán hàng, tồn kho hoặc khách hàng"
                    value={notif.aiRecommendAlert} onChange={v => setNotif(n => ({ ...n, aiRecommendAlert: v }))} />
                )}
                {isStaff && (
                  <NotifToggle label="Đơn hàng mới"
                    desc="Thông báo khi có đơn hàng mới được tạo hoặc đơn đang chờ xử lý quá lâu"
                    value={notif.newOrderNotify} onChange={v => setNotif(n => ({ ...n, newOrderNotify: v }))} />
                )}
                {isDataIT && (
                  <NotifToggle label="Lỗi đồng bộ dữ liệu"
                    desc="Thông báo khi pipeline ETL gặp lỗi hoặc kênh đồng bộ bị gián đoạn"
                    value={notif.syncErrorNotify} onChange={v => setNotif(n => ({ ...n, syncErrorNotify: v }))} />
                )}
                {isOwner && (
                  <NotifToggle label="Gói dịch vụ &amp; Thanh toán"
                    desc="Nhắc nhở sắp hết hạn gói Pro, xác nhận thanh toán và hóa đơn"
                    value={notif.subscriptionNotify} onChange={v => setNotif(n => ({ ...n, subscriptionNotify: v }))} />
                )}

                {/* ── Báo cáo định kỳ ── */}
                {isManager && (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide py-1 pt-4"
                       style={{ color: 'var(--text-tertiary)' }}>Báo cáo định kỳ qua email</p>
                    <NotifToggle label="Tóm tắt doanh thu hàng ngày"
                      desc="Nhận email tóm tắt doanh thu, số đơn và so sánh hôm qua mỗi sáng 8:00"
                      value={notif.dailyReport} onChange={v => setNotif(n => ({ ...n, dailyReport: v }))} />
                    <NotifToggle label="Báo cáo tổng hợp hàng tuần"
                      desc="Nhận báo cáo phân tích tuần vào mỗi sáng thứ Hai (kênh, sản phẩm, khách hàng)"
                      value={notif.weeklyReport} onChange={v => setNotif(n => ({ ...n, weeklyReport: v }))} />
                  </>
                )}

                {/* ── Mobile ── */}
                <p className="text-xs font-semibold uppercase tracking-wide py-1 pt-4"
                   style={{ color: 'var(--text-tertiary)' }}>Ứng dụng di động</p>
                <NotifToggle label="Thông báo đẩy trên điện thoại"
                  desc="Nhận thông báo đẩy khi dùng app MSAS trên điện thoại (cần đăng nhập app mobile)"
                  value={notif.pushNotify} onChange={v => setNotif(n => ({ ...n, pushNotify: v }))} />

                <div className="pt-4">
                  <button onClick={saveNotif} className="lbtn lbtn-primary" style={{ height: 40 }}>
                    <span className="icon icon-sm">save</span>
                    Lưu tùy chọn
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
                <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>Giao diện</h2>
                {[
                  { dark: false, label: 'Sáng (Light)', icon: 'light_mode', sub: 'Nền trắng, thích hợp ban ngày' },
                  { dark: true,  label: 'Tối (Dark)',   icon: 'dark_mode',  sub: 'Nền tối, thích hợp ban đêm' },
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
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ngôn ngữ hiển thị</h3>
                {[
                  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳', sub: 'Vietnamese' },
                  { code: 'en', label: 'English',    flag: '🇺🇸', sub: 'Tiếng Anh' },
                ].map(lang => {
                  const active = i18n.language?.startsWith(lang.code)
                  return (
                    <button key={lang.code} onClick={() => i18n.changeLanguage(lang.code)}
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

          {/* ── LOYALTY & VOUCHER ── */}
          {section === 'loyalty' && <LoyaltySection />}

          {/* ── ĐIỀU KHOẢN & CHÍNH SÁCH ── */}
          {section === 'policy' && <PolicySection />}
        </div>
      </div>
    </div>
    </>
  )
}

// ── Loyalty & Voucher settings ──────────────────────────────────────────────
function LoyaltySection() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [err,     setErr]     = useState('')

  // Voucher list
  const [vouchers, setVouchers]   = useState([])
  const [vLoad,    setVLoad]      = useState(false)
  const [vErr,     setVErr]       = useState('')   // lỗi riêng cho voucher
  const [voucherConfirmDlg, setVoucherConfirmDlg] = useState(null)
  const [showNew,  setShowNew]    = useState(false)
  const [newV, setNewV] = useState({ code:'', type:'PERCENT', value:'', minOrder:'', maxDiscount:'', usageLimit:'', validFrom:'', validTo:'' })
  const [editV,    setEditV]      = useState(null)   // voucher đang sửa (null = không mở)

  useEffect(() => {
    axios.get('/api/pos/loyalty/config')
      .then(r => setConfig(r.data))
      .catch(() => setConfig({ pointsPerVnd: 1000, vndPerPoint: 1000, minRedeemPoints: 100, pointExpiryDays: 365, isActive: true }))
      .finally(() => setLoading(false))
    loadVouchers()
  }, [])

  const loadVouchers = () => {
    setVLoad(true)
    axios.get('/api/pos/vouchers').then(r => setVouchers(r.data ?? [])).catch(() => setVouchers([])).finally(() => setVLoad(false))
  }

  const saveConfig = async () => {
    setSaving(true); setMsg(''); setErr('')
    try {
      await axios.put('/api/pos/loyalty/config', config)
      setMsg('Đã lưu cấu hình tích điểm')
    } catch { setErr('Lỗi lưu cấu hình') }
    finally { setSaving(false) }
  }

  const createVoucher = async () => {
    setVErr('')
    try {
      await axios.post('/api/pos/vouchers', { ...newV, value: Number(newV.value), minOrderValue: Number(newV.minOrder || 0), maxDiscount: newV.maxDiscount ? Number(newV.maxDiscount) : null, usageLimit: newV.usageLimit ? Number(newV.usageLimit) : null })
      setShowNew(false)
      setNewV({ code:'', type:'PERCENT', value:'', minOrder:'', maxDiscount:'', usageLimit:'', validFrom:'', validTo:'' })
      loadVouchers()
    } catch (e) { setVErr(e?.response?.data?.message ?? 'Lỗi tạo voucher') }
  }

  const openEdit = (v) => {
    setVErr('')
    const toLocal = iso => iso ? iso.slice(0, 16) : ''
    setEditV({ id: v.id, code: v.code, type: v.type, value: String(v.value), minOrder: String(v.minOrderValue ?? 0), maxDiscount: v.maxDiscount ? String(v.maxDiscount) : '', usageLimit: v.usageLimit ? String(v.usageLimit) : '', validFrom: toLocal(v.validFrom), validTo: toLocal(v.validTo), isActive: v.isActive })
  }

  const saveEdit = async () => {
    setVErr('')
    try {
      await axios.put(`/api/pos/vouchers/${editV.id}`, { ...editV, value: Number(editV.value), minOrderValue: Number(editV.minOrder || 0), maxDiscount: editV.maxDiscount ? Number(editV.maxDiscount) : null, usageLimit: editV.usageLimit ? Number(editV.usageLimit) : null })
      setEditV(null)
      loadVouchers()
    } catch (e) { setVErr(e?.response?.data?.message ?? 'Lỗi cập nhật voucher') }
  }

  const deleteVoucher = (id, code) => {
    setVoucherConfirmDlg({ id, code })
  }

  const doDeleteVoucher = async (id) => {
    setVErr('')
    try {
      await axios.delete(`/api/pos/vouchers/${id}`)
      loadVouchers()
    } catch (e) { setVErr(e?.response?.data?.message ?? 'Lỗi xóa voucher') }
  }

  if (loading) return <div className="lcard p-10 flex justify-center"><span className="icon animate-spin text-2xl" style={{ color: 'var(--primary-500)' }}>refresh</span></div>

  const field = (label, key, type = 'number') => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input type={type} value={config[key] ?? ''} onChange={e => setConfig(c => ({ ...c, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
             className="linput !h-9 text-sm" />
    </div>
  )

  return (
    <>
    <ConfirmDialog
      open={!!voucherConfirmDlg}
      title="Xóa voucher"
      message={voucherConfirmDlg ? `Xóa voucher "${voucherConfirmDlg.code}"?` : ''}
      icon="delete_forever"
      danger
      onClose={() => setVoucherConfirmDlg(null)}
      onConfirm={() => { const id = voucherConfirmDlg?.id; setVoucherConfirmDlg(null); doDeleteVoucher(id) }}
    />
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
        {vErr && <p className="text-xs px-1" style={{ color: '#EF4444' }}>{vErr}</p>}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Danh sách Voucher</h3>
          <button onClick={() => { setShowNew(v => !v); setVErr('') }} className="lbtn lbtn-primary !h-8 !px-4 text-xs gap-1">
            <span className="icon" style={{ fontSize: 14 }}>add</span> Tạo voucher
          </button>
        </div>

        {showNew && (
          <div className="lcard p-4 space-y-3" style={{ background: 'var(--bg-elevated)' }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Mã voucher</label>
                <input value={newV.code} onChange={e => setNewV(v => ({...v, code: e.target.value.toUpperCase()}))} className="linput !h-8 text-sm" placeholder="VD: SALE10" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Loại</label>
                <select value={newV.type} onChange={e => setNewV(v => ({...v, type: e.target.value}))} className="linput !h-8 text-xs">
                  <option value="PERCENT">Giảm %</option>
                  <option value="FIXED">Giảm số tiền cố định</option>
                  <option value="FREESHIP">Miễn phí vận chuyển</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Giá trị</label>
                <input type="number" value={newV.value} onChange={e => setNewV(v => ({...v, value: e.target.value}))} className="linput !h-8 text-sm" placeholder={newV.type === 'PERCENT' ? '10 = 10%' : 'VND'} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Đơn hàng tối thiểu (VND)</label>
                <input type="number" value={newV.minOrder} onChange={e => setNewV(v => ({...v, minOrder: e.target.value}))} className="linput !h-8 text-sm" placeholder="0 = không giới hạn" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Hiệu lực từ</label>
                <input type="datetime-local" value={newV.validFrom} onChange={e => setNewV(v => ({...v, validFrom: e.target.value}))} className="linput !h-8 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Hiệu lực đến</label>
                <input type="datetime-local" value={newV.validTo} onChange={e => setNewV(v => ({...v, validTo: e.target.value}))} className="linput !h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="lbtn lbtn-secondary flex-1 !h-8 text-xs">Hủy</button>
              <button onClick={createVoucher} className="lbtn lbtn-primary flex-1 !h-8 text-xs">Tạo voucher</button>
            </div>
          </div>
        )}

        {/* Edit modal */}
        {editV && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={e => { if (e.target === e.currentTarget) setEditV(null) }}>
            <div className="lcard p-5 w-full max-w-md space-y-3" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Sửa voucher – {editV.code}</h3>
                <button onClick={() => setEditV(null)} className="text-xl leading-none" style={{ color: 'var(--text-tertiary)' }}>×</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Mã voucher</label>
                  <input value={editV.code} onChange={e => setEditV(v => ({...v, code: e.target.value.toUpperCase()}))} className="linput !h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Loại</label>
                  <select value={editV.type} onChange={e => setEditV(v => ({...v, type: e.target.value}))} className="linput !h-8 text-xs">
                    <option value="PERCENT">Giảm %</option>
                    <option value="FIXED">Giảm số tiền cố định</option>
                    <option value="FREESHIP">Miễn phí vận chuyển</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Giá trị</label>
                  <input type="number" value={editV.value} onChange={e => setEditV(v => ({...v, value: e.target.value}))} className="linput !h-8 text-sm" placeholder={editV.type === 'PERCENT' ? '10 = 10%' : 'VND'} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Đơn hàng tối thiểu (VND)</label>
                  <input type="number" value={editV.minOrder} onChange={e => setEditV(v => ({...v, minOrder: e.target.value}))} className="linput !h-8 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Số lần dùng tối đa</label>
                  <input type="number" value={editV.usageLimit} onChange={e => setEditV(v => ({...v, usageLimit: e.target.value}))} className="linput !h-8 text-sm" placeholder="Để trống = không giới hạn" />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editV.isActive} onChange={e => setEditV(v => ({...v, isActive: e.target.checked}))} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Kích hoạt voucher</span>
                  </label>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Hiệu lực từ</label>
                  <input type="datetime-local" value={editV.validFrom} onChange={e => setEditV(v => ({...v, validFrom: e.target.value}))} className="linput !h-8 text-xs" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Hiệu lực đến</label>
                  <input type="datetime-local" value={editV.validTo} onChange={e => setEditV(v => ({...v, validTo: e.target.value}))} className="linput !h-8 text-xs" />
                </div>
              </div>
              {vErr && <p className="text-xs" style={{ color: '#EF4444' }}>{vErr}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditV(null)} className="lbtn lbtn-secondary flex-1 !h-8 text-xs">Hủy</button>
                <button onClick={saveEdit} className="lbtn lbtn-primary flex-1 !h-8 text-xs">Lưu thay đổi</button>
              </div>
            </div>
          </div>
        )}

        {vLoad ? (
          <div className="py-6 flex justify-center"><span className="icon animate-spin" style={{ color: 'var(--primary-500)' }}>refresh</span></div>
        ) : vouchers.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>Chưa có voucher nào</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Mã', 'Loại', 'Giá trị', 'Đơn tối thiểu', 'Số lần dùng', 'Hiệu lực', 'Trạng thái', 'Thao tác'].map(h => (
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
                    <td className="px-3 py-2">{v.type === 'PERCENT' ? `Giảm ${v.value}%` : v.type === 'FIXED' ? `Giảm ${new Intl.NumberFormat('vi-VN').format(v.value)}đ` : 'Freeship'}</td>
                    <td className="px-3 py-2 font-mono">{new Intl.NumberFormat('vi-VN').format(v.value)}</td>
                    <td className="px-3 py-2 font-mono">{new Intl.NumberFormat('vi-VN').format(v.minOrderValue ?? 0)}</td>
                    <td className="px-3 py-2 text-center">{v.usedCount ?? 0}{v.usageLimit ? ` / ${v.usageLimit}` : ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {new Date(v.validFrom).toLocaleDateString('vi-VN')} → {new Date(v.validTo).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: v.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)', color: v.isActive ? '#10B981' : '#EF4444' }}>
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
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="lcard p-5">
        <div className="flex items-start gap-3">
          <span className="icon text-2xl mt-0.5" style={{ color: 'var(--primary-500)' }}>gavel</span>
          <div>
            <h2 className="text-subtitle font-semibold" style={{ color: 'var(--text-primary)' }}>
              Điều khoản &amp; Chính sách MSAS
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Cập nhật lần cuối: 01/06/2026 · Áp dụng cho tất cả người dùng hệ thống MSAS
            </p>
          </div>
        </div>
      </div>

      {/* Điều khoản dịch vụ */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          1. Điều khoản sử dụng dịch vụ
        </h3>
        <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p>Bằng cách đăng ký và sử dụng MSAS, bạn xác nhận đã đọc, hiểu và đồng ý với các điều khoản dưới đây.</p>
          <p><b>Phạm vi dịch vụ:</b> MSAS cung cấp nền tảng phân tích dữ liệu bán hàng đa kênh tích hợp AI, bao gồm thu thập dữ liệu, phân tích BI, dự báo doanh thu và xuất báo cáo. Dịch vụ vận hành theo mô hình SaaS với hai gói: Free và Pro.</p>
          <p><b>Tài khoản và bảo mật:</b> Mỗi tài khoản chỉ được sử dụng bởi một cá nhân. Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và toàn bộ hoạt động phát sinh từ tài khoản của mình. Thông báo ngay cho chúng tôi nếu phát hiện truy cập trái phép.</p>
          <p><b>Sử dụng hợp lệ:</b> Nghiêm cấm sử dụng MSAS cho mục đích bất hợp pháp, cố ý làm suy giảm hiệu năng hệ thống, hoặc truy cập dữ liệu của công ty khác ngoài phạm vi được cấp quyền.</p>
          <p><b>Quyền sở hữu dữ liệu:</b> Toàn bộ dữ liệu kinh doanh bạn nhập vào hoặc đồng bộ qua MSAS thuộc sở hữu của bạn. MSAS chỉ xử lý dữ liệu đó nhằm cung cấp dịch vụ đã thỏa thuận.</p>
          <p><b>Thay đổi điều khoản:</b> Khi có cập nhật quan trọng, chúng tôi thông báo qua email trước ít nhất 14 ngày. Tiếp tục sử dụng sau thời điểm đó đồng nghĩa với việc chấp nhận điều khoản mới.</p>
          <p><b>Chấm dứt dịch vụ:</b> Tài khoản vi phạm điều khoản có thể bị tạm ngừng. Sau khi chấm dứt, dữ liệu được lưu thêm 30 ngày để bạn có thể xuất ra trước khi xóa vĩnh viễn.</p>
        </div>
      </div>

      {/* Chính sách bảo mật */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          2. Chính sách bảo mật &amp; quyền riêng tư
        </h3>
        <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p><b>Dữ liệu thu thập:</b> Thông tin tài khoản (họ tên, email, số điện thoại), dữ liệu kinh doanh bạn nhập vào hoặc đồng bộ từ các kênh bán hàng, và nhật ký hoạt động phục vụ bảo mật và hỗ trợ kỹ thuật.</p>
          <p><b>Lưu trữ và bảo mật:</b> Dữ liệu lưu trên máy chủ tại Việt Nam. Dữ liệu khi lưu trữ được mã hóa bằng AES-256; khi truyền tải sử dụng giao thức bảo mật HTTPS/TLS. Mật khẩu được băm một chiều, không ai có thể xem lại.</p>
          <p><b>Kiểm soát truy cập:</b> Hệ thống áp dụng phân quyền theo vai trò (Owner, Manager, Nhân viên, DataIT, Viewer) — mỗi người chỉ thấy dữ liệu phù hợp với vai trò. Chủ doanh nghiệp (Owner) có thể xem toàn bộ nhật ký hoạt động trong công ty.</p>
          <p><b>Cam kết không bán dữ liệu:</b> MSAS không bán, cho thuê hoặc chia sẻ dữ liệu cá nhân và kinh doanh của bạn với bên thứ ba vì mục đích thương mại dưới bất kỳ hình thức nào.</p>
          <p><b>Quyền của bạn:</b> Bạn có quyền yêu cầu xuất toàn bộ dữ liệu của mình, chỉnh sửa thông tin cá nhân trong phần Hồ sơ, hoặc yêu cầu xóa tài khoản (dữ liệu bị xóa vĩnh viễn sau 30 ngày kể từ ngày xác nhận).</p>
          <p><b>Tuân thủ pháp luật:</b> MSAS tuân thủ Luật An ninh mạng 2018 (24/2018/QH14), Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân, và Luật Giao dịch điện tử 2023 (20/2023/QH15).</p>
        </div>
      </div>

      {/* Chính sách hoàn tiền */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          3. Chính sách hoàn tiền
        </h3>
        <div className="space-y-3">
          {[
            {
              plan: 'Gói Miễn phí (Free)',
              icon: 'card_membership',
              color: '#6B7280',
              content: 'Gói miễn phí không áp dụng chính sách hoàn tiền vì không thu phí.',
            },
            {
              plan: 'Gói Pro — 490.000đ/tháng hoặc 4.704.000đ/năm',
              icon: 'workspace_premium',
              color: 'var(--primary-500)',
              content: 'Hỗ trợ hoàn tiền trong vòng 7 ngày kể từ ngày thanh toán nếu sự cố phát sinh từ phía MSAS (dịch vụ gián đoạn liên tục trên 24 giờ, mất dữ liệu do lỗi hệ thống...). Không hoàn tiền khi người dùng chủ động không sử dụng hoặc hủy gói.',
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
          Yêu cầu hoàn tiền: gửi email đến{' '}
          <a href="mailto:support@msas.vn" style={{ color: 'var(--primary-500)' }}>support@msas.vn</a>
          {' '}với tiêu đề <b>"YÊU CẦU HOÀN TIỀN – [Tên công ty]"</b> kèm mô tả sự cố.
        </p>
      </div>

      {/* Liên hệ */}
      <div className="lcard p-5">
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          4. Liên hệ &amp; hỗ trợ
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { icon: 'email',    label: 'Hỗ trợ kỹ thuật', value: 'support@msas.vn',  href: 'mailto:support@msas.vn' },
            { icon: 'schedule', label: 'Giờ làm việc',     value: 'Thứ 2–6, 8:00–17:00 (GMT+7)', href: null },
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
