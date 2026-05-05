import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import { Link } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import axios from '../../api/axios'

// ── Avatar component ──────────────────────────────────────────────────────────
function AvatarSection({ user, avatarUrl, onAvatarChange }) {
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
      const res = await axios.post('/api/users/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onAvatarChange?.(res.data.avatarUrl)
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
  const { user, logout } = useAuth()
  const { isDark, toggle } = useTheme()

  const NAV = [
    { key: 'profile',       icon: 'person',        label: t('settings.account') },
    { key: 'security',      icon: 'lock',           label: t('settings.security') },
    { key: 'notifications', icon: 'notifications',  label: t('settings.notifications') },
    { key: 'appearance',    icon: 'palette',        label: t('settings.appearance') },
  ]

  const [section,    setSection]    = useState('profile')
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
    emailNotify:   true,
    anomalyAlert:  true,
    dailyReport:   false,
    weeklyReport:  true,
  })

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

      <div className="flex flex-col md:flex-row gap-5">
        {/* Left nav */}
        <div className="w-full md:w-52 shrink-0">
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
              <NotifToggle label="Nhận thông báo qua email"
                desc="Gửi email cho các cập nhật quan trọng"
                value={notif.emailNotify} onChange={v => setNotif(n => ({ ...n, emailNotify: v }))} />
              <NotifToggle label="Cảnh báo bất thường (Anomaly)"
                desc="Thông báo khi AI phát hiện dữ liệu bất thường"
                value={notif.anomalyAlert} onChange={v => setNotif(n => ({ ...n, anomalyAlert: v }))} />
              <NotifToggle label="Báo cáo hàng ngày"
                desc="Nhận tóm tắt doanh thu mỗi ngày lúc 8:00"
                value={notif.dailyReport} onChange={v => setNotif(n => ({ ...n, dailyReport: v }))} />
              <NotifToggle label="Báo cáo hàng tuần"
                desc="Nhận báo cáo tổng hợp mỗi thứ Hai"
                value={notif.weeklyReport} onChange={v => setNotif(n => ({ ...n, weeklyReport: v }))} />
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
        </div>
      </div>
    </div>
  )
}
