import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { Link, useSearchParams } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import axios from '../../api/axios'
import SubscriptionPage from './SubscriptionPage'

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
    { key: 'guide',         icon: 'menu_book',        label: 'Hướng dẫn sử dụng' },
    { key: 'policy',        icon: 'gavel',            label: 'Điều khoản & Chính sách' },
  ]

  const [searchParams] = useSearchParams()
  const [section,    setSection]    = useState(() => searchParams.get('tab') ?? 'profile')
  const [saved,      setSaved]      = useState(false)
  const [error,      setError]      = useState('')
  const [avatarUrl,  setAvatarUrl]  = useState(user?.avatarUrl ?? null)
  const [loginHistory, setLoginHistory] = useState([])
  const [histLoading,  setHistLoading]  = useState(false)

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
    emailNotify:       true,
    anomalyAlert:      true,
    dailyReport:       false,
    weeklyReport:      true,
    syncErrorNotify:   true,
    subscriptionNotify: true,
    pushNotify:        false,
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

  const handleLogoutAll = async () => {
    if (!window.confirm('Đăng xuất tất cả thiết bị? Bạn sẽ cần đăng nhập lại.')) return
    try {
      await axios.post('/api/users/logout-all')
      logout()
    } catch (err) {
      flash(err.response?.data?.message ?? 'Lỗi đăng xuất')
    }
  }

  return (
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
          {section === 'notifications' && (
            <div className="lcard p-5 space-y-1">
              <h2 className="text-subtitle font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Tùy chọn thông báo</h2>
              <p className="text-xs font-semibold uppercase tracking-wide pb-1"
                 style={{ color: 'var(--text-tertiary)' }}>In-App & Email</p>
              <NotifToggle label="Nhận thông báo qua email"
                desc="Gửi email cho các cập nhật quan trọng"
                value={notif.emailNotify} onChange={v => setNotif(n => ({ ...n, emailNotify: v }))} />
              <NotifToggle label="Cảnh báo bất thường (Anomaly)"
                desc="Thông báo khi AI phát hiện dữ liệu bất thường"
                value={notif.anomalyAlert} onChange={v => setNotif(n => ({ ...n, anomalyAlert: v }))} />
              <NotifToggle label="Thông báo lỗi đồng bộ"
                desc="Nhận thông báo khi pipeline ETL gặp lỗi"
                value={notif.syncErrorNotify} onChange={v => setNotif(n => ({ ...n, syncErrorNotify: v }))} />
              <NotifToggle label="Thông báo đăng ký & Thanh toán"
                desc="Cập nhật về gói dịch vụ, gia hạn, hóa đơn"
                value={notif.subscriptionNotify} onChange={v => setNotif(n => ({ ...n, subscriptionNotify: v }))} />
              <p className="text-xs font-semibold uppercase tracking-wide py-1 pt-3"
                 style={{ color: 'var(--text-tertiary)' }}>Báo cáo định kỳ</p>
              <NotifToggle label="Báo cáo hàng ngày"
                desc="Nhận tóm tắt doanh thu mỗi ngày lúc 8:00"
                value={notif.dailyReport} onChange={v => setNotif(n => ({ ...n, dailyReport: v }))} />
              <NotifToggle label="Báo cáo hàng tuần"
                desc="Nhận báo cáo tổng hợp mỗi thứ Hai"
                value={notif.weeklyReport} onChange={v => setNotif(n => ({ ...n, weeklyReport: v }))} />
              <p className="text-xs font-semibold uppercase tracking-wide py-1 pt-3"
                 style={{ color: 'var(--text-tertiary)' }}>Push Notification (App mobile)</p>
              <NotifToggle label="Push notification trên mobile"
                desc="Nhận thông báo đẩy khi dùng ứng dụng mobile (cần đăng nhập app)"
                value={notif.pushNotify} onChange={v => setNotif(n => ({ ...n, pushNotify: v }))} />
              <div className="pt-3">
                <button onClick={saveNotif} className="lbtn lbtn-primary" style={{ height: 40 }}>
                  <span className="icon icon-sm">save</span>
                  Lưu tùy chọn
                </button>
              </div>
            </div>
          )}

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

          {/* ── HƯỚNG DẪN SỬ DỤNG ── */}
          {section === 'guide' && <GuideSection />}

          {/* ── ĐIỀU KHOẢN & CHÍNH SÁCH ── */}
          {section === 'policy' && <PolicySection />}
        </div>
      </div>
    </div>
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

  const deleteVoucher = async (id, code) => {
    if (!window.confirm(`Xóa voucher "${code}"? Hành động này không thể hoàn tác.`)) return
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

// ── Hướng dẫn sử dụng ──────────────────────────────────────────────────────
function GuideSection() {
  return (
    <div className="space-y-4">
      <div className="lcard p-5">
        <h2 className="text-subtitle font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Hướng dẫn sử dụng</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          MSAS (Multi-Source Analytics System) là hệ thống phân tích dữ liệu bán hàng đa kênh tích hợp AI,
          giúp doanh nghiệp SME hợp nhất dữ liệu từ nhiều nền tảng và ra quyết định dựa trên dữ liệu thay vì cảm tính.
        </p>

        <div className="space-y-0">
          <AccordionItem title="Tổng quan hệ thống (Dashboard)">
            <p>Trang Tổng quan hiển thị các chỉ số KPI quan trọng như doanh thu hôm nay, số đơn hàng, lợi nhuận gộp và tỷ lệ chuyển đổi.
            Bạn có thể lọc theo khoảng thời gian và xem biểu đồ xu hướng doanh thu theo kênh bán hàng.</p>
          </AccordionItem>
          <AccordionItem title="Module Bán hàng (Đơn hàng, Sản phẩm, Khách hàng)">
            <p>Quản lý toàn bộ dữ liệu kinh doanh: xem danh sách đơn hàng, thêm/sửa sản phẩm và danh mục, theo dõi thông tin khách hàng.
            Hỗ trợ tìm kiếm, lọc và phân trang nhanh chóng.</p>
          </AccordionItem>
          <AccordionItem title="Phân tích AI (Dự báo & Bất thường)">
            <p><b>Dự báo doanh thu:</b> Sử dụng mô hình Prophet được huấn luyện trên dữ liệu thực tế, dự báo doanh thu 30–90 ngày tới với confidence interval.</p>
            <p className="mt-2"><b>Phát hiện bất thường:</b> Tự động phát hiện các điểm dữ liệu bất thường (đột tăng/giảm doanh thu, đơn hàng trùng lặp...) và gửi cảnh báo.</p>
          </AccordionItem>
          <AccordionItem title="Gợi ý AI (Recommendations)">
            <p>Hệ thống phân tích xu hướng thị trường và đưa ra các gợi ý hành động cụ thể như: tăng tồn kho sản phẩm A, chạy khuyến mãi tháng X, tối ưu ngân sách quảng cáo kênh Y.</p>
          </AccordionItem>
          <AccordionItem title="Báo cáo & Xuất PDF">
            <p>Tạo báo cáo chuyên nghiệp với đầy đủ biểu đồ, KPI và nhận xét AI. Hỗ trợ lọc theo khoảng thời gian, kênh bán hàng và xuất PDF chất lượng cao.</p>
          </AccordionItem>
          <AccordionItem title="Đồng bộ dữ liệu (Data Sync & ETL Monitor)">
            <p>Quản lý kết nối với các nguồn dữ liệu (Shopee, Lazada, Facebook...). Theo dõi trạng thái pipeline ETL, xem log đồng bộ và xử lý lỗi khi cần.</p>
            <p className="mt-2"><i>Chức năng này chỉ dành cho vai trò DataIT và Admin.</i></p>
          </AccordionItem>
          <AccordionItem title="Kết nối kênh bán hàng">
            <p>Vào <b>Đồng bộ dữ liệu</b> → chọn nền tảng (Shopee, Lazada, TikTok Shop...) → nhập API Key hoặc xác thực OAuth → bật lịch đồng bộ tự động.
            Nếu chưa có API, có thể import file CSV/Excel để test và demo hệ thống.</p>
          </AccordionItem>
        </div>
      </div>

      <div className="lcard p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Câu hỏi thường gặp (FAQ)</h3>
        <div className="space-y-0">
          <AccordionItem title="Tôi có thể dùng hệ thống trên điện thoại không?">
            <p>Có. Tải app MSAS trên điện thoại (iOS/Android) để xem nhanh dashboard KPI, nhập đơn hàng và nhận thông báo. App mobile tối ưu cho thao tác nhanh.</p>
          </AccordionItem>
          <AccordionItem title="Dữ liệu của tôi có an toàn không?">
            <p>Dữ liệu được mã hóa AES-256 khi lưu trữ và TLS 1.3 khi truyền tải. Chỉ người trong công ty bạn (theo role được phân quyền) mới truy cập được dữ liệu của bạn.</p>
          </AccordionItem>
          <AccordionItem title="Làm thế nào để thêm nhân viên vào hệ thống?">
            <p>Tài khoản Admin vào <b>Quản trị hệ thống</b> → <b>Quản lý người dùng</b> → <b>Thêm người dùng</b>, nhập email và chọn vai trò phù hợp. Hệ thống sẽ gửi email mời.</p>
          </AccordionItem>
          <AccordionItem title="Tôi quên mật khẩu thì xử lý thế nào?">
            <p>Tại trang đăng nhập, chọn <b>Quên mật khẩu</b>, nhập email đã đăng ký. Hệ thống gửi link đặt lại mật khẩu vào email trong vòng 5 phút.</p>
          </AccordionItem>
          <AccordionItem title="Hệ thống hỗ trợ bao nhiêu kênh bán hàng?">
            <p>Hiện hỗ trợ: Shopee, Lazada, TikTok Shop (TMĐT); Facebook, Zalo OA (mạng xã hội); GHN, GHTK (vận chuyển); MoMo, VNPay, ZaloPay (thanh toán). Sẽ bổ sung thêm theo lộ trình phát triển.</p>
          </AccordionItem>
          <AccordionItem title="Nâng cấp hoặc hủy gói dịch vụ như thế nào?">
            <p>Vào <b>Cài đặt → Gói dịch vụ</b> (chỉ Owner). Chọn <b>Nâng cấp</b> để đổi gói hoặc <b>Hủy gia hạn</b> để không gia hạn sau kỳ hiện tại.</p>
          </AccordionItem>
          <AccordionItem title="Liên hệ hỗ trợ khi gặp sự cố?">
            <p>Email hỗ trợ: <a href="mailto:support@msas.vn" style={{ color: 'var(--primary-500)' }}>support@msas.vn</a><br />
            Thời gian: Thứ 2 – Thứ 6, 8:00–17:00 (GMT+7)</p>
          </AccordionItem>
        </div>
      </div>
    </div>
  )
}

// ── Điều khoản & Chính sách ─────────────────────────────────────────────────
function PolicySection() {
  return (
    <div className="space-y-4">
      {/* Điều khoản dịch vụ */}
      <div className="lcard p-5">
        <h2 className="text-subtitle font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Điều khoản dịch vụ</h2>
        <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p>Bằng cách sử dụng MSAS, bạn đồng ý với các điều khoản sau:</p>
          <p><b>1. Phạm vi dịch vụ:</b> MSAS cung cấp nền tảng phân tích dữ liệu bán hàng đa kênh, bao gồm thu thập dữ liệu, phân tích BI, dự báo AI và xuất báo cáo. Dịch vụ được cung cấp theo mô hình SaaS.</p>
          <p><b>2. Tài khoản và bảo mật:</b> Người dùng chịu trách nhiệm bảo mật thông tin đăng nhập. Không chia sẻ tài khoản với người khác. Thông báo ngay cho chúng tôi nếu phát hiện truy cập trái phép.</p>
          <p><b>3. Sử dụng hợp lệ:</b> Không được dùng MSAS cho mục đích bất hợp pháp, thu thập dữ liệu vượt quá phạm vi được cấp quyền, hoặc cố ý làm hại hệ thống.</p>
          <p><b>4. Sở hữu dữ liệu:</b> Dữ liệu kinh doanh bạn nhập vào hệ thống thuộc sở hữu của bạn. MSAS chỉ xử lý dữ liệu đó để cung cấp dịch vụ theo thỏa thuận.</p>
          <p><b>5. Thay đổi điều khoản:</b> Chúng tôi có thể cập nhật điều khoản và thông báo qua email trước 30 ngày. Tiếp tục sử dụng sau thời điểm đó đồng nghĩa với việc chấp nhận điều khoản mới.</p>
          <p><b>6. Chấm dứt dịch vụ:</b> Chúng tôi có quyền tạm ngừng tài khoản vi phạm điều khoản mà không cần thông báo trước. Dữ liệu của bạn sẽ được lưu 30 ngày sau khi chấm dứt để bạn có thể xuất ra.</p>
        </div>
      </div>

      {/* Chính sách bảo mật */}
      <div className="lcard p-5">
        <h2 className="text-subtitle font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Chính sách bảo mật dữ liệu</h2>
        <div className="text-sm leading-relaxed space-y-3" style={{ color: 'var(--text-secondary)' }}>
          <p><b>Dữ liệu chúng tôi thu thập:</b> Thông tin tài khoản (họ tên, email), dữ liệu kinh doanh bạn đồng bộ vào hệ thống, log hoạt động (để bảo mật và hỗ trợ kỹ thuật).</p>
          <p><b>Lưu trữ:</b> Dữ liệu lưu trên máy chủ đặt tại Việt Nam. Dữ liệu nghỉ ngơi (at rest) được mã hóa AES-256. Dữ liệu truyền tải (in transit) dùng TLS 1.3.</p>
          <p><b>Quyền truy cập:</b> Chỉ nhân viên kỹ thuật được cấp quyền mới truy cập dữ liệu, khi cần thiết để hỗ trợ hoặc xử lý sự cố. Mọi truy cập đều được ghi log.</p>
          <p><b>Không bán dữ liệu:</b> Chúng tôi cam kết không bán, cho thuê hoặc chia sẻ dữ liệu cá nhân và kinh doanh của bạn với bất kỳ bên thứ ba nào vì mục đích thương mại.</p>
          <p><b>Quyền của bạn:</b> Bạn có quyền yêu cầu xuất toàn bộ dữ liệu, chỉnh sửa thông tin cá nhân, hoặc xóa tài khoản (dữ liệu sẽ bị xóa vĩnh viễn sau 30 ngày).</p>
          <p><b>Tuân thủ pháp luật:</b> Chúng tôi tuân thủ Luật An ninh mạng 2018, Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và các quy định hiện hành của pháp luật Việt Nam.</p>
        </div>
      </div>

      {/* Chính sách hoàn tiền */}
      <div className="lcard p-5">
        <h2 className="text-subtitle font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Chính sách hoàn tiền</h2>
        <div className="space-y-3">
          {[
            { plan: 'Gói Miễn phí (Free)', icon: 'card_membership', color: '#6B7280',
              content: 'Gói miễn phí không áp dụng chính sách hoàn tiền vì không thu phí.' },
            { plan: 'Gói Pro', icon: 'workspace_premium', color: 'var(--primary-500)',
              content: 'Hỗ trợ hoàn tiền trong vòng 7 ngày kể từ ngày thanh toán nếu lỗi phát sinh từ hệ thống MSAS (dịch vụ ngừng hoạt động trên 24h liên tục, dữ liệu bị mất do lỗi máy chủ...). Không hoàn tiền trong trường hợp người dùng không sử dụng hoặc chủ động hủy gói.' },
            { plan: 'Gói Enterprise', icon: 'business', color: 'var(--accent-500)',
              content: 'Áp dụng theo thỏa thuận hợp đồng riêng giữa hai bên. Liên hệ email support@msas.vn để biết chi tiết.' },
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
          Để yêu cầu hoàn tiền, gửi email đến <a href="mailto:billing@msas.vn" style={{ color: 'var(--primary-500)' }}>billing@msas.vn</a> với tiêu đề "YÊU CẦU HOÀN TIỀN – [Tên công ty]" và mô tả sự cố.
        </p>
      </div>
    </div>
  )
}
